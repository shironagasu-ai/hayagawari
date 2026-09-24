// ディレクター: シードから「映像の設計図」を生成し、時刻 t の絵を描く純関数 render(r, t) を返す。
//
// - ランダムな決定はすべてビルド時に行い、描画時は時刻だけで決まる（スクラブ・書き出しが決定的）
// - 時間はテンポ（BPM）の拍で刻む。カットは拍頭に置き、動きは「タメ→ツメ→ピタッ」で設計
// - 作品ごとに「振付（variant）」「背景装飾（decor）」「入り/出のトランジション」を抽選
// - 画像解析の注目点（focal）を寄り・カット割り・パン・コールアウトの着地点に使う

import { createRng } from './rng.js';
import { rgbToHsl, hslToRgb } from './analyze.js';
import {
  clamp, lerp, prog, quadOut, expoIn, expoOut, expoInOut,
  backOut, snap, snapSoft, antic,
} from './ease.js';

// ---------------------------------------------------------------- テーマ

export const THEMES = {
  NOIR: {
    label: 'NOIR', bg: 'dark', font: 'sans', weight: 800, tracking: 0.01, upper: true,
    grain: 0.05, vignette: 0.45, hud: true, bpm: [116, 128],
    variants: { focus: 3, cuts: 3, split: 2, pan: 2, card: 1 },
    trans: { whip: 3, zoom: 3, iris: 1, slices: 2, glitch: 1, bars: 2, cut: 2 },
    decor: { number: 2, marquee: 2, grid: 1, blur: 3, stripes: 1, dots: 0 },
  },
  SWISS: {
    label: 'SWISS', bg: 'light', font: 'sans', weight: 800, tracking: -0.01, upper: true,
    grain: 0.025, vignette: 0.0, hud: true, bpm: [118, 130],
    variants: { cuts: 3, split: 3, card: 2, focus: 2, pan: 1 },
    trans: { whip: 3, bars: 3, slices: 3, cut: 2, zoom: 1, iris: 1 },
    decor: { grid: 3, number: 3, stripes: 1, marquee: 1, dots: 1 },
  },
  POP: {
    label: 'POP', bg: 'accent', font: 'condensed', weight: 900, tracking: 0.02, upper: true,
    grain: 0.03, vignette: 0.15, hud: true, bpm: [124, 136],
    variants: { card: 3, cuts: 3, focus: 2, split: 1, pan: 1 },
    trans: { iris: 3, whip: 2, bars: 3, zoom: 2, slices: 2, cut: 1 },
    decor: { stripes: 3, dots: 3, marquee: 2, number: 1 },
  },
  EDITORIAL: {
    label: 'EDITORIAL', bg: 'light', font: 'serif', weight: 500, tracking: 0.0, upper: false,
    grain: 0.035, vignette: 0.1, hud: true, bpm: [108, 120],
    variants: { focus: 3, split: 3, pan: 3, card: 2, cuts: 1 },
    trans: { whip: 2, slices: 2, iris: 1, zoom: 2, bars: 1, cut: 2 },
    decor: { number: 3, grid: 2, blur: 1, marquee: 1 },
  },
  GLITCH: {
    label: 'GLITCH', bg: 'dark', font: 'mono', weight: 700, tracking: 0.04, upper: true,
    grain: 0.08, vignette: 0.4, hud: true, bpm: [126, 140], aberrBase: 0.6,
    variants: { cuts: 4, focus: 3, pan: 2, split: 2, card: 1 },
    trans: { glitch: 4, whip: 2, slices: 3, zoom: 2, cut: 3 },
    decor: { grid: 3, marquee: 2, number: 2, blur: 2, dots: 1 },
  },
};

const PACE = {
  tight: { beats: 6, bpm: 6 },
  normal: { beats: 8, bpm: 0 },
  relaxed: { beats: 10, bpm: -10 },
};

// ---------------------------------------------------------------- 小道具

const pad2 = (n) => String(n).padStart(2, '0');
const TAU = Math.PI * 2;
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hsl = (h, s, l) => hslToRgb([h, s, l]).map((v) => v / 255);
const withA = (c, a) => [c[0], c[1], c[2], a];

function fitIn(aspect, bw, bh) {
  return aspect > bw / bh ? { w: bw, h: bw / aspect } : { w: bh * aspect, h: bh };
}

// 作品ごとの配色（テーマの背景モードとパレットから）
function colorsFor(work, theme) {
  const R = work.roles;
  const [dh, ds] = rgbToHsl(R.dominant.map((v) => v * 255));
  const [ah] = rgbToHsl(R.accent.map((v) => v * 255));
  let bg, ink, accent = R.accent.slice();
  if (theme.bg === 'dark') {
    bg = hsl(dh, Math.min(ds, 0.35), 0.075);
    ink = [0.95, 0.95, 0.94];
  } else if (theme.bg === 'light') {
    bg = hsl(dh, Math.min(ds, 0.3) * 0.5, 0.925);
    ink = hsl(ah, 0.25, 0.09);
  } else {
    bg = hsl(ah, 0.72, 0.52);
    ink = lum(bg) > 0.5 ? hsl(ah, 0.4, 0.08) : [0.98, 0.97, 0.95];
    // POP: アクセントは補色寄り
    accent = hsl((ah + 0.5) % 1, 0.8, lum(bg) > 0.5 ? 0.35 : 0.6);
  }
  // アクセントが背景に沈む場合は明度をずらす
  if (Math.abs(lum(accent) - lum(bg)) < 0.22) {
    const [h, s, l] = rgbToHsl(accent.map((v) => v * 255));
    accent = hsl(h, s, lum(bg) > 0.5 ? Math.max(0.2, l - 0.3) : Math.min(0.8, l + 0.3));
  }
  return { bg, ink, accent, deco: theme.bg === 'accent' ? mix(bg, ink, 0.22) : accent };
}

