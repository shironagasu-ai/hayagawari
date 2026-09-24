// HAYAGAWARI E2E テスト。リポジトリルートで:  node tests/e2e.mjs
// 依存: playwright-core（または playwright）。Chromium 実体は CHROMIUM_PATH で指定可。
// 出力: tests/output/ にスクリーンショット（.gitignore 済み）
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs';
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

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
