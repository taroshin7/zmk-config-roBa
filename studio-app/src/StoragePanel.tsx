import { useMemo, useRef, useState } from "react";
import type { KeymapData } from "./backend";
import { keyFace, layerName } from "./bindingLabel";
import {
  PRESETS,
  exportJson,
  importJson,
  loadItems,
  newId,
  presetLayer,
  resolveBinding,
  saveItems,
  snapshotLayer,
  type Preset,
  type StoredItem,
  type StoredLayer,
} from "./storage";

export interface ApplyTarget {
  index: number; // 書き込み先のレイヤー番号（並び順）
  layer: StoredLayer;
}

export function StoragePanel({
  data,
  layerIdx,
  busy,
  progress,
  onApply,
}: {
  data: KeymapData;
  layerIdx: number;
  busy: boolean;
  progress: string | null;
  onApply: (targets: ApplyTarget[], label: string) => Promise<boolean>;
}) {
  const [items, setItems] = useState<StoredItem[]>(() => loadItems());
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const curLayer = data.layers[layerIdx];
  const curName = layerName(data.layers, curLayer.id);

  const persist = (next: StoredItem[]) => {
    setItems(next);
    const e = saveItems(next);
    if (e) setNote(e);
  };

  const snapshotAll = () =>
    data.layers.map((l) => snapshotLayer(l, data.behaviors, layerName(data.layers, l.id)));

  // 適用する前に、今の状態を「元に戻す」用に1つだけ残す
  const withBackup = async (targets: ApplyTarget[], label: string) => {
    const backup: StoredItem = {
      id: newId(),
      name: `「${label}」を適用する前`,
      kind: targets.length > 1 ? "keymap" : "layer",
      createdAt: Date.now(),
      auto: true,
      layers: targets.map((t) => snapshotLayer(data.layers[t.index], data.behaviors, layerName(data.layers, data.layers[t.index].id))),
      targets: targets.map((t) => t.index),
    };
    const ok = await onApply(targets, label);
    if (ok) persist([backup, ...items.filter((x) => !x.auto)]);
  };

  const apply = (item: StoredItem) => {
    if (item.auto && item.targets) {
      const targets = item.targets
        .map((index, i) => ({ index, layer: item.layers[i] }))
        .filter((t) => t.layer && data.layers[t.index]);
      return withBackup(targets, item.name.replace(/^「(.*)」を適用する前$/, "$1") + " の取り消し");
    }
    if (item.kind === "keymap") {
      // レイヤーの並びが変わっても合うように、名前が同じレイヤーへ書き込む（名前がなければ同じ番号へ）
      const names = data.layers.map((l) => layerName(data.layers, l.id));
      const targets = item.layers
        .map((layer, i) => {
          const byName = layer.name ? names.indexOf(layer.name) : -1;
          return { index: byName >= 0 ? byName : layer.name && names.length ? -1 : i, layer };
        })
        .filter((t) => t.index >= 0 && data.layers[t.index]);
      return withBackup(targets, item.name);
    }
    return withBackup([{ index: layerIdx, layer: item.layers[0] }], item.name);
  };

  const applyPreset = (p: Preset) => withBackup([{ index: layerIdx, layer: presetLayer(p, curLayer, data) }], p.name);

  const saveLayer = () =>
    persist([
      ...items,
      {
        id: newId(),
        name: `${curName} のキーマップ`,
        kind: "layer",
        createdAt: Date.now(),
        layers: [snapshotLayer(curLayer, data.behaviors, curName)],
      },
    ]);
  const saveAll = () =>
    persist([
      ...items,
      { id: newId(), name: "キーマップ全体", kind: "keymap", createdAt: Date.now(), layers: snapshotAll() },
    ]);

  const overwrite = (item: StoredItem) =>
    persist(
      items.map((x) =>
        x.id !== item.id
          ? x
          : {
              ...x,
              createdAt: Date.now(),
              layers: x.kind === "keymap" ? snapshotAll() : [snapshotLayer(curLayer, data.behaviors, curName)],
            },
      ),
    );
  const rename = (item: StoredItem, name: string) =>
    persist(items.map((x) => (x.id === item.id ? { ...x, name: name || x.name } : x)));
  const remove = (item: StoredItem) => persist(items.filter((x) => x.id !== item.id));

  const auto = items.find((x) => x.auto);
  const saved = items.filter((x) => !x.auto);

  return (
    <section className="card storage">
      <div className="st-head">
        <div>
          <h3>保存したキーマップ</h3>
          <div className="muted">
            「適用」を押すと、そのキーマップに切り替えてキーボードに保存します。保存先はこのブラウザです。
          </div>
        </div>
        <div className="st-actions">
          <button className="btn ghost" onClick={() => exportJson(saved)} disabled={!saved.length}>
            書き出し
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            読み込み
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const add = await importJson(f);
                persist([...items, ...add]);
                setNote(`${add.length}件を読み込みました`);
              } catch (err) {
                setNote(String((err as Error).message ?? err));
              }
            }}
          />
        </div>
      </div>
      {(progress || note) && <div className="st-note">{progress ?? note}</div>}

      <div className="st-grid">
        {auto && (
          <ItemCard
            item={auto}
            data={data}
            busy={busy}
            applyLabel="元に戻す"
            onApply={() => apply(auto)}
            onRemove={() => remove(auto)}
          />
        )}
        {saved.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            data={data}
            busy={busy}
            applyLabel={it.kind === "keymap" ? "全体に適用" : `「${curName}」に適用`}
            onApply={() => apply(it)}
            onOverwrite={() => overwrite(it)}
            onRename={(n) => rename(it, n)}
            onRemove={() => remove(it)}
          />
        ))}
        <div className="st-add">
          <button onClick={saveLayer}>＋「{curName}」を保存</button>
          <button onClick={saveAll}>＋キーマップ全体（{data.layers.length}レイヤー）を保存</button>
        </div>
      </div>

      <h4 className="st-sub">配列プリセット</h4>
      <div className="muted">今のレイヤー（{curName}）の文字キーだけを入れ替えます。Shift などの長押しはそのまま残ります。</div>
      <div className="presets-row">
        {PRESETS.map((p) => (
          <button key={p.name} className="preset" disabled={busy} onClick={() => applyPreset(p)} title={`「${curName}」に${p.name}を当てはめる`}>
            <div className="pgrid">
              {p.rows.map((r, i) => (
                <div key={i}>
                  <span>{r.slice(0, 5).split("").join(" ")}</span>
                  <span>{r.slice(5).split("").join(" ")}</span>
                </div>
              ))}
            </div>
            <b>{p.name}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  data,
  busy,
  applyLabel,
  onApply,
  onOverwrite,
  onRename,
  onRemove,
}: {
  item: StoredItem;
  data: KeymapData;
  busy: boolean;
  applyLabel: string;
  onApply: () => void;
  onOverwrite?: () => void;
  onRename?: (n: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | "remove" | "overwrite">(null);
  const date = new Date(item.createdAt);
  const meta =
    item.kind === "keymap"
      ? `全${item.layers.length}レイヤー`
      : `レイヤー（保存元：${item.layers[0]?.name || "-"}）`;
  return (
    <div className={`st-card${item.auto ? " auto" : ""}`}>
      <MiniBoard layer={item.layers[0]} data={data} />
      <div className="st-name">
        {editing && onRename ? (
          <input
            autoFocus
            defaultValue={item.name}
            onBlur={(e) => {
              onRename(e.target.value.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span onClick={() => onRename && setEditing(true)} title={onRename ? "クリックで名前を変える" : ""}>
            {item.auto ? "↩ " : ""}
            {item.name}
          </span>
        )}
      </div>
      <div className="muted small">
        {meta}・{date.getMonth() + 1}/{date.getDate()} {date.getHours()}:{String(date.getMinutes()).padStart(2, "0")}
      </div>
      {confirm ? (
        <div className="st-confirm">
          {confirm === "remove" ? "削除しますか？" : "今の状態で上書きしますか？"}
          <button
            className="btn danger small"
            onClick={() => {
              if (confirm === "remove") onRemove();
              else onOverwrite?.();
              setConfirm(null);
            }}
          >
            はい
          </button>
          <button className="btn ghost small" onClick={() => setConfirm(null)}>
            やめる
          </button>
        </div>
      ) : (
        <div className="st-btns">
          <button className="btn dark small" disabled={busy} onClick={onApply}>
            {applyLabel}
          </button>
          {onOverwrite && (
            <button className="btn ghost small" disabled={busy} onClick={() => setConfirm("overwrite")}>
              上書き
            </button>
          )}
          <button className="btn ghost small x" onClick={() => setConfirm("remove")} title="削除">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

const MU = 17;

function MiniBoard({ layer, data }: { layer: StoredLayer | undefined; data: KeymapData }) {
  const box = useMemo(() => {
    let w = 0,
      h = 0;
    for (const k of data.keys) {
      w = Math.max(w, k.x + k.width);
      h = Math.max(h, k.y + k.height);
    }
    return { w: (w / 100) * MU, h: (h / 100) * MU + 8 };
  }, [data.keys]);
  if (!layer) return <div className="mini" style={{ height: box.h }} />;
  return (
    <div className="mini" style={{ width: box.w, height: box.h }}>
      {data.keys.map((k, i) => {
        const sb = layer.bindings[i];
        const b = sb ? resolveBinding(sb, data.behaviors) : null;
        const face = b ? keyFace(b, data.behaviors, data.layers) : { main: sb ? "?" : "", kind: "none" as const };
        return (
          <span
            key={i}
            className={`mk k-${face.kind}`}
            style={{
              left: (k.x / 100) * MU,
              top: (k.y / 100) * MU,
              width: MU - 2,
              height: MU - 2,
              transformOrigin: `${((k.rx - k.x) / 100) * MU}px ${((k.ry - k.y) / 100) * MU}px`,
              transform: k.r ? `rotate(${k.r / 100}deg)` : undefined,
            }}
          >
            {face.kind === "trans" ? "" : face.main.length <= 2 ? face.main : ""}
          </span>
        );
      })}
    </div>
  );
}
