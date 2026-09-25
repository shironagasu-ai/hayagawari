// オープニング / エンディングのパターン。
// 各パターンは C（共通コンテキスト）を受け取り { dur, draw(r, t, col) } を返す。
// C: { works, W, H, beat, rng, tf, theme, minDim, artist, subline, handle, year, up, ev(t, kind, amt, dur, color) }

import { clamp, lerp, prog, expoOut, backOut, snap, antic } from './ease.js';
import {
  pad2, withA, pointsFor, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, fitIn,
} from './kit.js';

// 作家名（なければ PORTFOLIO）を横幅に収まる大きさで
function nameText(C, sizeFrac, maxWFrac, weightBoost = 100) {
  const { tf, theme, minDim, W, up, artist } = C;
  const T = tf.get(up(artist || 'PORTFOLIO'), {
    family: theme.font, size: Math.round(minDim * sizeFrac),
    weight: Math.min(900, theme.weight + weightBoost), tracking: theme.tracking,
  });
  return { T, s: Math.min(1, (W * maxWFrac) / textW(T)) };
}

// サブタイトル。未入力なら出さない（null）。自動で PORTFOLIO 等を補わない
function subText(C) {
  const { tf, minDim, up, subline } = C;
  if (!subline) return null;
  return tf.get(up(subline), { family: 'mono', size: Math.round(minDim * 0.024), weight: 600, tracking: 0.3 });
}

