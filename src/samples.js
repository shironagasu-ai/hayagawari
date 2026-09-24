// 「サンプルで試す」用のプロシージャル・イラスト。外部アセットを使わずキャンバスで描く。
// 注目点の検出を確かめられるよう、どれも描き込みの集中する箇所をはっきり作ってある。
import { createRng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function grad(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}

// 夕焼けの山並みと塔
function sunset(rng) {
  const [c, g] = canvas(1600, 1000);
  g.fillStyle = grad(g, 0, 0, 0, 1000, [[0, '#1b1446'], [0.45, '#b8406a'], [0.75, '#ffb36b'], [1, '#ffd9a0']]);
  g.fillRect(0, 0, 1600, 1000);
  const sx = 1050, sy = 520;
  g.fillStyle = '#fff1c9';
  g.beginPath(); g.arc(sx, sy, 170, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(184,64,106,0.8)';
  for (let i = 0; i < 6; i++) g.fillRect(sx - 180, sy + 30 + i * 26, 360, 6 + i * 2);
  const layers = ['#6b2a5a', '#43204a', '#261634'];
  layers.forEach((col, k) => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, 1000);
    for (let x = 0; x <= 1600; x += 40) g.lineTo(x, 640 + k * 90 + Math.sin(x * 0.004 + k * 2 + rng.next()) * 70 + rng.range(-20, 20));
    g.lineTo(1600, 1000); g.fill();
  });
  // 塔（細部が集中する注目点）
  g.fillStyle = '#12091c';
  const tx = 420;
  g.fillRect(tx - 18, 380, 36, 420);
  for (let i = 0; i < 9; i++) g.fillRect(tx - 40 + i * 2, 400 + i * 40, 80 - i * 4, 8);
  g.fillStyle = '#ffe28a';
  for (let i = 0; i < 12; i++) { g.fillRect(tx - 8, 420 + i * 30, 6, 10); g.fillRect(tx + 4, 430 + i * 30, 6, 10); }
  g.beginPath(); g.arc(tx, 370, 14, 0, Math.PI * 2); g.fill();
  return c;
}

// 顔（目の描き込みで注目点を作る）
function portrait(rng) {
  const [c, g] = canvas(1100, 1500);
  g.fillStyle = grad(g, 0, 0, 1100, 1500, [[0, '#0e2a3f'], [1, '#2b6c7c']]);
  g.fillRect(0, 0, 1100, 1500);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(160,230,255,${rng.range(0.05, 0.2)})`;
    g.lineWidth = rng.range(1, 4);
    g.beginPath(); g.arc(rng.range(0, 1100), rng.range(0, 1500), rng.range(40, 300), 0, Math.PI * 2); g.stroke();
  }
  // 髪
  g.fillStyle = '#f2d7e6';
  g.beginPath(); g.ellipse(550, 600, 360, 420, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe9d6';
  g.beginPath(); g.ellipse(550, 660, 270, 320, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d7a7c4'; g.lineWidth = 6;
  for (let i = 0; i < 26; i++) {
    const x = 300 + i * 20;
    g.beginPath(); g.moveTo(x, 260); g.quadraticCurveTo(x + rng.range(-60, 60), 420, x + rng.range(-30, 30), 560); g.stroke();
  }
  // 目
  for (const ex of [450, 650]) {
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(ex, 650, 62, 44, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = grad(g, ex, 610, ex, 700, [[0, '#1c2f7a'], [1, '#43c6d9']]);
    g.beginPath(); g.arc(ex, 655, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#081026';
    g.beginPath(); g.arc(ex, 658, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(ex - 12, 640, 10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(ex + 14, 668, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a1830'; g.lineWidth = 7;
    g.beginPath(); g.ellipse(ex, 650, 64, 46, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  }
  g.fillStyle = '#e46b8a';
  g.beginPath(); g.ellipse(550, 820, 40, 14, 0, 0, Math.PI); g.fill();
  // 服
  g.fillStyle = '#1b1b2f';
  g.beginPath(); g.moveTo(220, 1500); g.quadraticCurveTo(550, 900, 880, 1500); g.fill();
  return c;
}

// バウハウス風の幾何学
function geometric(rng) {
  const [c, g] = canvas(1200, 1200);
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 1200, 1200);
  const cols = ['#e2402c', '#1f4fa3', '#f2b705', '#111'];
  for (let i = 0; i < 10; i++) {
    g.fillStyle = cols[i % 4];
    const t = rng.int(0, 2);
    const x = rng.range(100, 1100), y = rng.range(100, 1100), s = rng.range(60, 260);
    if (t === 0) { g.beginPath(); g.arc(x, y, s / 2, 0, Math.PI * 2); g.fill(); }
    else if (t === 1) g.fillRect(x - s / 2, y - s / 2, s, s * 0.5);
    else { g.beginPath(); g.moveTo(x, y - s / 2); g.lineTo(x + s / 2, y + s / 2); g.lineTo(x - s / 2, y + s / 2); g.fill(); }
  }
  // 同心円のターゲット（注目点）
  for (let k = 12; k > 0; k--) {
    g.fillStyle = k % 2 ? '#111' : '#efe6d2';
    g.beginPath(); g.arc(760, 420, k * 14, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#111'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(0, 900); g.lineTo(1200, 700); g.stroke();
  return c;
}

// 夜の街
function city(rng) {
  const [c, g] = canvas(1000, 1500);
  g.fillStyle = grad(g, 0, 0, 0, 1500, [[0, '#050814'], [0.6, '#1a1f4a'], [1, '#3a2b6b']]);
  g.fillRect(0, 0, 1000, 1500);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(255,255,255,${rng.range(0.2, 0.9)})`; g.fillRect(rng.range(0, 1000), rng.range(0, 700), 2, 2); }
  g.fillStyle = '#fff6d8';
  g.beginPath(); g.arc(730, 300, 90, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#050814';
  g.beginPath(); g.arc(700, 280, 80, 0, Math.PI * 2); g.fill();
  let x = 0;
  while (x < 1000) {
    const w = rng.range(80, 180), h = rng.range(400, 900);
    g.fillStyle = '#0b0f26'; g.fillRect(x, 1500 - h, w - 6, h);
    for (let yy = 1500 - h + 20; yy < 1480; yy += 28) {
      for (let xx = x + 10; xx < x + w - 20; xx += 22) {
        if (rng.chance(0.45)) { g.fillStyle = rng.chance(0.8) ? '#ffd36e' : '#6ee7ff'; g.fillRect(xx, yy, 10, 14); }
      }
    }
    x += w;
  }
  // ネオン看板
  g.fillStyle = '#ff3d8b'; g.fillRect(260, 820, 180, 60);
  g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('NEON', 295, 865);
  return c;
}

