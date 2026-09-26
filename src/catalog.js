// 演出カタログ（#catalog）。カテゴリごとに全演出を同じサンプル作品で並べ、コマ見本と再生で見比べる。
// 本番でも開ける。演出の追加・調整の確認（PR のプレビュー）にも使う。

import { TextFactory } from './text.js';
import { buildFilm } from './director.js';
import { THEMES } from './fx/themes.js';
import { OPENERS } from './fx/openers.js';
import { CLOSERS } from './fx/closers.js';
import { VARIANTS } from './fx/variants.js';
import { DECORS } from './fx/decors.js';
import { TRANSITION_KEYS } from './fx/transitions.js';
import { PALETTES } from './fx/palettes.js';
import { CATEGORIES, labelOf } from './fx/labels.js';

const W = 1920, H = 1080; // カタログは 16:9 で見せる
const RW = 512, RH = 288; // カタログで描くときの解像度（コマ見本も本再生も同じにして、描画面の作り直しを避ける）
const FW = 256, FH = 144; // 保存しておくコマの大きさ
const FRAMES = 6; // パラパラ用に保存するコマ数
const FLIP_MS = 380; // パラパラの 1 コマの長さ
const SEED = 'CATALOG';

// カテゴリごとの演出のキー
export function catalogKeys(cat) {
  switch (cat) {
    case 'opener': return Object.keys(OPENERS);
    case 'closer': return Object.keys(CLOSERS);
    case 'variant': return Object.keys(VARIANTS);
    case 'transition': return TRANSITION_KEYS.slice();
    case 'decor': return Object.keys(DECORS);
    case 'palette': return Object.keys(PALETTES);
    case 'style': return ['MIX', ...Object.keys(THEMES)];
    default: return [];
  }
}

// その演出だけを見せる短い映像の設定と、見せる時間帯 [a, b]
export function catalogFilm(cat, key, works, tf) {
  const opts = { works, seed: SEED, W, H, tf, artist: 'HAYAGAWARI', subline: 'PORTFOLIO', handle: 'shironagasu-ai.github.io/hayagawari' };
  if (cat === 'opener') opts.opener = key;
  if (cat === 'closer') opts.closer = key;
  if (cat === 'variant') opts.variant = key;
  if (cat === 'transition') opts.transition = key;
  // 飾り・配色は、画面を覆わない見せ方（カード）で見せる
  if (cat === 'decor') { opts.decor = key; opts.variant = 'card'; }
  if (cat === 'palette') { opts.palette = key; opts.variant = 'card'; }
  if (cat === 'style') opts.theme = key;
  const film = buildFilm(opts);
  const segs = film.segments;
  const works0 = segs.findIndex((s) => s.kind === 'work');
  let win;
  if (cat === 'opener') win = [segs[0].start, segs[0].start + segs[0].dur];
  else if (cat === 'closer') { const s = segs[segs.length - 1]; win = [s.start, s.start + s.dur]; }
  else if (cat === 'transition') { const b = segs[works0 + 1].start; win = [b - 0.7, b + 0.9]; }
  else if (cat === 'style') win = [0, film.duration];
  else { const s = segs[works0]; win = [s.start, s.start + s.dur]; }
  return { film, win };
}

/**
 * 一覧では、見えているカードは保存したコマをパラパラと切り替え、画面の中央に一番近いカード
 * （PC でマウスを乗せているときはそのカード）だけをその場で本当に再生する。
 * @param {object} o
 * @param {import('./gl.js').Renderer} o.renderer
 * @param {() => Promise<object[]>} o.loadWorks 見本に使う作品（解析済み・テクスチャ付き）
 * @param {(cat: string, key: string) => void} o.play その演出の映像を全画面のプレーヤーで再生する（main が本編の文字工場で作り直す）
 * @param {() => void} o.restore カタログを閉じたときに、画面の描画サイズを本編用に戻す
 */
