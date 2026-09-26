// アプリのバージョン（SemVer）。リリースするときはここ・package.json・CHANGELOG.md をそろえて上げる（CI で一致を確認）
export const VERSION = '0.9.1';
// デプロイ時に CI がコミットと日付を書き込む。ローカルでは 'dev'
export const BUILD = { commit: 'dev', date: '' };

// PR のプレビュー（/pr/<番号>/ に公開）なら PR 番号。本番は null
export const PREVIEW = (typeof location !== 'undefined' && (location.pathname.match(/\/pr\/(\d+)\//) || [])[1]) || null;
// プレビューは本番と同じオリジンなので、保存先（IndexedDB・localStorage）の名前を分けて本番の作業を触らない
export const storageKey = (k) => (PREVIEW ? `pr${PREVIEW}:${k}` : k);