// 名前の着地（大見出し＋アクセント線＋サブ）。lt は着地からの経過秒
function nameLanding(r, C, N, SUB, lt, col, o = {}) {
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

// ================================================================ オープニング

export const OPENERS = {
  // 全作品の注目点を高速カットで見せてから名前を叩きつける
  montage(C) {
    const { works, W, H, beat, rng, tf, minDim } = C;
    const D = beat * 6;
    const mont = Math.min(12, Math.max(6, works.length * 2));
    const tName = beat * 2.5;
    const montDur = tName / mont;
    const shots = [];
    for (let i = 0; i < mont; i++) {
      const w = works[i % works.length];
      const f = pointsFor(w, 1 + (i >> 1) % 3, rng)[(i >> 1) % 3] || w.focal[0];
      shots.push({ w, f, win: rng.chance(0.4), rot: rng.chance(0.25) ? rng.sign() * 0.04 : 0, hq: closeHq(w, f, W, H, rng.range(0.6, 1.1)) });
    }
    const N = nameText(C, W > H ? 0.16 : 0.13, 0.84);
    const SUB = subText(C);
    const CT = tf.get(`${pad2(works.length)} WORKS`, { family: 'mono', size: Math.round(minDim * 0.02), weight: 600, tracking: 0.25 });
    // 点滅ラベル: サブタイトルがあればそれ、なければ作品数（勝手な文言は入れない）
    const LT = tf.get(C.subline ? C.up(C.subline) : `${pad2(works.length)} WORKS`, { family: 'mono', size: Math.round(minDim * 0.02), weight: 600, tracking: 0.4 });
    for (let i = 1; i < mont; i++) C.ev(i * montDur, 'flash', 0.12, 0.08);
    C.ev(tName, 'flash', 0.6, 0.22);
    C.ev(tName, 'shake', 8, 0.3);
    C.ev(tName, 'aberr', 6, 0.4);
    return {
      dur: D,
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
          if (Math.floor(t / (beat / 4)) % 2 === 0) drawText(r, LT, W / 2, H - minDim * 0.08, { align: 'center', color: withA([1, 1, 1], 0.9) });
          return;
        }
        const lt = t - tName;
        const y = nameLanding(r, C, N, SUB, lt, col);
        drawText(r, CT, W / 2, y - minDim * 0.07, { align: 'center', reveal: expoOut(prog(lt, 0.4, 0.95)), color: withA(col.ink, 0.6) });
      },
    };
  },

  // 1文字ずつ拍に乗せて打ち込む
  type(C) {
    const { W, H, beat, tf, theme, minDim, up, artist } = C;
    const D = beat * 6;
    const str = up(artist || 'PORTFOLIO');
    const chars = Array.from(str);
    const size = Math.round(minDim * (W > H ? 0.16 : 0.13));
    const opt = { family: theme.font, size, weight: Math.min(900, theme.weight + 100), tracking: 0 };
    const glyphs = chars.map((c) => tf.get(c, opt));
    const track = size * (0.02 + theme.tracking);
    const rawW = glyphs.reduce((a, g) => a + textW(g), 0) + track * (chars.length - 1);
    const s = Math.min(1, (W * 0.86) / rawW);
    const step = Math.min(beat / 4, (beat * 2.5) / Math.max(1, chars.length));
    const t0 = beat * 0.5;
    const tDone = t0 + step * chars.length;
    const SUB = subText(C);
    const lineH = textH(glyphs.find((g) => textH(g) > 0) || glyphs[0], s);
    chars.forEach((_, i) => C.ev(t0 + i * step, 'aberr', 1.5, 0.12));
    C.ev(tDone, 'flash', 0.4, 0.18);
    C.ev(tDone, 'shake', 5, 0.25);
    let x = W / 2 - (rawW * s) / 2;
    const xs = glyphs.map((g) => { const cx = x; x += (textW(g) + track) * s; return cx; });
    return {
      dur: D,
      draw(r, t, col) {
        // 背後のアクセント面: 打ち込み中は画面を覆い、打ち終わりで抜ける
        const pin = expoOut(prog(t, 0, 0.35));
        const pout = expoOut(prog(t, tDone, tDone + 0.45));
        if (pout < 1) r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: col.accent, mask: pout > 0 ? { type: 'wipe', p: 1 - pout, angle: Math.PI } : { type: 'wipe', p: pin, angle: 0 } });
        const done = t >= tDone;
        const y = H / 2 - lineH / 2 - minDim * 0.02;
        for (let i = 0; i < glyphs.length; i++) {
          const lt = t - (t0 + i * step);
          if (lt < 0) break;
          const e = expoOut(prog(lt, 0, 0.22));
          const sc = s * lerp(1.9, 1, e);
          const g = glyphs[i];
          const gx = xs[i] + (textW(g, s) - textW(g, sc)) / 2;
          const gy = y + (lineH - textH(g, sc)) / 2;
          const c = !done ? (lt < 0.08 ? col.bg : col.ink) : col.ink;
          drawText(r, g, gx, gy, { scale: sc, color: c, alpha: clamp(e * 2) });
        }
        const lt = t - tDone;
        if (lt > 0) {
          const eb = snap(prog(lt, 0.05, 0.5));
          r.draw({ x: W / 2, y: y + lineH + minDim * 0.035, w: rawW * s * eb, h: Math.max(4, minDim * 0.007), color: col.accent });
          drawText(r, SUB, W / 2, y + lineH + minDim * 0.07, { align: 'center', reveal: expoOut(prog(lt, 0.2, 0.75)), color: col.ink });
        }
      },
    };
  },

  // 作品の寄りを並べた短冊が閉じて、開くと名前
  shutter(C) {
    const { works, W, H, beat, rng } = C;
    const D = beat * 6;
    const n = W > H ? 5 : 3;
    const tOpen = beat * 2.5;
    const sw = W / n;
    const strips = Array.from({ length: n }, (_, i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      return { w, f, dir: i % 2 ? 1 : -1, z: panelZoom(w, f, sw, H, rng.range(0.7, 1)) };
    });
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    C.ev(0.05, 'aberr', 3, 0.3);
    C.ev(tOpen, 'shake', 6, 0.25);
    C.ev(tOpen + 0.2, 'aberr', 5, 0.35);
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tOpen) nameLanding(r, C, N, SUB, t - tOpen - 0.12, col);
        for (let i = 0; i < n; i++) {
          const S = strips[i];
          const din = 0.04 + i * 0.05, dout = tOpen - 0.18 + i * 0.035;
          const ein = expoOut(prog(t, din, din + 0.55));
          const eout = antic(prog(t, dout, dout + 0.4), 0.3, 0.03);
          if (ein <= 0 || eout >= 1) continue;
          const oy = S.dir * H * (1 - ein) + S.dir * -1 * H * eout * 1.05;
          const par = (1 - ein) * 0.15 * S.dir + 0.03 * S.dir * (t / tOpen);
          const uv = coverUV(S.w, sw, H, S.f.x, S.f.y - par, S.z);
          r.draw({ x: sw * (i + 0.5), y: H / 2 + oy, w: sw + 1, h: H, tex: S.w.tex, uv });
          r.draw({ x: sw * (i + 1), y: H / 2 + oy, w: Math.max(2, C.minDim * 0.004), h: H, color: col.bg });
        }
      },
    };
  },

  // 3・2・1 のカウント（数字の形に作品を抜く）
  countdown(C) {
    const { works, W, H, beat, rng, tf, minDim } = C;
    const D = beat * 6;
    const size = Math.round(minDim * 0.62);
    const nums = ['3', '2', '1'].map((c) => tf.get(c, { family: 'condensed', size, weight: 900 }));
    const pics = [0, 1, 2].map((i) => {
      const w = works[i % works.length];
      return { w, f: pointsFor(w, 3, rng)[Math.floor(i / works.length) % 3] };
    });
    const tName = beat * 3;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    for (let i = 0; i < 3; i++) { C.ev(i * beat, 'aberr', 3, 0.2); C.ev(i * beat, 'shake', 3, 0.15); }
    C.ev(tName, 'flash', 0.6, 0.22);
    return {
      dur: D,
      draw(r, t, col) {
        if (t < tName) {
          const i = Math.min(2, Math.floor(t / beat));
          const lt = t - i * beat;
          const T = nums[i], P = pics[i];
          const e = expoOut(prog(lt, 0, 0.3));
          const sc = lerp(1.35, 1, e) * (1 + 0.04 * lt);
          const w = T.w * sc, h = T.h * sc;
          // 背景リング
          const rr = minDim * 0.42 * backOut(prog(lt, 0, 0.35), 1.6);
          r.draw({ x: W / 2, y: H / 2, w: rr * 2, h: rr * 2, mode: 'ring', pat: [0, Math.max(3, minDim * 0.006), 0, 0], color: col.accent });
          // 秒針のように回る扇（細い線）
          const ang = -Math.PI / 2 + (lt / beat) * Math.PI * 2;
          r.draw({ x: W / 2 + Math.cos(ang) * rr / 2, y: H / 2 + Math.sin(ang) * rr / 2, w: rr, h: Math.max(2, minDim * 0.004), rot: ang, color: withA(col.ink, 0.5) });
          const uv = coverUV(P.w, w, h, P.f.x, P.f.y, 1.4);
          r.draw({ x: W / 2, y: H / 2, w, h, tex: P.w.tex, uv, mtex: T.tex });
          return;
        }
        nameLanding(r, C, N, SUB, t - tName, col);
      },
    };
  },

  // 巨大な名前の形に作品を抜いて見せる
  knockout(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const N = nameText(C, W > H ? 0.3 : 0.2, 0.92, 200);
    const SUB = subText(C);
    const cuts = [0, 1, 2].map((i) => {
      const w = works[i % works.length];
      return { w, f: pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2] };
    });
    const seg = beat * 1.5;
    C.ev(0.02, 'aberr', 4, 0.3);
    for (let i = 1; i < 3; i++) C.ev(i * seg, 'flash', 0.2, 0.12);
    C.ev(seg * 3, 'shake', 4, 0.2);
    const off = minDim * 0.012;
    return {
      dur: D,
      draw(r, t, col) {
        const e = expoOut(prog(t, 0, 0.7));
        const settle = snap(prog(t, seg * 3 - 0.2, seg * 3 + 0.35));
        const s = N.s * lerp(1.25, 1, e) * lerp(1, 0.78, settle);
        const w = N.T.w * s, h = N.T.h * s;
        const cy = lerp(H / 2, H * 0.44, settle);
        const i = Math.min(2, Math.floor(t / seg));
        const P = cuts[i];
        const lt = t - i * seg;
        const z = 1.2 * (1 + 0.1 * (1 - expoOut(prog(lt, 0, 0.4)))) * (1 + 0.05 * lt);
        const uv = coverUV(P.w, w, h, P.f.x + 0.04 * lt, P.f.y, z);
        // 影（アクセント色のずらし文字）→ 作品で抜いた文字
        r.draw({ x: W / 2 + off * e, y: cy + off * e, w, h, color: col.accent, mtex: N.T.tex, alpha: e });
        r.draw({ x: W / 2, y: cy, w, h, tex: P.w.tex, uv, mtex: N.T.tex, mask: { type: 'wipe', p: e, angle: -Math.PI / 2, soft: 2 } });
        if (settle > 0) {
          const y = cy + textH(N.T, s) / 2 + minDim * 0.06;
          drawText(r, SUB, W / 2, y, { align: 'center', reveal: expoOut(prog(t, seg * 3, seg * 3 + 0.5)), color: col.ink });
        }
      },
    };
  },
  // 上下2段の寄りがすれ違い、抜けた後に名前の上半分・下半分が逆方向から来て噛み合う
  slice(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const A = works[0], B = works[1 % works.length];
    const fa = pointsFor(A, 1, rng)[0], fb = pointsFor(B, 2, rng)[works.length > 1 ? 0 : 1];
    const za = panelZoom(A, fa, W, H / 2, rng.range(0.8, 1.1)), zb = panelZoom(B, fb, W, H / 2, rng.range(0.8, 1.1));
    const tOut = beat * 2, tMeet = tOut + 0.5;
    const N = nameText(C, W > H ? 0.16 : 0.13, 0.86);
    const SUB = subText(C);
    C.ev(0.05, 'aberr', 3, 0.3);
    C.ev(tMeet, 'shake', 8, 0.28);
    C.ev(tMeet, 'aberr', 6, 0.35);
    C.ev(tMeet, 'flash', 0.35, 0.16);
    return {
      dur: D,
      draw(r, t, col) {
        // 2段の寄り
        for (let k = 0; k < 2; k++) {
          const w = k ? B : A, f = k ? fb : fa, z = k ? zb : za, dir = k ? 1 : -1;
          const ein = expoOut(prog(t, 0.04 + k * 0.08, 0.6 + k * 0.08));
          const eout = antic(prog(t, tOut - 0.1 + k * 0.05, tOut + 0.3 + k * 0.05), 0.3, 0.03);
          if (ein <= 0 || eout >= 1) continue;
          const x = W / 2 + dir * W * (1 - ein) - dir * W * 1.05 * eout;
          const uv = coverUV(w, W, H / 2, f.x + 0.03 * dir * (t / tOut), f.y, z);
          const vel = Math.abs(eout - antic(prog(t - 1 / 60, tOut - 0.1 + k * 0.05, tOut + 0.3 + k * 0.05), 0.3, 0.03));
          r.draw({ x, y: H / 4 + (k * H) / 2, w: W, h: H / 2, tex: w.tex, uv, blur: vel > 0.002 ? [dir * vel * 1.2, 0] : undefined });
        }
        // 名前: 上半分は右から、下半分は左から
        const e = expoOut(prog(t, tOut + 0.05, tMeet));
        if (e <= 0) return;
        const s = N.s;
        const w = N.T.w * s, h = N.T.h * s;
        const cy = H / 2 - minDim * 0.02;
        const off = W * 0.9 * (1 - e);
        r.draw({ x: W / 2 + off, y: cy - h / 4, w, h: h / 2, tex: N.T.tex, uv: [0, 0, 1, 0.5], color: col.ink });
        r.draw({ x: W / 2 - off, y: cy + h / 4, w, h: h / 2, tex: N.T.tex, uv: [0, 0.5, 1, 1], color: col.ink });
        const lt = t - tMeet;
        if (lt > 0) {
          const eb = snap(prog(lt, 0, 0.35));
          r.draw({ x: W / 2, y: cy, w: w * 1.08 * eb, h: Math.max(2, minDim * 0.004), color: col.accent });
          drawText(r, SUB, W / 2, cy + textH(N.T, s) / 2 + minDim * 0.06, { align: 'center', reveal: expoOut(prog(lt, 0.2, 0.7)), color: col.ink });
        }
      },
    };
  },

  // 入れ子になった作品の額の奥へ吸い込まれていき、最奥で名前
  tunnel(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const n = Math.min(6, Math.max(3, works.length));
    const frames = Array.from({ length: n }, (_, i) => {
      const w = works[i % works.length];
      return { w, f: pointsFor(w, 1, rng)[0], rot: (i % 2 ? 1 : -1) * rng.range(0.02, 0.06) };
    });
    const ratio = 0.46; // 1段奥の額の大きさ
    const tName = beat * 3;
    for (let i = 1; i < n; i++) C.ev((tName * i) / n, 'aberr', 2, 0.15);
    C.ev(tName, 'flash', 0.55, 0.2);
    C.ev(tName, 'shake', 6, 0.25);
    const N = nameText(C, W > H ? 0.16 : 0.13, 0.84);
    const SUB = subText(C);
    const b = minDim * 0.01;
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tName) { nameLanding(r, C, N, SUB, t - tName, col); return; }
        // z: 何段ぶん奥へ進んだか（加速して吸い込まれる）
        const z = (n - 0.6) * Math.pow(prog(t, 0, tName), 1.6);
        for (let k = 0; k < n; k++) {
          const sc = Math.pow(ratio, k - z);
          const w = W * 0.8 * sc, h = H * 0.8 * sc;
          if (w > W * 12 || w < 4) continue;
          const F = frames[k];
          const uv = coverUV(F.w, w, h, F.f.x, F.f.y, 1.1);
          r.draw({ x: W / 2, y: H / 2, w: w + b * 2 * sc, h: h + b * 2 * sc, rot: F.rot, color: col.ink });
          r.draw({ x: W / 2, y: H / 2, w, h, rot: F.rot, tex: F.w.tex, uv });
        }
      },
    };
  },

  // 端末風の起動ログ。作品を1行ずつ読み込み、右に寄りが切り替わる
  boot(C) {
    const { works, W, H, beat, rng, tf, minDim, up } = C;
    const D = beat * 6;
    const fs = Math.round(minDim * 0.022);
    const opt = { family: 'mono', size: fs, weight: 600, tracking: 0.06 };
    const maxRows = Math.min(works.length, 6);
    const lines = [
      tf.get('> BOOT SEQUENCE', opt),
      tf.get(`> LOADING ${pad2(works.length)} WORKS`, opt),
      ...works.slice(0, maxRows).map((w, i) => tf.get(`  [${pad2(i + 1)}] ${up(w.title).slice(0, 22).padEnd(22, '.')} `, opt)),
    ];
    if (works.length > maxRows) lines.push(tf.get(`  ... +${works.length - maxRows}`, opt));
    const OK = tf.get('OK', { ...opt, weight: 800 });
    const tName = beat * 3.5;
    const step = Math.min(beat / 4, (tName - 0.3) / lines.length);
    const shots = works.slice(0, maxRows).map((w) => ({ w, f: pointsFor(w, 1, rng)[0] }));
    lines.forEach((_, i) => { if (i >= 2) C.ev(i * step, 'aberr', 1.5, 0.1); });
    C.ev(tName - 0.15, 'aberr', 8, 0.4);
    C.ev(tName, 'flash', 0.5, 0.18);
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    const land = W > H;
    const pw = land ? W * 0.36 : W * 0.84, ph = land ? H * 0.62 : H * 0.34;
    const px = land ? W * 0.72 : W / 2, py = land ? H / 2 : H * 0.72;
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tName) { nameLanding(r, C, N, SUB, t - tName, col); return; }
        const x0 = land ? W * 0.07 : W * 0.08, y0 = land ? H * 0.2 : H * 0.12;
        const lh = fs * 1.9;
        const shown = Math.min(lines.length, Math.floor(t / step) + 1);
        for (let i = 0; i < shown; i++) {
          const T = lines[i];
          const lt = t - i * step;
          drawText(r, T, x0, y0 + i * lh, { color: i < 2 ? col.accent : col.ink, alpha: clamp(lt / 0.04) });
          if (i >= 2 && i < 2 + maxRows && lt > step * 0.6) drawText(r, OK, x0 + textW(T) + fs * 0.4, y0 + i * lh, { color: col.accent });
        }
        // カーソル
        if (Math.floor(t / (beat / 4)) % 2 === 0) {
          const T = lines[shown - 1];
          r.draw({ x: x0 + textW(T) + fs * 0.9, y: y0 + (shown - 1) * lh + fs * 0.45, w: fs * 0.6, h: fs, color: col.ink });
        }
        // 読み込み中の作品の寄り
        const cur = clamp(shown - 3, 0, shots.length - 1);
        if (shown >= 3) {
          const S = shots[cur];
          const lt = t - (cur + 2) * step;
          const punch = 1 + 0.1 * (1 - expoOut(prog(lt, 0, 0.3)));
          const uv = coverUV(S.w, pw, ph, S.f.x, S.f.y, panelZoom(S.w, S.f, pw, ph) * punch);
          r.draw({ x: px, y: py, w: pw + 4, h: ph + 4, color: col.accent });
          r.draw({ x: px, y: py, w: pw, h: ph, tex: S.w.tex, uv });
        }
      },
    };
  },

};

