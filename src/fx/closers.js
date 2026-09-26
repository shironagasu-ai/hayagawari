// エンディングのパターン。C は openers.js と同じ共通コンテキスト。

import { clamp, lerp, prog, expoOut, backOut, snap, antic, smooth } from '../ease.js';
import {
  pad2, withA, mix, pointsFor, clampFull, closeHq, drawCam, coverUV, panelZoom,
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

  // 作品カードが四方から飛んできて壁一面に散らばり、中央に名前の札
  collage(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const land = W > H;
    const n = Math.min(10, Math.max(4, works.length));
    const cols = Math.max(2, land ? Math.ceil(Math.sqrt(n * 1.6)) : Math.ceil(Math.sqrt(n / 1.6)));
    const rows = Math.ceil(n / cols);
    const cellW = W / cols, cellH = H / rows;
    const order = rng.shuffle([...Array(n).keys()]);
    const step = Math.min(beat / 4, (beat * 2.4) / n);
    const cards = Array.from({ length: n }, (_, k) => {
      const w = works[k % works.length];
      const b = fitIn(w.aspect, cellW * 1.05, cellH * 1.05);
      return {
        w, cw: b.w, ch: b.h,
        x: ((k % cols) + 0.5) * cellW + rng.range(-0.12, 0.12) * cellW,
        y: (Math.floor(k / cols) + 0.5) * cellH + rng.range(-0.12, 0.12) * cellH,
        rot: rng.range(-0.12, 0.12), from: rng.range(0, Math.PI * 2), t0: 0.05 + order.indexOf(k) * step,
      };
    });
    const tName = beat * 3.5;
    const N = nameText(C, 0.09, 0.7, 0);
    const E = endingText(C);
    cards.forEach((c) => C.ev(c.t0 + 0.3, 'shake', 1.5, 0.1));
    const bd = minDim * 0.008;
    const blockH = textH(E.TY) + textH(N.T, N.s) + (E.HT ? textH(E.HT) + minDim * 0.04 : 0) + minDim * 0.035;
    const panelW = Math.max(textW(N.T, N.s), textW(E.TY), E.HT ? textW(E.HT) : 0) + minDim * 0.14;
    return {
      dur: D,
      draw(r, t, col) {
        r.cam.s = lerp(1.1, 1, expoOut(prog(t, 0, tName))) * (1 + 0.015 * prog(t, tName, D));
        r.cam.r = lerp(0.03, 0, expoOut(prog(t, 0, tName)));
        for (const c of cards) {
          const e = expoOut(prog(t, c.t0, c.t0 + 0.45));
          if (e <= 0) continue;
          const dist = (1 - e) * Math.max(W, H) * 0.9;
          const x = c.x + Math.cos(c.from) * dist, y = c.y + Math.sin(c.from) * dist;
          const rot = c.rot + (1 - e) * 0.6;
          r.draw({ x: x + bd, y: y + bd * 1.5, w: c.cw + bd * 2, h: c.ch + bd * 2, rot, color: withA([0, 0, 0], 0.25) });
          r.draw({ x, y, w: c.cw + bd * 2, h: c.ch + bd * 2, rot, color: col.ink });
          r.draw({ x, y, w: c.cw, h: c.ch, rot, tex: c.w.tex });
        }
        r.resetCam();
        const ed = snap(prog(t, tName - 0.1, tName + 0.35));
        if (ed > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, 0.45 * ed) });
          r.draw({ x: W / 2, y: H / 2, w: panelW * ed, h: blockH + minDim * 0.12, rot: -0.02, color: col.bg });
          endingBlock(r, C, N, E, t, tName + 0.1, col, W / 2, H / 2 - blockH / 2);
        }
      },
    };
  },

  // 作品を丸窓に収めた泡が弾むように現れ、しぼんで消えると名前
  bubbles(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const n = Math.min(9, Math.max(5, works.length));
    const rMax = minDim * 0.24, rMin = minDim * 0.1;
    const circles = [];
    for (let k = 0; k < n; k++) {
      const R = lerp(rMax, rMin, k / (n - 1));
      // 既存の泡となるべく重ならない位置を、決まった回数だけ試して選ぶ
      let best = null;
      for (let a = 0; a < 40; a++) {
        const x = rng.range(R, W - R), y = rng.range(R, H - R);
        const clear = circles.reduce((m, c) => Math.min(m, Math.hypot(c.x - x, c.y - y) - c.R - R), 1e9);
        if (!best || clear > best.clear) best = { x, y, clear };
        if (clear > minDim * 0.02) break;
      }
      const w = works[k % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(k / works.length) % 2];
      circles.push({ ...best, R, w, uv: coverUV(w, R * 2, R * 2, f.x, f.y, panelZoom(w, f, R * 2, R * 2, 1)), t0: 0.05 + k * beat * 0.3, ph: rng.range(0, 6.28) });
    }
    const tOut = beat * 3.5;
    const N = nameText(C, 0.1, 0.8, 0);
    const E = endingText(C);
    circles.forEach((c) => C.ev(c.t0 + 0.15, 'shake', 1.5, 0.1));
    C.ev(tOut + 0.2, 'aberr', 4, 0.3);
    const th = Math.max(2, minDim * 0.006);
    return {
      dur: D,
      draw(r, t, col) {
        circles.forEach((c, k) => {
          const e = backOut(prog(t, c.t0, c.t0 + 0.4), 1.6);
          const out = antic(prog(t, tOut + k * 0.03, tOut + 0.35 + k * 0.03), 0.3, 0.1);
          const s = e * (1 - out);
          if (s <= 0.001) return;
          const y = c.y + Math.sin(t * 1.4 + c.ph) * minDim * 0.006;
          const d = c.R * 2 * s;
          r.draw({ x: c.x, y, w: d, h: d, tex: c.w.tex, uv: c.uv, mask: { type: 'circle', p: Math.SQRT1_2, soft: 1.5 } });
          r.draw({ x: c.x, y, w: d + th, h: d + th, mode: 'ring', pat: [0, th, 0, 0], color: col.accent });
        });
        const lt = t - tOut - 0.25;
        if (lt > 0) {
          const R = minDim * 0.34 * expoOut(prog(lt, 0, 0.6));
          r.draw({ x: W / 2, y: H / 2, w: R * 2, h: R * 2, mode: 'ring', pat: [0, th, 0, 0], color: withA(col.accent, 0.6) });
          endingBlock(r, C, N, E, t, tOut + 0.25, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
        }
      },
    };
  },

  // 映画のクレジットのように作品名が流れ、最後に名前
  credits(C) {
    const { works, W, H, beat, tf, theme, minDim, up } = C;
    const D = beat * 8;
    const rh = minDim * (W > H ? 0.15 : 0.12);
    const thW = rh * 1.2, thH = rh * 0.8;
    const gap = minDim * 0.03;
    const opt = { family: theme.font, size: Math.round(minDim * 0.036), weight: theme.weight, tracking: theme.tracking };
    const rows = works.map((w, i) => {
      const f = w.focal[0] || { x: 0.5, y: 0.5 };
      const TT = tf.get(up(w.title), opt);
      return {
        w, uv: coverUV(w, thW, thH, f.x, f.y, 1.15), TT, ts: Math.min(1, (W * 0.42) / Math.max(1, textW(TT))),
        NO: tf.get(`No.${pad2(i + 1)}`, { family: 'mono', size: Math.round(minDim * 0.018), weight: 700, tracking: 0.18 }),
      };
    });
    const total = rows.length * rh;
    const tRoll = beat * 4;
    const N = nameText(C, 0.1, 0.8, 0);
    const E = endingText(C);
    C.ev(tRoll, 'shake', 3, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        const p = Math.pow(prog(t, 0, tRoll), 1.15);
        const y0 = lerp(H + rh * 0.2, -total - rh * 0.2, p);
        const cx = W / 2;
        rows.forEach((R, i) => {
          const y = y0 + i * rh;
          if (y > H || y + rh < 0) return;
          const cy = y + rh / 2;
          r.draw({ x: cx - gap - thW / 2, y: cy, w: thW, h: thH, tex: R.w.tex, uv: R.uv });
          const bh = textH(R.NO) + minDim * 0.012 + textH(R.TT, R.ts);
          drawText(r, R.NO, cx + gap, cy - bh / 2, { color: col.accent });
          drawText(r, R.TT, cx + gap, cy - bh / 2 + textH(R.NO) + minDim * 0.012, { scale: R.ts, color: col.ink });
        });
        endingBlock(r, C, N, E, t, tRoll - 0.2, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
      },
    };
  },

  // フィルムのコンタクトシート。1 コマに丸を付けて寄ると名前
  contact(C) {
    const { works, W, H, beat, rng, tf, minDim } = C;
    const D = beat * 8;
    const land = W > H;
    const [cols, rows] = land ? [6, 3] : W < H * 0.8 ? [3, 6] : [4, 4];
    const cnt = cols * rows;
    const pad = minDim * 0.05;
    const fw = (W - pad * 2) / cols, fh = (H - pad * 2) / rows;
    const gap = minDim * 0.012;
    const lab = Math.round(minDim * 0.016);
    const cw = fw - gap * 2, ch = fh - gap * 2 - lab * 1.6;
    const cells = Array.from({ length: cnt }, (_, k) => {
      const w = works[k % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(k / works.length) % 2];
      return {
        w, uv: coverUV(w, cw, ch, f.x, f.y, panelZoom(w, f, cw, ch, 0.8)),
        x: pad + fw * ((k % cols) + 0.5), y: pad + fh * (Math.floor(k / cols) + 0.5) - lab * 0.8,
        L: tf.get(`${k + 1}A`, { family: 'mono', size: lab, weight: 700, tracking: 0.1 }),
        t0: 0.05 + (k / cnt) * beat * 1.4,
      };
    });
    const pick = cells[rng.int(cols, cnt - cols - 1)] || cells[0]; // 端の段は避ける
    const tMark = beat * 2, tZoom = beat * 3, tName = tZoom + 0.5;
    const zoomS = Math.min(W / cw, H / ch) * 0.92;
    const N = nameText(C, 0.1, 0.8, 0);
    const E = endingText(C);
    C.ev(tMark, 'shake', 3, 0.15);
    C.ev(tZoom + 0.3, 'aberr', 5, 0.3);
    const th = Math.max(3, minDim * 0.008);
    const sheet = [0.07, 0.07, 0.08]; // フィルムのベース（配色に関係なく暗く）
    return {
      dur: D,
      draw(r, t, col) {
        const ez = snap(prog(t, tZoom - 0.1, tZoom + 0.45));
        const s = Math.exp(lerp(0, Math.log(zoomS), ez));
        r.cam.s = s;
        r.cam.x = -(pick.x - W / 2) * s * ez;
        r.cam.y = -(pick.y - H / 2) * s * ez;
        r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: sheet });
        for (const c of cells) {
          const e = expoOut(prog(t, c.t0, c.t0 + 0.3));
          if (e <= 0) continue;
          r.draw({ x: c.x, y: c.y, w: cw, h: ch, tex: c.w.tex, uv: c.uv, mask: { type: 'wipe', p: e, angle: 0 } });
          drawText(r, c.L, c.x - cw / 2, c.y + ch / 2 + lab * 0.4, { color: withA([0.92, 0.9, 0.86], 0.8 * e) });
        }
        // 選んだコマに丸
        const em = backOut(prog(t, tMark, tMark + 0.35), 1.8);
        if (em > 0) {
          const R = Math.max(cw, ch) * 0.62 * em;
          r.draw({ x: pick.x, y: pick.y, w: R * 2, h: R * 1.7, rot: -0.08, mode: 'ring', pat: [0, th * 1.4, 0, 0], color: col.accent });
        }
        r.resetCam();
        const ed = expoOut(prog(t, tName - 0.1, tName + 0.4));
        if (ed > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, 0.8 * ed) });
          endingBlock(r, C, N, E, t, tName, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
        }
      },
    };
  },

  // 最後の作品から一気に引くと、全作品を並べた壁の 1 枚だった
  zoomout(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const n = works.length;
    const G = 3; // 中央から上下左右に 3 枚ずつ（7×7）
    const gap = minDim * 0.04;
    const tiles = [];
    for (let gy = -G; gy <= G; gy++) {
      for (let gx = -G; gx <= G; gx++) {
        const idx = (((n - 1 + gx * 3 + gy * 5) % n) + n) % n;
        const w = works[idx];
        const f = gx || gy ? pointsFor(w, 2, rng)[(gx + gy + 8) % 2] : w.focal[0] || { x: 0.5, y: 0.5, size: 0.4 };
        tiles.push({ w, x: W / 2 + gx * (W + gap), y: H / 2 + gy * (H + gap), uv: coverUV(w, W, H, f.x, f.y, gx || gy ? panelZoom(w, f, W, H, 0.7) : 1) });
      }
    }
    const s1 = 0.42, s2 = 1 / (2 * G + 1.4);
    const scaleAt = (t) => {
      const a = snap(prog(t, 0.3, 0.3 + beat * 0.8));
      const b = snap(prog(t, beat * 1.6, beat * 2.4));
      return Math.exp(lerp(lerp(0, Math.log(s1), a), Math.log(s2), b)) * (1 - 0.04 * prog(t, beat * 2.4, D));
    };
    const tName = beat * 2.8;
    const N = nameText(C, 0.11, 0.8, 0);
    const E = endingText(C);
    C.ev(0.3 + beat * 0.8, 'shake', 3, 0.15);
    C.ev(beat * 2.4, 'shake', 4, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        const s = scaleAt(t);
        r.cam.s = s;
        r.cam.r = 0.05 * snap(prog(t, beat * 1.6, beat * 2.4));
        const reach = Math.hypot(W, H) / 2 / s;
        for (const T of tiles) {
          if (Math.hypot(T.x - W / 2, T.y - H / 2) - Math.hypot(W, H) / 2 > reach) continue;
          r.draw({ x: T.x, y: T.y, w: W, h: H, tex: T.w.tex, uv: T.uv });
        }
        r.resetCam();
        const ed = expoOut(prog(t, tName, tName + 0.5));
        if (ed > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: withA(col.bg, 0.72 * ed) });
          endingBlock(r, C, N, E, t, tName + 0.1, col, W / 2, H / 2 - textH(N.T, N.s) / 2 - minDim * 0.06);
        }
      },
    };
  },

  // 駅の発車標のようなパタパタ表示で名前が 1 文字ずつ止まる
  flap(C) {
    const { works, W, H, beat, rng, tf, theme, minDim, up, artist } = C;
    const D = beat * 8;
    const chars = Array.from(up(artist || 'PORTFOLIO'));
    const n = chars.length;
    const cw = Math.min((W * 0.9) / n, minDim * 0.15), ch = cw * 1.45;
    const opt = { family: theme.font, size: Math.round(ch * 0.62), weight: Math.min(900, theme.weight + 100) };
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const flipDur = 0.06;
    const cells = chars.map((c, i) => {
      const seq = Array.from({ length: 6 + i + rng.int(0, 3) }, () => ABC[rng.int(0, ABC.length - 1)]);
      seq.push(c);
      return { seq: seq.map((x) => (x.trim() ? tf.get(x, opt) : null)), t0: 0.3 + i * 0.05 };
    });
    const tDone = Math.max(...cells.map((c) => c.t0 + c.seq.length * flipDur));
    // 字の大きさは全部の字で共通（幅の広い字だけ小さくならないよう、最後に止まる字から決める）
    const finals = cells.map((c) => c.seq[c.seq.length - 1]).filter(Boolean);
    const gs = finals.length ? Math.min(...finals.map((T) => Math.min((ch * 0.95) / T.h, (cw * 0.95) / T.w))) : 1;
    const bgW = works[works.length - 1];
    const bgF = bgW.focal[0] || { x: 0.5, y: 0.5, size: 0.4 };
    const E = endingText(C);
    C.ev(tDone, 'shake', 4, 0.2);
    C.ev(tDone, 'flash', 0.25, 0.14);
    const cy = H * 0.46;
    const x0 = W / 2 - (n * cw) / 2;
    const hinge = Math.max(1, minDim * 0.003);
    return {
      dur: D,
      draw(r, t, col) {
        r.draw({ x: W / 2, y: H / 2, w: W, h: H, tex: bgW.tex, uv: coverUV(bgW, W, H, bgF.x, bgF.y, 1.1 + 0.04 * (t / D)), tint: [col.bg[0], col.bg[1], col.bg[2], 0.75] });
        const card = mix(col.ink, col.bg, 0.12);
        const hh = ch / 2;
        for (let i = 0; i < n; i++) {
          const c = cells[i];
          const x = x0 + (i + 0.5) * cw;
          const lt = t - c.t0;
          const last = c.seq.length - 1;
          const k = lt < 0 ? -1 : Math.min(last, Math.floor(lt / flipDur));
          const f = k < 0 || k >= last ? 1 : (lt - k * flipDur) / flipDur;
          const cur = k < 0 ? null : c.seq[k];
          const prev = k <= 0 ? null : c.seq[k - 1];
          // 半分ずつ描く: 上半分は新しい字、下半分は倒れ終わるまで古い字
          const half = (T, top, sy = 1) => {
            const h = hh * sy;
            const yc = top ? cy - h / 2 : cy + h / 2;
            r.draw({ x, y: yc, w: cw * 0.9, h, color: card });
            if (!T) return;
            const gh = (T.h * gs * sy) / 2; // 字の半分の高さ（蝶番の線から上下に付ける）
            r.draw({ x, y: top ? cy - gh / 2 : cy + gh / 2, w: Math.min(T.w * gs, cw * 0.95), h: gh, tex: T.tex, uv: top ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], color: col.bg });
          };
          half(cur, true);
          half(f < 1 ? prev : cur, false);
          if (f < 1) {
            if (f < 0.5) half(prev, true, 1 - f * 2); // 古い字の上半分が倒れる
            else half(cur, false, f * 2 - 1); // 新しい字の下半分が降りてくる
          }
          r.draw({ x, y: cy, w: cw * 0.9, h: hinge, color: col.bg });
        }
        drawText(r, E.TY, W / 2, cy - hh - minDim * 0.07, { align: 'center', reveal: expoOut(prog(t, 0.1, 0.6)), color: col.accent });
        if (E.HT) drawText(r, E.HT, W / 2, cy + hh + minDim * 0.05, { align: 'center', reveal: expoOut(prog(t, tDone + 0.1, tDone + 0.6)), color: withA(col.ink, 0.8) });
      },
    };
  },

  // 全作品が何段もの帯になって交互に流れ続け、中央の帯が開いて名前
  wall(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 8;
    const rows = W > H ? 3 : 5;
    const gap = minDim * 0.012;
    const th = (H - gap * (rows + 1)) / rows;
    const lanes = Array.from({ length: rows }, (_, j) => {
      const order = rng.shuffle(works.map((_, i) => i));
      const items = [];
      let x = 0;
      // 画面幅より長くなるまで繰り返して 1 周ぶんを作る
      while (x < W + th * 3 || items.length < works.length) {
        for (const i of order) {
          const w = works[i];
          const tw = Math.min(th * w.aspect, th * 1.8);
          const f = w.focal[0] || { x: 0.5, y: 0.5, size: 0.4 };
          items.push({ w, x, tw, uv: coverUV(w, tw, th, f.x, f.y, 1) });
          x += tw + gap;
        }
      }
      return { items, period: x, dir: j % 2 ? 1 : -1, v: rng.range(0.8, 1.2), y: gap + th / 2 + j * (th + gap) };
    });
    const tBand = beat * 3;
    const N = nameText(C, 0.1, 0.8, 0);
    const E = endingText(C);
    const blockH = textH(E.TY) + textH(N.T, N.s) + (E.HT ? textH(E.HT) + minDim * 0.04 : 0) + minDim * 0.035;
    C.ev(tBand, 'shake', 3, 0.2);
    return {
      dur: D,
      draw(r, t, col) {
        for (const L of lanes) {
          // 最初は勢いよく流れ、すぐ減速してゆっくり流れ続ける
          const off = L.dir * L.v * (W * 1.4 * (1 - Math.exp(-2.5 * t)) + W * 0.03 * t);
          for (const it of L.items) {
            const x = ((it.x + off) % L.period + L.period) % L.period - th * 2;
            if (x > W + th || x + it.tw < -th) continue;
            r.draw({ x: x + it.tw / 2, y: L.y, w: it.tw, h: th, tex: it.w.tex, uv: it.uv });
          }
        }
        const eb = snap(prog(t, tBand, tBand + 0.4));
        if (eb > 0) {
          r.draw({ x: W / 2, y: H / 2, w: W, h: (blockH + minDim * 0.14) * eb, color: col.bg });
          endingBlock(r, C, N, E, t, tBand + 0.15, col, W / 2, H / 2 - blockH / 2);
        }
      },
    };
  },

  // 写真がプリンタからジジジと出てきて現像され、余白に名前
  print(C) {
    const { works, W, H, beat, tf, theme, minDim, up, artist } = C;
    const D = beat * 8;
    const w = works[works.length - 1];
    const f = w.focal[0] || { x: 0.5, y: 0.5, size: 0.4 };
    const land = W > H;
    const pw = land ? H * 0.5 : W * 0.62;
    const ph = pw * 0.82;
    const m = pw * 0.06;
    const foot = pw * 0.3;
    const cardW = pw + m * 2, cardH = ph + m + foot;
    const slotY = H * (land ? 0.1 : 0.13);
    const tPrint = beat * 2.5;
    const paper = [0.96, 0.95, 0.92], inkC = [0.13, 0.13, 0.15];
    const NT = tf.get(up(artist || 'PORTFOLIO'), { family: theme.font, size: Math.round(foot * 0.36), weight: Math.min(900, theme.weight + 100), tracking: theme.tracking });
    const ns = Math.min(1, (pw * 0.92) / Math.max(1, textW(NT)));
    const E = endingText(C);
    const HS = C.handle ? tf.get(C.handle, { family: 'mono', size: Math.round(foot * 0.14), weight: 700, tracking: 0.1 }) : null;
    const steps = 5;
    for (let k = 1; k <= steps; k++) C.ev(0.1 + (tPrint - 0.1) * (k / steps), 'shake', 1.5, 0.08);
    C.ev(tPrint + 0.6, 'shake', 4, 0.2);
    const printed = (t) => {
      const q = prog(t, 0.1, tPrint) * steps;
      const k = Math.floor(q);
      return Math.min(1, (k + snap(q - k)) / steps);
    };
    // カードの中心からの位置 (dx,dy) を回転させて画面座標に
    const at = (cx, cy, rot, dx, dy) => [cx + dx * Math.cos(rot) - dy * Math.sin(rot), cy + dx * Math.sin(rot) + dy * Math.cos(rot)];
    return {
      dur: D,
      draw(r, t, col) {
        const p = printed(t);
        const drop = snap(prog(t, tPrint + 0.2, tPrint + 0.6));
        const rot = lerp(0, -0.04, drop);
        const cy = lerp(slotY - cardH / 2 + cardH * p, H * 0.52, drop);
        const cx = W / 2;
        const sh = minDim * 0.01;
        r.draw({ x: cx + sh, y: cy + sh * 1.5, w: cardW, h: cardH, rot, color: withA([0, 0, 0], 0.3) });
        r.draw({ x: cx, y: cy, w: cardW, h: cardH, rot, color: paper });
        const [px, py] = at(cx, cy, rot, 0, -cardH / 2 + m + ph / 2);
        const dev = smooth(prog(t, 0.3, tPrint + beat * 1.5)); // 現像: 白っぽい状態から色が出る
        r.draw({ x: px, y: py, w: pw, h: ph, rot, tex: w.tex, uv: coverUV(w, pw, ph, f.x, f.y, 1.05), tint: [paper[0], paper[1], paper[2], 0.85 * (1 - dev)] });
        const [nx, ny] = at(cx, cy, rot, 0, cardH / 2 - foot * 0.62);
        const ew = expoOut(prog(t, tPrint + 0.5, tPrint + 1.3));
        drawText(r, NT, nx, ny - textH(NT, ns) / 2, { align: 'center', scale: ns, rot, color: inkC, mask: { type: 'wipe', p: ew, angle: 0 } });
        if (HS) {
          const [hx, hy] = at(cx, cy, rot, 0, cardH / 2 - foot * 0.22);
          drawText(r, HS, hx, hy - textH(HS) / 2, { align: 'center', rot, color: withA(inkC, 0.7), reveal: expoOut(prog(t, tPrint + 0.9, tPrint + 1.4)) });
        }
        // プリンタの口（ここより上に出ている紙は隠す）
        if (drop < 1) {
          r.draw({ x: W / 2, y: slotY / 2, w: W, h: slotY, color: col.bg });
          r.draw({ x: W / 2, y: slotY, w: cardW * 1.25, h: Math.max(4, minDim * 0.025), color: col.ink });
        }
        drawText(r, E.TY, W / 2, minDim * 0.04, { align: 'center', reveal: expoOut(prog(t, tPrint + 0.3, tPrint + 0.8)), color: col.accent });
      },
    };
  },

};

export const CLOSER_LABELS = { grid: 'グリッド', filmstrip: 'フィルム', stack: 'スタック', knockout: '抜き文字', orbit: 'オービット', curtain: 'カーテン', rewind: '巻き戻し', collage: 'コラージュ', bubbles: 'バブル', credits: 'クレジット', contact: 'コンタクト', zoomout: 'ズームアウト', flap: 'パタパタ', wall: 'ウォール', print: 'プリント' };
