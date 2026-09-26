// 配色の傾向（パレット）。作品の支配色・アクセント色から、背景・文字・アクセントを決める。
// 各パレットは (色相など) => { bg, ink, accent } を返す。スタイル（themes.js）の bg で選ばれる

import { rgbToHsl } from '../analyze.js';
import { lum, mix, hsl } from '../kit.js';

// c: { dh, ds, ah, R }（dh/ds: 支配色の色相・彩度、ah: アクセントの色相、R: 解析した色の役割）
export const PALETTES = {
  dark: ({ dh, ds }) => ({ bg: hsl(dh, Math.min(ds, 0.35), 0.075), ink: [0.95, 0.95, 0.94] }),
  light: ({ dh, ds, ah }) => ({ bg: hsl(dh, Math.min(ds, 0.3) * 0.5, 0.925), ink: hsl(ah, 0.25, 0.09) }),
  // MONO: 無彩色の背景と文字。アクセントだけ固定の赤
  mono: () => ({ bg: [0.055, 0.055, 0.06], ink: [0.96, 0.96, 0.96], accent: [0.94, 0.2, 0.18], fixedAccent: true }),
  // NEON: ほぼ黒の背景に、作品の色相を最大彩度で光らせる
  neon: ({ ah }) => ({ bg: hsl(ah, 0.5, 0.035), ink: hsl(ah, 0.35, 0.95), accent: hsl(ah, 1, 0.6) }),
  // PASTEL: 作品の色相を淡くした背景、アクセントは同系色の中明度
  pastel: ({ ah }) => ({ bg: hsl(ah, 0.55, 0.89), ink: hsl(ah, 0.3, 0.18), accent: hsl(ah, 0.6, 0.62) }),
  // RETRO: 生成り紙の背景、墨色の文字、くすんだアクセント
  paper: ({ ah }) => ({ bg: [0.93, 0.9, 0.82], ink: [0.16, 0.13, 0.11], accent: hsl(ah, 0.45, 0.42) }),
  // POP: 作品の色相の鮮やかな背景、アクセントは補色寄り
  accent: ({ ah }) => {
    const bg = hsl(ah, 0.72, 0.52);
    return {
      bg,
      ink: lum(bg) > 0.5 ? hsl(ah, 0.4, 0.08) : [0.98, 0.97, 0.95],
      accent: hsl((ah + 0.5) % 1, 0.8, lum(bg) > 0.5 ? 0.35 : 0.6),
      decoMix: 0.22, // 装飾色は背景と文字の中間（アクセントを装飾に使うと強すぎる）
    };
  },
  // 同系色: 作品の色相で背景を深く染め、文字も同じ色相の明るい色に
  tone: ({ dh, ah }) => ({ bg: hsl(dh, 0.45, 0.14), ink: hsl(dh, 0.25, 0.93), accent: hsl(ah, 0.85, 0.62) }),
  // 補色: 作品の支配色の反対の色相を淡い背景に、アクセントは支配色そのもの
  complement: ({ dh }) => ({ bg: hsl((dh + 0.5) % 1, 0.32, 0.9), ink: hsl(dh, 0.35, 0.12), accent: hsl(dh, 0.75, 0.45) }),
  // くすみ: 彩度を落とした中間の明るさ
  muted: ({ dh, ah }) => ({ bg: hsl(dh, 0.12, 0.74), ink: hsl(dh, 0.2, 0.1), accent: hsl(ah, 0.35, 0.34) }),
  // 青焼き: 図面のような深い青に白い線（作品の色に関係なく固定）
  blueprint: () => ({ bg: [0.06, 0.19, 0.42], ink: [0.9, 0.95, 1], accent: [0.55, 0.86, 1], fixedAccent: true }),
  // 墨と朱: 和紙の地に墨の文字、朱のアクセント（固定）
  sumi: () => ({ bg: [0.95, 0.93, 0.88], ink: [0.08, 0.08, 0.08], accent: [0.84, 0.2, 0.12], fixedAccent: true }),
  // RISO: 印刷用紙に青インク、蛍光ピンクの 2 色刷り（固定）
  riso: () => ({ bg: [0.96, 0.94, 0.9], ink: [0.1, 0.24, 0.62], accent: [1, 0.33, 0.58], fixedAccent: true }),
  // CINEMA: 深い青緑の闇に、温かい白の文字と橙のアクセント（ティール＆オレンジ）
  cinema: () => ({ bg: [0.03, 0.09, 0.1], ink: [0.96, 0.92, 0.84], accent: [0.98, 0.6, 0.26], fixedAccent: true }),
  // ZINE: コピー用紙の灰白に黒、作品の色を 1 色だけ特色で
  zine: ({ ah }) => ({ bg: [0.89, 0.89, 0.86], ink: [0.05, 0.05, 0.05], accent: hsl(ah, 0.9, 0.48) }),
};

export const PALETTE_KEYS = () => Object.keys(PALETTES);

// 作品ごとの配色。palette を渡すとスタイルの既定（theme.bg）より優先する（カタログ・テスト用）
export function colorsFor(work, theme, palette) {
  const R = work.roles;
  const [dh, ds] = rgbToHsl(R.dominant.map((v) => v * 255));
  const [ah] = rgbToHsl(R.accent.map((v) => v * 255));
  const key = PALETTES[palette] ? palette : PALETTES[theme.bg] ? theme.bg : 'accent';
  const P = PALETTES[key]({ dh, ds, ah, R });
  const bg = P.bg, ink = P.ink;
  let accent = P.accent || R.accent.slice();
  // アクセントが背景に沈む場合は明度をずらす（固定色のアクセントは対象外）
  if (!P.fixedAccent && Math.abs(lum(accent) - lum(bg)) < 0.22) {
    const [h, s, l] = rgbToHsl(accent.map((v) => v * 255));
    accent = hsl(h, s, lum(bg) > 0.5 ? Math.max(0.2, l - 0.3) : Math.min(0.8, l + 0.3));
  }
  return { bg, ink, accent, deco: P.decoMix ? mix(bg, ink, P.decoMix) : accent };
}
