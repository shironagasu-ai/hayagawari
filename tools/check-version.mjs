// バージョンの整合チェックとリリースノートの取り出し。リポジトリルートで:
//   node tools/check-version.mjs          … src/version.js・package.json・CHANGELOG.md がそろっているか確認（CI で実行）
//   node tools/check-version.mjs --print  … バージョン番号だけを出力
//   node tools/check-version.mjs --notes  … CHANGELOG.md から現在のバージョンの節を出力（GitHub Release の本文用）
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const m = read('src/version.js').match(/export const VERSION = '([^']+)'/);
const version = m && m[1];
const pkg = JSON.parse(read('package.json')).version;
const changelog = read('CHANGELOG.md');

// 「## [1.2.3] - 2026-09-26」の節（次の「## [」まで）
function section(v) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').replace(/\n\[[^\]]+\]: .*$/gm, '').trim();
}

const args = process.argv.slice(2);
if (args.includes('--print')) { console.log(version); process.exit(0); }
if (args.includes('--notes')) { console.log(section(version) || ''); process.exit(0); }

const errors = [];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) errors.push(`src/version.js の VERSION が SemVer ではありません: ${version}`);
if (pkg !== version) errors.push(`package.json の version (${pkg}) が src/version.js (${version}) と違います`);
const notes = section(version);
if (notes === null) errors.push(`CHANGELOG.md に「## [${version}]」の節がありません`);
else if (!notes) errors.push(`CHANGELOG.md の ${version} の節が空です`);
if (/^## \[Unreleased\]/m.test(changelog) === false) errors.push('CHANGELOG.md に「## [Unreleased]」の節がありません（次の変更を書く場所）');

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ v${version}（src/version.js・package.json・CHANGELOG.md が一致）`);
