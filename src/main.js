// UI とメインループ。
import { Renderer } from './gl.js';
import { TextFactory } from './text.js';
import { analyzeImage } from './analyze.js';
import { buildFilm } from './director.js';
import { makeSamples } from './samples.js';
import { randomSeed, createRng } from './rng.js';
import { initFocalEditor, openFocalEditor } from './focal-editor.js';
import { pickEncoderConfig, pickAudioConfig, exportFrames } from './export.js';
import { AudioEngine, buildScore, renderScoreOffline, SOUND_MODES, SOUND_LABELS } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#gl');
const body = document.body;

const ASPECTS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

let renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  document.body.innerHTML = `<p style="padding:40px;font-family:sans-serif;color:#fff">このブラウザでは WebGL2 が使えないため動作しません。<br>${e.message}</p>`;
  throw e;
}
const tf = new TextFactory(renderer);
const audio = new AudioEngine();

const state = {
  works: [], // analyzeImage の結果 + id
  seed: '',
  aspect: '16:9',
  pace: 'normal',
  style: 'auto',
  order: 'keep',
  opener: 'auto',
  closer: 'auto',
  sound: 'full', // 'full' ビート＋効果音 / 'sfx' 効果音のみ / 'off'
  advOpen: false, // 詳細設定アコーディオンの開閉（作品ごとのタイトル・注目点編集もこれに連動）
  film: null,
  t: 0,
  playing: false,
  dirty: true,
  loop: true,
};
let nextId = 1;

// ---------------------------------------------------------------- URL ハッシュ（シード等の共有）

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.seed = (h.get('seed') || randomSeed()).toUpperCase();
  if (ASPECTS[h.get('aspect')]) state.aspect = h.get('aspect');
  if (['tight', 'normal', 'relaxed'].includes(h.get('pace'))) state.pace = h.get('pace');
  if (h.get('style')) state.style = h.get('style');
  if (['keep', 'shuffle'].includes(h.get('order'))) state.order = h.get('order');
  if (h.get('opener')) state.opener = h.get('opener');
  if (h.get('closer')) state.closer = h.get('closer');
  return h.get('adv') === '1'; // 詳細設定を開いた状態で作った映像の URL
}
function writeHash() {
  // 閉じている（おまかせ）ときは詳細設定を URL に載せない。開いているときは再現用に全部載せる
  const h = new URLSearchParams(state.advOpen
    ? { adv: '1', seed: state.seed, aspect: state.aspect, pace: state.pace, style: state.style, order: state.order, opener: state.opener, closer: state.closer }
    : { seed: state.seed, aspect: state.aspect });
  history.replaceState(null, '', '#' + h.toString());
}

// ---------------------------------------------------------------- 編集 UI

const segSyncs = [];
function bindSeg(id, key) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state[key]));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = b.dataset.v;
    sync();
    state.film = null;
    updateAdvSummary();
  });
  segSyncs.push(sync);
  sync();
}

// ---------------------------------------------------------------- 詳細設定（アコーディオン）

const ADV_DEFAULTS = { pace: 'normal', style: 'auto', opener: 'auto', closer: 'auto', order: 'keep' };
const ADV_NAMES = { pace: 'テンポ', style: 'スタイル', opener: 'オープニング', closer: 'エンディング', order: '並び順' };

// 詳細設定は開いている間だけ反映。閉じている間はすべておまかせ（再生のたびに新しいシード）
function changedAdv() {
  return Object.keys(ADV_DEFAULTS).filter((k) => state[k] !== ADV_DEFAULTS[k]);
}

function updateAdvSummary() {
  const changed = changedAdv();
  const el = $('#adv-sum');
  const list = changed.map((k) => {
    const btn = document.querySelector(`#${k} button[data-v="${state[k]}"]`);
    return `${ADV_NAMES[k]} ${btn ? btn.textContent : state[k]}`;
  }).join('・');
  if (!state.advOpen) el.textContent = 'オフ ・ すべておまかせ（再生のたびにランダム）';
  else el.textContent = changed.length ? `反映中: ${list}` : 'オン ・ まだ変更なし';
  el.classList.toggle('changed', state.advOpen && changed.length > 0);
  $('#adv-reset').hidden = !state.advOpen || changed.length === 0;
}

