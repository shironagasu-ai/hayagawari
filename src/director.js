// ディレクター: シードから「映像の設計図」を生成し、時刻 t の絵を描く純関数 render(r, t) を返す。
//
// - ランダムな決定はすべてビルド時に行い、描画時は時刻だけで決まる（スクラブ・書き出しが決定的）
// - 時間はテンポ（BPM）の拍で刻む。カットは拍頭に置き、動きは「タメ→ツメ→ピタッ」で設計
// - 作品ごとに「振付（variant）」「背景装飾（decor）」「入り/出のトランジション」を抽選
// - 画像解析の注目点（focal）を寄り・カット割り・パン・コールアウトの着地点に使う

import { createRng } from './rng.js';
import {
  pad2, TAU, lum, withA, pointsFor, camLerp, clampFull, closeHq, drawCam, coverUV, panelZoom,
  drawText, textH, textW, layoutFor, makeTextBlock,
} from './kit.js';
import {
  clamp, lerp, prog, quadOut, expoIn, expoOut, expoInOut,
  backOut, snap, snapSoft, antic,
} from './ease.js';
import { THEMES, STYLE_KEYS, PACE } from './fx/themes.js';
import { DECORS } from './fx/decors.js';
import { colorsFor } from './fx/palettes.js';
import { VARIANTS, VARIANT_KEYS } from './fx/variants.js';
import { EXIT_DUR, ENTRY_DUR, transitionHint, drawBars, TRANSITION_KEYS, GAP_TRANSITIONS } from './fx/transitions.js';
import { OPENERS } from './fx/openers.js';
import { CLOSERS } from './fx/closers.js';
import { AVOID_DECOR } from './fx/rules.js';

export { THEMES, STYLE_KEYS, VARIANT_KEYS };

// ---------------------------------------------------------------- 本体

