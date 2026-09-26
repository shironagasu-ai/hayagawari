// スタイル（テーマ）: 配色の傾向・書体・質感・BPM と、振付 / トランジション / 背景装飾 / 配色の出やすさ（重み）

export const THEMES = {
  NOIR: {
    label: 'NOIR', bg: 'dark', font: 'sans', weight: 800, tracking: 0.01, upper: true,
    grain: 0.05, vignette: 0.45, hud: true, bpm: [116, 128],
    variants: { focus: 3, cuts: 3, split: 2, pan: 2, card: 1, spotlight: 3, lockon: 2, mosaic: 1, triptych: 2, punch: 2, scan: 2, swing: 1, dive: 2, duotone: 1, quad: 1, slam: 2, cinema: 3, pixel: 1 },
    trans: { whip: 3, zoom: 3, iris: 1, slices: 2, glitch: 1, bars: 2, cut: 2, spin: 1, door: 1, pixelate: 1, dissolve: 2, halftone: 1, diamond: 1, tv: 2, flip: 1 },
    decor: { number: 2, marquee: 2, grid: 1, blur: 3, stripes: 1, dots: 0, rings: 1, ticker: 2, shapes: 1, scanlines: 2, halo: 2, dotfade: 1 },
    palettes: { dark: 4, tone: 1 },
  },
  SWISS: {
    label: 'SWISS', bg: 'light', font: 'sans', weight: 800, tracking: -0.01, upper: true,
    grain: 0.025, vignette: 0.0, hud: true, bpm: [118, 130],
    variants: { cuts: 3, split: 3, card: 2, focus: 2, pan: 1, mosaic: 3, triptych: 3, lockon: 2, spotlight: 1, punch: 1, scan: 1, swing: 1, dive: 1, duotone: 3, quad: 3, slam: 1, cinema: 1, pixel: 1 },
    trans: { whip: 3, bars: 3, slices: 3, cut: 2, zoom: 1, iris: 1, door: 2, spin: 1, pixelate: 1, dissolve: 1, halftone: 2, diamond: 2, tv: 1, flip: 2 },
    decor: { grid: 3, number: 3, stripes: 1, marquee: 1, dots: 1, rings: 1, ticker: 2, shapes: 3, scanlines: 1, halo: 1, dotfade: 1 },
    palettes: { light: 4, complement: 1, sumi: 1 },
  },
  POP: {
    label: 'POP', bg: 'accent', font: 'condensed', weight: 900, tracking: 0.02, upper: true,
    grain: 0.03, vignette: 0.15, hud: true, bpm: [124, 136],
    variants: { card: 3, cuts: 3, focus: 2, split: 1, pan: 1, mosaic: 3, triptych: 2, spotlight: 2, lockon: 1, punch: 2, scan: 1, swing: 3, dive: 2, duotone: 3, quad: 2, slam: 3, cinema: 1, pixel: 2 },
    trans: { iris: 3, whip: 2, bars: 3, zoom: 2, slices: 2, cut: 1, spin: 3, door: 2, pixelate: 2, dissolve: 1, halftone: 3, diamond: 3, tv: 1, flip: 2 },
    decor: { stripes: 3, dots: 3, marquee: 2, number: 1, rings: 2, ticker: 1, shapes: 3, scanlines: 1, halo: 2, dotfade: 3 },
    palettes: { accent: 4, complement: 1 },
  },
  EDITORIAL: {
    label: 'EDITORIAL', bg: 'light', font: 'serif', weight: 500, tracking: 0.0, upper: false,
    grain: 0.035, vignette: 0.1, hud: true, bpm: [108, 120],
    variants: { focus: 3, split: 3, pan: 3, card: 2, cuts: 1, triptych: 3, spotlight: 2, lockon: 1, mosaic: 1, punch: 1, scan: 1, swing: 1, dive: 1, duotone: 2, quad: 2, slam: 1, cinema: 3, pixel: 1 },
    trans: { whip: 2, slices: 2, iris: 1, zoom: 2, bars: 1, cut: 2, door: 2, pixelate: 1, dissolve: 2, halftone: 1, diamond: 1, tv: 1, flip: 2 },
    decor: { number: 3, grid: 2, blur: 1, marquee: 1, rings: 1, ticker: 2, shapes: 1, scanlines: 1, halo: 1, dotfade: 1 },
    palettes: { light: 3, muted: 2, sumi: 1 },
  },
  GLITCH: {
    label: 'GLITCH', bg: 'dark', font: 'mono', weight: 700, tracking: 0.04, upper: true,
    grain: 0.08, vignette: 0.4, hud: true, bpm: [126, 140], aberrBase: 0.6,
    variants: { cuts: 4, focus: 3, pan: 2, split: 2, card: 1, lockon: 4, mosaic: 2, spotlight: 2, triptych: 1, punch: 3, scan: 3, swing: 1, dive: 2, duotone: 1, quad: 1, slam: 2, cinema: 1, pixel: 3 },
    trans: { glitch: 4, whip: 2, slices: 3, zoom: 2, cut: 3, spin: 2, door: 1, pixelate: 3, dissolve: 3, halftone: 1, diamond: 1, tv: 3, flip: 1 },
    decor: { grid: 3, marquee: 2, number: 2, blur: 2, dots: 1, rings: 1, ticker: 3, shapes: 1, scanlines: 3, halo: 1, dotfade: 1 },
    palettes: { dark: 3, blueprint: 1, tone: 1 },
  },
  MONO: {
    label: 'MONO', bg: 'mono', font: 'sans', weight: 900, tracking: -0.02, upper: true,
    grain: 0.06, vignette: 0.3, hud: true, bpm: [120, 132], mono: true,
    variants: { focus: 3, cuts: 3, spotlight: 3, lockon: 2, pan: 2, split: 2, triptych: 1, mosaic: 1, card: 1, punch: 2, scan: 2, swing: 1, dive: 1, duotone: 2, quad: 1, slam: 3, cinema: 2, pixel: 1 },
    trans: { cut: 3, whip: 3, bars: 2, slices: 2, door: 2, zoom: 1, pixelate: 1, dissolve: 1, halftone: 2, diamond: 1, tv: 2, flip: 1 },
    decor: { number: 3, grid: 2, marquee: 2, stripes: 1, rings: 1, ticker: 2, shapes: 2, scanlines: 2, halo: 1, dotfade: 1 },
    palettes: { mono: 1 },
  },
  NEON: {
    label: 'NEON', bg: 'neon', font: 'condensed', weight: 900, tracking: 0.04, upper: true,
    grain: 0.04, vignette: 0.55, hud: true, bpm: [128, 140], aberrBase: 1.2,
    variants: { lockon: 3, focus: 3, cuts: 3, spotlight: 2, mosaic: 2, pan: 1, split: 1, triptych: 1, card: 1, punch: 3, scan: 2, swing: 1, dive: 3, duotone: 1, quad: 1, slam: 2, cinema: 1, pixel: 3 },
    trans: { zoom: 3, spin: 3, glitch: 2, whip: 2, iris: 1, slices: 1, pixelate: 2, dissolve: 1, halftone: 1, diamond: 2, tv: 2, flip: 1 },
    decor: { grid: 3, marquee: 3, dots: 1, number: 1, blur: 2, rings: 3, ticker: 1, shapes: 1, scanlines: 2, halo: 3, dotfade: 1 },
    palettes: { neon: 4, tone: 1 },
  },
  PASTEL: {
    label: 'PASTEL', bg: 'pastel', font: 'sans', weight: 700, tracking: 0.02, upper: false,
    grain: 0.02, vignette: 0.0, hud: true, bpm: [104, 116],
    variants: { card: 3, triptych: 3, mosaic: 2, spotlight: 2, focus: 2, split: 1, pan: 1, cuts: 1, lockon: 1, punch: 1, scan: 1, swing: 3, dive: 1, duotone: 2, quad: 2, slam: 1, cinema: 1, pixel: 1 },
    trans: { iris: 3, door: 2, whip: 2, slices: 2, zoom: 1, cut: 1, pixelate: 1, dissolve: 1, halftone: 2, diamond: 2, tv: 1, flip: 2 },
    decor: { dots: 3, stripes: 2, number: 2, blur: 1, rings: 2, ticker: 1, shapes: 2, scanlines: 1, halo: 2, dotfade: 2 },
    palettes: { pastel: 4, complement: 1 },
  },
  RETRO: {
    label: 'RETRO', bg: 'paper', font: 'serif', weight: 800, tracking: 0.01, upper: true,
    grain: 0.1, vignette: 0.5, hud: true, bpm: [110, 122],
    variants: { card: 3, split: 3, pan: 2, focus: 2, triptych: 2, cuts: 1, mosaic: 1, spotlight: 1, lockon: 1, punch: 1, scan: 1, swing: 2, dive: 1, duotone: 2, quad: 1, slam: 1, cinema: 2, pixel: 1 },
    trans: { slices: 3, door: 3, bars: 2, whip: 2, cut: 2, iris: 1, pixelate: 1, dissolve: 2, halftone: 2, diamond: 1, tv: 3, flip: 1 },
    decor: { number: 3, stripes: 2, grid: 1, marquee: 1, rings: 1, ticker: 1, shapes: 1, scanlines: 2, halo: 1, dotfade: 2 },
    palettes: { paper: 3, muted: 1, blueprint: 1 },
  },
  RISO: {
    label: 'RISO', bg: 'riso', font: 'condensed', weight: 900, tracking: 0.02, upper: true,
    grain: 0.07, vignette: 0.05, hud: true, bpm: [112, 124], aberrBase: 0.5, // 版ずれ
    variants: { duotone: 4, quad: 3, card: 2, mosaic: 2, triptych: 2, split: 2, cuts: 1, focus: 1, pan: 1, spotlight: 1, lockon: 1, punch: 1, scan: 1, swing: 2, dive: 1, slam: 1, cinema: 1, pixel: 1 },
    trans: { halftone: 4, slices: 2, bars: 2, flip: 2, diamond: 2, whip: 1, cut: 1, door: 1, dissolve: 1, iris: 1 },
    decor: { dotfade: 3, dots: 3, shapes: 2, stripes: 2, number: 1, rings: 1, ticker: 1 },
    palettes: { riso: 4, complement: 1 },
  },
  CINEMA: {
    label: 'CINEMA', bg: 'cinema', font: 'sans', weight: 600, tracking: 0.18, upper: true,
    grain: 0.06, vignette: 0.6, hud: true, bpm: [96, 108],
    variants: { cinema: 5, pan: 3, focus: 3, spotlight: 2, scan: 1, dive: 1, split: 1, card: 1, cuts: 1, punch: 1, lockon: 1, triptych: 1 },
    trans: { cut: 3, zoom: 2, whip: 2, iris: 2, dissolve: 2, tv: 1, slices: 1 },
    decor: { blur: 3, halo: 2, number: 1, scanlines: 1, grid: 1, rings: 1 },
    palettes: { cinema: 4, dark: 1 },
  },
  ZINE: {
    label: 'ZINE', bg: 'zine', font: 'serif', weight: 900, tracking: 0.0, upper: true,
    grain: 0.12, vignette: 0.2, hud: true, bpm: [118, 130],
    variants: { card: 3, swing: 3, slam: 3, quad: 2, mosaic: 2, cuts: 2, triptych: 2, pixel: 1, duotone: 1, focus: 1, split: 1, punch: 1 },
    trans: { flip: 3, slices: 3, cut: 3, bars: 2, door: 2, pixelate: 1, halftone: 1, whip: 1 },
    decor: { shapes: 2, stripes: 2, number: 2, ticker: 2, dots: 1, grid: 1, dotfade: 1 },
    palettes: { zine: 4, sumi: 1, muted: 1 },
  },
};

// MIX: 作品ごとにスタイルを抽選する（オープニング/エンディング/HUD/BPM はベースのスタイル）
export const STYLE_KEYS = () => Object.keys(THEMES);

export const PACE = {
  tight: { beats: 6, bpm: 6 },
  normal: { beats: 8, bpm: 0 },
  relaxed: { beats: 10, bpm: -10 },
};
