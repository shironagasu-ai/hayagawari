// シード付き乱数。同じシード＋同じ画像構成なら同じ映像になる。

// 文字列 → 32bit ハッシュ（xmur3）
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// mulberry32
export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()), // 両端含む
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // weights: { key: weight }。exclude に含まれるキーは除外（直前と同じ演出の連続を避ける）
    weighted(weights, exclude = []) {
      const keys = Object.keys(weights).filter((k) => weights[k] > 0 && !exclude.includes(k));
      const pool = keys.length ? keys : Object.keys(weights);
      let total = 0;
      for (const k of pool) total += weights[k];
      let r = next() * total;
      for (const k of pool) { r -= weights[k]; if (r <= 0) return k; }
      return pool[pool.length - 1];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    fork: (label) => createRng(hashString(label + ':' + Math.floor(next() * 4294967296))),
  };
  return rng;
}

// 人が読み書きしやすいシード文字列（紛らわしい文字を除外）
const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeed() {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-';
    s += SEED_CHARS[buf[i] % SEED_CHARS.length];
  }
  return s;
}
