// UI とメインループ。
import { Renderer } from './gl.js';
import { TextFactory } from './text.js';
import { analyzeImage } from './analyze.js';
import { buildFilm } from './director.js';
import { makeSamples } from './samples.js';
import { randomSeed, createRng } from './rng.js';

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

const state = {
  works: [], // analyzeImage の結果 + id
  seed: '',
  aspect: '16:9',
  pace: 'normal',
  style: 'auto',
  order: 'keep',
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
}
function writeHash() {
  const h = new URLSearchParams({ seed: state.seed, aspect: state.aspect, pace: state.pace, style: state.style, order: state.order });
  history.replaceState(null, '', '#' + h.toString());
}

// ---------------------------------------------------------------- 編集 UI

function bindSeg(id, key) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state[key]));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = b.dataset.v;
    sync();
    state.film = null;
  });
  sync();
}

function renderWorks() {
  const box = $('#works');
  box.innerHTML = '';
  state.works.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'work';
    el.draggable = true;
    el.dataset.id = w.id;
    const pts = w.focal.map((f, k) => `<span class="pt ${k === 0 ? 'p0' : ''} ${f.manual ? 'manual' : ''}" style="left:${f.x * 100}%;top:${f.y * 100}%"></span>`).join('');
    el.innerHTML = `
      <div class="thumb" style="background-image:url(${w.thumb})"><div class="ptbox" style="position:absolute;inset:0"></div></div>
      <span class="grip">⠿ ${String(i + 1).padStart(2, '0')}</span>
      <button class="x" title="削除">✕</button>
      <div class="meta"><input class="title" value="" maxlength="40" spellcheck="false"></div>`;
    el.querySelector('input.title').value = w.title;
    // サムネイルは contain 表示なので、画像の実表示領域に点を合わせる
    const thumb = el.querySelector('.thumb');
    const ptbox = el.querySelector('.ptbox');
    const a = w.aspect;
    if (a >= 1) { ptbox.style.top = `${(1 - 1 / a) * 50}%`; ptbox.style.bottom = `${(1 - 1 / a) * 50}%`; }
    else { ptbox.style.left = `${(1 - a) * 50}%`; ptbox.style.right = `${(1 - a) * 50}%`; }
    ptbox.innerHTML = pts;
    thumb.addEventListener('click', (e) => {
      const r = ptbox.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      setManualFocal(w, x, y);
      renderWorks();
    });
    thumb.addEventListener('contextmenu', (e) => { e.preventDefault(); w.focal = w.autoFocal.map((f) => ({ ...f })); state.film = null; renderWorks(); });
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
  const beats = { tight: 6, normal: 8, relaxed: 10 }[state.pace];
  return Math.round((6 + state.works.length * beats + 8) * (60 / 124));
}

