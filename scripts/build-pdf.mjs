/* PDF 套件：知识手册 + 数学试卷 + 408 试卷（A4，可直接导入 GoodNotes/Notability 手写）
 *
 * 渲染链：站点同一份 app.js 的 rich()（用 vm 跑，保证 PDF 和屏幕上看到的公式一模一样）
 *        → 打印 CSS → 无头 Edge --print-to-pdf。
 * 为什么不用 LibreOffice：它的 HTML 导入不认 KaTeX 的 span 结构，公式会掉。
 *
 * 用法：node scripts/build-pdf.mjs [手册|数学|408|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import katex from 'katex';
import { loadJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = path.join(ROOT, '.tmp/pdf');
const OUT = path.join(ROOT, 'pdf');
const D = path.join(ROOT, 'web/data');

/* ---------- 借站点自己的渲染器 ---------- */
const src = fs.readFileSync(path.join(ROOT, 'web/app.js'), 'utf8');
const sandbox = {
  window: { katex, addEventListener() { }, KY: {} },
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, createElement: () => ({ style: {} }) },
  localStorage: { getItem: () => null, setItem: () => { } },
  console, setTimeout, clearTimeout, CSS: { escape: (s) => s },
};
vm.createContext(sandbox);
vm.runInContext(src.replace(/^\s*'use strict';/m, ''), sandbox);
const rich = (t) => sandbox.rich(t);
const richInline = (t) => sandbox.richInline(t);
/* app.js 顶层的 const 不挂在 sandbox 对象上（V8 的全局词法作用域），要用 runInContext 取 */
const ANS_SRC_LABEL = vm.runInContext('typeof ANS_SRC_LABEL === "undefined" ? {} : ANS_SRC_LABEL', sandbox);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 打印样式 ---------- */
const CSS = `
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font: 11.5pt/1.72 "Songti SC","Source Han Serif SC","Noto Serif CJK SC",Georgia,"Microsoft YaHei",serif; color:#151722; margin:0; }
h1 { font-size: 20pt; letter-spacing: .06em; margin: 0 0 2mm; }
h1 small { font-size: 10pt; color:#7a5f21; font-weight: 400; letter-spacing:.14em; }
.lead { color:#4a4a55; font-size: 9.5pt; margin: 0 0 6mm; border-bottom: 2px solid #c8a55b; padding-bottom: 3mm; }
h2 { font-size: 14pt; margin: 8mm 0 3mm; padding-left: 2.5mm; border-left: 4px solid #c8a55b; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; color:#3c3320; page-break-after: avoid; }
h4 { font-size: 11pt; margin: 4mm 0 1.5mm; }
.card { page-break-inside: avoid; margin-bottom: 6mm; }
.card .tags { font-size: 8.5pt; color:#7a6a48; letter-spacing:.05em; margin-bottom:1.5mm; }
.card .tags b { color:#7a5f21; }
.q { page-break-inside: avoid; margin: 0 0 5mm; }
.q .head { font-size: 9.5pt; color:#7a5f21; letter-spacing:.06em; margin-bottom:1mm; }
.stem { white-space: pre-wrap; }
.opts { list-style:none; margin:2mm 0 0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:1.5mm 6mm; }
.opts.one { grid-template-columns:1fr; }
.opts li { font-size: 10.5pt; }
.opts b { display:inline-block; width:6mm; color:#7a5f21; }
.gap { border-bottom: 1px dotted #9a9aa5; height: 9mm; margin-top: 2mm; }
.gap.tall { height: 34mm; }
.flags { font-size: 8pt; color:#9a4b28; margin-top:1mm; }
.answers { page-break-before: always; }
.ans-line { font-size: 10pt; margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 1px solid #e6ddc8; }
.ans-line b { color:#1d4f36; }
.expl { font-size: 10pt; color:#22252e; margin-top: 1mm; }
.expl table, .md table { border-collapse: collapse; font-size: 9.5pt; margin: 2mm 0; }
.md th, .md td, .expl th, .expl td { border: 1px solid #c9bfa8; padding: 1mm 2mm; }
.md li, .expl li { margin: .8mm 0; }
.md pre { background:#f3efe4; padding: 2mm 3mm; font-size: 9pt; white-space: pre-wrap; }
.md code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9pt; }
footer { margin-top: 8mm; font-size: 8.5pt; color: #6a6a75; border-top: 1px solid #ddd3bd; padding-top: 2mm; }
.katex { font-size: 1.02em; }
.mathfail { color:#b23a2e; }
ul.blank { list-style:none; padding:0; margin:2mm 0 0; }
ul.blank li { border-bottom:1px solid #e6ddc8; height:8mm; }
`;

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
const KATEX_CSS = path.join(ROOT, 'web/vendor/katex/katex.min.css').replace(/\\/g, '/');
/* 科目名里有「（一 / 二）」这种带斜杠的写法，直接当文件名会跑出目录 */
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

