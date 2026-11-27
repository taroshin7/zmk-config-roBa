import { useCallback, useEffect, useRef, useState } from "react";
import { AxisSnapMode, type Backend, type InputProcessorInfo } from "./backend";

const CURSOR_PRESETS = [
  { label: "ゆっくり", s: 0.6, bars: 1 },
  { label: "ふつう", s: 1.0, bars: 2 },
  { label: "はやい", s: 1.5, bars: 3 },
  { label: "とても速い", s: 2.2, bars: 4 },
];
const SCROLL_PRESETS = [
  { label: "ゆっくり", s: 0.6, bars: 1 },
  { label: "ふつう", s: 1.0, bars: 2 },
  { label: "はやい", s: 1.6, bars: 3 },
  { label: "とても速い", s: 2.7, bars: 4 },
];
const SCROLL_BASE = 16; // 「ふつう」= 16カウントで1ノッチ（従来のroBaと同じ）

const cursorSpeed = (p: InputProcessorInfo) => p.scaleMultiplier / Math.max(1, p.scaleDivisor);
const scrollSpeed = (p: InputProcessorInfo) => (SCROLL_BASE * p.scaleMultiplier) / Math.max(1, p.scaleDivisor);

export function TrackballTab({ backend }: { backend: Backend }) {
  const [procs, setProcs] = useState<InputProcessorInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [layerNames, setLayerNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setErr(null);
      setProcs(await backend.listProcessors());
      setLayerNames(await backend.getLayerNames().catch(() => []));
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }, [backend]);

  useEffect(() => {
    load();
    return backend.onProcessorChanged((p) =>
      setProcs((prev) => (prev ? prev.map((x) => (x.id === p.id ? p : x)) : prev)),
    );
  }, [backend, load]);

  const send = useCallback(
    async (req: Parameters<Backend["setProcessor"]>[1], id: number, patch: Partial<InputProcessorInfo>) => {
      setProcs((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? prev);
      setSaving(true);
      const e = await backend.setProcessor(id, req);
      setSaving(false);
      setNote(e ?? "保存しました");
    },
    [backend],
  );

  if (!backend.hasTrackball())
    return (
      <div className="card">
        <h3>トラックボール設定に対応していないファームウェアです</h3>
        <p>
          このキーボードのファームウェアには、トラックボール設定用の仕組み（cormoran_rip）が入っていません。
          トラックボール設定に対応した roBa のファームウェア（studio-app ブランチでビルドしたもの）を右側に書き込んでください。
        </p>
      </div>
    );
  if (err) return <div className="card error">トラックボール設定を読み込めませんでした：{err}</div>;
  if (!procs) return <div className="card loading">トラックボール設定を読み込み中…</div>;

  const mouse = procs.find((p) => p.name === "cursor" || p.name === "mouse") ?? procs[0];
  const scroll = procs.find((p) => p.name === "scroll");

  return (
    <div className="trackball">
      <div className="tb-status">
        {saving ? <span className="pill">保存中…</span> : note ? <span className="pill ok">{note}</span> : <span className="pill">変更はすぐキーボードに保存されます</span>}
      </div>
      <div className="tb-grid">
        {mouse && <CursorCard p={mouse} send={send} backend={backend} />}
        {mouse && <AutoMouseCard p={mouse} send={send} layerNames={layerNames} />}
        {scroll && <ScrollCard p={scroll} send={send} backend={backend} />}
        <HelpCard />
      </div>
    </div>
  );
}

type Send = (req: Parameters<Backend["setProcessor"]>[1], id: number, patch: Partial<InputProcessorInfo>) => Promise<void>;

function Bars({ n }: { n: number }) {
  return (
    <span className="bars">
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

// スライダーは指を離して少し待ってから送る
function useDebounced<T>(value: T, commit: (v: T) => void, ms = 350) {
  const [v, setV] = useState(value);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => setV(value), [value]);
  const set = (nv: T) => {
    setV(nv);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => commit(nv), ms);
  };
  return [v, set] as const;
}

