import { useMemo, useState } from "react";
import { useZMKApp } from "@cormoran/zmk-studio-react-hook";
import { connect as serialConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as gattConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { DemoBackend, DeviceBackend, type Backend } from "./backend";
import { KeymapTab } from "./KeymapTab";
import { TrackballTab } from "./TrackballTab";

const RIP_ID = "cormoran_rip";

export default function App() {
  const zmk = useZMKApp();
  const [tab, setTab] = useState<"keymap" | "trackball">("keymap");
  const demo = useMemo(() => new DemoBackend(), []);

  const device = useMemo<Backend | null>(() => {
    const conn = zmk.state.connection;
    if (!zmk.isConnected || !conn || !zmk.state.deviceInfo) return null;
    const rip = zmk.findSubsystem(RIP_ID);
    const subscribe = rip
      ? (cb: (p: Uint8Array) => void) =>
          zmk.onNotification({ type: "custom", subsystemIndex: rip.index, callback: (n) => cb(n.payload) })
      : null;
    return new DeviceBackend(conn, zmk.state.deviceInfo.name || "roBa", rip?.index ?? null, subscribe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zmk.isConnected, zmk.state.connection, zmk.state.deviceInfo, zmk.state.customSubsystems]);

  const backend: Backend = device ?? demo;
  const serialOk = typeof navigator !== "undefined" && "serial" in navigator;
  const btOk = typeof navigator !== "undefined" && "bluetooth" in navigator;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">roBa</span>
          <span className="brand-sub">Studio</span>
        </div>
        <nav className="tabs">
          <button className={tab === "keymap" ? "on" : ""} onClick={() => setTab("keymap")}>
            キーマップ
          </button>
          <button className={tab === "trackball" ? "on" : ""} onClick={() => setTab("trackball")}>
            トラックボール
          </button>
        </nav>
        <div className="conn">
          {device ? (
            <>
              <span className="pill ok">● {device.deviceName} に接続中</span>
              <button className="btn ghost" onClick={() => zmk.disconnect()}>
                切断
              </button>
            </>
          ) : (
            <>
              {serialOk && (
                <button className="btn dark" disabled={zmk.state.isLoading} onClick={() => zmk.connect(serialConnect)}>
                  USBでつなぐ
                </button>
              )}
              {btOk && (
                <button className="btn ghost" disabled={zmk.state.isLoading} onClick={() => zmk.connect(gattConnect)}>
                  Bluetoothでつなぐ
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {!device && (
        <div className="banner">
          <span className="tag">デモ中</span>
          実機にはつながっていません。変えた設定はこの画面の中だけで、キーボードには送られません。
          {!serialOk && !btOk && <b> このブラウザでは接続できません。PCのChromeかEdgeで開いてください。</b>}
          {zmk.state.isLoading && <b> 接続中…</b>}
          {zmk.state.error && <b className="err"> 接続できませんでした：{zmk.state.error}</b>}
        </div>
      )}

      <main>
        {tab === "keymap" && <KeymapTab key={backend.kind + backend.deviceName} backend={backend} />}
        {tab === "trackball" && <TrackballTab key={backend.kind + backend.deviceName} backend={backend} />}
      </main>

      <footer className="foot">
        roBa Studio ・ キーマップは ZMK Studio の通信、トラックボール設定は
        <a href="https://github.com/cormoran/zmk-module-runtime-input-processor" target="_blank" rel="noreferrer">
          cormoran/zmk-module-runtime-input-processor
        </a>
        を利用しています
      </footer>
    </div>
  );
}