export function buildFilm(opts) {
  const { works, seed, W, H, tf, pace = 'normal', artist = '', subline = '', handle = '' } = opts;
  const rng = createRng(`${seed}|${works.length}|${W}x${H}|${pace}`);
  const mixMode = opts.theme === 'MIX';
  const baseName = !mixMode && opts.theme && THEMES[opts.theme] ? opts.theme : rng.pick(Object.keys(THEMES));
  const themeName = mixMode ? 'MIX' : baseName;
  const theme = THEMES[baseName]; // オープニング/エンディング/HUD/BPM のスタイル
  // 作品ごとのスタイル。MIX では1枚ずつ抽選（直前と同じものは避ける）
  const workThemeNames = [];
  for (let i = 0; i < works.length; i++) {
    if (!mixMode) { workThemeNames.push(baseName); continue; }
    const keys = Object.keys(THEMES).filter((k) => k !== workThemeNames[i - 1]);
    workThemeNames.push(rng.pick(keys));
  }
  const workThemes = workThemeNames.map((k) => THEMES[k]);
  const P = PACE[pace] || PACE.normal;
  const bpm = Math.round(rng.range(theme.bpm[0], theme.bpm[1]) + P.bpm);
  const beat = 60 / bpm;
  const minDim = Math.min(W, H);
  const events = [];
  const segments = [];

  // opts.palette / opts.transition / opts.decor はカタログ・テスト用（抽選は通常どおり行い、結果だけ差し替える）
  // 配色はスタイルの重み（palettes）で選ぶ。同じスタイルの作品は同じ配色の傾向にそろえる
  const palPick = {};
  const paletteFor = (name) => (palPick[name] ??= rng.weighted(THEMES[name].palettes || { [THEMES[name].bg]: 1 }));
  const workColors = works.map((w, i) => colorsFor(w, workThemes[i], opts.palette || paletteFor(workThemeNames[i])));
  const globalCol = workColors[0] || colorsFor({ roles: { dominant: [0.1, 0.1, 0.1], accent: [1, 0.3, 0.3] } }, theme, opts.palette || paletteFor(baseName));

  // ---- トランジション列（境界ごと）
  const nBound = works.length + 1;
  const transitions = [];
  let prevType = null;
  for (let i = 0; i < nBound; i++) {
    // 境界 i は「直前のセグメント」のスタイルの重みで抽選（0 はオープニング＝ベース）
    const trTheme = i === 0 ? theme : workThemes[i - 1];
    let type = rng.weighted(trTheme.trans, prevType ? [prevType] : []);
    if (i === nBound - 1 && type === 'glitch') type = 'bars';
    if (TRANSITION_KEYS.includes(opts.transition)) type = opts.transition;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = rng.chance(0.7) ? dirs[rng.int(0, 1)] : dirs[rng.int(2, 3)];
    transitions.push({
      type, dx: d[0], dy: d[1],
      axis: rng.int(0, 1), count: rng.int(5, 9),
      spin: rng.sign(), bars: rng.int(1, 4), barAngle: rng.pick([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI * 3 / 4]),
    });
    prevType = type;
  }

  let cursor = 0;
  const addEvent = (t, kind, amt, dur, color) => events.push({ t, kind, amt, dur, color });

  // ---- オープニング
  const C = {
    works, W, H, beat, rng: rng.fork('bookends'), tf, theme, minDim, artist, subline, handle, ev: null,
  };
  const openerKey = OPENERS[opts.opener] ? opts.opener : rng.pick(Object.keys(OPENERS));
  const closerKey = CLOSERS[opts.closer] ? opts.closer : rng.pick(Object.keys(CLOSERS));
  {
    const start = cursor;
    const O = OPENERS[openerKey]({ ...C, ev: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color) });
    segments.push({ kind: 'opener', variant: openerKey, theme: baseName, start, dur: O.dur, col: globalCol, outT: transitions[0], draw: O.draw });
    cursor += O.dur;
  }

  // ---- 作品
  const varKeys = [];
  const decorKeys = [];
  works.forEach((work, idx) => {
    const D = beat * P.beats;
    const start = cursor;
    const srng = rng.fork('work' + idx);
    // opts.variant はテスト・デバッグ用（全作品を指定の振付に固定）
    const wtheme = workThemes[idx];
    const vkey = VARIANTS[opts.variant] ? (srng.next(), opts.variant) : srng.weighted(wtheme.variants, varKeys.slice(-1));
    varKeys.push(vkey);
    const side = srng.pick(['left', 'right']);
    const layout = layoutFor(work, W, H, idx % 2 ? (side === 'left' ? 'right' : 'left') : side);
    const S = {
      work, idx, total: works.length, artist, W, H, beat, D, rng: srng, tf, theme: wtheme, minDim, layout,
      points: pointsFor(work, 3, srng),
      event: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color),
    };
    const avoid = AVOID_DECOR[vkey] || []; // 見せ方と合わない飾りは選ばない
    const dkeys = [srng.weighted(wtheme.decor, [...decorKeys.slice(-1), ...avoid])];
    if (srng.chance(0.35)) dkeys.push(srng.weighted(wtheme.decor, [...dkeys, ...avoid]));
    decorKeys.push(dkeys[0]);
    if (DECORS[opts.decor]) dkeys.splice(0, dkeys.length, opts.decor);
    const decors = dkeys.map((k) => DECORS[k](S));
    const body = VARIANTS[vkey](S);
    segments.push({
      kind: 'work', idx, variant: vkey, decor: dkeys, theme: workThemeNames[idx], start, dur: D, col: workColors[idx], work, layout,
      inT: transitions[idx], outT: transitions[idx + 1],
      draw(r, t, col, hint) {
        for (const d of decors) d(r, t, D, col);
        body(r, t, col, hint);
      },
    });
    cursor += D;
  });

  // ---- エンディング
  {
    const start = cursor;
    const E = CLOSERS[closerKey]({ ...C, ev: (t, kind, amt, dur, color) => addEvent(start + t, kind, amt, dur, color) });
    segments.push({ kind: 'closer', variant: closerKey, theme: baseName, start, dur: E.dur, col: globalCol, inT: transitions[nBound - 1], outT: { type: 'cut' }, draw: E.draw });
    cursor += E.dur;
  }

  const duration = cursor;

  // ---- 境界ごとのトランジション固有パラメータ（注目点・演出用の色・イベント）
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i], b = segments[i + 1];
    const tr = a.outT;
    const fa = a.work ? a.work.focal[0] : { x: 0.5, y: 0.5 };
    const fb = b.work ? b.work.focal[0] : { x: 0.5, y: 0.5 };
    // 注目点の画面位置（引き終わりのレイアウト基準。split 等では近似）
    const scr = (seg, f) => {
      if (!seg.work) return [0.5, 0.5];
      const L = seg.layout;
      return [(L.img.x + (f.x - 0.5) * L.img.w) / W, 1 - (L.img.y + (f.y - 0.5) * L.img.h) / H];
    };
    const [ox, oy] = scr(a, fa);
    tr.ox = ox; tr.oy = oy;
    // 入りはセグメント冒頭（多くは寄り＝画面中央が注目点）
    tr.ix = 0.5; tr.iy = 0.5;
    tr.color = b.col.accent;
    const T = b.start;
    if (tr.type === 'whip') addEvent(T, 'aberr', 5, 0.3);
    if (tr.type === 'zoom') addEvent(T, 'flash', 0.45, 0.2);
    if (tr.type === 'cut') { addEvent(T, 'flash', 0.5, 0.16); addEvent(T, 'aberr', 4, 0.25); }
    if (tr.type === 'glitch') addEvent(T - 0.2, 'aberr', 10, 0.5);
    if (tr.type === 'slices') addEvent(T, 'aberr', 3, 0.3);
    if (tr.type === 'bars') addEvent(T, 'shake', 3, 0.15);
    if (tr.type === 'spin') addEvent(T, 'aberr', 6, 0.3);
    if (tr.type === 'door') addEvent(T, 'shake', 3, 0.15);
    if (tr.type === 'pixelate') addEvent(T, 'aberr', 3, 0.25);
    if (tr.type === 'dissolve') addEvent(T, 'aberr', 2, 0.3);
    if (tr.type === 'halftone') addEvent(T, 'flash', 0.2, 0.14);
    if (tr.type === 'diamond') addEvent(T, 'shake', 2, 0.12);
    if (tr.type === 'tv') addEvent(T - 0.12, 'flash', 0.35, 0.16);
    if (tr.type === 'flip') addEvent(T, 'shake', 2.5, 0.12);
  }
  // ループ時の頭（クロージング→オープニング）
  addEvent(0, 'flash', 0.8, 0.3);

  // ---- 描画
  const fx = { aberr: 0, grain: theme.grain, vignette: theme.vignette, flash: [1, 1, 1, 0], shakeX: 0, shakeY: 0 };
  const hint = {};
  const HUD = makeHud({ tf, theme, W, H, minDim, works, artist, subline });

  function segmentAt(t) {
    for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].start) return i;
    return 0;
  }

  function evalFx(t, seg) {
    // グレイン等の質感は、いま映っているセグメントのスタイルに従う（MIX で作品ごとに変わる）
    const th = THEMES[seg.theme] || theme;
    fx.grain = th.grain; fx.vignette = th.vignette;
    fx.aberr = th.aberrBase || 0;
    fx.flash[3] = 0;
    fx.shakeX = 0; fx.shakeY = 0;
    for (const ev of events) {
      const lt = t - ev.t;
      if (lt < 0 || lt > ev.dur) continue;
      const k = 1 - lt / ev.dur;
      const k2 = k * k;
      if (ev.kind === 'flash') {
        if (ev.amt * k2 > fx.flash[3]) {
          fx.flash[3] = ev.amt * k2;
          const c = ev.color || [1, 1, 1];
          fx.flash[0] = c[0]; fx.flash[1] = c[1]; fx.flash[2] = c[2];
        }
      } else if (ev.kind === 'aberr') fx.aberr += ev.amt * k2;
      else if (ev.kind === 'shake') {
        const a = ev.amt * k2 / H;
        fx.shakeX += Math.sin(t * 91.7 + ev.t * 13) * a;
        fx.shakeY += Math.cos(t * 77.3 + ev.t * 7) * a;
      }
    }
    return fx;
  }

  function render(r, t) {
    t = clamp(t, 0, duration - 1e-4);
    r.beginFrame();
    const i = segmentAt(t);
    const seg = segments[i];
    const lt = t - seg.start;
    const col = seg.col;
    for (const k in hint) delete hint[k];

    r.target(0, [0, 0, 0, 0]);
    r.draw({ x: W / 2, y: H / 2, w: W, h: H, color: col.bg, cam: false });
    seg.draw(r, lt, col, hint);

    // トランジション合成
    const dt = 1 / 60;
    let comp = {};
    const outStart = seg.dur - EXIT_DUR;
    if (seg.outT && seg.outT.type !== 'bars' && lt >= outStart) {
      comp = transitionHint(seg.outT, 'out', prog(lt, outStart, seg.dur), dt / EXIT_DUR, W, H);
    } else if (seg.inT && seg.inT.type !== 'bars' && lt < ENTRY_DUR && i > 0) {
      comp = transitionHint(seg.inT, 'in', prog(lt, 0, ENTRY_DUR), dt / ENTRY_DUR, W, H);
    }
    if (hint.radial) {
      comp.radial = Math.max(comp.radial || 0, hint.radial);
      if (comp.cx === undefined) { comp.cx = hint.cx; comp.cy = hint.cy; }
    }
    comp.time = t;
    r.target(2, [0, 0, 0, 0]);
    r.composite(0, comp);

    // オーバーレイ: バー型トランジション
    r.toMain();
    let bgCol = col.bg;
    for (let b = 0; b < segments.length - 1; b++) {
      const tr = segments[b].outT;
      if (tr.type !== 'bars') continue;
      const T = segments[b + 1].start;
      if (t < T - 0.4 || t > T + 0.6) continue;
      drawBars(r, tr, t - T, W, H, segments[b].col, segments[b + 1].col);
    }
    const showsGap = (tr) => tr && GAP_TRANSITIONS.includes(tr.type);
    if (showsGap(seg.inT) && lt < ENTRY_DUR && i > 0) bgCol = seg.inT.color;
    if (showsGap(seg.outT) && lt >= outStart) bgCol = seg.outT.color;

    if (theme.hud) HUD(r, t, seg, i, lt, col);
    r.present(evalFx(t, seg), bgCol, t);
  }

  function dispose() { /* テキストは TextFactory 側で一括破棄 */ }

  return {
    duration, bpm, beat, theme: themeName, baseTheme: baseName, workThemes: workThemeNames, opener: openerKey, closer: closerKey, segments, events, render, dispose,
    summary: segments.map((s) => ({ kind: s.kind, theme: s.theme, start: s.start, dur: s.dur, variant: s.variant, decor: s.decor, out: s.outT && s.outT.type })),
  };
}

