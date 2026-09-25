# HAYAGAWARI — Portfolio Motion Generator

<p align="center">
  <a href="https://shironagasu-ai.github.io/hayagawari/"><img src="docs/media/preview.webp" alt="HAYAGAWARI で作ったポートフォリオ映像（作例: SHIRONAGASU WORKS）" width="720"></a>
</p>
<p align="center"><b><a href="https://shironagasu-ai.github.io/hayagawari/">▶ サイトで試す</a></b> ・ 作例: SHIRONAGASU WORKS（冒頭 16 秒。全編は <a href="assets/hero/hero-16x9.mp4">hero-16x9.mp4</a>）</p>

イラストを複数枚アップロードすると、**注目点（目を引く箇所）を解析**して、キビキビ動くモーショングラフィックのポートフォリオ映像を自動生成する Web サービスです。
**シードごとに振付・トランジション・配色・テンポが変わる**ので、使う人・押すたびに違う映像になります。

- ビルド不要・静的ファイルのみ（GitHub Pages でそのまま動く）・外部 CDN 非依存（ライブラリは `vendor/` にバージョン固定で同梱）
- 画像はブラウザ内で処理し、どこにも送信しない
- WebGL2 の自前レンダラーで 60fps 前提（1フレームの JS 側コストは約 0.3〜0.5ms、描画は数十ドローコール＋フルスクリーン 3 パス）

## 使い方

基本は **画像・作家名・サブタイトル・SNS/URL・画面比率** だけで「▶ 再生」できます。
テンポ・スタイル・オープニング/エンディング・並び順・シードは **詳細設定**（アコーディオン）の中にあります。

- **閉じているとき**: 詳細設定は使わず、すべておまかせ。▶ 再生を押すたびに新しいシードで抽選するので毎回違う映像になる（作品タイトル・注目点も自動の値）
- **開いているとき**: 詳細設定・作品ごとのタイトル・注目点がすべて反映される。URL に `adv=1` と設定が入り、共有するとその設定で再現できる

設定値は閉じても保持され、開けば戻ります。開閉状態はブラウザに記憶されます。

1. イラストをドロップ（または「サンプルで試す」）
2. サムネイルの丸が自動検出した注目点（番号＝優先順、1番が一番見せたい箇所）。サムネイルをクリックすると注目点エディタが開き、移動・追加・削除・優先順・寄りの範囲を編集できる。カードのドラッグで並べ替え
3. 名前・比率（16:9 / 9:16 / 1:1）・テンポ・スタイル・オープニング・エンディング・シードを選んで「▶ 映像を生成して再生」
4. 🎲（または R キー）で別バージョン。気に入ったら「⤓ 書き出し」で MP4 を保存

### 作業の保存

- 追加した画像・入力欄・シード・詳細設定・作品ごとのタイトルと手で直した注目点を、**このブラウザの中（IndexedDB）に自動で保存**し、次に開いたとき（スマホでタブが破棄されて読み込み直されたときも）元に戻す。外部には送信しない
- 共有された URL にシード等が入っている場合は、URL の指定を優先する
- 作品一覧の「すべて外す」で、画像と保存した画像をまとめて消せる（名前などの入力は残る）
- 保存するのは直近の作業 1 件。ブラウザの設定やストレージ整理で消えることはある（Safari は長期間開かないと消すことがある）

### 書き出し

- **1コマずつ描いて MP4 にする**（WebCodecs）。実時間に縛られないので、コマ落ちせず、タブを裏に回しても止まらない
- 解像度 1080p / 4K、フレームレート 60 / 30fps
- コーデックは H.264 → VP9 → AV1 の順で使えるものを自動選択。H.264 は一般配布の Chrome / Edge / Safari で使える（オープンソース版 Chromium には無い）。VP9 / AV1 は一部アプリや SNS で再生・投稿できないことがあるため、ダイアログで警告する
- WebCodecs 非対応のブラウザでは、従来の実時間録画（MediaRecorder）に切り替わる
- 音声は「ビート＋効果音 / 効果音のみ / なし」から選べる。AAC を優先し、使えなければ Opus（互換性の警告を表示）

### 音

- 効果音（場面転換のシュッ、カットや着地のドン、細かいカットのチッ）と、BPM に合わせた簡易ビートを WebAudio でその場で合成する。音源ファイルは使わない
- 音は映像の設計図から作るので、カットや着地と 1 コマ単位で一致する。同じシードなら同じ音
- 音色はスタイルごとに変わる（例: GLITCH はビット潰し、RETRO はこもった音とレコードノイズ、EDITORIAL / PASTEL はキックなしの軽い音）
- プレーヤーの 🔊 ボタン（M キー）で「ビート＋効果音 → 効果音のみ → なし」を切り替え。選択はブラウザに記憶

| キー | 動作 |
|---|---|
| Space | 再生 / 停止 |
| R | 別バージョン（新しいシード） |
| ← → | 前 / 次の作品へ |
| F | 全画面 |
| E | 編集に戻る |
| M | 音の切り替え（ビート＋効果音 / 効果音のみ / なし） |
| P | パフォーマンス表示（FPS・描画コスト） |