function CursorCard({ p, send, backend }: { p: InputProcessorInfo; send: Send; backend: Backend }) {
  const speed = cursorSpeed(p);
  const setSpeed = (s: number) => {
    const d = 20;
    const m = Math.max(1, Math.round(s * d));
    send({ setScaleMultiplier: { id: p.id, value: m } }, p.id, { scaleMultiplier: m }).then(() =>
      send({ setScaleDivisor: { id: p.id, value: d } }, p.id, { scaleDivisor: d }),
    );
  };
  const [sv, setSv] = useDebounced(speed, setSpeed);
  const [rot, setRot] = useDebounced(p.rotationDegrees, (v) =>
    send({ setRotation: { id: p.id, value: v } }, p.id, { rotationDegrees: v }),
  );

  return (
    <section className="card tb-card">
      <div className="tb-head">
        <h3>カーソル</h3>
        <span className="val">× {sv.toFixed(2)}</span>
      </div>
      <div className="presets">
        {CURSOR_PRESETS.map((x) => (
          <button key={x.label} className={Math.abs(x.s - speed) < 0.03 ? "on" : ""} onClick={() => setSpeed(x.s)}>
            <Bars n={x.bars} />
            {x.label}
          </button>
        ))}
      </div>
      <div className="row">
        <label>細かく調整</label>
        <input type="range" min={0.25} max={3} step={0.05} value={sv} onChange={(e) => setSv(Number(e.target.value))} />
      </div>
      <div className="row">
        <label>向き（回転）</label>
        <input type="range" min={-45} max={45} step={1} value={rot} onChange={(e) => setRot(Number(e.target.value))} />
        <span className="val small">{rot}°</span>
      </div>
      <div className="row checks">
        <label className="check">
          <input type="checkbox" checked={p.xInvert} onChange={(e) => send({ setXInvert: { id: p.id, invert: e.target.checked } }, p.id, { xInvert: e.target.checked })} />
          左右を反転
        </label>
        <label className="check">
          <input type="checkbox" checked={p.yInvert} onChange={(e) => send({ setYInvert: { id: p.id, invert: e.target.checked } }, p.id, { yInvert: e.target.checked })} />
          上下を反転
        </label>
      </div>
      <p className="note">回転は、玉を真っすぐ転がしてもカーソルが斜めに進むときに使います。</p>
      <ResetButton backend={backend} id={p.id} label="カーソルの設定を初期値に戻す" />
    </section>
  );
}

