// 振付（作品の見せ方）。S を受け取り (r, t, col, hint) => void を返す

import { createRng } from '../rng.js';
import {
  pad2, TAU, lum, mix, withA, pointsFor, camLerp, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, layoutFor, makeTextBlock,
} from '../kit.js';
import { circleP } from './bookend-kit.js';
import {
  clamp, lerp, prog, smooth, quadOut, expoIn, expoOut, expoInOut,
  backOut, snap, snapSoft, antic,
} from '../ease.js';

// 枠線（太さ th の 4 本の帯）。rot で中心のまわりに回す
function outline(r, x, y, w, h, th, color, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const bar = (dx, dy, bw, bh) => r.draw({ x: x + dx * c - dy * s, y: y + dx * s + dy * c, w: bw, h: bh, rot, color });
  bar(0, -(h - th) / 2, w, th);
  bar(0, (h - th) / 2, w, th);
  bar(-(w - th) / 2, 0, th, h - 2 * th);
  bar((w - th) / 2, 0, th, h - 2 * th);
}

// 四隅のトンボ（L 字）
function corners(r, x, y, w, h, len, th, color) {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = x + sx * w / 2, cy = y + sy * h / 2;
      r.draw({ x: cx - sx * len / 2, y: cy - sy * th / 2, w: len, h: th, color });
      r.draw({ x: cx - sx * th / 2, y: cy - sy * len / 2, w: th, h: len, color });
    }
  }
}

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
  // 拍ごとに注目点へ段階的に踏み込み（パンチイン）、最後に一気に引いて全体。
  // 絵は額（パネル）の中で寄り、額も一段ずつ大きくなる。踏み込む先の画角は先にトンボの枠で示す
  punch(S) {
    const { work, W, H, beat, D, layout, points, tf, minDim } = S;
    const f = points[0];
    const img = layout.img;
    const m = minDim * 0.06;
    const hits = [beat * 0.75, beat * 1.5, beat * 2.25].filter((x) => x < D - 1.8);
    const levels = hits.map((_, k) => (k + 1) / hits.length);
    const tOut = Math.min(D - 1.4, beat * 3);
    const lead = Math.min(0.34, beat * 0.5); // 枠は拍の少し前に出る
    // 額の大きさ: 引きの位置から、画面いっぱい（余白 m）へ近づける
    const big = { x: W / 2, y: H / 2, w: W - 2 * m, h: H - 2 * m };
    const panelAt = (lv) => {
      const e = lv * 0.75;
      return { x: lerp(img.x, big.x, e), y: lerp(img.y, big.y, e), w: lerp(img.w, big.w, e), h: lerp(img.h, big.h, e) };
    };
    const zMax = clamp(panelZoom(work, f, big.w, big.h, 1.4), 2.2, 3.2); // いちばん寄ったときの倍率
    const uvAt = (lv, P) => coverUV(work, P.w, P.h, lerp(0.5, f.x, Math.min(1, lv * 1.6)), lerp(0.5, f.y, Math.min(1, lv * 1.6)), Math.exp(lerp(0, Math.log(zMax), lv)));
    const th = Math.max(2, minDim * 0.004), len = minDim * 0.045, bd = Math.max(2, minDim * 0.006);
    const labels = levels.map((lv) => tf.get(`×${Math.exp(lerp(0, Math.log(zMax), lv)).toFixed(1)}`, { family: 'mono', size: Math.round(minDim * 0.022), weight: 700, tracking: 0.1 }));
    hits.forEach((h) => { S.event(h, 'flash', 0.15, 0.1); S.event(h, 'shake', 3, 0.12); });
    S.event(tOut, 'aberr', 4, 0.3);
    const text = makeTextBlock(S);
    const level = (t) => {
      let lv = 0;
      hits.forEach((h, k) => { lv = lerp(lv, levels[k], snap(prog(t, h - 0.1, h))); });
      return lv * (1 - expoOut(prog(t, tOut, tOut + 0.55)));
    };
    // 画角 uv2 を、いまの額 P（画角 uv）の中の矩形にする
    const rectIn = (uv2, uv, P) => {
      const sx = P.w / (uv[2] - uv[0]), sy = P.h / (uv[3] - uv[1]);
      const x0 = P.x - P.w / 2 + (uv2[0] - uv[0]) * sx, x1 = P.x - P.w / 2 + (uv2[2] - uv[0]) * sx;
      const y0 = P.y - P.h / 2 + (uv2[1] - uv[1]) * sy, y1 = P.y - P.h / 2 + (uv2[3] - uv[1]) * sy;
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    };
    // k: 倍率の表示（引くときの入れ子の枠では出さない）
    const frame = (r, R, a, col, k = -1) => {
      corners(r, R.x, R.y, R.w, R.h, len, th * 1.6, withA(col.accent, a));
      outline(r, R.x, R.y, R.w, R.h, Math.max(1, th * 0.5), withA([1, 1, 1], 0.55 * a));
      if (k >= 0) drawText(r, labels[k], R.x - R.w / 2 + th * 3, R.y - R.h / 2 + th * 3, { color: withA(col.accent, a) });
    };
    return (r, t, col, hint) => {
      const lv = level(t), lvPrev = level(t - 1 / 60);
      const P = panelAt(lv);
      const uv = uvAt(lv, P), uvPrev = uvAt(lvPrev, panelAt(lvPrev));
      const drift = 1 + 0.02 * (t / D);
      const Pd = { ...P, w: P.w * drift, h: P.h * drift };
      // 額の縁（文字色）とアクセント色の影
      r.draw({ x: Pd.x + bd * 2, y: Pd.y + bd * 2, w: Pd.w + bd * 2, h: Pd.h + bd * 2, color: col.accent });
      r.draw({ x: Pd.x, y: Pd.y, w: Pd.w + bd * 2, h: Pd.h + bd * 2, color: col.ink });
      const blur = [((uvPrev[0] + uvPrev[2]) - (uv[0] + uv[2])) * 0.25, ((uvPrev[1] + uvPrev[3]) - (uv[1] + uv[3])) * 0.25]; // 半分のシャッター
      r.draw({ x: Pd.x, y: Pd.y, w: Pd.w, h: Pd.h, tex: work.tex, uv, blur });
      // 次の画角の枠: 大きめに出てピタッと締まり、踏み込むと額の縁まで広がって消える
      hits.forEach((h, k) => {
        const a = expoOut(prog(t, h - lead, h - lead + 0.16)) * (1 - prog(t, h - 0.02, h + 0.12));
        if (a <= 0) return;
        const Pn = panelAt(levels[k]);
        const R = rectIn(uvAt(levels[k], Pn), uv, Pd);
        const g = 1 + 0.25 * (1 - backOut(prog(t, h - lead, h - lead + 0.24), 1.6));
        frame(r, { ...R, w: R.w * g, h: R.h * g }, a, col, k);
      });
      // 引くときは、たどった画角を入れ子の枠で見せてから消す
      const a = Math.min(1, prog(t, tOut + 0.15, tOut + 0.3)) * (1 - expoIn(prog(t, tOut + 0.7, tOut + 1.2)));
      if (a > 0) levels.forEach((l) => frame(r, rectIn(uvAt(l, panelAt(l)), uv, Pd), a, col));
      const sp = Math.abs(lv - lvPrev) * 60;
      hint.radial = clamp(sp * 0.02, 0, 0.12);
      hint.cx = Pd.x / W; hint.cy = 1 - Pd.y / H;
      text(r, t, tOut + 0.35, col);
    };
  },

  // 沈んだ絵をスキャンの光が上から下へなぞり、なぞった所から色が戻る
  scan(S) {
    const { work, W, H, beat, D, layout, points, minDim, tf } = S;
    const img = layout.img;
    const tScan = Math.min(D - 1.8, beat * 2.2);
    const marks = points.slice(0, 3).map((p, i) => ({
      p, L: tf.get(`${pad2(i + 1)}`, { family: 'mono', size: Math.round(minDim * 0.016), weight: 700, tracking: 0.1 }),
    }));
    S.event(0.1, 'aberr', 2, 0.2);
    S.event(tScan, 'flash', 0.2, 0.12);
    const text = makeTextBlock(S);
    const th = Math.max(2, minDim * 0.004);
    return (r, t, col) => {
      const s = 1 + 0.02 * (t / D);
      const w = img.w * s, h = img.h * s;
      const ein = expoOut(prog(t, 0, 0.3));
      const p = smooth(prog(t, 0.25, tScan));
      r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, tint: [col.bg[0], col.bg[1], col.bg[2], 0.78], alpha: ein });
      if (p > 0) r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, mask: { type: 'wipe', p, angle: Math.PI / 2, soft: 6 } });
      if (p > 0 && p < 1) {
        const y = img.y - h / 2 + h * p;
        r.draw({ x: img.x, y, w: w * 1.04, h: minDim * 0.04, color: withA(col.accent, 0.25) });
        r.draw({ x: img.x, y, w: w * 1.04, h: th, color: col.accent });
      }
      // なぞった注目点に印
      for (const M of marks) {
        const lt = t - (0.25 + (tScan - 0.25) * M.p.y);
        if (lt < 0 || p <= 0) continue;
        const e = backOut(prog(lt, 0, 0.3), 1.8) * (1 - expoOut(prog(t, tScan + 0.4, tScan + 0.8)));
        if (e <= 0) continue;
        const cx = img.x + (M.p.x - 0.5) * w, cy = img.y + (M.p.y - 0.5) * h;
        const R = minDim * 0.03 * e;
        r.draw({ x: cx, y: cy, w: R * 2, h: R * 2, mode: 'ring', pat: [0, th, 0, 0], color: col.accent });
        drawText(r, M.L, cx + R + minDim * 0.008, cy - R, { color: col.accent, alpha: e });
      }
      text(r, t, tScan + 0.3, col);
    };
  },

  // 上から吊られて落ちてきた絵が、振り子のように揺れて止まる
  swing(S) {
    const { work, W, H, beat, D, layout, rng, minDim } = S;
    const img = { ...layout.img, w: layout.img.w * 0.9, h: layout.img.h * 0.9 };
    const b = minDim * 0.01;
    const hang = minDim * 0.05; // 留め具から絵の上端まで
    const pivot = { x: img.x, y: img.y - img.h / 2 - hang };
    const a0 = rng.sign() * rng.range(0.35, 0.5);
    const om = (Math.PI * 2) / (beat * 1.1);
    const tLand = 0.45;
    S.event(tLand, 'shake', 4, 0.18);
    const text = makeTextBlock(S);
    const ang = (t) => (t < tLand ? a0 : a0 * Math.exp(-(t - tLand) * 1.7) * Math.cos((t - tLand) * om));
    return (r, t, col) => {
      const drop = -H * (1 - expoOut(prog(t, 0, tLand)));
      const a = ang(t);
      const px = pivot.x, py = pivot.y + drop;
      const dist = hang + img.h / 2;
      const cx = px - Math.sin(a) * dist, cy = py + Math.cos(a) * dist;
      // 吊りひも（留め具から絵の上端の両角へ）
      for (const sx of [-1, 1]) {
        const ex = cx + Math.cos(a) * sx * img.w * 0.3 + Math.sin(a) * img.h / 2;
        const ey = cy + Math.sin(a) * sx * img.w * 0.3 - Math.cos(a) * img.h / 2;
        const vx = ex - px, vy = ey - py, L = Math.hypot(vx, vy);
        r.draw({ x: (px + ex) / 2, y: (py + ey) / 2, w: L, h: Math.max(1.5, minDim * 0.003), rot: Math.atan2(vy, vx), color: withA(col.ink, 0.6) });
      }
      r.draw({ x: cx + b, y: cy + b * 1.6, w: img.w + b * 2, h: img.h + b * 2, rot: a, color: withA([0, 0, 0], 0.25) });
      r.draw({ x: cx, y: cy, w: img.w + b * 2, h: img.h + b * 2, rot: a, color: col.ink });
      r.draw({ x: cx, y: cy, w: img.w, h: img.h, rot: a, tex: work.tex });
      r.draw({ x: px, y: py, w: minDim * 0.022, h: minDim * 0.022, mode: 'disc', color: col.accent });
      text(r, t, beat * 2.2, col);
    };
  },

  // 奥から飛び込む。入れ子の枠をくぐりながら加速し、行き過ぎてから着地。いちばん内側の枠が絵の縁取りになる
  dive(S) {
    const { work, W, H, beat, D, layout, rng, minDim } = S;
    const img = layout.img;
    const tLand = Math.min(D - 1.6, beat * 1.5);
    const tilt = rng.sign() * rng.range(0.05, 0.09);
    const NF = 5, step = 1.5; // 枠の数と、枠どうしの奥行きの比
    const th0 = Math.max(2, minDim * 0.0035);
    const pad = minDim * 0.018;
    const tPulse = beat * 4.5 < D - 1 ? beat * 4.5 : -1;
    S.event(tLand, 'shake', 7, 0.25);
    S.event(tLand, 'aberr', 5, 0.3);
    if (tPulse > 0) S.event(tPulse, 'aberr', 2, 0.2);
    const text = makeTextBlock(S);
    // 絵の大きさ: 奥行きを一定の速さで詰める（log 空間で加速）→ 行き過ぎ → 着地
    const scaleAt = (t) => {
      if (t < tLand) return Math.exp(lerp(Math.log(0.05), Math.log(1.1), Math.pow(prog(t, 0, tLand), 2.4)));
      return lerp(1.1, 1, expoOut(prog(t, tLand, tLand + 0.45))) * (1 + 0.02 * prog(t, tLand + 0.45, D));
    };
    return (r, t, col, hint) => {
      const s = scaleAt(t), sPrev = scaleAt(t - 1 / 60);
      const eL = expoOut(prog(t, tLand, tLand + 0.5));
      const rot = tilt * (1 - eL);
      const a = clamp(t / 0.12);
      const bw = img.w + pad * 2, bh = img.h + pad * 2;
      // 手前の枠（奥から見て絵より手前にある）: 絵と一緒に近づき、画面の外へ抜けていく
      for (let k = NF - 1; k >= 0; k--) {
        let m = Math.pow(step, k + 1);
        // いちばん内側の枠は着地で絵に寄り、縁取りとして残る
        if (k === 0) m = lerp(m, 1, backOut(prog(t, tLand - 0.05, tLand + 0.4), 1.4));
        const sk = s * m;
        if (sk * bw > W * 2.4) continue;
        const fade = k === 0 ? 1 : clamp((W * 2.4 - sk * bw) / (W * 0.8));
        const tk = th0 * Math.min(4, Math.max(1, sk));
        const c = k % 2 ? withA(col.ink, 0.5 * fade * a) : withA(col.accent, fade * a);
        outline(r, img.x, img.y, bw * sk, bh * sk, tk, c, rot * (1 + k * 0.6));
      }
      // 着地のあと、拍に合わせて枠がもう一度手前へ抜ける
      if (tPulse > 0) {
        const q = expoOut(prog(t, tPulse, tPulse + 0.6));
        if (q > 0 && q < 1) outline(r, img.x, img.y, bw * s * (1 + 0.6 * q), bh * s * (1 + 0.6 * q), th0 * (1 + q), withA(col.accent, 1 - q));
      }
      r.draw({ x: img.x, y: img.y, w: img.w * s, h: img.h * s, rot, tex: work.tex, alpha: a });
      hint.radial = clamp(Math.abs(Math.log(s / sPrev)) * 60 * 0.03, 0, 0.4);
      hint.cx = img.x / W; hint.cy = 1 - img.y / H;
      text(r, t, tLand + 0.35, col);
    };
  },

  // 網点のツートンで見せてから、注目点から本来の色が広がる
  duotone(S) {
    const { work, W, H, beat, D, layout, points, minDim } = S;
    const img = layout.img;
    const f = points[0];
    const tC = Math.min(D - 1.4, beat * 2.5);
    const per = Math.max(6, minDim * 0.018);
    S.event(tC, 'flash', 0.25, 0.14);
    S.event(tC, 'aberr', 3, 0.3);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const s = 1 + 0.05 * (1 - expoOut(prog(t, 0, 0.8))) + 0.02 * prog(t, 0.8, D);
      const w = img.w * s, h = img.h * s;
      const ein = expoOut(prog(t, 0, 0.35));
      const ec = expoOut(prog(t, tC, tC + 0.5));
      if (ec < 1) {
        r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, tint: [col.accent[0], col.accent[1], col.accent[2], 0.6], alpha: ein });
        r.draw({ x: img.x, y: img.y, w, h, mode: 'dots', pat: [per, 0.55, Math.PI / 4, per * 0.4 * t], color: withA(col.bg, 0.55 * ein) });
      }
      if (ec > 0) {
        const R = circleP(w, h, f.x, f.y, Math.hypot(w, h) * ec);
        r.draw({ x: img.x, y: img.y, w, h, tex: work.tex, mask: { type: 'circle', p: R, cx: f.x, cy: f.y, soft: 3 } });
      }
      text(r, t, tC + 0.3, col);
    };
  },

  // 4 つの寄りが田の字に並び、中身がすべり合って 1 枚の絵に組み上がる
  quad(S) {
    const { work, W, H, beat, D, layout, points, minDim } = S;
    const img = layout.img;
    const cw = img.w / 2, ch = img.h / 2;
    const gap0 = minDim * 0.025;
    const crops = [points[0], points[1], points[2], { x: 0.5, y: 0.5, size: 0.9 }];
    const cells = [0, 1, 2, 3].map((k) => {
      const i = k % 2, j = Math.floor(k / 2);
      const p = crops[k];
      return {
        i, j, t0: 0.05 + k * beat * 0.35,
        from: coverUV(work, cw, ch, p.x, p.y, panelZoom(work, p, cw, ch, 0.9)),
        to: [i / 2, j / 2, (i + 1) / 2, (j + 1) / 2],
      };
    });
    const tJoin = Math.min(D - 1.4, beat * 2.5);
    cells.forEach((c) => S.event(c.t0 + 0.15, 'shake', 1.5, 0.1));
    S.event(tJoin, 'shake', 5, 0.2);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const ej = snap(prog(t, tJoin - 0.3, tJoin + 0.15));
      const gap = gap0 * (1 - ej);
      const drift = 1 + 0.025 * prog(t, tJoin + 0.2, D);
      for (const c of cells) {
        const e = backOut(prog(t, c.t0, c.t0 + 0.35), 1.5);
        if (e <= 0) continue;
        const uv = c.from.map((v, k) => lerp(v, c.to[k], ej));
        const x = img.x + ((c.i - 0.5) * cw + (c.i - 0.5) * gap) * drift;
        const y = img.y + ((c.j - 0.5) * ch + (c.j - 0.5) * gap) * drift;
        if (ej < 1) r.draw({ x, y, w: (cw + gap0 * 0.6) * e * drift, h: (ch + gap0 * 0.6) * e * drift, color: withA(col.accent, 1 - ej) });
        r.draw({ x, y, w: (cw + 0.6) * e * drift, h: (ch + 0.6) * e * drift, tex: work.tex, uv });
      }
      text(r, t, tJoin + 0.25, col);
    };
  },

  // 大きく浮いた絵が、影を縮めながら一気に叩きつけられる。接地の衝撃で枠が広がり、破片が飛ぶ
  slam(S) {
    const { work, W, H, beat, D, layout, rng, minDim } = S;
    const img = layout.img;
    const tHit = Math.min(D - 1.8, beat * 0.75);
    const rot0 = rng.sign() * rng.range(0.04, 0.08);
    const lift = 0.5; // 浮いている間の拡大（高さ）
    const shx = rng.sign() * minDim * 0.06, shy = minDim * 0.1; // 浮いているときの影のずれ
    // 破片: 絵の縁から外へ飛ぶ短い線
    const sparks = Array.from({ length: 16 }, () => {
      const side = rng.int(0, 3), u = rng.range(-0.45, 0.45);
      const ex = side < 2 ? u * img.w : (side === 2 ? -1 : 1) * img.w / 2;
      const ey = side < 2 ? (side === 0 ? -1 : 1) * img.h / 2 : u * img.h;
      let dx = side < 2 ? u * 0.8 : (side === 2 ? -1 : 1), dy = side < 2 ? (side === 0 ? -1 : 1) : u * 0.8;
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      return { ex, ey, dx, dy, d: rng.range(0, 0.06), far: minDim * rng.range(0.08, 0.18), len: minDim * rng.range(0.04, 0.08) };
    });
    S.event(tHit, 'shake', 10, 0.3);
    S.event(tHit, 'flash', 0.3, 0.1);
    S.event(tHit, 'aberr', 5, 0.3);
    const text = makeTextBlock(S);
    return (r, t, col) => {
      const h = 1 - expoIn(prog(t, 0, tHit)); // 高さ（1 = いちばん上）
      const lt = t - tHit;
      const a = clamp(t / Math.max(0.05, tHit * 0.35));
      // 接地の瞬間につぶれて戻る
      const q = lt >= 0 ? Math.exp(-lt * 16) * Math.cos(lt * 45) : 0;
      const s = (1 + lift * h) * (1 + 0.02 * prog(t, tHit + 0.5, D));
      const w = img.w * s * (1 + 0.035 * q), hh = img.h * s * (1 - 0.035 * q);
      const rot = rot0 * h;
      // 影: 高いほど大きくずれて薄くぼける。接地すると絵の下に締まる
      for (let k = 0; k < 3; k++) {
        const spread = minDim * (0.004 + 0.035 * h) * (k + 1);
        r.draw({
          x: img.x + shx * h + minDim * 0.006, y: img.y + shy * h + minDim * 0.012,
          w: img.w + spread * 2, h: img.h + spread * 2, rot: rot * 0.5, color: [0, 0, 0, (0.2 - 0.1 * h) * a],
        });
      }
      if (lt >= 0) {
        // 衝撃の枠（アクセント色が先、文字色が少し遅れて）
        for (let k = 0; k < 2; k++) {
          const e = expoOut(prog(lt, k * 0.07, k * 0.07 + 0.55));
          if (e >= 1) continue;
          const g = 1 + (0.1 + 0.12 * k) * e;
          const tk = Math.max(1.5, minDim * (k ? 0.012 : 0.028) * (1 - e));
          outline(r, img.x, img.y, img.w * g + tk * 2, img.h * g + tk * 2, tk, k ? withA(col.ink, 0.6 * (1 - e)) : withA(col.accent, 1 - e));
        }
        for (const p of sparks) {
          const e = expoOut(prog(lt, p.d, p.d + 0.45));
          if (e <= 0 || e >= 1) continue;
          const L = p.len * (1 - e);
          const dist = minDim * 0.02 + p.far * e + L / 2;
          r.draw({ x: img.x + p.ex + p.dx * dist, y: img.y + p.ey + p.dy * dist, w: L, h: Math.max(3, minDim * 0.007), rot: Math.atan2(p.dy, p.dx), color: withA(col.accent, 1 - e) });
        }
      }
      r.draw({ x: img.x, y: img.y, w, h: hh, rot, tex: work.tex, alpha: a });
      text(r, t, tHit + 0.35, col);
    };
  },

  // 映画のように上下を黒帯で切り、横長の画角でゆっくりパン。帯が開くと全体
  cinema(S) {
    const { work, W, H, beat, D, layout, points, minDim, tf, idx } = S;
    const img = layout.img;
    const ratio = W > H ? 2.39 : 1;
    const barH = Math.max(0, (H - W / ratio) / 2);
    const p0 = points[0], p1 = points[1];
    const hq = closeHq(work, p0, W, H, 0.7);
    const tOpen = Math.min(D - 1.3, beat * 4);
    const SC = tf.get(`SCENE ${pad2(idx + 1)}`, { family: 'mono', size: Math.round(minDim * 0.016), weight: 700, tracking: 0.3 });
    const fit = { ix: 0.5, iy: 0.5, sx: img.x, sy: img.y, hq: img.h };
    S.event(tOpen, 'aberr', 3, 0.3);
    const text = makeTextBlock(S);
    const pan = (t) => {
      const e = smooth(prog(t, 0, tOpen));
      return clampFull(work, { ix: lerp(p0.x, p1.x, e), iy: lerp(p0.y, p1.y, e), sx: W / 2, sy: H / 2, hq: hq * (1 + 0.05 * e) }, W, H);
    };
    const cam = (t) => camLerp(pan(Math.min(t, tOpen)), fit, expoOut(prog(t, tOpen, tOpen + 0.6)));
    const black = [0.02, 0.02, 0.03];
    return (r, t, col) => {
      drawCam(r, work, cam(t), cam(t - 1 / 60), { shutter: 0.5 });
      const eb = expoOut(prog(t, 0, 0.4)) * (1 - snap(prog(t, tOpen - 0.1, tOpen + 0.35)));
      if (eb > 0 && barH > 0) {
        const h = barH * eb;
        r.draw({ x: W / 2, y: h / 2, w: W, h, color: black });
        r.draw({ x: W / 2, y: H - h / 2, w: W, h, color: black });
        drawText(r, SC, minDim * 0.05, H - h + (h - textH(SC)) / 2, { color: withA([0.9, 0.9, 0.9], 0.8), alpha: eb, reveal: expoOut(prog(t, 0.3, 0.8)) });
      }
      text(r, t, tOpen + 0.35, col);
    };
  },

  // 粗いマス目の絵が、注目点から広がる波に合わせて 4 つずつ細かく割れていき、最後にくっきりした絵になる
  pixel(S) {
    const { work, W, H, beat, D, layout, points, minDim } = S;
    const img = layout.img;
    const a = work.aspect, f = points[0];
    const c0 = a >= 1 ? 4 : 3, r0 = Math.max(2, Math.round(c0 / a));
    const LMAX = 3;
    // 波の出る時刻と届く距離（画像の高さ単位）。いちばん細かい段は注目点のまわりだけ（描画命令を抑える）
    const t0s = [0.15, 0.15 + beat * 0.75, 0.15 + beat * 1.5];
    const fine = Math.min(0.45, Math.sqrt((180 * a) / (Math.PI * c0 * r0 * 64)));
    const reach = [a + 1, a + 1, fine];
    const tS = Math.min(D - 1.4, beat * 2.75);
    const gap0 = Math.max(1, minDim * 0.004);
    t0s.forEach((x) => S.event(x + 0.1, 'aberr', 1.5, 0.15));
    S.event(tS, 'flash', 0.25, 0.12);
    S.event(tS, 'shake', 3, 0.12);
    const text = makeTextBlock(S);
    const radius = (L, t) => reach[L] * quadOut(prog(t, t0s[L], t0s[L] + beat * 0.9));
    const dist = (u, v) => Math.hypot((u - f.x) * a, v - f.y);
    return (r, t, col) => {
      const s = 1 + 0.02 * (t / D);
      const w = img.w * s, h = img.h * s;
      if (t >= tS) {
        r.draw({ x: img.x, y: img.y, w, h, tex: work.tex });
        text(r, t, tS + 0.3, col);
        return;
      }
      const gap = gap0 * (1 - snap(prog(t, tS - 0.25, tS)));
      const cell = (L, i, j, dParent) => {
        const cols = c0 << L, rows = r0 << L;
        const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
        const d = dist(u, v);
        if (L < LMAX && d < radius(L, t)) {
          for (let k = 0; k < 4; k++) cell(L + 1, i * 2 + (k & 1), j * 2 + (k >> 1), d);
          return;
        }
        // 割れた直後のマスは波の先端で光って小さく弾む
        // （波が止まったら消す。止まった位置のマスが光ったまま残らないように）
        const glow = L > 0 ? clamp(1 - (radius(L - 1, t) - dParent) / 0.1) * (1 - prog(t, t0s[L - 1] + beat * 0.75, t0s[L - 1] + beat * 0.9)) : 0;
        const e0 = L === 0 ? backOut(prog(t, 0.02 + d * 0.12, 0.3 + d * 0.12), 1.4) : 1;
        if (e0 <= 0) return;
        const cw = w / cols, ch = h / rows, k = e0 * (1 - 0.2 * glow);
        r.draw({
          x: img.x - w / 2 + (i + 0.5) * cw, y: img.y - h / 2 + (j + 0.5) * ch, w: (cw - gap) * k + 0.6, h: (ch - gap) * k + 0.6,
          tex: work.tex, lod: Math.max(0, Math.log2(work.width / cols)), uv: [u, v, u, v],
          tint: glow > 0 ? [col.accent[0], col.accent[1], col.accent[2], 0.6 * glow] : undefined,
        });
      };
      for (let j = 0; j < r0; j++) for (let i = 0; i < c0; i++) cell(0, i, j, 0);
      text(r, t, tS + 0.3, col);
    };
  },

};

export const VARIANT_KEYS = () => Object.keys(VARIANTS);
