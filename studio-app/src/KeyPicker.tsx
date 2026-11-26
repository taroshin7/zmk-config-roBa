import { useState } from "react";
import { MOD_BITS, PICKER_GROUPS, labelForUsage, pickerLabel, searchKeys, usageByName } from "./keys";

export function KeyPicker({
  value,
  onChange,
  disabled,
  preferModifiers,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  preferModifiers?: boolean;
}) {
  const [group, setGroup] = useState(preferModifiers ? "修飾キー" : "文字");
  const [q, setQ] = useState("");
  const mods = (value >>> 24) & 0xff;
  const base = value & 0xffffff;
  const cur = labelForUsage(value);

  const pick = (usage: number) => {
    // 記号など、もともと Shift 付きで定義されたキーはそのまま
    const own = (usage >>> 24) & 0xff;
    onChange(own ? usage : ((mods << 24) | usage) >>> 0);
  };
  const toggleMod = (bit: number) => onChange((((mods ^ bit) << 24) | base) >>> 0);

  const g = PICKER_GROUPS.find((x) => x.title === group) ?? PICKER_GROUPS[0];
  const list = q
    ? searchKeys(q).map((k) => ({ name: k.names[0], v: k.v }))
    : g.names.map((n) => ({ name: n, v: usageByName(n) ?? 0 })).filter((x) => x.v);

  return (
    <div className={`picker${disabled ? " disabled" : ""}`}>
      <div className="picker-top">
        <div className="picker-current">
          <span className="cap">{cur.full}</span>
        </div>
        <input
          className="search"
          placeholder="キーを検索（例：enter、kp、vol）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {!preferModifiers && (
        <div className="modrow">
          <span className="muted">一緒に押す修飾キー：</span>
          {MOD_BITS.slice(0, 4).map((m) => (
            <button key={m.bit} className={`chip${mods & m.bit ? " on" : ""}`} onClick={() => toggleMod(m.bit)} disabled={disabled}>
              {m.name}
            </button>
          ))}
          {MOD_BITS.slice(4).map((m) => (
            <button key={m.bit} className={`chip small${mods & m.bit ? " on" : ""}`} onClick={() => toggleMod(m.bit)} disabled={disabled}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      {!q && (
        <div className="groups">
          {PICKER_GROUPS.map((x) => (
            <button key={x.title} className={x.title === group ? "on" : ""} onClick={() => setGroup(x.title)}>
              {x.title}
            </button>
          ))}
        </div>
      )}
      <div className="keygrid">
        {list.map((k) => {
          const isCur = (k.v >>> 0) === (value >>> 0) || ((k.v >>> 24) === 0 && k.v === base);
          return (
            <button key={k.name} className={`kchip${isCur ? " on" : ""}`} title={k.name} onClick={() => pick(k.v >>> 0)} disabled={disabled}>
              {pickerLabel(k.name)}
            </button>
          );
        })}
        {q && list.length === 0 && <span className="muted">見つかりませんでした</span>}
      </div>
    </div>
  );
}
