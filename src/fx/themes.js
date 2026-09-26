// スタイル（テーマ）: 配色の傾向・書体・質感・BPM と、振付 / トランジション / 背景装飾の出やすさ（重み）

export const THEMES = {
  NOIR: {
    label: 'NOIR', bg: 'dark', font: 'sans', weight: 800, tracking: 0.01, upper: true,
    grain: 0.05, vignette: 0.45, hud: true, bpm: [116, 128],
    variants: { focus: 3, cuts: 3, split: 2, pan: 2, card: 1, spotlight: 3, lockon: 2, mosaic: 1, triptych: 2 },
    trans: { whip: 3, zoom: 3, iris: 1, slices: 2, glitch: 1, bars: 2, cut: 2, spin: 1, door: 1 },
    decor: { number: 2, marquee: 2, grid: 1, blur: 3, stripes: 1, dots: 0 },
  },
  SWISS: {
    label: 'SWISS', bg: 'light', font: 'sans', weight: 800, tracking: -0.01, upper: true,
    grain: 0.025, vignette: 0.0, hud: true, bpm: [118, 130],
    variants: { cuts: 3, split: 3, card: 2, focus: 2, pan: 1, mosaic: 3, triptych: 3, lockon: 2, spotlight: 1 },
    trans: { whip: 3, bars: 3, slices: 3, cut: 2, zoom: 1, iris: 1, door: 2, spin: 1 },
    decor: { grid: 3, number: 3, stripes: 1, marquee: 1, dots: 1 },
  },
  POP: {
    label: 'POP', bg: 'accent', font: 'condensed', weight: 900, tracking: 0.02, upper: true,
    grain: 0.03, vignette: 0.15, hud: true, bpm: [124, 136],
    variants: { card: 3, cuts: 3, focus: 2, split: 1, pan: 1, mosaic: 3, triptych: 2, spotlight: 2, lockon: 1 },
    trans: { iris: 3, whip: 2, bars: 3, zoom: 2, slices: 2, cut: 1, spin: 3, door: 2 },
    decor: { stripes: 3, dots: 3, marquee: 2, number: 1 },
  },
  EDITORIAL: {
    label: 'EDITORIAL', bg: 'light', font: 'serif', weight: 500, tracking: 0.0, upper: false,
    grain: 0.035, vignette: 0.1, hud: true, bpm: [108, 120],
    variants: { focus: 3, split: 3, pan: 3, card: 2, cuts: 1, triptych: 3, spotlight: 2, lockon: 1, mosaic: 1 },
    trans: { whip: 2, slices: 2, iris: 1, zoom: 2, bars: 1, cut: 2, door: 2 },
    decor: { number: 3, grid: 2, blur: 1, marquee: 1 },
  },
  GLITCH: {
    label: 'GLITCH', bg: 'dark', font: 'mono', weight: 700, tracking: 0.04, upper: true,
    grain: 0.08, vignette: 0.4, hud: true, bpm: [126, 140], aberrBase: 0.6,
    variants: { cuts: 4, focus: 3, pan: 2, split: 2, card: 1, lockon: 4, mosaic: 2, spotlight: 2, triptych: 1 },
    trans: { glitch: 4, whip: 2, slices: 3, zoom: 2, cut: 3, spin: 2, door: 1 },
    decor: { grid: 3, marquee: 2, number: 2, blur: 2, dots: 1 },
  },
  MONO: {
    label: 'MONO', bg: 'mono', font: 'sans', weight: 900, tracking: -0.02, upper: true,
    grain: 0.06, vignette: 0.3, hud: true, bpm: [120, 132], mono: true,
    variants: { focus: 3, cuts: 3, spotlight: 3, lockon: 2, pan: 2, split: 2, triptych: 1, mosaic: 1, card: 1 },
    trans: { cut: 3, whip: 3, bars: 2, slices: 2, door: 2, zoom: 1 },
    decor: { number: 3, grid: 2, marquee: 2, stripes: 1 },
  },
  NEON: {
    label: 'NEON', bg: 'neon', font: 'condensed', weight: 900, tracking: 0.04, upper: true,
    grain: 0.04, vignette: 0.55, hud: true, bpm: [128, 140], aberrBase: 1.2,
    variants: { lockon: 3, focus: 3, cuts: 3, spotlight: 2, mosaic: 2, pan: 1, split: 1, triptych: 1, card: 1 },
    trans: { zoom: 3, spin: 3, glitch: 2, whip: 2, iris: 1, slices: 1 },
    decor: { grid: 3, marquee: 3, dots: 1, number: 1, blur: 2 },
  },
  PASTEL: {
    label: 'PASTEL', bg: 'pastel', font: 'sans', weight: 700, tracking: 0.02, upper: false,
    grain: 0.02, vignette: 0.0, hud: true, bpm: [104, 116],
    variants: { card: 3, triptych: 3, mosaic: 2, spotlight: 2, focus: 2, split: 1, pan: 1, cuts: 1, lockon: 1 },
    trans: { iris: 3, door: 2, whip: 2, slices: 2, zoom: 1, cut: 1 },
    decor: { dots: 3, stripes: 2, number: 2, blur: 1 },
  },
  RETRO: {
    label: 'RETRO', bg: 'paper', font: 'serif', weight: 800, tracking: 0.01, upper: true,
    grain: 0.1, vignette: 0.5, hud: true, bpm: [110, 122],
    variants: { card: 3, split: 3, pan: 2, focus: 2, triptych: 2, cuts: 1, mosaic: 1, spotlight: 1, lockon: 1 },
    trans: { slices: 3, door: 3, bars: 2, whip: 2, cut: 2, iris: 1 },
    decor: { number: 3, stripes: 2, grid: 1, marquee: 1 },
  },
};

// MIX: 作品ごとにスタイルを抽選する（オープニング/エンディング/HUD/BPM はベースのスタイル）
export const STYLE_KEYS = () => Object.keys(THEMES);

export const PACE = {
  tight: { beats: 6, bpm: 6 },
  normal: { beats: 8, bpm: 0 },
  relaxed: { beats: 10, bpm: -10 },
};
