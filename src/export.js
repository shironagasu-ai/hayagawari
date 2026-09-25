// 1コマずつの書き出し（WebCodecs + MP4）。
// 実時間再生と無関係に t = i / fps の絵を順に描いてエンコードするので、
// PC の負荷やタブの切り替えでコマ落ちせず、4K でも確実に全フレームが入る。
// MP4 の組み立ては vendor/ の mp4-muxer（MIT）を書き出し時にだけ読み込む。

// 互換性の高い順。H.264 は一般配布の Chrome / Edge / Safari で使える（オープンソース版 Chromium には無い）
const CANDIDATES = [
  { muxCodec: 'avc', label: 'H.264', codecs: (big) => (big ? ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.420034'] : ['avc1.64002a', 'avc1.640028', 'avc1.4d002a', 'avc1.42002a', 'avc1.42001f']) },
  { muxCodec: 'vp9', label: 'VP9', codecs: (big) => (big ? ['vp09.00.51.08', 'vp09.00.50.08'] : ['vp09.00.41.08', 'vp09.00.40.08']) },
  { muxCodec: 'av1', label: 'AV1', codecs: (big) => (big ? ['av01.0.12M.08', 'av01.0.13M.08'] : ['av01.0.09M.08', 'av01.0.08M.08']) },
];

export function frameExportAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && window.isSecureContext;
}

// 使えるエンコーダ設定を探す。見つからなければ null（→ リアルタイム録画にフォールバック）
export async function pickEncoderConfig(width, height, fps) {
  if (!frameExportAvailable()) return null;
  const big = width * height > 2_300_000; // 1080p を超える
  const bitrate = Math.round(width * height * fps * (big ? 0.09 : 0.13)); // 1080p60 ≈ 16Mbps / 4K60 ≈ 45Mbps
  for (const c of CANDIDATES) {
    for (const codec of c.codecs(big)) {
      const config = {
        codec, width, height, bitrate, framerate: fps,
        latencyMode: 'quality', bitrateMode: 'variable',
        ...(c.muxCodec === 'avc' ? { avc: { format: 'avc' } } : {}),
      };
      try {
        const res = await VideoEncoder.isConfigSupported(config);
        if (res.supported) return { config: res.config || config, muxCodec: c.muxCodec, label: c.label };
      } catch { /* 次の候補へ */ }
    }
  }
  return null;
}

// 音声: AAC を優先（一般配布の Chrome / Edge / Safari）、なければ Opus
const AUDIO_CANDIDATES = [
  { codec: 'mp4a.40.2', muxCodec: 'aac', label: 'AAC' },
  { codec: 'opus', muxCodec: 'opus', label: 'Opus' },
];

export async function pickAudioConfig(sampleRate = 48000, numberOfChannels = 2) {
  if (typeof AudioEncoder === 'undefined' || !window.isSecureContext) return null;
  for (const c of AUDIO_CANDIDATES) {
    const config = { codec: c.codec, sampleRate, numberOfChannels, bitrate: 192_000 };
    try {
      const res = await AudioEncoder.isConfigSupported(config);
      if (res.supported) return { config: res.config || config, muxCodec: c.muxCodec, label: c.label };
    } catch { /* 次の候補へ */ }
  }
  return null;
}

// AudioBuffer を丸ごとエンコードして muxer へ（0.1 秒ずつ AudioData にする）
async function encodeAudio(buffer, aenc, muxer) {
  let failure = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(aenc.config);
  const sr = buffer.sampleRate, ch = buffer.numberOfChannels;
  const step = Math.round(sr / 10);
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let off = 0; off < buffer.length; off += step) {
    const n = Math.min(step, buffer.length - off);
    const planar = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) planar.set(chans[c].subarray(off, off + n), c * n);
    const data = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1e6), data: planar });
    encoder.encode(data);
    data.close();
    if (failure) break;
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

// タイマーの間引き（非表示タブで最大 1 秒）を受けずに、UI へ制御を返す
const channel = new MessageChannel();
const yieldQueue = [];
channel.port1.onmessage = () => { const r = yieldQueue.shift(); if (r) r(); };
const yieldToUI = () => new Promise((r) => { yieldQueue.push(r); channel.port2.postMessage(0); });

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas  描画先（このサイズでエンコード）
 * @param {(t:number)=>void} o.renderAt 時刻 t の絵を canvas に描く
 * @param {number} o.duration 秒
 * @param {number} o.fps
 * @param {object} o.enc pickEncoderConfig の結果
 * @param {(p:number, info:object)=>void} o.onProgress
 * @param {AbortSignal} o.signal
 * @param {{buffer: AudioBuffer, enc: object}} [o.audio] 音声（省略で映像のみ）
 * @returns {Promise<Blob>}
 */
export async function exportFrames({ canvas, renderAt, duration, fps, enc, onProgress, signal, audio }) {
  const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer-5.2.2.mjs');
  const { width, height } = enc.config;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: enc.muxCodec, width, height, frameRate: fps },
    ...(audio ? { audio: { codec: audio.enc.muxCodec, numberOfChannels: audio.buffer.numberOfChannels, sampleRate: audio.buffer.sampleRate } } : {}),
    fastStart: 'in-memory', // moov を先頭に置く（SNS やブラウザでの即再生向け）
    firstTimestampBehavior: 'offset',
  });
  // 音声は先に一括でエンコード（オフライン合成済みなので速い）
  if (audio) await encodeAudio(audio.buffer, audio.enc, muxer);
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(enc.config);

  const total = Math.max(1, Math.ceil(duration * fps));
  const frameUs = 1e6 / fps;
  const started = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      if (signal && signal.aborted) throw new DOMException('中止しました', 'AbortError');
      if (failure) throw failure;
      renderAt(Math.min(duration - 1e-4, i / fps));
      // 描いた直後の同じタスク内で取り込む（preserveDrawingBuffer=false でも中身が残っている）
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      // エンコーダが詰まったら待つ（メモリを食い潰さない）
      while (encoder.encodeQueueSize > 8) {
        await new Promise((r) => encoder.addEventListener('dequeue', r, { once: true }));
      }
      if (i % 3 === 0 || i === total - 1) {
        const el = (performance.now() - started) / 1000;
        const p = (i + 1) / total;
        onProgress && onProgress(p, { frame: i + 1, total, elapsed: el, eta: p > 0.02 ? el / p - el : NaN });
        await yieldToUI();
      }
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