// 注目点を n 個そろえる（足りなければ近傍にずらした点を足す）
function pointsFor(work, n, rng) {
  const src = work.focal.length ? work.focal : [{ x: 0.5, y: 0.42, size: 0.35, strength: 1 }];
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = src[i % src.length];
    if (i < src.length) out.push({ ...f });
    else {
      const a = rng.range(0, TAU), d = rng.range(0.12, 0.22);
      out.push({ ...f, x: clamp(f.x + Math.cos(a) * d, 0.12, 0.88), y: clamp(f.y + Math.sin(a) * d, 0.12, 0.88), size: f.size * rng.range(0.8, 1.2) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 画像カメラ
// 「画像上の点 (ix,iy) を画面の (sx,sy) に置き、画像の高さを hq px にする」で画像の見え方を表す。
// 寄り（全面）と引き（枠内）の間を log 補間するだけで自然なズームになる。

function camQuad(work, c) {
  const hq = c.hq, wq = hq * work.aspect;
  return { x: c.sx - (c.ix - 0.5) * wq, y: c.sy - (c.iy - 0.5) * hq, w: wq, h: hq };
}

function camLerp(a, b, e) {
  return {
    ix: lerp(a.ix, b.ix, e), iy: lerp(a.iy, b.iy, e),
    sx: lerp(a.sx, b.sx, e), sy: lerp(a.sy, b.sy, e),
    hq: Math.exp(lerp(Math.log(a.hq), Math.log(b.hq), e)),
  };
}

// 全面表示で画像の端が見えないよう注目点側を寄せる
function clampFull(work, c, W, H) {
  const hq = Math.max(c.hq, H, W / work.aspect);
  const wq = hq * work.aspect;
  // 左端条件: sx - ix*wq <= 0 → ix >= sx/wq ／ 右端条件: sx + (1-ix)*wq >= W → ix <= 1 - (W-sx)/wq
  const ix = clamp(c.ix, c.sx / wq, 1 - (W - c.sx) / wq);
  const iy = clamp(c.iy, c.sy / hq, 1 - (H - c.sy) / hq);
  return { ...c, ix, iy, hq };
}

// 注目点へのズーム量: 注目領域が画面短辺の ~80% に収まる高さ。解像度で上限
function closeHq(work, f, W, H, mul = 1) {
  const coverHq = Math.max(H, W / work.aspect);
  const shortFrac = f.size * Math.min(1, work.aspect); // 画像高さに対する注目領域の比
  let hq = (Math.min(W, H) * 0.85) / Math.max(0.08, shortFrac) * mul;
  const maxHq = work.height / 0.5; // テクセル密度 0.5 まで（それ以上はボケる）
  hq = Math.min(hq, Math.max(coverHq * 1.35, maxHq));
  return Math.max(hq, coverHq * 1.35);
}

function drawCam(r, work, c, prev, o = {}) {
  const q = camQuad(work, c);
  let blur;
  if (prev) {
    const p = camQuad(work, prev);
    // 1フレーム分の移動量をテクスチャ uv に換算して方向ブラー（シャッター 360°相当）
    const k = o.shutter ?? 1;
    const dx = (q.x - p.x) / q.w, dy = (q.y - p.y) / q.h;
    if (Math.abs(dx) + Math.abs(dy) > 0.0004) blur = [-dx * k, -dy * k];
  }
  r.draw({ x: q.x, y: q.y, w: q.w, h: q.h, tex: work.tex, blur, mask: o.mask, alpha: o.alpha, color: o.color, rot: o.rot });
  return q;
}

// ウィンドウ（パネル）内に注目点を中心として表示する uv 矩形
function coverUV(work, winW, winH, fx, fy, z) {
  const wa = winW / winH, ia = work.aspect;
  let uw, uh;
  if (ia > wa) { uh = 1; uw = wa / ia; } else { uw = 1; uh = ia / wa; }
  uw /= z; uh /= z;
  const u0 = uw <= 1 ? clamp(fx - uw / 2, 0, 1 - uw) : fx - uw / 2;
  const v0 = uh <= 1 ? clamp(fy - uh / 2, 0, 1 - uh) : fy - uh / 2;
  return [u0, v0, u0 + uw, v0 + uh];
}

function panelZoom(work, f, winW, winH, mul = 1) {
  const wa = winW / winH, ia = work.aspect;
  const uh = ia > wa ? 1 : ia / wa; // z=1 のときの可視高さ比
  const want = f.size * Math.min(1, ia) * 1.2;
  let z = (uh / Math.max(0.08, want)) * mul;
  const zMax = Math.max(1.2, (uh * work.height) / (winH * 0.5));
  return clamp(z, 1.15, zMax);
}

// ---------------------------------------------------------------- 文字

function drawText(r, T, x, y, o = {}) {
  // (x,y) はグリフ枠の左上（右揃えなら右上）。テクスチャの余白を差し引いて配置
  const s = o.scale ?? 1;
  const gw = (T.w - 2 * T.pad) * s;
  const left = o.align === 'right' ? x - gw : o.align === 'center' ? x - gw / 2 : x;
  const cx = left - T.pad * s + (T.w * s) / 2;
  const cy = y - T.pad * s + (T.h * s) / 2;
  // reveal: 0→1 で下から枠内にせり上がる / leave: 0→1 で上へ抜ける
  const rv = o.reveal ?? 1, lv = o.leave ?? 0;
  if (rv <= 0 || lv >= 1) return;
  const v0 = lv > 0 ? lv : rv - 1;
  r.draw({
    x: cx, y: cy, w: T.w * s, h: T.h * s, tex: T.tex, uv: [0, v0, 1, v0 + 1],
    color: o.color, alpha: o.alpha, mask: o.mask, rot: o.rot,
  });
}

const textH = (T, s = 1) => (T.h - 2 * T.pad) * s;
const textW = (T, s = 1) => (T.w - 2 * T.pad) * s;

// ---------------------------------------------------------------- レイアウト

function layoutFor(work, W, H, side) {
  const minDim = Math.min(W, H);
  const land = W / H > 1.2;
  const a = work.aspect;
  if (land && (a > 1.45 || side === 'center')) {
    const b = fitIn(a, W * 0.74, H * 0.62);
    const img = { x: W / 2, y: H * 0.43, w: b.w, h: b.h };
    return { img, side: 'center', text: { x: img.x - b.w / 2, y: img.y + b.h / 2 + minDim * 0.05, maxW: b.w, stack: 'below' } };
  }
  if (land) {
    const b = fitIn(a, W * 0.5, H * 0.8);
    const cx = side === 'left' ? W * 0.34 : W * 0.66;
    const img = { x: cx, y: H * 0.5, w: b.w, h: b.h };
    const tx = side === 'left' ? cx + b.w / 2 + W * 0.05 : W * 0.07;
    const maxW = side === 'left' ? W * 0.94 - tx : cx - b.w / 2 - W * 0.05 - tx;
    return { img, side, text: { x: tx, y: img.y + b.h / 2, maxW, stack: 'side' } };
  }
  const portrait = W / H < 0.8;
  const b = fitIn(a, W * 0.84, H * (portrait ? 0.58 : 0.62));
  const img = { x: W / 2, y: H * (portrait ? 0.4 : 0.42), w: b.w, h: b.h };
  return { img, side: 'center', text: { x: Math.max(W * 0.08, img.x - b.w / 2), y: img.y + b.h / 2 + minDim * 0.05, maxW: W * 0.84, stack: 'below' } };
}

// タイトル・番号・メタ情報のブロック
function makeTextBlock(S) {
  const { tf, theme, work, idx, total, artist, minDim, layout, year } = S;
  const up = (s) => (theme.upper ? s.toUpperCase() : s);
  const side = layout.text.stack === 'side';
  const titleSize = Math.round(minDim * (side ? 0.08 : 0.066));
  const T = tf.get(up(work.title), { family: theme.font, size: titleSize, weight: theme.weight, tracking: theme.tracking });
  const I = tf.get(`No.${pad2(idx + 1)}`, { family: 'mono', size: Math.round(minDim * 0.022), weight: 700, tracking: 0.18 });
  const meta = [artist ? up(artist) : null, String(year)].filter(Boolean).join('  /  ');
  const M = tf.get(meta, { family: 'mono', size: Math.round(minDim * 0.017), weight: 500, tracking: 0.14 });
  const scale = Math.min(1, layout.text.maxW / Math.max(1, textW(T)));
  const gap = minDim * 0.018;
  const total_h = textH(I) + gap + textH(T, scale) + gap * 1.3 + textH(M);
  const y0 = side ? layout.text.y - total_h : layout.text.y;
  const barW = minDim * 0.05;
  return (r, t, t0, col) => {
    const x = layout.text.x;
    let y = y0;
    const e = (d) => expoOut(prog(t, t0 + d, t0 + d + 0.55));
    // アクセントの短い線（左から伸びる）
    const eb = snapSoft(prog(t, t0, t0 + 0.45));
    if (eb > 0) r.draw({ x: x + (barW * eb) / 2, y: y + textH(I) / 2, w: barW * eb, h: Math.max(3, minDim * 0.004), color: col.accent });
    drawText(r, I, x + barW + minDim * 0.015, y, { reveal: e(0.05), color: col.accent });
    y += textH(I) + gap;
    drawText(r, T, x, y, { reveal: e(0.1), scale, color: col.ink });
    y += textH(T, scale) + gap * 1.3;
    drawText(r, M, x, y, { reveal: e(0.18), color: withA(col.ink, 0.6) });
  };
}

// ---------------------------------------------------------------- 背景装飾

const DECORS = {
  // 背景に巨大な番号（アウトライン）
  number(S) {
    const { tf, theme, W, H, idx, layout, rng } = S;
    const stroke = rng.chance(0.6);
    const size = Math.round(Math.min(W, H) * (W > H ? 0.62 : 0.42));
    const N = tf.get(pad2(idx + 1), { family: theme.font === 'serif' ? 'serif' : 'condensed', size, weight: 900, stroke: stroke ? Math.max(2, size * 0.008) : 0 });
    const onLeft = layout.side === 'right' || (layout.side === 'center' && rng.chance(0.5));
    const x = onLeft ? W * 0.03 : W * 0.97;
    const y = H - textH(N) * 0.86;
    const drift = rng.sign() * W * 0.02;
    return (r, t, D, col) => {
      drawText(r, N, x + drift * (t / D), y, {
        align: onLeft ? 'left' : 'right',
        reveal: expoOut(prog(t, 0.05, 0.85)),
        color: withA(col.ink, stroke ? 0.22 : 0.07),
      });
    };
  },
  // 流れる巨大アウトライン文字の帯
  marquee(S) {
    const { tf, theme, W, H, work, artist, rng } = S;
    const up = (s) => (theme.upper ? s.toUpperCase() : s);
    const str = ` ${up(artist || 'PORTFOLIO')} — ${up(work.title)} —`;
    const size = Math.round(Math.min(W, H) * 0.15);
    const T = tf.get(str, { family: theme.font, size, weight: 900, stroke: Math.max(1.5, size * 0.012) });
    const rows = W > H ? 3 : 4;
    const speed = rng.range(50, 110);
    const dir0 = rng.sign();
    return (r, t, D, col) => {
      const tileW = textW(T) + T.pad;
      for (let k = 0; k < rows; k++) {
        const y = H * ((k + 0.5) / rows) - textH(T) / 2;
        const dir = k % 2 ? -dir0 : dir0;
        const sp = speed * (1 + k * 0.25);
        let off = ((dir * sp * t) % tileW + tileW) % tileW - tileW;
        const e = expoOut(prog(t, 0.05 + k * 0.06, 0.7 + k * 0.06));
        for (let x = off; x < W; x += tileW) {
          drawText(r, T, x, y, { reveal: e, color: withA(col.ink, 0.13) });
        }
      }
    };
  },
  // 細いグリッド線とトンボ
  grid(S) {
    const { W, H, rng } = S;
    const cols = rng.pick([6, 8, 12]);
    const rows = W > H ? 4 : 7;
    const lw = Math.max(1, Math.min(W, H) * 0.0012);
    return (r, t, D, col) => {
      for (let i = 1; i < cols; i++) {
        const e = expoOut(prog(t, 0.02 * i, 0.02 * i + 0.6));
        if (e <= 0) continue;
        r.draw({ x: (W * i) / cols, y: H / 2 - (H * (1 - e)) / 2, w: lw, h: H * e, color: withA(col.ink, 0.1) });
      }
      const m = Math.min(W, H) * 0.012;
      for (let j = 1; j < rows; j++) {
        for (let i = 1; i < cols; i += 2) {
          const e = backOut(prog(t, 0.3 + 0.015 * (i + j), 0.6 + 0.015 * (i + j)));
          if (e <= 0) continue;
          const x = (W * i) / cols, y = (H * j) / rows;
          r.draw({ x, y, w: m * 2 * e, h: lw * 2, color: withA(col.ink, 0.35) });
          r.draw({ x, y, w: lw * 2, h: m * 2 * e, color: withA(col.ink, 0.35) });
        }
      }
    };
  },
  // 作品自体を強くぼかした背景（ミップマップの低解像度段を使うので軽い）
  blur(S) {
    const { W, H, work } = S;
    return (r, t, D, col) => {
      const s = 1.1 + 0.05 * (t / D);
      const b = work.aspect > W / H ? { w: H * s * work.aspect, h: H * s } : { w: W * s, h: (W * s) / work.aspect };
      r.draw({ x: W / 2, y: H / 2, w: b.w, h: b.h, tex: work.tex, lod: 5.5 });
      r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, lum(col.bg) > 0.5 ? 0.72 : 0.62) });
    };
  },
  // 斜めストライプの帯
  stripes(S) {
    const { W, H, rng } = S;
    const y = H * rng.pick([0.28, 0.5, 0.72]);
    const bandH = H * rng.range(0.22, 0.34);
    const rot = rng.pick([-0.12, 0.12, 0]);
    const period = Math.min(W, H) * rng.pick([0.025, 0.04]);
    const ang = rng.sign() * Math.PI / 4;
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0.05, 0.65));
      r.draw({
        x: W / 2, y, w: W * 1.3, h: bandH, rot, mode: 'stripes', color: withA(col.deco, 0.9),
        pat: [period, 0.42, ang, t * 40], mask: { type: 'wipe', p: e, angle: rot >= 0 ? 0 : Math.PI },
      });
    };
  },
  // ドットのパッチ
  dots(S) {
    const { W, H, rng, layout } = S;
    const pw = W * rng.range(0.28, 0.4), ph = H * rng.range(0.35, 0.5);
    const right = layout.side !== 'right';
    const x = right ? W - pw / 2 - W * 0.04 : pw / 2 + W * 0.04;
    const y = rng.chance(0.5) ? ph / 2 + H * 0.06 : H - ph / 2 - H * 0.06;
    const period = Math.min(W, H) * 0.024;
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0.1, 0.8));
      r.draw({ x, y, w: pw, h: ph, mode: 'dots', color: withA(col.deco, 0.85), pat: [period, 0.34, 0, 0], mask: { type: 'blinds', p: e, angle: Math.PI / 2, count: 6, stagger: 0.5 } });
    };
  },
};

