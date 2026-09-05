# NEON SPRINT OSAKA

大阪のネオン街をイメージした、ログイン不要の3D WebGLオートランゲームです。公開: https://speedrun-lilac.vercel.app/

## Features

- Three.js / WebGLによるカーブ・起伏のある640mの3Dタイムアタックコース（RIVER RUN v2）
- WASD・矢印キー・Bluetooth/USBゲームコントローラー（Gamepad API）対応
- 前進は自動。3チェックポイント、ジャンプ障害物、可動ブロック、穴、ダイヤ・加速アイテム
- ミスから0.85秒でチェックポイントから自動復帰。獲得済みアイテムは復帰後も重複取得不可
- Neon Postgresに匿名の自己ベストランキングを自動保存。3〜6文字の名前を自動発行し、後から変更可能
- Vercel / Next.js App Router向け構成
- 黒髪・黒と緑の衣装のオリジナル3Dキャラクター。背面カメラ、ボーン階層による走行・ジャンプアニメーション（元の画像も保存）

## Local development

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

BluetoothコントローラーはOSで先にペアリングしてください。ブラウザからBluetooth機器へ直接接続するのではなく、標準Gamepad APIで入力を受け取ります。

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Left / right | A D / Left Right | Left stick / D-pad |
| Jump | Space | A / Cross |
| Restart | R | Start / Menu |
| Accelerate | W / Up / Left Shift | B / Circle / Up |
| Slow down (still forward) | S / Down | Down |
| Pause | P / Escape | On-screen button |

タッチ端末には左右・ジャンプ・加速ボタンを表示します。通常速度12、加速16、減速10、アイテム加速18。ジャンプ初速13・重力22で高さ約3.8m。物理は120Hz固定ステップ、タブ非表示中と名前編集中は停止します。

## Anonymous identity and ranking

`GET /api/player` が匿名プレイヤーを作成し、ランダム256bitトークンをHttpOnly / SameSite=Lax Cookieで保持します。DBにはトークンのSHA-256だけを保存。HTTPSではSecure属性を付けます。`PATCH /api/player` はCookieで所有者を確認し、変更後の名前は過去のv2記録にも反映します。Cookieを削除した場合や別ブラウザでは別プレイヤーになります。

ゴール時に `POST /api/leaderboard` へ自動送信。UUIDごとの冪等保存で再送信による重複を防止します。各プレイヤーのベストタイムを上位10件表示し、同タイムではアイテム数、登録順で比較します。旧コースとは長さも操作も異なるため、旧 `speedrun_scores` は保持し、新しいランキングには混在させません。

`DATABASE_URL` は従来どおりサーバー専用。初回APIアクセスで `speedrun_guests_v2` / `speedrun_runs_v2` とインデックスを加算的に作成します（`src/lib/guest-store.ts`）。DDLはトランザクションのadvisory lockで同時起動を直列化し、失敗時は次回リクエストで再試行。既存DBの削除・変更は不要です。DBロールにCREATE権限が必要です。DB接続不能時もゲームは遊べ、ランキング保存はエラー表示と再送信に対応します。

## Audio credits

Audio is loaded from jsDelivr CDN at runtime.

- `Formant_1.wav`: Nick Farnan / Pudgyplatypus, [Royalty Free Game Music Loops](https://opengameart.org/content/royalty-free-game-music-loops), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- `switch9.wav`: [Kenney UI Audio](https://kenney.nl/assets/ui-audio), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- `trap.wav`: Copyright 2015 Little Robot Sound Factory, [Fantasy Sound Effects Library](https://opengameart.org/content/fantasy-sound-effects-library), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Originally `Trap_00.wav`.
- `coin-flip.wav`: Copyright bone666138, [Coin Flip](https://freesound.org/people/bone666138/sounds/198877/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Clipped from the original by the source bundle.

Source bundle and detailed attribution: https://github.com/benmarz/minimum_game

This game uses the bundle's audio without further file edits; playback volume, pitch variation and looping are controlled in the browser. Original Web Audio tones add distinct jump, landing, diamond, boost, checkpoint, respawn and finish cues. Sample voices can overlap. The game menu links to `/audio-credits.txt` for public attribution.

## Verification and limitations

Use Node.js 24+, `npm test`, `npm run typecheck`, and `npm run build` for regression checks.
The leaderboard is a casual, client-reported timer, not a cheat-proof competition.
Server-side replay validation and distributed rate limiting are not implemented.
Bluetooth/USB controller compatibility requires a real device test on the target OS/browser.

## License

Source code is MIT. The generated `public/runner.webp` is original for this project. Third-party audio remains under the licenses listed above.
