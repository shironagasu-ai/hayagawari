// 曲（任意）: 選ぶ → テンポと拍を推定 → 試聴しながら確かめ、ずれていればタップや BPM の入力で直す。
// 曲はブラウザの中だけで扱い（解析も端末内）、このブラウザの保存領域にだけ残す。
import { decodeSong, toMono, analyzeTempo, gridFromAnalysis, gridWithBpm, gridShiftBar, applyTaps } from './music.js';
import { newKey, putSong } from './store.js';

const $ = (s) => document.querySelector(s);
const ANALYZE_SR = 22050; // テンポの解析はこの周波数で足りる
const ANALYZE_MAX = 180; // 先頭から何秒を解析するか（映像はこれより短い）
const MAX_BYTES = 80 * 1024 * 1024;
const TAP_RESET = 2.5; // この秒数タップが空いたら数え直す

/**
 * 今の曲。なければ null
 * { key, name, blob, url, duration, grid: { bpm, beat, first, bar }, auto: 推定そのままの grid, confidence, source: 'auto' | 'tap' | 'manual' }
 */
export const song = { cur: null };

const ui = { audio: null, raf: 0, taps: [], analyzing: 0, onChange: () => {}, toast: () => {} };

export function initSong({ onChange, toast }) {
  ui.onChange = onChange || ui.onChange;
  ui.toast = toast || ui.toast;
  $('#song-pick').addEventListener('click', () => $('#song-file').click());
  $('#song-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await setSongFile(f, f.name);
  });
  $('#song-clear').addEventListener('click', () => clearSong());
  $('#song-play').addEventListener('click', () => togglePreview());
  $('#song-bpm').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!song.cur || !(v >= 40 && v <= 240)) { syncUi(); return; }
    setGrid(gridWithBpm(song.cur.grid, v), 'manual');
  });
  $('#song-half').addEventListener('click', () => song.cur && song.cur.grid.bpm / 2 >= 40 && setGrid(gridWithBpm(song.cur.grid, song.cur.grid.bpm / 2), 'manual'));
  $('#song-double').addEventListener('click', () => song.cur && song.cur.grid.bpm * 2 <= 240 && setGrid(gridWithBpm(song.cur.grid, song.cur.grid.bpm * 2), 'manual'));
  $('#song-bar-prev').addEventListener('click', () => song.cur && setGrid(gridShiftBar(song.cur.grid, -1), song.cur.source === 'auto' ? 'manual' : song.cur.source));
  $('#song-bar-next').addEventListener('click', () => song.cur && setGrid(gridShiftBar(song.cur.grid, 1), song.cur.source === 'auto' ? 'manual' : song.cur.source));
  $('#song-reset').addEventListener('click', () => song.cur && setGrid(song.cur.auto, 'auto'));
  // タップ: 押した瞬間を使う（click は離したときなので遅れる）
  $('#song-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
  $('#song-tap').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.tagName === 'INPUT' || !previewing()) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); tap(); }
  });
  syncUi();
}

const previewing = () => !!(ui.audio && !ui.audio.paused);

/**
 * 曲を読み込んで解析する
 * @param {Blob} blob
 * @param {string} name 表示名（ファイル名）
 * @param {object} [saved] 保存しておいた設定（復元のとき。あれば解析し直さない）
 */
export async function setSongFile(blob, name, saved = null) {
  if (blob.size > MAX_BYTES) { ui.toast('曲のファイルが大きすぎます（80MB まで）'); return false; }
  const job = ++ui.analyzing;
  setStatus('曲を読み込んでいます…');
  $('#song-field').classList.add('loading');
  try {
    let duration, grid, confidence;
    if (saved && saved.grid && saved.auto && saved.duration) {
      ({ duration, grid, confidence } = saved);
    } else {
      const ab = await decodeSong(blob, ANALYZE_SR);
      if (job !== ui.analyzing) return false;
      duration = ab.duration;
      setStatus('テンポと拍を調べています…');
      const x = toMono(ab);
      const res = await analyze(x.subarray(0, Math.min(x.length, ANALYZE_MAX * ab.sampleRate)), ab.sampleRate);
      if (job !== ui.analyzing) return false;
      grid = gridFromAnalysis(res);
      confidence = res.confidence;
    }
    if (job !== ui.analyzing) return false;
    stopPreview();
    if (song.cur) URL.revokeObjectURL(song.cur.url);
    const key = saved && saved.key || newKey();
    song.cur = {
      key, name, blob, url: URL.createObjectURL(blob), duration, confidence,
      grid, auto: saved && saved.auto || grid, source: saved && saved.source || 'auto',
    };
    ui.taps = [];
    if (!saved) putSong(key, blob).catch((e) => console.warn('曲を保存できませんでした', e));
    syncUi();
    ui.onChange();
    return true;
  } catch (e) {
    console.warn(e);
    if (job === ui.analyzing) {
      ui.toast('この曲は読み込めませんでした（MP3 / AAC(M4A) / WAV / Ogg に対応）');
      syncUi();
    }
    return false;
  } finally {
    if (job === ui.analyzing) $('#song-field').classList.remove('loading');
  }
}

// 解析は Worker で（画面が固まらないように）。Worker が使えなければその場で
let worker = null, workerSeq = 0;
function analyze(x, sr) {
  try {
    if (!worker) worker = new Worker(new URL('./music-worker.js', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(analyzeTempo(x, sr));
  }
  const id = ++workerSeq;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMsg);
      worker.removeEventListener('error', onErr);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    const onErr = (e) => {
      // Worker を起動できなかった（module Worker 非対応など）: その場で解析する
      e.preventDefault && e.preventDefault();
      worker.removeEventListener('message', onMsg);
      worker.removeEventListener('error', onErr);
      worker.terminate();
      worker = null;
      try { resolve(analyzeTempo(x, sr)); } catch (err) { reject(err); }
    };
    worker.addEventListener('message', onMsg);
    worker.addEventListener('error', onErr);
    // Worker が落ちたときにその場で解析し直せるよう、波形は渡し切らずにコピーを送る
    worker.postMessage({ id, x: x.slice(), sr });
  });
}