シード・比率・スタイル等は URL の `#` 以降に入るので、同じ画像を使えば同じ映像を再現できます。

## 仕組み

```
index.html       … UI（編集画面・プレイヤー）
src/main.js      … UI 配線・メインループ・書き出しダイアログ
src/export.js    … 1コマずつの書き出し（WebCodecs → MP4、映像＋音声）
src/audio.js     … 効果音とビートの合成・楽譜・プレビュー再生
vendor/          … 同梱ライブラリ（mp4-muxer 5.2.2・MIT）
src/analyze.js   … 注目点検出（顕著性マップ）とパレット抽出
src/director.js  … シードから映像の設計図を作り、時刻 t の絵を描く（テーマ・振付・背景装飾・トランジション）
src/bookends.js  … オープニング / エンディングのパターン
src/kit.js       … 演出共通の部品（配色・注目点・画像カメラ・文字配置・レイアウト）
src/focal-editor.js … 注目点エディタ
src/gl.js        … WebGL2 レンダラー（マスク・方向ブラー・トランジション合成・ポスト）
src/text.js      … 文字のテクスチャ化
src/ease.js      … イージング（タメツメ用の cubic-bezier / 予備動作付き加速など）
src/rng.js       … シード付き乱数
src/samples.js   … サンプル用のプロシージャル・イラスト
tests/e2e.mjs    … Playwright による E2E テスト
```

- **演出はすべて「時刻 → 絵」の純関数**。ランダムな決定は生成時に済ませるので、シーク・ループ・書き出しで結果がぶれない
- カットは BPM の拍頭に置き、動きは「溜めて（ほぼ静止 or 微速ドリフト）→ 数フレームで詰める → ピタッと止める」で設計
- 詳細な設計は [docs/design.md](docs/design.md)

## 自動テストと公開（GitHub Actions）

`.github/workflows/ci.yml`

- **PR と main へのプッシュ**で E2E テストを実行。Playwright の Chromium と、一般配布の Google Chrome の 2 種類で並行して回す（Chrome では H.264 で書き出せることも確認）
- テストのスクリーンショットと書き出した動画は、実行結果の Artifacts から 7 日間ダウンロードできる
- **main でテストが通ったときだけ** GitHub Pages へ公開（`index.html` / `src` / `vendor` / `assets` / `LICENSE` のみ）
- 事前設定: Settings → Pages → Build and deployment → Source を **GitHub Actions** にする

## トップの作例動画

トップ画面の背景で流れる動画は `assets/hero/` にある。縦長の画面では `hero-9x16`、それ以外は `hero-16x9` を使う（各 `.mp4` と、読み込み前・動きを減らす設定用のポスター画像 `.jpg`）。

- HAYAGAWARI 自身の描画から作る。作り直すとき（イラストを差し替えるとき）は:

  ```sh
  FFMPEG=/path/to/ffmpeg node tools/make-hero.mjs --images ./my-illustrations --name "SHIRONAGASU" --seed HERO-01
  ```

  `--images` を省くと内蔵サンプルで作る。libx264 入りの ffmpeg が必要（`pip install imageio-ffmpeg` で入る静的ビルドでも可）
- iPhone を含めて自動再生できるよう **H.264・音声なし**。解像度は 1280×720 / 720×1280、9 作品・約 45 秒で 1 本 3.5MB 前後（`--crf` で調整）
- 画面外・映像の再生中・タブ非表示のときは止める。「動きを減らす」設定ではポスター画像のみ
- 作例のクレジット表記は `index.html` の `#hero-credit`

README 冒頭のプレビュー（`docs/media/preview.webp`、アニメーション WebP）は横長動画の冒頭 16 秒を 720px・20fps にしたもの。GitHub の README はリポジトリ内の MP4 をその場で再生できないため画像にしている。作り直すとき:

```sh
ffmpeg -t 16 -i assets/hero/hero-16x9.mp4 -vf "fps=20,scale=720:-1:flags=lanczos" -c:v libwebp_anim -quality 55 -compression_level 6 -loop 0 docs/media/preview.webp
```

## ローカルで動かす / テスト

```sh
python3 -m http.server 8000     # → http://localhost:8000/
npm ci && npm test              # E2E（Chromium は CHROMIUM_PATH で指定可）
```

## ライセンス / クレジット

MIT

ロゴ書体: [Archivo](https://github.com/Omnibus-Type/Archivo)（SIL Open Font License 1.1, © The Archivo Project Authors）をロゴの 7 文字だけに絞って `assets/fonts/archivo-logo.woff2` に同梱（約 4KB）。ライセンス文は `assets/fonts/ARCHIVO-OFL.txt`

同梱ライブラリ: [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2（MIT, © Vanilagy）— ライセンス文は `vendor/MP4-MUXER-LICENSE`。開発は終了しており後継は Mediabunny（MPL-2.0・約 670KB）だが、単一映像トラックの MP4 化には十分で小さい（約 69KB）ためこちらを採用。書き出し時にだけ読み込む