function setManualFocal(w, x, y) {
  const near = w.autoFocal.reduce((a, f) => (Math.hypot(f.x - x, f.y - y) < Math.hypot(a.x - x, a.y - y) ? f : a), w.autoFocal[0]);
  const rest = w.autoFocal.filter((f) => Math.hypot(f.x - x, f.y - y) > 0.18);
  w.focal = [{ x, y, size: near ? near.size : 0.3, strength: 1, manual: true }, ...rest].slice(0, 4);
  state.film = null;
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

function build() {
  if (!state.works.length) return null;
  tf.dispose();
  for (const w of state.works) if (!w.tex) w.tex = renderer.createTexture(w.source);
  const [W, H] = ASPECTS[state.aspect];
  let works = state.works;
  if (state.order === 'shuffle') works = createRng('order|' + state.seed).shuffle(works);
  const t0 = performance.now();
  state.film = buildFilm({
    works, seed: state.seed, W, H, tf, pace: state.pace,
    theme: state.style === 'auto' ? null : state.style,
    artist: $('#artist').value.trim(), subline: $('#subline').value.trim(), handle: $('#handle').value.trim(),
  });
  state.buildMs = performance.now() - t0;
  resize();
  renderMarks();
  $('#i-style').textContent = state.film.theme;
  $('#i-bpm').textContent = state.film.bpm;
  $('#i-seed').textContent = state.seed;
  writeHash();
  state.dirty = true;
  return state.film;
}

function play(fromStart = true) {
  if (!state.film) build();
  if (!state.film) return;
  if (fromStart) state.t = 0;
  state.playing = true;
  body.classList.add('playing');
  $('#play').textContent = '❚❚';
  poke();
}

function pause() {
  state.playing = false;
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

function resize(forceFull = false) {
  const [W, H] = ASPECTS[state.aspect];
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * k), cssH = Math.floor(H * k);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = forceFull ? 1 : Math.min(1, (cssW * dpr) / W);
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
      if (state.t >= f.duration) {
        if (recorder) { finishRecording(); }
        else if (state.loop) state.t %= f.duration;
        else { state.t = f.duration; pause(); }
      }
    }
    if (state.playing || state.dirty) {
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

function pickMime() {
  const cands = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
}

function startRecording() {
  if (!state.film || recorder) return;
  const mime = pickMime();
  if (!mime || !canvas.captureStream) { toast('このブラウザは録画に対応していません'); return; }
  resize(true); // 仮想解像度そのままで録画
  state.film.render(renderer, 0);
  const stream = canvas.captureStream(60);
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hayagawari-${state.seed}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast(`書き出し完了（${(blob.size / 1e6).toFixed(1)} MB, ${ext.toUpperCase()}）`);
  };
  body.classList.add('recording');
  recorder.start(500);
  state.loop = false;
  play(true);
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
  poke();
}

function jump(dir) {
  const f = state.film;
  if (!f) return;
  const starts = f.segments.map((s) => s.start);
  let i = starts.findIndex((s, k) => state.t >= s && (k === starts.length - 1 || state.t < starts[k + 1]));
  i = Math.max(0, Math.min(starts.length - 1, i + dir));
  state.t = starts[i];
  poke();
}

// ---------------------------------------------------------------- イベント

readHash();
$('#seed').value = state.seed;
bindSeg('#aspect', 'aspect');
bindSeg('#pace', 'pace');
bindSeg('#style', 'style');
bindSeg('#order', 'order');
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

$('#go').addEventListener('click', () => { build(); play(true); wake(); });
$('#play').addEventListener('click', () => (state.playing ? pause() : play(false)));
$('#reroll').addEventListener('click', reroll);
$('#edit').addEventListener('click', toEditor);
$('#export').addEventListener('click', startRecording);
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

$('#stage').addEventListener('click', () => { if (body.classList.contains('playing') && !recorder) { state.playing ? pause() : play(false); } });
window.addEventListener('pointermove', wake);
window.addEventListener('resize', () => { if (!recorder) resize(); poke(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (!body.classList.contains('playing') || recorder) return;
  if (e.code === 'Space') { e.preventDefault(); state.playing ? pause() : play(false); }
  else if (e.key === 'r' || e.key === 'R') reroll();
  else if (e.key === 'ArrowRight') jump(1);
  else if (e.key === 'ArrowLeft') jump(-1);
  else if (e.key === 'f' || e.key === 'F') $('#fs').click();
  else if (e.key === 'e' || e.key === 'E') toEditor();
  else if (e.key === 'p' || e.key === 'P') body.classList.toggle('perf');
  wake();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && recorder) toast('録画中はタブを前面にしてください'); });

resize();
renderWorks();

// テスト・デバッグ用フック
window.__hg = {
  state, renderer,
  build, play, pause, reroll,
  loadSamples: () => addSources(makeSamples('samples').map((s) => ({ src: s.canvas, name: s.name }))),
  renderAt: (t) => { state.film.render(renderer, t); state.t = t; },
  setSeed: (s) => { state.seed = s; $('#seed').value = s; state.film = null; },
  setOpt: (k, v) => { state[k] = v; state.film = null; },
};
