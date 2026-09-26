// 「サンプルで試す」用のイラスト（assets/samples/）。
// イラストの権利は作者が保持しており、HAYAGAWARI のデモとして表示する以外には使えない（MIT の対象外。assets/samples/NOTICE.md）
import { createRng } from './rng.js';

// file: assets/samples/<file>.webp ／ title: 作品タイトル（映像に出る）
// focal: 見本として見せたい注目点 [x, y, 大きさ]（強い順）。自動検出は描き込みの多い背景に寄ることがあるので、
// サンプルでは主役（人物の顔など）を確実に拾うよう手で決めておく。注目点エディタの「自動検出に戻す」で解析結果になる
export const SAMPLES = [
  { file: 'kite-weather', title: 'Kite Weather', focal: [[0.42, 0.72, 0.22], [0.17, 0.12, 0.18], [0.6, 0.35, 0.35]] },
  { file: 'tidal-crossing', title: 'Tidal Crossing', focal: [[0.18, 0.42, 0.3], [0.72, 0.37, 0.28], [0.55, 0.62, 0.3]] },
  { file: 'ranunculus', title: 'Ranunculus', focal: [[0.6, 0.3, 0.25], [0.75, 0.42, 0.18], [0.66, 0.62, 0.2]] },
  { file: 'moss-steps', title: 'Moss Steps', focal: [[0.63, 0.55, 0.25], [0.43, 0.33, 0.3], [0.4, 0.8, 0.3]] },
  { file: 'seaside-descent', title: 'Seaside Descent', focal: [[0.62, 0.2, 0.2], [0.45, 0.35, 0.3], [0.8, 0.85, 0.2]] },
  { file: 'calico-groove', title: 'Calico Groove', focal: [[0.54, 0.27, 0.18], [0.8, 0.27, 0.14], [0.5, 0.6, 0.35]] },
  { file: 'double-peace', title: 'Double Peace', focal: [[0.53, 0.2, 0.2], [0.68, 0.34, 0.12], [0.5, 0.78, 0.3]] },
  { file: 'aurora-jar', title: 'Aurora in a Jar', focal: [[0.43, 0.65, 0.25], [0.74, 0.3, 0.15], [0.72, 0.72, 0.2]] },
  { file: 'greenhouse-hour', title: 'Greenhouse Hour', focal: [[0.52, 0.6, 0.22], [0.73, 0.92, 0.14], [0.25, 0.2, 0.3]] },
  { file: 'radio-room', title: 'Radio Room', focal: [[0.5, 0.72, 0.28], [0.6, 0.2, 0.3], [0.85, 0.45, 0.2]] },
];

const BASE = new URL('../assets/samples/', import.meta.url);

// 読み込むたびに 6〜8 点をランダムに選び、並びも混ぜる（seed を渡すと毎回同じ組）
export function pickSamples(seed = String(Math.random())) {
  const rng = createRng(seed);
  const list = SAMPLES.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, rng.int(6, 8));
}

// ファイル名（拡張子なし）で指定して選ぶ（カタログ・テスト用）
export function samplesByFile(files) {
  return files.map((f) => {
    const s = SAMPLES.find((x) => x.file === f);
    if (!s) throw new Error(`unknown sample: ${f}`);
    return s;
  });
}

// 画像を取ってきて addSources に渡せる形にする
export function fetchSamples(list) {
  return Promise.all(list.map(async (s) => {
    const res = await fetch(new URL(`${s.file}.webp`, BASE));
    if (!res.ok) throw new Error(`sample ${s.file}: HTTP ${res.status}`);
    const focal = s.focal.map(([x, y, size], k) => ({ x, y, size, strength: 1 - k * 0.2 }));
    return { src: await res.blob(), name: s.title, title: s.title, focal };
  }));
}
