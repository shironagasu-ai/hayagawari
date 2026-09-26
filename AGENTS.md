# AGENTS.md — HAYAGAWARI の開発ガイド

このリポジトリで作業する人（とコーディングエージェント）向けの決まりごと・コマンド・構成です。使い方は [README](README.md)、設計の詳細は [docs/design.md](docs/design.md)、今後の予定は [docs/roadmap.md](docs/roadmap.md)。

## プロジェクトの概要

- イラストの注目点を解析し、シードごとに違う演出のポートフォリオ映像を作る Web サービス
- **ビルド不要・静的ファイルのみ**（GitHub Pages でそのまま動く）。バンドラーやトランスパイラは使わない。ブラウザの ES Modules をそのまま読む
- **外部 CDN に依存しない**。ライブラリは `vendor/` にバージョンを固定して同梱する
- **画像はブラウザ内で処理し、どこにも送信しない**。外部への通信（解析 API・計測など）を足さない
- WebGL2 の自前レンダラーで 60fps 前提。1 フレームの JS 側コストは約 0.3〜0.5ms、描画は数十ドローコール＋フルスクリーン 3 パス

## コマンド

```sh
python3 -m http.server 8000     # ローカルで開く → http://localhost:8000/
npm ci                          # テストの依存（Playwright）
npm test                        # E2E（tests/e2e.mjs）。Chromium の実体は CHROMIUM_PATH で指定できる
node tools/check-version.mjs    # src/version.js・package.json・CHANGELOG.md のバージョンが一致しているか
```

- E2E のスクリーンショット・見本シート（`sheet-*.png`。縦長は `*-9x16.png`）・書き出した動画は `tests/output/` に出る（git には入れない）
- 変更したら `npm test` が全件通ることを確認してからプッシュする

## 構成

```
index.html          … UI（編集画面・プレイヤー・演出カタログ）
src/main.js         … UI の配線・メインループ・書き出しダイアログ
src/director.js     … シードから映像の設計図を作り、時刻 t の絵を描く（演出の抽選・つなぎ・HUD）
src/fx/             … 演出そのもの（themes / openers / closers / variants / transitions / decors / palettes、共通部品 bookend-kit）
src/fx/labels.js    … 演出の表示名と説明（カタログと詳細設定のボタンに使う）
src/catalog.js      … 演出カタログ（#catalog）
src/kit.js          … 演出共通の部品（注目点・画像カメラ・文字配置・レイアウト）
src/gl.js           … WebGL2 レンダラー（マスク・方向ブラー・トランジション合成・ポスト）
src/analyze.js      … 注目点検出（顕著性マップ）とパレット抽出
src/focal-editor.js … 注目点エディタ
src/export.js       … 1 コマずつの書き出し（WebCodecs → MP4。音声を入れる仕組みもあるが v1.0.0 では使っていない）
src/store.js        … 作業の保存（IndexedDB）
src/music.js        … 曲の解析（テンポ・拍・小節の頭の推定、タップでの補正。decodeSong 以外は DOM を使わず Node でも動く）
src/music-worker.js … 曲の解析を Worker で動かす入口
src/song.js         … 曲の欄の UI（選ぶ・試聴・手直し・保存）
src/version.js      … バージョン・ビルド情報・プレビュー判定・保存キー
src/text.js         … 文字のテクスチャ化
src/ease.js         … イージング（タメツメ用の cubic-bezier / 予備動作付き加速など）
src/rng.js          … シード付き乱数
src/samples.js      … サンプル画像（assets/samples/）の一覧・タイトル・注目点
vendor/             … 同梱ライブラリ（mp4-muxer 5.2.2・MIT）
tools/              … 公開の組み立て・作例動画の生成・バージョン確認
tests/e2e.mjs       … Playwright による E2E テスト
```

## 実装の決まり

