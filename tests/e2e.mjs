// HAYAGAWARI E2E テスト。リポジトリルートで:  node tests/e2e.mjs
// 依存: playwright-core（または playwright）。Chromium 実体は CHROMIUM_PATH で指定可。
// 出力: tests/output/ にスクリーンショット（.gitignore 済み）
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests', 'output');
mkdirSync(outDir, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(8941, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fails = [];
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${name} ${extra}`); if (!cond) fails.push(name); };

async function openPage(viewport, hash = '') {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://localhost:8941/${hash}`, { waitUntil: 'networkidle' });
  return { page, errors };
}

// preserveDrawingBuffer=false なので、描画と読み出しは同じタスク内で行う
const renderStats = (page, t) => page.evaluate((t) => {
  window.__hg.renderAt(t);
  const gl = document.querySelector('#gl');
  const c = document.createElement('canvas');
  c.width = 96; c.height = 54;
  const g = c.getContext('2d');
  g.drawImage(gl, 0, 0, 96, 54);
  const d = g.getImageData(0, 0, 96, 54).data;
  let sum = 0, sum2 = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sum2 += v * v; }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}, t);


// 指定した区間の複数時刻をまとめて1枚のシートに（目視確認用）
async function sheet(page, file, rows) {
  const png = await page.evaluate((rows) => {
    const cols = Math.max(...rows.map((r) => r.times.length));
    const tw = 256, th = Math.round(256 * 9 / 16);
    const c = document.createElement('canvas');
    c.width = cols * tw; c.height = rows.length * (th + 16);
    const g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    g.font = '12px monospace';
    rows.forEach((row, j) => {
      window.__hg.setOpt(row.key, row.value);
      window.__hg.build();
      const f = window.__hg.state.film;
      const seg = f.segments[row.seg === 'last' ? f.segments.length - 1 : row.seg];
      row.times.forEach((ft, i) => {
        window.__hg.renderAt(seg.start + seg.dur * ft);
        const gl = document.querySelector('#gl');
        const a = gl.width / gl.height;
        const w = a > 16 / 9 ? tw - 2 : (th * a), h = a > 16 / 9 ? (tw - 2) / a : th;
        g.drawImage(gl, i * tw + (tw - w) / 2, j * (th + 16) + 16 + (th - h) / 2, w, h);
      });
      g.fillStyle = '#fff';
      g.fillText(`${row.value}  (${seg.kind}:${seg.variant || ''})`, 4, j * (th + 16) + 12);
    });
    return c.toDataURL('image/png');
  }, rows);
  writeFileSync(join(outDir, file), Buffer.from(png.split(',')[1], 'base64'));
}

