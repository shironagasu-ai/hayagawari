// 画像解析: 目を引く箇所（顕著性マップのピーク）と配色パレットを抽出する。
// すべてブラウザ内で完結し、画像はどこにも送信しない。
//
// 顕著性はイラスト向けのヒューリスティック合成:
//   1) 周波数同調型顕著性（Achanta 2009）: 平滑化 Lab と画像平均 Lab の距離 → 色が際立つ場所
//   2) ディテール密度: 輝度勾配をぼかしたもの → 描き込みが集中する場所（目・手・装飾）
//   3) 彩度
//   4) やや上寄りの中心バイアス（キャラクターの顔は上半分に来やすい）
// 顔検出などの ML は使っていないため、外れた場合はUIで注目点を手動指定できる。

const SAL_SIZE = 160; // 解析用の長辺ピクセル数

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// 分離可能なボックスブラーを3回 = ガウシアン近似
function blur(src, w, h, r) {
  if (r < 1) return src;
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

function normalize(arr) {
  let lo = Infinity, hi = -Infinity;
  for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const d = hi - lo || 1;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - lo) / d;
  return arr;
}

// 近傍抑制付きのピーク探索。返す座標は 0..1 正規化
function findPeaks(sal, w, h, maxCount) {
  const s = Float32Array.from(sal);
  const peaks = [];
  const suppress = Math.round(Math.min(w, h) * 0.22);
  let first = 0;
  for (let n = 0; n < maxCount; n++) {
    let best = -1, bi = 0;
    for (let i = 0; i < s.length; i++) if (s[i] > best) { best = s[i]; bi = i; }
    if (n === 0) first = best;
    if (best <= 0 || best < first * 0.35) break;
    const px = bi % w, py = (bi / w) | 0;
    // 領域の広がり（ピーク値の 72% 以上が続く範囲）から寄りのサイズを推定
    let extent = 0;
    for (let r = 1; r < Math.min(w, h) / 2; r++) {
      let cnt = 0, above = 0;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const x = Math.round(px + Math.cos(ang) * r), y = Math.round(py + Math.sin(ang) * r);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        cnt++;
        if (sal[y * w + x] > best * 0.72) above++;
      }
      if (cnt === 0 || above / cnt < 0.5) { extent = r; break; }
      extent = r;
    }
    peaks.push({
      x: (px + 0.5) / w,
      y: (py + 0.5) / h,
      strength: best,
      // 寄りの窓サイズ（画像の短辺に対する比率）
      size: Math.min(0.5, Math.max(0.12, (extent * 2.2) / Math.min(w, h))),
    });
    for (let y = Math.max(0, py - suppress); y < Math.min(h, py + suppress); y++) {
      for (let x = Math.max(0, px - suppress); x < Math.min(w, px + suppress); x++) {
        const d = Math.hypot(x - px, y - py) / suppress;
        if (d < 1) s[y * w + x] *= d * d;
      }
    }
  }
  return peaks;
}

// k-means で代表色を抽出（決定的な初期値）
function extractPalette(rgba, count, k = 6) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 128) continue;
    pts.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  }
  if (!pts.length) return [{ rgb: [128, 128, 128], weight: 1 }];
  const step = Math.max(1, Math.floor(pts.length / k));
  let cents = Array.from({ length: k }, (_, i) => pts[Math.min(pts.length - 1, i * step)].slice());
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < 10; iter++) {
    for (let p = 0; p < pts.length; p++) {
      let bd = Infinity, bi = 0;
      for (let c = 0; c < k; c++) {
        const dr = pts[p][0] - cents[c][0], dg = pts[p][1] - cents[c][1], db = pts[p][2] - cents[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; bi = c; }
      }
      assign[p] = bi;
    }
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < pts.length; p++) {
      const s = sum[assign[p]];
      s[0] += pts[p][0]; s[1] += pts[p][1]; s[2] += pts[p][2]; s[3]++;
    }
    cents = sum.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[i]));
  }
  const counts = new Array(k).fill(0);
  for (let p = 0; p < pts.length; p++) counts[assign[p]]++;
  return cents
    .map((rgb, i) => ({ rgb: rgb.map(Math.round), weight: counts[i] / pts.length }))
    .filter((c) => c.weight > 0.01)
    .sort((a, b) => b.weight - a.weight);
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

