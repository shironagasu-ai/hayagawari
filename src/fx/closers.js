// エンディングのパターン。C は openers.js と同じ共通コンテキスト。

import { clamp, lerp, prog, expoOut, backOut, snap, antic } from '../ease.js';
import {
  pad2, withA, pointsFor, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, fitIn,
} from '../kit.js';
import { nameText, subText, nameLanding, circleP, endingText, endingBlock } from './bookend-kit.js';

export const CLOSERS = {
  // 全作品のグリッド → 引いて名前
  grid(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
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
        const tw = (W - gap * (cols + 1)) / cols, th = (H - gap * (rows + 1)) / rows;
        tiles.push({
          w, f, x: gap + tw / 2 + i * (tw + gap), y: gap + th / 2 + j * (th + gap), tw, th,
          delay: 0.05 + (order.indexOf(k) / (cols * rows)) * 1.1,
          ang: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
          z: panelZoom(w, { ...f, size: Math.max(f.size, 0.45) }, tw, th, 1),
        });
      }
    }
    const tZoom = beat * 3;
    const N = nameText(C, 0.11, 0.8, 0);
    const E = endingText(C);
    C.ev(tZoom, 'shake', 4, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        const ez = snap(prog(t, tZoom - 0.2, tZoom + 0.4));
        r.cam.s = lerp(1, 0.86, ez) * (1 + 0.02 * prog(t, tZoom + 0.4, D));
        r.cam.r = lerp(0, -0.035, ez);
        for (const tl of tiles) {
          const e = expoOut(prog(t, tl.delay, tl.delay + 0.5));
          if (e <= 0) continue;
          const uv = coverUV(tl.w, tl.tw, tl.th, tl.f.x, tl.f.y, tl.z * (1 + 0.25 * (1 - e)));
          r.draw({ x: tl.x, y: tl.y, w: tl.tw, h: tl.th, tex: tl.w.tex, uv, mask: { type: 'wipe', p: e, angle: tl.ang } });
        }
        r.resetCam();
        const ed = expoOut(prog(t, tZoom, tZoom + 0.5));
        if (ed > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, 0.78 * ed) });
          const ph = textH(N.T, N.s) + minDim * 0.2;
          r.draw({ x: W / 2, y: H / 2, w: W, h: ph, color: withA(col.bg, 0.9), mask: { type: 'wipe', p: snap(prog(t, tZoom, tZoom + 0.45)), angle: 0 } });
          endingBlock(r, C, N, E, t, tZoom + 0.15, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.09);
        }
      },
    };
  },

  // 全作品がフィルムのように流れ込んで止まる
  filmstrip(C) {
    const { works, W, H, beat, minDim } = C;
    const D = beat * 8;
    const ch = H * (W > H ? 0.42 : 0.3);
    const gap = minDim * 0.03;
    const cards = [];
    let x = 0;
    for (const w of works) {
      const cw = Math.min(ch * w.aspect, W * 0.7);
      cards.push({ w, x: x + cw / 2, cw });
      x += cw + gap;
    }
    const total = x - gap;
    const cy = H * 0.42;
    // 最終位置: 全体が収まれば中央寄せ、はみ出すなら中央の作品を中央に
    const endOff = total <= W * 0.92 ? (W - total) / 2 : W / 2 - cards[Math.floor(cards.length / 2)].x;
    const startOff = W + gap;
    const tStop = beat * 2.5;
    const N = nameText(C, 0.08, 0.8, 0);
    const E = endingText(C);
    C.ev(tStop, 'shake', 4, 0.2);
    const hole = minDim * 0.014;
    return {
      dur: D,
      draw(r, t, col) {
        const e = expoOut(prog(t, 0.05, tStop)); // 勢いよく入って、じわっと止まる
        const drift = -W * 0.015 * prog(t, tStop, D);
        const off = lerp(startOff, endOff, e) + drift;
        const e0 = expoOut(prog(t - 1 / 60, 0.05, tStop));
        const vel = (lerp(startOff, endOff, e) - lerp(startOff, endOff, e0));
        // フィルムの帯と送り穴
        const bandH = ch + hole * 5;
        r.draw({ x: W / 2, y: cy, w: W, h: bandH, color: withA(col.ink, 0.92) });
        const pitch = hole * 2.6;
        const ph = ((off % pitch) + pitch) % pitch;
        for (let hx = ph - pitch; hx < W + pitch; hx += pitch) {
          r.draw({ x: hx, y: cy - bandH / 2 + hole * 1.2, w: hole, h: hole * 0.9, color: col.bg });
          r.draw({ x: hx, y: cy + bandH / 2 - hole * 1.2, w: hole, h: hole * 0.9, color: col.bg });
        }
        for (const c of cards) {
          const cx = c.x + off;
          if (cx + c.cw / 2 < -10 || cx - c.cw / 2 > W + 10) continue;
          const blur = Math.abs(vel) > 0.5 ? [-(vel / c.cw) * 0.8, 0] : undefined;
          r.draw({ x: cx, y: cy, w: c.cw, h: ch, tex: c.w.tex, blur });
        }
        endingBlock(r, C, N, E, t, tStop + 0.1, col, W / 2, cy + bandH / 2 + minDim * 0.05);
      },
    };
  },

  // 作品カードが次々と落ちて積み重なる
  stack(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const land = W / H > 1.2;
    const n = works.length;
    const step = Math.min(beat / 2, (beat * 3) / n);
    const box = land ? { w: W * 0.42, h: H * 0.62 } : { w: W * 0.7, h: H * 0.42 };
    const cards = works.map((w, i) => {
      const f = fitIn(w.aspect, box.w, box.h);
      return { w, cw: f.w, ch: f.h, t0: 0.05 + i * step, rot: rng.range(-0.14, 0.14), dx: rng.range(-1, 1) * minDim * 0.03, dy: rng.range(-1, 1) * minDim * 0.03, from: rng.range(-0.5, 0.5) };
    });
    const tSide = cards[n - 1].t0 + 0.5 + beat;
    cards.forEach((c) => C.ev(c.t0 + 0.2, 'shake', 2.5, 0.12));
    const N = nameText(C, land ? 0.085 : 0.09, land ? 0.42 : 0.8, 0);
    const E = endingText(C);
    const b = minDim * 0.01;
    return {
      dur: D,
      draw(r, t, col) {
        const es = snap(prog(t, tSide - 0.25, tSide + 0.35));
        const px = land ? lerp(W / 2, W * 0.3, es) : W / 2;
        const py = land ? H / 2 : lerp(H / 2, H * 0.36, es);
        const ps = lerp(1, 0.85, es);
        for (const c of cards) {
          const lt = t - c.t0;
          if (lt < 0) break;
          const e = expoOut(prog(lt, 0, 0.35));
          const x = px + (c.dx + c.from * W * (1 - e)) * ps;
          const y = py + (c.dy - H * 1.1 * (1 - e)) * ps;
          const rot = c.rot + (1 - e) * c.from * 0.8;
          r.draw({ x: x + b, y: y + b * 1.6, w: (c.cw + b * 2) * ps, h: (c.ch + b * 2) * ps, rot, color: withA([0, 0, 0], 0.28) });
          r.draw({ x, y, w: (c.cw + b * 2) * ps, h: (c.ch + b * 2) * ps, rot, color: col.ink });
          r.draw({ x, y, w: c.cw * ps, h: c.ch * ps, rot, tex: c.w.tex });
        }
        if (land) endingBlock(r, C, N, E, t, tSide + 0.1, col, W * 0.58, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06, 'left');
        else endingBlock(r, C, N, E, t, tSide + 0.1, col, W / 2, H * 0.7);
      },
    };
  },

  // 名前の形に全作品を高速で流し、最後の一枚で止める
  knockout(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const N = nameText(C, W > H ? 0.26 : 0.18, 0.9, 200);
    const E = endingText(C);
    const n = Math.max(4, works.length);
    const step = Math.min(beat / 2, (beat * 3) / n);
    const seq = Array.from({ length: n }, (_, i) => {
      const w = works[i % works.length];
      return { w, f: pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2] };
    });
    const tStop = step * n;
    for (let i = 1; i < n; i++) C.ev(i * step, 'flash', 0.1, 0.08);
    C.ev(tStop, 'shake', 4, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        const i = Math.min(n - 1, Math.floor(t / step));
        const P = seq[i];
        const lt = t - i * step;
        const e = expoOut(prog(t, 0, 0.6));
        const up = snap(prog(t, tStop, tStop + 0.5));
        const s = N.s * lerp(1.2, 1, e);
        const w = N.T.w * s, h = N.T.h * s;
        const cy = lerp(H / 2, H * 0.4, up);
        const z = (i === n - 1 ? 1.15 : 1.5) * (1 + 0.08 * (1 - expoOut(prog(lt, 0, 0.3))));
        const uv = coverUV(P.w, w, h, P.f.x, P.f.y, z);
        r.draw({ x: W / 2 + minDim * 0.01, y: cy + minDim * 0.01, w, h, color: col.accent, mtex: N.T.tex, alpha: e });
        r.draw({ x: W / 2, y: cy, w, h, tex: P.w.tex, uv, mtex: N.T.tex, alpha: e });
        const top = cy + textH(N.T, s) / 2 + minDim * 0.05;
        drawText(r, E.TY, W / 2, top, { align: 'center', reveal: expoOut(prog(t, tStop + 0.1, tStop + 0.6)), color: col.accent });
        if (E.HT) drawText(r, E.HT, W / 2, top + textH(E.TY) + minDim * 0.03, { align: 'center', reveal: expoOut(prog(t, tStop + 0.25, tStop + 0.8)), color: withA(col.ink, 0.75) });
      },
    };
  },
  // 作品カードが楕円軌道を高速で回り、減速して正面で止まる
  orbit(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const n = Math.max(3, Math.min(10, works.length));
    const cards = Array.from({ length: n }, (_, i) => works[i % works.length]);
    const land = W > H;
    const cy = H * (land ? 0.4 : 0.38);
    const rx = W * (land ? 0.34 : 0.36), ry = H * (land ? 0.1 : 0.07);
    const ch = H * (land ? 0.34 : 0.22);
    const tStop = beat * 3;
    const spin = rng.sign();
    const N = nameText(C, 0.085, 0.8, 0);
    const E = endingText(C);
    C.ev(tStop, 'shake', 3, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        const e = expoOut(prog(t, 0, tStop));
        const a0 = spin * (Math.PI * 2 * 1.5 * (1 - e)) + spin * 0.05 * prog(t, tStop, D);
        const list = cards.map((w, i) => {
          const a = a0 + (i / n) * Math.PI * 2 + Math.PI / 2;
          const depth = (Math.sin(a) + 1) / 2; // 1 = 手前
          return { w, x: W / 2 + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, depth };
        }).sort((p, q) => p.depth - q.depth);
        const ein = expoOut(prog(t, 0, 0.5));
        for (const c of list) {
          const s = lerp(0.55, 1, c.depth) * ein;
          const h = ch * s, w = Math.min(h * c.w.aspect, W * 0.4 * s);
          r.draw({ x: c.x, y: c.y, w: w + minDim * 0.012 * s, h: h + minDim * 0.012 * s, color: col.ink });
          r.draw({ x: c.x, y: c.y, w, h, tex: c.w.tex, tint: [col.bg[0], col.bg[1], col.bg[2], (1 - c.depth) * 0.6] });
        }
        endingBlock(r, C, N, E, t, tStop + 0.1, col, W / 2, cy + ry + ch / 2 + minDim * 0.06);
      },
    };
  },

  // 作品の短冊が上から降りて幕になり、溜めてから一斉に上がると名前
  curtain(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const n = W > H ? Math.max(5, Math.min(8, works.length)) : 4;
    const sw = W / n;
    const strips = Array.from({ length: n }, (_, i) => {
      const w = works[i % works.length];
      return { w, f: pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2], z: rng.range(1, 1.3) };
    });
    const tUp = beat * 3;
    C.ev(0.5, 'shake', 3, 0.15);
    C.ev(tUp + 0.2, 'aberr', 4, 0.3);
    const N = nameText(C, 0.1, 0.8, 0);
    const E = endingText(C);
    return {
      dur: D,
      draw(r, t, col) {
        endingBlock(r, C, N, E, t, tUp + 0.15, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
        for (let i = 0; i < n; i++) {
          const S = strips[i];
          const d = 0.03 + i * 0.05;
          const ein = expoOut(prog(t, d, d + 0.5));
          const eout = antic(prog(t, tUp - 0.15 + (n - 1 - i) * 0.03, tUp + 0.3 + (n - 1 - i) * 0.03), 0.3, 0.03);
          if (ein <= 0 || eout >= 1) continue;
          const y = H / 2 - H * (1 - ein) - H * 1.05 * eout;
          const uv = coverUV(S.w, sw, H, S.f.x, S.f.y, panelZoom(S.w, S.f, sw, H, 0.8) * S.z);
          r.draw({ x: sw * (i + 0.5), y, w: sw + 1, h: H, tex: S.w.tex, uv });
          r.draw({ x: sw * (i + 1), y, w: Math.max(2, minDim * 0.004), h: H, color: col.bg });
        }
      },
    };
  },

  // 巻き戻し: 全作品の寄りが加速しながら逆順に流れ、白く飛んで名前
  rewind(C) {
    const { works, W, H, beat, rng, tf, minDim } = C;
    const D = beat * 8;
    const K = Math.min(24, Math.max(10, works.length * 3));
    const tEnd = beat * 3.5;
    const seq = Array.from({ length: K }, (_, k) => {
      const w = works[(works.length - 1 - (k % works.length) + works.length) % works.length];
      return { w, f: pointsFor(w, 3, rng)[Math.floor(k / works.length) % 3], hq: 0 };
    });
    seq.forEach((s) => { s.hq = closeHq(s.w, s.f, W, H, rng.range(0.6, 1)); });
    // 後半ほど間隔が詰まる
    const starts = seq.map((_, k) => tEnd * Math.pow(k / K, 0.55));
    starts.forEach((s, k) => { if (k) C.ev(s, 'flash', 0.08, 0.05); });
    C.ev(tEnd, 'flash', 0.9, 0.3);
    const RW = tf.get('◀◀ REWIND', { family: 'mono', size: Math.round(minDim * 0.026), weight: 700, tracking: 0.2 });
    const N = nameText(C, 0.11, 0.8, 0);
    const E = endingText(C);
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tEnd) {
          endingBlock(r, C, N, E, t, tEnd + 0.05, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
          return;
        }
        let k = 0;
        while (k < K - 1 && starts[k + 1] <= t) k++;
        const S = seq[k];
        const lt = t - starts[k];
        // 逆再生らしく、寄りから少しずつ引いていく
        const c = clampFull(S.w, { ix: S.f.x, iy: S.f.y, sx: W / 2, sy: H / 2, hq: S.hq * (1.12 - 0.12 * expoOut(prog(lt, 0, 0.25))) }, W, H);
        drawCam(r, S.w, c, null);
        // 走査線のノイズ帯
        const band = ((t * 3.7) % 1) * H;
        r.draw({ x: W / 2, y: band, w: W, h: H * 0.04, color: withA(col.ink, 0.12) });
        if (Math.floor(t / (beat / 4)) % 2 === 0) drawText(r, RW, minDim * 0.05, minDim * 0.05, { color: withA([1, 1, 1], 0.9) });
      },
    };
  },

};

export const CLOSER_LABELS = { grid: 'グリッド', filmstrip: 'フィルム', stack: 'スタック', knockout: '抜き文字', orbit: 'オービット', curtain: 'カーテン', rewind: '巻き戻し' };
