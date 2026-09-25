// 音: 効果音とシンプルなビートを WebAudio で合成する（音源ファイル不要）。
//
// - 映像の設計図（film）から「楽譜」= 時刻付きの音の一覧を作る。場面転換・カット・着地の瞬間は
//   film の segments / events に既にあるので、音と映像は 1 コマ単位で一致する
// - 同じ合成関数を、プレビューでは AudioContext に先読み予約し、書き出しでは OfflineAudioContext で一括生成
// - 乱数はシードから（ノイズ波形も含む）なので、同じシードなら同じ音
// モード: 'full'（ビート＋効果音）/ 'sfx'（効果音のみ）/ 'off'

import { createRng } from './rng.js';

export const SOUND_MODES = ['full', 'sfx', 'off'];
export const SOUND_LABELS = { full: 'ビート＋効果音', sfx: '効果音のみ', off: 'なし' };

// ---------------------------------------------------------------- スタイルごとの音色

const KITS = {
  NOIR:      { kick: { f0: 120, f1: 42, decay: 0.45, gain: 0.95 }, hat: { hp: 6500, decay: 0.05, gain: 0.16 }, clap: { bp: 1200, gain: 0.35 }, bass: { type: 'sine', gain: 0.5, cutoff: 400 } },
  SWISS:     { kick: { f0: 160, f1: 50, decay: 0.28, gain: 0.9 }, hat: { hp: 8000, decay: 0.035, gain: 0.2 }, clap: { bp: 1800, gain: 0.4 }, bass: { type: 'square', gain: 0.22, cutoff: 700 } },
  POP:       { kick: { f0: 170, f1: 55, decay: 0.3, gain: 0.95 }, hat: { hp: 9000, decay: 0.04, gain: 0.24 }, clap: { bp: 2000, gain: 0.5 }, bass: { type: 'sawtooth', gain: 0.2, cutoff: 900 }, pluck: { gain: 0.14 } },
  EDITORIAL: { kick: null, hat: { hp: 5000, decay: 0.08, gain: 0.12 }, clap: { bp: 2500, gain: 0.18, rim: true }, bass: { type: 'sine', gain: 0.35, cutoff: 350 }, pluck: { gain: 0.12 } },
  GLITCH:    { kick: { f0: 140, f1: 40, decay: 0.3, gain: 0.9, drive: 3 }, hat: { hp: 7000, decay: 0.03, gain: 0.2, crush: 6, stutter: true }, clap: { bp: 1500, gain: 0.35, crush: 5 }, bass: { type: 'square', gain: 0.2, cutoff: 600 } },
  MONO:      { kick: { f0: 130, f1: 45, decay: 0.35, gain: 0.9 }, hat: { hp: 7500, decay: 0.04, gain: 0.16 }, clap: null, bass: { type: 'sine', gain: 0.4, cutoff: 300 } },
  NEON:      { kick: { f0: 150, f1: 48, decay: 0.32, gain: 0.95, drive: 1.5 }, hat: { hp: 9000, decay: 0.03, gain: 0.22 }, clap: { bp: 1800, gain: 0.4 }, bass: { type: 'sawtooth', gain: 0.24, cutoff: 1200 } },
  PASTEL:    { kick: { f0: 110, f1: 55, decay: 0.2, gain: 0.45 }, hat: { hp: 6000, decay: 0.06, gain: 0.1 }, clap: null, bass: { type: 'sine', gain: 0.3, cutoff: 300 }, pluck: { gain: 0.16 } },
  RETRO:     { kick: { f0: 120, f1: 45, decay: 0.35, gain: 0.8 }, hat: { hp: 4500, decay: 0.05, gain: 0.12 }, clap: { bp: 1100, gain: 0.3 }, bass: { type: 'triangle', gain: 0.35, cutoff: 500 }, lowpass: 5200, crackle: true },
};

// マイナーペンタトニック（半音）
const PENTA = [0, 3, 5, 7, 10];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- 共有リソース（コンテキストごと）

