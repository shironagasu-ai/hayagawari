// 映像のテンポと作品あたりの拍数を曲に合わせる（src/director.js の fitTempo）の単体テスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTempo } from '../../src/director.js';

const grid = (bpm) => ({ bpm, beat: 60 / bpm, first: 0.61, bar: 0 });
const LONG = 1e4;

test('曲の BPM の ×1・÷2・×2 のうち、スタイルのテンポに近いものを選ぶ', () => {
  assert.equal(fitTempo({ grid: grid(124), duration: LONG }, 124, 'normal', 6).bpm, 124);
  assert.equal(fitTempo({ grid: grid(62), duration: LONG }, 124, 'normal', 6).bpm, 124);
  assert.equal(fitTempo({ grid: grid(240), duration: LONG }, 124, 'normal', 6).bpm, 120);
});

test('作品の拍数は小節の倍数（「きびきび」は半小節）で、1 枚は 2.4 秒以上', () => {
  for (const bpm of [80, 100, 124, 150, 175]) {
    for (const pace of ['tight', 'normal', 'relaxed']) {
      const r = fitTempo({ grid: grid(bpm), duration: LONG }, 124, pace, 6);
      const m = r.bpm / bpm; // 映像の拍 / 曲の拍
      const unit = 4 * m * (pace === 'tight' ? 0.5 : 1);
      assert.ok(Math.abs(r.workBeats / unit - Math.round(r.workBeats / unit)) < 1e-9, `${bpm} ${pace}: ${r.workBeats} 拍は ${unit} の倍数でない`);
      assert.ok(r.workBeats * 60 / r.bpm >= 2.4 - 1e-9, `${bpm} ${pace}: ${r.workBeats} 拍は短すぎる`);
    }
  }
});

test('曲が映像より短ければ、作品の拍数を減らして曲に収める', () => {
  const g = grid(124);
  const full = fitTempo({ grid: g, duration: LONG }, 110, 'relaxed', 3);
  const short = fitTempo({ grid: g, duration: 24 }, 110, 'relaxed', 3);
  assert.equal(full.workBeats, 12);
  assert.ok(short.workBeats < full.workBeats);
  // オープニング 6 拍 + 作品 + エンディング 8 拍が、曲の頭から最初の小節の頭までを除いた長さに収まる
  assert.ok((6 + 3 * short.workBeats + 8) * (60 / short.bpm) <= 24);
});
