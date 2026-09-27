// オープニングのパターン。
// 各パターンは C（共通コンテキスト）を受け取り { dur, draw(r, t, col) } を返す。
// C: { works, W, H, beat, rng, tf, theme, minDim, artist, subline, handle, ev(t, kind, amt, dur, color) }

import { clamp, lerp, prog, expoOut, backOut, snap, antic } from '../ease.js';
import {
  pad2, withA, mix, pointsFor, clampFull, closeHq, drawCam, camQuad, camLerp, coverUV, panelZoom,
  drawText, textH, textW, fitIn,
} from '../kit.js';
import { nameText, subText, nameLanding, circleP, endingText, endingBlock } from './bookend-kit.js';

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
    const LT = tf.get(C.subline || `${pad2(works.length)} WORKS`, { family: 'mono', size: Math.round(minDim * 0.02), weight: 600, tracking: 0.4 });
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
    const { W, H, beat, tf, theme, minDim, artist } = C;
    const D = beat * 6;
    const str = artist || 'PORTFOLIO';
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
    const { works, W, H, beat, rng, tf, minDim } = C;
    const D = beat * 6;
    const fs = Math.round(minDim * 0.022);
    const opt = { family: 'mono', size: fs, weight: 600, tracking: 0.06 };
    const maxRows = Math.min(works.length, 6);
    const lines = [
      tf.get('> BOOT SEQUENCE', opt),
      tf.get(`> LOADING ${pad2(works.length)} WORKS`, opt),
      ...works.slice(0, maxRows).map((w, i) => tf.get(`  [${pad2(i + 1)}] ${w.title.slice(0, 22).padEnd(22, '.')} `, opt)),
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

  // ブラインドの羽根が拍ごとに開いて寄りが入れ替わり、最後は閉じて名前
  blinds(C) {
    const { works, W, H, beat, rng } = C;
    const D = beat * 6;
    const n = W > H ? 9 : 7;
    const shots = [0, 1, 2].map((i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      return { w, f, z: panelZoom(w, f, W, H, rng.range(0.75, 1)) };
    });
    const tName = beat * 3;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    for (let i = 0; i < 3; i++) C.ev(i * beat, 'aberr', 2.5, 0.2);
    C.ev(tName, 'shake', 5, 0.25);
    C.ev(tName + 0.3, 'flash', 0.3, 0.15);
    const full = (r, S, lt, mask) => r.draw({ x: W / 2, y: H / 2, w: W, h: H, tex: S.w.tex, uv: coverUV(S.w, W, H, S.f.x, S.f.y, S.z * (1 + 0.03 * lt)), mask });
    return {
      dur: D,
      draw(r, t, col) {
        if (t < tName) {
          const i = Math.min(2, Math.floor(t / beat));
          const lt = t - i * beat;
          if (i > 0) full(r, shots[i - 1], lt + beat);
          else r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: col.accent });
          full(r, shots[i], lt, { type: 'blinds', p: snap(prog(lt, 0, beat * 0.6)), angle: i % 2 ? Math.PI / 2 : 0, count: n, stagger: 0.6 });
          return;
        }
        // 背景色の羽根が閉じて、名前
        const lt = t - tName;
        const pc = snap(prog(lt, 0, 0.45));
        if (pc < 1) full(r, shots[2], lt + beat);
        r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: col.bg, mask: { type: 'blinds', p: pc, angle: Math.PI, count: n, stagger: 0.6 } });
        if (lt > 0.3) nameLanding(r, C, N, SUB, lt - 0.3, col);
      },
    };
  },

  // 注目点から円が開いて次の作品へ。最後は中央へ閉じて名前
  iris(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const shots = [0, 1, 2].map((i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      const uv = coverUV(w, W, H, f.x, f.y, panelZoom(w, f, W, H, rng.range(0.7, 0.95)));
      // 注目点が画面のどこに来るか（0..1）と、そこから最も遠い角までの距離
      const cx = clamp((f.x - uv[0]) / (uv[2] - uv[0])), cy = clamp((f.y - uv[1]) / (uv[3] - uv[1]));
      return { w, uv, cx, cy, far: Math.hypot(Math.max(cx, 1 - cx) * W, Math.max(cy, 1 - cy) * H) };
    });
    const tClose = beat * 3 - 0.35, tName = beat * 3;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    for (let i = 0; i < 3; i++) C.ev(i * beat, 'aberr', 3, 0.2);
    C.ev(tName, 'flash', 0.4, 0.18);
    C.ev(tName, 'shake', 5, 0.25);
    const th = Math.max(3, minDim * 0.008);
    const farC = Math.hypot(W / 2, H / 2);
    const full = (r, S, mask) => r.draw({ x: W / 2, y: H / 2, w: W, h: H, tex: S.w.tex, uv: S.uv, mask });
    const ring = (r, x, y, R, col) => r.draw({ x, y, w: R * 2 + th, h: R * 2 + th, mode: 'ring', pat: [0, th, 0, 0], color: col });
    return {
      dur: D,
      draw(r, t, col) {
        if (t < tClose) {
          const i = Math.min(2, Math.floor(t / beat));
          const lt = t - i * beat;
          if (i > 0) full(r, shots[i - 1]);
          const S = shots[i];
          const p = expoOut(prog(lt, 0.02, beat * 0.7));
          full(r, S, { type: 'circle', p, cx: S.cx, cy: S.cy, soft: 2 });
          if (p < 0.98) ring(r, S.cx * W, S.cy * H, p * S.far, col.accent);
          return;
        }
        const lt = t - tClose;
        const pc = 1 - snap(prog(lt, 0, 0.35));
        if (pc > 0) {
          full(r, shots[2], { type: 'circle', p: pc, cx: 0.5, cy: 0.5, soft: 2 });
          ring(r, W / 2, H / 2, pc * farC, col.accent);
        }
        if (t >= tName) nameLanding(r, C, N, SUB, t - tName, col);
      },
    };
  },

  // 名前を繰り返した帯が何段も逆向きに流れ、はけると名前
  marquee(C) {
    const { works, W, H, beat, rng, tf, theme, minDim, artist } = C;
    const D = beat * 6;
    const rows = W > H ? 5 : 8;
    const rh = H / rows;
    const T = tf.get(`${artist || 'PORTFOLIO'}  /  `, { family: theme.font, size: Math.round(rh * 0.6), weight: Math.min(900, theme.weight + 100), tracking: theme.tracking });
    const tw = Math.max(1, textW(T));
    const bgs = [0, 1, 2].map((i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      return { w, f, z: panelZoom(w, f, W, H, rng.range(0.8, 1.1)) };
    });
    const speed = Array.from({ length: rows }, () => W * rng.range(0.25, 0.45));
    const tOut = beat * 3, tName = tOut + 0.35;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    for (let i = 1; i < 3; i++) C.ev(i * beat, 'flash', 0.15, 0.1);
    C.ev(tOut, 'aberr', 6, 0.35);
    C.ev(tName, 'shake', 5, 0.25);
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tName) { nameLanding(r, C, N, SUB, t - tName, col); return; }
        // 背景: 拍ごとに寄りが替わる（背景色で沈める）
        const i = Math.min(2, Math.floor(t / beat));
        const S = bgs[i];
        r.draw({ x: W / 2, y: H / 2, w: W, h: H, tex: S.w.tex, uv: coverUV(S.w, W, H, S.f.x, S.f.y, S.z * (1 + 0.05 * (t - i * beat))), tint: [col.bg[0], col.bg[1], col.bg[2], 0.55] });
        const y0 = (rh - textH(T)) / 2;
        for (let k = 0; k < rows; k++) {
          const dir = k % 2 ? -1 : 1;
          const ein = expoOut(prog(t, k * 0.04, 0.45 + k * 0.04));
          const eout = antic(prog(t, tOut - 0.1 + k * 0.03, tOut + 0.25 + k * 0.03), 0.3, 0.03);
          if (eout >= 1) continue;
          const scroll = ((dir * speed[k] * t) % tw + tw) % tw;
          const shift = -dir * W * (1 - ein) + dir * W * 1.2 * eout;
          const color = k % 2 ? col.accent : col.ink;
          for (let x = scroll - tw * 2; x < W + tw; x += tw) drawText(r, T, x + shift, k * rh + y0, { color });
        }
      },
    };
  },

  // 作品の寄りを敷き詰めたタイルが弾んで並び、裏返りながら消えると名前
  tiles(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const [cols, rows] = W > H * 1.2 ? [4, 3] : W < H * 0.8 ? [3, 5] : [3, 3];
    const gap = Math.max(2, minDim * 0.006);
    const tw = (W - gap * (cols + 1)) / cols, th = (H - gap * (rows + 1)) / rows;
    const cnt = cols * rows;
    const inOrder = rng.shuffle([...Array(cnt).keys()]);
    const outOrder = rng.shuffle([...Array(cnt).keys()]);
    const tOut = beat * 2.6;
    const tiles = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const w = works[k % works.length];
        const f = pointsFor(w, 3, rng)[Math.floor(k / works.length) % 3];
        tiles.push({
          w, x: gap + tw / 2 + i * (tw + gap), y: gap + th / 2 + j * (th + gap),
          uv: coverUV(w, tw, th, f.x, f.y, panelZoom(w, f, tw, th, rng.range(0.8, 1.2))),
          tin: 0.05 + (inOrder.indexOf(k) / cnt) * beat * 1.4,
          tout: tOut + (outOrder.indexOf(k) / cnt) * beat * 0.6,
        });
      }
    }
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    C.ev(beat * 1.5, 'shake', 3, 0.15);
    C.ev(tOut + beat * 0.3, 'aberr', 4, 0.3);
    C.ev(tOut + beat * 0.7, 'flash', 0.3, 0.15);
    return {
      dur: D,
      draw(r, t, col) {
        if (t > tOut) nameLanding(r, C, N, SUB, t - tOut - 0.1, col);
        for (const T of tiles) {
          const ein = backOut(prog(t, T.tin, T.tin + 0.35), 1.4);
          if (ein <= 0) continue;
          const flip = snap(prog(t, T.tout, T.tout + 0.3));
          if (flip >= 1) continue;
          // 縦軸で 90° 裏返る（幅が縮み、アクセント色に染まる）
          r.draw({ x: T.x, y: T.y, w: tw * ein * Math.cos(flip * Math.PI / 2), h: th * ein, tex: T.w.tex, uv: T.uv, tint: [col.accent[0], col.accent[1], col.accent[2], flip * 0.9] });
        }
      },
    };
  },

  // 注目点の超寄りから拍ごとに段階的に引き、額に収まった作品の下に名前
  pullback(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const w = works[0];
    const f = pointsFor(w, 1, rng)[0];
    const land = W > H;
    const b = fitIn(w.aspect, W * (land ? 0.46 : 0.72), H * (land ? 0.5 : 0.4));
    const cams = [
      clampFull(w, { ix: f.x, iy: f.y, sx: W / 2, sy: H / 2, hq: closeHq(w, f, W, H, 1.7) }, W, H),
      clampFull(w, { ix: f.x, iy: f.y, sx: W / 2, sy: H / 2, hq: closeHq(w, f, W, H, 0.9) }, W, H),
      clampFull(w, { ix: 0.5, iy: 0.5, sx: W / 2, sy: H / 2, hq: 0 }, W, H),
      { ix: 0.5, iy: 0.5, sx: W / 2, sy: H * (land ? 0.36 : 0.33), hq: b.h },
    ];
    const steps = [beat, beat * 2, beat * 3];
    const camAt = (t) => {
      let c = cams[0];
      for (let k = 0; k < 3; k++) {
        const e = snap(prog(t, steps[k] - 0.35, steps[k]));
        if (e <= 0) break;
        c = camLerp(cams[k], cams[k + 1], e);
      }
      // 止まっている間もわずかに引き続ける
      return { ...c, hq: c.hq * (1 - 0.02 * ((t % beat) / beat)) };
    };
    const N = nameText(C, land ? 0.11 : 0.1, 0.84);
    const SUB = subText(C);
    steps.forEach((s, k) => { C.ev(s - 0.1, 'aberr', 3, 0.2); C.ev(s, 'shake', 3 + k, 0.2); });
    return {
      dur: D,
      draw(r, t, col) {
        const c = camAt(t);
        const ef = snap(prog(t, steps[2] - 0.35, steps[2]));
        if (ef > 0) {
          const q = camQuad(w, c);
          const bb = minDim * 0.012 * ef;
          r.draw({ x: q.x, y: q.y, w: q.w + bb * 2, h: q.h + bb * 2, color: col.ink });
        }
        drawCam(r, w, c, t > 1 / 60 ? camAt(t - 1 / 60) : null);
        if (t > steps[2]) nameLanding(r, C, N, SUB, t - steps[2], col, { cy: H * (land ? 0.8 : 0.76) });
      },
    };
  },

  // 対角線で 2 枚の寄りがすれ違い、境目の線が帯になって名前を載せる
  diagonal(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const A = works[0], B = works[1 % works.length];
    const fa = pointsFor(A, 1, rng)[0], fb = pointsFor(B, 2, rng)[works.length > 1 ? 0 : 1];
    const za = panelZoom(A, fa, W, H, rng.range(0.8, 1)), zb = panelZoom(B, fb, W, H, rng.range(0.8, 1));
    const nrm = Math.atan2(W, H); // 左下→右上の対角線に直交する向き
    const lineAng = Math.atan2(-H, W);
    const ux = Math.cos(lineAng), uy = Math.sin(lineAng);
    const diag = Math.hypot(W, H);
    const tOut = beat * 2.5, tName = tOut + 0.4;
    const N = nameText(C, W > H ? 0.14 : 0.11, 0.8);
    const SUB = subText(C);
    const bandH = textH(N.T, N.s) + minDim * 0.1;
    C.ev(0.05, 'aberr', 3, 0.3);
    C.ev(tOut, 'aberr', 5, 0.3);
    C.ev(tName, 'shake', 6, 0.25);
    return {
      dur: D,
      draw(r, t, col) {
        for (let k = 0; k < 2; k++) {
          const w = k ? B : A, f = k ? fb : fa, z = k ? zb : za, s = k ? 1 : -1;
          const ein = expoOut(prog(t, 0.04 + k * 0.1, 0.6 + k * 0.1));
          const eout = antic(prog(t, tOut - 0.1 + k * 0.05, tOut + 0.3 + k * 0.05), 0.3, 0.03);
          if (ein <= 0 || eout >= 1) continue;
          const off = s * diag * (1 - ein) - s * diag * 1.1 * eout;
          r.draw({
            x: W / 2 + ux * off, y: H / 2 + uy * off, w: W, h: H, tex: w.tex,
            uv: coverUV(w, W, H, f.x, f.y, z * (1 + 0.04 * t)),
            mask: { type: 'wipe', p: 0.5, angle: k ? nrm + Math.PI : nrm, soft: 1.5 },
          });
        }
        // 境目の線 → 水平の帯
        const eb = expoOut(prog(t, 0.3, 0.8));
        const er = snap(prog(t, tOut, tName));
        const len = lerp(diag * eb, W, er);
        const h = lerp(Math.max(3, minDim * 0.01), bandH, er);
        if (len > 0) r.draw({ x: W / 2, y: H / 2, w: len, h, rot: lerp(lineAng, 0, er), color: col.accent });
        if (t >= tName) {
          const lt = t - tName;
          const sc = N.s * (1 + 0.1 * (1 - expoOut(prog(lt, 0, 0.6))));
          drawText(r, N.T, W / 2, H / 2 - textH(N.T, sc) / 2, { align: 'center', scale: sc, reveal: expoOut(prog(lt, 0, 0.5)), color: col.bg });
          drawText(r, SUB, W / 2, H / 2 + bandH / 2 + minDim * 0.04, { align: 'center', reveal: expoOut(prog(lt, 0.2, 0.7)), color: col.ink });
        }
      },
    };
  },

  // 網点が縮んで作品が現れ、アクセント色の網点が覆い尽くすと名前
  halftone(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const shots = [0, 1].map((i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      return { w, f, z: panelZoom(w, f, W, H, rng.range(0.75, 1)) };
    });
    const per = Math.max(8, minDim * 0.045);
    const ang = Math.PI / 4;
    const tA = beat * 1.5, tName = beat * 3;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    C.ev(tA, 'flash', 0.3, 0.15);
    C.ev(tName, 'shake', 5, 0.25);
    C.ev(tName, 'aberr', 4, 0.3);
    const full = (r, o) => r.draw({ x: W / 2, y: H / 2, w: W, h: H, ...o });
    const dots = (r, ratio, color, drift) => { if (ratio > 0.01) full(r, { mode: 'dots', pat: [per, ratio, ang, drift], color }); };
    return {
      dur: D,
      draw(r, t, col) {
        if (t < tName) {
          const i = t < tA ? 0 : 1;
          const S = shots[i];
          const lt = t - i * tA;
          full(r, { tex: S.w.tex, uv: coverUV(S.w, W, H, S.f.x, S.f.y, S.z * (1 + 0.04 * lt)) });
          if (i === 0) dots(r, 1.5 * (1 - snap(prog(t, 0, tA * 0.7))), col.bg, 0);
          else dots(r, 1.5 * snap(prog(t, tA + beat * 0.5, tName)), col.accent, per * 0.5 * lt);
          return;
        }
        // 全面のアクセント色の上に名前 → 網点がほどけて背景色へ
        const lt = t - tName;
        const e = snap(prog(lt, beat * 0.6, beat * 1.4));
        dots(r, 1.5 * (1 - e), col.accent, per * 0.5 * (lt + beat * 1.5));
        nameLanding(r, C, N, SUB, lt, { ...col, ink: mix(col.bg, col.ink, e), accent: mix(col.bg, col.accent, e) });
      },
    };
  },

  // 斜めに傾いた短冊の寄りが拍に乗って右から滑り込み、上下にはけると名前
  slant(C) {
    const { works, W, H, beat, rng, minDim } = C;
    const D = beat * 6;
    const n = W > H ? 4 : 3;
    const th = 0.12; // 傾き
    const ux = Math.cos(th), uy = Math.sin(th);
    const pw = (W * ux + H * uy) / n; // 傾けた座標で画面の横幅を覆う
    const L = H / ux + W * uy + 4;
    const strips = Array.from({ length: n }, (_, i) => {
      const w = works[i % works.length];
      const f = pointsFor(w, 2, rng)[Math.floor(i / works.length) % 2];
      return { w, uv: coverUV(w, pw, L, f.x, f.y, panelZoom(w, f, pw, L, rng.range(0.8, 1.1))), t0: 0.05 + i * (beat * 1.6) / n };
    });
    const tOut = beat * 2.6, tName = tOut + 0.35;
    const N = nameText(C, W > H ? 0.15 : 0.12, 0.84);
    const SUB = subText(C);
    strips.forEach((S) => C.ev(S.t0 + 0.25, 'shake', 3, 0.12));
    C.ev(tOut, 'aberr', 5, 0.3);
    return {
      dur: D,
      draw(r, t, col) {
        if (t >= tName - 0.1) nameLanding(r, C, N, SUB, t - tName + 0.1, col);
        // 背景のアクセントの斜め帯（すき間から見える）
        const eb = expoOut(prog(t, 0, 0.4)) * (1 - snap(prog(t, tOut, tName)));
        if (eb > 0) r.draw({ x: W / 2, y: H / 2, w: W * 1.6 * eb, h: L, rot: th, color: col.accent });
        for (let i = 0; i < n; i++) {
          const S = strips[i];
          const ein = expoOut(prog(t, S.t0, S.t0 + 0.45));
          const eout = antic(prog(t, tOut - 0.1 + i * 0.04, tOut + 0.3 + i * 0.04), 0.3, 0.03);
          if (ein <= 0 || eout >= 1) continue;
          const a = (i - (n - 1) / 2) * pw + W * 1.2 * (1 - ein); // 傾けた横軸に沿った位置
          const b = (i % 2 ? 1 : -1) * L * 1.1 * eout; // はけるときは縦軸に沿って上下へ
          const e0 = expoOut(prog(t - 1 / 60, S.t0, S.t0 + 0.45));
          const vel = (e0 - ein) * W * 1.2 / pw;
          r.draw({
            x: W / 2 + ux * a - uy * b, y: H / 2 + uy * a + ux * b, w: pw + 1, h: L, rot: th,
            tex: S.w.tex, uv: S.uv, blur: Math.abs(vel) > 0.002 ? [vel, 0] : undefined,
          });
        }
      },
    };
  },

};

export const OPENER_LABELS = { montage: 'モンタージュ', type: 'タイプ', shutter: 'シャッター', countdown: 'カウント', knockout: '抜き文字', slice: 'スライス', tunnel: 'トンネル', boot: '起動ログ', blinds: 'ブラインド', iris: 'アイリス', marquee: 'マーキー', tiles: 'タイル', pullback: '段階引き', diagonal: '対角', halftone: '網点', slant: 'スラント' };