const resCache = new WeakMap();
function resources(ctx, seed) {
  let r = resCache.get(ctx);
  if (r && r.seed === seed) return r;
  const rng = createRng('noise|' + seed);
  const len = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;
  // レコードのプチノイズ（まばらなクリック）
  const crackle = ctx.createBuffer(1, len, ctx.sampleRate);
  const c = crackle.getChannelData(0);
  for (let i = 0; i < len; i++) if (rng.next() < 0.0006) c[i] = (rng.next() * 2 - 1) * 0.9;
  r = { seed, noise, crackle, crushCurves: {}, driveCurves: {} };
  resCache.set(ctx, r);
  return r;
}

function curve(cache, key, fn) {
  if (!cache[key]) {
    const n = 2048, a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn((i / (n - 1)) * 2 - 1);
    cache[key] = a;
  }
  return cache[key];
}

// ---------------------------------------------------------------- 音源（すべて when 秒に鳴らす）
// V: { ctx, out, res, track(node) }。track は再生中の音源を停止できるよう登録する

function env(V, when, attack, hold, decay, peak) {
  const g = V.ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.setValueAtTime(peak, when + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + decay);
  return g;
}

function noiseSrc(V, when, dur, buf) {
  const s = V.ctx.createBufferSource();
  s.buffer = buf || V.res.noise;
  s.loop = true;
  s.loopStart = 0;
  s.start(when, (when * 7.3) % 1.5);
  s.stop(when + dur + 0.05);
  V.track(s);
  return s;
}

function chain(V, nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(V.out);
}

function shaper(V, kind, amount) {
  const w = V.ctx.createWaveShaper();
  w.curve = kind === 'crush'
    ? curve(V.res.crushCurves, amount, (x) => Math.round(x * amount) / amount)
    : curve(V.res.driveCurves, amount, (x) => Math.tanh(x * amount) / Math.tanh(amount));
  return w;
}

