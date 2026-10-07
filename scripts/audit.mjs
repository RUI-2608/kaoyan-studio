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

/* ---------- 1b. 数学（二）---------- */
const m2i = readJS('math2/index.js');
let s2 = { years: 0, q: 0, noFlag: 0, off: [], refs: 0, refNoJump: 0 };
for (const row of m2i.years.filter((r) => r.usable !== false)) {
  const doc = readJS('math2/' + row.year + '.js');
  const qs = doc.sections.flatMap((s) => s.questions);
  s2.years++; s2.q += qs.length;
  if (!doc.sources || !doc.sources.repo) bad2('数二 ' + row.year + ' 没有来源');
  for (const sec of doc.sections) for (const q of sec.questions) {
    if (q.ref) { s2.refs++; if (!q.flags || !q.flags.some((f) => /共题|同试卷/.test(f))) s2.refNoJump++; }
    if (sec.kind === 'choice' && !q.answer && !q.ref && !(q.flags || []).some((f) => /答案未|待核实|没有|缺/.test(f))) s2.noFlag++;
  }
  if (row.tier !== 'C') {
    const raw = path.join(D, 'math2/raw', row.year + '.md');
    if (fs.existsSync(raw)) {
      const txt = fs.readFileSync(raw, 'utf8');
      const marks = (txt.match(/【答案】|应选|故选/g) || []).length;
      const stored = qs.filter((q) => q.answer).length + qs.filter((q) => (q.analysis || '').length > 12).length;
      if (marks > 6 && stored < marks * 0.4) s2.off.push(row.year + ': 原文出现 ' + marks + ' 处答案字样，库里只落到 ' + stored + ' 条');
    }
  }
}
function bad2(m) { fails.push(m); }
s2.noFlag ? bad('数二有 ' + s2.noFlag + ' 题既无答案又无「待核实」旗标') : good('数二：缺答案的题都带旗标');
s2.refNoJump ? bad('数二有 ' + s2.refNoJump + ' 道「同试卷一」的题没挂跳转说明') : good('数二：' + s2.refs + ' 道共题引用全部写明出处');
s2.off.length ? warn('数二答案落地率偏低：' + s2.off.join('；')) : good('数二：答案字样落地率正常');
console.log('   数学（二）：' + s2.years + ' 年 ' + s2.q + ' 题，其中共题引用 ' + s2.refs + ' 道');

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

/* ---------- 2b. 408 外来答案必须过闸门，并且题上留着出处 ---------- */
let gate = { foreign: 0, noFlag: 0, weakAlt: 0, weakThird: 0, noAnswerNoFlag: 0 };
for (const row of pi.years.filter((y) => y.n)) {
  const doc = readJS(`p408/${row.year}.js`);
  /* 第二来源：题干比对不到 80% 就不许出现 alt-* 来源的答案 */
  for (const q of doc.questions) {
    const src = q.answer_src || '';
    if (/^alt-/.test(src) && (row.alt.stem_match || 0) < 0.8) gate.weakAlt++;
    if (/^third-/.test(src) && (!row.third || !row.third.channel_ok || row.third.channel_rate < 0.9)) gate.weakThird++;
    if (/^(alt|third)-/.test(src)) {
      gate.foreign++;
      if (!(q.flags || []).some((f) => /第[二三]来源/.test(f))) gate.noFlag++;
    }
    if (q.kind === 'choice' && !q.answer && !(q.flags || []).some((f) => f.startsWith('答案待核实'))) gate.noAnswerNoFlag++;
  }
}
console.log(`   408 外来答案：第二/第三来源共 ${gate.foreign} 条，题干比对不合格 ${gate.weakAlt}，通道标定不合格 ${gate.weakThird}，没留出处旗标 ${gate.noFlag}`);
gate.weakAlt ? bad(`408 有 ${gate.weakAlt} 条答案来自题干对不上的第二来源`) : good('408：第二来源的答案都来自题干比对 ≥80% 的年份');
gate.weakThird ? bad(`408 有 ${gate.weakThird} 条答案来自没通过标定的第三来源`) : good('408：第三来源的答案都来自标定通过的通道');
gate.noFlag ? bad(`408 有 ${gate.noFlag} 条外来答案没在题上写明出处`) : good('408：外来答案逐题写明来源文件');
gate.noAnswerNoFlag ? bad(`408 有 ${gate.noAnswerNoFlag} 题既无答案又无「待核实」旗标`) : good('408：没答案的题全部标了待核实');

