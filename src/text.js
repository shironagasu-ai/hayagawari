// 文字列をキャンバスで白抜き描画してテクスチャ化する。色は描画時に u_color で乗算する。
// 映像生成時にまとめて作り、再生中は一切生成しない（フレーム落ち防止）。

export const FONTS = {
  sans: '"Helvetica Neue", "Inter", Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif',
  condensed: '"Bebas Neue", "Oswald", Impact, "Haettenschweiler", "Arial Narrow", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  serif: '"Didot", "Bodoni 72", "Playfair Display", Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, "Courier New", "Hiragino Kaku Gothic ProN", monospace',
};

const SUPERSAMPLE = 2;

export class TextFactory {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new Map();
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  // 返り値 { tex, w, h, asc }: w,h は仮想解像度 px
  get(str, { family = 'sans', size = 64, weight = 800, tracking = 0, stroke = 0, italic = false } = {}) {
    str = String(str);
    const key = [str, family, size, weight, tracking, stroke, italic].join('|');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = this.ctx;
    const font = `${italic ? 'italic ' : ''}${weight} ${size * SUPERSAMPLE}px ${FONTS[family] || family}`;
    g.font = font;
    const chars = Array.from(str);
    const tr = tracking * size * SUPERSAMPLE;
    const widths = chars.map((c) => g.measureText(c).width);
    const m = g.measureText(str || ' ');
    const asc = Math.ceil(m.actualBoundingBoxAscent || size * SUPERSAMPLE * 0.8);
    const desc = Math.ceil(m.actualBoundingBoxDescent || size * SUPERSAMPLE * 0.2);
    const pad = Math.ceil(size * SUPERSAMPLE * 0.12 + stroke * SUPERSAMPLE);
    let tw = widths.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
    const maxW = Math.min(this.r.maxTex, 8192);
    const cw = Math.min(maxW, Math.ceil(tw + pad * 2));
    const ch = Math.ceil(asc + desc + pad * 2);
    this.canvas.width = Math.max(2, cw);
    this.canvas.height = Math.max(2, ch);
    g.font = font; // リサイズで状態が消えるため再設定
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineJoin = 'round';
    g.lineWidth = stroke * SUPERSAMPLE;
    let x = pad;
    const y = pad + asc;
    for (let i = 0; i < chars.length; i++) {
      if (stroke > 0) g.strokeText(chars[i], x, y);
      else g.fillText(chars[i], x, y);
      x += widths[i] + tr;
    }
    const tex = this.r.createTexture(this.canvas, { mipmap: true });
    const res = {
      tex,
      w: this.canvas.width / SUPERSAMPLE,
      h: this.canvas.height / SUPERSAMPLE,
      pad: pad / SUPERSAMPLE,
      asc: asc / SUPERSAMPLE,
    };
    this.cache.set(key, res);
    return res;
  }

  dispose() {
    for (const v of this.cache.values()) this.r.deleteTexture(v.tex);
    this.cache.clear();
  }
}