function setAdvOpen(open) {
  state.advOpen = !!open;
  const d = $('#adv');
  if (d.open !== state.advOpen) d.open = state.advOpen;
  body.classList.toggle('adv-open', state.advOpen);
  try { localStorage.setItem('hg-adv', state.advOpen ? '1' : '0'); } catch { /* 保存できなくても動作に影響なし */ }
  state.film = null;
  updateAdvSummary();
  renderWorks();
}

function resetAdv() {
  Object.assign(state, ADV_DEFAULTS);
  segSyncs.forEach((f) => f());
  state.film = null;
  updateAdvSummary();
  renderWorks();
}

function renderWorks() {
  const box = $('#works');
  box.innerHTML = '';
  state.works.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'work';
    el.draggable = true;
    el.dataset.id = w.id;
    const pts = w.focal.map((f, k) => `<span class="pt ${k === 0 ? 'p0' : ''} ${f.manual ? 'manual' : ''}" style="left:${f.x * 100}%;top:${f.y * 100}%">${k + 1}</span>`).join('');
    el.innerHTML = `
      <div class="thumb" style="background-image:url(${w.thumb})"><div class="ptbox" style="position:absolute;inset:0"></div></div>
      <span class="grip">⠿ ${String(i + 1).padStart(2, '0')}</span>
      <button class="x" title="削除">✕</button>
      <div class="meta"><input class="title" value="" autocomplete="off" maxlength="40" spellcheck="false"></div>`;
    el.querySelector('input.title').value = w.title;
    // サムネイルは contain 表示なので、画像の実表示領域に点を合わせる
    const thumb = el.querySelector('.thumb');
    const ptbox = el.querySelector('.ptbox');
    const a = w.aspect;
    if (a >= 1) { ptbox.style.top = `${(1 - 1 / a) * 50}%`; ptbox.style.bottom = `${(1 - 1 / a) * 50}%`; }
    else { ptbox.style.left = `${(1 - a) * 50}%`; ptbox.style.right = `${(1 - a) * 50}%`; }
    ptbox.innerHTML = pts;
    thumb.addEventListener('click', () => { if (state.advOpen) openFocalEditor(w, () => { state.film = null; renderWorks(); }); });
    el.querySelector('.x').addEventListener('click', () => removeWork(w.id));
    el.querySelector('input.title').addEventListener('input', (e) => { w.title = e.target.value || 'UNTITLED'; state.film = null; });
    el.addEventListener('dragstart', (e) => { el.classList.add('dragging'); e.dataTransfer.setData('text/x-work', String(w.id)); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-work')) { e.preventDefault(); el.classList.add('dropbefore'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dropbefore'));
    el.addEventListener('drop', (e) => {
      const id = Number(e.dataTransfer.getData('text/x-work'));
      el.classList.remove('dropbefore');
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      const from = state.works.findIndex((x) => x.id === id);
      const [m] = state.works.splice(from, 1);
      const to = state.works.findIndex((x) => x.id === w.id);
      state.works.splice(to, 0, m);
      state.film = null;
      renderWorks();
    });
    box.appendChild(el);
  });
  const n = state.works.length;
  $('#works-hint').hidden = n === 0;
  $('#go').disabled = n === 0;
  $('#go-hint').textContent = n === 0 ? 'まずイラストを追加してください' : `${n} 枚 ・ 約 ${estimateDuration()} 秒`;
}

function estimateDuration() {
  const beats = { tight: 6, normal: 8, relaxed: 10 }[effectiveSettings().pace];
  return Math.round((6 + state.works.length * beats + 8) * (60 / 124));
}

function removeWork(id) {
  const i = state.works.findIndex((w) => w.id === id);
  if (i < 0) return;
  const [w] = state.works.splice(i, 1);
  if (w.tex) renderer.deleteTexture(w.tex);
  state.film = null;
  renderWorks();
}

