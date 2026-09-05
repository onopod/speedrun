# 瞬足ラン shun-soku run

光る空中コースを駆け抜ける、ログイン不要の3D WebGLオートランゲームです。公開: https://speedrun-lilac.vercel.app/

## Features

- Three.js / WebGLによる8コースの3Dタイムアタック。640〜1040m、難易度★1〜5のステージセレクト
- WASD・矢印キー・Bluetooth/USBゲームコントローラー（Gamepad API）対応
- 前進は自動。3チェックポイント、ジャンプ障害物、可動ブロック、穴、スター・加速アイテム
- ミスから0.85秒でチェックポイントから自動復帰。獲得済みアイテムは復帰後も重複取得不可
- Neon Postgresに匿名の自己ベストランキングを自動保存。3〜6文字の名前を自動発行し、後から変更可能
- Vercel / Next.js App Router向け構成
- 黒髪・黒と緑の衣装のオリジナル3Dキャラクター。背面カメラ、ボーン階層による走行・ジャンプアニメーション（元の画像も保存）

アイテムを未取得のまま通り過ぎると、顔だけ取り逃した側に約0.72秒振り返ります。1.5秒の間隔を設け、連続した取り逃しでずっと横を向かないようにします。胴体・進行方向・カメラは回しません。


## ステージセレクト

8コースすべて最初から選択可能。カードに難易度・距離・ルートの見取り図を表示します。

| コース | 難易度 | 距離 | ジャンプ区間 |
| --- | --- | --- | --- |
| はじまりの風 | ★☆☆☆☆ | 640m | 4 |
| ハーバーライト | ★★☆☆☆ | 680m | 6 |
| リボンカーブ | ★★☆☆☆ | 720m | 8 |
| スカイライン | ★★★☆☆ | 640m | 8 |
| サンセットダイブ | ★★★☆☆ | 800m | 8 |
| ジグザグラッシュ | ★★★★☆ | 840m | 10 |
| ストームリッジ | ★★★★☆ | 900m | 12 |
| クラウンロード | ★★★★★ | 1040m | 12 |

各コースに60スター、チェックポイント3か所、全回収ガイド、加速板を配置。坂の高さ、左右の曲がり、壁・穴・移動ブロックの位置を個別に設定しています。難易度はゲーム内で設定した目安です。

- **Spaceでゲーム開始・クリア後の再挑戦**。結果ボタン表示前の2.8秒はフィニッシュ演出。開始に使ったSpaceを離すまでジャンプは発動しません。ポーズ・名前入力中は開始ショートカットを無効化します。
- 結果画面・ポーズ画面からステージセレクトへ戻れます。選び直すと新しいコースをロードし、キャラクター・音声・ガイド設定は引き継ぎます。
- 端末のクリア状況・自己ベストをコース別に保存。世界ランキングも `GET /api/leaderboard?course=<course-id>` とPOSTの `course` で分離。未知のIDは400。既存スカイラインのID・レイアウト・記録は維持しています。
- 全8コースで±1mのジャンプタイミング差でも60スター・ノーミスを検証。加速/減速時のクリア、各コースの復帰地点、25秒の保存下限、Space操作を含め35テスト。

## SKYLINE v5

- タイトルを **瞬足ラン shun-soku run** に変更。640mの空中コースに最高21mの丘。滑らかな上りは最大9%減速、下りは最大70%加速。カメラの視野も下りの速度に合わせて広がります。
- 半透明の水色ラインは通常速度・青い加速スター回収・大ジャンプで全60スターを取る実際の軌道。8か所の矢印の先端で0.25秒以上長押し。前後ボタンを離して追う想定です。ラインの上下の弧がジャンプの軌道を表します。加減速を使った場合はジャンプ位置を調整してください。
- コースの物理からライン・スター高さを決定し、全回収・ノーミスのリプレイを自動検証。目印から±0.75mの踏み切り差でも全回収できることをテスト。ジャンプ障害物を下りの最大飛距離に合わせて配置し、外側レーンには移動ブロックを残しています。
- ポーズ設定でハヤテ / 女性ランナーのヒカリを選択。ヒカリはオリジナルのボーン付き3Dモデル、ポニーテールとシアンのウェア。性能は共通。キャラ・ガイド・音声設定は端末に保持し、変更しても位置・タイム・スターを維持します。
- ゴール後はカメラへ向き直り、最初の2.8秒はキャラの演出を見せ、その後に結果カードを表示。スター48個以上かつミス2回以内は両手で喜ぶジャンプ、24個以上かつミス6回以内は手を振る、それ以外は照れた頭かきとうなずき。評価はタイムランキングとは独立です。

## Visual effects

7 scenes have separate VFX: subtle running footsteps; lime manual-acceleration trails and screen-edge speed lines; smoke at takeoff/landing plus medium/large jump sparkles; gold/lime normal-star pickup; cyan boost-star burst/ring/trails; orange boost-pad burst/ring/board flash; and grade-scaled finish confetti/stars.