// ---------------------------------------------------------------- 振付（作品の見せ方）

const VARIANTS = {
  // 寄り（注目点）で溜めて、一気に引いて全体を見せる
  focus(S) {
    const { work, W, H, beat, D, layout, rng, points } = S;
    const f = points[0];
    const tSnap = Math.min(D - 1.6, beat * rng.pick([1.5, 2, 2.5]));
    const drift = { a: rng.range(0, TAU), d: Math.min(W, H) * 0.035 };
    const close = { ix: f.x, iy: f.y, sx: W / 2, sy: H / 2, hq: closeHq(work, f, W, H, rng.range(0.9, 1.15)) };
    const fit = { ix: 0.5, iy: 0.5, sx: layout.img.x, sy: layout.img.y, hq: layout.img.h };
    S.event(tSnap, 'aberr', 5, 0.45);
    S.event(tSnap, 'shake', 5, 0.25);
    const cam = (t) => {
      const pre = t / tSnap;
      const antic = quadOut(prog(t, tSnap - 0.16, tSnap));
      const e = expoOut(prog(t, tSnap, tSnap + 0.7));
      const c0 = clampFull(work, {
        ...close,
        sx: close.sx + Math.cos(drift.a) * drift.d * pre,
        sy: close.sy + Math.sin(drift.a) * drift.d * pre,
        hq: close.hq * (1 + 0.05 * clamp(pre)) * (1 + 0.04 * antic),
      }, W, H);
      const c = camLerp(c0, fit, e);
      c.hq *= 1 + 0.03 * prog(t, tSnap + 0.7, D);
      return c;
    };
    const text = makeTextBlock(S);
    return (r, t, col, hint) => {
      const c = cam(t);
      const prev = cam(t - 1 / 60);
      drawCam(r, work, c, prev, { shutter: 0.6 });
      const sp = Math.abs(Math.log(c.hq / prev.hq)) * 60; // ズーム速度
      hint.radial = clamp(sp * 0.02, 0, 0.35);
      hint.cx = c.sx / W; hint.cy = 1 - c.sy / H;
      text(r, t, tSnap + 0.35, col);
    };
  },

  // 拍ごとの寄りカット → カラーブロックで全体を開示
  cuts(S) {
    const { work, W, H, beat, D, layout, rng, points } = S;
    const unit = beat * (D / beat >= 8 ? 1 : 0.75);
    const k = D / beat >= 8 ? 3 : 2;
    const shots = points.slice(0, k).map((p, i) => ({
      p,
      hq: closeHq(work, p, W, H, rng.range(0.8, 1.3)),
      dx: rng.range(-1, 1) * W * 0.03, dy: rng.range(-1, 1) * H * 0.03,
      rot: rng.chance(0.3) ? rng.sign() * 0.03 : 0,
      panel: i > 0 && rng.chance(0.35),
    }));
    const tR = k * unit;
    for (let i = 1; i < k; i++) {
      S.event(i * unit, 'flash', 0.22, 0.14);
      S.event(i * unit, 'aberr', 3, 0.25);
    }
    S.event(tR, 'aberr', 2.5, 0.3);
    const ang = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const text = makeTextBlock(S);
    const img = layout.img;
    return (r, t, col) => {
      if (t < tR) {
        const i = Math.min(k - 1, Math.floor(t / unit));
        const s = shots[i];
        const lt = t - i * unit;
        const punch = 1 + 0.09 * (1 - expoOut(prog(lt, 0, 0.35)));
        const c = clampFull(work, {
          ix: s.p.x, iy: s.p.y,
          sx: W / 2 + s.dx * (lt / unit), sy: H / 2 + s.dy * (lt / unit),
          hq: s.hq * punch * (1 + 0.04 * lt / unit),
        }, W, H);
        if (s.panel) {
          // 枠の中に寄り（周囲は背景）
          const pw = W * 0.62, ph = H * 0.7;
          const uv = coverUV(work, pw, ph, s.p.x, s.p.y, panelZoom(work, s.p, pw, ph) * punch);
          r.draw({ x: W / 2, y: H / 2, w: pw + 10, h: ph + 10, color: col.accent });
          r.draw({ x: W / 2, y: H / 2, w: pw, h: ph, tex: work.tex, uv, rot: s.rot });
        } else {
          r.cam.r = s.rot;
          drawCam(r, work, c, null);
          r.cam.r = 0;
        }
        return;
      }
      const lt = t - tR;
      // カラーブロックが通過して絵が現れる
      const pin = expoOut(prog(lt, 0, 0.26));
      const pout = expoOut(prog(lt, 0.2, 0.62));
      const s = 1 + 0.07 * (1 - expoOut(prog(lt, 0.2, 0.9))) + 0.025 * prog(lt, 0.9, D - tR);
      if (lt >= 0.2) r.draw({ x: img.x, y: img.y, w: img.w * s, h: img.h * s, tex: work.tex });
      if (pout < 1) {
        r.draw({
          x: img.x, y: img.y, w: img.w * s, h: img.h * s, color: col.accent,
          mask: lt < 0.2 ? { type: 'wipe', p: pin, angle: ang } : { type: 'wipe', p: 1 - pout, angle: ang + Math.PI },
        });
      }
      text(r, t, tR + 0.3, col);
    };
  },

  // 分割パネル: 大パネル＋寄りパネル
  split(S) {
    const { work, W, H, beat, D, rng, points, minDim } = S;
    const land = W / H > 1.2;
    const m = minDim * 0.06, g = minDim * 0.022;
    const bigLeft = rng.chance(0.5);
    let big, det, textLayout;
    if (land) {
      const bw = Math.min(W * 0.56, (H - 2 * m) * Math.max(0.8, Math.min(work.aspect, 1.5)));
      const colW = W - 2 * m - g - bw;
      const bx = bigLeft ? m + bw / 2 : W - m - bw / 2;
      const cx = bigLeft ? m + bw + g + colW / 2 : m + colW / 2;
      big = { x: bx, y: H / 2, w: bw, h: H - 2 * m };
      const dh = (H - 2 * m) * 0.56;
      det = { x: cx, y: m + dh / 2, w: colW, h: dh };
      textLayout = { x: cx - colW / 2, y: H - m, maxW: colW, stack: 'side' };
    } else {
      const bh = (H - 2 * m) * 0.6;
      big = { x: W / 2, y: m + bh / 2, w: W - 2 * m, h: bh };
      const dw = (W - 2 * m - g) * 0.48;
      const dh = H - 2 * m - bh - g;
      const dx = bigLeft ? m + dw / 2 : W - m - dw / 2;
      det = { x: dx, y: m + bh + g + dh / 2, w: dw, h: dh };
      const tx = bigLeft ? m + dw + g * 1.5 : m;
      textLayout = { x: tx, y: H - m, maxW: W - 2 * m - dw - g * 1.5, stack: 'side' };
    }
    const f0 = points[0], f1 = points[1], f2 = points[2];
    const zBig = panelZoom(work, { ...f0, size: 0.9 }, big.w, big.h, 1);
    const zBig2 = panelZoom(work, f1, big.w, big.h, 0.9);
    const zDet = panelZoom(work, f0, det.w, det.h, 1.1);
    const zDet2 = panelZoom(work, f2, det.w, det.h, 1.1);
    const t1 = Math.min(D - 1.5, beat * 3), t2 = Math.min(D - 1.0, beat * 4.5);
    S.event(t1, 'flash', 0.18, 0.12);
    S.event(t2, 'aberr', 3, 0.3);
    const angBig = bigLeft ? 0 : Math.PI;
    const text = makeTextBlock({ ...S, layout: { ...S.layout, text: textLayout } });
    return (r, t, col) => {
      // 大パネル: ワイプで開き、中の絵は逆方向へ流れる（視差）
      const eb = expoOut(prog(t, 0.05, 0.65));
      const par = (1 - eb) * 0.12 * (bigLeft ? 1 : -1);
      const ez = snap(prog(t, t2 - 0.25, t2 + 0.35));
      const zb = Math.exp(lerp(Math.log(zBig), Math.log(zBig2), ez)) * (1 + 0.03 * t / D);
      const cxB = lerp(f0.x, f1.x, ez) + par, cyB = lerp(Math.max(0.35, f0.y), f1.y, ez);
      const uvB = coverUV(work, big.w, big.h, cxB, cyB, zb);
      const prevE = snap(prog(t - 1 / 60, t2 - 0.25, t2 + 0.35));
      const blurB = [(ez - prevE) * (f1.x - f0.x) * -1, (ez - prevE) * (f1.y - f0.y) * -1];
      r.draw({ x: big.x, y: big.y, w: big.w, h: big.h, tex: work.tex, uv: uvB, blur: blurB, mask: { type: 'wipe', p: eb, angle: angBig } });
      // 寄りパネル: 下から開き、途中で別の注目点へカット
      const ed = expoOut(prog(t, 0.2, 0.75));
      const second = t >= t1;
      const lt = second ? t - t1 : t;
      const punch = 1 + 0.08 * (1 - expoOut(prog(lt, 0, 0.35)));
      const f = second ? f2 : f0;
      const uvD = coverUV(work, det.w, det.h, f.x, f.y, (second ? zDet2 : zDet) * punch * (1 + 0.04 * lt));
      r.draw({ x: det.x, y: det.y, w: det.w, h: det.h, color: col.accent, mask: { type: 'wipe', p: expoOut(prog(t, 0.15, 0.55)), angle: -Math.PI / 2 } });
      r.draw({ x: det.x, y: det.y, w: det.w, h: det.h, tex: work.tex, uv: uvD, mask: { type: 'wipe', p: ed, angle: -Math.PI / 2 } });
      text(r, t, 0.45, col);
    };
  },

  // 全面でパン（タメて一気に移動）→ 引き
  pan(S) {
    const { work, W, H, beat, D, layout, rng, points } = S;
    const p0 = points[0];
    let p1 = points[1];
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.2) p1 = { ...p1, x: 1 - p0.x, y: clamp(1 - p0.y, 0.2, 0.8) };
    const hq = Math.min(closeHq(work, p0, W, H, 0.7), closeHq(work, p1, W, H, 0.7));
    const tA = beat * 1.5, tB = Math.min(D - 1.5, beat * 3.5);
    S.event(tA + 0.25, 'aberr', 3, 0.3);
    S.event(tB, 'shake', 4, 0.2);
    const fit = { ix: 0.5, iy: 0.5, sx: layout.img.x, sy: layout.img.y, hq: layout.img.h };
    const text = makeTextBlock(S);
    const cam = (t) => {
      const ep = expoInOut(prog(t, tA, tA + 0.55));
      const hold = 0.03 * (t < tA ? t / tA : 1);
      let c = clampFull(work, {
        ix: lerp(p0.x, p1.x, ep) + (p1.x - p0.x) * hold * (1 - ep),
        iy: lerp(p0.y, p1.y, ep) + (p1.y - p0.y) * hold * (1 - ep),
        sx: W / 2, sy: H / 2, hq: hq * (1 + 0.03 * prog(t, 0, tB)),
      }, W, H);
      const ez = expoOut(prog(t, tB, tB + 0.65));
      c = camLerp(c, fit, ez);
      c.hq *= 1 + 0.025 * prog(t, tB + 0.65, D);
      return c;
    };
    return (r, t, col, hint) => {
      const c = cam(t), prev = cam(t - 1 / 60);
      drawCam(r, work, c, prev, { shutter: 1 });
      const sp = Math.abs(Math.log(c.hq / prev.hq)) * 60;
      hint.radial = clamp(sp * 0.02, 0, 0.3);
      hint.cx = c.sx / W; hint.cy = 1 - c.sy / H;
      text(r, t, tB + 0.35, col);
    };
  },

  // カード＋残像＋注目点のコールアウト（虫眼鏡）
  card(S) {
    const { work, W, H, beat, D, layout, rng, points, minDim } = S;
    const img = { ...layout.img, w: layout.img.w * 0.86, h: layout.img.h * 0.86 };
    const b = minDim * 0.012;
    const rot0 = rng.sign() * rng.range(0.1, 0.18);
    const echo = [
      { dx: b * 2.5, dy: b * 2.5, delay: 0.06 },
      { dx: b * 5, dy: b * 5, delay: 0.12 },
    ];
    const calls = points.slice(0, 2).map((p, i) => {
      const fx = img.x + (p.x - 0.5) * img.w, fy = img.y + (p.y - 0.5) * img.h;
      let dx = fx - img.x, dy = fy - img.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      if (dl < 2) { dx = i ? -0.7 : 0.7; dy = -0.7; }
      const ri = minDim * 0.11;
      const dist = Math.max(img.w, img.h) * 0.28 + ri;
      let cx = fx + dx * dist, cy = fy + dy * dist;
      cx = clamp(cx, ri + minDim * 0.03, W - ri - minDim * 0.03);
      cy = clamp(cy, ri + minDim * 0.03, H - ri - minDim * 0.03);
      const q = Math.max(0.06, p.size * 0.6 * Math.min(1, work.aspect));
      const du = q / work.aspect;
      return { fx, fy, cx, cy, ri, uv: [p.x - du / 2, p.y - q / 2, p.x + du / 2, p.y + q / 2], t: Math.min(D - 0.9, beat * (2.5 + i * 1.5)) };
    });
    for (const c of calls) S.event(c.t, 'aberr', 2, 0.2);
    const text = makeTextBlock(S);
    const pose = (t) => {
      const e = expoOut(prog(t, 0.05, 0.75));
      const eb = backOut(prog(t, 0.05, 0.6), 1.6);
      return { s: lerp(0.62, 1, eb) * (1 + 0.02 * prog(t, 0.75, D)), rot: rot0 * (1 - e), dy: H * 0.12 * (1 - e) };
    };
    return (r, t, col) => {
      for (let k = echo.length - 1; k >= 0; k--) {
        const E = echo[k];
        const p = pose(t - E.delay);
        if (t < E.delay) continue;
        r.draw({ x: img.x + E.dx, y: img.y + E.dy + p.dy, w: (img.w + b * 2) * p.s, h: (img.h + b * 2) * p.s, rot: p.rot, color: k === 0 ? col.accent : withA(col.ink, 0.5) });
      }
      const p = pose(t);
      r.draw({ x: img.x, y: img.y + p.dy, w: (img.w + b * 2) * p.s, h: (img.h + b * 2) * p.s, rot: p.rot, color: col.ink });
      r.draw({ x: img.x, y: img.y + p.dy, w: img.w * p.s, h: img.h * p.s, rot: p.rot, tex: work.tex });
      for (const c of calls) {
        const lt = t - c.t;
        if (lt < 0) continue;
        const eRing = backOut(prog(lt, 0, 0.3), 2);
        const eLine = snapSoft(prog(lt, 0.05, 0.35));
        const eDisc = backOut(prog(lt, 0.2, 0.55), 1.4);
        const rr = minDim * 0.035;
        const fx = img.x + (c.fx - img.x) * p.s, fy = img.y + (c.fy - img.y) * p.s + p.dy;
        r.draw({ x: fx, y: fy, w: rr * 2 * eRing, h: rr * 2 * eRing, mode: 'ring', pat: [0, Math.max(3, minDim * 0.004), 0, 0], color: col.accent });
        const vx = c.cx - fx, vy = c.cy - fy, L = Math.hypot(vx, vy);
        const L0 = rr, L1 = L - c.ri;
        if (eLine > 0 && L1 > L0) {
          const len = (L1 - L0) * eLine;
          const mid = L0 + len / 2;
          r.draw({ x: fx + (vx / L) * mid, y: fy + (vy / L) * mid, w: len, h: Math.max(2, minDim * 0.003), rot: Math.atan2(vy, vx), color: col.accent });
        }
        if (eDisc > 0) {
          const R = c.ri * eDisc;
          r.draw({ x: c.cx, y: c.cy, w: (R + minDim * 0.007) * 2, h: (R + minDim * 0.007) * 2, mode: 'disc', color: col.accent });
          r.draw({ x: c.cx, y: c.cy, w: R * 2, h: R * 2, tex: work.tex, uv: c.uv, mask: { type: 'circle', p: 0.7071, soft: 1.5 } });
        }
      }
      text(r, t, 0.55, col);
    };
  },
};