export function clearSong() {
  ui.analyzing++;
  stopPreview();
  if (song.cur) URL.revokeObjectURL(song.cur.url);
  song.cur = null;
  ui.taps = [];
  putSong(null, null).catch(() => {});
  $('#song-field').classList.remove('loading');
  syncUi();
  ui.onChange();
}

function setGrid(grid, source) {
  song.cur.grid = grid;
  song.cur.source = source;
  syncUi();
  ui.onChange();
}

// 保存用（曲そのものは putSong で別に保存）
export function songMeta() {
  const s = song.cur;
  if (!s) return null;
  return { key: s.key, name: s.name, duration: s.duration, confidence: s.confidence, grid: s.grid, auto: s.auto, source: s.source };
}

// ---------------------------------------------------------------- タップ

function tap() {
  if (!song.cur) return;
  if (!previewing()) { togglePreview(); return; } // 止まっているときの最初のタップは再生だけ
  const t = ui.audio.currentTime;
  if (ui.taps.length && t - ui.taps[ui.taps.length - 1] > TAP_RESET) ui.taps = [];
  if (ui.taps.length && t <= ui.taps[ui.taps.length - 1]) ui.taps = []; // 巻き戻した
  ui.taps.push(t);
  $('#song-tap').classList.remove('hit');
  void $('#song-tap').offsetWidth; // アニメーションをやり直す
  $('#song-tap').classList.add('hit');
  if (ui.taps.length < 4) { setStatus(`タップ ${ui.taps.length} / 4 …拍に合わせて続けてください`); return; }
  const g = applyTaps(song.cur.grid, ui.taps.slice(-16));
  if (g) setGrid(g, 'tap');
}

// ---------------------------------------------------------------- 試聴と拍の表示

function togglePreview() {
  if (!song.cur) return;
  if (previewing()) { stopPreview(); return; }
  if (!ui.audio) {
    ui.audio = new Audio();
    ui.audio.preload = 'auto';
    ui.audio.addEventListener('ended', () => stopPreview());
  }
  if (ui.audio.src !== song.cur.url) ui.audio.src = song.cur.url;
  ui.taps = [];
  ui.audio.play().then(() => {
    $('#song-play').textContent = '■ 停止';
    $('#song-field').classList.add('playing');
    cancelAnimationFrame(ui.raf);
    ui.raf = requestAnimationFrame(lamp);
  }).catch((e) => { console.warn(e); ui.toast('再生できませんでした'); });
}

export function stopPreview() {
  if (ui.audio && !ui.audio.paused) ui.audio.pause();
  cancelAnimationFrame(ui.raf);
  $('#song-play').textContent = '▶ 試聴';
  $('#song-field').classList.remove('playing');
  for (const el of document.querySelectorAll('#song-lamp i')) el.style.opacity = '';
  if (song.cur) updateTime(ui.audio ? ui.audio.currentTime : 0);
}

// 4 つの丸: 今が小節の何拍目か（左端が小節の頭）。拍の瞬間に光り、すぐ暗くなる
function lamp() {
  if (!previewing() || !song.cur) return;
  const t = ui.audio.currentTime;
  const { beat, first, bar } = song.cur.grid;
  const n = Math.floor((t - first) / beat + 1e-4);
  const frac = (t - first) / beat - n;
  const pos = (((n - bar) % 4) + 4) % 4;
  const lit = t >= first - 0.02 ? Math.exp(-frac * 5) : 0;
  document.querySelectorAll('#song-lamp i').forEach((el, i) => { el.style.opacity = i === pos ? String(0.25 + 0.75 * lit) : '0.18'; });
  updateTime(t);
  ui.raf = requestAnimationFrame(lamp);
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateTime(t) {
  if (song.cur) $('#song-time').textContent = `${fmt(t)} / ${fmt(song.cur.duration)}`;
}

// ---------------------------------------------------------------- 表示

function setStatus(msg) { $('#song-hint').textContent = msg; }

function syncUi() {
  const s = song.cur;
  $('#song-panel').hidden = !s;
  $('#song-clear').hidden = !s;
  $('#song-pick').textContent = s ? '♪ 曲を変える' : '♪ 曲を選ぶ';
  $('#song-name').textContent = s ? s.name : '未選択（映像だけで再生します）';
  $('#song-name').title = s ? s.name : '';
  if (!s) { setStatus(''); return; }
  if (document.activeElement !== $('#song-bpm')) $('#song-bpm').value = s.grid.bpm.toFixed(1);
  $('#song-reset').disabled = s.source === 'auto';
  updateTime(ui.audio && ui.audio.src === s.url ? ui.audio.currentTime : 0);
  const conf = s.confidence >= 0.6 ? '高' : s.confidence >= 0.35 ? '中' : '低';
  const how = { auto: `自動で推定（確からしさ: ${conf}）`, tap: 'タップで合わせた値', manual: '手で直した値' }[s.source];
  setStatus(`${s.grid.bpm.toFixed(1)} BPM ・ ${how}。試聴して丸の点滅が拍とずれていたら、拍に合わせて T キー（または「タップ」）を 4 回以上。小節の頭（左端の丸）は ← → で直せます。`);
}
