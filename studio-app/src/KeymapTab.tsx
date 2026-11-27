import { useCallback, useEffect, useMemo, useState } from "react";
import type { Backend, BehaviorInfo, Binding, KeymapData, ParamDesc } from "./backend";
import { behaviorJa, keyFace, layerName } from "./bindingLabel";
import { KeyPicker } from "./KeyPicker";
import { StoragePanel, type ApplyTarget } from "./StoragePanel";
import { resolveBinding, sameBinding } from "./storage";

const U = 64; // 1キーあたりのピクセル

export function KeymapTab({ backend }: { backend: Backend }) {
  const [data, setData] = useState<KeymapData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [layerIdx, setLayerIdx] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setErr(null);
      const d = await backend.loadKeymap();
      setData(d);
      setUnsaved(await backend.hasUnsaved());
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }, [backend]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (err) return <div className="card error">キーマップを読み込めませんでした：{err}</div>;
  if (!data) return <div className="card loading">キーマップを読み込み中…</div>;

  const layer = data.layers[layerIdx] ?? data.layers[0];
  const binding = sel !== null ? layer.bindings[sel] : undefined;

  const apply = async (b: Binding) => {
    if (sel === null) return;
    setBusy(true);
    const e = await backend.setBinding(layer.id, sel, b);
    if (e) setMsg(e);
    const d = await backend.loadKeymap();
    setData(d);
    setUnsaved(await backend.hasUnsaved());
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    const e = await backend.save();
    setMsg(e ?? "キーボードに保存しました");
    setUnsaved(await backend.hasUnsaved());
    setBusy(false);
  };
  const discard = async () => {
    setBusy(true);
    await backend.discard();
    await reload();
    setMsg("保存していない変更を取り消しました");
    setBusy(false);
  };

  // 保存したキーマップを適用：変わるキーだけ書き込み、最後にキーボードに保存する
  const applyStored = async (targets: ApplyTarget[], label: string) => {
    setBusy(true);
    setSel(null);
    let changed = 0;
    let skipped = 0;
    let failed = 0;
    const todo: { layerId: number; pos: number; b: NonNullable<ReturnType<typeof resolveBinding>> }[] = [];
    for (const t of targets) {
      const l = data.layers[t.index];
      if (!l) continue;
      const n = Math.min(l.bindings.length, t.layer.bindings.length);
      for (let pos = 0; pos < n; pos++) {
        const b = resolveBinding(t.layer.bindings[pos], data.behaviors);
        if (!b) {
          skipped++;
          continue;
        }
        if (!sameBinding(l.bindings[pos], b)) todo.push({ layerId: l.id, pos, b });
      }
    }
    try {
      for (let i = 0; i < todo.length; i++) {
        setProgress(`「${label}」を適用中… ${i + 1} / ${todo.length}`);
        const e = await backend.setBinding(todo[i].layerId, todo[i].pos, todo[i].b);
        if (e) failed++;
        else changed++;
      }
      let saveErr: string | null = null;
      if (changed > 0) {
        setProgress("キーボードに保存中…");
        saveErr = await backend.save();
      }
      await reload();
      const parts = [
        changed ? `${changed}個のキーを変更してキーボードに保存しました` : "変わるキーはありませんでした",
        failed ? `${failed}個は書き込めませんでした` : "",
        skipped ? `${skipped}個はこのファームウェアにない動作なので飛ばしました` : "",
        saveErr ?? "",
      ].filter(Boolean);
      setMsg(`「${label}」：${parts.join("。")}`);
      return changed > 0 || todo.length === 0;
    } catch (e) {
      setMsg(`適用の途中で失敗しました：${(e as Error).message ?? e}`);
      await reload();
      return false;
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  return (
    <div className="keymap">
      <div className="toolbar card">
        <div className="layer-pills">
          {data.layers.map((l, i) => (
            <button
              key={l.id}
              className={i === layerIdx ? "on" : ""}
              onClick={() => {
                setLayerIdx(i);
                setSel(null);
              }}
            >
              <span className="num">{i}</span>
              {layerName(data.layers, l.id)}
            </button>
          ))}
        </div>
        <div className="save-area">
          {unsaved ? <span className="pill warn">未保存の変更があります</span> : <span className="pill">保存済み</span>}
          <button className="btn ghost" disabled={!unsaved || busy} onClick={discard}>
            変更を取り消す
          </button>
          <button className="btn dark" disabled={!unsaved || busy} onClick={save}>
            キーボードに保存
          </button>
        </div>
      </div>
      {msg && (
        <div className="toast" onAnimationEnd={() => setMsg(null)}>
          {msg}
        </div>
      )}

      {layer.name === "PHONE" && (
        <div className="phone-note">
          📱 このレイヤーは、スマホ（Bluetoothプロファイル2）につながっている間だけ自動で使われます。PCのときは Base が使われます。
        </div>
      )}
      <div className="card board-card">
        <Board data={data} layerIdx={layerIdx} sel={sel} onSelect={setSel} />
        <Legend />
      </div>

      {sel !== null && binding && (
        <BindingEditor
          key={`${layer.id}-${sel}`}
          pos={sel}
          binding={binding}
          data={data}
          busy={busy}
          onChange={apply}
          onClose={() => setSel(null)}
        />
      )}
      {sel === null && <div className="hint">キーをクリックすると、割り当てを変えられます。</div>}

      <StoragePanel data={data} layerIdx={layerIdx} busy={busy} progress={progress} onApply={applyStored} />
    </div>
  );
}

function Board({
  data,
  layerIdx,
  sel,
  onSelect,
}: {
  data: KeymapData;
  layerIdx: number;
  sel: number | null;
  onSelect: (i: number) => void;
}) {
  const layer = data.layers[layerIdx];
  const { w, h } = useMemo(() => {
    let w = 0,
      h = 0;
    for (const k of data.keys) {
      w = Math.max(w, k.x + k.width);
      h = Math.max(h, k.y + k.height);
    }
    return { w: (w / 100) * U + 20, h: (h / 100) * U + 40 };
  }, [data.keys]);

  return (
    <div className="board" style={{ width: w, height: h }}>
      {data.keys.map((k, i) => {
        const face = keyFace(layer.bindings[i], data.behaviors, data.layers);
        const left = (k.x / 100) * U;
        const top = (k.y / 100) * U;
        const size = (k.width / 100) * U;
        const ox = ((k.rx - k.x) / 100) * U;
        const oy = ((k.ry - k.y) / 100) * U;
        return (
          <button
            key={i}
            className={`key k-${face.kind}${sel === i ? " sel" : ""}`}
            title={face.title}
            style={{
              left,
              top,
              width: size - 6,
              height: (k.height / 100) * U - 6,
              transformOrigin: `${ox}px ${oy}px`,
              transform: k.r ? `rotate(${k.r / 100}deg)` : undefined,
            }}
            onClick={() => onSelect(i)}
          >
            {face.mods && <span className="mods">{face.mods}</span>}
            <span className={`main${sizeClass(face.main)}`}>
              {face.main}
            </span>
            {face.hold && (
              <span className="hold">
                {face.kind === "modtap" || face.kind === "layertap" ? (
                  <>
                    hold:{face.hold.length > 4 ? <br /> : " "}
                    {face.hold}
                  </>
                ) : (
                  face.hold
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// 全角は2文字分として幅を見積もり、文字の大きさを決める
function sizeClass(t: string) {
  let w = 0;
  for (const ch of t) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  if (w <= 4) return "";
  if (w <= 7) return " small";
  return " tiny";
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="k-key" />
        キー入力
      </span>
      <span>
        <i className="k-modtap" />
        長押しで修飾キー
      </span>
      <span>
        <i className="k-layertap" />
        長押しでレイヤー
      </span>
      <span>
        <i className="k-layer" />
        レイヤー切替
      </span>
      <span>
        <i className="k-trans" />
        透過（下のレイヤーと同じ）
      </span>
      <span>
        <i className="k-danger" />
        注意が必要なキー
      </span>
    </div>
  );
}

// ---------- 割り当て編集 ----------

function setFor(b: BehaviorInfo, p1: number) {
  return b.metadata.find((s) => s.param1.some((d) => d.constant === p1)) ?? b.metadata[0];
}

function defaultParams(b: BehaviorInfo, old: Binding): { p1: number; p2: number } {
  const s = b.metadata[0];
  // 今のキー（タップ側）を引き継ぐ。なければ A
  const oldKey = old.param2 > 0xffff ? old.param2 : old.param1 > 0xffff ? old.param1 : 0x070004;
  const twoKeys = !!s?.param2.some((d) => d.hidUsage);
  const pick = (descs: ParamDesc[] | undefined, keyDefault: number) => {
    const d = descs?.[0];
    if (!d) return 0;
    if (d.constant !== undefined) return d.constant;
    if (d.range) return d.range.min;
    if (d.layerId) return 1;
    if (d.hidUsage) return keyDefault;
    return 0;
  };
  return { p1: pick(s?.param1, twoKeys ? 0x0700e1 : oldKey), p2: pick(s?.param2, oldKey) };
}

const PARAM_NAME_JA: Record<string, string> = {
  hold: "長押し",
  tap: "タップ",
  key: "キー",
  layer: "レイヤー",
  profile: "プロファイル番号",
};

function paramTitle(d: ParamDesc | undefined, fallback: string) {
  if (!d) return fallback;
  return PARAM_NAME_JA[d.name.toLowerCase()] ?? fallback;
}

function BindingEditor({
  pos,
  binding,
  data,
  busy,
  onChange,
  onClose,
}: {
  pos: number;
  binding: Binding;
  data: KeymapData;
  busy: boolean;
  onChange: (b: Binding) => void;
  onClose: () => void;
}) {
  const behavior = data.behaviors.find((b) => b.id === binding.behaviorId);
  const face = keyFace(binding, data.behaviors, data.layers);
  const sorted = useMemo(() => {
    const order = ["Key Press", "Mod-Tap", "Layer-Tap", "Momentary Layer", "To Layer", "Toggle Layer", "Transparent", "None", "Mouse Key Press", "Bluetooth"];
    return [...data.behaviors].sort((a, b) => {
      const ia = order.indexOf(a.displayName);
      const ib = order.indexOf(b.displayName);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.displayName.localeCompare(b.displayName);
    });
  }, [data.behaviors]);

  if (!behavior) return null;
  const set = setFor(behavior, binding.param1);
  const p1descs = set?.param1 ?? [];
  const p2descs = set?.param2 ?? [];
  const constants1 = behavior.metadata.flatMap((s) => s.param1.filter((d) => d.constant !== undefined));
  const isHoldTap = p2descs.some((d) => d.hidUsage) && p1descs.some((d) => d.hidUsage || d.layerId);

  const change = (p: Partial<Binding>) => onChange({ ...binding, ...p });

  return (
    <div className="card editor">
      <div className="editor-head">
        <div>
          <div className="editor-title">
            「{face.mods ? `${face.mods}+` : ""}
            {face.main || "（空）"}」の割り当て <span className="muted">#{pos}</span>
          </div>
          <div className="muted">{face.title}</div>
        </div>
        <button className="btn ghost" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="field">
        <label>動作</label>
        <select
          value={binding.behaviorId}
          disabled={busy}
          onChange={(e) => {
            const nb = data.behaviors.find((b) => b.id === Number(e.target.value));
            if (!nb) return;
            const { p1, p2 } = defaultParams(nb, binding);
            onChange({ behaviorId: nb.id, param1: p1, param2: p2 });
          }}
        >
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {behaviorJa(b.displayName)}
            </option>
          ))}
        </select>
      </div>

      {constants1.length > 1 && (
        <div className="field">
          <label>種類</label>
          <select
            value={binding.param1}
            disabled={busy}
            onChange={(e) => {
              const v = Number(e.target.value);
              const s = setFor(behavior, v);
              const d2 = s?.param2[0];
              change({ param1: v, param2: d2?.range ? d2.range.min : 0 });
            }}
          >
            {constants1.map((d) => (
              <option key={d.constant} value={d.constant}>
                {constantJa(behavior.displayName, d)}
              </option>
            ))}
          </select>
        </div>
      )}

      {isHoldTap ? (
        <div className="holdtap">
          <ParamInput
            title="タップしたとき"
            descs={p2descs}
            value={binding.param2}
            data={data}
            busy={busy}
            onChange={(v) => change({ param2: v })}
          />
          <ParamInput
            title="長押ししたとき"
            descs={p1descs}
            value={binding.param1}
            data={data}
            busy={busy}
            onChange={(v) => change({ param1: v })}
            modifiersOnly={p1descs.some((d) => d.hidUsage)}
          />
        </div>
      ) : (
        <>
          {constants1.length <= 1 && (
            <ParamInput
              title={paramTitle(p1descs[0], "キー")}
              descs={p1descs}
              value={binding.param1}
              data={data}
              busy={busy}
              onChange={(v) => change({ param1: v })}
            />
          )}
          <ParamInput
            title={paramTitle(p2descs[0], "値")}
            descs={p2descs}
            value={binding.param2}
            data={data}
            busy={busy}
            onChange={(v) => change({ param2: v })}
          />
        </>
      )}
    </div>
  );
}

function constantJa(behavior: string, d: ParamDesc) {
  const map: Record<string, string> = {
    "Select Profile": "プロファイルを選ぶ",
    "Clear Selected Profile": "選択中のペアリングを削除",
    "Clear All Profiles": "すべてのペアリングを削除（注意）",
    "Next Profile": "次のプロファイル",
    "Previous Profile": "前のプロファイル",
    "Disconnect Profile": "切断",
    MB1: "左クリック",
    MB2: "右クリック",
    MB3: "中クリック",
    MB4: "戻る",
    MB5: "進む",
  };
  void behavior;
  return map[d.name] ?? d.name;
}

function ParamInput({
  title,
  descs,
  value,
  data,
  busy,
  onChange,
  modifiersOnly,
}: {
  title: string;
  descs: ParamDesc[];
  value: number;
  data: KeymapData;
  busy: boolean;
  onChange: (v: number) => void;
  modifiersOnly?: boolean;
}) {
  if (!descs || descs.length === 0) return null;
  const d = descs.find((x) => x.hidUsage) ?? descs.find((x) => x.layerId) ?? descs.find((x) => x.range) ?? descs[0];
  if (d.nil) return null;
  if (d.hidUsage)
    return (
      <div className="field wide">
        <label>{title}</label>
        <KeyPicker value={value} onChange={onChange} disabled={busy} preferModifiers={modifiersOnly} />
      </div>
    );
  if (d.layerId)
    return (
      <div className="field">
        <label>{title}</label>
        <select value={value} disabled={busy} onChange={(e) => onChange(Number(e.target.value))}>
          {data.layers.map((l, i) => (
            <option key={l.id} value={l.id}>
              {i}: {layerName(data.layers, l.id)}
            </option>
          ))}
        </select>
      </div>
    );
  if (d.range)
    return (
      <div className="field">
        <label>{title}</label>
        <input
          type="number"
          min={d.range.min}
          max={d.range.max}
          value={value}
          disabled={busy}
          onChange={(e) => onChange(Math.max(d.range!.min, Math.min(d.range!.max, Number(e.target.value))))}
        />
      </div>
    );
  return null;
}
