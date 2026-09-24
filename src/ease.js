// イージング集。キビキビした動きの核は「タメ（溜め）→ツメ（詰め）」:
// 動き出しを溜めて一気に詰め、最後はピタッと止める。

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
// 区間 [a,b] の中での進捗 0..1
export const prog = (t, a, b) => clamp((t - a) / (b - a));

export const linear = (t) => t;
export const quadOut = (t) => 1 - (1 - t) * (1 - t);
export const cubicIn = (t) => t * t * t;
export const cubicOut = (t) => 1 - Math.pow(1 - t, 3);
export const quartOut = (t) => 1 - Math.pow(1 - t, 4);
export const quintOut = (t) => 1 - Math.pow(1 - t, 5);
export const expoIn = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const expoInOut = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
export const circOut = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));
export const backOut = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const backIn = (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t;

// CSS 互換の cubic-bezier。ニュートン法＋二分法で x→t を解く
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  // 事前に表を作って高速化（毎フレーム多数呼ばれるため）
  const N = 64;
  const table = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) table[i] = sx(i / N);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let i = 0;
    while (i < N && table[i + 1] < x) i++;
    let t = (i + (x - table[i]) / Math.max(1e-6, table[i + 1] - table[i])) / N;
    for (let k = 0; k < 4; k++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(clamp(t));
  };
}

// 「タメツメ」: 長く溜めて短く詰める。止まり際はほぼ減速ゼロでピタッ
export const snap = cubicBezier(0.85, 0, 0.1, 1);
// やや穏やかなスナップ
export const snapSoft = cubicBezier(0.7, 0, 0.2, 1);
// 着地: 最初に大きく動いてじわっと止まる（入り用）
export const land = cubicBezier(0.05, 0.8, 0.1, 1);

// 予備動作付きの加速（退場用）: 最初の a の区間で -k だけ逆方向へ引いてから expoIn で飛ぶ
export function antic(t, a = 0.35, k = 0.05) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < a) return -k * quadOut(t / a);
  return lerp(-k, 1, expoIn((t - a) / (1 - a)));
}

// 着地時の減衰振動（パンチ・スケールのブレ用）。0 → 1 で振幅が減衰
export const settle = (t, freq = 3, decay = 6) =>
  t <= 0 ? 0 : t >= 1 ? 0 : Math.exp(-decay * t) * Math.sin(t * Math.PI * 2 * freq);

// 時間 t に対してトゥイーン: from→to を [t0, t0+dur] で ease
export const tw = (t, t0, dur, from, to, ease = linear) => lerp(from, to, ease(prog(t, t0, t0 + dur)));
