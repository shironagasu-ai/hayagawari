// AAC の設定情報の取り出し（src/aac.js）の単体テスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aacSpecificConfig } from '../../src/aac.js';

const f = (x) => { const r = aacSpecificConfig(x && new Uint8Array(x)); return r ? [...r] : null; };
const ES = [0x03, 0x19, 0, 0, 0, 0x04, 0x11, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 0x02, 0x11, 0x90, 0x06, 0x01, 0x02];
// iPhone 17 Pro の Safari が実際に返した形（長さを 4 バイトで書く ES_Descriptor。先頭 24 バイトは実物どおり）
const SAFARI = [0x03, 0x80, 0x80, 0x80, 0x22, 0, 0, 0, 0x04, 0x80, 0x80, 0x80, 0x14, 0x40, 0x14, 0, 0x18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x05, 0x80, 0x80, 0x80, 0x02, 0x11, 0x90, 0x06, 0x80, 0x80, 0x80, 0x01, 0x02];

test('素の AudioSpecificConfig はそのまま', () => assert.deepEqual(f([0x11, 0x90]), [0x11, 0x90]));
test('ES_Descriptor から取り出す', () => assert.deepEqual(f(ES), [0x11, 0x90]));
test('Safari が返した ES_Descriptor から取り出す', () => assert.deepEqual(f(SAFARI), [0x11, 0x90]));
test('esds の箱ごとから取り出す', () => assert.deepEqual(f([0, 0, 0, 39, 0x65, 0x73, 0x64, 0x73, 0, 0, 0, 0, ...ES]), [0x11, 0x90]));
test('読めないもの・空・長すぎるものは null', () => {
  assert.equal(f([0x03, 0x01]), null);
  assert.equal(f(null), null);
  assert.equal(f(new Array(30).fill(0x11)), null);
});
