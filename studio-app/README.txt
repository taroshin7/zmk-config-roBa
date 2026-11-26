roBa Studio（roBa専用キーマップ＆トラックボール設定アプリ）

公開ページ: https://taroshin7.github.io/zmk-config-roBa/

開発:
  cd studio-app
  npm install
  npm run dev        # http://localhost:5173/zmk-config-roBa/
  npm run build      # dist/ に出力（gh-pages ブランチへ置く）

キーマップは ZMK Studio の通信（@zmkfirmware/zmk-studio-ts-client の cormoran 版）、
トラックボール設定は modules/runtime-input-processor（cormoran/zmk-module-runtime-input-processor）を使っています。