const VOICES = {
  kick(V, when, p) {
    const o = V.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(p.f0, when);
    o.frequency.exponentialRampToValueAtTime(p.f1, when + 0.12);
    const g = env(V, when, 0.002, 0.02, p.decay, p.gain);
    const nodes = [o, g];
    if (p.drive) nodes.splice(1, 0, shaper(V, 'drive', p.drive));
    chain(V, nodes);
    o.start(when); o.stop(when + p.decay + 0.1);
    V.track(o);
  },
  hat(V, when, p) {
    const s = noiseSrc(V, when, p.decay + 0.02);
    const f = V.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = p.hp;
    const g = env(V, when, 0.001, 0, p.decay, p.gain);
    const nodes = [s, f, g];
    if (p.crush) nodes.splice(2, 0, shaper(V, 'crush', p.crush));
    chain(V, nodes);
  },
  clap(V, when, p) {
    const dur = p.rim ? 0.04 : 0.14;
    const s = noiseSrc(V, when, dur + 0.03);
    const f = V.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = p.bp; f.Q.value = p.rim ? 8 : 1.2;
    const g = V.ctx.createGain();
    // 手拍子らしく 3 回の細かい立ち上がり
    g.gain.setValueAtTime(0.0001, when);
    for (let k = 0; k < (p.rim ? 1 : 3); k++) {
      g.gain.setValueAtTime(p.gain, when + k * 0.011);
      g.gain.exponentialRampToValueAtTime(p.gain * 0.3, when + k * 0.011 + 0.009);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const nodes = [s, f, g];
    if (p.crush) nodes.splice(2, 0, shaper(V, 'crush', p.crush));
    chain(V, nodes);
  },
  bass(V, when, p) {
    const o = V.ctx.createOscillator();
    o.type = p.type; o.frequency.value = p.freq;
    const f = V.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = p.cutoff; f.Q.value = 2;
    const g = env(V, when, 0.005, p.dur * 0.4, p.dur * 0.6, p.gain);
    chain(V, [o, f, g]);
    o.start(when); o.stop(when + p.dur + 0.05);
    V.track(o);
  },
  pluck(V, when, p) {
    const o = V.ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = p.freq;
    const g = env(V, when, 0.002, 0, 0.35, p.gain);
    chain(V, [o, g]);
    o.start(when); o.stop(when + 0.45);
    V.track(o);
  },
  // 帯域ノイズのスイープ（シュッ）。終わり際が一番大きい
  whoosh(V, when, p) {
    const s = noiseSrc(V, when, p.dur);
    const f = V.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = p.q || 1.4;
    f.frequency.setValueAtTime(p.f0, when);
    f.frequency.exponentialRampToValueAtTime(p.f1, when + p.dur);
    const g = V.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(p.gain, when + p.dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, when + p.dur + 0.08);
    chain(V, [s, f, g]);
  },
  // 着地の重い一撃（ドン）
  impact(V, when, p) {
    const o = V.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, when);
    o.frequency.exponentialRampToValueAtTime(32, when + 0.5);
    const g = env(V, when, 0.003, 0.03, 0.7, p.gain);
    chain(V, [o, shaper(V, 'drive', 1.8), g]);
    o.start(when); o.stop(when + 0.8);
    V.track(o);
    const s = noiseSrc(V, when, 0.3);
    const f = V.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(4000, when); f.frequency.exponentialRampToValueAtTime(300, when + 0.3);
    chain(V, [s, f, env(V, when, 0.001, 0, 0.3, p.gain * 0.5)]);
  },
  tick(V, when, p) {
    const o = V.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = p.freq || 2400;
    const f = V.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1500;
    chain(V, [o, f, env(V, when, 0.001, 0, 0.03, p.gain)]);
    o.start(when); o.stop(when + 0.05);
    V.track(o);
  },
  // デジタルなブツ切れ音
  glitch(V, when, p) {
    const rng = createRng('glitch|' + when.toFixed(3));
    for (let k = 0; k < 7; k++) {
      const t = when + k * 0.028;
      const o = V.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 200 + rng.next() * 2400;
      chain(V, [o, shaper(V, 'crush', 4), env(V, t, 0.001, 0.012, 0.01, p.gain * (0.5 + rng.next() * 0.5))]);
      o.start(t); o.stop(t + 0.03);
      V.track(o);
    }
  },
  // 盛り上げ（ノイズが上昇しながら大きくなる）
  riser(V, when, p) {
    VOICES.whoosh(V, when, { dur: p.dur, f0: 300, f1: 6000, gain: p.gain, q: 0.9 });
  },
  crackle(V, when, p) {
    const s = noiseSrc(V, when, p.dur, V.res.crackle);
    const f = V.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1500;
    const g = V.ctx.createGain();
    g.gain.value = p.gain;
    chain(V, [s, f, g]);
  },
};

// ---------------------------------------------------------------- 楽譜（film → 音の一覧）

