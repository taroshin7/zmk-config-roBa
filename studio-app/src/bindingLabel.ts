// キーに表示する文字（タップ側を大きく、長押し側を「hold:」で小さく）
import type { BehaviorInfo, Binding, Layer } from "./backend";
import { labelForUsage } from "./keys";

export type KeyKind =
  | "key"
  | "modtap"
  | "layertap"
  | "layer"
  | "trans"
  | "none"
  | "bt"
  | "danger"
  | "mouse"
  | "other";

export interface KeyFace {
  main: string;
  mods?: string; // 小さく添える修飾キー
  hold?: string; // 長押し側
  kind: KeyKind;
  title: string; // マウスを乗せたときの説明
}

export function layerName(layers: Layer[], id: number): string {
  const idx = layers.findIndex((l) => l.id === id);
  const l = layers[idx];
  if (!l) return `L${id}`;
  return l.name ? l.name : idx === 0 ? "Base" : `L${idx}`;
}

const MOUSE_BUTTONS: Record<number, string> = {
  1: "左クリック",
  2: "右クリック",
  4: "中クリック",
  8: "戻る",
  16: "進む",
};

export const BEHAVIOR_JA: Record<string, string> = {
  "Key Press": "キー入力",
  "Mod-Tap": "タップでキー／長押しで修飾キー",
  "Layer-Tap": "タップでキー／長押しでレイヤー",
  "Momentary Layer": "押している間だけレイヤー",
  "To Layer": "レイヤーへ切り替え",
  "Toggle Layer": "レイヤーをオン／オフ",
  Transparent: "下のレイヤーと同じ（透過）",
  None: "何もしない",
  Bluetooth: "Bluetooth",
  "Mouse Key Press": "マウスボタン",
  Bootloader: "書き込みモードにする",
  Reset: "再起動",
  "Caps Word": "Caps Word",
  "Sticky Key": "ワンショット修飾キー",
  "Sticky Layer": "ワンショットレイヤー",
  "Key Repeat": "直前のキーを繰り返す",
  "Key Toggle": "キーを押しっぱなしに切り替え",
  "Grave/Escape": "Esc／`",
  "Output Selection": "出力先の切り替え（USB／BT）",
  "External Power": "外部電源",
  "Studio Unlock": "Studioのロック解除",
  lt_to_layer_0: "タップで入力＋ベースへ／長押しでレイヤー（独自）",
  to_layer_0: "ベースへ戻って入力（独自）",
};

export function behaviorJa(name: string): string {
  return BEHAVIOR_JA[name] ?? name;
}

function isHoldTap(b: BehaviorInfo): boolean {
  if (b.displayName === "Mod-Tap" || b.displayName === "Layer-Tap") return true;
  // 独自の長押し系：1つ目がキーかレイヤー、2つ目がキー
  return b.metadata.some(
    (s) => s.param2.some((d) => d.hidUsage) && s.param1.some((d) => d.hidUsage || d.layerId),
  );
}

export function keyFace(binding: Binding | undefined, behaviors: BehaviorInfo[], layers: Layer[]): KeyFace {
  if (!binding) return { main: "", kind: "none", title: "" };
  const b = behaviors.find((x) => x.id === binding.behaviorId);
  if (!b) return { main: "?", kind: "other", title: "不明な動作" };
  const name = b.displayName;
  const ja = behaviorJa(name);

  switch (name) {
    case "Key Press": {
      const l = labelForUsage(binding.param1);
      return { main: l.text, mods: l.mods || undefined, kind: "key", title: `${ja}：${l.full}` };
    }
    case "Transparent":
      return { main: "▽", kind: "trans", title: ja };
    case "None":
      return { main: "✕", kind: "none", title: ja };
    case "Momentary Layer":
      return { main: layerName(layers, binding.param1), hold: "押す間", kind: "layer", title: `${ja}：${layerName(layers, binding.param1)}` };
    case "To Layer":
      return { main: layerName(layers, binding.param1), hold: "切替", kind: "layer", title: `${ja}：${layerName(layers, binding.param1)}` };
    case "Toggle Layer":
      return { main: layerName(layers, binding.param1), hold: "オン/オフ", kind: "layer", title: `${ja}：${layerName(layers, binding.param1)}` };
    case "Mouse Key Press": {
      const t = MOUSE_BUTTONS[binding.param1] ?? `MB ${binding.param1}`;
      return { main: t, kind: "mouse", title: `${ja}：${t}` };
    }
    case "Bluetooth": {
      const set = b.metadata.find((s) => s.param1.some((d) => d.constant === binding.param1));
      const cmd = binding.param1;
      if (cmd === 3) return { main: `BT ${binding.param2}`, hold: "選択", kind: "bt", title: `プロファイル${binding.param2}に切り替え` };
      if (cmd === 0) return { main: "BT消去", kind: "danger", title: "選択中のプロファイルのペアリングを削除" };
      if (cmd === 4) return { main: "BT全消去", kind: "danger", title: "すべてのペアリングを削除" };
      if (cmd === 1) return { main: "BT次", kind: "bt", title: "次のプロファイル" };
      if (cmd === 2) return { main: "BT前", kind: "bt", title: "前のプロファイル" };
      const n = set?.param1.find((d) => d.constant === cmd)?.name ?? "BT";
      return { main: n, kind: "bt", title: n };
    }
    case "Bootloader":
      return { main: "Boot", kind: "danger", title: "書き込みモード（ブートローダー）" };
    case "Reset":
      return { main: "Reset", kind: "danger", title: "再起動" };
  }

  if (isHoldTap(b)) {
    const tap = labelForUsage(binding.param2);
    const holdIsLayer = b.metadata.some((s) => s.param1.some((d) => d.layerId));
    if (holdIsLayer) {
      const ln = layerName(layers, binding.param1);
      return {
        main: tap.text,
        mods: tap.mods || undefined,
        hold: ln,
        kind: "layertap",
        title: `${ja}：タップ ${tap.full}／長押し ${ln}`,
      };
    }
    const hold = labelForUsage(binding.param1);
    return {
      main: tap.text,
      mods: tap.mods || undefined,
      hold: hold.full,
      kind: "modtap",
      title: `${ja}：タップ ${tap.full}／長押し ${hold.full}`,
    };
  }

  // それ以外：引数がキーなら表示
  const set = b.metadata[0];
  if (set?.param1.some((d) => d.hidUsage)) {
    const l = labelForUsage(binding.param1);
    return { main: l.text, mods: l.mods || undefined, hold: ja.slice(0, 6), kind: "other", title: `${ja}：${l.full}` };
  }
  if (set?.param1.some((d) => d.layerId)) {
    return { main: layerName(layers, binding.param1), hold: ja.slice(0, 6), kind: "layer", title: ja };
  }
  return { main: ja.length > 8 ? name : ja, kind: "other", title: ja };
}