async function addSources(list) {
  body.classList.add('busy');
  try {
    for (const { src, name } of list) {
      try {
        const w = await analyzeImage(src, name);
        w.id = nextId++;
        w.autoTitle = w.title;
        state.works.push(w);
      } catch (e) {
        console.warn(e);
        toast(`読み込めませんでした: ${name}`);
      }
    }
  } finally {
    body.classList.remove('busy');
  }
  state.film = null;
  renderWorks();
}

function addFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  addSources(imgs.map((f) => ({ src: f, name: f.name })));
}

// ---------------------------------------------------------------- 映像の生成

// 生成に使う設定。閉じている間は詳細設定・手動のタイトル/注目点を使わず、既定（おまかせ）で作る
function effectiveSettings() {
  return state.advOpen ? { ...state } : { ...state, ...ADV_DEFAULTS };
}

function build() {
  if (!state.works.length) return null;
  tf.dispose();
  for (const w of state.works) if (!w.tex) w.tex = renderer.createTexture(w.source);
  const [W, H] = ASPECTS[state.aspect];
  const S = effectiveSettings();
  let works = state.advOpen ? state.works : state.works.map((w) => ({ ...w, title: w.autoTitle, focal: w.autoFocal.map((f) => ({ ...f })) }));
  if (S.order === 'shuffle') works = createRng('order|' + state.seed).shuffle(works);
  const t0 = performance.now();
  state.film = buildFilm({
    works, seed: state.seed, W, H, tf, pace: S.pace,
    theme: S.style === 'auto' ? null : S.style,
    opener: S.opener === 'auto' ? null : S.opener,
    closer: S.closer === 'auto' ? null : S.closer,
    variant: state.variant || null,
    artist: $('#artist').value.trim(), subline: $('#subline').value.trim(), handle: $('#handle').value.trim(),
  });
  state.buildMs = performance.now() - t0;
  refreshScore();
  resize();
  renderMarks();
  $('#i-style').textContent = state.film.theme;
  $('#i-bpm').textContent = state.film.bpm;
  $('#i-seed').textContent = state.seed;
  writeHash();
  state.dirty = true;
  return state.film;
}

// ---------------------------------------------------------------- 音

function refreshScore() {
  if (!state.film) return;
  state.score = buildScore(state.film, state.seed, state.sound);
  audio.setScore(state.score, state.seed);
}

// 再生位置が飛んだとき（再生開始・シーク・ループ）に音を合わせ直す
function syncAudio() {
  if (state.playing && state.sound !== 'off') audio.start(state.t);
  else audio.stop();
}

const SOUND_ICON = { full: '🔊', sfx: '🔉', off: '🔇' };
function setSound(mode) {
  state.sound = SOUND_MODES.includes(mode) ? mode : 'full';
  try { localStorage.setItem('hg-sound', state.sound); } catch { /* 保存できなくても動作に影響なし */ }
  const b = $('#snd');
  b.textContent = `${SOUND_ICON[state.sound]} ${SOUND_LABELS[state.sound]}`;
  b.classList.toggle('muted', state.sound === 'off');
  refreshScore();
  syncAudio();
}

function play(fromStart = true) {
  if (!state.film) build();
  if (!state.film) return;
  if (fromStart) state.t = 0;
  audio.unlock(); // ユーザー操作の中で音を許可
  state.playing = true;
  body.classList.add('playing');
  $('#play').textContent = '❚❚';
  syncAudio();
  poke();
}

function pause() {
  state.playing = false;
  audio.stop();
  $('#play').textContent = '▶';
  state.dirty = true;
}

function toEditor() {
  pause();
  body.classList.remove('playing');
  if (document.fullscreenElement) document.exitFullscreen();
}

function reroll() {
  state.seed = randomSeed();
  $('#seed').value = state.seed;
  build();
  play(true);
  toast(`${state.film.theme} ・ ${state.film.bpm} BPM ・ ${state.seed}`);
}

// ---------------------------------------------------------------- 表示サイズ