// ================================================================ エンディング

function endingText(C) {
  const { tf, minDim, handle } = C;
  return {
    TY: tf.get('THANK YOU FOR WATCHING', { family: 'mono', size: Math.round(minDim * 0.022), weight: 600, tracking: 0.35 }),
    HT: handle ? tf.get(handle, { family: 'mono', size: Math.round(minDim * 0.026), weight: 700, tracking: 0.1 }) : null,
  };
}

// 名前・お礼・リンクのブロックを (cx, top) から描く。t0 は出始め
function endingBlock(r, C, N, E, t, t0, col, cx, top, align = 'center') {
  const { minDim } = C;
  drawText(r, E.TY, cx, top, { align, reveal: expoOut(prog(t, t0 + 0.1, t0 + 0.65)), color: col.accent });
  const y = top + textH(E.TY) + minDim * 0.035;
  drawText(r, N.T, cx, y, { align, scale: N.s, reveal: expoOut(prog(t, t0, t0 + 0.6)), color: col.ink });
  if (E.HT) drawText(r, E.HT, cx, y + textH(N.T, N.s) + minDim * 0.04, { align, reveal: expoOut(prog(t, t0 + 0.2, t0 + 0.75)), color: withA(col.ink, 0.75) });
}

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

export const OPENER_LABELS = { montage: 'モンタージュ', type: 'タイプ', shutter: 'シャッター', countdown: 'カウント', knockout: '抜き文字', slice: 'スライス', tunnel: 'トンネル', boot: '起動ログ' };
export const CLOSER_LABELS = { grid: 'グリッド', filmstrip: 'フィルム', stack: 'スタック', knockout: '抜き文字', orbit: 'オービット', curtain: 'カーテン', rewind: '巻き戻し' };