export function buildScore(film, seed, mode = 'full') {
  const notes = [];
  if (mode === 'off' || !film) return { notes, mode, duration: film ? film.duration : 0, kit: null };
  const rng = createRng('score|' + seed);
  const kitName = film.baseTheme || film.theme;
  const kit = KITS[kitName] || KITS.NOIR;
  const beat = film.beat;
  const add = (t, voice, p, layer) => { if (t >= 0 && t < film.duration) notes.push({ t, voice, p, layer }); };
  const segs = film.segments;
  const segAt = (t) => { for (let i = segs.length - 1; i >= 0; i--) if (t >= segs[i].start - 1e-6) return segs[i]; return segs[0]; };

  // ---- ビート
  if (mode === 'full') {
    const nBeats = Math.round(film.duration / beat);
    const rootBase = 33 + rng.int(0, 7); // A1 付近
    const roots = segs.map(() => rootBase + PENTA[rng.int(0, PENTA.length - 1)] - (rng.chance(0.3) ? 12 : 0));
    for (let b = 0; b < nBeats; b++) {
      const t = b * beat;
      const seg = segAt(t + 1e-4);
      const si = segs.indexOf(seg);
      const lb = Math.round((t - seg.start) / beat); // セグメント内の拍番号
      const segBeats = Math.round(seg.dur / beat);
      if (seg.kind === 'opener') {
        add(t + beat / 2, 'hat', { ...kit.hat, gain: kit.hat.gain * 0.8 }, 'beat');
        if (lb >= segBeats - 2) add(t + beat / 4, 'hat', { ...kit.hat, gain: kit.hat.gain * 0.5 }, 'beat');
        continue;
      }
      const closerTail = seg.kind === 'closer' && lb >= 4;
      if (closerTail && lb % 2) continue; // エンディング後半はハーフタイム
      if (seg.kind === 'closer' && lb >= segBeats - 1) continue; // 最後の拍は余韻
      if (kit.kick) add(t, 'kick', kit.kick, 'beat');
      if (kit.hat) {
        add(t + beat / 2, 'hat', kit.hat, 'beat');
        if (kit.hat.stutter && rng.chance(0.35)) { add(t + beat * 0.75, 'hat', kit.hat, 'beat'); add(t + beat * 0.875, 'hat', kit.hat, 'beat'); }
      }
      if (kit.clap && lb % 2 === 1 && !closerTail) add(t, 'clap', kit.clap, 'beat');
      if (kit.bass) {
        const m = roots[si] + (lb % 4 === 3 ? PENTA[rng.int(1, 3)] : 0);
        add(t + beat / 2, 'bass', { ...kit.bass, freq: mtof(m), dur: beat * 0.45 }, 'beat');
      }
      if (kit.pluck && lb % 2 === 0) add(t + beat * 0.75, 'pluck', { ...kit.pluck, freq: mtof(roots[si] + 24 + PENTA[rng.int(0, 4)]) }, 'beat');
      if (kit.crackle) add(t, 'crackle', { dur: beat, gain: 0.35 }, 'beat');
    }
  }

  // ---- 効果音: 場面転換
  for (let i = 0; i < segs.length - 1; i++) {
    const T = segs[i + 1].start;
    const type = segs[i].outT && segs[i].outT.type;
    switch (type) {
      case 'whip': add(T - 0.3, 'whoosh', { dur: 0.32, f0: 700, f1: 4500, gain: 0.5 }, 'sfx'); break;
      case 'zoom': add(T - 0.34, 'whoosh', { dur: 0.34, f0: 400, f1: 7000, gain: 0.5, q: 1 }, 'sfx'); break;
      case 'spin': add(T - 0.34, 'whoosh', { dur: 0.36, f0: 5000, f1: 500, gain: 0.45, q: 2 }, 'sfx'); break;
      case 'slices': case 'door':
        add(T - 0.24, 'whoosh', { dur: 0.24, f0: 1800, f1: 7000, gain: 0.35, q: 2.5 }, 'sfx');
        add(T, 'tick', { gain: 0.25, freq: 1800 }, 'sfx');
        break;
      case 'bars': add(T - 0.34, 'whoosh', { dur: 0.5, f0: 900, f1: 2500, gain: 0.4, q: 0.8 }, 'sfx'); break;
      case 'iris': add(T - 0.05, 'pluck', { freq: 1760, gain: 0.25 }, 'sfx'); add(T - 0.3, 'whoosh', { dur: 0.3, f0: 3000, f1: 800, gain: 0.25 }, 'sfx'); break;
      case 'glitch': add(T - 0.2, 'glitch', { gain: 0.28 }, 'sfx'); break;
      case 'cut': default: break; // カットは下の flash イベントの一撃で鳴る
    }
    // 最初の作品へ入る直前の盛り上げ
    if (i === 0) add(T - beat * 2, 'riser', { dur: beat * 2, gain: 0.3 }, 'sfx');
  }

  // ---- 効果音: 着地・カット（flash / shake イベント）
  let lastImpact = -1;
  // 時刻順に処理する（重複判定が時刻順を前提にしているため。film.events は追加順）
  for (const ev of [...film.events].sort((a, b) => a.t - b.t)) {
    if (ev.kind === 'flash') {
      if (ev.amt >= 0.4) {
        if (ev.t - lastImpact > 0.08) { add(ev.t, 'impact', { gain: Math.min(0.9, 0.45 + ev.amt * 0.5) }, 'sfx'); lastImpact = ev.t; }
      } else if (ev.amt >= 0.15) add(ev.t, 'clap', { bp: 3000, gain: 0.25, rim: true }, 'sfx');
      else add(ev.t, 'tick', { gain: 0.18 }, 'sfx');
    } else if (ev.kind === 'shake' && ev.amt >= 5 && ev.t - lastImpact > 0.08) {
      add(ev.t, 'impact', { gain: 0.45 }, 'sfx');
      lastImpact = ev.t;
    }
  }
  notes.sort((a, b) => a.t - b.t);
  return { notes, mode, duration: film.duration, kit: kitName };
}