// fullScale > 0: 画面サイズに関係なく「仮想解像度 × fullScale」で描く（書き出し用。2 で 4K）
function resize(fullScale = 0) {
  const [W, H] = ASPECTS[state.aspect];
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * k), cssH = Math.floor(H * k);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = fullScale > 0 ? fullScale : Math.min(1, (cssW * dpr) / W);
  renderer.setSize(W, H, Math.max(2, Math.round(W * s)), Math.max(2, Math.round(H * s)));
  state.dirty = true;
}

function renderMarks() {
  const seek = $('#seek');
  seek.querySelectorAll('.mark').forEach((m) => m.remove());
  const f = state.film;
  for (const s of f.segments.slice(1)) {
    const m = document.createElement('div');
    m.className = 'mark';
    m.style.left = `${(s.start / f.duration) * 100}%`;
    seek.appendChild(m);
  }
}

// ---------------------------------------------------------------- メインループ

const perf = { frames: 0, acc: 0, fps: 0, jsMs: 0, worst: 0, lastReport: 0 };
let last = performance.now();
let rafId = 0;
const audioClock = { last: -1 }; // 音声の時計が止まっている環境（出力先なし等）を見分ける

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function frame(now) {
  rafId = 0;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); // rAF の時刻は poke 時点より前のことがある
  last = now;
  const f = state.film;
  if (f) {
    if (state.playing) {
      state.t += dt;
      // 音が鳴っているときは音の時計に合わせる（小さなズレはなめらかに、大きなズレは即座に）
      const at = audio.filmTime();
      if (Number.isFinite(at) && at >= 0 && at < f.duration && audio.ctx.currentTime !== audioClock.last) {
        const diff = at - state.t;
        state.t = Math.abs(diff) > 0.06 ? at : state.t + diff * 0.15;
      }
      if (audio.ctx) audioClock.last = audio.ctx.currentTime;
      if (state.t >= f.duration) {
        if (recorder) { finishRecording(); }
        else if (state.loop) { state.t %= f.duration; syncAudio(); }
        else { state.t = f.duration; pause(); }
      }
      audio.pump();
    }
    if ((state.playing || state.dirty) && !state.exporting) {
      const t0 = performance.now();
      f.render(renderer, state.t);
      const js = performance.now() - t0;
      perf.jsMs = perf.jsMs * 0.9 + js * 0.1;
      state.dirty = false;
      $('#seek-fill').style.transform = `scaleX(${state.t / f.duration})`;
      $('#time').textContent = `${fmt(state.t)} / ${fmt(f.duration)}`;
      if (recorder) $('#rec-label').textContent = `REC ${fmt(state.t)} / ${fmt(f.duration)}`;
    }
    if (state.playing) {
      perf.frames++;
      perf.acc += dt;
      perf.worst = Math.max(perf.worst, dt);
      if (now - perf.lastReport > 500) {
        perf.fps = perf.frames / perf.acc;
        if (body.classList.contains('perf')) {
          $('#perf').innerHTML = `FPS ${perf.fps.toFixed(1)} ・ worst ${(perf.worst * 1000).toFixed(1)}ms<br>render(JS) ${perf.jsMs.toFixed(2)}ms ・ draws ${renderer.drawCalls}<br>${renderer.bw}×${renderer.bh} ・ build ${state.buildMs.toFixed(0)}ms`;
        }
        perf.frames = 0; perf.acc = 0; perf.worst = 0; perf.lastReport = now;
      }
    }
  }
  if (state.playing || state.dirty) rafId = requestAnimationFrame(frame);
}

function poke() {
  state.dirty = true;
  if (!rafId) { last = performance.now(); rafId = requestAnimationFrame(frame); }
}

// ---------------------------------------------------------------- 書き出し（MediaRecorder で実時間録画）

let recorder = null;
let recChunks = [];
let recCancelled = false;

function pickMime(withAudio) {
  const cands = withAudio
    ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
}