function page(title, body, lead) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///${KATEX_CSS.replace(/^\//, '')}">
<style>${CSS}</style><title>${esc(title)}</title></head><body>
<h1>${esc(title)}${lead ? ` <small>${esc(lead)}</small>` : ''}</h1>${body}</body></html>`;
}

function toPdf(htmlFile, pdfFile) {
  const r = spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000',
    `--user-data-dir=${path.join(ROOT, '.tmp/edge-pdf')}`, `--print-to-pdf=${pdfFile}`, `file:///${htmlFile.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 180000 });
  return fs.existsSync(pdfFile) && fs.statSync(pdfFile).size > 2048;
}

/* ---------- 1. 知识手册 ---------- */
function buildHandbooks() {
  const ki = loadJS(path.join(D, 'know/index.js'));
  fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const made = [];
  for (const s of ki.subjects) {
    const doc = loadJS(path.join(D, `know/${s.subject}.js`));
    const byCh = new Map();
    for (const c of doc.cards) { if (!byCh.has(c.chapter)) byCh.set(c.chapter, []); byCh.get(c.chapter).push(c); }
    const body = [...byCh.entries()].map(([ch, cards]) => `<h2>${esc(ch)}</h2>` + cards.map((c) => `
      <section class="card md">
        <div class="tags">${c.freq === '高' ? '<b>高频</b> · ' : ''}${(c.tags || []).map(esc).join(' / ')}${(c.scope || []).length ? ' · 适用 ' + c.scope.map(esc).join('/') : ''} · 约 ${c.minutes} 分钟</div>
        <h3>${esc(c.title)}</h3>${rich(c.body)}
      </section>`).join('')).join('');
    const html = page(`${doc.label} · 知识手册`, `${body}
      <footer>${esc(doc.note)}<br>${esc(ki.caveat)}<br>来源：${esc(ki.source)}；构建于 ${esc(ki.built_at)}。公式渲染失败的条目会以红色等宽字体保留原文。</footer>`, `${doc.cards.length} 张卡片 · ${doc.weight}`);
    const base = path.join(TMP, `手册-${safe(s.label)}`);
    fs.writeFileSync(base + '.html', html, 'utf8');
    const pdf = path.join(OUT, `知识手册-${safe(s.label)}.pdf`);
    made.push({ name: `知识手册-${s.label}`, html: base + '.html', pdf });
  }
  return made;
}

/* ---------- 2. 数学试卷 ---------- */
function mathPaper(doc, withAnswers) {
  const secs = doc.sections.map((sec) => `<h2>${esc(sec.cn || '')}、${esc(sec.title || '')}${sec.score_total ? `（${sec.score_total} 分）` : ''}</h2>` +
    sec.questions.map((q, i) => {
      const opts = Object.entries(q.options || {});
      const isObj = opts.length >= 3;
      return `<div class="q" id="${esc(q.id)}">
        <div class="head">${esc(sec.cn || '')}(${q.local_no})　${q.score ? q.score + ' 分' : ''}${(q.flags || []).length ? '　' + esc((q.flags || []).join('；')) : ''}</div>
        <div class="stem md">${richInline(q.stem || '')}</div>
        ${isObj ? `<ul class="opts ${opts.length === 4 && opts.every(([, v]) => v.length < 40) ? '' : 'one'}">${opts.map(([k, v]) => `<li><b>${k}</b>${richInline(v)}</li>`).join('')}</ul><div class="gap"></div>`
        : `<ul class="blank"><li></li><li></li><li></li><li></li></ul>`}
      </div>`;
    }).join('')).join('');
  const answers = withAnswers ? `<div class="answers"><h2>答案与解析</h2>` + doc.sections.flatMap((sec) => sec.questions.map((q) => `
    <div class="ans-line md"><b>${esc(sec.cn || '')}(${q.local_no})</b>　答案：${esc(q.answer || '待核实')}
      ${q.analysis ? `<div class="expl">${rich(q.analysis)}</div>` : ''}
      ${(q.flags || []).length ? `<div class="flags">${esc((q.flags || []).join('；'))}</div>` : ''}</div>`)).join('') + '</div>' : '';
  return secs + answers;
}

function buildMath() {
  const mi = loadJS(path.join(D, 'math/index.js'));
  const made = [];
  for (const row of mi.years.filter((y) => y.tier !== 'C')) {
    const doc = loadJS(path.join(D, `math/${row.year}.js`));
    const title = `${row.year} 年数学（一）`;
    const html = page(title, mathPaper(doc, true), `${doc.audit.n} 题 · 分值合计 ${doc.audit.score_sum || '—'} · 含答案与解析`);
    const base = path.join(TMP, `数学-${row.year}`);
    fs.writeFileSync(base + '.html', html, 'utf8');
    made.push({ name: `数学-${row.year}`, html: base + '.html', pdf: path.join(OUT, `数学试卷-${title}.pdf`) });
  }
  return made;
}

