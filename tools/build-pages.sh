#!/usr/bin/env bash
# GitHub Pages に載せるサイトを _site/ に組み立てる（.github/workflows/pages.yml から実行）。
#   _site/          … main の「テストが通った最新のコミット」
#   _site/pr/<N>/   … 開いている PR（同じリポジトリのブランチのもの）の最新コミット。マージ前の確認用
# PR のコードは実行しない（git archive でファイルを取り出して置くだけ）。
# 出力: previews.txt（「PR番号 コミット」を 1 行ずつ。PR へのコメント用）
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
FILES=(index.html src vendor assets LICENSE)
OUT=_site
rm -rf "$OUT" previews.txt
mkdir -p "$OUT"
: > previews.txt

# $1: コミット  $2: 置き場所  $3: 表示用の日付
stage() {
  local sha="$1" dest="$2" tmp
  tmp="$(mktemp -d)"
  git archive "$sha" | tar -x -C "$tmp"
  mkdir -p "$dest"
  for f in "${FILES[@]}"; do
    if [ -e "$tmp/$f" ]; then cp -r "$tmp/$f" "$dest/"; fi
  done
  rm -rf "$tmp"
  # バージョン表記に公開したコミットと日付を入れる（古いコミットで version.js が無ければ何もしない）
  if [ -f "$dest/src/version.js" ]; then
    sed -i "s/commit: 'dev', date: ''/commit: '${sha::7}', date: '$(git log -1 --format=%cs "$sha")'/" "$dest/src/version.js"
  fi
}

# main: テストが通った最新のコミット（通っていないコミットは公開しない）
MAIN_SHA="$(gh run list -R "$REPO" --workflow ci.yml --branch main --event push --status success -L 1 --json headSha -q '.[0].headSha')"
if [ -z "$MAIN_SHA" ]; then
  echo "main でテストが通ったコミットが見つからない" >&2
  exit 1
fi
git fetch --no-tags --quiet origin "$MAIN_SHA"
stage "$MAIN_SHA" "$OUT"
echo "main: ${MAIN_SHA::7}"

# 開いている PR（フォークからの PR は載せない）
gh pr list -R "$REPO" --state open --limit 50 --json number,headRefOid,isCrossRepository \
  -q '.[] | select(.isCrossRepository | not) | "\(.number) \(.headRefOid)"' |
while read -r num sha; do
  if ! git fetch --no-tags --quiet origin "+refs/pull/${num}/head:refs/remotes/pr/${num}"; then
    echo "PR #$num を取得できないので飛ばす" >&2
    continue
  fi
  stage "$sha" "$OUT/pr/$num"
  # プレビューは検索に載せない
  sed -i 's#<head>#<head>\n<meta name="robots" content="noindex">#' "$OUT/pr/$num/index.html"
  echo "$num $sha" >> previews.txt
  echo "PR #$num: ${sha::7}"
done

touch "$OUT/.nojekyll"