function startRecording(sound = state.sound) {
  if (!state.film || recorder) return;
  const withAudio = sound !== 'off' && audio.unlock();
  const mime = pickMime(withAudio);
  if (!mime || !canvas.captureStream) { toast('このブラウザは録画に対応していません'); return; }
  resize(1); // 仮想解像度そのままで録画
  state.film.render(renderer, 0);
  const stream = canvas.captureStream(60);
  if (withAudio) {
    if (sound !== state.sound) setSound(sound);
    const as = audio.stream();
    if (as) as.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  recChunks = [];
  recCancelled = false;
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
  recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    const rec = recorder;
    recorder = null;
    body.classList.remove('recording');
    resize();
    if (recCancelled) { toast('書き出しを中止しました'); return; }
    const blob = new Blob(recChunks, { type: rec.mimeType });
    const ext = rec.mimeType.includes('mp4') ? 'mp4' : 'webm';
    download(blob, ext);
    toast(`書き出し完了（${(blob.size / 1e6).toFixed(1)} MB, ${ext.toUpperCase()}・リアルタイム録画）`);
  };
  body.classList.add('recording');
  recorder.start(500);
  state.loop = false;
  play(true);
}

function download(blob, ext) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hayagawari-${state.seed}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  state.lastExport = { size: blob.size, type: blob.type, blob };
}

// ---------------------------------------------------------------- 書き出し（1コマずつ・WebCodecs）

const xp = { res: 1, fps: 60, sound: 'full', enc: null, aenc: null, abort: null, running: false, limit: 0 }; // limit: テスト用に書き出す秒数を制限

function exportSize() {
  const [W, H] = ASPECTS[state.aspect];
  return [W * xp.res, H * xp.res];
}

async function refreshExportInfo() {
  const [w, h] = exportSize();
  const info = $('#xp-info');
  info.textContent = '判定中…';
  xp.enc = await pickEncoderConfig(w, h, xp.fps);
  xp.aenc = xp.sound === 'off' ? null : await pickAudioConfig(48000, 2);
  const d = state.film.duration;
  const frames = Math.ceil(d * xp.fps);
  if (!xp.enc) {
    info.innerHTML = `このブラウザは1コマずつの書き出しに対応していないため、<b>リアルタイム録画</b>になります（1080p・実時間 ${fmt(d)}・タブを前面にしたまま）。`;
    return;
  }
  const mb = (xp.enc.config.bitrate * d) / 8 / 1e6;
  let msg = `方式: <b>1コマずつ（${xp.enc.label} / MP4）</b> ・ ${w}×${h} ・ ${xp.fps}fps ・ ${fmt(d)}（${frames} コマ）・ 約 ${mb.toFixed(0)} MB`;
  msg += `<br>音声: ${xp.sound === 'off' ? 'なし' : xp.aenc ? `<b>${SOUND_LABELS[xp.sound]}（${xp.aenc.label}）</b>` : '<span class="warn">このブラウザは音声の書き出しに対応していないため、映像のみになります</span>'}`;
  if (xp.enc.muxCodec !== 'avc') msg += `<br><span class="warn">このブラウザでは H.264 が使えないため ${xp.enc.label} になります。iPhone の写真アプリや一部の SNS では再生・投稿できないことがあります（Chrome / Edge / Safari なら H.264 で書き出せます）。</span>`;
  if (xp.aenc && xp.aenc.muxCodec !== 'aac') msg += `<br><span class="warn">AAC が使えないため音声は ${xp.aenc.label} になります。iPhone の写真アプリや一部の SNS では音が出ない・投稿できないことがあります。</span>`;
  info.innerHTML = msg;
}

function openExport() {
  if (!state.film || recorder || xp.running) return;
  pause();
  $('#xp').hidden = false;
  $('#xp-progress').hidden = true;
  $('#xp-start').disabled = false;
  $('#xp-close').textContent = '閉じる';
  xp.sound = state.sound;
  $('#xp-snd').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === xp.sound));
  refreshExportInfo();
}

