// 注目点エディタ（モーダル）。
// - 点をドラッグで移動 / 空いている所をクリックで追加（最大 MAX 個）
// - 番号順 = 優先順。「1番にする」で先頭へ。1番は寄り・ズーム系演出の着地点になる
// - 円の大きさ = 寄りの範囲（小さいほど強く寄る）。スライダーかホイールで調整
// - 手で触った点は manual 扱い（緑）。「自動検出に戻す」で解析結果に戻せる

const MAX = 4;
const $ = (s) => document.querySelector(s);

let cur = null;      // 編集中の作品
let sel = 0;         // 選択中の点
let onChange = null;
let drag = null;

function stageRect() {
  return $('#fe-canvas').getBoundingClientRect();
}

function render() {
  const w = cur;
  const box = $('#fe-pts');
  const r = stageRect();
  const short = Math.min(r.width, r.height);
  box.innerHTML = '';
  w.focal.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = `fe-pt${i === sel ? ' sel' : ''}${f.manual ? ' manual' : ''}${i === 0 ? ' first' : ''}`;
    const d = Math.max(18, f.size * short);
    el.style.cssText = `left:${f.x * 100}%;top:${f.y * 100}%;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;z-index:${10 - i}`;
    el.innerHTML = `<span>${i + 1}</span>`;
    el.dataset.i = i;
    box.appendChild(el);
  });
  const f = w.focal[sel];
  $('#fe-sel').textContent = f ? String(sel + 1) : '-';
  $('#fe-size').disabled = !f;
  if (f) $('#fe-size').value = f.size;
  $('#fe-top').disabled = !f || sel === 0;
  $('#fe-del').disabled = !f || w.focal.length <= 1;
  $('#fe-count').textContent = `${w.focal.length} / ${MAX}`;
}

function changed() {
  render();
  onChange && onChange();
}

function toLocal(e) {
  const r = stageRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}

// つかめるのは「中心の番号付近」か「円の縁」だけ。大きな円の内側は新しい点の追加に使える
function hitTest(e) {
  const r = stageRect();
  const short = Math.min(r.width, r.height);
  let best = -1, bestD = Infinity;
  cur.focal.forEach((f, i) => {
    const dx = e.clientX - (r.left + f.x * r.width), dy = e.clientY - (r.top + f.y * r.height);
    const d = Math.hypot(dx, dy);
    const rad = Math.max(9, (f.size * short) / 2);
    const onCenter = d < 18, onRing = Math.abs(d - rad) < 7;
    const score = onCenter ? d : onRing ? 18 + Math.abs(d - rad) : Infinity;
    if (score < bestD) { bestD = score; best = i; }
  });
  return best;
}

function onDown(e) {
  if (!cur) return;
  const hit = hitTest(e);
  const p = toLocal(e);
  if (hit >= 0) {
    sel = hit;
    const f = cur.focal[sel];
    drag = { dx: f.x - p.x, dy: f.y - p.y, moved: false };
  } else {
    if (cur.focal.length >= MAX) { flash(`最大 ${MAX} 点までです`); return; }
    const size = cur.focal[sel]?.size ?? 0.25;
    cur.focal.push({ x: p.x, y: p.y, size, strength: 1, manual: true });
    sel = cur.focal.length - 1;
    drag = { dx: 0, dy: 0, moved: true };
  }
  $('#fe-stage').setPointerCapture(e.pointerId);
  e.preventDefault();
  changed();
}

function onMove(e) {
  if (!drag || !cur) return;
  const p = toLocal(e);
  const f = cur.focal[sel];
  f.x = Math.min(1, Math.max(0, p.x + drag.dx));
  f.y = Math.min(1, Math.max(0, p.y + drag.dy));
  f.manual = true;
  drag.moved = true;
  render();
}

function onUp() {
  if (drag && drag.moved) changed();
  drag = null;
}

function flash(msg) {
  const el = $('#fe-msg');
  el.textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { el.textContent = ''; }, 1800);
}

export function initFocalEditor() {
  const stage = $('#fe-stage');
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', (e) => {
    if (!cur || !cur.focal[sel]) return;
    e.preventDefault();
    const f = cur.focal[sel];
    f.size = Math.min(0.6, Math.max(0.06, f.size * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
    f.manual = true;
    changed();
  }, { passive: false });
  $('#fe-size').addEventListener('input', (e) => {
    const f = cur && cur.focal[sel];
    if (!f) return;
    f.size = Number(e.target.value);
    f.manual = true;
    changed();
  });
  $('#fe-top').addEventListener('click', () => {
    if (!cur || sel === 0) return;
    const [f] = cur.focal.splice(sel, 1);
    cur.focal.unshift(f);
    sel = 0;
    changed();
  });
  $('#fe-del').addEventListener('click', () => {
    if (!cur || cur.focal.length <= 1) return;
    cur.focal.splice(sel, 1);
    sel = Math.min(sel, cur.focal.length - 1);
    changed();
  });
  $('#fe-reset').addEventListener('click', () => {
    if (!cur) return;
    cur.focal = cur.autoFocal.map((f) => ({ ...f }));
    sel = 0;
    changed();
  });
  const close = () => { $('#fe').hidden = true; cur = null; };
  $('#fe-close').addEventListener('click', close);
  $('#fe').addEventListener('click', (e) => { if (e.target.id === 'fe') close(); });
  window.addEventListener('keydown', (e) => {
    if (!cur || e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' || e.key === 'Enter') close();
    else if (e.key === 'Delete' || e.key === 'Backspace') $('#fe-del').click();
    else if (/^[1-4]$/.test(e.key) && Number(e.key) <= cur.focal.length) { sel = Number(e.key) - 1; render(); }
  });
  window.addEventListener('resize', () => { if (cur) { fit(); render(); } });
}

// 画像を表示領域いっぱい（contain）に描く
function fit() {
  const cv = $('#fe-canvas');
  const area = $('#fe-area').getBoundingClientRect();
  const a = cur.aspect;
  const w = Math.min(area.width, area.height * a), h = w / a;
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.getContext('2d').drawImage(cur.source, 0, 0, cv.width, cv.height);
  const st = $('#fe-stage');
  st.style.width = `${w}px`;
  st.style.height = `${h}px`;
}

export function openFocalEditor(work, cb) {
  cur = work;
  sel = 0;
  onChange = cb;
  $('#fe-title').textContent = work.title;
  $('#fe').hidden = false;
  fit();
  render();
}