// パレットから役割付きの色を決める
function paletteRoles(palette) {
  const withHsl = palette.map((c) => ({ ...c, hsl: rgbToHsl(c.rgb) }));
  // アクセント: 彩度が高く、極端に暗く/明るくない色。面積も少し考慮
  let accent = withHsl[0];
  let best = -1;
  for (const c of withHsl) {
    const [, s, l] = c.hsl;
    const score = s * (1 - Math.abs(l - 0.55) * 1.4) + Math.sqrt(c.weight) * 0.25;
    if (score > best) { best = score; accent = c; }
  }
  const byL = withHsl.slice().sort((a, b) => a.hsl[2] - b.hsl[2]);
  // アクセントが地味すぎるときは彩度・明度を持ち上げる
  let [h, s, l] = accent.hsl;
  s = Math.max(s, 0.55);
  l = Math.min(0.62, Math.max(0.48, l));
  return {
    accent: hslToRgb([h, s, l]).map((v) => v / 255),
    dark: byL[0].rgb.map((v) => v / 255),
    light: byL[byL.length - 1].rgb.map((v) => v / 255),
    dominant: withHsl[0].rgb.map((v) => v / 255),
    hue: h,
  };
}

// File / Blob / HTMLCanvasElement → 解析済み作品データ
export async function analyzeImage(source, name) {
  const bmp = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const iw = bmp.width, ih = bmp.height;
  const scale = SAL_SIZE / Math.max(iw, ih);
  const w = Math.max(8, Math.round(iw * scale)), h = Math.max(8, Math.round(ih * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  const rgba = g.getImageData(0, 0, w, h).data;
  const n = w * h;

  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), alpha = new Float32Array(n);
  let mL = 0, mA = 0, mB = 0, wsum = 0;
  for (let i = 0; i < n; i++) {
    const [l, a, b] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const al = rgba[i * 4 + 3] / 255;
    L[i] = l; A[i] = a; B[i] = b; alpha[i] = al;
    mL += l * al; mA += a * al; mB += b * al; wsum += al;
  }
  mL /= wsum || 1; mA /= wsum || 1; mB /= wsum || 1;

  const r1 = Math.max(1, Math.round(Math.min(w, h) / 80));
  const Lb = blur(L, w, h, r1), Ab = blur(A, w, h, r1), Bb = blur(B, w, h, r1);
  const ft = new Float32Array(n), chroma = new Float32Array(n), edge = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ft[i] = Math.hypot(Lb[i] - mL, Ab[i] - mA, Bb[i] - mB);
    chroma[i] = Math.hypot(A[i], B[i]);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
      const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
      edge[i] = Math.hypot(gx, gy);
    }
  }
  const detail = normalize(blur(edge, w, h, Math.max(2, Math.round(Math.min(w, h) / 34))));
  normalize(ft);
  normalize(chroma);

  const sal = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = (x + 0.5) / w - 0.5, dy = (y + 0.5) / h - 0.42;
      const bias = 1 - 0.9 * (dx * dx + dy * dy);
      sal[i] = (0.3 * ft[i] + 0.55 * detail[i] + 0.15 * chroma[i]) * bias * alpha[i];
    }
  }
  const salB = normalize(blur(sal, w, h, Math.max(2, Math.round(Math.min(w, h) / 40))));
  let focal = findPeaks(salB, w, h, 4);
  if (!focal.length) focal = [{ x: 0.5, y: 0.42, strength: 1, size: 0.35 }];

  const palette = extractPalette(rgba, n);
  const roles = paletteRoles(palette);

  // 表示用テクスチャの元画像（長辺 2560 まで縮小）
  const MAX = 2560;
  let texSource = bmp;
  if (Math.max(iw, ih) > MAX) {
    const s = MAX / Math.max(iw, ih);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(iw * s); c2.height = Math.round(ih * s);
    c2.getContext('2d').drawImage(bmp, 0, 0, c2.width, c2.height);
    texSource = c2;
  }

  // サムネイル（UI用 dataURL）
  const tcv = document.createElement('canvas');
  const ts = 240 / Math.max(iw, ih);
  tcv.width = Math.round(iw * ts); tcv.height = Math.round(ih * ts);
  tcv.getContext('2d').drawImage(bmp, 0, 0, tcv.width, tcv.height);

  return {
    name: name || 'untitled',
    title: prettifyTitle(name),
    width: texSource.width,
    height: texSource.height,
    aspect: iw / ih,
    source: texSource,
    thumb: tcv.toDataURL('image/jpeg', 0.85),
    focal, // [{x,y,strength,size}] 強い順
    autoFocal: focal.map((f) => ({ ...f })),
    palette,
    roles,
    saliency: { w, h, data: salB },
  };
}

// ファイル名 → 作品タイトル候補（拡張子・連番・区切りを整形）
export function prettifyTitle(name = '') {
  let t = name.replace(/\.[a-z0-9]+$/i, '');
  t = t.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || /^(img|image|dsc|pxl|screenshot|スクリーンショット)?\s*\d[\d\s]*$/i.test(t)) return 'UNTITLED';
  return t.length > 28 ? t.slice(0, 27) + '…' : t;
}