// 常駐 HUD: 作家名・通し番号・進行ティック
function makeHud({ tf, theme, W, H, minDim, works, artist, subline }) {
  const m = minDim * 0.045;
  const fs = Math.round(minDim * 0.016);
  const A = tf.get(artist || 'PORTFOLIO', { family: 'mono', size: fs, weight: 700, tracking: 0.25 });
  // 右上: サブタイトル（未入力なら出さない）
  const R = subline ? tf.get(subline, { family: 'mono', size: fs, weight: 500, tracking: 0.25 }) : null;
  const nums = works.map((_, i) => tf.get(pad2(i + 1), { family: 'mono', size: Math.round(minDim * 0.03), weight: 700, tracking: 0.05 }));
  const TOT = tf.get(`/ ${pad2(works.length)}`, { family: 'mono', size: fs, weight: 500, tracking: 0.2 });
  const n = works.length;
  const tickW = Math.min(minDim * 0.03, (W * 0.3) / n), tickG = tickW * 0.35, tickH = Math.max(3, minDim * 0.004);
  return (r, t, seg, i, lt, col) => {
    if (seg.kind !== 'work') return;
    const vis = seg.idx === 0 ? expoOut(prog(lt, 0.1, 0.6)) : seg.idx === n - 1 ? 1 - expoIn(prog(lt, seg.dur - 0.3, seg.dur)) : 1;
    if (vis <= 0) return;
    const ink = withA(col.ink, 0.85 * vis);
    drawText(r, A, m, m, { color: ink, reveal: vis });
    drawText(r, R, W - m, m, { align: 'right', color: ink, reveal: vis });
    // 番号: 切り替わりで下からせり上がる
    const N = nums[seg.idx];
    const eN = expoOut(prog(lt, 0.05, 0.5));
    const yb = H - m - textH(N);
    drawText(r, N, m, yb, { reveal: eN * vis, color: withA(col.ink, vis) });
    drawText(r, TOT, m + textW(N) + minDim * 0.012, yb + textH(N) - textH(TOT), { color: ink, reveal: vis });
    // 進行ティック
    const total = n * tickW + (n - 1) * tickG;
    let x = W - m - total + tickW / 2;
    const y = H - m - tickH / 2;
    for (let k = 0; k < n; k++) {
      r.draw({ x, y, w: tickW, h: tickH, color: withA(col.ink, 0.25 * vis) });
      let fill = k < seg.idx ? 1 : k === seg.idx ? lt / seg.dur : 0;
      if (fill > 0) r.draw({ x: x - tickW / 2 + (tickW * fill) / 2, y, w: tickW * fill, h: tickH, color: withA(k === seg.idx ? col.accent : col.ink, vis) });
      x += tickW + tickG;
    }
  };
}
