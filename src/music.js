// 持ち込んだ曲の解析: テンポ（BPM）と拍の位置・小節の頭を推定する。すべてブラウザ内で処理し、どこにも送らない。
//
// 手順:
//   1. モノラルにして、短い区間ごとの周波数の強さ（FFT）を求める
//   2. 前の区間より強くなった分を足し合わせて「音の立ち上がりの強さ」（オンセット）を作る
//   3. オンセットの自己相関から拍の間隔（テンポ）を選ぶ（人が感じやすい 120 BPM 付近を少し優先）
//   4. その間隔で並べた点がいちばんオンセットに乗る位置を拍の位置とし、低音の強い拍を小節の頭とする
// 外れることがあるので、UI ではタップで BPM と拍の位置を合わせ直せるようにする（tempoFromTaps）。

const HOP = 512; // 解析の区間の間隔（サンプル）。44.1kHz で約 11.6ms
const WIN = 1024; // FFT の長さ
const MIN_BPM = 60, MAX_BPM = 200;
const SLOW_BPM = 100, FAST_BPM = 165; // この外に出たら倍・半分を疑う

// 曲のファイル → AudioBuffer（ブラウザの対応形式: MP3 / AAC / WAV / Ogg など）
// sr: 読み込む周波数。テンポの解析には 22050Hz で足りる（半分の時間で済む）
export async function decodeSong(blob, sr = 44100) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, sr);
  return ctx.decodeAudioData(buf);
}

// AudioBuffer → モノラルの Float32Array
export function toMono(ab) {
  const n = ab.length, ch = ab.numberOfChannels;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / ch;
  }
  return out;
}

// ---------------------------------------------------------------- FFT（長さ 2 の累乗・その場で計算）

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// ---------------------------------------------------------------- オンセット

// 音の立ち上がりの強さ（区間ごと）と、低音の強さ（小節の頭の判定用）
export function onsetEnvelope(x, sr) {
  const frames = Math.max(0, Math.floor((x.length - WIN) / HOP));
  const onset = new Float32Array(frames);
  const low = new Float32Array(frames);
  const re = new Float32Array(WIN), im = new Float32Array(WIN);
  const hann = new Float32Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN);
  const bins = WIN / 2;
  const lowBin = Math.max(2, Math.round((150 * WIN) / sr)); // 150Hz まで＝キックやベース
  let prev = new Float32Array(bins);
  let cur = new Float32Array(bins);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) { re[i] = x[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0, lo = 0;
    for (let k = 1; k < bins; k++) {
      const a = Math.hypot(re[k], im[k]);
      const m = Math.log1p(100 * a);
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) flux += d;
      if (k <= lowBin) lo += a * a;
    }
    onset[f] = flux;
    low[f] = lo; // 低音はそのままのエネルギーで見る（対数だとスネアの雑音もキック並みに数えてしまう）
    [prev, cur] = [cur, prev];
  }
  // 低音は増えた分だけ
  for (let f = frames - 1; f > 0; f--) low[f] = Math.max(0, low[f] - low[f - 1]);
  if (frames) low[0] = 0;
  // 局所平均を引いて、ゆっくりした音量の変化を取り除く
  const w = Math.round((0.5 * sr) / HOP);
  const out = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += onset[f];
    if (f >= 2 * w + 1) acc -= onset[f - 2 * w - 1];
    const c = f - w;
    if (c >= 0) out[c] = Math.max(0, onset[c] - acc / Math.min(f + 1, 2 * w + 1));
  }
  return { onset: out, low, fps: sr / HOP };
}

// ---------------------------------------------------------------- テンポと拍

// オンセット（1 秒あたり fps 区間）からテンポ（1 拍の区間数・小数）を推定
function estimatePeriod(env, fps) {
  const minLag = Math.floor((60 * fps) / MAX_BPM), maxLag = Math.ceil((60 * fps) / MIN_BPM);
  const n = env.length;
  let best = -Infinity, bestLag = Math.round((60 * fps) / 120);
  const score = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
    score[lag] = s / (n - lag);
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    // 倍・半分の間隔も同じ拍に乗るので足し込み、120 BPM 付近を少し優先する
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const s = (score[lag] + 0.5 * (score[lag * 2] || 0)) * prior;
    if (s > best) { best = s; bestLag = lag; }
  }
  // 放物線で山の位置を小数まで詰める
  const a = score[bestLag - 1] || 0, b = score[bestLag], c = score[bestLag + 1] || 0;
  const den = a - 2 * b + c;
  const frac = den < 0 ? 0.5 * (a - c) / den : 0;
  return bestLag + Math.max(-0.5, Math.min(0.5, frac));
}

// 与えた間隔で並べた点がいちばんオンセットに乗る位置（区間）
function bestPhase(env, period) {
  const steps = Math.max(8, Math.round(period * 2)); // 半区間きざみ
  let best = -Infinity, bestPh = 0;
  for (let s = 0; s < steps; s++) {
    const ph = (s / steps) * period;
    let sum = 0;
    for (let t = ph; t < env.length; t += period) {
      const i = Math.floor(t), fr = t - i;
      sum += (env[i] || 0) * (1 - fr) + (env[i + 1] || 0) * fr;
    }
    if (sum > best) { best = sum; bestPh = ph; }
  }
  return bestPh;
}

