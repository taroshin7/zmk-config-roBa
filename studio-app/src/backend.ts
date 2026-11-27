// キーボードとの通信（実機）と、つながっていないときのお試し表示（デモ）を同じ形で扱う
import { call_rpc, type RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { ZMKCustomSubsystem } from "@cormoran/zmk-studio-react-hook";
import {
  Request as RipRequest,
  Response as RipResponse,
  Notification as RipNotification,
  type InputProcessorInfo,
  AxisSnapMode,
} from "./proto/cormoran/rip/custom";
import demoKeymap from "./demo-keymap.json";


export type { InputProcessorInfo };
export { AxisSnapMode };

export interface ParamDesc {
  name: string;
  nil?: boolean;
  constant?: number;
  range?: { min: number; max: number };
  hidUsage?: boolean;
  layerId?: boolean;
}
export interface ParamSet {
  param1: ParamDesc[];
  param2: ParamDesc[];
}
export interface BehaviorInfo {
  id: number;
  displayName: string;
  metadata: ParamSet[];
}
export interface Binding {
  behaviorId: number;
  param1: number;
  param2: number;
}
export interface Layer {
  id: number;
  name: string;
  bindings: Binding[];
}
export interface KeyAttrs {
  width: number;
  height: number;
  x: number;
  y: number;
  r: number;
  rx: number;
  ry: number;
}
export interface KeymapData {
  layers: Layer[];
  keys: KeyAttrs[];
  behaviors: BehaviorInfo[];
}

export interface Backend {
  kind: "device" | "demo";
  deviceName: string;
  loadKeymap(): Promise<KeymapData>;
  setBinding(layerId: number, pos: number, b: Binding): Promise<string | null>;
  hasUnsaved(): Promise<boolean>;
  save(): Promise<string | null>;
  discard(): Promise<void>;
  hasTrackball(): boolean;
  getLayerNames(): Promise<string[]>;
  listProcessors(): Promise<InputProcessorInfo[]>;
  setProcessor(id: number, req: Partial<RipRequest>): Promise<string | null>;
  resetProcessor(id: number): Promise<void>;
  onProcessorChanged(cb: (p: InputProcessorInfo) => void): () => void;
}

// ---------------- 実機 ----------------

type NotifySub = (cb: (payload: Uint8Array) => void) => () => void;

export class DeviceBackend implements Backend {
  kind = "device" as const;
  private conn: RpcConnection;
  private rip: ZMKCustomSubsystem | null;
  private subscribeRip: NotifySub | null;
  deviceName: string;

  constructor(
    conn: RpcConnection,
    deviceName: string,
    ripIndex: number | null,
    subscribeRip: NotifySub | null,
  ) {
    this.conn = conn;
    this.deviceName = deviceName;
    this.rip = ripIndex === null ? null : new ZMKCustomSubsystem(conn, ripIndex);
    this.subscribeRip = subscribeRip;
  }

  async loadKeymap(): Promise<KeymapData> {
    const km = await call_rpc(this.conn, { keymap: { getKeymap: true } });
    const keymap = km.keymap?.getKeymap;
    if (!keymap) throw new Error("キーマップを読み込めませんでした");
    const pl = await call_rpc(this.conn, { keymap: { getPhysicalLayouts: true } });
    const layouts = pl.keymap?.getPhysicalLayouts;
    const layout = layouts?.layouts[layouts.activeLayoutIndex] ?? layouts?.layouts[0];
    const list = await call_rpc(this.conn, { behaviors: { listAllBehaviors: true } });
    const ids = list.behaviors?.listAllBehaviors?.behaviors ?? [];
    const behaviors: BehaviorInfo[] = [];
    for (const id of ids) {
      const d = await call_rpc(this.conn, {
        behaviors: { getBehaviorDetails: { behaviorId: id } },
      });
      const det = d.behaviors?.getBehaviorDetails;
      if (!det) continue;
      behaviors.push({
        id: det.id,
        displayName: det.displayName,
        metadata: det.metadata.map((s) => ({
          param1: s.param1.map(toDesc),
          param2: s.param2.map(toDesc),
        })),
      });
    }
    return {
      layers: keymap.layers.map((l) => ({
        id: l.id,
        name: l.name,
        bindings: l.bindings.map((b) => ({
          behaviorId: b.behaviorId,
          param1: b.param1,
          param2: b.param2,
        })),
      })),
      keys: layout?.keys ?? [],
      behaviors,
    };
  }

  async setBinding(layerId: number, pos: number, b: Binding) {
    const r = await call_rpc(this.conn, {
      keymap: { setLayerBinding: { layerId, keyPosition: pos, binding: b } },
    });
    const v = r.keymap?.setLayerBinding;
    // 0 = 成功
    return v === 0 ? null : `割り当てを変更できませんでした（${v ?? "応答なし"}）`;
  }

  async hasUnsaved() {
    const r = await call_rpc(this.conn, { keymap: { checkUnsavedChanges: true } });
    return !!r.keymap?.checkUnsavedChanges;
  }

  async save() {
    const r = await call_rpc(this.conn, { keymap: { saveChanges: true } });
    return r.keymap?.saveChanges?.ok ? null : "保存できませんでした";
  }

  async discard() {
    await call_rpc(this.conn, { keymap: { discardChanges: true } });
  }

  hasTrackball() {
    return this.rip !== null;
  }

  async getLayerNames() {
    const km = await call_rpc(this.conn, { keymap: { getKeymap: true } });
    return (km.keymap?.getKeymap?.layers ?? []).map((l, i) => l.name || (i === 0 ? "Base" : `L${i}`));
  }

  private async ripCall(req: RipRequest): Promise<RipResponse | null> {
    if (!this.rip) return null;
    const payload = await this.rip.callRPC(RipRequest.encode(req).finish());
    return payload ? RipResponse.decode(payload) : null;
  }

  async listProcessors(): Promise<InputProcessorInfo[]> {
    if (!this.rip || !this.subscribeRip) return [];
    const found = new Map<number, InputProcessorInfo>();
    const unsub = this.subscribeRip((payload) => {
      const n = RipNotification.decode(payload);
      const p = n.inputProcessorChanged?.processor;
      if (p) found.set(p.id, p);
    });
    try {
      await this.ripCall(RipRequest.create({ listInputProcessors: {} }));
      // 一覧は通知で1件ずつ届く
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      unsub();
    }
    const list = [...found.values()].sort((a, b) => a.id - b.id);
    // 念のため最新値を個別に取得
    const out: InputProcessorInfo[] = [];
    for (const p of list) {
      const r = await this.ripCall(RipRequest.create({ getInputProcessor: { id: p.id } }));
      out.push(r?.getInputProcessor?.processor ?? p);
    }
    return out;
  }

  async setProcessor(_id: number, req: Partial<RipRequest>) {
    const r = await this.ripCall(RipRequest.create(req));
    if (r?.error) return r.error.message || "設定を変更できませんでした";
    return null;
  }

  async resetProcessor(id: number) {
    await this.ripCall(RipRequest.create({ resetInputProcessor: { id } }));
  }

  onProcessorChanged(cb: (p: InputProcessorInfo) => void) {
    if (!this.subscribeRip) return () => {};
    return this.subscribeRip((payload) => {
      const p = RipNotification.decode(payload).inputProcessorChanged?.processor;
      if (p) cb(p);
    });
  }
}

function toDesc(d: {
  name: string;
  nil?: object;
  constant?: number;
  range?: { min: number; max: number };
  hidUsage?: object;
  layerId?: object;
}): ParamDesc {
  return {
    name: d.name,
    nil: d.nil !== undefined,
    constant: d.constant,
    range: d.range,
    hidUsage: d.hidUsage !== undefined,
    layerId: d.layerId !== undefined,
  };
}

// ---------------- デモ（未接続時のお試し） ----------------

const HID: ParamDesc = { name: "Key", hidUsage: true };
const LAYER: ParamDesc = { name: "Layer", layerId: true };
const DEMO_BEHAVIORS: BehaviorInfo[] = [
  { id: 1, displayName: "Key Press", metadata: [{ param1: [HID], param2: [] }] },
  { id: 2, displayName: "Mod-Tap", metadata: [{ param1: [{ ...HID, name: "Hold" }], param2: [{ ...HID, name: "Tap" }] }] },
  { id: 3, displayName: "Layer-Tap", metadata: [{ param1: [{ ...LAYER, name: "Hold" }], param2: [{ ...HID, name: "Tap" }] }] },
  { id: 4, displayName: "Transparent", metadata: [] },
  { id: 5, displayName: "None", metadata: [] },
  {
    id: 6,
    displayName: "Bluetooth",
    metadata: [
      { param1: [{ name: "Select Profile", constant: 3 }], param2: [{ name: "Profile", range: { min: 0, max: 4 } }] },
      { param1: [{ name: "Clear Selected Profile", constant: 0 }], param2: [] },
      { param1: [{ name: "Next Profile", constant: 1 }], param2: [] },
      { param1: [{ name: "Previous Profile", constant: 2 }], param2: [] },
      { param1: [{ name: "Clear All Profiles", constant: 4 }], param2: [] },
    ],
  },
  {
    id: 7,
    displayName: "Mouse Key Press",
    metadata: [
      {
        param1: [
          { name: "MB1", constant: 1 },
          { name: "MB2", constant: 2 },
          { name: "MB3", constant: 4 },
          { name: "MB4", constant: 8 },
          { name: "MB5", constant: 16 },
        ],
        param2: [],
      },
    ],
  },
  { id: 8, displayName: "Bootloader", metadata: [] },
  { id: 9, displayName: "Momentary Layer", metadata: [{ param1: [LAYER], param2: [] }] },
  { id: 10, displayName: "To Layer", metadata: [{ param1: [LAYER], param2: [] }] },
  { id: 11, displayName: "Toggle Layer", metadata: [{ param1: [LAYER], param2: [] }] },
  { id: 12, displayName: "lt_to_layer_0", metadata: [{ param1: [{ ...LAYER, name: "Hold" }], param2: [{ ...HID, name: "Tap" }] }] },
  { id: 13, displayName: "Reset", metadata: [] },
];

// roBa.dtsi の物理配置と同じ値
const DEMO_KEYS: KeyAttrs[] = (
  [
    [0, 62], [100, 25], [200, 0], [301, 13], [401, 26], [850, 26], [951, 13], [1051, 0], [1151, 25], [1251, 62],
    [0, 162], [100, 125], [200, 100], [301, 113], [401, 127], [501, 150], [750, 150], [850, 127], [951, 114], [1051, 100], [1151, 125], [1251, 162],
    [0, 262], [100, 225], [200, 200], [301, 214], [401, 227], [501, 251], [750, 251], [850, 227], [951, 214], [1051, 201], [1151, 225], [1251, 262],
    [0, 362], [100, 326], [200, 301], [322, 352], [434, 362, 900, 484, 412], [545, 391, 2000, 595, 441],
    [706, 391, -2000, 756, 441], [816, 362, -1000, 866, 412], [1251, 362],
  ] as number[][]
).map(([x, y, r = 0, rx = 0, ry = 0]) => ({ width: 100, height: 100, x, y, r, rx, ry }));


function defaultProcessors(): InputProcessorInfo[] {
  const base = {
    rotationDegrees: 0,
    activeLayers: 0,
    axisSnapMode: AxisSnapMode.AXIS_SNAP_MODE_NONE,
    axisSnapThreshold: 100,
    axisSnapTimeoutMs: 1000,
    xySwapEnabled: false,
    xInvert: false,
  };
  return [
    {
      ...base,
      id: 0,
      name: "cursor",
      scaleMultiplier: 1,
      scaleDivisor: 1,
      tempLayerEnabled: true,
      tempLayerLayer: 5,
      tempLayerActivationDelayMs: 100,
      tempLayerDeactivationDelayMs: 700,
      xyToScrollEnabled: false,
      yInvert: false,
    },
    {
      ...base,
      id: 1,
      name: "scroll",
      scaleMultiplier: 1,
      scaleDivisor: 16,
      tempLayerEnabled: false,
      tempLayerLayer: 0,
      tempLayerActivationDelayMs: 100,
      tempLayerDeactivationDelayMs: 500,
      xyToScrollEnabled: true,
      yInvert: true,
    },
  ];
}

export class DemoBackend implements Backend {
  kind = "demo" as const;
  deviceName = "roBa（デモ）";
  private saved: Layer[];
  private current: Layer[];
  private procs = defaultProcessors();
  private listeners = new Set<(p: InputProcessorInfo) => void>();

  constructor() {
    const behaviorId = (n: string) => DEMO_BEHAVIORS.find((b) => b.displayName === n)?.id ?? 5;
    const layers = (demoKeymap as { name: string; bindings: [string, number, number][] }[]).map(
      (l, i) => ({
        id: i,
        name: l.name,
        bindings: l.bindings.map(([n, p1, p2]) => ({ behaviorId: behaviorId(n), param1: p1, param2: p2 })),
      }),
    );
    this.saved = layers;
    this.current = structuredClone(layers);
  }

  async loadKeymap() {
    return { layers: structuredClone(this.current), keys: DEMO_KEYS, behaviors: DEMO_BEHAVIORS };
  }
  async setBinding(layerId: number, pos: number, b: Binding) {
    const l = this.current.find((x) => x.id === layerId);
    if (l) l.bindings[pos] = { ...b };
    return null;
  }
  async hasUnsaved() {
    return JSON.stringify(this.saved) !== JSON.stringify(this.current);
  }
  async save() {
    this.saved = structuredClone(this.current);
    return null;
  }
  async discard() {
    this.current = structuredClone(this.saved);
  }
  hasTrackball() {
    return true;
  }
  async getLayerNames() {
    return this.current.map((l) => l.name);
  }
  async listProcessors() {
    return structuredClone(this.procs);
  }
  async setProcessor(_id: number, req: Partial<RipRequest>) {
    const apply = (id: number, f: (p: InputProcessorInfo) => void) => {
      const p = this.procs.find((x) => x.id === id);
      if (p) {
        f(p);
        this.listeners.forEach((cb) => cb(structuredClone(p)));
      }
    };
    if (req.setScaleMultiplier) apply(req.setScaleMultiplier.id, (p) => (p.scaleMultiplier = req.setScaleMultiplier!.value));
    if (req.setScaleDivisor) apply(req.setScaleDivisor.id, (p) => (p.scaleDivisor = req.setScaleDivisor!.value));
    if (req.setRotation) apply(req.setRotation.id, (p) => (p.rotationDegrees = req.setRotation!.value));
    if (req.setTempLayerEnabled) apply(req.setTempLayerEnabled.id, (p) => (p.tempLayerEnabled = req.setTempLayerEnabled!.enabled));
    if (req.setTempLayerLayer) apply(req.setTempLayerLayer.id, (p) => (p.tempLayerLayer = req.setTempLayerLayer!.layer));
    if (req.setTempLayerActivationDelay)
      apply(req.setTempLayerActivationDelay.id, (p) => (p.tempLayerActivationDelayMs = req.setTempLayerActivationDelay!.activationDelayMs));
    if (req.setTempLayerDeactivationDelay)
      apply(req.setTempLayerDeactivationDelay.id, (p) => (p.tempLayerDeactivationDelayMs = req.setTempLayerDeactivationDelay!.deactivationDelayMs));
    if (req.setAxisSnapMode) apply(req.setAxisSnapMode.id, (p) => (p.axisSnapMode = req.setAxisSnapMode!.mode));
    if (req.setAxisSnapThreshold) apply(req.setAxisSnapThreshold.id, (p) => (p.axisSnapThreshold = req.setAxisSnapThreshold!.threshold));
    if (req.setXInvert) apply(req.setXInvert.id, (p) => (p.xInvert = req.setXInvert!.invert));
    if (req.setYInvert) apply(req.setYInvert.id, (p) => (p.yInvert = req.setYInvert!.invert));
    return null;
  }
  async resetProcessor(id: number) {
    const d = defaultProcessors().find((p) => p.id === id);
    const i = this.procs.findIndex((p) => p.id === id);
    if (d && i >= 0) {
      this.procs[i] = d;
      this.listeners.forEach((cb) => cb(structuredClone(d)));
    }
  }
  onProcessorChanged(cb: (p: InputProcessorInfo) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
