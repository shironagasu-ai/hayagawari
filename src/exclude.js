// 出さない演出（除外）。カテゴリごとに「抽選に出さない演出のキー」を持つ。
// 詳細設定の「出さない演出」と、演出カタログのカードの「出さない」ボタンから切り替える。
// 形は { variant: ['pixel', ...], decor: [...], ... }（空のカテゴリは持たない）

import { catalogKeys } from './catalog.js';
import { CATEGORIES, labelOf } from './fx/labels.js';

// 除外できるカテゴリ（演出カタログと同じ並び）
export const EXCLUDE_CATS = CATEGORIES.map((c) => c.key);

// カテゴリの演出のキー（スタイルのミックスは抽選されないので除く）
export const excludeKeys = (cat) => catalogKeys(cat).filter((k) => k !== 'MIX');

// 少なくとも残す数。背景の飾りは全部外してよい（飾りなし）、ほかは 1 つは残す
export const minKeep = (cat) => (cat === 'decor' ? 0 : 1);

// 知らないキーを落とし、残す数を守った形にする（URL・保存から読んだものに使う）
export function normalizeExclude(ex) {
  const out = {};
  if (!ex || typeof ex !== 'object') return out;
  for (const cat of EXCLUDE_CATS) {
    const all = excludeKeys(cat);
    const list = [...new Set(Array.isArray(ex[cat]) ? ex[cat] : [])].filter((k) => all.includes(k));
    const keep = all.length - list.length;
    if (keep < minKeep(cat)) list.splice(list.length - (minKeep(cat) - keep)); // 後から足したものを戻す
    if (list.length) out[cat] = list.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  }
  return out;
}

export const excludeCount = (ex) => Object.values(ex).reduce((n, l) => n + l.length, 0);
export const isExcluded = (ex, cat, key) => !!(ex[cat] && ex[cat].includes(key));

// 1 つ切り替えた新しい形を返す。残す数を割るときは null
export function toggleExclude(ex, cat, key) {
  const list = new Set(ex[cat] || []);
  if (list.has(key)) list.delete(key);
  else {
    if (excludeKeys(cat).length - list.size - 1 < minKeep(cat)) return null;
    list.add(key);
  }
  return normalizeExclude({ ...ex, [cat]: [...list] });
}

// URL: x-<カテゴリ>=キー.キー（例: x-variant=pixel.scan）
export function excludeFromParams(h) {
  const ex = {};
  for (const cat of EXCLUDE_CATS) {
    const v = h.get('x-' + cat);
    if (v) ex[cat] = v.split('.');
  }
  return normalizeExclude(ex);
}
export function excludeToParams(ex) {
  const out = {};
  for (const cat of EXCLUDE_CATS) if (ex[cat] && ex[cat].length) out['x-' + cat] = ex[cat].join('.');
  return out;
}

/**
 * 詳細設定の「出さない演出」。カテゴリごとに折りたたみ、演出の名前のボタンで切り替える。
 * @param {object} o
 * @param {HTMLElement} o.el 置き場所
 * @param {() => object} o.get 今の除外
 * @param {(cat: string, key: string) => void} o.toggle 1 つ切り替える（main 側で残す数の確認・反映をする）
 * @param {(cat: string, keys: string[]) => void} o.set カテゴリをまとめて置き換える（main 側で残す数の確認・反映をする）
 */
export function initExcludeUI({ el, get, toggle, set }) {
  el.innerHTML = CATEGORIES.map(({ key: cat, name }) => `
    <details class="ex-cat" data-cat="${cat}">
      <summary><span class="ex-name">${name}</span><span class="ex-count"></span></summary>
      <div class="ex-chips">${excludeKeys(cat).map((k) => {
        const [label, desc] = labelOf(cat, k);
        return `<button type="button" data-key="${k}" title="${desc}">${label}</button>`;
      }).join('')}</div>
      <div class="ex-tools"><button type="button" class="btn sm ex-all">全部出す</button><button type="button" class="btn sm ex-inv" title="出したいものだけを押して外してから反転すると、それだけが出るようになる">出す・出さないを反転</button><a class="cat-link" href="#catalog=${cat}">カタログで見る →</a></div>
    </details>`).join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.ex-chips button, .ex-all, .ex-inv');
    if (!b) return;
    const cat = b.closest('.ex-cat').dataset.cat;
    const cur = get()[cat] || [];
    if (b.classList.contains('ex-all')) set(cat, []);
    else if (b.classList.contains('ex-inv')) set(cat, excludeKeys(cat).filter((k) => !cur.includes(k)));
    else toggle(cat, b.dataset.key);
  });
  function sync() {
    const ex = get();
    for (const box of el.querySelectorAll('.ex-cat')) {
      const cat = box.dataset.cat;
      const n = (ex[cat] || []).length;
      box.querySelector('.ex-count').textContent = n ? `${n} 件を出さない` : 'すべて出す';
      box.classList.toggle('has-ex', n > 0);
      box.querySelector('.ex-all').disabled = n === 0;
      box.querySelector('.ex-inv').disabled = n < minKeep(cat); // 反転すると今外しているものだけが残る
      for (const b of box.querySelectorAll('.ex-chips button')) {
        const off = isExcluded(ex, cat, b.dataset.key);
        b.classList.toggle('off', off);
        b.setAttribute('aria-pressed', off ? 'false' : 'true');
      }
    }
  }
  sync();
  return { sync };
}
