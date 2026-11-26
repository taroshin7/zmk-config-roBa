// 保存したキーマップ（ブラウザ内の localStorage に保存）
import type { BehaviorInfo, Binding, KeymapData, Layer } from "./backend";
import { usageByName } from "./keys";

// 動作は番号ではなく名前で保存する（ファームウェアが変わっても番号がずれないように）
export interface StoredBinding {
  b: string;
  p1: number;
  p2: number;
}
export interface StoredLayer {
  name: string;
  bindings: StoredBinding[];
}
export interface StoredItem {
  id: string;
  name: string;
  kind: "layer" | "keymap";
  createdAt: number;
  auto?: boolean; // 適用前の自動バックアップ
  targets?: number[]; // 自動バックアップの戻し先レイヤー
  layers: StoredLayer[];
}

const KEY = "roba-studio.storage.v1";

export function loadItems(): StoredItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as StoredItem[]) : [];
  } catch {
    return [];
  }
}

export function saveItems(items: StoredItem[]): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return null;
  } catch {
    return "ブラウザに保存できませんでした（容量不足か、保存が禁止されています）";
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function snapshotLayer(layer: Layer, behaviors: BehaviorInfo[], name: string): StoredLayer {
  return {
    name,
    bindings: layer.bindings.map((x) => ({
      b: behaviors.find((b) => b.id === x.behaviorId)?.displayName ?? "None",
      p1: x.param1,
      p2: x.param2,
    })),
  };
}

export function resolveBinding(s: StoredBinding, behaviors: BehaviorInfo[]): Binding | null {
  const b = behaviors.find((x) => x.displayName === s.b);
  return b ? { behaviorId: b.id, param1: s.p1, param2: s.p2 } : null;
}

export function sameBinding(a: Binding | undefined, b: Binding | null) {
  return !!a && !!b && a.behaviorId === b.behaviorId && a.param1 === b.param1 && a.param2 === b.param2;
}

// ---------- 配列プリセット ----------

// roBa のアルファベット部分（3段×10列）のキー番号
export const ALPHA_POSITIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 29, 30, 31, 32, 33],
];

export interface Preset {
  name: string;
  rows: string[]; // 各段10文字
}

export const PRESETS: Preset[] = [
  { name: "QWERTY", rows: ["QWERTYUIOP", "ASDFGHJKL;", "ZXCVBNM,./"] },
  { name: "大西配列", rows: ["QLU,.FWRYP", "EIAO-KTNSH", "ZXCV;GDMJB"] },
  { name: "Colemak-DH", rows: ["QWFPBJLUY;", "ARSTGMNEIO", "ZXCDVKH,./"] },
  { name: "Colemak", rows: ["QWFPGJLUY;", "ARSTDHNEIO", "ZXCVBKM,./"] },
  { name: "Dvorak", rows: ["',.PYFGCRL", "AOEUIDHTNS", ";QJKXBMWVZ"] },
];

const CHAR_NAME: Record<string, string> = {
  ",": "COMMA",
  ".": "PERIOD",
  ";": "SEMICOLON",
  "/": "SLASH",
  "-": "MINUS",
  "'": "SINGLE_QUOTE",
};

export function charUsage(ch: string): number {
  return usageByName(CHAR_NAME[ch] ?? ch) ?? 0;
}

// プリセットを今のレイヤーに当てはめた結果を作る。
// タップ／長押しのキー（Shift付きのAなど）は、長押し側を残してタップ側だけ入れ替える
export function presetLayer(preset: Preset, layer: Layer, data: KeymapData): StoredLayer {
  const snap = snapshotLayer(layer, data.behaviors, layer.name);
  const kp = "Key Press";
  ALPHA_POSITIONS.forEach((row, r) =>
    row.forEach((pos, c) => {
      const u = charUsage(preset.rows[r][c]);
      const cur = snap.bindings[pos];
      if (!u || !cur) return;
      const beh = data.behaviors.find((b) => b.displayName === cur.b);
      const holdTap = beh?.metadata.some(
        (s) => s.param2.some((d) => d.hidUsage) && s.param1.some((d) => d.hidUsage || d.layerId),
      );
      snap.bindings[pos] = holdTap ? { ...cur, p2: u } : { b: kp, p1: u, p2: 0 };
    }),
  );
  return snap;
}

// ---------- 書き出し／読み込み ----------

export function exportJson(items: StoredItem[]) {
  const blob = new Blob([JSON.stringify({ app: "roba-studio", version: 1, items }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `roBa-keymaps-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJson(file: File): Promise<StoredItem[]> {
  const v = JSON.parse(await file.text());
  const items = Array.isArray(v) ? v : v?.items;
  if (!Array.isArray(items)) throw new Error("roBa Studio の書き出しファイルではありません");
  return items
    .filter((x) => x && Array.isArray(x.layers))
    .map((x) => ({ ...x, id: newId(), auto: false }));
}