// 花
function flower(rng) {
  const [c, g] = canvas(1400, 1400);
  g.fillStyle = grad(g, 0, 0, 1400, 1400, [[0, '#fef3e6'], [1, '#f7c9c9']]);
  g.fillRect(0, 0, 1400, 1400);
  const cx = 620, cy = 600;
  for (let layer = 0; layer < 3; layer++) {
    const n = 10 + layer * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + layer * 0.2;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = ['#e0435e', '#f0718a', '#ffb3c2'][layer];
      g.beginPath(); g.ellipse(0, -(260 - layer * 70), 60 - layer * 10, 150 - layer * 30, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  for (let i = 0; i < 160; i++) {
    const a = i * 2.39996, r = Math.sqrt(i) * 7;
    g.fillStyle = i % 3 ? '#f6c20b' : '#7a4a00';
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#3c7a3a'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(cx, cy + 200); g.quadraticCurveTo(cx + 150, 1100, cx + 60, 1400); g.stroke();
  return c;
}

// 波
function wave(rng) {
  const [c, g] = canvas(1600, 900);
  g.fillStyle = '#f4efe1'; g.fillRect(0, 0, 1600, 900);
  g.fillStyle = '#e84a2f';
  g.beginPath(); g.arc(1250, 220, 110, 0, Math.PI * 2); g.fill();
  const blues = ['#9ec9e2', '#4b8cc0', '#1f4f8a', '#0d2a55'];
  blues.forEach((col, k) => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, 900);
    for (let x = 0; x <= 1600; x += 10) g.lineTo(x, 420 + k * 110 + Math.sin(x * 0.008 + k) * 50 + Math.sin(x * 0.03 + k * 3) * 12);
    g.lineTo(1600, 900); g.fill();
  });
  // 大波の飛沫（注目点）
  g.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    const a = rng.range(Math.PI, Math.PI * 2), r = rng.range(40, 160);
    g.beginPath(); g.arc(420 + Math.cos(a) * r, 440 + Math.sin(a) * r * 0.8, rng.range(4, 16), 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#fff'; g.lineWidth = 8;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(420, 470, 60 + i * 22, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  return c;
}

export const SAMPLE_MAKERS = [
  ['Tower at Dusk', sunset], ['Aqua Gaze', portrait], ['Bauhaus Study', geometric],
  ['Neon District', city], ['Bloom', flower], ['Great Wave Remix', wave],
];

export function makeSamples(seed = 'samples') {
  const rng = createRng(seed);
  return SAMPLE_MAKERS.map(([name, fn]) => ({ name, canvas: fn(rng.fork(name)) }));
}
