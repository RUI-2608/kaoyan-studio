/* 考研备考台 · 平板适用版（核心：数据装载 / 进度存储 / 公式与 markdown / 题目卡）
 *
 * 数据用 .js（window.KY）而不是 fetch JSON —— 平板上直接双击 index.html（file://）也能跑；
 * 公式用本地 KaTeX，全程不联网。进度存 localStorage，可导出/导入 JSON。
 */
'use strict';

/* 把本页运行时的报错收集起来 —— 体检页与截图工具都会读它，出错不许静默 */
window.__errs = window.__errs || [];
window.addEventListener('error', (e) => window.__errs.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('Promise: ' + String(e.reason && e.reason.message || e.reason)));

/* ================= 工具 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
/* 答案是从哪一条通道来的，页面上说人话；「字母串」这条已经废弃，留着映射只为老数据可读 */
const ANS_SRC_LABEL = {
  'per-question': '本卷答案卷逐题标记', grid: '本卷答案卷卷首表', 'letter-run': '卷首字母串（已废弃）',
  'alt-grid': '第二来源答案表', 'alt-block': '第二来源逐题解析',
  'third-grid': '第三来源答案表', 'third-block': '第三来源逐题解析',
  solution: '解析正文', merged: '题干卷与解析卷合并', 'answer-key': '答案卷',
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => (n == null || n === '' ? '—' : String(n));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDur = (s) => `${pad2(Math.floor(s / 60))}:${pad2(Math.round(s) % 60)}`;
const uniq = (a) => [...new Set(a)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._h); toast._h = setTimeout(() => { t.hidden = true; }, ms);
}

/* ================= 数据装载 ================= */
const loaded = new Map();
function loadMod(key, src) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  return new Promise((res, rej) => {
    if (window.KY && window.KY[key] != null) { loaded.set(key, window.KY[key]); return res(window.KY[key]); }
    const s = document.createElement('script');
    s.src = src;
    s.onerror = () => rej(new Error('数据装载失败：' + src));
    s.onload = () => {
      const v = window.KY && window.KY[key];
      if (v == null) { rej(new Error('数据里没有这个键：' + key)); return; }
      loaded.set(key, v); res(v);
    };
    document.head.appendChild(s);
  });
}
const M = {
  mathIdx: () => loadMod('math/index', 'data/math/index.js'),
  math: (y) => loadMod('math/' + y, `data/math/${y}.js`),
  mathRaw: (y, kind) => loadMod(`mathraw/${y}-${kind}`, `data/math/raw/${y}-${kind}.js`),
  m2Idx: () => loadMod('math2/index', 'data/math2/index.js'),
  m2: (y) => loadMod(`math2/${y}`, `data/math2/${y}.js`),
  m2Raw: (y) => loadMod(`math2raw/${y}`, `data/math2/raw/${y}.js`),
  enIdx: () => loadMod('en/index', 'data/en/index.js'),
  en: (exam, y) => loadMod(`en/${exam}-${y}`, `data/en/${exam}-${y}.js`),
  pIdx: () => loadMod('p408/index', 'data/p408/index.js'),
  p408: (y) => loadMod(`p408/${y}`, `data/p408/${y}.js`),
  kIdx: () => loadMod('know/index', 'data/know/index.js'),
  know: (s) => loadMod(`know/${s}`, `data/know/${s}.js`),
};

/* ================= 进度存储 ================= */
const SKEY = 'kaoyan-studio-v1';
const blankState = () => ({ v: 1, ans: {}, star: {}, note: {}, seen: {}, wrong: {}, sess: {}, set: { font: 'm', warm: false } });
let S = blankState();
try { const raw = localStorage.getItem(SKEY); if (raw) S = Object.assign(blankState(), JSON.parse(raw)); }
catch (e) { console.warn('读不到本地进度：', e); }
S.ans = S.ans || {}; S.star = S.star || {}; S.note = S.note || {}; S.seen = S.seen || {}; S.wrong = S.wrong || {}; S.sess = S.sess || {}; S.set = Object.assign({ font: 'm', warm: false }, S.set || {});

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(SKEY, JSON.stringify(S)); }
    catch (e) { toast('进度没能存进本机（浏览器禁了本地存储），用「进度备份」导出'); }
  }, 180);
}
const stampNow = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

function grade(id, pick, right) {
  S.ans[id] = { pick, ok: right === true, at: stampNow() };
  if (right === false) S.wrong[id] = stampNow(); else delete S.wrong[id];
  save();
}
function seen(id) { S.seen[id] = stampNow(); save(); }
function toggleStar(id) { if (S.star[id]) delete S.star[id]; else S.star[id] = stampNow(); save(); return !!S.star[id]; }
function setNote(id, v) { if (v) S.note[id] = v; else delete S.note[id]; save(); }

/* ================= 公式 ================= */
let mathFail = 0;
function tex(src, display) {
  const s = String(src == null ? '' : src).trim();
  if (!s) return '';
  try {
    const K = (typeof katex !== 'undefined' && katex) || (window && window.katex);
    const html = K
      ? K.renderToString(s, { displayMode: !!display, throwOnError: false, strict: 'ignore', trust: false })
      : `<code>${esc(s)}</code>`;
    if (/katex-error/.test(html)) { mathFail++; return `<span class="math-fail" title="这条公式没渲染成功，保留原文">${esc(s)}</span>`; }
    return html;
  } catch (e) {
    mathFail++;
    return `<span class="math-fail" title="渲染失败：${esc(e && e.message)}">${esc((display ? '$$' : '$') + s)}</span>`;
  }
}