export function initCatalog({ renderer, loadWorks, play, restore }) {
  const root = document.querySelector('#catalog');
  const tabs = root.querySelector('#cat-tabs');
  const grid = root.querySelector('#cat-grid');
  const thumbTf = new TextFactory(renderer); // コマ見本用（本編の映像の文字を消さないよう専用）
  const liveTf = new TextFactory(renderer); // 本再生中のカード用
  let works = null;
  let current = null;
  let queue = [];
  let busy = false;
  let open = false;
  const visible = new Set();
  const live = { card: null, film: null, win: null, start: 0 };
  let hover = null;
  let raf = 0, lastPick = 0, lastFlip = 0;

  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (e.isIntersecting) {
        visible.add(e.target);
        if (!e.target.dataset.done) { e.target.dataset.done = '1'; queue.push(e.target); }
      } else visible.delete(e.target);
    }
    pump();
  }, { rootMargin: '200px' });

  const busyElsewhere = () => !open || document.hidden || document.body.classList.contains('playing');

  // 見えているカードから順に 1 枚ずつコマ見本を描く（UI を止めない）
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        if (busyElsewhere()) break;
        const card = queue.shift();
        if (!card.isConnected) continue;
        if (!works) works = await loadWorks();
        drawThumb(card);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      busy = false;
    }
  }

  function drawThumb(card) {
    const { cat, key } = card.dataset;
    thumbTf.dispose();
    const { film, win } = catalogFilm(cat, key, works, thumbTf);
    renderer.setSize(W, H, RW, RH);
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      film.render(renderer, win[0] + (win[1] - win[0]) * ((i + 0.5) / FRAMES));
      // 描いた直後の同じタスク内で写す（preserveDrawingBuffer=false でも中身が残っている）
      const f = document.createElement('canvas');
      f.width = FW; f.height = FH;
      f.getContext('2d').drawImage(renderer.canvas, 0, 0, FW, FH);
      frames.push(f);
    }
    card._frames = frames;
    card._frame = 0;
    card.querySelector('canvas').getContext('2d').drawImage(frames[0], 0, 0, RW, RH);
    card.querySelector('.cat-dur').textContent = `${(win[1] - win[0]).toFixed(1)} 秒`;
    card.classList.add('ready');
  }

  // 本再生するカード: マウスを乗せているカード、なければ画面の中央に一番近いカード
  function pickLive() {
    if (hover && hover.isConnected && hover._frames) return hover;
    const mid = innerHeight / 2;
    let best = null, bestD = Infinity;
    for (const c of visible) {
      if (!c._frames) continue;
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function setLive(card, now) {
    if (live.card === card) return;
    if (live.card) { live.card.classList.remove('live'); drawFrame(live.card); }
    live.card = card;
    live.film = null;
    if (!card) return;
    liveTf.dispose();
    const { film, win } = catalogFilm(card.dataset.cat, card.dataset.key, works, liveTf);
    live.film = film; live.win = win; live.start = now;
    card.classList.add('live');
  }

  function drawFrame(card) {
    if (!card._frames) return;
    card.querySelector('canvas').getContext('2d').drawImage(card._frames[card._frame % FRAMES], 0, 0, RW, RH);
  }

  function tick(now) {
    raf = open ? requestAnimationFrame(tick) : 0;
    if (busyElsewhere() || !works) return;
    if (now - lastPick > 200) { lastPick = now; setLive(pickLive(), now); }
    // 本再生（その演出の区間をループ。最後に少し止めてから頭へ）
    if (live.film) {
      const len = live.win[1] - live.win[0];
      const t = ((now - live.start) / 1000) % (len + 0.4);
      renderer.setSize(W, H, RW, RH);
      live.film.render(renderer, live.win[0] + Math.min(t, len - 1e-3));
      live.card.querySelector('canvas').getContext('2d').drawImage(renderer.canvas, 0, 0, RW, RH);
    }
    // それ以外の見えているカードはパラパラ
    if (now - lastFlip > FLIP_MS) {
      lastFlip = now;
      for (const c of visible) if (c !== live.card && c._frames) { c._frame++; drawFrame(c); }
    }
  }

  function show(cat) {
    if (!CATEGORIES.some((c) => c.key === cat)) cat = CATEGORIES[0].key;
    current = cat;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cat));
    queue = [];
    visible.clear();
    setLive(null, 0);
    hover = null;
    io.disconnect();
    grid.innerHTML = '';
    for (const key of catalogKeys(cat)) {
      const [name, desc] = labelOf(cat, key);
      const card = document.createElement('div');
      card.className = 'cat-card';
      card.dataset.cat = cat;
      card.dataset.key = key;
      card.innerHTML = `
        <canvas width="${RW}" height="${RH}"></canvas>
        <div class="cat-meta">
          <div class="cat-name"><b></b><code></code></div>
          <p class="cat-desc"></p>
          <div class="cat-row"><button class="btn cat-play">▶ 全画面で再生</button><span class="cat-dur hint"></span></div>
        </div>`;
      card.querySelector('b').textContent = name;
      card.querySelector('code').textContent = key;
      card.querySelector('.cat-desc').textContent = desc;
      card.querySelector('.cat-play').addEventListener('click', () => play(cat, key));
      card.addEventListener('mouseenter', () => { hover = card; lastPick = 0; });
      card.addEventListener('mouseleave', () => { if (hover === card) { hover = null; lastPick = 0; } });
      grid.appendChild(card);
      io.observe(card);
    }
  }

  tabs.innerHTML = CATEGORIES.map((c) => `<button data-v="${c.key}">${c.name} <span>${catalogKeys(c.key).length}</span></button>`).join('');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) location.hash = `catalog=${b.dataset.v}`;
  });
  // 全画面の再生やタブ切り替えから戻ったら、止めていたコマ見本づくりを再開
  new MutationObserver(() => { if (!busyElsewhere()) pump(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (!busyElsewhere()) pump(); });

  return {
    // #catalog / #catalog=<カテゴリ> のときだけ表示
    sync() {
      const m = location.hash.match(/^#catalog(?:=(\w+))?/);
      const was = open;
      open = !!m;
      document.body.classList.toggle('catalog', open);
      root.hidden = !open;
      if (open && (m[1] || CATEGORIES[0].key) !== current) show(m[1]);
      if (open && !raf) raf = requestAnimationFrame(tick);
      if (!open && was) { setLive(null, 0); restore(); }
      return open;
    },
    get current() { return current; },
    get liveKey() { return live.card ? live.card.dataset.key : null; },
  };
}
