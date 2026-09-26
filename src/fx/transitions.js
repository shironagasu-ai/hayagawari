// トランジション（作品の切り替え）。合成パス用のヒント（出/入り）と、上に重ねるカラーバー

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

export const EXIT_DUR = 0.34, ENTRY_DUR = 0.52;

// 抽選に使うトランジションの種類（スタイルの trans の重みのキーと一致させる）
export const TRANSITION_KEYS = ['whip', 'zoom', 'iris', 'slices', 'glitch', 'bars', 'cut', 'spin', 'door'];

export function transitionHint(tr, phase, p, dt, W, H) {
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

// カラーバーが通過して画面を切り替える
export function drawBars(r, tr, lt, W, H, colA, colB) {
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