- **演出はすべて「時刻 → 絵」の純関数**。ランダムな決定は映像を組み立てるときに済ませ、描画中に乱数を引かない（`Math.random` を使わず、渡された `rng` を使う）。シーク・ループ・書き出しで結果がぶれないようにするため
- カットは BPM の拍頭に置き、動きは「溜めて（ほぼ静止か微速ドリフト）→ 数フレームで詰める → ピタッと止める」（`src/ease.js` の `snap` / `antic` など）
- 描画は既存の部品（`r.draw` のマスク・網点・リング・カメラ、`kit.js` の注目点・画像カメラ）で組む。1 コマあたりの描画命令は 600 未満
- 16:9・9:16・1:1 のどれでも崩れないようにする
- コメントと UI の文言は日本語。周りのコードの書き方に合わせる

### 演出を足すとき

1. `src/fx/<カテゴリ>.js` に実装する（オープニングなら `openers.js` の `OPENERS` にキーを足す）
2. `src/fx/labels.js` に表示名と説明を足す（抜けているとテストが落ちる）
3. `npm test` で自動確認される: 描ける（真っ黒・単色にならない）／説明がある／描画命令が 600 未満。見本シートを目で確認する
4. PR のプレビューの演出カタログ（`#catalog=<カテゴリ>`）で動きを確認する

オープニング・エンディングの詳細設定のボタンと演出カタログは、登録されている演出から自動で作られる。

## バージョン管理

