// ディレクター: シードから「映像の設計図」を生成し、時刻 t の絵を描く純関数 render(r, t) を返す。
//
// - ランダムな決定はすべてビルド時に行い、描画時は時刻だけで決まる（スクラブ・書き出しが決定的）
// - 時間はテンポ（BPM）の拍で刻む。カットは拍頭に置き、動きは「タメ→ツメ→ピタッ」で設計
// - 作品ごとに「振付（variant）」「背景装飾（decor）」「入り/出のトランジション」を抽選
// - 画像解析の注目点（focal）を寄り・カット割り・パン・コールアウトの着地点に使う

import { createRng } from './rng.js';
import {
  pad2, TAU, lum, withA, colorsFor, pointsFor, camLerp, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, layoutFor, makeTextBlock,
} from './kit.js';
import { OPENERS, CLOSERS, circleP } from './bookends.js';
import {
  clamp, lerp, prog, quadOut, expoIn, expoOut, expoInOut,
  backOut, snap, snapSoft, antic,
} from './ease.js';

// ---------------------------------------------------------------- テーマ

export const VARIANT_KEYS = () => Object.keys(VARIANTS);

export const THEMES = {
  NOIR: {
    label: 'NOIR', bg: 'dark', font: 'sans', weight: 800, tracking: 0.01, upper: true,
    grain: 0.05, vignette: 0.45, hud: true, bpm: [116, 128],
    variants: { focus: 3, cuts: 3, split: 2, pan: 2, card: 1, spotlight: 3, lockon: 2, mosaic: 1, triptych: 2 },
    trans: { whip: 3, zoom: 3, iris: 1, slices: 2, glitch: 1, bars: 2, cut: 2, spin: 1, door: 1 },
    decor: { number: 2, marquee: 2, grid: 1, blur: 3, stripes: 1, dots: 0 },
  },
  SWISS: {
    label: 'SWISS', bg: 'light', font: 'sans', weight: 800, tracking: -0.01, upper: true,
    grain: 0.025, vignette: 0.0, hud: true, bpm: [118, 130],
    variants: { cuts: 3, split: 3, card: 2, focus: 2, pan: 1, mosaic: 3, triptych: 3, lockon: 2, spotlight: 1 },
    trans: { whip: 3, bars: 3, slices: 3, cut: 2, zoom: 1, iris: 1, door: 2, spin: 1 },
    decor: { grid: 3, number: 3, stripes: 1, marquee: 1, dots: 1 },
  },
  POP: {
    label: 'POP', bg: 'accent', font: 'condensed', weight: 900, tracking: 0.02, upper: true,
    grain: 0.03, vignette: 0.15, hud: true, bpm: [124, 136],
    variants: { card: 3, cuts: 3, focus: 2, split: 1, pan: 1, mosaic: 3, triptych: 2, spotlight: 2, lockon: 1 },
    trans: { iris: 3, whip: 2, bars: 3, zoom: 2, slices: 2, cut: 1, spin: 3, door: 2 },
    decor: { stripes: 3, dots: 3, marquee: 2, number: 1 },
  },
  EDITORIAL: {
    label: 'EDITORIAL', bg: 'light', font: 'serif', weight: 500, tracking: 0.0, upper: false,
    grain: 0.035, vignette: 0.1, hud: true, bpm: [108, 120],
    variants: { focus: 3, split: 3, pan: 3, card: 2, cuts: 1, triptych: 3, spotlight: 2, lockon: 1, mosaic: 1 },
    trans: { whip: 2, slices: 2, iris: 1, zoom: 2, bars: 1, cut: 2, door: 2 },
    decor: { number: 3, grid: 2, blur: 1, marquee: 1 },
  },
  GLITCH: {
    label: 'GLITCH', bg: 'dark', font: 'mono', weight: 700, tracking: 0.04, upper: true,
    grain: 0.08, vignette: 0.4, hud: true, bpm: [126, 140], aberrBase: 0.6,
    variants: { cuts: 4, focus: 3, pan: 2, split: 2, card: 1, lockon: 4, mosaic: 2, spotlight: 2, triptych: 1 },
    trans: { glitch: 4, whip: 2, slices: 3, zoom: 2, cut: 3, spin: 2, door: 1 },
    decor: { grid: 3, marquee: 2, number: 2, blur: 2, dots: 1 },
  },
  MONO: {
    label: 'MONO', bg: 'mono', font: 'sans', weight: 900, tracking: -0.02, upper: true,
    grain: 0.06, vignette: 0.3, hud: true, bpm: [120, 132], mono: true,
    variants: { focus: 3, cuts: 3, spotlight: 3, lockon: 2, pan: 2, split: 2, triptych: 1, mosaic: 1, card: 1 },
    trans: { cut: 3, whip: 3, bars: 2, slices: 2, door: 2, zoom: 1 },
    decor: { number: 3, grid: 2, marquee: 2, stripes: 1 },
  },
  NEON: {
    label: 'NEON', bg: 'neon', font: 'condensed', weight: 900, tracking: 0.04, upper: true,
    grain: 0.04, vignette: 0.55, hud: true, bpm: [128, 140], aberrBase: 1.2,
    variants: { lockon: 3, focus: 3, cuts: 3, spotlight: 2, mosaic: 2, pan: 1, split: 1, triptych: 1, card: 1 },
    trans: { zoom: 3, spin: 3, glitch: 2, whip: 2, iris: 1, slices: 1 },
    decor: { grid: 3, marquee: 3, dots: 1, number: 1, blur: 2 },
  },
  PASTEL: {
    label: 'PASTEL', bg: 'pastel', font: 'sans', weight: 700, tracking: 0.02, upper: false,
    grain: 0.02, vignette: 0.0, hud: true, bpm: [104, 116],
    variants: { card: 3, triptych: 3, mosaic: 2, spotlight: 2, focus: 2, split: 1, pan: 1, cuts: 1, lockon: 1 },
    trans: { iris: 3, door: 2, whip: 2, slices: 2, zoom: 1, cut: 1 },
    decor: { dots: 3, stripes: 2, number: 2, blur: 1 },
  },
  RETRO: {
    label: 'RETRO', bg: 'paper', font: 'serif', weight: 800, tracking: 0.01, upper: true,
    grain: 0.1, vignette: 0.5, hud: true, bpm: [110, 122],
    variants: { card: 3, split: 3, pan: 2, focus: 2, triptych: 2, cuts: 1, mosaic: 1, spotlight: 1, lockon: 1 },
    trans: { slices: 3, door: 3, bars: 2, whip: 2, cut: 2, iris: 1 },
    decor: { number: 3, stripes: 2, grid: 1, marquee: 1 },
  },
};

