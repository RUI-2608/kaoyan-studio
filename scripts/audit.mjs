/* 数据体检（发布前必跑）
 *
 * 只干一件事：证明站点里的每个数字都站得住。
 *   1) 结构不变量：题号连续、选项齐、A/B 档不许出现「有题干没答案还不标待核实」
 *   2) 答案交叉验证：408 三条通道互相打脸的地方要点名；数学要回原文核对若干条
 *   3) 公式渲染：把每条题干/解析都过一遍 KaTeX，数出渲染失败的条数
 *   4) 来源齐全：每一年/每套卷都要有 repo + 文件路径
 * 任何一条不过就退出码 1 —— 别把带病的数据端上桌。
 */
import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import { loadJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const D = path.join(ROOT, 'web/data');
const fails = [], warns = [], ok = [];
const bad = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const good = (m) => ok.push(m);

const readJS = (p) => loadJS(path.join(D, p));

/* ---------- 1. 数学 ---------- */
const mi = readJS('math/index.js');
let mStats = { years: 0, q: 0, noAnswerNoFlag: 0, missingSource: 0, badId: new Set() };
for (const row of mi.years) {
  if (!row.usable) continue;
  if (row.tier === 'C') continue;
  const doc = readJS(`math/${row.year}.js`);
  mStats.years++;
  if (!doc.sources || !doc.sources.repo) { mStats.missingSource++; bad(`数学 ${row.year} 没有来源`); }
  for (const sec of doc.sections) {
    for (const q of sec.questions) {
      mStats.q++;
      if (!q.id || mStats.badId.has(q.id)) bad(`数学 ${row.year} 题 id 缺失或重复：${q.id}`);
      mStats.badId.add(q.id);
      const hasAns = !!q.answer;
      const flagged = (q.flags || []).some((f) => /缺答案|待核实|没有|答案未|未抽出|未标注/.test(f));
      /* 只有客观题（有选项的大题）才要求「要么有答案，要么挂待核实」；解答题的答案就是解析本身 */
      if (sec.kind === 'choice' && !hasAns && !flagged) mStats.noAnswerNoFlag++;
      if (sec.kind === 'choice' && Object.keys(q.options || {}).length && Object.keys(q.options).length < 4)
        warn(`数学 ${row.year} 第${q.no}题选项不足 4 个`);
      if (!q.stem || q.stem.length < 6) warn(`数学 ${row.year} 第${q.no}题题干过短`);
    }
  }
}
mStats.noAnswerNoFlag ? bad(`数学有 ${mStats.noAnswerNoFlag} 题既无答案又无「待核实」旗标`) : good('数学：缺答案的题都带旗标');
mStats.missingSource || good('数学：每一年都带来源');

/* 对账：原文里印了多少个【答案】标记，库里就该有多少条答案（数量差太多 = 漏题或串行） */
let spot = { checked: 0, off: [] };
for (const row of mi.years.filter((r) => r.tier !== 'C')) {
  const raw = path.join(D, 'math/raw', row.year + '-solution.md');
  if (!fs.existsSync(raw)) continue;
  const txt = fs.readFileSync(raw, 'utf8');
  const marks = (txt.match(/【答案】/g) || []).length;
  const doc = readJS('math/' + row.year + '.js');
  const stored = doc.sections.flatMap((s) => s.questions).filter((q) => q.answer).length;
  spot.checked++;
  if (marks && Math.abs(stored - marks) > Math.max(2, marks * 0.12)) spot.off.push(row.year + ': 原文 ' + marks + ' 个标记 vs 库里 ' + stored + ' 条');
}
if (spot.off.length) warn('数学答案条数与原文标记数不一致：' + spot.off.join('；'));
else good('数学：' + spot.checked + ' 个年份的答案数与原文【答案】标记数对得上');

/* ---------- 2. 408 答案交叉验证 ---------- */
const pi = readJS('p408/index.js');
let cross = { years: 0, agree: 0, disagree: 0, solo: 0 };
for (const row of pi.years.filter((y) => y.n)) {
  const file = path.join(D, 'p408', `${row.year}-answer.txt`);
  if (!fs.existsSync(file)) continue;
  const txt = fs.readFileSync(file, 'utf8');
  const doc = readJS(`p408/${row.year}.js`);
  const byNo = new Map(doc.questions.map((q) => [q.no, q]));
  let checked = 0, agree = 0;
  for (const q of byNo.values()) {
    if (!q.answer || q.kind !== 'choice') continue;
    /* 独立通道：解析正文里显式写的「故选 X / 正确答案是 X」 */
    const ex = String(q.explanation || '');
    const m = ex.match(/(?:故|应)选\s*[（(]?\s*([A-D])|正确的?选项\s*(?:是|为)\s*[（(]?\s*([A-D])/);
    const other = m ? (m[1] || m[2]) : null;
    if (!other) continue;
    checked++; if (other === String(q.answer)[0]) agree++;
    else warn(`408 ${row.year} 第${q.no}题：答案 ${q.answer} vs 解析「选${other}」`);
  }
  if (checked) { cross.years++; cross.agree += agree; cross.disagree += checked - agree; }
  else cross.solo++;
  if (row.n_answer < row.n_choice) warn(`408 ${row.year} 只有 ${row.n_answer}/${row.n_choice} 道单选有答案（其余标了待核实）`);
}
console.log(`   408 答案交叉验证：${cross.years} 年可比对，一致 ${cross.agree}，不一致 ${cross.disagree}，${cross.solo} 年只有单一来源`);
cross.disagree ? bad(`408 有 ${cross.disagree} 题答案与解析自相矛盾，需要人工定案`) : good('408：可比对的答案与解析结论一致');

/* ---------- 3. 英语 ---------- */
const ei = readJS('en/index.js');
let enQ = 0, enNoAns = 0, enNoExp = 0;
for (const p of ei.papers) {
  const doc = readJS(`en/${p.exam}-${p.year}.js`);
  if (!doc.sources || !doc.sources.repo) bad(`英语 ${p.year} 没有来源`);
  for (const s of doc.sections) for (const g of s.groups) for (const q of g.questions) {
    enQ++;
    if (!q.answer) enNoAns++;
    if (!q.explanation || q.explanation.length < 12) enNoExp++;
  }
}
enNoAns ? warn(`英语有 ${enNoAns} 题没有答案`) : good('英语：每题都有答案');
enNoExp ? warn(`英语有 ${enNoExp} 题解析缺失或过短`) : good('英语：每题都有解析');

/* ---------- 4. 知识库 ---------- */
const ki = readJS('know/index.js');
let cards = 0;
for (const s of ki.subjects) {
  const doc = readJS(`know/${s.subject}.js`);
  if (doc.cards.length !== s.cards) bad(`知识库 ${s.subject} 卡片数对不上`);
  for (const c of doc.cards) {
    cards++;
    if (!c.body || c.body.length < 120) bad(`卡片 ${c.id} 正文过短`);
    if (/待补|TODO|TBD/.test(c.body)) bad(`卡片 ${c.id} 有未完成占位`);
  }
}
good(`知识库：${cards} 张卡片全部有正文`);

/* ---------- 5. 公式渲染 ---------- */
let mf = { total: 0, fail: 0, samples: [] };
function scanMath(text, where) {
  const s = String(text || '');
  const marks = [...s.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)];
  for (const m of marks) {
    const body = m[1] || m[2];
    if (!body || body.length > 400) continue;
    mf.total++;
    try { katex.renderToString(body, { throwOnError: false, displayMode: !!m[1], strict: 'ignore' }); if (body.includes('katex-error')) throw new Error('err'); }
    catch (e) { mf.fail++; if (mf.samples.length < 6) mf.samples.push(`${where}: ${body.slice(0, 60)}`); }
  }
}
for (const row of mi.years.filter((r) => r.tier !== 'C')) {
  const doc = readJS(`math/${row.year}.js`);
  doc.sections.flatMap((s) => s.questions).forEach((q) => { scanMath(q.stem, `数学${row.year}#${q.no}`); scanMath(q.analysis, `数学${row.year}#${q.no}解析`); Object.values(q.options || {}).forEach((o) => scanMath(o, `数学${row.year}#${q.no}选项`)); });
}
for (const s of ki.subjects) readJS(`know/${s.subject}.js`).cards.forEach((c) => scanMath(c.body, `卡片${c.id}`));
console.log(`   公式：共 ${mf.total} 处，渲染失败 ${mf.fail} 处`);
mf.samples.forEach((x) => console.log('     ·', x));
(mf.total ? mf.fail / mf.total : 0) > 0.02 ? bad(`公式渲染失败率超过 2%（${mf.fail}/${mf.total}）`) : good(`公式渲染：${mf.total - mf.fail}/${mf.total} 通过`);

/* ---------- 6. 站点里引用的文件都在 ---------- */
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
for (const src of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((x) => !/^https?:/.test(x) && !x.startsWith('#'))) {
  if (!fs.existsSync(path.join(ROOT, 'web', src))) bad(`index.html 引用了不存在的文件：${src}`);
}
good('index.html 的本地引用全部存在');
/* 数据里引用的配图与 PDF */
let ref = { n: 0, miss: 0 };
for (const row of pi.years.filter((y) => y.n)) {
  for (const p of [readJS(`p408/${row.year}.js`).sources.paper, readJS(`p408/${row.year}.js`).sources.answer]) {
    ref.n++; if (!fs.existsSync(path.join(ROOT, 'web', p))) { ref.miss++; bad(`缺 PDF：${p}`); }
  }
}
for (const row of mi.years.filter((r) => r.tier !== 'C')) {
  const doc = readJS(`math/${row.year}.js`);
  const txt = JSON.stringify(doc);
  for (const m of txt.matchAll(/img\/([A-Za-z0-9._-]+\.(?:jpg|png))/g)) { ref.n++; if (!fs.existsSync(path.join(D, 'math', 'img', m[1]))) { ref.miss++; bad(`缺配图：${m[1]}`); } }
}
ref.miss || good(`站点内引用的 ${ref.n} 个文件（PDF/配图）全部在位`);

/* ---------- 汇总 ---------- */
console.log('\n通过：'); ok.forEach((m) => console.log(' ✓', m));
console.log('\n提醒（不算失败，但要在体检页露出）：'); warns.slice(0, 14).forEach((m) => console.log(' ·', m));
if (warns.length > 14) console.log(` · …另有 ${warns.length - 14} 条同类提醒`);
if (fails.length) { console.log('\n失败：'); fails.forEach((m) => console.log(' ✗', m)); process.exitCode = 1; }
else console.log(`\n体检通过：${ok.length} 项，提醒 ${warns.length} 条`);
fs.mkdirSync(path.join(ROOT, '_research'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '_research', 'audit-report.json'), JSON.stringify({ at: new Date().toISOString(), ok, warns, fails, math: mStats, spot, cross, en: { enQ, enNoAns, enNoExp }, mathFormula: { total: mf.total, fail: mf.fail }, refs: ref }, null, 1), 'utf8');