[セマンティック バージョニング](https://semver.org/lang/ja/)（`MAJOR.MINOR.PATCH`）。変更の記録は [CHANGELOG.md](CHANGELOG.md)（[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の書式）。

| 上げる桁 | いつ | 例 |
|---|---|---|
| MAJOR | 保存した作業が読めなくなる・URL の設定の意味が変わる・使い方が大きく変わる | 保存形式の作り直し、設定項目の廃止 |
| MINOR | 機能・演出・スタイルの追加 | オープニングの追加、新しい設定 |
| PATCH | 不具合の修正・見た目の微調整 | 表示崩れ、書き出しの修正 |

同じシードで同じ映像になるのは同じバージョンの中だけ。演出の候補が増える MINOR 以上の更新では、共有された URL でも以前と違う映像になることがある（CHANGELOG に明記する）。

**リリースの手順**

1. PR で `src/version.js` の `VERSION`・`package.json` の `version`（`npm version X.Y.Z --no-git-tag-version` で lock も一緒に更新）・`CHANGELOG.md`（`## [Unreleased]` の中身を `## [X.Y.Z] - 日付` に移す）をそろえる。CI の「Version check」で一致を確認する
2. main にマージすると、テスト → Pages 公開 → **タグ `vX.Y.Z` と GitHub Release の作成**（本文は CHANGELOG の該当の節）まで自動で行う。バージョンを上げていないマージでは公開だけ行い、リリースは作らない
3. サイトではトップの「PORTFOLIO MOTION GENERATOR」の横と、ページ下部に `vX.Y.Z ・ コミット ・ 日付` を表示する（コミットと日付は公開時に CI が書き込む。ローカルでは「開発版」）

**大きな版（統合ブランチ）**

v1.0.0 のように複数の PR にまたがる版は、途中の状態を本番に出さないよう統合ブランチ（例: `release/v1.0.0`）に集めてから main へ入れる。

- 各機能の PR は統合ブランチ向けに作る（CI と PR のプレビューは宛先に関係なく動く）
- 統合ブランチ → main の PR を下書きで開いておき、そのプレビューで全体を確認する
- 本番の不具合は main に直接直して PATCH で出し、統合ブランチにも取り込む
- 最後の PR でバージョンを上げ、統合ブランチの PR を main にマージするとリリースされる

## コミットと PR

- 機能追加・修正の PR では `CHANGELOG.md` の `## [Unreleased]` に変更を書く（利用者に伝わる言葉で）
- コミットメッセージと PR 本文に `Co-Authored-By:` 行・`Claude-Session:` 行・セッション URL・「Generated with Claude Code」等の帰属表記を付けない
- PR には自動でプレビューの URL がコメントされる。マージ前にプレビューで動きを確認する
- 利用者から見える変更（UI・演出）は、スクリーンショットか見本シートで確認してから出す

## 自動テストと公開（GitHub Actions）

| ワークフロー | いつ | 何を |
|---|---|---|
| `ci.yml`（CI） | PR・main へのプッシュ | バージョンの一致確認と E2E テスト（Playwright の Chromium と一般配布の Google Chrome。Chrome では H.264 の書き出しと作例動画の再生も確認）。スクリーンショットと書き出した動画は実行結果の Artifacts から 7 日間ダウンロードできる |
| `pages.yml`（Pages） | CI が通るたび・PR を閉じたとき | サイト全体を組み立てて GitHub Pages に公開（下記）。main でバージョンが上がっていればタグ `vX.Y.Z` と GitHub Release を作る |

**公開される場所**

- 本番: https://shironagasu-ai.github.io/hayagawari/ … main で**テストが通った最新のコミット**
- **PR のプレビュー**: `https://shironagasu-ai.github.io/hayagawari/pr/<PR番号>/` … 開いている PR の最新のコミット。URL は PR にコメントされる（プッシュのたびに更新）。画面右上に黄色の `PREVIEW ・ PR #番号` が出る
  - プレビューは本番と同じドメインなので、保存した作業（IndexedDB・localStorage）は名前を分けてあり、本番の作業には触らない
  - 同じリポジトリのブランチからの PR だけ載せる（フォークからの PR は載せない）。PR を閉じると消える。検索エンジンには載せない（noindex）
  - PR のコードは Pages の組み立て中に実行しない（ファイルを取り出して置くだけ）
- `tools/build-pages.sh` が組み立てを行う（公開するのは `index.html` / `src` / `vendor` / `assets` / `LICENSE` のみ）
- 事前設定: Settings → Pages → Build and deployment → Source を **GitHub Actions** にする（設定済み）

## 素材

### サンプル画像・作例（MIT の対象外）

`assets/samples/`・`assets/hero/`・`docs/media/preview.webp` のイラストは作者が権利を保持している（詳細は [`assets/samples/NOTICE.md`](assets/samples/NOTICE.md)）。デモ表示以外に使わない・ほかの場所へコピーしない・学習データや外部サービスに渡さない。

- サンプルの一覧・タイトル・見本の注目点は `src/samples.js`。画像は WebP で `assets/samples/` に置く

### トップの作例動画

トップ画面の背景で流れる動画は `assets/hero/` にある。縦長の画面では `hero-9x16`、それ以外は `hero-16x9` を使う（各 `.mp4` と、読み込み前・動きを減らす設定用のポスター画像 `.jpg`）。

- HAYAGAWARI 自身の描画から作る。作り直すとき（イラストを差し替えるとき）は:

  ```sh
  FFMPEG=/path/to/ffmpeg node tools/make-hero.mjs --images ./my-illustrations --name HAYAGAWARI --sub PORTFOLIO --link shironagasu-ai.github.io/hayagawari --seed HERO-01
  ```

  `--images` を省くとサンプル画像（`assets/samples/` の全点）で作る。libx264 入りの ffmpeg が必要（`pip install imageio-ffmpeg` で入る静的ビルドでも可）
- iPhone を含めて自動再生できるよう **H.264・音声なし**。解像度は 1280×720 / 720×1280、9 作品・約 45 秒で 1 本 3.5MB 前後（`--crf` で調整）
- 画面外・映像の再生中・タブ非表示のときは止める。「動きを減らす」設定ではポスター画像のみ
- 作例のクレジット表記は `index.html` の `#hero-credit`

README 冒頭のプレビュー（`docs/media/preview.webp`、アニメーション WebP）は横長動画の冒頭 16 秒を 720px・20fps にしたもの。GitHub の README はリポジトリ内の MP4 をその場で再生できないため画像にしている。作り直すとき:

```sh
ffmpeg -t 16 -i assets/hero/hero-16x9.mp4 -vf "fps=20,scale=720:-1:flags=lanczos" -c:v libwebp_anim -quality 55 -compression_level 6 -loop 0 docs/media/preview.webp
```

### 同梱ライブラリ・書体

- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2（MIT）を `vendor/` に同梱。開発は終了しており後継は Mediabunny（MPL-2.0・約 670KB）だが、単一映像トラックの MP4 化には十分で小さい（約 69KB）ためこちらを採用。書き出し時にだけ読み込む
- ロゴ書体 [Archivo](https://github.com/Omnibus-Type/Archivo)（SIL OFL 1.1）はロゴの 7 文字だけに絞って `assets/fonts/archivo-logo.woff2` に同梱（約 4KB）
