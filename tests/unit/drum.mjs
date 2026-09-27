// テスト用の合成ドラム（E2E の曲のテストと同じ作り）。キックは 1・3 拍目、スネアは 2・4 拍目、ハイハットは 8 分
export function drum({ sr = 22050, secs = 24, bpm = 124, offset = 0.61 } = {}) {
  const beat = 60 / bpm;
  const x = new Float32Array(sr * secs);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < x.length; i++) x[i] = (rnd() - 0.5) * 0.03 + 0.08 * Math.sin((2 * Math.PI * 220 * i) / sr);
  const hit = (t, f) => { const i0 = Math.round(t * sr); for (let j = 0; j < sr * 0.15 && i0 + j < x.length; j++) x[i0 + j] += f(j / sr); };
  for (let k = 0; offset + k * beat < secs - 0.3; k++) {
    const t = offset + k * beat;
    if (k % 2 === 0) hit(t, (u) => 0.9 * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-u * 40)) * u) * Math.exp(-u * 20));
    else hit(t, (u) => (0.4 * (rnd() - 0.5) + 0.2 * Math.sin(2 * Math.PI * 190 * u)) * Math.exp(-u * 25));
    hit(t, (u) => 0.15 * (rnd() - 0.5) * Math.exp(-u * 90));
    hit(t + beat / 2, (u) => 0.12 * (rnd() - 0.5) * Math.exp(-u * 90));
  }
  return { x, sr, bpm, beat, offset };
}
