// 曲の解析を画面の処理と別に行う（長い曲でも操作が固まらないように）
import { analyzeTempo } from './music.js';

self.onmessage = (e) => {
  const { id, x, sr } = e.data;
  try {
    self.postMessage({ id, result: analyzeTempo(x, sr) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