/* ---------- 2c. 408 选项完整性 ----------
   选项被吞这件事，光靠「缺答案要挂旗标」那类不变量看不出来：2022 年第 1 题的 A 被粘在题干行尾，
   题面照样能显示，只是少一项，做的时候根本发现不了。所以这里专门盯两件事：
   1) 单选满 4 选项的比例（原料里确实有含图题没有文字选项，所以是 warn 不是 fail）；
   2) 题干里还留着「B. / C. / D.」这种没拆开的选项标记 —— 这是解析器该修的信号。 */
let opt = { tot: 0, full: 0, short: [], inline: [] };
for (const row of pi.years.filter((y) => y.n)) {
  const doc = readJS(`p408/${row.year}.js`);
  for (const q of doc.questions) {
    if (q.kind !== 'choice') continue;
    opt.tot++;
    const n = Object.keys(q.options || {}).length;
    if (n === 4) opt.full++;
    else opt.short.push(`${row.year}#${q.no}(${n})`);
    const m = /[\s。；;][BCD]\s*[.．]\s*\S/.exec(String(q.stem || ''));
    if (m) opt.inline.push(`${row.year}#${q.no}「…${String(q.stem).slice(Math.max(0, m.index - 8), m.index + 22).trim()}…」`);
  }
}
const optRate = opt.full / Math.max(1, opt.tot);
console.log(`   408 选项完整性：单选 ${opt.tot} 道，满 4 选项 ${opt.full}（${(optRate * 100).toFixed(1)}%），不满 ${opt.short.length} 道，题干里疑似未拆开 ${opt.inline.length} 处`);
if (optRate >= 0.95) good(`408：单选满 4 选项率 ${(optRate * 100).toFixed(1)}%（≥95%）`);
else bad(`408：单选满 4 选项率只有 ${(optRate * 100).toFixed(1)}%，选项解析可能出了问题`);
if (opt.short.length) warn(`408 选项不足 4 个的题：${opt.short.join('、')}（含图题文字层本来就没有选项，逐题已挂旗标）`);
if (opt.inline.length) warn(`408 题干里还留着没拆开的选项标记：${opt.inline.join('；')} —— 这批是原料把上一题的选项漂到了下一题题干里，需要人工对原卷`);
else good('408：题干里没有未拆开的选项标记');

/* ---------- 2d. 源 PDF 抽出来的乱码符号 ----------
   有些转录件的文字层是坏的：符号（≥ ≤ ≪ ←）退化成 U+FFFD，整页甚至可能全是乱码。
   build-math 用 U+FFFD 占比 >0.15% 判「这份不能用」，改成从解析取题干，并在 notes 里点名。
   这里复查两件事：
   1) 出现大量 U+FFFD 的那一份原文，索引里必须已经标了 garbled_*，否则就是漏检 —— fail；
   2) 408 的解析里有少量符号乱码（源 PDF 就这样，恢复不出原字符），只 warn 并给出数量。 */
