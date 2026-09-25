// トップページ背景のループ動画を作る。リポジトリルートで:
//   FFMPEG=/path/to/ffmpeg node tools/make-hero.mjs [--images DIR] [--name NAME] [--sub SUBTITLE] [--seed SEED] [--style MIX]
// --images を省略すると内蔵サンプルで作る。画像はファイル名順に並ぶ（先頭の「1 」などの番号はタイトルから除く）。出力: assets/hero/hero-16x9.mp4, hero-9x16.mp4 と各ポスター画像（.jpg）
//
// HAYAGAWARI 自身の描画を 1 コマずつ JPEG で取り出し、ffmpeg で H.264（音声なし）に変換する。
// H.264 にするのは iPhone の Safari を含めて背景で自動再生できるようにするため（VP9 は iOS で再生できないことがある）。
// 依存: playwright-core（または playwright）と、libx264 入りの ffmpeg（環境変数 FFMPEG で指定可）
import { createServer } from 'http';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']);
  return acc;
}, []));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'hero');
mkdirSync(outDir, { recursive: true });
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;
const seed = (args.seed || 'HERO-01').toUpperCase();
const images = args.images
  ? readdirSync(args.images).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => resolve(args.images, f))
  : null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer((req, res) => {
  let p = join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(8943, r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// 背景用なので解像度は控えめ（仮想解像度 1920×1080 / 1080×1920 の 2/3）
const JOBS = [
  { aspect: '16:9', file: 'hero-16x9', scale: 2 / 3 },
  { aspect: '9:16', file: 'hero-9x16', scale: 2 / 3 },
];

for (const job of JOBS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(300000);
  await page.goto(`http://localhost:8943/#adv=1&seed=${encodeURIComponent(seed)}&aspect=${encodeURIComponent(job.aspect)}`, { waitUntil: 'networkidle' });
  if (images) {
    await page.setInputFiles('#file', images);
    await page.waitForFunction((n) => window.__hg.state.works.length === n, images.length);
    // 並び順用の先頭の番号（例: "1 No. 636.png"）はタイトルから外す
    await page.evaluate(() => window.__hg.state.works.forEach((w) => { w.title = w.title.replace(/^\d+\s+/, ''); }));
  } else {
    await page.evaluate(() => window.__hg.loadSamples());
    await page.waitForFunction(() => window.__hg.state.works.length >= 6);
  }
  await page.fill('#artist', args.name || '');
  await page.fill('#subline', args.sub || '');
  const info = await page.evaluate(({ style, scale }) => {
    const hg = window.__hg;
    if (style) hg.setOpt('style', style);
    hg.build();
    hg.resize(scale);
    const f = hg.state.film;
    const first = f.segments.find((s) => s.kind === 'work');
    return { d: f.duration, theme: f.theme, opener: f.opener, closer: f.closer, poster: first ? first.start + first.dur * 0.45 : f.duration / 3 };
  }, { style: args.style || 'MIX', scale: job.scale });
  const total = Math.ceil(info.d * FPS);
  console.log(`${job.file}: ${info.theme} / ${info.opener} → ${info.closer} / ${info.d.toFixed(1)}s (${total} frames)`);

  // 最後の 0.4 秒を黒へフェードしてループの継ぎ目を目立たなくする
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `fade=t=out:st=${(info.d - 0.4).toFixed(2)}:d=0.4`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', join(outDir, `${job.file}.mp4`),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
  const grab = (t, q) => page.evaluate(({ t, q }) => {
    window.__hg.renderAt(t);
    return document.querySelector('#gl').toDataURL('image/jpeg', q).split(',')[1];
  }, { t, q });
  for (let i = 0; i < total; i++) {
    const buf = Buffer.from(await grab(Math.min(info.d - 1e-4, i / FPS), 0.92), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`  ${i}/${total}\r`);
  }
  ff.stdin.end();
  await done;
  writeFileSync(join(outDir, `${job.file}.jpg`), Buffer.from(await grab(info.poster, 0.8), 'base64'));
  const mb = (statSync(join(outDir, `${job.file}.mp4`)).size / 1e6).toFixed(2);
  console.log(`  → assets/hero/${job.file}.mp4 (${mb} MB) + .jpg`);
  await page.close();
}

await browser.close();
server.close();