Kenney Particle Pack and Smoke Particles (CC0) supply three unmodified local PNGs (about 182 kB total). Original license files, source URLs and SHA-256 checksums are in `public/vfx/`. Public credits: `/vfx/credits.txt`. Textures are served with the game rather than relying on a third-party runtime CDN. Rings, trails, confetti and particle motion are original code.

`RunEffects` keeps at most 192 particles (80 in SVG fallback), reuses slots, freezes while paused, stops footsteps in the air and clears on restart/death. WebGL draws six instanced batches; SVG fallback uses simplified geometry. Reduced-motion preference reduces particle emission and disables the screen-edge lines. The selected character has no effect on physics or particle behavior.

Four optional boost pads at 28/174/330/490m lie outside the full-star guide. Grounded entry triggers once per contact and grants 1.2s at the existing manual-acceleration speed (20.8 before hill adjustment). Boosts never stack; braking and opposite-input cancellation still apply, and blue-star acceleration takes precedence. The verified guide trajectory and v5 score floor remain unchanged.

`/effects` is an interactive VFX gallery using the same renderer, assets and articulated runner. It can replay all seven scenes and all three finish grades without posting scores. Accessible from pause settings.

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
| Jump (tap / medium hold / long hold) | Space | A / Cross |
| Restart | R | Start / Menu (after finish) |
| Accelerate | W / Up / Left Shift | B / Circle / Up |
| Slow down (still forward) | S / Down | Down |
| Pause / settings | P / Escape / On-screen button | Start / Menu |

タッチ端末は画面の左右スワイプで横移動し、左右ボタンは表示しません。画面幅の65%のスライドでコース幅を移動し、指を離すとその位置を維持します。前・後ろ・ジャンプボタンを表示し、スワイプしながら別の指で押せます。前を押している間は1段階加速、後ろを押している間は1段階減速。長く押しても速度が積み上がらず、離すと通常速度へ戻ります（加速アイテムの効果中はアイテム速度）。前後同時入力は通常速度、後ろ入力はアイテム加速より優先します。開始後6.5秒は半透明の矢印と指のガイドを表示します。通常速度15.6、加速20.8、減速13、アイテム加速23.4（すべて旧版の1.3倍）。ジャンプは押した瞬間に離陸。0.1秒未満で離すと小（高さ約1.5m）、0.1〜0.25秒未満で中（約3m）、0.25秒以上で大（約4.8m）。長く押すほど滞空時間と飛距離も伸びます。上昇中の重力22・落下中30で積分し、離した時点で各段階の高さに上昇速度を制限します。着地まで押し続けても自動連続ジャンプにはなりません。物理は120Hz固定ステップ、タブ非表示中と名前編集中は停止します。

WebGLが無効の環境ではThree.js SVGRendererによる簡易3D描画へ自動切り替えします。コース・キャラクター・物理は同じですが、GPU描画より低速で、建物の窓など一部の装飾を省略します。

## Anonymous identity and ranking

`GET /api/player` が匿名プレイヤーを作成し、ランダム256bitトークンをHttpOnly / SameSite=Lax Cookieで保持します。DBにはトークンのSHA-256だけを保存。HTTPSではSecure属性を付けます。`PATCH /api/player` はCookieで所有者を確認し、変更後の名前は過去の本人の記録にも反映します。Cookieを削除した場合や別ブラウザでは別プレイヤーになります。

ゴール時に `POST /api/leaderboard` へ自動送信。UUIDごとの冪等保存で再送信による重複を防止します。各プレイヤーのベストタイムを上位10件表示し、同タイムではアイテム数、登録順で比較します。旧コースとは長さも操作も異なるため、旧 `speedrun_scores` は保持し、新しいランキングには混在させません。

`DATABASE_URL`（未指定時はVercel連携の `POSTGRES_URL`）はサーバー専用。初回APIアクセスで `speedrun_guests_v2` / `speedrun_runs_v3` とインデックスを加算的に作成します（`src/lib/guest-store.ts`）。DDLはトランザクションのadvisory lockで同時起動を直列化し、失敗時は次回リクエストで再試行。既存テーブルは削除・変更しません。v3以降の記録の下限は25秒。坂とスター配置が変わったv5はコースIDを分け、旧版のランキングとは分離します。匿名ユーザー名は引き継ぎます。旧v2/v3/v4の未送信キューも端末に保持しますが、新コースへは送信しません。DBロールにCREATE権限が必要です。

DB接続不能時も短い名前を自動発行し、名前変更はこの端末のlocalStorageへ保存します。接続復帰時にCookieで確立した本人のプロフィールへ同期します。未送信記録は最新20件を端末に保持し、再読み込み・オンライン復帰時に再送信します。端末保存と公開ランキング保存は別の状態として表示し、APIが成功するまで公開保存済みと表示しません。ブラウザのサイトデータ削除で未送信記録は失われます。

運用確認: 本番の `/api/player` が `DATABASE_NOT_CONFIGURED` を返す場合は、Vercelの対象プロジェクトのProduction環境にサーバー専用接続変数を設定して再デプロイしてください。秘密値をGitHubやNEXT_PUBLIC変数に保存しないでください。

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