// ---------------------------------------------------------------- トランジション（出/入り）

const EXIT_DUR = 0.34, ENTRY_DUR = 0.52;

function transitionHint(tr, phase, p, dt, W, H) {
  // phase: 'out' | 'in'、p: 0..1（生の進捗）、dt: 1フレーム分の進捗
  const h = {};
  if (!tr) return h;
  switch (tr.type) {
    case 'whip': {
      if (phase === 'out') {
        const e = antic(p, 0.35, 0.04), e0 = antic(Math.max(0, p - dt), 0.35, 0.04);
        h.ox = tr.dx * e; h.oy = tr.dy * e;
        h.bx = tr.dx * (e - e0) * 1.2; h.by = tr.dy * (e - e0) * 1.2;
      } else {
        const e = 1 - expoOut(p), e0 = 1 - expoOut(Math.max(0, p - dt));
        h.ox = -tr.dx * e; h.oy = -tr.dy * e;
        h.bx = tr.dx * (e0 - e) * 1.2; h.by = tr.dy * (e0 - e) * 1.2;
      }
      break;
    }
    case 'zoom': {
      if (phase === 'out') {
        const e = antic(p, 0.3, 0.05);
        h.scale = Math.exp(Math.log(7) * e);
        h.cx = tr.ox; h.cy = tr.oy;
        h.radial = clamp(expoIn(p) * 0.6, 0, 0.5);
      } else {
        const e = 1 - expoOut(p);
        h.scale = 1 + 2.5 * e;
        h.cx = tr.ix; h.cy = tr.iy;
        h.radial = clamp(e * 0.5, 0, 0.5);
      }
      break;
    }
    case 'iris': {
      if (phase === 'out') { h.circle = Math.max(0.0001, 1 - expoIn(p)); h.mx = tr.ox; h.my = tr.oy; }
      else { h.circle = Math.max(0.0001, expoOut(p)); h.mx = tr.ix; h.my = tr.iy; }
      break;
    }
    case 'slices': {
      h.slices = tr.count; h.sliceAxis = tr.axis;
      h.sliceP = p; h.sliceDir = phase === 'out' ? 1 : -1;
      break;
    }
    case 'glitch': {
      h.glitch = phase === 'out' ? p * p : (1 - p) * (1 - p);
      break;
    }
    case 'cut': {
      if (phase === 'in') { h.scale = 1 + 0.08 * (1 - expoOut(p)); }
      break;
    }
    default:
  }
  return h;
}

