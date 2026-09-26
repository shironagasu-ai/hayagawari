// 作業内容の保存（IndexedDB）。タブが破棄されたり閉じたりしても、次に開いたときに元どおりにする。
// 保存先はこのブラウザの中だけ（どこにも送信しない）。
//   kv/"session"   … 設定と作品の並び・タイトル・注目点（小さい。変更のたびに書き直す）
//   img/<key>      … 画像そのもの（Blob。作品を追加したときに 1 回だけ書く）
//   kv/"song"      … 持ち込んだ曲（{ key, blob }。選んだときに 1 回だけ書く。拍の設定は session の方に入る）

import { PREVIEW } from './version.js';

const DB_NAME = PREVIEW ? `hayagawari-pr${PREVIEW}` : 'hayagawari';
const VERSION = 1;
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB がありません')); return; }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('img')) db.createObjectStore('img');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}
const reqp = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function putImage(key, blob) {
  return tx(['img'], 'readwrite', (t) => { t.objectStore('img').put(blob, key); });
}

// 曲を保存する（null で消す）
export function putSong(key, blob) {
  return tx(['kv'], 'readwrite', (t) => {
    const kv = t.objectStore('kv');
    if (blob) kv.put({ key, blob }, 'song');
    else kv.delete('song');
  });
}

// 設定と作品の一覧を書き、今ある作品のどれにも使われていない画像を消す
// liveKeys: 消す直前に「今ある作品」を聞く（保存中に追加された作品の画像を消さないため）
export function saveSession(session, liveKeys = () => session.works.map((w) => w.key)) {
  return tx(['kv', 'img'], 'readwrite', async (t) => {
    t.objectStore('kv').put(session, 'session');
    const imgs = t.objectStore('img');
    const all = await reqp(imgs.getAllKeys());
    const used = new Set(liveKeys());
    for (const k of all) if (!used.has(k)) imgs.delete(k);
  });
}

// 保存済みの作業を読む。作品は画像つきで返す。どの作品にも使われていない画像はここで消す
export async function loadSession() {
  return tx(['kv', 'img'], 'readwrite', async (t) => {
    const session = await reqp(t.objectStore('kv').get('session'));
    const imgs = t.objectStore('img');
    const keys = await reqp(imgs.getAllKeys());
    const used = new Set((session && session.works || []).map((w) => w.key));
    for (const k of keys) if (!used.has(k)) imgs.delete(k);
    if (!session) return null;
    const works = [];
    for (const w of session.works || []) {
      const blob = await reqp(imgs.get(w.key));
      if (blob) works.push({ ...w, blob });
    }
    // 曲: 設定と中身の key がそろっているときだけ
    let song = null;
    if (session.song) {
      const stored = await reqp(t.objectStore('kv').get('song'));
      if (stored && stored.key === session.song.key && stored.blob) song = { ...session.song, blob: stored.blob };
    }
    return { ...session, works, song };
  });
}

export function clearSession() {
  return tx(['kv', 'img'], 'readwrite', (t) => { t.objectStore('kv').clear(); t.objectStore('img').clear(); });
}

// ブラウザの判断で消されにくくする（許可されなくても動作は同じ）
export function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* 非対応 */ }
}
