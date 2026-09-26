// 振付（作品の見せ方）。S を受け取り (r, t, col, hint) => void を返す

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

export const VARIANTS = {
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

export const VARIANT_KEYS = () => Object.keys(VARIANTS);