// ---------------------------------------------------------------- 本体

export function buildFilm(opts) {
  const { works, seed, W, H, tf, pace = 'normal', artist = '', subline = '', handle = '' } = opts;
  const year = opts.year || new Date().getFullYear();
  const rng = createRng(`${seed}|${works.length}|${W}x${H}|${pace}`);
  const themeName = opts.theme && THEMES[opts.theme] ? opts.theme : rng.pick(Object.keys(THEMES));
  const theme = THEMES[themeName];
  const P = PACE[pace] || PACE.normal;
  const bpm = Math.round(rng.range(theme.bpm[0], theme.bpm[1]) + P.bpm);
  const beat = 60 / bpm;
  const minDim = Math.min(W, H);
  const events = [];
  const segments = [];
  const up = (s) => (theme.upper ? s.toUpperCase() : s);

  const workColors = works.map((w) => colorsFor(w, theme));
  const globalCol = workColors[0] || colorsFor({ roles: { dominant: [0.1, 0.1, 0.1], accent: [1, 0.3, 0.3] } }, theme);

  // ---- トランジション列（境界ごと）
  const nBound = works.length + 1;
  const transitions = [];
  let prevType = null;
  for (let i = 0; i < nBound; i++) {
    let type = rng.weighted(theme.trans, prevType ? [prevType] : []);
    if (i === nBound - 1 && type === 'glitch') type = 'bars';
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = rng.chance(0.7) ? dirs[rng.int(0, 1)] : dirs[rng.int(2, 3)];
    transitions.push({
      type, dx: d[0], dy: d[1],
      axis: rng.int(0, 1), count: rng.int(5, 9),
      bars: rng.int(1, 4), barAngle: rng.pick([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI * 3 / 4]),
    });
    prevType = type;
  }

  let cursor = 0;
  const addEvent = (t, kind, amt, dur, color) => events.push({ t, kind, amt, dur, color });

  // ---- オープニング
  {
    const D = beat * 6;
    const start = cursor;
    const mont = Math.min(12, Math.max(6, works.length * 2));
    const tName = beat * 2.5;
    const montDur = tName / mont;
    const shots = [];
    for (let i = 0; i < mont; i++) {
      const w = works[i % works.length];
      const f = pointsFor(w, 1 + (i >> 1) % 3, rng)[(i >> 1) % 3] || w.focal[0];
      shots.push({ w, f, win: rng.chance(0.4), rot: rng.chance(0.25) ? rng.sign() * 0.04 : 0, hq: closeHq(w, f, W, H, rng.range(0.6, 1.1)) });
    }
    const name = up(artist || 'PORTFOLIO');
    let nameSize = Math.round(minDim * (W > H ? 0.16 : 0.13));
    const NT = tf.get(name, { family: theme.font, size: nameSize, weight: theme.weight + 100 > 900 ? 900 : theme.weight + 100, tracking: theme.tracking });
    const nScale = Math.min(1, (W * 0.84) / textW(NT));
    const sub = up(subline || (artist ? `PORTFOLIO ${year}` : `SELECTED WORKS ${year}`));
    const ST = tf.get(sub, { family: 'mono', size: Math.round(minDim * 0.024), weight: 600, tracking: 0.3 });
    const CT = tf.get(`${pad2(works.length)} WORKS`, { family: 'mono', size: Math.round(minDim * 0.02), weight: 600, tracking: 0.25 });
    const LT = tf.get('SELECTED WORKS', { family: 'mono', size: Math.round(minDim * 0.02), weight: 600, tracking: 0.4 });
    for (let i = 1; i < mont; i++) addEvent(start + i * montDur, 'flash', 0.12, 0.08);
    addEvent(start + tName, 'flash', 0.6, 0.22);
    addEvent(start + tName, 'shake', 8, 0.3);
    addEvent(start + tName, 'aberr', 6, 0.4);
    const decor = rng.chance(0.5) ? DECORS.grid({ W, H, rng }) : null;
    segments.push({
      kind: 'opener', start, dur: D, col: globalCol, outT: transitions[0],
      draw(r, t, col) {
        if (t < tName) {
          const i = Math.min(mont - 1, Math.floor(t / montDur));
          const s = shots[i];
          const lt = t - i * montDur;
          const punch = 1 + 0.12 * (1 - expoOut(prog(lt, 0, montDur)));
          if (s.win) {
            const pw = W * 0.5, ph = H * 0.56;
            const uv = coverUV(s.w, pw, ph, s.f.x, s.f.y, panelZoom(s.w, s.f, pw, ph) * punch);
            r.draw({ x: W / 2, y: H / 2, w: pw, h: ph, tex: s.w.tex, uv, rot: s.rot });
          } else {
            r.cam.r = s.rot;
            drawCam(r, s.w, clampFull(s.w, { ix: s.f.x, iy: s.f.y, sx: W / 2, sy: H / 2, hq: s.hq * punch }, W, H), null);
            r.cam.r = 0;
          }
          const blink = Math.floor(t / (beat / 4)) % 2 === 0;
          if (blink) drawText(r, LT, W / 2, H - minDim * 0.08, { align: 'center', color: withA([1, 1, 1], 0.9) });
          return;
        }
        const lt = t - tName;
        if (decor) decor(r, lt, D - tName, col);
        const e = expoOut(prog(lt, 0, 0.6));
        const s = nScale * (1 + 0.12 * (1 - expoOut(prog(lt, 0, 0.8))));
        const nh = textH(NT, s);
        const y = H / 2 - nh / 2 - minDim * 0.02;
        drawText(r, NT, W / 2, y, { align: 'center', scale: s, reveal: e, color: col.ink });
        const eb = snap(prog(lt, 0.15, 0.6));
        const bw = textW(NT, nScale) * eb;
        r.draw({ x: W / 2, y: y + nh + minDim * 0.035, w: bw, h: Math.max(4, minDim * 0.007), color: col.accent });
        drawText(r, ST, W / 2, y + nh + minDim * 0.07, { align: 'center', reveal: expoOut(prog(lt, 0.3, 0.85)), color: col.ink });
        drawText(r, CT, W / 2, y - minDim * 0.07, { align: 'center', reveal: expoOut(prog(lt, 0.4, 0.95)), color: withA(col.ink, 0.6) });
      },
    });
    cursor += D;
  }

  // ---- 作品
  const varKeys = [];
  const decorKeys = [];
  works.forEach((work, idx) => {
    const D = beat * P.beats;
    const start = cursor;
    const srng = rng.fork('work' + idx);
    const vkey = srng.weighted(theme.variants, varKeys.slice(-1));
    varKeys.push(vkey);
    const side = srng.pick(['left', 'right']);
    const layout = layoutFor(work, W, H, idx % 2 ? (side === 'left' ? 'right' : 'left') : side);
    const S = {
      work, idx, total: works.length, artist, year, W, H, beat, D, rng: srng, tf, theme, minDim, layout,
      points: pointsFor(work, 3, srng),
      event: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color),
    };
    const dkeys = [srng.weighted(theme.decor, decorKeys.slice(-1))];
    if (srng.chance(0.35)) dkeys.push(srng.weighted(theme.decor, dkeys));
    decorKeys.push(dkeys[0]);
    const decors = dkeys.map((k) => DECORS[k](S));
    const body = VARIANTS[vkey](S);
    segments.push({
      kind: 'work', idx, variant: vkey, decor: dkeys, start, dur: D, col: workColors[idx], work, layout,
      inT: transitions[idx], outT: transitions[idx + 1],
      draw(r, t, col, hint) {
        for (const d of decors) d(r, t, D, col);
        body(r, t, col, hint);
      },
    });
    cursor += D;
  });

  // ---- エンディング（グリッド）
  {
    const D = beat * 8;
    const start = cursor;
    const land = W / H > 1.2;
    const n = works.length;
    const grids = land
      ? [[3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3], [4, 3], [5, 3], [5, 3], [5, 3]]
      : [[2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 4], [2, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 5], [3, 5], [3, 5]];
    const [cols, rows] = n <= grids.length ? grids[n - 1] : land ? [6, 4] : [4, 6];
    const gap = minDim * 0.008;
    const tiles = [];
    const order = rng.shuffle([...Array(cols * rows).keys()]);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const w = works[k % n];
        const f = w.focal[Math.floor(k / n) % w.focal.length] || w.focal[0];
        const tw_ = (W - gap * (cols + 1)) / cols, th_ = (H - gap * (rows + 1)) / rows;
        tiles.push({
          w, f, x: gap + tw_ / 2 + i * (tw_ + gap), y: gap + th_ / 2 + j * (th_ + gap), tw: tw_, th: th_,
          delay: 0.05 + (order.indexOf(k) / (cols * rows)) * 1.1,
          ang: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
          z: panelZoom(w, { ...f, size: Math.max(f.size, 0.45) }, tw_, th_, 1),
        });
      }
    }
    const tZoom = beat * 3;
    const name = up(artist || 'PORTFOLIO');
    const NT = tf.get(name, { family: theme.font, size: Math.round(minDim * 0.11), weight: theme.weight, tracking: theme.tracking });
    const nScale = Math.min(1, (W * 0.8) / textW(NT));
    const TY = tf.get('THANK YOU FOR WATCHING', { family: 'mono', size: Math.round(minDim * 0.022), weight: 600, tracking: 0.35 });
    const HT = handle ? tf.get(handle, { family: 'mono', size: Math.round(minDim * 0.026), weight: 700, tracking: 0.1 }) : null;
    addEvent(start + tZoom, 'shake', 4, 0.2);
    segments.push({
      kind: 'closer', start, dur: D, col: globalCol, inT: transitions[nBound - 1], outT: { type: 'cut' },
      draw(r, t, col) {
        const ez = snap(prog(t, tZoom - 0.2, tZoom + 0.4));
        r.cam.s = lerp(1, 0.86, ez) * (1 + 0.02 * prog(t, tZoom + 0.4, D));
        r.cam.r = lerp(0, -0.035, ez);
        for (const tl of tiles) {
          const e = expoOut(prog(t, tl.delay, tl.delay + 0.5));
          if (e <= 0) continue;
          const z = tl.z * (1 + 0.25 * (1 - e));
          const uv = coverUV(tl.w, tl.tw, tl.th, tl.f.x, tl.f.y, z);
          r.draw({ x: tl.x, y: tl.y, w: tl.tw, h: tl.th, tex: tl.w.tex, uv, mask: { type: 'wipe', p: e, angle: tl.ang } });
        }
        r.resetCam();
        // 暗幕と名前
        const ed = expoOut(prog(t, tZoom, tZoom + 0.5));
        if (ed > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, 0.78 * ed) });
          const ph = textH(NT, nScale) + minDim * 0.2;
          r.draw({ x: W / 2, y: H / 2, w: W, h: ph, color: withA(col.bg, 0.9), mask: { type: 'wipe', p: snap(prog(t, tZoom, tZoom + 0.45)), angle: 0 } });
          const y = H / 2 - textH(NT, nScale) / 2 - minDim * 0.02;
          drawText(r, TY, W / 2, y - minDim * 0.06, { align: 'center', reveal: expoOut(prog(t, tZoom + 0.25, tZoom + 0.8)), color: col.accent });
          drawText(r, NT, W / 2, y, { align: 'center', scale: nScale, reveal: expoOut(prog(t, tZoom + 0.15, tZoom + 0.75)), color: col.ink });
          if (HT) drawText(r, HT, W / 2, y + textH(NT, nScale) + minDim * 0.04, { align: 'center', reveal: expoOut(prog(t, tZoom + 0.35, tZoom + 0.9)), color: withA(col.ink, 0.75) });
        }
      },
    });
    cursor += D;
  }

  const duration = cursor;

  // ---- 境界ごとのトランジション固有パラメータ（注目点・演出用の色・イベント）
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i], b = segments[i + 1];
    const tr = a.outT;
    const fa = a.work ? a.work.focal[0] : { x: 0.5, y: 0.5 };
    const fb = b.work ? b.work.focal[0] : { x: 0.5, y: 0.5 };
    // 注目点の画面位置（引き終わりのレイアウト基準。split 等では近似）
    const scr = (seg, f) => {
      if (!seg.work) return [0.5, 0.5];
      const L = seg.layout;
      return [(L.img.x + (f.x - 0.5) * L.img.w) / W, 1 - (L.img.y + (f.y - 0.5) * L.img.h) / H];
    };
    const [ox, oy] = scr(a, fa);
    tr.ox = ox; tr.oy = oy;
    // 入りはセグメント冒頭（多くは寄り＝画面中央が注目点）
    tr.ix = 0.5; tr.iy = 0.5;
    tr.color = b.col.accent;
    const T = b.start;
    if (tr.type === 'whip') addEvent(T, 'aberr', 5, 0.3);
    if (tr.type === 'zoom') addEvent(T, 'flash', 0.45, 0.2);
    if (tr.type === 'cut') { addEvent(T, 'flash', 0.5, 0.16); addEvent(T, 'aberr', 4, 0.25); }
    if (tr.type === 'glitch') addEvent(T - 0.2, 'aberr', 10, 0.5);
    if (tr.type === 'slices') addEvent(T, 'aberr', 3, 0.3);
    if (tr.type === 'bars') addEvent(T, 'shake', 3, 0.15);
  }
  // ループ時の頭（クロージング→オープニング）
  addEvent(0, 'flash', 0.8, 0.3);

  // ---- 描画
  const fx = { aberr: 0, grain: theme.grain, vignette: theme.vignette, flash: [1, 1, 1, 0], shakeX: 0, shakeY: 0 };
  const hint = {};
  const HUD = makeHud({ tf, theme, W, H, minDim, works, artist, year, up });

  function segmentAt(t) {
    for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].start) return i;
    return 0;
  }

  function evalFx(t) {
    fx.aberr = theme.aberrBase || 0;
    fx.flash[3] = 0;
    fx.shakeX = 0; fx.shakeY = 0;
    for (const ev of events) {
      const lt = t - ev.t;
      if (lt < 0 || lt > ev.dur) continue;
      const k = 1 - lt / ev.dur;
      const k2 = k * k;
      if (ev.kind === 'flash') {
        if (ev.amt * k2 > fx.flash[3]) {
          fx.flash[3] = ev.amt * k2;
          const c = ev.color || [1, 1, 1];
          fx.flash[0] = c[0]; fx.flash[1] = c[1]; fx.flash[2] = c[2];
        }
      } else if (ev.kind === 'aberr') fx.aberr += ev.amt * k2;
      else if (ev.kind === 'shake') {
        const a = ev.amt * k2 / H;
        fx.shakeX += Math.sin(t * 91.7 + ev.t * 13) * a;
        fx.shakeY += Math.cos(t * 77.3 + ev.t * 7) * a;
      }
    }
    return fx;
  }

  function render(r, t) {
    t = clamp(t, 0, duration - 1e-4);
    r.beginFrame();
    const i = segmentAt(t);
    const seg = segments[i];
    const lt = t - seg.start;
    const col = seg.col;
    for (const k in hint) delete hint[k];

    r.target(0, [0, 0, 0, 0]);
    r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: col.bg, cam: false });
    seg.draw(r, lt, col, hint);

    // トランジション合成
    const dt = 1 / 60;
    let comp = {};
    const outStart = seg.dur - EXIT_DUR;
    if (seg.outT && seg.outT.type !== 'bars' && lt >= outStart) {
      comp = transitionHint(seg.outT, 'out', prog(lt, outStart, seg.dur), dt / EXIT_DUR, W, H);
    } else if (seg.inT && seg.inT.type !== 'bars' && lt < ENTRY_DUR && i > 0) {
      comp = transitionHint(seg.inT, 'in', prog(lt, 0, ENTRY_DUR), dt / ENTRY_DUR, W, H);
    }
    if (hint.radial) {
      comp.radial = Math.max(comp.radial || 0, hint.radial);
      if (comp.cx === undefined) { comp.cx = hint.cx; comp.cy = hint.cy; }
    }
    comp.time = t;
    r.target(2, [0, 0, 0, 0]);
    r.composite(0, comp);

    // オーバーレイ: バー型トランジション
    r.toMain();
    let bgCol = col.bg;
    for (let b = 0; b < segments.length - 1; b++) {
      const tr = segments[b].outT;
      if (tr.type !== 'bars') continue;
      const T = segments[b + 1].start;
      if (t < T - 0.4 || t > T + 0.6) continue;
      drawBars(r, tr, t - T, W, H, segments[b].col, segments[b + 1].col);
    }
    if (seg.inT && seg.inT.type === 'iris' && lt < ENTRY_DUR) bgCol = seg.inT.color;
    if (seg.outT && seg.outT.type === 'iris' && lt >= outStart) bgCol = seg.outT.color;

    if (theme.hud) HUD(r, t, seg, i, lt, col);
    r.present(evalFx(t), bgCol, t);
  }

  function dispose() { /* テキストは TextFactory 側で一括破棄 */ }

  return {
    duration, bpm, beat, theme: themeName, segments, events, render, dispose,
    summary: segments.map((s) => ({ kind: s.kind, start: s.start, dur: s.dur, variant: s.variant, decor: s.decor, out: s.outT && s.outT.type })),
  };
}

