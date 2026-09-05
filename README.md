# NEON SPRINT OSAKA

大阪のネオン街をイメージした、ブラウザで遊べる3D WebGLスピードランゲームです。

## Features

- Three.js / WebGLによる3Dタイムアタックコース
- WASD・矢印キー・Bluetooth/USBゲームコントローラー（Gamepad API）対応
- 3チェックポイント、回転バー、可動ブロック、落下復帰
- Neon Postgresにオンラインランキングを保存
- Vercel / Next.js App Router向け構成
- オリジナル生成キャラクター画像

## Local development

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

BluetoothコントローラーはOSで先にペアリングしてください。ブラウザからBluetooth機器へ直接接続するのではなく、標準Gamepad APIで入力を受け取ります。

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / Arrow keys | Left stick / D-pad |
| Jump | Space | A / Cross |
| Restart | R | Start / Menu |
| Sprint | Left Shift | B / Circle |

## Audio credits

Audio is loaded from jsDelivr CDN at runtime.

- `Formant_1.wav`: Nick Farnan, OpenGameArt “Royalty Free Game Music Loops”, CC0 1.0
- `switch9.wav`: Kenney UI Audio, CC0 1.0
- `trap.wav`: Little Robot Sound Factory “Fantasy Sound Effects Library”, CC-BY 3.0
- `coin-flip.wav`: bone666138, Freesound, CC-BY 3.0

Source bundle and detailed attribution: https://github.com/benmarz/minimum_game

## Verification and limitations

Use Node.js 24+, `npm test`, `npm run typecheck`, and `npm run build` for regression checks.
The leaderboard is a casual, client-reported timer, not a cheat-proof competition.
Server-side replay validation and distributed rate limiting are not implemented.
Bluetooth/USB controller compatibility requires a real device test on the target OS/browser.

## License

Source code is MIT. The generated `public/runner.webp` is original for this project. Third-party audio remains under the licenses listed above.
