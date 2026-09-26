// 背景装飾。S（作品セグメントの文脈）を受け取り (r, t, D, col) => void を返す

import { createRng } from '../rng.js';
import {
  pad2, TAU, lum, withA, pointsFor, camLerp, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, layoutFor, makeTextBlock,
} from '../kit.js';
import { circleP } from './bookend-kit.js';
import {
  clamp, lerp, prog, quadOut, expoIn, expoOut, expoInOut,
  backOut, snap, snapSoft, antic,
} from '../ease.js';

export const DECORS = {
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
  // 画面の隅から同心円の波紋が拍に合わせて外へ広がる
  rings(S) {
    const { W, H, rng, beat, minDim } = S;
    const [ux, uy] = rng.pick([[0, 0], [1, 0], [0, 1], [1, 1]]);
    const cx = ux * W, cy = uy * H;
    const maxR = Math.hypot(W, H);
    const gap = minDim * 0.09;
    const lw = Math.max(1.5, minDim * 0.003);
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0.05, 0.9));
      const off = ((t / beat) * gap * 0.5) % gap;
      for (let R = off + gap; R < maxR * e; R += gap) {
        r.draw({ x: cx, y: cy, w: R * 2, h: R * 2, mode: 'ring', pat: [0, lw, 0, 0], color: withA(col.deco, 0.2) });
      }
    };
  },
  // 上端を流れる細いテロップ（作品名・番号・年）
  ticker(S) {
    const { tf, theme, W, H, work, idx, total, year, minDim } = S;
    const up = (s) => (theme.upper ? s.toUpperCase() : s);
    const fs = Math.round(minDim * 0.015);
    const T = tf.get(`${up(work.title)}   ·   No.${pad2(idx + 1)} / ${pad2(total)}   ·   ${year}   ·   `, { family: 'mono', size: fs, weight: 600, tracking: 0.2 });
    const tw = Math.max(1, textW(T));
    const y = minDim * 0.11;
    const bh = fs * 2.2;
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0.05, 0.6));
      r.draw({ x: W / 2, y, w: W, h: bh, color: withA(col.ink, 0.07), mask: { type: 'wipe', p: e, angle: 0 } });
      const off = -((t * minDim * 0.09) % tw);
      for (let x = off; x < W; x += tw) drawText(r, T, x, y - textH(T) / 2, { color: withA(col.ink, 0.5), reveal: e });
    };
  },
  // 大きな幾何学図形（円・リング・四角）がゆっくり漂う
  shapes(S) {
    const { W, H, rng, minDim } = S;
    const list = Array.from({ length: 3 }, (_, k) => ({
      kind: rng.pick(['disc', 'ring', 'rect']),
      x: rng.range(0.1, 0.9) * W, y: rng.range(0.1, 0.9) * H,
      size: minDim * rng.range(0.22, 0.45), rot: rng.range(0, TAU),
      vx: rng.range(-1, 1) * minDim * 0.02, vy: rng.range(-1, 1) * minDim * 0.02, vr: rng.range(-0.15, 0.15),
      t0: 0.05 + k * 0.12,
    }));
    const lw = Math.max(2, minDim * 0.01);
    return (r, t, D, col) => {
      for (const s of list) {
        const e = backOut(prog(t, s.t0, s.t0 + 0.5), 1.5);
        if (e <= 0) continue;
        const d = s.size * e;
        const o = { x: s.x + s.vx * t, y: s.y + s.vy * t, w: d, h: d, rot: s.rot + s.vr * t, color: withA(col.deco, 0.16) };
        if (s.kind === 'disc') r.draw({ ...o, mode: 'disc' });
        else if (s.kind === 'ring') r.draw({ ...o, mode: 'ring', pat: [0, lw, 0, 0] });
        else r.draw(o);
      }
    };
  },
  // ブラウン管のような走査線と、ゆっくり下りる明るい帯
  scanlines(S) {
    const { W, H, minDim } = S;
    const period = Math.max(3, minDim * 0.006);
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0, 0.5));
      r.draw({ x: W / 2, y: H / 2, w: W, h: H, mode: 'stripes', pat: [period, 0.35, Math.PI / 2, 0], color: withA(col.ink, 0.06 * e) });
      const y = (((t * 0.3) % 1.3) - 0.15) * H;
      r.draw({ x: W / 2, y, w: W, h: H * 0.14, color: withA(col.ink, 0.045 * e) });
    };
  },
  // 作品の後ろにぼんやり光る円（拍ごとにふくらむ）
  halo(S) {
    const { layout, beat } = S;
    const img = layout.img;
    const R = Math.max(img.w, img.h) * 0.6;
    return (r, t, D, col) => {
      const e = expoOut(prog(t, 0, 0.8));
      const pulse = 1 + 0.05 * Math.exp(-((t % beat) / beat) * 6);
      const d = R * 2 * e * pulse;
      r.draw({ x: img.x, y: img.y, w: d, h: d, color: withA(col.accent, lum(col.bg) > 0.5 ? 0.12 : 0.22), mask: { type: 'circle', p: Math.SQRT1_2, soft: R * 0.6 } });
    };
  },
  // 画面の端に向かって大きくなる網点のグラデーション
  dotfade(S) {
    const { W, H, rng, layout, minDim } = S;
    const land = W > H;
    const side = land ? (layout.side === 'left' ? 1 : layout.side === 'right' ? -1 : rng.sign()) : 1; // 作品と反対側
    const n = 5;
    const per = minDim * 0.03;
    const sw = (land ? W : H) * 0.07;
    return (r, t, D, col) => {
      for (let k = 0; k < n; k++) {
        const e = expoOut(prog(t, 0.05 + k * 0.05, 0.6 + k * 0.05));
        if (e <= 0) continue;
        const ratio = (0.15 + k * 0.2) * e;
        const pos = sw * (n - k - 0.5); // 端から k 番目
        const o = land
          ? { x: side > 0 ? W - pos : pos, y: H / 2, w: sw + 1, h: H }
          : { x: W / 2, y: H - pos, w: W, h: sw + 1 };
        r.draw({ ...o, mode: 'dots', pat: [per, ratio, 0, 0], color: withA(col.deco, 0.5) });
      }
    };
  },

};

export const DECOR_KEYS = () => Object.keys(DECORS);