// カラーバーが通過して画面を切り替える
function drawBars(r, tr, lt, W, H, colA, colB) {
  const n = tr.bars;
  const ang = tr.barAngle;
  const diag = Math.hypot(W, H);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  // 進行方向に直交する帯を n 本。全体で画面を覆う
  const cols = [colB.accent, colA.ink, colB.bg, colA.accent];
  for (let k = 0; k < n; k++) {
    const d = k * 0.045;
    const pin = expoIn(prog(lt, -0.34 + d, 0 + d * 0.3));
    const pout = expoOut(prog(lt, 0.02 + d, 0.5 + d));
    if (pin <= 0 || pout >= 1) continue;
    // 帯: 直交方向に幅 diag/n、進行方向に長さ diag
    const off = (k - (n - 1) / 2) * (diag / n);
    const x = W / 2 - sn * off, y = H / 2 + cs * off;
    const mask = pout > 0 ? { type: 'wipe', p: 1 - pout, angle: ang + Math.PI } : { type: 'wipe', p: pin, angle: ang };
    r.draw({ x, y, w: diag * 1.02, h: diag / n + 2, rot: ang, color: cols[k % cols.length], mask, cam: false });
  }
}

// 常駐 HUD: 作家名・通し番号・進行ティック
function makeHud({ tf, theme, W, H, minDim, works, artist, year, up }) {
  const m = minDim * 0.045;
  const fs = Math.round(minDim * 0.016);
  const A = tf.get(up(artist || 'PORTFOLIO'), { family: 'mono', size: fs, weight: 700, tracking: 0.25 });
  const R = tf.get(`PORTFOLIO — ${year}`, { family: 'mono', size: fs, weight: 500, tracking: 0.25 });
  const nums = works.map((_, i) => tf.get(pad2(i + 1), { family: 'mono', size: Math.round(minDim * 0.03), weight: 700, tracking: 0.05 }));
  const TOT = tf.get(`/ ${pad2(works.length)}`, { family: 'mono', size: fs, weight: 500, tracking: 0.2 });
  const n = works.length;
  const tickW = Math.min(minDim * 0.03, (W * 0.3) / n), tickG = tickW * 0.35, tickH = Math.max(3, minDim * 0.004);
  return (r, t, seg, i, lt, col) => {
    if (seg.kind !== 'work') return;
    const vis = seg.idx === 0 ? expoOut(prog(lt, 0.1, 0.6)) : seg.idx === n - 1 ? 1 - expoIn(prog(lt, seg.dur - 0.3, seg.dur)) : 1;
    if (vis <= 0) return;
    const ink = withA(col.ink, 0.85 * vis);
    drawText(r, A, m, m, { color: ink, reveal: vis });
    drawText(r, R, W - m, m, { align: 'right', color: ink, reveal: vis });
    // 番号: 切り替わりで下からせり上がる
    const N = nums[seg.idx];
    const eN = expoOut(prog(lt, 0.05, 0.5));
    const yb = H - m - textH(N);
    drawText(r, N, m, yb, { reveal: eN * vis, color: withA(col.ink, vis) });
    drawText(r, TOT, m + textW(N) + minDim * 0.012, yb + textH(N) - textH(TOT), { color: ink, reveal: vis });
    // 進行ティック
    const total = n * tickW + (n - 1) * tickG;
    let x = W - m - total + tickW / 2;
    const y = H - m - tickH / 2;
    for (let k = 0; k < n; k++) {
      r.draw({ x, y, w: tickW, h: tickH, color: withA(col.ink, 0.25 * vis) });
      let fill = k < seg.idx ? 1 : k === seg.idx ? lt / seg.dur : 0;
      if (fill > 0) r.draw({ x: x - tickW / 2 + (tickW * fill) / 2, y, w: tickW * fill, h: tickH, color: withA(k === seg.idx ? col.accent : col.ink, vis) });
      x += tickW + tickG;
    }
  };
}