// 予想した拍の近く（±1/4 拍）でいちばん強い山を拾い、山の強さで重み付けした直線 t = ph + period * k を求める
function refineGrid(env, ph, period) {
  const r = Math.max(1, Math.floor(period / 4));
  let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
  for (let k = 0; ph + k * period < env.length; k++) {
    const c = Math.round(ph + k * period);
    let bi = -1, bv = 0;
    for (let i = Math.max(1, c - r); i <= Math.min(env.length - 2, c + r); i++) {
      if (env[i] > bv && env[i] >= env[i - 1] && env[i] >= env[i + 1]) { bv = env[i]; bi = i; }
    }
    if (bi < 0) continue;
    // 山の頂点を放物線で小数まで
    const a = env[bi - 1], b = env[bi], cc = env[bi + 1], den = a - 2 * b + cc;
    const t = bi + (den < 0 ? 0.5 * (a - cc) / den : 0);
    sw += bv; sk += bv * k; st += bv * t; skk += bv * k * k; skt += bv * k * t;
  }
  const det = sw * skk - sk * sk;
  if (sw <= 0 || det <= 1e-9) return [ph, period];
  const p2 = (sw * skt - sk * st) / det;
  if (!(Math.abs(p2 / period - 1) < 0.03)) return [ph, period];
  let ph2 = (st - p2 * sk) / sw;
  ph2 = ((ph2 % p2) + p2) % p2;
  return [ph2, p2];
}

// 並べた点の上と、そのちょうど中間でのオンセットの平均
function gridContrast(env, ph, period) {
  let on = 0, mid = 0, n = 0;
  for (let t = ph; t + period / 2 < env.length; t += period, n++) {
    on += env[Math.round(t)] || 0;
    mid += env[Math.round(t + period / 2)] || 0;
  }
  return n ? { on: on / n, mid: mid / n } : { on: 0, mid: 0 };
}

/**
 * 曲のテンポと拍を推定する
 * @param {Float32Array} x モノラルの波形
 * @param {number} sr サンプリング周波数
 * @returns {{ bpm: number, beat: number, first: number, downbeat: number, duration: number, confidence: number }}
 *   beat: 1 拍の秒数 / first: 最初の拍の時刻（秒） / downbeat: 最初の小節の頭の時刻（秒・4 拍子として） / confidence: 0..1 の目安
 */
export function analyzeTempo(x, sr) {
  const { onset, low, fps } = onsetEnvelope(x, sr);
  const duration = x.length / sr;
  if (onset.length < fps * 4) return { bpm: 120, beat: 0.5, first: 0, downbeat: 0, duration, confidence: 0 };
  let period = estimatePeriod(onset, fps);
  let ph = bestPhase(onset, period);
  // 間隔のわずかな誤差は曲の後ろほどずれが大きくなるので、各拍の近くの山に直線を当てはめて詰める
  for (let it = 0; it < 3; it++) [ph, period] = refineGrid(onset, ph, period);
  // 倍・半分の取り違えを直す: 速すぎるときは 1 つおきの点が弱ければ（8 分のハイハットなど）半分に、
  // 遅すぎるときは間の点も強ければ（キックとスネアの交互など）倍にする
  const toBpm = (p) => (60 * fps) / p;
  if (toBpm(period) > FAST_BPM && toBpm(period * 2) >= MIN_BPM) {
    // 1 つおきに分けた 2 列のうち、弱い方が強い方の 3/4 未満なら、強い方の列を拍とする
    const g = gridContrast(onset, ph, period * 2);
    if (Math.min(g.on, g.mid) < 0.75 * Math.max(g.on, g.mid)) {
      if (g.mid > g.on) ph += period;
      period *= 2;
    }
  } else if (toBpm(period) < SLOW_BPM && toBpm(period / 2) <= FAST_BPM) {
    // 間の点が強いか、さらにその間（1/4・3/4）にも音がある（＝実は 8 分音符）なら倍にする
    const g = gridContrast(onset, ph, period);
    const q = (gridContrast(onset, ph + period / 4, period).on + gridContrast(onset, ph + (3 * period) / 4, period).on) / 2;
    if (g.mid > 0.5 * g.on || (q > 0.1 * g.on && q > 0.4 * g.mid)) period /= 2;
  }
  ph %= period; // 倍にしたときに前へ 1 拍増えることがある
  // 小節の頭: 4 拍ごとに見て低音の立ち上がりが強い位置。キックが 1・3 拍目にある曲では半小節迷うので、
  // 曲が始まって最初のはっきりした拍（たいてい小節の頭）も手がかりにする
  const beats = [];
  for (let t = ph; t < onset.length; t += period) beats.push(Math.round(t));
  const near = (a, i) => Math.max(a[i - 1] || 0, a[i] || 0, a[i + 1] || 0); // 区間の境目で取りこぼさないよう前後も見る
  const strength = beats.map((i) => near(onset, i));
  const typical = [...strength].sort((a, b) => a - b)[Math.floor(strength.length / 2)] || 0;
  const startK = Math.max(0, strength.findIndex((v) => v > 0.3 * typical)) % 4;
  const bar = [0, 0, 0, 0];
  beats.forEach((i, n) => { bar[n % 4] += near(low, i); });
  const barMax = Math.max(...bar) || 1;
  let bestBar = -Infinity, barK = 0;
  for (let k = 0; k < 4; k++) {
    const s = bar[k] / barMax + (k === startK ? 0.3 : 0);
    if (s > bestBar) { bestBar = s; barK = k; }
  }
  // 信頼度: 拍の位置のオンセットが、裏拍の位置よりどれだけ強いか
  let on = 0, off = 0, cnt = 0;
  for (let t = ph; t + period / 2 < onset.length; t += period, cnt++) {
    on += onset[Math.round(t)] || 0;
    off += onset[Math.round(t + period / 2)] || 0;
  }
  const confidence = cnt ? Math.max(0, Math.min(1, (on - off) / (on + 1e-9))) : 0;
  const beat = period / fps;
  // 解析の区間は窓の中央を表すので、半窓ぶん後ろにずらす
  const lag = WIN / 2 / sr;
  const first = ph / fps + lag;
  return {
    bpm: 60 / beat,
    beat,
    first,
    downbeat: first + barK * beat,
    duration,
    confidence,
  };
}