function AutoMouseCard({ p, send, layerNames }: { p: InputProcessorInfo; send: Send; layerNames: string[] }) {
  const [deact, setDeact] = useDebounced(p.tempLayerDeactivationDelayMs, (v) =>
    send({ setTempLayerDeactivationDelay: { id: p.id, deactivationDelayMs: v } }, p.id, { tempLayerDeactivationDelayMs: v }),
  );
  const [act, setAct] = useDebounced(p.tempLayerActivationDelayMs, (v) =>
    send({ setTempLayerActivationDelay: { id: p.id, activationDelayMs: v } }, p.id, { tempLayerActivationDelayMs: v }),
  );
  return (
    <section className="card tb-card">
      <div className="tb-head">
        <h3>オートマウス</h3>
        <span className="val">{p.tempLayerEnabled ? (layerNames[p.tempLayerLayer] ?? `レイヤー${p.tempLayerLayer}`) : "オフ"}</span>
      </div>
      <label className="check big">
        <input
          type="checkbox"
          checked={p.tempLayerEnabled}
          onChange={(e) => send({ setTempLayerEnabled: { id: p.id, enabled: e.target.checked } }, p.id, { tempLayerEnabled: e.target.checked })}
        />
        玉を動かすとマウスレイヤーに入る（クリックは J / K / L）
      </label>
      <div className="row">
        <label>入るレイヤー</label>
        <select
          value={p.tempLayerLayer}
          onChange={(e) => send({ setTempLayerLayer: { id: p.id, layer: Number(e.target.value) } }, p.id, { tempLayerLayer: Number(e.target.value) })}
        >
          {(layerNames.length ? layerNames : Array.from({ length: 8 }, (_, i) => `レイヤー${i}`)).map((n, i) => (
            <option key={i} value={i}>
              {i}: {n}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>止めてから戻るまで</label>
        <input type="range" min={100} max={2000} step={50} value={deact} onChange={(e) => setDeact(Number(e.target.value))} />
        <span className="val small">{deact} ms</span>
      </div>
      <div className="row">
        <label>打鍵直後は入らない</label>
        <input type="range" min={0} max={1000} step={25} value={act} onChange={(e) => setAct(Number(e.target.value))} />
        <span className="val small">{act} ms</span>
      </div>
      <p className="note">
        文字を打った直後に玉に触れても、この時間内ならマウスレイヤーに入りません。マウスレイヤーで文字のキーを押すと、すぐ元に戻ります。
      </p>
    </section>
  );
}

function ScrollCard({ p, send, backend }: { p: InputProcessorInfo; send: Send; backend: Backend }) {
  const speed = scrollSpeed(p);
  const setSpeed = (s: number) => {
    const d = Math.max(1, Math.round(SCROLL_BASE / s));
    send({ setScaleMultiplier: { id: p.id, value: 1 } }, p.id, { scaleMultiplier: 1 }).then(() =>
      send({ setScaleDivisor: { id: p.id, value: d } }, p.id, { scaleDivisor: d }),
    );
  };
  const [sv, setSv] = useDebounced(speed, setSpeed);
  const snapY = p.axisSnapMode === AxisSnapMode.AXIS_SNAP_MODE_Y;
  return (
    <section className="card tb-card">
      <div className="tb-head">
        <h3>スクロール</h3>
        <span className="val">× {sv.toFixed(2)}</span>
      </div>
      <div className="presets">
        {SCROLL_PRESETS.map((x) => (
          <button key={x.label} className={Math.abs(x.s - speed) < 0.08 ? "on" : ""} onClick={() => setSpeed(x.s)}>
            <Bars n={x.bars} />
            {x.label}
          </button>
        ))}
      </div>
      <div className="row">
        <label>細かく調整</label>
        <input type="range" min={0.3} max={4} step={0.1} value={sv} onChange={(e) => setSv(Number(e.target.value))} />
      </div>
      <div className="row">
        <label>縦の向き</label>
        <div className="seg">
          <button className={p.yInvert ? "on" : ""} onClick={() => send({ setYInvert: { id: p.id, invert: true } }, p.id, { yInvert: true })}>
            標準
          </button>
          <button className={!p.yInvert ? "on" : ""} onClick={() => send({ setYInvert: { id: p.id, invert: false } }, p.id, { yInvert: false })}>
            逆向き
          </button>
        </div>
      </div>
      <div className="row">
        <label>横の向き</label>
        <div className="seg">
          <button className={!p.xInvert ? "on" : ""} onClick={() => send({ setXInvert: { id: p.id, invert: false } }, p.id, { xInvert: false })}>
            標準
          </button>
          <button className={p.xInvert ? "on" : ""} onClick={() => send({ setXInvert: { id: p.id, invert: true } }, p.id, { xInvert: true })}>
            逆向き
          </button>
        </div>
      </div>
      <div className="row">
        <label>縦にまっすぐ</label>
        <div className="seg">
          <button
            className={!snapY ? "on" : ""}
            onClick={() => send({ setAxisSnapMode: { id: p.id, mode: AxisSnapMode.AXIS_SNAP_MODE_NONE } }, p.id, { axisSnapMode: AxisSnapMode.AXIS_SNAP_MODE_NONE })}
          >
            自由
          </button>
          <button
            className={snapY ? "on" : ""}
            onClick={() => send({ setAxisSnapMode: { id: p.id, mode: AxisSnapMode.AXIS_SNAP_MODE_Y } }, p.id, { axisSnapMode: AxisSnapMode.AXIS_SNAP_MODE_Y })}
          >
            縦を優先
          </button>
        </div>
      </div>
      <p className="note">スクロールは、I キーを長押ししている間（SCROLL レイヤー）に玉を転がすと働きます。「標準」は今までの roBa と同じ向きです。</p>
      <ResetButton backend={backend} id={p.id} label="スクロールの設定を初期値に戻す" />
    </section>
  );
}

function ResetButton({ backend, id, label }: { backend: Backend; id: number; label: string }) {
  const [ask, setAsk] = useState(false);
  return ask ? (
    <div className="reset-ask">
      本当に戻しますか？
      <button className="btn danger" onClick={() => backend.resetProcessor(id).then(() => setAsk(false))}>
        戻す
      </button>
      <button className="btn ghost" onClick={() => setAsk(false)}>
        やめる
      </button>
    </div>
  ) : (
    <button className="btn link" onClick={() => setAsk(true)}>
      {label}
    </button>
  );
}

function HelpCard() {
  return (
    <section className="card tb-card help">
      <h3>使い方</h3>
      <ul>
        <li>ボタンやスライダーを動かすと、すぐにトラックボールに反映され、キーボード本体に保存されます。</li>
        <li>オートマウスの対象レイヤーやスクロールのレイヤー（I キー長押し）は、キーマップ画面で確認できます。</li>
        <li>動きがおかしくなったら、各カードの「初期値に戻す」で元の設定に戻せます。</li>
      </ul>
    </section>
  );
}