async function startExport() {
  if (xp.running) return;
  if (!xp.enc) { $('#xp').hidden = true; startRecording(xp.sound); return; }
  xp.running = true;
  state.exporting = true;
  xp.abort = new AbortController();
  $('#xp-start').disabled = true;
  $('#xp-close').textContent = '中止';
  $('#xp-progress').hidden = false;
  body.classList.add('exporting');
  resize(xp.res);
  const f = state.film;
  const dur = xp.limit > 0 ? Math.min(xp.limit, f.duration) : f.duration;
  try {
    let audioTrack;
    if (xp.aenc) {
      $('#xp-status').textContent = '音声を生成中…';
      const buffer = await renderScoreOffline(buildScore(f, state.seed, xp.sound), state.seed, dur);
      audioTrack = { buffer, enc: xp.aenc };
    }
    const blob = await exportFrames({
      canvas, fps: xp.fps, enc: xp.enc, duration: dur, signal: xp.abort.signal, audio: audioTrack,
      renderAt: (t) => f.render(renderer, t),
      onProgress: (p, i) => {
        $('#xp-fill').style.transform = `scaleX(${p})`;
        $('#xp-status').textContent = `${Math.floor(p * 100)}% ・ ${i.frame} / ${i.total} コマ` + (Number.isFinite(i.eta) ? ` ・ 残り約 ${Math.ceil(i.eta)} 秒` : '');
      },
    });
    download(blob, 'mp4');
    toast(`書き出し完了（${(blob.size / 1e6).toFixed(1)} MB・${xp.enc.label}${audioTrack ? ' + ' + xp.aenc.label : ''} / MP4）`);
    $('#xp').hidden = true;
  } catch (e) {
    if (e.name === 'AbortError') toast('書き出しを中止しました');
    else { console.error(e); toast('書き出しに失敗しました: ' + e.message); }
    $('#xp').hidden = true;
  } finally {
    xp.running = false;
    state.exporting = false;
    body.classList.remove('exporting');
    resize();
    poke();
  }
}

function finishRecording() {
  state.t = state.film.duration;
  pause();
  state.loop = true;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

// ---------------------------------------------------------------- 小物

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let idleTimer = 0;
function wake() {
  body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (state.playing) body.classList.add('idle'); }, 2200);
}

function seekTo(clientX) {
  const r = $('#seek').getBoundingClientRect();
  state.t = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * state.film.duration;
  syncAudio();
  poke();
}

function jump(dir) {
  const f = state.film;
  if (!f) return;
  const starts = f.segments.map((s) => s.start);
  let i = starts.findIndex((s, k) => state.t >= s && (k === starts.length - 1 || state.t < starts[k + 1]));
  i = Math.max(0, Math.min(starts.length - 1, i + dir));
  state.t = starts[i];
  syncAudio();
  poke();
}

// ---------------------------------------------------------------- イベント

const hashAdv = readHash();
{
  let snd = 'full';
  try { snd = localStorage.getItem('hg-sound') || 'full'; } catch { /* プライベートモード等 */ }
  state.sound = SOUND_MODES.includes(snd) ? snd : 'full';
}
$('#seed').value = state.seed;
bindSeg('#aspect', 'aspect');
bindSeg('#pace', 'pace');
bindSeg('#style', 'style');
bindSeg('#order', 'order');
bindSeg('#opener', 'opener');
bindSeg('#closer', 'closer');
initFocalEditor();
$('#adv').addEventListener('toggle', () => { if ($('#adv').open !== state.advOpen) setAdvOpen($('#adv').open); });
$('#adv-reset').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); resetAdv(); }); // summary 内なので開閉させない
$('#pace').addEventListener('click', renderWorks);
for (const id of ['#artist', '#subline', '#handle']) $(id).addEventListener('input', () => { state.film = null; });
$('#seed').addEventListener('input', (e) => { state.seed = e.target.value.trim().toUpperCase() || randomSeed(); state.film = null; });
$('#dice').addEventListener('click', () => { state.seed = randomSeed(); $('#seed').value = state.seed; state.film = null; });

$('#pick').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#sample').addEventListener('click', () => {
  addSources(makeSamples('samples').map((s) => ({ src: s.canvas, name: s.name })));
});
const drop = $('#drop');
window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
window.addEventListener('drop', (e) => {
  drop.classList.remove('over');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  addFiles(e.dataTransfer.files);
  if (state.playing) toEditor();
});