// 拍の間隔 beat の格子に、時刻の並び t がいちばん合う位置（0..beat の秒）。各時刻を円周に置いた平均で求める
function phaseOf(t, beat) {
  let sx = 0, sy = 0;
  for (const v of t) { const a = ((v % beat) / beat) * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); }
  const ph = (Math.atan2(sy, sx) / (2 * Math.PI)) * beat;
  return ph < 0 ? ph + beat : ph;
}

/**
 * タップした時刻（曲の再生位置・秒）から BPM と拍の位置を求める。4 回以上で有効
 * @param {number[]} taps
 * @returns {{ bpm: number, beat: number, first: number } | null}
 */
export function tempoFromTaps(taps) {
  if (!taps || taps.length < 4) return null;
  const t = [...taps].sort((a, b) => a - b);
  const d = [];
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
  const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
  // 抜けたタップ（間隔が約 2 倍）もその拍数で割って使う
  const ints = d.map((v) => v / Math.max(1, Math.round(v / med)));
  const beat = ints.reduce((a, b) => a + b, 0) / ints.length;
  if (!(beat > 60 / 300 && beat < 60 / 30)) return null;
  return { bpm: 60 / beat, beat, first: phaseOf(t, beat) };
}

// ---------------------------------------------------------------- 拍の格子（UI・映像で使う形）
// { bpm, beat, first, bar }: first = 最初の拍の時刻（秒・0 以上で最初のもの）/ bar = 小節の頭が first から何拍目か（0..3）

const mod = (a, n) => ((a % n) + n) % n;

export function gridFromAnalysis(a) {
  return { bpm: a.bpm, beat: a.beat, first: a.first, bar: mod(Math.round((a.downbeat - a.first) / a.beat), 4) };
}

// BPM を指定し直す（拍の位置と小節の頭はそのまま）
export function gridWithBpm(g, bpm) {
  const beat = 60 / bpm;
  return { ...g, bpm, beat, first: mod(g.first, beat) };
}

// 小節の頭を 1 拍ずらす
export function gridShiftBar(g, d) {
  return { ...g, bar: mod(g.bar + d, 4) };
}

// 小節の頭の時刻（t 以降で最初のもの）
export function nextDownbeat(g, t = 0) {
  const bar = g.beat * 4, d0 = g.first + g.bar * g.beat;
  return d0 + Math.ceil((t - d0) / bar - 1e-6) * bar;
}

/**
 * タップで格子を合わせ直す。推定の BPM（またはその倍・半分）に近ければ間隔は推定のほうが精確なのでそのまま使い、
 * 拍の位置と倍・半分の取り違えだけを直す。離れていればタップの BPM を使う
 * @param {{ bpm: number, beat: number, first: number, bar: number } | null} g 今の格子
 * @param {number[]} taps
 */
export function applyTaps(g, taps) {
  const t = tempoFromTaps(taps);
  if (!t) return null;
  let beat = t.beat;
  if (g) {
    for (const m of [1, 2, 0.5]) {
      const b = g.beat * m;
      if (Math.abs(b / t.beat - 1) < 0.04) { beat = b; break; }
    }
  }
  const first = phaseOf(taps, beat);
  // 小節の頭: 今の小節の頭にいちばん近い拍
  let bar = 0;
  if (g) bar = mod(Math.round((g.first + g.bar * g.beat - first) / beat), 4);
  return { bpm: 60 / beat, beat, first, bar };
}
