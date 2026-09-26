// オープニングのパターン。
// 各パターンは C（共通コンテキスト）を受け取り { dur, draw(r, t, col) } を返す。
// C: { works, W, H, beat, rng, tf, theme, minDim, artist, subline, handle, year, up, ev(t, kind, amt, dur, color) }

import { clamp, lerp, prog, expoOut, backOut, snap, antic } from '../ease.js';
import {
  pad2, withA, pointsFor, clampFull, closeHq, drawCam, coverUV, panelZoom,
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

export const OPENER_LABELS = { montage: 'モンタージュ', type: 'タイプ', shutter: 'シャッター', countdown: 'カウント', knockout: '抜き文字', slice: 'スライス', tunnel: 'トンネル', boot: '起動ログ' };