/* ---------- 2b. 数学（二）试卷 ---------- */
function buildMath2() {
  const mi = loadJS(path.join(D, 'math2/index.js'));
  const made = [];
  for (const row of mi.years.filter((y) => y.usable !== false && y.tier !== 'C')) {
    const doc = loadJS(path.join(D, 'math2/' + row.year + '.js'));
    const title = row.year + ' 年数学（二）';
    const html = page(title, mathPaper(doc, true), doc.audit.n + ' 题 · 分值合计 ' + (doc.audit.score_sum || '—') + ' · 含答案与解析');
    const base = path.join(TMP, '数学二-' + row.year);
    fs.writeFileSync(base + '.html', html, 'utf8');
    made.push({ name: '数学二-' + row.year, html: base + '.html', pdf: path.join(OUT, '数学二试卷-' + title + '.pdf') });
  }
  return made;
}

/* ---------- 3. 408 试卷 ---------- */
function build408() {
  const pi = loadJS(path.join(D, 'p408/index.js'));
  const made = [];
  for (const row of pi.years.filter((y) => y.n)) {
    const doc = loadJS(path.join(D, `p408/${row.year}.js`));
    const choice = doc.questions.filter((q) => q.kind === 'choice');
    const essay = doc.questions.filter((q) => q.kind !== 'choice');
    const block = (list, prefix) => list.map((q, i) => `<div class="q">
      <div class="head">${prefix}${q.no}${q.subject ? '　[' + esc(q.subject) + ']' : ''}${(q.flags || []).length ? '　' + esc((q.flags || []).join('；')) : ''}</div>
      <div class="stem md">${richInline(q.stem || '')}</div>
      ${Object.keys(q.options || {}).length ? `<ul class="opts ${Object.keys(q.options).length === 4 && Object.values(q.options).every((v) => v.length < 42) ? '' : 'one'}">${Object.entries(q.options).map(([k, v]) => `<li><b>${k}</b>${richInline(v)}</li>`).join('')}</ul><div class="gap"></div>` : '<ul class="blank"><li></li><li></li><li></li></ul>'}
    </div>`).join('');
    const answers = `<div class="answers"><h2>答案与解析</h2>` + doc.questions.map((q) => `
      <div class="ans-line md"><b>${q.no}.</b>　答案：${esc(q.answer || '待核实')}${q.answer_src ? `（来源：${esc(ANS_SRC_LABEL[q.answer_src] || q.answer_src)}）` : ''}
        ${q.explanation ? `<div class="expl">${rich(q.explanation)}</div>` : ''}
        ${(q.flags || []).length ? `<div class="flags">${esc((q.flags || []).join('；'))}</div>` : ''}</div>`).join('') + '</div>';
    const html = page(`${row.year} 年 408 计算机学科专业基础`,
      `<h2>一、单项选择题（${choice.length} 小题，每小题 2 分，共 80 分）</h2>${block(choice, '')}
       <h2>二、综合应用题（${essay.length} 小题）</h2>${block(essay, '')}${answers}`,
      `${doc.audit.n} 题 · 含答案与解析`);
    const base = path.join(TMP, `408-${row.year}`);
    fs.writeFileSync(base + '.html', html, 'utf8');
    made.push({ name: `408-${row.year}`, html: base + '.html', pdf: path.join(OUT, `408试卷-${row.year} 年计算机学科专业基础.pdf`) });
  }
  return made;
}

/* ---------- 跑 ---------- */
const which = process.argv[2] || 'all';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
let jobs = [];
if (/手册|all/.test(which)) jobs = jobs.concat(buildHandbooks());
if (/数学|all/.test(which)) jobs = jobs.concat(buildMath());
if (/数学二|math2|all/.test(which)) jobs = jobs.concat(buildMath2());
if (/408|all/.test(which)) jobs = jobs.concat(build408());
console.log(`待出 ${jobs.length} 份 PDF…`);
let okN = 0, bad = [];
for (const j of jobs) {
  const good = toPdf(j.html, j.pdf);
  if (good) { okN++; console.log(' ✓', path.basename(j.pdf), Math.round(fs.statSync(j.pdf).size / 1024) + ' KB'); }
  else bad.push(j.name);
}
console.log(`\n完成 ${okN}/${jobs.length}`);
if (bad.length) { console.log('失败：', bad.join(', ')); process.exitCode = 1; }
if (!EDGE) { console.log('没找到 Edge/Chrome，PDF 没出'); process.exitCode = 1; }