// 出力段（音量・コンプレッサー・スタイルごとのこもり）
function master(ctx, kitName) {
  const input = ctx.createGain();
  input.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
  // 仕上げの音量（コンプレッサーを抜けたピークでも割れないよう余裕を残す）
  const trim = ctx.createGain();
  trim.gain.value = 0.92;
  input.connect(comp);
  comp.connect(trim);
  let last = trim;
  const lp = KITS[kitName] && KITS[kitName].lowpass;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    trim.connect(f);
    last = f;
  }
  return { input, output: last };
}

// ---------------------------------------------------------------- 書き出し用: 楽譜を一括で音声バッファに

export async function renderScoreOffline(score, seed, duration, sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const M = master(ctx, score.kit);
  M.output.connect(ctx.destination);
  const V = { ctx, out: M.input, res: resources(ctx, seed), track: () => {} };
  for (const n of score.notes) if (n.t < duration) VOICES[n.voice](V, n.t, n.p);
  return ctx.startRendering();
}

// ---------------------------------------------------------------- プレビュー用: 先読みで予約しながら鳴らす

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.score = null;
    this.seed = '';
    this.idx = 0;
    this.base = 0;      // film 時刻 t の音は ctx 時刻 base + t に鳴る
    this.running = false;
    this.live = new Set();
    this.streamDest = null;
  }

  // ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため）
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setScore(score, seed) {
    const wasRunning = this.running;
    const t = wasRunning ? this.filmTime() : 0;
    this.stop();
    this.score = score;
    this.seed = seed;
    if (this.ctx) {
      if (this.M) this.M.output.disconnect();
      this.M = master(this.ctx, score.kit);
      this.M.output.connect(this.ctx.destination);
      if (this.streamDest) this.M.output.connect(this.streamDest);
    }
    if (wasRunning) this.start(t);
  }

  start(filmT) {
    if (!this.ctx || !this.score || this.score.mode === 'off') return;
    this.stop();
    if (!this.M) { this.M = master(this.ctx, this.score.kit); this.M.output.connect(this.ctx.destination); }
    this.base = this.ctx.currentTime + 0.05 - filmT;
    const notes = this.score.notes;
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].t < filmT - 0.005) lo = mid + 1; else hi = mid; }
    this.idx = lo;
    this.running = true;
    this.pump();
  }

  stop() {
    this.running = false;
    for (const n of this.live) { try { n.stop(0); } catch { /* 既に停止 */ } try { n.disconnect(); } catch { /* 同上 */ } }
    this.live.clear();
  }

  // 毎フレーム呼ぶ: 0.25 秒先までを予約
  pump() {
    if (!this.running || !this.ctx) return;
    const V = {
      ctx: this.ctx, out: this.M.input, res: resources(this.ctx, this.seed),
      track: (node) => { this.live.add(node); node.onended = () => this.live.delete(node); },
    };
    const horizon = this.ctx.currentTime + 0.25 - this.base;
    const notes = this.score.notes;
    while (this.idx < notes.length && notes[this.idx].t < horizon) {
      const n = notes[this.idx++];
      VOICES[n.voice](V, Math.max(this.ctx.currentTime, this.base + n.t), n.p);
    }
  }

  // いま聞こえている位置（出力遅延ぶん引く）。音声の時計が進んでいなければ NaN
  filmTime() {
    if (!this.running || !this.ctx || this.ctx.state !== 'running') return NaN;
    return this.ctx.currentTime - this.base - (this.ctx.outputLatency || 0);
  }

  // 実時間録画（フォールバック）用の音声トラック
  stream() {
    if (!this.ctx) return null;
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination();
      if (this.M) this.M.output.connect(this.streamDest);
    }
    return this.streamDest.stream;
  }
}