// ---- 1. 16:9 でサンプル読み込み → 生成 → 各時刻の描画
{
  const { page, errors } = await openPage({ width: 1280, height: 720 }, '#seed=TEST-0001&style=auto');
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  const focal = await page.evaluate(() => window.__hg.state.works.map((w) => ({ name: w.name, f: w.focal.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2), +p.size.toFixed(2)]) })));
  console.log('focal points:', JSON.stringify(focal));
  // 顔サンプルは目（y≈0.43, x≈0.41/0.59）付近を検出してほしい
  const face = focal.find((w) => w.name === 'Aqua Gaze');
  const nearEyes = face.f.some(([x, y]) => Math.abs(y - 0.44) < 0.12 && Math.abs(x - 0.5) < 0.2);
  check('portrait sample: focal near eyes', nearEyes);

  await page.click('#go');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({ d: window.__hg.state.film.duration, theme: window.__hg.state.film.theme, bpm: window.__hg.state.film.bpm, sum: window.__hg.state.film.summary }));
  console.log('film:', info.theme, info.bpm, 'BPM', info.d.toFixed(1) + 's');
  console.log(info.sum.map((s) => `${s.kind}${s.variant ? ':' + s.variant : ''}${s.decor ? '[' + s.decor.join(',') + ']' : ''}→${s.out}`).join(' | '));
  check('film duration sane', info.d > 15 && info.d < 60);

  // 実時間再生で FPS を計測（ヘッドレス＋SwiftShader は GPU なしのため参考値）
  await page.keyboard.press('p');
  await page.waitForTimeout(3000);
  const perfText = await page.evaluate(() => document.querySelector('#perf').innerText);
  console.log('perf (headless swiftshader):', perfText.replace(/\n/g, ' | '));

  await page.evaluate(() => window.__hg.pause());
  const times = [0.3, 1.2, 2.2, 3.4];
  const segs = info.sum;
  for (const s of segs.slice(1)) times.push(s.start + 0.2, s.start + s.dur * 0.5, s.start + s.dur - 0.15);
  let k = 0;
  let blank = 0;
  for (const t of times) {
    const b = await renderStats(page, t);
    await page.evaluate((t) => window.__hg.renderAt(t), t);
    if (b.std < 2) blank++;
    if (k % 2 === 0) await page.screenshot({ path: join(outDir, `f169-${String(k).padStart(2, '0')}-${t.toFixed(2)}.png`) });
    k++;
  }
  check('frames have content (not flat)', blank <= 2, `flat=${blank}/${times.length}`);

  // JS 側の1フレーム描画コスト（コマンド発行のみ・GPU 待ちなし）
  const cost = await page.evaluate(() => {
    const f = window.__hg.state.film;
    const r = window.__hg.renderer;
    const N = 240;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) f.render(r, (i / N) * f.duration);
    r.gl.finish();
    return (performance.now() - t0) / N;
  });
  console.log('avg frame (incl. swiftshader raster):', cost.toFixed(2), 'ms');

  // 決定性: 同じシードで再生成すると同じ設計図
  const same = await page.evaluate(() => {
    const a = JSON.stringify(window.__hg.state.film.summary);
    window.__hg.build();
    return a === JSON.stringify(window.__hg.state.film.summary);
  });
  check('deterministic with same seed', same);
  // シード違いで設計が変わる
  const variety = await page.evaluate(() => {
    const seen = new Set();
    for (const s of ['A1', 'B2', 'C3', 'D4', 'E5', 'F6']) {
      window.__hg.setSeed(s);
      window.__hg.build();
      seen.add(JSON.stringify(window.__hg.state.film.summary.map((x) => [x.variant, x.out])) + window.__hg.state.film.theme);
    }
    return seen.size;
  });
  check('different seeds give different films', variety >= 5, `unique=${variety}/6`);

  // 全テーマ × 全区間をざっと描いてエラーがないこと
  const themes = ['NOIR', 'SWISS', 'POP', 'EDITORIAL', 'GLITCH'];
  for (const th of themes) {
    await page.evaluate((th) => { window.__hg.setOpt('style', th); window.__hg.setSeed('THEME-' + th); window.__hg.build(); }, th);
    const d = await page.evaluate(() => window.__hg.state.film.duration);
    for (let i = 0; i < 40; i++) await page.evaluate((t) => window.__hg.renderAt(t), (i / 40) * d);
    await page.evaluate((t) => window.__hg.renderAt(t), d * 0.37);
    await page.screenshot({ path: join(outDir, `theme-${th}.png`) });
  }
  // オープニング / エンディング / 振付を全種描いて確認
  const T = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
  const opKeys = ['montage', 'type', 'shutter', 'countdown', 'knockout'];
  const clKeys = ['grid', 'filmstrip', 'stack', 'knockout'];
  const vKeys = await page.evaluate(async () => (await import('/src/director.js')).VARIANT_KEYS());
  await page.evaluate(() => { window.__hg.setOpt('style', 'NOIR'); window.__hg.setSeed('COVER-01'); });
  await sheet(page, 'sheet-openers.png', opKeys.map((k) => ({ key: 'opener', value: k, seg: 0, times: T })));
  await sheet(page, 'sheet-closers.png', clKeys.map((k) => ({ key: 'closer', value: k, seg: 'last', times: T })));
  await sheet(page, 'sheet-variants.png', vKeys.map((k) => ({ key: 'variant', value: k, seg: 1, times: T })));
  const picked = await page.evaluate(() => { const f = window.__hg.state.film; return [f.opener, f.closer, f.segments[1].variant]; });
  check('opener/closer/variant overrides applied', picked[0] === 'knockout' && picked[1] === 'knockout' && picked[2] === vKeys[vKeys.length - 1], picked.join(','));
  check('9 choreographies available', vKeys.length >= 9, vKeys.join(','));
  // 自動選択に戻したとき、シードで全パターンが出うる
  const seen = await page.evaluate(() => {
    window.__hg.setOpt('opener', 'auto'); window.__hg.setOpt('closer', 'auto'); window.__hg.setOpt('variant', null);
    const o = new Set(), c = new Set(), v = new Set(), tr = new Set();
    for (let i = 0; i < 60; i++) {
      window.__hg.setSeed('S' + i); window.__hg.setOpt('style', 'auto'); window.__hg.build();
      const f = window.__hg.state.film;
      o.add(f.opener); c.add(f.closer);
      f.summary.forEach((s) => { if (s.variant) v.add(s.variant); if (s.out) tr.add(s.out); });
    }
    return { o: o.size, c: c.size, v: v.size, tr: [...tr].sort().join(',') };
  });
  console.log('auto coverage:', JSON.stringify(seen));
  check('auto picks all openers/closers', seen.o === 5 && seen.c === 4);
  check('auto uses new transitions', seen.tr.includes('spin') && seen.tr.includes('door'));

  // 注目点エディタ: 開く → ドラッグ移動 → 追加 → 1番にする → 削除 → 自動に戻す
  await page.evaluate(() => window.__hg.toEditor());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).opacity === '1', null, { timeout: 60000 });
  await page.click('#adv > summary');
  await page.click('.work:nth-child(2) .thumb');
  await page.waitForSelector('#fe:not([hidden])');
  const box = await page.locator('#fe-stage').boundingBox();
  const p0 = await page.evaluate(() => ({ ...window.__hg.state.works[1].focal[0] }));
  const px = box.x + p0.x * box.width, py = box.y + p0.y * box.height;
  await page.mouse.move(px, py); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8, { steps: 5 }); await page.mouse.up();
  let fw = await page.evaluate(() => window.__hg.state.works[1].focal.map((f) => ({ ...f })));
  check('focal drag moves point #1', Math.abs(fw[0].x - 0.2) < 0.03 && Math.abs(fw[0].y - 0.8) < 0.03 && fw[0].manual, JSON.stringify(fw[0]));
  const nBefore = fw.length;
  if (nBefore >= 4) await page.click('#fe-del');
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1);
  fw = await page.evaluate(() => window.__hg.state.works[1].focal.map((f) => ({ ...f })));
  const added = fw[fw.length - 1];
  check('click on empty area adds point', Math.abs(added.x - 0.9) < 0.03 && Math.abs(added.y - 0.1) < 0.03);
  await page.click('#fe-top');
  fw = await page.evaluate(() => window.__hg.state.works[1].focal.map((f) => ({ ...f })));
  check('make #1 moves selected to front', Math.abs(fw[0].x - 0.9) < 0.03);
  await page.fill('#fe-size', '0.1');
  await page.dispatchEvent('#fe-size', 'input');
  fw = await page.evaluate(() => window.__hg.state.works[1].focal.map((f) => ({ ...f })));
  check('size slider edits selected', Math.abs(fw[0].size - 0.1) < 1e-6);
  await page.screenshot({ path: join(outDir, 'focal-editor.png') });
  const nNow = fw.length;
  await page.click('#fe-del');
  fw = await page.evaluate(() => window.__hg.state.works[1].focal.length);
  check('delete removes point', fw === nNow - 1);
  await page.click('#fe-reset');
  const reset = await page.evaluate(() => { const w = window.__hg.state.works[1]; return JSON.stringify(w.focal) === JSON.stringify(w.autoFocal); });
  check('reset restores auto points', reset);
  await page.keyboard.press('Escape');
  check('editor closes', await page.evaluate(() => document.querySelector('#fe').hidden));

  check('no page errors (16:9)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 2. 9:16 縦型
{
  const { page, errors } = await openPage({ width: 540, height: 960 }, '#seed=VERT-0002&aspect=9:16');
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  await page.fill('#artist', 'SHIRONAGASU');
  await page.fill('#handle', '@shironagasu');
  await page.click('#go');
  await page.evaluate(() => window.__hg.pause());
  const segs = await page.evaluate(() => window.__hg.state.film.summary);
  const ts = [2.0, 3.2, segs[1].start + segs[1].dur * 0.6, segs[3].start + segs[3].dur * 0.7, segs[segs.length - 1].start + segs[segs.length - 1].dur * 0.8];
  for (const [i, t] of ts.entries()) {
    await page.evaluate((t) => window.__hg.renderAt(t), t);
    await page.screenshot({ path: join(outDir, `v916-${i}.png`) });
  }
  check('no page errors (9:16)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 3. 初回表示（詳細設定は閉じている）: 基本項目だけで再生でき、開くと詳細が出る
{
  const { page, errors } = await openPage({ width: 1280, height: 800 }, '#seed=EASY-0003&style=GLITCH&opener=type');
  const visible = () => page.evaluate(() => ['#artist', '#subline', '#handle', '#aspect', '#style', '#seed', '#opener', '#pace'].map((q) => document.querySelector(q).checkVisibility()));
  check('accordion closed by default', await page.evaluate(() => !document.querySelector('#adv').open && !window.__hg.state.advOpen));
  check('basic fields visible, advanced hidden', JSON.stringify(await visible()) === JSON.stringify([true, true, true, true, false, false, false, false]), JSON.stringify(await visible()));
  const sum = await page.textContent('#adv-sum');
  check('summary shows settings from URL while closed', sum.includes('GLITCH') && sum.includes('タイプ'), sum);
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  check('titles/focal hidden while closed', await page.evaluate(() => !document.querySelector('.work .meta').checkVisibility()));
  await page.click('.work:nth-child(1) .thumb');
  check('focal editor stays closed while accordion closed', await page.evaluate(() => document.querySelector('#fe').hidden));
  await page.fill('#artist', 'EASY');
  await page.fill('#subline', 'ILLUSTRATION WORKS');
  await page.fill('#handle', '@easy');
  await page.click('#go');
  await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => { const f = window.__hg.state.film; return { theme: f.theme, opener: f.opener, playing: window.__hg.state.playing, t: window.__hg.state.t }; });
  check('closed accordion settings still apply', f1.theme === 'GLITCH' && f1.opener === 'type', JSON.stringify(f1));
  check('plays', f1.playing && f1.t > 0);
  await page.click('#reroll');
  check('reroll gives new seed', (await page.evaluate(() => window.__hg.state.seed)) !== 'EASY-0003');
  await page.evaluate(() => window.__hg.toEditor());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).opacity === '1', null, { timeout: 60000 });
  await page.screenshot({ path: join(outDir, 'basic-closed.png'), fullPage: true });
  await page.click('#adv-reset');
  check('reset does not toggle accordion', await page.evaluate(() => !document.querySelector('#adv').open));
  check('reset hidden after reset', await page.evaluate(() => document.querySelector('#adv-reset').hidden));
  check('reset returns to おまかせ', (await page.textContent('#adv-sum')) === 'すべておまかせ' && (await page.evaluate(() => window.__hg.state.style)) === 'auto');
  await page.click('#adv > summary');
  check('open shows advanced fields', JSON.stringify(await visible()) === JSON.stringify([true, true, true, true, true, true, true, true]));
  check('open shows titles', await page.evaluate(() => document.querySelector('.work .meta').checkVisibility()));
  await page.screenshot({ path: join(outDir, 'basic-open.png'), fullPage: true });
  check('open state remembered', (await page.evaluate(() => localStorage.getItem('hg-adv'))) === '1');
  check('no page errors (basic)', errors.length === 0, errors.join('\n'));
  await page.close();
}

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