// MIX: 作品ごとにスタイルを抽選する（オープニング/エンディング/HUD/BPM はベースのスタイル）
export const STYLE_KEYS = () => Object.keys(THEMES);

const PACE = {
  tight: { beats: 6, bpm: 6 },
  normal: { beats: 8, bpm: 0 },
  relaxed: { beats: 10, bpm: -10 },
};

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

  // タイル状に分解した絵が、注目点に近い順に飛んできて組み上がり、最後にカチッと詰まる
  mosaic(S) {
    const { work, W, H, beat, D, layout, rng, points, minDim } = S;
    const img = layout.img;
    const cols = work.aspect >= 1 ? rng.int(4, 6) : rng.int(3, 4);
    const rows = Math.max(2, Math.round(cols / work.aspect));
    const f = points[0];
    const tw = img.w / cols, th = img.h / rows;
    const gap0 = minDim * 0.012;
    const tiles = [];
    let maxD = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
        const d = Math.hypot(u - f.x, (v - f.y) / work.aspect);
        maxD = Math.max(maxD, d);
        const a = rng.range(0, TAU);
        tiles.push({ i, j, d, ox: Math.cos(a) * minDim * rng.range(0.25, 0.5), oy: Math.sin(a) * minDim * rng.range(0.25, 0.5), rot: rng.range(-0.6, 0.6), focal: Math.floor(f.x * cols) === i && Math.floor(f.y * rows) === j });
      }
    }
    const tLock = Math.min(D - 1.4, beat * 2.5);
    S.event(tLock, 'shake', 5, 0.22);
    S.event(tLock, 'aberr', 3, 0.3);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const gap = gap0 * (1 - snap(prog(t, tLock - 0.25, tLock + 0.2)));
      const drift = 1 + 0.025 * prog(t, tLock + 0.2, D);
      for (const T of tiles) {
        const delay = 0.05 + (T.d / (maxD || 1)) * 0.7;
        const e = expoOut(prog(t, delay, delay + 0.5));
        if (e <= 0) continue;
        const sc = backOut(prog(t, delay, delay + 0.45), 1.5);
        const pop = T.focal ? 1 + 0.25 * Math.max(0, 1 - Math.abs(t - beat * 1.5) / 0.2) : 1;
        const x = img.x + ((T.i + 0.5) * tw - img.w / 2 + (T.i - (cols - 1) / 2) * gap) * drift + T.ox * (1 - e);
        const y = img.y + ((T.j + 0.5) * th - img.h / 2 + (T.j - (rows - 1) / 2) * gap) * drift + T.oy * (1 - e);
        const w = tw * drift * sc * pop, h = th * drift * sc * pop;
        if (T.focal && pop > 1) r.draw({ x, y, w: w + gap0 * 2, h: h + gap0 * 2, color: col.accent });
        r.draw({ x, y, w: w + 0.6, h: h + 0.6, rot: T.rot * (1 - e), tex: work.tex, uv: [T.i / cols, T.j / rows, (T.i + 1) / cols, (T.j + 1) / rows] });
      }
      text(r, t, tLock + 0.15, col);
    };
  },

  // 暗く沈めた絵にスポットライト。注目点を渡り歩いてから一気に全体を照らす
  spotlight(S) {
    const { work, W, H, beat, D, layout, points, minDim } = S;
    const img = layout.img;
    const p0 = points[0], p1 = points[1];
    const t1 = beat * 1.25, tOpen = Math.min(D - 1.4, beat * 2.5);
    S.event(t1, 'aberr', 2, 0.2);
    S.event(tOpen, 'flash', 0.3, 0.16);
    S.event(tOpen, 'aberr', 4, 0.35);
    const short = Math.min(img.w, img.h);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const s = 1 + 0.06 * (1 - expoOut(prog(t, 0, 1.2))) + 0.025 * prog(t, tOpen + 0.5, D);
      const w = img.w * s, h = img.h * s;
      const ein = expoOut(prog(t, 0, 0.5));
      // 沈んだ全体
      const dim = 1 - expoOut(prog(t, tOpen, tOpen + 0.5));
      r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, tint: [col.bg[0], col.bg[1], col.bg[2], 0.82 * dim], alpha: ein });
      // スポット位置: p0 → (スナップ) → p1
      const em = snap(prog(t, t1 - 0.15, t1 + 0.25));
      const fx = lerp(p0.x, p1.x, em), fy = lerp(p0.y, p1.y, em);
      const rad0 = Math.max(p0.size, 0.12) * short * 0.55, rad1 = Math.max(p1.size, 0.12) * short * 0.55;
      const pulse = 1 + 0.04 * Math.sin(t * 9);
      let rad = lerp(rad0, rad1, em) * pulse * expoOut(prog(t, 0.2, 0.55));
      const open = expoOut(prog(t, tOpen, tOpen + 0.55));
      const full = Math.hypot(w, h);
      rad = lerp(rad, full, open);
      if (rad > 0) {
        r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, mask: { type: 'circle', p: circleP(w, h, fx, fy, rad), cx: fx, cy: fy, soft: 3 } });
        if (open < 1) {
          const cx = img.x + (fx - 0.5) * w, cy = img.y + (fy - 0.5) * h;
          const rr = rad + minDim * 0.012;
          r.draw({ x: cx, y: cy, w: rr * 2, h: rr * 2, mode: 'ring', pat: [0, Math.max(2, minDim * 0.004), 0, 0], color: withA(col.accent, 1 - open) });
        }
      }
      text(r, t, tOpen + 0.3, col);
    };
  },

  // 3枚の短冊に分かれて入ってきて、溜めてから一気に合体
  triptych(S) {
    const { work, W, H, beat, D, layout, rng, minDim } = S;
    const img = layout.img;
    const n = 3;
    const gap = minDim * 0.05;
    const offs = [-1, 1, -1].map((k) => k * H * rng.range(0.06, 0.12));
    const tJoin = Math.min(D - 1.4, beat * 2.5);
    S.event(tJoin, 'shake', 6, 0.25);
    S.event(tJoin, 'aberr', 4, 0.3);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const ej = snap(prog(t, tJoin - 0.3, tJoin + 0.15));
      const sw = img.w / n;
      const drift = 1 + 0.025 * prog(t, tJoin + 0.2, D);
      for (let k = 0; k < n; k++) {
        const d = 0.05 + k * 0.08;
        const ein = expoOut(prog(t, d, d + 0.6));
        if (ein <= 0) continue;
        const dir = k % 2 ? 1 : -1;
        const apart = (1 - ej) * (1 + 0.15 * prog(t, 0.6, tJoin)); // 溜めの間は少しずつ離れる
        const x = img.x + ((k + 0.5) * sw - img.w / 2) * drift + (k - 1) * gap * apart;
        const y = img.y + offs[k] * apart + dir * H * (1 - ein);
        const par = (offs[k] / img.h) * 0.4 * apart;
        r.draw({ x, y, w: sw * drift + 0.6, h: img.h * drift, tex: work.tex, uv: [k / n, -par, (k + 1) / n, 1 - par] });
      }
      text(r, t, tJoin + 0.25, col);
    };
  },

  // 注目点を順にロックオン（ブラケットが大きく出て、ピタッと締まる）
  lockon(S) {
    const { work, W, H, beat, D, layout, points, minDim, tf } = S;
    const img = layout.img;
    const n = Math.min(3, Math.max(1, work.focal.length));
    const targets = points.slice(0, n).map((p, i) => ({
      p, t: 0.6 + i * beat,
      L: tf.get(`FOCUS ${pad2(i + 1)}`, { family: 'mono', size: Math.round(minDim * 0.017), weight: 700, tracking: 0.2 }),
      V: tf.get(`X ${p.x.toFixed(2)} / Y ${p.y.toFixed(2)}`, { family: 'mono', size: Math.round(minDim * 0.014), weight: 500, tracking: 0.15 }),
    }));
    targets.forEach((T) => S.event(T.t + 0.25, 'aberr', 2, 0.2));
    const tText = targets[n - 1].t + beat * 0.8;
    const th = Math.max(2, minDim * 0.004);
    const text = makeTextBlock(S);
    const bracket = (r, cx, cy, bw, bh, color) => {
      const L = Math.min(bw, bh) * 0.28;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = cx + sx * bw / 2, y = cy + sy * bh / 2;
        r.draw({ x: x - sx * L / 2, y, w: L, h: th, color });
        r.draw({ x, y: y - sy * L / 2, w: th, h: L, color });
      }
    };
    return (r, t, col) => {
      const s = 1 + 0.05 * (1 - expoOut(prog(t, 0, 0.7))) + 0.02 * prog(t, 0.7, D);
      const w = img.w * s, h = img.h * s;
      r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, mask: { type: 'blinds', p: expoOut(prog(t, 0, 0.55)), angle: Math.PI / 2, count: 6, stagger: 0.5 } });
      targets.forEach((T, i) => {
        const lt = t - T.t;
        if (lt < 0) return;
        const e = expoOut(prog(lt, 0, 0.32));
        const active = i === n - 1 || t < targets[i + 1].t;
        const box = Math.max(T.p.size, 0.1) * Math.min(w, h) * 0.9;
        const cx = img.x + (T.p.x - 0.5) * w, cy = img.y + (T.p.y - 0.5) * h;
        const bw = lerp(w * 1.05, box, e), bh = lerp(h * 1.05, box, e);
        const bx = lerp(img.x, cx, e), by = lerp(img.y, cy, e);
        const c = active ? col.accent : withA(col.ink, 0.45);
        bracket(r, bx, by, bw, bh, c);
        // 十字の照準線（画像の端まで伸びる）
        const el = snapSoft(prog(lt, 0.2, 0.5));
        if (active && el > 0) {
          r.draw({ x: cx, y: cy, w: w * el, h: 1.5, color: withA(col.accent, 0.5) });
          r.draw({ x: cx, y: cy, w: 1.5, h: h * el, color: withA(col.accent, 0.5) });
        }
        // ラベルは現在のターゲットだけ（前のものは上へ抜ける）
        const leave = active ? 0 : expoOut(prog(t, targets[i + 1].t, targets[i + 1].t + 0.3));
        const lx = cx + bw / 2 + minDim * 0.015, ly = cy - bh / 2;
        drawText(r, T.L, lx, ly, { reveal: expoOut(prog(lt, 0.25, 0.6)), leave, color: col.accent });
        drawText(r, T.V, lx, ly + textH(T.L) + minDim * 0.01, { reveal: expoOut(prog(lt, 0.3, 0.65)), leave, color: withA(col.ink, 0.8) });
      });
      text(r, t, tText, col);
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
    case 'spin': {
      // 回りながら吸い込まれ、逆回転で飛び出してくる
      if (phase === 'out') {
        const e = antic(p, 0.3, 0.05);
        h.rot = tr.spin * 0.9 * e;
        h.scale = Math.exp(-Math.log(8) * e);
        h.radial = clamp(expoIn(p) * 0.4, 0, 0.4);
      } else {
        const e = 1 - expoOut(p);
        h.rot = -tr.spin * 0.9 * e;
        h.scale = 1 + 2.2 * e;
        h.radial = clamp(e * 0.4, 0, 0.4);
      }
      break;
    }
    case 'door': {
      h.sliceAxis = 2;
      h.sliceP = phase === 'out' ? antic(p, 0.3, 0.04) : 1 - expoOut(p);
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
  const mixMode = opts.theme === 'MIX';
  const baseName = !mixMode && opts.theme && THEMES[opts.theme] ? opts.theme : rng.pick(Object.keys(THEMES));
  const themeName = mixMode ? 'MIX' : baseName;
  const theme = THEMES[baseName]; // オープニング/エンディング/HUD/BPM のスタイル
  // 作品ごとのスタイル。MIX では1枚ずつ抽選（直前と同じものは避ける）
  const workThemeNames = [];
  for (let i = 0; i < works.length; i++) {
    if (!mixMode) { workThemeNames.push(baseName); continue; }
    const keys = Object.keys(THEMES).filter((k) => k !== workThemeNames[i - 1]);
    workThemeNames.push(rng.pick(keys));
  }
  const workThemes = workThemeNames.map((k) => THEMES[k]);
  const P = PACE[pace] || PACE.normal;
  const bpm = Math.round(rng.range(theme.bpm[0], theme.bpm[1]) + P.bpm);
  const beat = 60 / bpm;
  const minDim = Math.min(W, H);
  const events = [];
  const segments = [];
  const up = (s) => (theme.upper ? s.toUpperCase() : s);

  const workColors = works.map((w, i) => colorsFor(w, workThemes[i]));
  const globalCol = workColors[0] || colorsFor({ roles: { dominant: [0.1, 0.1, 0.1], accent: [1, 0.3, 0.3] } }, theme);

  // ---- トランジション列（境界ごと）
  const nBound = works.length + 1;
  const transitions = [];
  let prevType = null;
  for (let i = 0; i < nBound; i++) {
    // 境界 i は「直前のセグメント」のスタイルの重みで抽選（0 はオープニング＝ベース）
    const trTheme = i === 0 ? theme : workThemes[i - 1];
    let type = rng.weighted(trTheme.trans, prevType ? [prevType] : []);
    if (i === nBound - 1 && type === 'glitch') type = 'bars';
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = rng.chance(0.7) ? dirs[rng.int(0, 1)] : dirs[rng.int(2, 3)];
    transitions.push({
      type, dx: d[0], dy: d[1],
      axis: rng.int(0, 1), count: rng.int(5, 9),
      spin: rng.sign(), bars: rng.int(1, 4), barAngle: rng.pick([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI * 3 / 4]),
    });
    prevType = type;
  }

  let cursor = 0;
  const addEvent = (t, kind, amt, dur, color) => events.push({ t, kind, amt, dur, color });

  // ---- オープニング
  const C = {
    works, W, H, beat, rng: rng.fork('bookends'), tf, theme, minDim, artist, subline, handle, year, up, ev: null,
  };
  const openerKey = OPENERS[opts.opener] ? opts.opener : rng.pick(Object.keys(OPENERS));
  const closerKey = CLOSERS[opts.closer] ? opts.closer : rng.pick(Object.keys(CLOSERS));
  {
    const start = cursor;
    const O = OPENERS[openerKey]({ ...C, ev: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color) });
    segments.push({ kind: 'opener', variant: openerKey, theme: baseName, start, dur: O.dur, col: globalCol, outT: transitions[0], draw: O.draw });
    cursor += O.dur;
  }

  // ---- 作品
  const varKeys = [];
  const decorKeys = [];
  works.forEach((work, idx) => {
    const D = beat * P.beats;
    const start = cursor;
    const srng = rng.fork('work' + idx);
    // opts.variant はテスト・デバッグ用（全作品を指定の振付に固定）
    const wtheme = workThemes[idx];
    const vkey = VARIANTS[opts.variant] ? (srng.next(), opts.variant) : srng.weighted(wtheme.variants, varKeys.slice(-1));
    varKeys.push(vkey);
    const side = srng.pick(['left', 'right']);
    const layout = layoutFor(work, W, H, idx % 2 ? (side === 'left' ? 'right' : 'left') : side);
    const S = {
      work, idx, total: works.length, artist, year, W, H, beat, D, rng: srng, tf, theme: wtheme, minDim, layout,
      points: pointsFor(work, 3, srng),
      event: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color),
    };
    const dkeys = [srng.weighted(wtheme.decor, decorKeys.slice(-1))];
    if (srng.chance(0.35)) dkeys.push(srng.weighted(wtheme.decor, dkeys));
    decorKeys.push(dkeys[0]);
    const decors = dkeys.map((k) => DECORS[k](S));
    const body = VARIANTS[vkey](S);
    segments.push({
      kind: 'work', idx, variant: vkey, decor: dkeys, theme: workThemeNames[idx], start, dur: D, col: workColors[idx], work, layout,
      inT: transitions[idx], outT: transitions[idx + 1],
      draw(r, t, col, hint) {
        for (const d of decors) d(r, t, D, col);
        body(r, t, col, hint);
      },
    });
    cursor += D;
  });

  // ---- エンディング
  {
    const start = cursor;
    const E = CLOSERS[closerKey]({ ...C, ev: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color) });
    segments.push({ kind: 'closer', variant: closerKey, theme: baseName, start, dur: E.dur, col: globalCol, inT: transitions[nBound - 1], outT: { type: 'cut' }, draw: E.draw });
    cursor += E.dur;
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
    if (tr.type === 'spin') addEvent(T, 'aberr', 6, 0.3);
    if (tr.type === 'door') addEvent(T, 'shake', 3, 0.15);
  }
  // ループ時の頭（クロージング→オープニング）
  addEvent(0, 'flash', 0.8, 0.3);

  // ---- 描画
  const fx = { aberr: 0, grain: theme.grain, vignette: theme.vignette, flash: [1, 1, 1, 0], shakeX: 0, shakeY: 0 };
  const hint = {};
  const HUD = makeHud({ tf, theme, W, H, minDim, works, artist, subline, year, up });

  function segmentAt(t) {
    for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].start) return i;
    return 0;
  }

  function evalFx(t, seg) {
    // グレイン等の質感は、いま映っているセグメントのスタイルに従う（MIX で作品ごとに変わる）
    const th = THEMES[seg.theme] || theme;
    fx.grain = th.grain; fx.vignette = th.vignette;
    fx.aberr = th.aberrBase || 0;
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
    const showsGap = (tr) => tr && (tr.type === 'iris' || tr.type === 'door' || tr.type === 'spin');
    if (showsGap(seg.inT) && lt < ENTRY_DUR && i > 0) bgCol = seg.inT.color;
    if (showsGap(seg.outT) && lt >= outStart) bgCol = seg.outT.color;

    if (theme.hud) HUD(r, t, seg, i, lt, col);
    r.present(evalFx(t, seg), bgCol, t);
  }

  function dispose() { /* テキストは TextFactory 側で一括破棄 */ }

  return {
    duration, bpm, beat, theme: themeName, baseTheme: baseName, workThemes: workThemeNames, opener: openerKey, closer: closerKey, segments, events, render, dispose,
    summary: segments.map((s) => ({ kind: s.kind, theme: s.theme, start: s.start, dur: s.dur, variant: s.variant, decor: s.decor, out: s.outT && s.outT.type })),
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
function makeHud({ tf, theme, W, H, minDim, works, artist, subline, year, up }) {
  const m = minDim * 0.045;
  const fs = Math.round(minDim * 0.016);
  const A = tf.get(up(artist || 'PORTFOLIO'), { family: 'mono', size: fs, weight: 700, tracking: 0.25 });
  // 右上: サブタイトルがあれば「サブタイトル — 年」、なければ年だけ
  const R = tf.get(subline ? `${up(subline)} — ${year}` : String(year), { family: 'mono', size: fs, weight: 500, tracking: 0.25 });
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