$('#go').addEventListener('click', () => {
  // 閉じている（おまかせ）ときは押すたびに新しいシード＝毎回違う映像
  if (!state.advOpen) { state.seed = randomSeed(); $('#seed').value = state.seed; }
  build(); play(true); wake();
});
$('#play').addEventListener('click', () => (state.playing ? pause() : play(false)));
$('#reroll').addEventListener('click', reroll);
$('#edit').addEventListener('click', toEditor);
$('#export').addEventListener('click', openExport);
$('#snd').addEventListener('click', () => { audio.unlock(); setSound(SOUND_MODES[(SOUND_MODES.indexOf(state.sound) + 1) % SOUND_MODES.length]); });
$('#xp-start').addEventListener('click', startExport);
$('#xp-close').addEventListener('click', () => { if (xp.running) xp.abort.abort(); else $('#xp').hidden = true; });
for (const [id, key] of [['#xp-res', 'res'], ['#xp-fps', 'fps'], ['#xp-snd', 'sound']]) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || xp.running) return;
    xp[key] = key === 'sound' ? b.dataset.v : Number(b.dataset.v);
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    refreshExportInfo();
  });
}
$('#rec-cancel').addEventListener('click', () => { recCancelled = true; finishRecording(); });
$('#fs').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));

const seek = $('#seek');
seek.addEventListener('pointerdown', (e) => {
  seek.setPointerCapture(e.pointerId);
  seekTo(e.clientX);
  const move = (ev) => seekTo(ev.clientX);
  seek.addEventListener('pointermove', move);
  seek.addEventListener('pointerup', () => seek.removeEventListener('pointermove', move), { once: true });
});

$('#stage').addEventListener('click', () => { if (body.classList.contains('playing') && !recorder && !state.exporting && $('#xp').hidden) { state.playing ? pause() : play(false); } });
window.addEventListener('pointermove', wake);
window.addEventListener('resize', () => { if (!recorder && !state.exporting) resize(); poke(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || !$('#fe').hidden) return;
  if (!body.classList.contains('playing') || recorder || state.exporting || !$('#xp').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); state.playing ? pause() : play(false); }
  else if (e.key === 'r' || e.key === 'R') reroll();
  else if (e.key === 'ArrowRight') jump(1);
  else if (e.key === 'ArrowLeft') jump(-1);
  else if (e.key === 'f' || e.key === 'F') $('#fs').click();
  else if (e.key === 'e' || e.key === 'E') toEditor();
  else if (e.key === 'p' || e.key === 'P') body.classList.toggle('perf');
  else if (e.key === 'm' || e.key === 'M') $('#snd').click();
  wake();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && recorder) toast('録画中はタブを前面にしてください'); });

setSound(state.sound);
resize();
{
  let open = false;
  try {
    const v = localStorage.getItem('hg-adv');
    open = v !== null ? v === '1' : localStorage.getItem('hg-mode') === 'pro'; // 旧「こだわり」設定からの引き継ぎ
  } catch { /* プライベートモード等 */ }
  if (hashAdv) open = true; // 詳細設定つきで共有された URL は、その設定で再現する
  setAdvOpen(open);
  updateAdvSummary();
}

// テスト・デバッグ用フック
window.__hg = {
  state, renderer, tf,
  build, play, pause, reroll, toEditor, setAdvOpen, openExport, xp, audio, setSound,
  loadSamples: () => addSources(makeSamples('samples').map((s) => ({ src: s.canvas, name: s.name }))),
  renderAt: (t) => { state.film.render(renderer, t); state.t = t; },
  // GPU に溜まった描画命令を最後まで実行させる（1px 読み出しで同期。gl.finish は Chrome では待たない）
  sync: () => { const gl = renderer.gl; const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[3]; },
  setSeed: (s) => { state.seed = s; $('#seed').value = s; state.film = null; },
  setOpt: (k, v) => { state[k] = v; state.film = null; segSyncs.forEach((f) => f()); updateAdvSummary(); },
};