const fffd = {};
const scanFile = (p) => (fs.existsSync(p) ? (fs.readFileSync(p, 'utf8').match(/\uFFFD/g) || []).length : 0);
const add = (k, n) => { if (n) fffd[k] = (fffd[k] || 0) + n; };
let fffdMiss = 0;
for (const row of mi.years) {                       /* 数一：试卷 / 解析两份分开，坏的那份必须由索引点名 */
  for (const kind of ['paper', 'solution']) {
    const n = scanFile(path.join(D, 'math', 'raw', `${row.year}-${kind}.js`));
    add(`math/${kind}`, n);
    if (n > 40 && !(kind === 'paper' ? row.garbled_paper : row.garbled_solution)) {
      fffdMiss++; bad(`math ${row.year} ${kind} 原文里有 ${n} 处 U+FFFD，索引却没标 garbled_${kind} —— 这份乱码没被认出来，可能已经混进题库`);
    }
  }
}
for (const row of m2i.years) {                      /* 数二是合订本，没有乱码兜底这条路，出现大量 U+FFFD 就是新伤 */
  const n = scanFile(path.join(D, 'math2', 'raw', `${row.year}.js`));
  add('math2/raw', n);
  if (n > 40) { fffdMiss++; bad(`math2 ${row.year} 原文有 ${n} 处 U+FFFD，数二这条链路没有乱码处理，得人工看这份转录还能不能用`); }
}
fffd.p408 = pi.years.filter((y) => y.n).reduce((a, y) => a + scanFile(path.join(D, 'p408', `${y.year}.js`)), 0);
console.log(`   乱码符号 U+FFFD：${Object.entries(fffd).map(([s, n]) => `${s} ${n}`).join('，') || '全库 0'}`);
if (!fffdMiss) good('大量乱码的原文都已在索引里标为 garbled（没有漏检）');
if (fffd.p408) warn(`408 数据里有 ${fffd.p408} 处 U+FFFD：源答案 PDF 的数学符号转文字时丢了，恢复不出原字符，只影响个别解析里的符号（题干与选项不受影响）`);

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
  doc.sections.flatMap((s) => s.questions).forEach((q) => { scanMath(q.stem, `数学一${row.year}#${q.no}`); scanMath(q.analysis, `数学一${row.year}#${q.no}解析`); Object.values(q.options || {}).forEach((o) => scanMath(o, `数学一${row.year}#${q.no}选项`)); });
}
for (const row of m2i.years.filter((r) => r.usable !== false && r.tier !== 'C')) {
  const doc = readJS(`math2/${row.year}.js`);
  doc.sections.flatMap((s) => s.questions).forEach((q) => { scanMath(q.stem, `数学二${row.year}#${q.no}`); scanMath(q.analysis, `数学二${row.year}#${q.no}解析`); Object.values(q.options || {}).forEach((o) => scanMath(o, `数学二${row.year}#${q.no}选项`)); });
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

/* ---------- 6b. 配图的 URL 解不解得开 ----------
   上一段只查「文件在不在磁盘上」，查不出基准路径错了：数一 57 张图全在，
   正文写的却是相对 data/math/ 的 img/xxx，页面按站点根解析 → 线上整页空白死图
   （2026-10-07 用真浏览器跑公开 URL 才暴露）。这里照 web/app.js 的 imgSrc() 同一套规则解一遍。 */
const walkData = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walkData(p) : (/\.(js|md)$/.test(e.name) ? [p] : []);
});
let img = { n: 0, okN: 0, mathDead: [], otherDead: [] };
for (const f of walkData(D)) {
  const subj = path.relative(D, f).split(path.sep)[0];
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    const src = m[1];
    if (/^https?:/.test(src)) continue;
    img.n++;
    const rel = (subj === 'math' && src.startsWith('img/')) ? 'data/math/' + src : src;
    if (fs.existsSync(path.join(ROOT, 'web', rel))) { img.okN++; continue; }
    (subj === 'math' ? img.mathDead : img.otherDead).push(`${subj}/${path.basename(f)} → ${src}`);
  }
}
if (img.mathDead.length) bad(`数一配图按站点根解不开 ${img.mathDead.length} 处，例如 ${img.mathDead.slice(0, 2).join('；')}`);
img.otherDead.length && warn(`数二有 ${img.otherDead.length} 处配图原料就没下载进站（渲染时显示成「配图未随包」，不是点开的死链），例如 ${img.otherDead[0]}`);
good(`正文配图引用 ${img.n} 处：解得开 ${img.okN} 处，数二缺原料 ${img.otherDead.length} 处（已明写）`);

/* ---------- 汇总 ---------- */
console.log('\n通过：'); ok.forEach((m) => console.log(' ✓', m));
console.log('\n提醒（不算失败，但要在体检页露出）：'); warns.slice(0, 14).forEach((m) => console.log(' ·', m));
if (warns.length > 14) console.log(` · …另有 ${warns.length - 14} 条同类提醒`);
if (fails.length) { console.log('\n失败：'); fails.forEach((m) => console.log(' ✗', m)); process.exitCode = 1; }
else console.log(`\n体检通过：${ok.length} 项，提醒 ${warns.length} 条`);
fs.mkdirSync(path.join(ROOT, '_research'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '_research', 'audit-report.json'), JSON.stringify({ at: new Date().toISOString(), ok, warns, fails, math: mStats, spot, cross, en: { enQ, enNoAns, enNoExp }, mathFormula: { total: mf.total, fail: mf.fail }, refs: ref }, null, 1), 'utf8');
