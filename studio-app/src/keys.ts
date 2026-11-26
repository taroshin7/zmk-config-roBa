// ZMK のキーコード（HID usage）を、画面に出す短い表示名へ変換する
import rawKeys from "./zmk-keys.json";

export interface ZmkKey {
  v: number; // (mods << 24) | (page << 16) | id
  names: string[];
  desc: string | null;
}

export const ZMK_KEYS = rawKeys as ZmkKey[];

const byValue = new Map<number, ZmkKey>();
for (const k of ZMK_KEYS) if (!byValue.has(k.v)) byValue.set(k.v, k);

export const MOD_BITS = [
  { bit: 0x01, short: "Ctrl", name: "左Ctrl" },
  { bit: 0x02, short: "⇧", name: "左Shift" },
  { bit: 0x04, short: "Alt", name: "左Alt" },
  { bit: 0x08, short: "Win", name: "左Win" },
  { bit: 0x10, short: "RCtrl", name: "右Ctrl" },
  { bit: 0x20, short: "R⇧", name: "右Shift" },
  { bit: 0x40, short: "RAlt", name: "右Alt" },
  { bit: 0x80, short: "RWin", name: "右Win" },
];

// 代表名（ZMK の定義名）→ 画面表示
const GLYPH: Record<string, string> = {
  SPACE: "Space",
  ENTER: "Enter",
  RETURN: "Enter",
  BACKSPACE: "BkSp",
  DELETE: "Del",
  TAB: "Tab",
  ESCAPE: "Esc",
  CAPSLOCK: "Caps",
  LEFT_SHIFT: "⇧",
  RIGHT_SHIFT: "⇧",
  LEFT_CONTROL: "Ctrl",
  RIGHT_CONTROL: "Ctrl",
  LEFT_ALT: "Alt",
  RIGHT_ALT: "Alt",
  LEFT_GUI: "Win",
  RIGHT_GUI: "Win",
  LEFT_ARROW: "←",
  RIGHT_ARROW: "→",
  UP_ARROW: "↑",
  DOWN_ARROW: "↓",
  HOME: "Home",
  END: "End",
  PAGE_UP: "PgUp",
  PAGE_DOWN: "PgDn",
  INSERT: "Ins",
  PRINTSCREEN: "PrtSc",
  SCROLLLOCK: "ScrLk",
  PAUSE_BREAK: "Pause",
  K_APPLICATION: "Menu",
  MINUS: "-",
  EQUAL: "=",
  LEFT_BRACKET: "[",
  RIGHT_BRACKET: "]",
  BACKSLASH: "\\",
  NON_US_HASH: "#",
  SEMICOLON: ";",
  SINGLE_QUOTE: "'",
  GRAVE: "`",
  COMMA: ",",
  PERIOD: ".",
  SLASH: "/",
  NON_US_BACKSLASH: "\\",
  EXCLAMATION: "!",
  AT_SIGN: "@",
  HASH: "#",
  DOLLAR: "$",
  PERCENT: "%",
  CARET: "^",
  AMPERSAND: "&",
  ASTERISK: "*",
  LEFT_PARENTHESIS: "(",
  RIGHT_PARENTHESIS: ")",
  UNDERSCORE: "_",
  PLUS: "+",
  LEFT_BRACE: "{",
  RIGHT_BRACE: "}",
  PIPE: "|",
  COLON: ":",
  DOUBLE_QUOTES: '"',
  TILDE: "~",
  LESS_THAN: "<",
  GREATER_THAN: ">",
  QUESTION: "?",
  INTERNATIONAL_1: "ろ",
  INTERNATIONAL_2: "かな",
  INTERNATIONAL_3: "¥",
  INTERNATIONAL_4: "変換",
  INTERNATIONAL_5: "無変換",
  LANGUAGE_1: "かな",
  LANGUAGE_2: "英数",
  KP_NUMLOCK: "NumLk",
  KP_DIVIDE: "KP /",
  KP_MULTIPLY: "KP *",
  KP_MINUS: "KP -",
  KP_PLUS: "KP +",
  KP_ENTER: "KP ⏎",
  KP_DOT: "KP .",
  KP_EQUAL: "KP =",
  C_VOLUME_UP: "音量+",
  C_VOLUME_DOWN: "音量-",
  C_MUTE: "ミュート",
  C_PLAY_PAUSE: "再生",
  C_NEXT: "次へ",
  C_PREVIOUS: "前へ",
  C_STOP: "停止",
  C_BRIGHTNESS_INC: "明るく",
  C_BRIGHTNESS_DEC: "暗く",
};

function keyName(k: ZmkKey): string {
  return k.names[0];
}

