// オープニング / エンディング共通の部品（作家名・サブタイトル・締めの文字組み）

import { clamp, lerp, prog, expoOut, backOut, snap, antic } from '../ease.js';
import {
  pad2, withA, pointsFor, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, fitIn,
} from '../kit.js';
// 作家名（なければ PORTFOLIO）を横幅に収まる大きさで
export function nameText(C, sizeFrac, maxWFrac, weightBoost = 100) {
  const { tf, theme, minDim, W, up, artist } = C;
  const T = tf.get(up(artist || 'PORTFOLIO'), {
    family: theme.font, size: Math.round(minDim * sizeFrac),
    weight: Math.min(900, theme.weight + weightBoost), tracking: theme.tracking,
  });
  return { T, s: Math.min(1, (W * maxWFrac) / textW(T)) };
}

// サブタイトル。未入力なら出さない（null）。自動で PORTFOLIO 等を補わない
export function subText(C) {
  const { tf, minDim, up, subline } = C;
  if (!subline) return null;
  return tf.get(up(subline), { family: 'mono', size: Math.round(minDim * 0.024), weight: 600, tracking: 0.3 });
}

// 名前の着地（大見出し＋アクセント線＋サブ）。lt は着地からの経過秒
export function nameLanding(r, C, N, SUB, lt, col, o = {}) {
  const { W, H, minDim } = C;
  const cy = o.cy ?? H / 2;
  const s = N.s * (1 + 0.12 * (1 - expoOut(prog(lt, 0, 0.8))));
  const nh = textH(N.T, s);
  const y = cy - nh / 2 - minDim * 0.02;
  drawText(r, N.T, W / 2, y, { align: 'center', scale: s, reveal: expoOut(prog(lt, 0, 0.6)), color: col.ink });
  const eb = snap(prog(lt, 0.15, 0.6));
  r.draw({ x: W / 2, y: y + nh + minDim * 0.035, w: textW(N.T, N.s) * eb, h: Math.max(4, minDim * 0.007), color: col.accent });
  drawText(r, SUB, W / 2, y + nh + minDim * 0.07, { align: 'center', reveal: expoOut(prog(lt, 0.3, 0.85)), color: col.ink });
  return y;
}

// 円マスクの進捗値（ローカル座標の中心 cx,cy と半径 px から）
export function circleP(w, h, cx, cy, rPx) {
  const px = (cx - 0.5) * w, py = (cy - 0.5) * h;
  const fx = Math.max(Math.abs(-w / 2 - px), Math.abs(w / 2 - px));
  const fy = Math.max(Math.abs(-h / 2 - py), Math.abs(h / 2 - py));
  return rPx / Math.hypot(fx, fy);
}

// ================================================================ エンディング

export function endingText(C) {
  const { tf, minDim, handle } = C;
  return {
    TY: tf.get('THANK YOU FOR WATCHING', { family: 'mono', size: Math.round(minDim * 0.022), weight: 600, tracking: 0.35 }),
    HT: handle ? tf.get(handle, { family: 'mono', size: Math.round(minDim * 0.026), weight: 700, tracking: 0.1 }) : null,
  };
}

// 名前・お礼・リンクのブロックを (cx, top) から描く。t0 は出始め
export function endingBlock(r, C, N, E, t, t0, col, cx, top, align = 'center') {
  const { minDim } = C;
  drawText(r, E.TY, cx, top, { align, reveal: expoOut(prog(t, t0 + 0.1, t0 + 0.65)), color: col.accent });
  const y = top + textH(E.TY) + minDim * 0.035;
  drawText(r, N.T, cx, y, { align, scale: N.s, reveal: expoOut(prog(t, t0, t0 + 0.6)), color: col.ink });
  if (E.HT) drawText(r, E.HT, cx, y + textH(N.T, N.s) + minDim * 0.04, { align, reveal: expoOut(prog(t, t0 + 0.2, t0 + 0.75)), color: withA(col.ink, 0.75) });
}
