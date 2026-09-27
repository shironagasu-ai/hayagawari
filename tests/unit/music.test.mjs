// 曲の解析（src/music.js）の単体テスト。node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTempo, gridFromAnalysis, gridWithBpm, gridShiftBar, nextDownbeat, tempoFromTaps, applyTaps, cutSong } from '../../src/music.js';
import { drum } from './drum.mjs';

// 拍の格子 g が、実際の拍（offset から beat 間隔）と何秒ずれているか（拍・小節の頭）
const phaseErr = (g, s) => { const d = (((g.first - s.offset) % s.beat) + s.beat * 1.5) % s.beat - s.beat / 2; return Math.abs(d); };
const downErr = (g, s) => { const bar = s.beat * 4, d = (((g.first + g.bar * g.beat - s.offset) % bar) + bar * 1.5) % bar - bar / 2; return Math.abs(d); };

for (const bpm of [90, 124]) {
  test(`合成ドラム ${bpm} BPM: テンポ・拍・小節の頭を推定できる`, () => {
    const s = drum({ bpm });
    const g = gridFromAnalysis(analyzeTempo(s.x, s.sr));
    assert.ok(Math.abs(g.bpm - bpm) < 1, `bpm ${g.bpm}`);
    assert.ok(phaseErr(g, s) < 0.03, `拍のずれ ${phaseErr(g, s)}`);
    assert.ok(downErr(g, s) < 0.03, `小節の頭のずれ ${downErr(g, s)}`);
  });
}

test('短すぎる曲は既定値（120 BPM・確からしさ 0）', () => {
  const r = analyzeTempo(new Float32Array(22050), 22050);
  assert.equal(r.bpm, 120);
  assert.equal(r.confidence, 0);
});

test('格子: BPM の入れ直し・小節の頭のずらし・次の小節の頭', () => {
  const g = { bpm: 120, beat: 0.5, first: 0.3, bar: 1 };
  const h = gridWithBpm(g, 60);
  assert.equal(h.beat, 1);
  assert.equal(h.bar, 1);
  assert.equal(gridShiftBar(g, 1).bar, 2);
  assert.equal(gridShiftBar(g, -2).bar, 3);
  // 小節の頭は 0.3 + 1 拍 = 0.8、以後 2 秒ごと
  assert.ok(Math.abs(nextDownbeat(g, 0) - 0.8) < 1e-9);
  assert.ok(Math.abs(nextDownbeat(g, 0.8) - 0.8) < 1e-9);
  assert.ok(Math.abs(nextDownbeat(g, 0.81) - 2.8) < 1e-9);
});

test('タップ: 4 回未満は無効。推定に近い間隔なら推定の間隔を使い、位置と倍・半分だけ直す', () => {
  const beat = 60 / 124, offset = 0.61;
  const g = { bpm: 62, beat: 60 / 62, first: 0.2, bar: 0 }; // 半分・位置違いで推定を間違えた想定
  const t = [8, 9, 10, 11, 12, 13].map((k) => offset + k * beat + (k % 2 ? 0.012 : -0.012));
  assert.equal(applyTaps(g, t.slice(0, 3)), null);
  const fixed = applyTaps(g, t);
  assert.ok(Math.abs(fixed.bpm - 124) < 1e-6, `bpm ${fixed.bpm}`);
  assert.ok(phaseErr(fixed, { offset, beat }) < 0.005);
  assert.ok(Math.abs(tempoFromTaps(t).bpm - 124) < 2);
});

test('書き出し用の切り出し: offset から尺だけ、頭の立ち上げ、最後のフェード、足りない分は無音、2ch', () => {
  const sr = 1000, a = new Float32Array(5000).fill(1);
  const [l, r] = cutSong([a], sr, { offset: 1, duration: 6, fadeFrom: 3, fadeTo: 4 });
  assert.equal(l.length, 6000);
  assert.equal(r.length, 6000);
  assert.equal(l[0], 0); // 5ms で立ち上げる
  assert.equal(l[10], 1);
  assert.equal(l[2999], 1);
  assert.ok(Math.abs(l[3500] - 0.5) < 0.01); // フェードの途中
  assert.equal(l[4001], 0);
  assert.equal(l[5999], 0); // 曲が終わったあとは無音
  assert.deepEqual([...l], [...r]); // モノラルは 2ch に広げる
});
