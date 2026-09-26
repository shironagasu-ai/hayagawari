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
const CELL_W = 192, CELL_H = 108; // コマ見本 1 枚の大きさ（2×2 で 1 枚のカード）
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
 * @param {object} o
 * @param {import('./gl.js').Renderer} o.renderer
 * @param {() => Promise<object[]>} o.loadWorks 見本に使う作品（解析済み・テクスチャ付き）
 * @param {(cat: string, key: string) => void} o.play その演出の映像をプレーヤーで再生する（main が本編の文字工場で作り直す）
 * @param {() => void} o.restore コマ見本を描いたあとに画面の描画サイズを戻す
 */
export function initCatalog({ renderer, loadWorks, play, restore }) {
  const root = document.querySelector('#catalog');
  const tabs = root.querySelector('#cat-tabs');
  const grid = root.querySelector('#cat-grid');
  const tf = new TextFactory(renderer); // 本編の映像の文字を消さないよう専用
  let works = null;
  let current = null;
  let queue = [];
  let busy = false;
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting && !e.target.dataset.done) { e.target.dataset.done = '1'; queue.push(e.target); }
    pump();
  }, { rootMargin: '200px' });

  // 見えているカードから順に 1 枚ずつコマ見本を描く（UI を止めない）
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const card = queue.shift();
        if (!works) works = await loadWorks();
        drawThumb(card);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      busy = false;
      restore();
    }
  }

  function drawThumb(card) {
    const { cat, key } = card.dataset;
    tf.dispose();
    const { film, win } = catalogFilm(cat, key, works, tf);
    const cv = card.querySelector('canvas');
    const g = cv.getContext('2d');
    renderer.setSize(W, H, CELL_W * 2, CELL_H * 2);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = win[0] + (win[1] - win[0]) * ((i + 0.5) / n);
      film.render(renderer, t);
      // 描いた直後の同じタスク内で写す（preserveDrawingBuffer=false でも中身が残っている）
      g.drawImage(renderer.canvas, (i % 2) * CELL_W, Math.floor(i / 2) * CELL_H, CELL_W, CELL_H);
    }
    card.querySelector('.cat-dur').textContent = `${(win[1] - win[0]).toFixed(1)} 秒`;
    card.classList.add('ready');
  }

  function show(cat) {
    if (!CATEGORIES.some((c) => c.key === cat)) cat = CATEGORIES[0].key;
    current = cat;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cat));
    queue = [];
    io.disconnect();
    grid.innerHTML = '';
    for (const key of catalogKeys(cat)) {
      const [name, desc] = labelOf(cat, key);
      const card = document.createElement('div');
      card.className = 'cat-card';
      card.dataset.cat = cat;
      card.dataset.key = key;
      card.innerHTML = `
        <canvas width="${CELL_W * 2}" height="${CELL_H * 2}"></canvas>
        <div class="cat-meta">
          <div class="cat-name"><b></b><code></code></div>
          <p class="cat-desc"></p>
          <div class="cat-row"><button class="btn cat-play">▶ 再生</button><span class="cat-dur hint"></span></div>
        </div>`;
      card.querySelector('b').textContent = name;
      card.querySelector('code').textContent = key;
      card.querySelector('.cat-desc').textContent = desc;
      card.querySelector('.cat-play').addEventListener('click', () => play(cat, key));
      grid.appendChild(card);
      io.observe(card);
    }
  }

  tabs.innerHTML = CATEGORIES.map((c) => `<button data-v="${c.key}">${c.name} <span>${catalogKeys(c.key).length}</span></button>`).join('');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) location.hash = `catalog=${b.dataset.v}`;
  });

  return {
    // #catalog / #catalog=<カテゴリ> のときだけ表示
    sync() {
      const m = location.hash.match(/^#catalog(?:=(\w+))?/);
      document.body.classList.toggle('catalog', !!m);
      root.hidden = !m;
      if (m && (m[1] || CATEGORIES[0].key) !== current) show(m[1]);
      return !!m;
    },
    get current() { return current; },
  };
}
