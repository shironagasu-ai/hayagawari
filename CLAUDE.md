# CLAUDE.md

## コミット / PR の書式

- コミットメッセージと PR 本文に `Co-Authored-By:` 行・`Claude-Session:` 行・セッション URL・「Generated with Claude Code」等の帰属表記を付けない

## バージョン

- 機能追加・修正の PR では `CHANGELOG.md` の `## [Unreleased]` に変更を書く
- リリースする PR では `src/version.js`・`package.json`（`npm version X.Y.Z --no-git-tag-version`）・`CHANGELOG.md` をそろえて上げる（決め方は README の「バージョン管理」）。`node tools/check-version.mjs` で確認できる
