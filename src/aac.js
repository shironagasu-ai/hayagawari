// AAC の設定情報まわり（DOM を使わない。Node の単体テストからも読む）

export const bytesOf = (b) => (ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));

/**
 * AAC の設定情報（decoderConfig.description）から AudioSpecificConfig（2〜5 バイト）を取り出す。
 * エンコーダーによっては（Apple の AAC など）esds の中身（ES_Descriptor）や esds の箱ごとで返すので、
 * 中の DecoderSpecificInfo（タグ 0x05）を探す。読めなければ null（→ muxer の推測値 AAC-LC を使う）
 */
export function aacSpecificConfig(desc) {
  if (!desc || !desc.byteLength) return null;
  let d = bytesOf(desc);
  const ok = (a) => a && a.length >= 2 && a.length <= 5 && a[0] >> 3 >= 1 && a[0] >> 3 <= 31 ? new Uint8Array(a) : null;
  // esds の箱ごと（大きさ 4 バイト + 'esds' + version/flags 4 バイト）
  if (d.length > 12 && String.fromCharCode(d[4], d[5], d[6], d[7]) === 'esds') d = d.subarray(12);
  if (d[0] !== 0x03) return ok(d); // 素の AudioSpecificConfig
  // 記述子を順に読む: タグ 1 バイト + 長さ（7 ビットずつ、最大 4 バイト）
  let i = 0;
  const head = () => {
    const tag = d[i++];
    let len = 0;
    for (let k = 0; k < 4 && i < d.length; k++) { const b = d[i++]; len = (len << 7) | (b & 0x7f); if (!(b & 0x80)) break; }
    return { tag, len };
  };
  try {
    if (head().tag !== 0x03) return null;
    const flags = d[i + 2];
    i += 3; // ES_ID・flags
    if (flags & 0x80) i += 2; // dependsOn_ES_ID
    if (flags & 0x40) i += 1 + d[i]; // URL
    if (flags & 0x20) i += 2; // OCR_ES_Id
    if (head().tag !== 0x04) return null;
    i += 13; // objectType・streamType・bufferSize・maxBitrate・avgBitrate
    const dsi = head();
    if (dsi.tag !== 0x05) return null;
    return ok(d.subarray(i, i + dsi.len));
  } catch {
    return null;
  }
}