export function baseLabel(name: string): string {
  if (GLYPH[name]) return GLYPH[name];
  let m = name.match(/^NUMBER_(\d)$/);
  if (m) return m[1];
  m = name.match(/^KP_NUMBER_(\d)$/);
  if (m) return "KP " + m[1];
  m = name.match(/^F(\d+)$/);
  if (m) return "F" + m[1];
  if (/^[A-Z]$/.test(name)) return name;
  return name
    .replace(/^C_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface KeyLabel {
  text: string; // メイン表示
  mods: string; // 修飾キー（Ctrl+ など）
  full: string; // 説明用のフル表記
}

export function labelForUsage(value: number): KeyLabel {
  const v = value >>> 0;
  const exact = byValue.get(v);
  if (exact) {
    const t = baseLabel(keyName(exact));
    return { text: t, mods: "", full: t };
  }
  const mods = (v >>> 24) & 0xff;
  const base = v & 0xffffff;
  const k = byValue.get(base);
  const t = k ? baseLabel(keyName(k)) : `0x${base.toString(16)}`;
  const modStr = MOD_BITS.filter((m) => mods & m.bit)
    .map((m) => m.short)
    .join("+");
  return {
    text: t,
    mods: modStr,
    full: modStr ? `${modStr}+${t}` : t,
  };
}

export function isModifierUsage(value: number): boolean {
  const base = value & 0xffffff;
  return base >= 0x0700e0 && base <= 0x0700e7;
}

// キー選択パネル用の分類
export interface PickerGroup {
  title: string;
  names: string[];
}

export const PICKER_GROUPS: PickerGroup[] = [
  { title: "文字", names: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") },
  {
    title: "数字",
    names: ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N0"],
  },
  {
    title: "記号",
    names: [
      "MINUS", "EQUAL", "LEFT_BRACKET", "RIGHT_BRACKET", "BACKSLASH", "SEMICOLON",
      "SINGLE_QUOTE", "GRAVE", "COMMA", "PERIOD", "SLASH",
      "EXCLAMATION", "AT_SIGN", "HASH", "DOLLAR", "PERCENT", "CARET", "AMPERSAND",
      "ASTERISK", "LEFT_PARENTHESIS", "RIGHT_PARENTHESIS", "UNDERSCORE", "PLUS",
      "LEFT_BRACE", "RIGHT_BRACE", "PIPE", "COLON", "DOUBLE_QUOTES", "TILDE",
      "LESS_THAN", "GREATER_THAN", "QUESTION",
    ],
  },
  {
    title: "よく使う",
    names: ["SPACE", "ENTER", "BACKSPACE", "DELETE", "TAB", "ESCAPE", "CAPSLOCK", "INSERT", "PRINTSCREEN"],
  },
  {
    title: "修飾キー",
    names: ["LEFT_SHIFT", "LEFT_CONTROL", "LEFT_ALT", "LEFT_GUI", "RIGHT_SHIFT", "RIGHT_CONTROL", "RIGHT_ALT", "RIGHT_GUI"],
  },
  {
    title: "移動",
    names: ["LEFT_ARROW", "DOWN_ARROW", "UP_ARROW", "RIGHT_ARROW", "HOME", "END", "PAGE_UP", "PAGE_DOWN"],
  },
  {
    title: "日本語",
    names: ["INT_MUHENKAN", "INT_HENKAN", "LANG1", "LANG2", "INT_KATAKANAHIRAGANA", "INT_YEN", "INT_RO"],
  },
  {
    title: "ファンクション",
    names: Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  },
  {
    title: "テンキー",
    names: [
      "KP_N1", "KP_N2", "KP_N3", "KP_N4", "KP_N5", "KP_N6", "KP_N7", "KP_N8", "KP_N9", "KP_N0",
      "KP_DOT", "KP_PLUS", "KP_MINUS", "KP_MULTIPLY", "KP_DIVIDE", "KP_ENTER", "KP_NUMLOCK",
    ],
  },
  {
    title: "メディア",
    names: ["C_VOL_UP", "C_VOL_DN", "C_MUTE", "C_PP", "C_NEXT", "C_PREV", "C_BRI_UP", "C_BRI_DN"],
  },
];

const byName = new Map<string, ZmkKey>();
for (const k of ZMK_KEYS) for (const n of k.names) if (!byName.has(n)) byName.set(n, k);

export function usageByName(name: string): number | undefined {
  return byName.get(name)?.v;
}

// キー選択パネルでは左右の区別がつくように
const PICKER_LABEL: Record<string, string> = {
  LEFT_SHIFT: "左Shift",
  RIGHT_SHIFT: "右Shift",
  LEFT_CONTROL: "左Ctrl",
  RIGHT_CONTROL: "右Ctrl",
  LEFT_ALT: "左Alt",
  RIGHT_ALT: "右Alt",
  LEFT_GUI: "左Win",
  RIGHT_GUI: "右Win",
};
export function pickerLabel(name: string): string {
  return PICKER_LABEL[name] ?? baseLabel(name);
}

export function searchKeys(q: string): ZmkKey[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return ZMK_KEYS.filter(
    (k) =>
      k.names.some((n) => n.toLowerCase().includes(s)) ||
      (k.desc ?? "").toLowerCase().includes(s) ||
      baseLabel(k.names[0]).toLowerCase() === s,
  ).slice(0, 60);
}
