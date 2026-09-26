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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
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
  // CI（GPU なし・ソフトウェア描画）は遅いので操作の待ち時間を長めに
  page.setDefaultTimeout(120000);
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
  const { page, errors } = await openPage({ width: 1280, height: 720 }, '#adv=1&seed=TEST-0001&style=auto');
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
    await page.evaluate((t) => { window.__hg.renderAt(t); window.__hg.sync(); }, t);
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
    window.__hg.sync(); // gl.finish は Chrome では完了を待たないので読み出しで同期
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
    await page.evaluate((d) => { for (let i = 0; i < 40; i++) window.__hg.renderAt((i / 40) * d); window.__hg.sync(); }, d);
    await page.evaluate((t) => { window.__hg.renderAt(t); window.__hg.sync(); }, d * 0.37);
    await page.screenshot({ path: join(outDir, `theme-${th}.png`) });
  }
  // オープニング / エンディング / 振付を全種描いて確認
  const T = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
  const opKeys = ['montage', 'type', 'shutter', 'countdown', 'knockout', 'slice', 'tunnel', 'boot'];
  const clKeys = ['grid', 'filmstrip', 'stack', 'knockout', 'orbit', 'curtain', 'rewind'];
  const vKeys = await page.evaluate(async () => (await import('/src/director.js')).VARIANT_KEYS());
  await page.evaluate(() => { window.__hg.setOpt('style', 'NOIR'); window.__hg.setSeed('COVER-01'); });
  await sheet(page, 'sheet-openers.png', opKeys.map((k) => ({ key: 'opener', value: k, seg: 0, times: T })));
  await sheet(page, 'sheet-closers.png', clKeys.map((k) => ({ key: 'closer', value: k, seg: 'last', times: T })));
  await sheet(page, 'sheet-variants.png', vKeys.map((k) => ({ key: 'variant', value: k, seg: 1, times: T })));
  const picked = await page.evaluate(() => { const f = window.__hg.state.film; return [f.opener, f.closer, f.segments[1].variant]; });
  check('opener/closer/variant overrides applied', picked[0] === opKeys[opKeys.length - 1] && picked[1] === clKeys[clKeys.length - 1] && picked[2] === vKeys[vKeys.length - 1], picked.join(','));
  check('9 choreographies available', vKeys.length >= 9, vKeys.join(','));

  // スタイル: 全9種とミックス（作品ごとに抽選・連続しない）
  const styleKeys = await page.evaluate(async () => (await import('/src/director.js')).STYLE_KEYS());
  check('9 styles', styleKeys.length === 9, styleKeys.join(','));
  await page.evaluate(() => window.__hg.setOpt('opener', 'auto'));
  await sheet(page, 'sheet-styles.png', styleKeys.map((k) => ({ key: 'style', value: k, seg: 1, times: [0.15, 0.45, 0.75, 0.95] })));
  const mix = await page.evaluate(() => {
    window.__hg.setOpt('style', 'MIX'); window.__hg.setSeed('MIX-01'); window.__hg.build();
    const f = window.__hg.state.film;
    return { theme: f.theme, base: f.baseTheme, works: f.workThemes, segThemes: f.summary.map((s) => s.theme) };
  });
  console.log('mix:', JSON.stringify(mix));
  check('MIX picks per-work styles', mix.theme === 'MIX' && new Set(mix.works).size >= 3 && mix.works.every((w, i) => i === 0 || w !== mix.works[i - 1]));
  check('MIX opener/closer use base style', mix.segThemes[0] === mix.base && mix.segThemes[mix.segThemes.length - 1] === mix.base);
  await sheet(page, 'sheet-mix.png', [1, 2, 3, 4, 5, 6].map((i) => ({ key: 'style', value: 'MIX', seg: i, times: [0.3, 0.6, 0.9] })));
  // サブタイトル未入力なら PORTFOLIO 等を自動で入れない
  const autoSub = await page.evaluate(() => {
    document.querySelector('#artist').value = 'SOMEONE'; document.querySelector('#subline').value = '';
    const bad = [];
    for (const op of ['montage', 'type', 'shutter', 'countdown', 'knockout', 'slice', 'tunnel', 'boot']) {
      window.__hg.setOpt('opener', op); window.__hg.setOpt('style', 'NOIR'); window.__hg.build();
      for (const k of window.__hg.tf.cache.keys()) if (/PORTFOLIO|SELECTED WORKS/.test(k.split('|')[0])) bad.push(op + ':' + k.split('|')[0]);
    }
    window.__hg.setOpt('opener', 'auto'); document.querySelector('#artist').value = '';
    return bad;
  });
  check('no auto subtitle when blank', autoSub.length === 0, autoSub.join(','));

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
  check('auto picks all openers/closers', seen.o === opKeys.length && seen.c === clKeys.length, `${seen.o}/${seen.c}`);
  check('auto uses new transitions', seen.tr.includes('spin') && seen.tr.includes('door'));

  // 注目点エディタ: 開く → ドラッグ移動 → 追加 → 1番にする → 削除 → 自動に戻す
  await page.evaluate(() => window.__hg.toEditor());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).opacity === '1', null, { timeout: 60000 });
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
  const { page, errors } = await openPage({ width: 540, height: 960 }, '#adv=1&seed=VERT-0002&aspect=9:16');
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  await page.fill('#artist', 'SHIRONAGASU');
  await page.fill('#handle', '@shironagasu');
  await page.click('#go');
  await page.evaluate(() => window.__hg.pause());
  const segs = await page.evaluate(() => window.__hg.state.film.summary);
  const ts = [2.0, 3.2, segs[1].start + segs[1].dur * 0.6, segs[3].start + segs[3].dur * 0.7, segs[segs.length - 1].start + segs[segs.length - 1].dur * 0.8];
  for (const [i, t] of ts.entries()) {
    await page.evaluate((t) => { window.__hg.renderAt(t); window.__hg.sync(); }, t);
    await page.screenshot({ path: join(outDir, `v916-${i}.png`) });
  }
  check('no page errors (9:16)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 3. 初回表示（詳細設定は閉じている＝すべておまかせ）
{
  const { page, errors } = await openPage({ width: 1280, height: 800 }, '#seed=EASY-0003&style=GLITCH&opener=type');
  const visible = () => page.evaluate(() => ['#artist', '#subline', '#handle', '#aspect', '#style', '#seed', '#opener', '#pace'].map((q) => document.querySelector(q).checkVisibility()));
  check('accordion closed by default', await page.evaluate(() => !document.querySelector('#adv').open && !window.__hg.state.advOpen));
  check('basic fields visible, advanced hidden', JSON.stringify(await visible()) === JSON.stringify([true, true, true, true, false, false, false, false]), JSON.stringify(await visible()));
  check('summary says off/auto', (await page.textContent('#adv-sum')).includes('おまかせ') && await page.evaluate(() => document.querySelector('#adv-reset').hidden));
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  check('titles/focal hidden while closed', await page.evaluate(() => !document.querySelector('.work .meta').checkVisibility()));
  await page.click('.work:nth-child(1) .thumb');
  check('focal editor stays closed while accordion closed', await page.evaluate(() => document.querySelector('#fe').hidden));
  // 手動の注目点・タイトルを仕込んでおく（閉じている間は無視されるはず）
  await page.evaluate(() => { const w = window.__hg.state.works[0]; w.title = 'MANUAL TITLE'; w.focal = [{ x: 0.05, y: 0.05, size: 0.1, strength: 1, manual: true }]; });
  await page.fill('#artist', 'EASY');
  await page.fill('#subline', 'ILLUSTRATION WORKS');
  await page.fill('#handle', '@easy');
  const films = [];
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => window.__hg.toEditor());
    await page.click('#go');
    films.push(await page.evaluate(() => { const f = window.__hg.state.film; const w = f.segments[1].work; return { seed: window.__hg.state.seed, theme: f.theme, opener: f.opener, title: w.title, fx: w.focal[0].x, playing: window.__hg.state.playing }; }));
  }
  console.log('closed films:', JSON.stringify(films.map((f) => [f.seed, f.theme, f.opener])));
  // ランダム抽選なので偶然一致することはある（1回あたり約 1/72）。4回すべて一致しなければ「指定を無視している」と判定
  check('closed ignores style/opener from URL', !films.every((f) => f.theme === 'GLITCH' && f.opener === 'type'));
  check('closed: new seed every play', new Set(films.map((f) => f.seed)).size === 4 && !films.some((f) => f.seed === 'EASY-0003'));
  check('closed ignores manual title/focal', films.every((f) => f.title !== 'MANUAL TITLE' && f.fx !== 0.05));
  check('plays', films[3].playing);
  check('closed URL omits advanced params', await page.evaluate(() => !location.hash.includes('style=') && !location.hash.includes('adv=')));
  await page.evaluate(() => window.__hg.toEditor());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).opacity === '1', null, { timeout: 60000 });
  await page.screenshot({ path: join(outDir, 'basic-closed.png'), fullPage: true });
  // 開くと設定（URL の GLITCH / タイプ）・手動タイトル・注目点・シードが反映される
  await page.click('#adv > summary');
  // toggle イベントは非同期（ブラウザによって発火が 1 タスク遅れる）
  await page.waitForFunction(() => window.__hg.state.advOpen);
  check('open shows advanced fields', JSON.stringify(await visible()) === JSON.stringify([true, true, true, true, true, true, true, true]));
  const sumOpen = await page.textContent('#adv-sum');
  check('open summary lists applied settings', sumOpen.includes('GLITCH') && sumOpen.includes('タイプ'), sumOpen);
  await page.evaluate(() => window.__hg.setSeed('OPEN-0004'));
  await page.click('#go');
  const fo = await page.evaluate(() => { const f = window.__hg.state.film; const w = f.segments[1].work; return { seed: window.__hg.state.seed, theme: f.theme, opener: f.opener, title: w.title, fx: w.focal[0].x }; });
  check('open applies settings, seed, manual title/focal', fo.theme === 'GLITCH' && fo.opener === 'type' && fo.seed === 'OPEN-0004' && fo.title === 'MANUAL TITLE' && fo.fx === 0.05, JSON.stringify(fo));
  check('open URL carries adv=1', await page.evaluate(() => location.hash.includes('adv=1') && location.hash.includes('style=GLITCH')));
  await page.evaluate(() => window.__hg.toEditor());
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#editor')).opacity === '1', null, { timeout: 60000 });
  await page.click('#adv-reset');
  check('reset returns to おまかせ', (await page.evaluate(() => window.__hg.state.style)) === 'auto' && await page.evaluate(() => document.querySelector('#adv').open));
  await page.screenshot({ path: join(outDir, 'basic-open.png'), fullPage: true });
  check('open state remembered', (await page.evaluate(() => localStorage.getItem('hg-adv'))) === '1');
  check('no page errors (basic)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 4. 書き出し（1コマずつ・WebCodecs）: 実際に MP4 を作り、<video> で再生できるか確認
{
  // adv=1: 詳細設定を開いた状態＝指定のシードを使う（閉じているとシードが毎回ランダムになり結果がぶれる）
  const { page, errors } = await openPage({ width: 1280, height: 720 }, '#adv=1&seed=EXPORT-01');
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  await page.evaluate(() => { window.__hg.state.works.splice(2); window.__hg.state.film = null; });
  await page.click('#go');
  await page.waitForTimeout(300);
  await page.click('#export');
  await page.click('#xp-fps button[data-v="30"]');
  await page.waitForFunction(() => !document.querySelector('#xp-info').textContent.includes('判定中'));
  const info = await page.textContent('#xp-info');
  console.log('export info:', info.replace(/\s+/g, ' ').slice(0, 160));
  check('frame export available', info.includes('1コマずつ'), info);
  check('export includes audio by default', /音声: .*(AAC|Opus)/.test(info), info);
  const vcodec = (info.match(/1コマずつ（(\S+) \/ MP4）/) || [])[1], acodec = (info.match(/音声: [^（]*（(\S+)）/) || [])[1];
  console.log(`codecs: video=${vcodec} audio=${acodec}`);
  // CI の Google Chrome では H.264 で書き出せるはず（AAC は Linux 版では無いことがあるので記録のみ）
  if (process.env.EXPECT_H264 === '1') check('H.264 available in Google Chrome', vcodec === 'H.264', `video=${vcodec} audio=${acodec}`);
  // GPU なし（ソフトウェア描画＋ソフトウェア VP9）だと 1 秒あたり約 2 コマなので、先頭 3 秒だけ書き出す
  await page.evaluate(() => { window.__hg.xp.limit = 3; });
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#xp-start')]);
  const file = join(outDir, 'export.mp4');
  await dl.saveAs(file);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const size = statSync(file).size;
  console.log(`exported ${dl.suggestedFilename()} ${(size / 1e6).toFixed(2)}MB in ${secs}s (swiftshader)`);
  check('mp4 file written', size > 50_000 && dl.suggestedFilename().endsWith('.mp4'));
  const head = readFileSync(file).subarray(4, 8).toString('latin1');
  check('mp4 starts with ftyp', head === 'ftyp', head);
  const bytes = readFileSync(file).toString('latin1');
  check('mp4 has an audio track', bytes.includes('soun') && (bytes.includes('Opus') || bytes.includes('mp4a')));
  const aud = await page.evaluate(async () => {
    const buf = await window.__hg.state.lastExport.blob.arrayBuffer();
    const ctx = new OfflineAudioContext(2, 48000, 48000);
    const ab = await ctx.decodeAudioData(buf);
    const d = ab.getChannelData(0);
    let sum = 0, peak = 0;
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    return { dur: ab.duration, rms: Math.sqrt(sum / d.length), peak };
  });
  console.log('audio:', JSON.stringify(aud));
  check('exported audio decodes with sound', Math.abs(aud.dur - 3) < 0.15 && aud.rms > 0.01 && aud.peak <= 1.0, JSON.stringify(aud));
  const v = await page.evaluate(async () => {
    const blob = window.__hg.state.lastExport.blob;
    const film = window.__hg.state.film;
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    await new Promise((r, j) => { video.onloadedmetadata = r; video.onerror = () => j(new Error('video error ' + (video.error && video.error.message))); });
    const stats = [];
    const expDur = Math.min(window.__hg.xp.limit || 1e9, film.duration);
    for (const ft of [0.2, 0.5, 0.8]) {
      video.currentTime = expDur * ft;
      await new Promise((r) => { video.onseeked = r; });
      // seeked 直後はデコード済みのコマがまだ無いことがある（Chrome の H.264 など）。
      // 表示されるまで待ち、何も描けなかった（全画素が透明）なら少し待って取り直す
      if (video.requestVideoFrameCallback) await Promise.race([new Promise((r) => video.requestVideoFrameCallback(r)), new Promise((r) => setTimeout(r, 500))]);
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const g = c.getContext('2d');
      let d;
      for (let tries = 0; tries < 10; tries++) {
        g.clearRect(0, 0, 64, 36);
        g.drawImage(video, 0, 0, 64, 36);
        d = g.getImageData(0, 0, 64, 36).data;
        let drawn = false;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { drawn = true; break; }
        if (drawn) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      let sum = 0, sum2 = 0;
      for (let i = 0; i < d.length; i += 4) { const y = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += y; sum2 += y * y; }
      const n = d.length / 4, m = sum / n;
      stats.push(Math.sqrt(Math.max(0, sum2 / n - m * m)));
    }
    return { w: video.videoWidth, h: video.videoHeight, dur: video.duration, expected: Math.min(window.__hg.xp.limit || 1e9, film.duration), stats };
  });
  console.log('playback:', JSON.stringify(v));
  check('exported video plays at 1920x1080', v.w === 1920 && v.h === 1080);
  check('exported duration matches film', Math.abs(v.dur - v.expected) < 0.2, `${v.dur} vs ${v.expected}`);
  check('exported frames have content', v.stats.every((x) => x > 3), JSON.stringify(v.stats));
  check('renderer restored after export', await page.evaluate(() => window.__hg.renderer.bw < 1920 && !document.body.classList.contains('exporting')));
  // 楽譜: モードごとの音数・決定性
  const sc = await page.evaluate(async () => {
    const { buildScore } = await import('/src/audio.js');
    const f = window.__hg.state.film, seed = window.__hg.state.seed;
    const full = buildScore(f, seed, 'full'), sfx = buildScore(f, seed, 'sfx'), off = buildScore(f, seed, 'off');
    const again = buildScore(f, seed, 'full');
    return { full: full.notes.length, sfx: sfx.notes.length, off: off.notes.length, beat: full.notes.filter((n) => n.layer === 'beat').length, same: JSON.stringify(full.notes) === JSON.stringify(again.notes) };
  });
  console.log('score:', JSON.stringify(sc));
  check('score: full > sfx > off=0, deterministic', sc.full > sc.sfx && sc.sfx > 0 && sc.off === 0 && sc.beat > 0 && sc.same);
  // 音声なしで書き出すと音声トラックが無い
  await page.click('#export');
  await page.click('#xp-snd button[data-v="off"]');
  await page.waitForFunction(() => !document.querySelector('#xp-info').textContent.includes('判定中'));
  await page.evaluate(() => { window.__hg.xp.limit = 1; });
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#xp-start')]);
  const file2 = join(outDir, 'export-mute.mp4');
  await dl2.saveAs(file2);
  check('sound off → no audio track', !readFileSync(file2).toString('latin1').includes('soun'));
  // プレーヤーの音ボタンが 3 段階で切り替わる
  const labels = [];
  for (let k = 0; k < 3; k++) { await page.click('#snd'); labels.push(await page.textContent('#snd')); }
  check('sound button cycles', labels.join('|').includes('効果音のみ') && labels.join('|').includes('なし') && labels.join('|').includes('ビート'), labels.join('|'));
  // 中止できること
  await page.click('#export');
  await page.waitForFunction(() => !document.querySelector('#xp-info').textContent.includes('判定中'));
  await page.click('#xp-start');
  await page.waitForTimeout(1500);
  await page.click('#xp-close');
  await page.waitForFunction(() => !window.__hg.xp.running, null, { timeout: 30000 });
  check('export can be cancelled', await page.evaluate(() => document.querySelector('#xp').hidden && !document.body.classList.contains('exporting')));
  check('no page errors (export)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 5. 別ページから戻ったとき、ブラウザのフォーム復元で作品タイトルが作家名欄などにずれて入らない
{
  const { page, errors } = await openPage({ width: 1280, height: 720 });
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  await page.goto('http://localhost:8941/elsewhere'); // 404 ページ（別ドキュメントなら何でもよい）
  errors.length = 0;
  await page.goBack({ waitUntil: 'networkidle' });
  const vals = await page.evaluate(() => ['#artist', '#subline', '#handle'].map((id) => document.querySelector(id).value));
  check('no form restore shift after back navigation', vals.every((v) => v === ''), JSON.stringify(vals));
  check('no page errors (back navigation)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 7. 作業の保存: 読み込み直しても画像・入力・設定・手直しが戻る。「すべて外す」で保存も消える
{
  const { page, errors } = await openPage({ width: 1280, height: 800 });
  await page.evaluate(() => window.__hg.loadSamples());
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  await page.fill('#artist', 'SAVE TEST');
  await page.evaluate(() => window.__hg.setAdvOpen(true));
  await page.fill('#works .work:nth-child(2) input.title', 'Renamed Work');
  await page.click('#pace button[data-v="tight"]');
  const before = await page.evaluate(() => {
    const s = window.__hg.state;
    const w = s.works[0];
    w.focal = [{ x: 0.2, y: 0.3, size: 0.2, strength: 1, manual: true }]; // 注目点を手で直した想定
    s.film = null;
    return { seed: s.seed, names: s.works.map((x) => x.name) };
  });
  await page.fill('#subline', 'SUB'); // 入力で保存が走る
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 60000 });
  const after = await page.evaluate(() => {
    const s = window.__hg.state;
    return {
      artist: document.querySelector('#artist').value, subline: document.querySelector('#subline').value,
      seed: s.seed, pace: s.pace, names: s.works.map((x) => x.name), title: s.works[1].title,
      focal: s.works[0].focal, autoTitle: s.works[1].autoTitle,
    };
  });
  check('restore: images come back in order', JSON.stringify(after.names) === JSON.stringify(before.names), after.names.join(','));
  check('restore: text fields', after.artist === 'SAVE TEST' && after.subline === 'SUB', `${after.artist}/${after.subline}`);
  check('restore: seed and advanced settings', after.seed === before.seed && after.pace === 'tight', `${after.seed} ${after.pace}`);
  check('restore: edited title and manual focal', after.title === 'Renamed Work' && after.autoTitle !== 'Renamed Work' && after.focal.length === 1 && after.focal[0].manual && Math.abs(after.focal[0].x - 0.2) < 1e-6, JSON.stringify([after.title, after.focal]));
  // 1 枚外すと、その画像も保存から消える
  await page.click('#works .work:nth-child(1) .x');
  await page.waitForTimeout(1200);
  const imgCount = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('hayagawari');
    r.onsuccess = () => { const q = r.result.transaction('img').objectStore('img').count(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
  }));
  check('removing a work deletes its stored image', (await imgCount()) === 5);
  page.once('dialog', (d) => d.accept());
  await page.click('#clear-works');
  await page.waitForTimeout(1200);
  check('clear all deletes stored images', (await imgCount()) === 0 && await page.evaluate(() => window.__hg.state.works.length === 0 && document.querySelector('#works-bar').hidden));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('after clear: nothing restored, fields kept', await page.evaluate(() => window.__hg.state.works.length === 0 && document.querySelector('#artist').value === 'SAVE TEST'));
  check('no page errors (save/restore)', errors.length === 0, errors.join('\n'));
  await page.close();
}

// ---- 6. トップ: 作例動画・ロゴ・ボタン
for (const [name, vp, file] of [['desktop', { width: 1440, height: 900 }, 'hero-16x9'], ['phone', { width: 390, height: 844 }, 'hero-9x16']]) {
  const { page, errors } = await openPage(vp);
  const hero = await page.evaluate(() => {
    const v = document.querySelector('#hero-video');
    const logo = document.querySelector('#logo');
    return {
      src: v.src.split('/').pop(), poster: v.poster.split('/').pop(), muted: v.muted, inline: v.playsInline,
      h264: v.canPlayType('video/mp4; codecs="avc1.640028"') !== '',
      logoW: logo.querySelector('.lg.top').getBoundingClientRect().right, viewW: innerWidth,
      layers: logo.querySelectorAll('.lg i').length,
    };
  });
  check(`hero video picks ${file} (${name})`, hero.src === `${file}.mp4` && hero.poster === `${file}.jpg` && hero.muted && hero.inline, JSON.stringify(hero));
  check(`logo built and fits (${name})`, hero.layers === 20 && hero.logoW <= hero.viewW, `${hero.logoW.toFixed(0)} <= ${hero.viewW}`);
  const poster = await page.evaluate((f) => fetch(`assets/hero/${f}.jpg`).then((r) => r.ok && r.headers.get('content-type')), file);
  check(`hero poster served (${name})`, poster === 'image/jpeg', String(poster));
  // H.264 を再生できるブラウザ（一般配布の Chrome 等）では実際に動いていること、映像の再生中は止まること
  if (hero.h264) {
    await page.waitForFunction(() => document.querySelector('#hero-video').currentTime > 0.5, null, { timeout: 30000 });
    check(`hero video plays (${name})`, true);
    await page.click('#hero-sample');
    await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
    await page.click('#go');
    await page.waitForTimeout(500);
    check(`hero video pauses during playback (${name})`, await page.evaluate(() => document.querySelector('#hero-video').paused));
  } else {
    console.log(`(hero video playback skipped: no H.264 in this browser)`);
    await page.click('#hero-sample');
    await page.waitForFunction(() => window.__hg.state.works.length === 6, null, { timeout: 30000 });
  }
  if (name === 'desktop') {
    const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const ver = await page.evaluate(() => ({ kicker: document.querySelector('#ver-kicker').textContent, footer: document.querySelector('#ver').textContent, v: window.__hg.version }));
    check('version shown on site', ver.v === pkgVersion && ver.kicker === `v${pkgVersion}` && ver.footer.includes(`v${pkgVersion}`) && ver.footer.includes('更新履歴'), JSON.stringify(ver));
  }
  check(`hero sample button loads samples (${name})`, await page.evaluate(() => window.__hg.state.works.length === 6));
  await page.evaluate(() => { document.querySelector('#editor').scrollTop = 0; });
  await page.screenshot({ path: join(outDir, `hero-${name}.png`) });
  check(`no page errors (hero ${name})`, errors.length === 0, errors.join('\n'));
  await page.close();
}

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