/* 先把数学摘出来，免得 markdown 把 \frac{}{} 里的星号下划线当强调语法 */
function pullMath(text) {
  const bag = [];
  const keep = (html) => { bag.push(html); return '\u0001' + (bag.length - 1) + '\u0002'; };
  let depth = 0;
  let out = '', i = 0;
  const s = String(text || '');
  const isEsc = (k) => { let n = 0; for (let j = k - 1; j >= 0 && s[j] === '\\'; j--) n++; return n % 2 === 1; };
  while (i < s.length) {
    const c = s[i];
    if (c === '`') { const close = s.indexOf('`', i + 1); if (close > i) { out += s.slice(i, close + 1); i = close + 1; continue; } }
    if (c === '\\' && (s[i + 1] === '[' || s[i + 1] === '(')) {
      const close = s.slice(i + 2).indexOf(s[i + 1] === '[' ? '\\]' : '\\)');
      if (close >= 0) { out += keep(tex(s.slice(i + 2, i + 2 + close), s[i + 1] === '[')); i += close + 4; continue; }
    }
    if (c === '$' && !isEsc(i)) {
      const two = s[i + 1] === '$';
      const mark = two ? '$$' : '$';
      const close = s.indexOf(mark, i + mark.length);
      if (close > i) { out += keep(tex(s.slice(i + mark.length, close), two)); i = close + mark.length; continue; }
    }
    out += c; i++;
  }
  return { text: out, restore: (h) => h.replace(/\u0001(\d+)\u0002/g, (x, k) => bag[+k]) };
}

function inline(text) {
  let t = esc(text);
  t = t.replace(/\{\{(\d{1,2})\}\}/g, (m, n) => `<span class="blank" title="原文空缺处">${n}</span>`);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g, (m, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)([^)]*)\)/g, (m, tx, src) => `<a href="${src}" target="_blank" rel="noreferrer">${tx}</a>`);
  t = t.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}

/* 极简 markdown：标题 / 列表 / 表格 / 引用 / 代码块 / 分隔线 / 段落
   渲染入口统一用 rich()：先摘公式 → 走块级语法 → 把公式 HTML 放回去 */
function mdBlocks(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [], rows = null, fence = null;
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushT = () => {
    if (!rows) return;
    html += '<table>' + rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('') + '</table>';
    rows = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (fence != null) { if (/^\s*```\s*$/.test(line)) { html += `<pre><code>${esc(fence.join('\n'))}</code></pre>`; fence = null; } else fence.push(raw); continue; }
    if (/^\s*```/.test(line)) { flushP(); flushL(); flushT(); fence = []; continue; }
    if (!line.trim()) { flushP(); flushL(); flushT(); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))) continue;
      flushP(); flushL(); (rows = rows || []).push(cells);
      continue;
    }
    flushT();
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { flushP(); flushL(); const lv = clamp(m[1].length + 1, 3, 5); html += `<h${lv}>${inline(m[2])}</h${lv}>`; continue; }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { flushP(); flushL(); html += '<hr class="rule">'; continue; }
    m = line.match(/^\s*[-*+·•]\s+(.*)$/);
    if (m) { flushP(); if (list !== 'ul') { flushL(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    m = line.match(/^\s*(\d{1,2})[.、)]\s+(.*)$/);
    if (m) { flushP(); if (list !== 'ol') { flushL(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[2])}</li>`; continue; }
    m = line.match(/^\s*>\s?(.*)$/);
    if (m) { flushP(); flushL(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    para.push(line.trim());
  }
  if (fence != null) html += `<pre><code>${esc(fence.join('\n'))}</code></pre>`;
  flushP(); flushL(); flushT();
  return html;
}
function rich(text) {
  const pm = pullMath(String(text == null ? '' : text));
  return pm.restore(mdBlocks(pm.text));
}
/* 一段话：把 PDF 换行折回来，并且不再套一层 <p>（英语原文排版用） */
function richInline(text) {
  const one = String(text == null ? '' : text).replace(/\n(?=\S)/g, ' ').replace(/\s+/g, ' ').trim();
  return rich(one).replace(/^<p>/, '').replace(/<\/p>$/, '');
}
const plainRich = rich;

/* ================= 卡片级组件 ================= */
function chip(text, cls) { return `<span class="chip ${cls || ''}">${esc(text)}</span>`; }
function flagChips(flags) {
  return (flags || []).map((f) => {
    const cls = /待核实|不一致|不完整|缺|乱码|错乱|过短|未随包|未抽出/.test(f) ? 'warn' : /取自|按|整题|选项/.test(f) ? 'gold' : 'dim';
    return `<span class="chip ${cls}" title="构建时打下的旗标">${esc(f)}</span>`;
  }).join('');
}
function starBtn(id) {
  const on = !!S.star[id];
  return `<button class="btn sm star" data-star="${esc(id)}" title="收藏这道题">${on ? '★ 已收藏' : '☆ 收藏'}</button>`;
}
function noteBox(id) {
  const v = S.note[id] || '';
  return `<textarea class="note-in" data-note="${esc(id)}" placeholder="写下你的思路、错因、要回看的话（自动保存在本机）">${esc(v)}</textarea>`;
}

