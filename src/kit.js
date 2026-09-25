// 演出共通の部品: 色・注目点・画像カメラ・文字配置・レイアウト。
import { rgbToHsl, hslToRgb } from './analyze.js';
import { clamp, lerp, prog, expoOut, snapSoft } from './ease.js';

// ---------------------------------------------------------------- 小道具

export const pad2 = (n) => String(n).padStart(2, '0');
export const TAU = Math.PI * 2;
export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const hsl = (h, s, l) => hslToRgb([h, s, l]).map((v) => v / 255);
export const withA = (c, a) => [c[0], c[1], c[2], a];

export function fitIn(aspect, bw, bh) {
  return aspect > bw / bh ? { w: bw, h: bw / aspect } : { w: bh * aspect, h: bh };
}

// 作品ごとの配色（テーマの背景モードとパレットから）
export function colorsFor(work, theme) {
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
  } else if (theme.bg === 'mono') {
    // MONO: 無彩色の背景と文字。アクセントだけ固定の赤
    bg = [0.055, 0.055, 0.06];
    ink = [0.96, 0.96, 0.96];
    accent = [0.94, 0.2, 0.18];
  } else if (theme.bg === 'neon') {
    // NEON: ほぼ黒の背景に、作品の色相を最大彩度で光らせる
    bg = hsl(ah, 0.5, 0.035);
    ink = hsl(ah, 0.35, 0.95);
    accent = hsl(ah, 1, 0.6);
  } else if (theme.bg === 'pastel') {
    // PASTEL: 作品の色相を淡くした背景、アクセントは同系色の中明度
    bg = hsl(ah, 0.55, 0.89);
    ink = hsl(ah, 0.3, 0.18);
    accent = hsl(ah, 0.6, 0.62);
  } else if (theme.bg === 'paper') {
    // RETRO: 生成り紙の背景、墨色の文字、くすんだアクセント
    bg = [0.93, 0.9, 0.82];
    ink = [0.16, 0.13, 0.11];
    accent = hsl(ah, 0.45, 0.42);
  } else {
    bg = hsl(ah, 0.72, 0.52);
    ink = lum(bg) > 0.5 ? hsl(ah, 0.4, 0.08) : [0.98, 0.97, 0.95];
    // POP: アクセントは補色寄り
    accent = hsl((ah + 0.5) % 1, 0.8, lum(bg) > 0.5 ? 0.35 : 0.6);
  }
  // アクセントが背景に沈む場合は明度をずらす（MONO は固定色なので対象外）
  if (theme.bg !== 'mono' && Math.abs(lum(accent) - lum(bg)) < 0.22) {
    const [h, s, l] = rgbToHsl(accent.map((v) => v * 255));
    accent = hsl(h, s, lum(bg) > 0.5 ? Math.max(0.2, l - 0.3) : Math.min(0.8, l + 0.3));
  }
  return { bg, ink, accent, deco: theme.bg === 'accent' ? mix(bg, ink, 0.22) : accent };
}

// 注目点を n 個そろえる（足りなければ近傍にずらした点を足す）
export function pointsFor(work, n, rng) {
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

export function camQuad(work, c) {
  const hq = c.hq, wq = hq * work.aspect;
  return { x: c.sx - (c.ix - 0.5) * wq, y: c.sy - (c.iy - 0.5) * hq, w: wq, h: hq };
}

export function camLerp(a, b, e) {
  return {
    ix: lerp(a.ix, b.ix, e), iy: lerp(a.iy, b.iy, e),
    sx: lerp(a.sx, b.sx, e), sy: lerp(a.sy, b.sy, e),
    hq: Math.exp(lerp(Math.log(a.hq), Math.log(b.hq), e)),
  };
}

// 全面表示で画像の端が見えないよう注目点側を寄せる
export function clampFull(work, c, W, H) {
  const hq = Math.max(c.hq, H, W / work.aspect);
  const wq = hq * work.aspect;
  // 左端条件: sx - ix*wq <= 0 → ix >= sx/wq ／ 右端条件: sx + (1-ix)*wq >= W → ix <= 1 - (W-sx)/wq
  const ix = clamp(c.ix, c.sx / wq, 1 - (W - c.sx) / wq);
  const iy = clamp(c.iy, c.sy / hq, 1 - (H - c.sy) / hq);
  return { ...c, ix, iy, hq };
}

// 注目点へのズーム量: 注目領域が画面短辺の ~80% に収まる高さ。解像度で上限
export function closeHq(work, f, W, H, mul = 1) {
  const coverHq = Math.max(H, W / work.aspect);
  const shortFrac = f.size * Math.min(1, work.aspect); // 画像高さに対する注目領域の比
  let hq = (Math.min(W, H) * 0.85) / Math.max(0.08, shortFrac) * mul;
  const maxHq = work.height / 0.5; // テクセル密度 0.5 まで（それ以上はボケる）
  hq = Math.min(hq, Math.max(coverHq * 1.35, maxHq));
  return Math.max(hq, coverHq * 1.35);
}

export function drawCam(r, work, c, prev, o = {}) {
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
export function coverUV(work, winW, winH, fx, fy, z) {
  const wa = winW / winH, ia = work.aspect;
  let uw, uh;
  if (ia > wa) { uh = 1; uw = wa / ia; } else { uw = 1; uh = ia / wa; }
  uw /= z; uh /= z;
  const u0 = uw <= 1 ? clamp(fx - uw / 2, 0, 1 - uw) : fx - uw / 2;
  const v0 = uh <= 1 ? clamp(fy - uh / 2, 0, 1 - uh) : fy - uh / 2;
  return [u0, v0, u0 + uw, v0 + uh];
}

export function panelZoom(work, f, winW, winH, mul = 1) {
  const wa = winW / winH, ia = work.aspect;
  const uh = ia > wa ? 1 : ia / wa; // z=1 のときの可視高さ比
  const want = f.size * Math.min(1, ia) * 1.2;
  let z = (uh / Math.max(0.08, want)) * mul;
  const zMax = Math.max(1.2, (uh * work.height) / (winH * 0.5));
  return clamp(z, 1.15, zMax);
}

// ---------------------------------------------------------------- 文字

export function drawText(r, T, x, y, o = {}) {
  if (!T) return; // 未入力の文字列（サブタイトル等）は描かない
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

export const textH = (T, s = 1) => (T.h - 2 * T.pad) * s;
export const textW = (T, s = 1) => (T.w - 2 * T.pad) * s;

// ---------------------------------------------------------------- レイアウト

export function layoutFor(work, W, H, side) {
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
export function makeTextBlock(S) {
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

