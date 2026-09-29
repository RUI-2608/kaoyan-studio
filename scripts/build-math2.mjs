/* 数学（二）真题构建器
 *
 * 原料：TsekaLuk/Kaoyan-Math2-Papers
 *   solutions/math2_1987-2019/math2_1987-2019.md  —— 33 年合订本，标题是中文数字年份
 *   solutions/<年>/math2_<年>.md                  —— 2020 / 2022 / 2023 / 2024
 *   papers/math2_*.pdf                            —— 同一批内容的 PDF（2020 那份抽出是乱码，不用）
 *
 * 与数一的区别：这份是「题干 + 解答」排在一起的合订本，没有单独的试卷文件，
 * 所以一年只有一份原料；解析器与分档口径和数一完全共用（lib-math-parse.mjs）。
 *
 * 2021 那份 solutions/2021 里其实是**数学三**的解析（标题写着「2021考研数学三试题解析」），
 * 不能当数二用 —— 直接排除，并在体检里写明。
 */
import fs from 'node:fs';
import path from 'node:path';
import { emitJS } from './lib-emit.mjs';
import { parseDoc, lines2Text, cnIndex, squeeze } from './lib-math-parse.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VENDOR = path.join(ROOT, '_vendor/Kaoyan-Math2-Papers');
const OUT = path.join(ROOT, 'web/data/math2');
const RAW = path.join(OUT, 'raw');

/* 中文数字年份 → 阿拉伯：一九八七 / 二〇二二 / 一九九〇 */
const DIG = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnYear(s) {
  const d = [...s].map((c) => DIG[c]).filter((x) => x != null);
  return d.length === 4 ? +d.join('') : null;
}

/* 合订本按年切开 */
function splitYears(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = new Map();
  let cur = null, buf = [];
  const flush = () => { if (cur && buf.length) out.set(cur, buf.join('\n')); buf = []; };
  for (const line of lines) {
    const m = line.match(/^#{1,4}\s*([〇零一二三四五六七八九十]{4})年考研数学/);
    const y = m ? cnYear(m[1]) : null;
    if (y && /考研数学/.test(line)) { flush(); cur = y; buf.push('# ' + y + ' 年考研数学（二）真题与解答'); continue; }
    if (cur) buf.push(line);
  }
  flush();
  return out;
}

function loadPerYear() {
  const out = new Map();
  for (const y of [2020, 2021, 2022, 2023, 2024]) {
    const dir = path.join(VENDOR, 'solutions', String(y));
    if (!fs.existsSync(dir)) continue;
    const hits = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) hits.push(p);
    });
    walk(dir);
    const file = hits.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    if (!file) continue;
    const txt = fs.readFileSync(file, 'utf8');
    const isMath3 = /数学三|数学（三）/.test(txt.slice(0, 400)) && !/数学（二）|数学二/.test(txt.slice(0, 400));
    out.set(y, { txt, file: path.relative(VENDOR, file).replace(/\\/g, '/'), wrongSubject: isMath3 });
  }
  return out;
}

/* 数二这份合订本把解答直接接在题干后面，用「解. / 解： / 证明. / 【解】」起头，
   答案写在解答里（「应选 (B)」「故选 C」）—— 所以先按这个记号把题干与解答劈开。 */
const SOLVE_SPLIT = /(?:^|\n)\s*(?:【\s*解\s*】|解\s*[.．:：]|证明\s*[.．:：]|【\s*解析\s*】)/;
const ANS_IN_SOL = /(?:应选|故选|故应选|因此选|答案\s*[是为：:]\s*)\s*[（(]?\s*([A-D])(?![A-Za-z])/g;

function splitStemSolution(Q, secKind) {
  if (Q.analysis) return Q;
  const i = Q.stem.search(SOLVE_SPLIT);
  if (i < 0) return Q;
  Q.analysis = Q.stem.slice(i).replace(SOLVE_SPLIT, ' ').trim();
  Q.stem = Q.stem.slice(0, i).trim();
  if (secKind === 'choice' && !Q.answer) {
    ANS_IN_SOL.lastIndex = 0;
    const hits = [...Q.analysis.matchAll(ANS_IN_SOL)].map((m) => m[1]).filter(Boolean);
    if (hits.length) Q.answer = hits[0];
  }
  return Q;
}

/* 原料里数二常年写「同试卷一第 N 题」—— 那是当年数二与数一共题的真实情况。
   不抄内容、不猜题干：只记下交叉引用，并尽量定位到数一库里那一题的 id 供跳转。 */
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return +s;
  const t = String(s).trim();
  if (t.startsWith('十')) return 10 + (CN_NUM[t.slice(1)] || 0);
  const m = t.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return CN_NUM[t] || null;
}
const REF_RE = /^同试卷([一二三四])第?\s*([0-9一二三四五六七八九十]{1,3})\s*(?:\[\d+\])?\s*题[。.]?$/;

function attachRefs(year, sections) {
  let m1 = null;
  try { m1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/math1', `${year}.js`), 'utf8').replace(/^window\.KY=Object\.assign\(window\.KY\|\|,\s*/, '').replace(/\}\);?\s*$/, ''))[`math/${year}`]; }
  catch (e) { /* 数一那一年没建出来，就只留引用不定位 */ }
  const byLabel = new Map();
  if (m1) m1.sections.forEach((s) => s.questions.forEach((q) => byLabel.set(`${s.kind}:${q.label}`, q.id)));
  let n = 0;
  sections.forEach((s) => s.questions.forEach((q) => {
    const m = String(q.stem).trim().match(REF_RE);
    if (!m) return;
    const no = cnNum(m[2]);
    if (no == null) return;
    n++;
    /* 原料里的「同试卷一第 N 题」带脚注标记（如「第一[5]题」），指代不唯一 ——
       所以只如实显示这句引用并给到数学一同年卷的跳转，绝不自动把某题内容搬过来当成本题。 */
    q.ref = { subject: 'math' + ({ 一: 1, 二: 2, 三: 3, 四: 4 }[m[1]] || 1), year, raw: String(q.stem).trim() };
    q.flags = [...(q.flags || []), `原料只写了「${String(q.stem).trim()}」：当年这份数二卷与数学一共题，题干与解析请看数学一同年卷（本站不代抄，避免张冠李戴）`];
  }));
  return n;
}

const flat = (secs) => secs.flatMap((s) => s.questions);
const own = (x) => (x ? {
  stem: lines2Text(x.stem),
  options: Object.fromEntries(Object.entries(x.options || {}).map(([k, v]) => [k, (v || []).join(' ').replace(/\s+/g, ' ').trim()])),
  answer: x.sawAnswer ? String(x.answer || '').replace(/\s+/g, ' ').trim() : null,
  analysis: lines2Text(x.analysis),
} : { stem: '', options: {}, answer: null, analysis: '' });

/* 试卷与解析同一份时：按大题对齐、按第几小题配对 */
function alignSameDoc(secs) {
  return secs.map((sec) => ({
    cn: sec.cn, title: sec.title, kind: sec.kind, declared_n: sec.declared_n,
    score_each: sec.score_each, score_total: sec.score_total,
    questions: sec.questions.map((q, i) => {
      const Q = splitStemSolution(own(q), sec.kind);
      /* 答案写在解答里（「应选 (D)」），劈开之后还要再捞一次 */
      if (sec.kind === 'choice' && !Q.answer && Q.analysis) {
        ANS_IN_SOL.lastIndex = 0;
        const hits = [...Q.analysis.matchAll(ANS_IN_SOL)].map((m) => m[1]).filter(Boolean);
        if (hits.length) Q.answer = hits[0];
      }
      const flags = [];
      if (!Q.stem) flags.push('缺题干');
      if (!Q.answer && !Q.analysis) flags.push('缺答案与解析');
      else if (!Q.answer && sec.kind === 'choice') flags.push('答案未标注（解析里有过程，字母没印出来）');
      if (sec.kind === 'choice' && Object.keys(Q.options).length && Object.keys(Q.options).length < 4) flags.push('选项不足4个');
      return {
        id: `${sec.__y}-${sec.__i + 1}-${i + 1}`, no: q.no, local_no: i + 1, label: `第${q.no}题`,
        stem: Q.stem, options: Q.options, answer: Q.answer || null, analysis: Q.analysis,
        score: q.score ?? sec.score_each ?? null, flags: [...new Set(flags)],
      };
    }),
  }));
}

fs.mkdirSync(RAW, { recursive: true });
const merged = fs.existsSync(path.join(VENDOR, 'solutions/math2_1987-2019/math2_1987-2019.md'))
  ? fs.readFileSync(path.join(VENDOR, 'solutions/math2_1987-2019/math2_1987-2019.md'), 'utf8') : '';
if (!merged) { console.error('缺少数二合订本 markdown，终止'); process.exit(1); }
const byYear = splitYears(merged);
const perYear = loadPerYear();
const rows = [];

for (let year = 1987; year <= 2024; year++) {
  const src = byYear.has(year)
    ? { txt: byYear.get(year), file: 'solutions/math2_1987-2019/math2_1987-2019.md' }
    : perYear.get(year);
  if (!src) { rows.push({ year, usable: false, why: '仓库里没有这一年的数二文本' }); continue; }
  if (src.wrongSubject) { rows.push({ year, usable: false, why: '该文件其实是数学三的解析，不能当数二用' }); continue; }
  fs.writeFileSync(path.join(RAW, `${year}.md`), src.txt, 'utf8');
  emitJS(path.join(RAW, `${year}.js`), `math2raw/${year}`, { year, kind: 'paper+solution', text: src.txt });

  const secs = parseDoc(src.txt);
  secs.forEach((s, i) => { s.__i = i; s.__y = year; });
  const sections = alignSameDoc(secs);
  const refs = attachRefs(year, sections);
  const qs = sections.flatMap((s) => s.questions);
  const declared = sections.reduce((a, s) => a + (s.declared_n || 0), 0);
  const answered = qs.filter((q) => q.answer || (q.analysis || '').length > 12).length;
  /* 原料写明「同试卷一第 N 题」的那些题不该算进分母：那一年这份卷子本来就没有独立题干 */
  const own_n = qs.filter((q) => !q.ref).length;
  const audit = {
    year, n: qs.length, declared_n: declared || null,
    n_stem: qs.filter((q) => q.stem).length, n_answer: qs.filter((q) => q.answer).length,
    n_answered: answered, n_analysis: qs.filter((q) => (q.analysis || '').length > 12).length,
    n_choice: qs.filter((q) => Object.keys(q.options).length >= 3).length,
    n_full_options: qs.filter((q) => Object.keys(q.options).length === 4).length,
    score_sum: sections.reduce((a, s) => a + (s.score_total || 0), 0) || null,
    cross_refs: refs,
    stem_rate: own_n ? +((qs.filter((q) => q.stem && !q.ref).length) / own_n).toFixed(2) : 0,
    answer_rate: own_n ? +(qs.filter((q) => !q.ref && (q.answer || (q.analysis || '').length > 12)).length / own_n).toFixed(2) : 0,
  };
  const countOff = declared ? Math.abs(audit.n - declared) - Math.max(2, declared * 0.1) : 0;
  audit.tier = (qs.length < 10 || audit.stem_rate < 0.85 || countOff > 0) ? 'C' : audit.answer_rate >= 0.95 ? 'A' : audit.answer_rate >= 0.6 ? 'B' : 'C';
  audit.ok = audit.tier !== 'C';
  audit.notes = [
    countOff > 0 ? `转录题数(${audit.n})与大题标题声明的题数(${declared})对不上，只做原文阅读` : null,
    audit.stem_rate < 0.85 && audit.tier === 'C' ? `有 ${audit.n - audit.n_stem} 道题的题干没接上题号，只做原文阅读` : null,
    audit.tier === 'B' ? `本卷有 ${audit.n - answered} 道题的答案/解析没随转录提供，题里已标「待核实」` : null,
    year <= 1996 ? '这一年数二叫「数学试卷三/四」，题型结构（一个大题一道题、按大题给分）与现在差别大' : null,
    refs ? `其中 ${refs} 道题原料只写了「同试卷一第 N 题」（当年与数学一共题），题里已给到数学一同年卷的跳转` : null,
  ].filter(Boolean);
  emitJS(path.join(OUT, `${year}.js`), `math2/${year}`, {
    year, subject: 'math2',
    sources: { paper: src.file, solution: src.file, repo: 'github.com/TsekaLuk/Kaoyan-Math2-Papers' },
    sections, audit,
  });
  rows.push({ year, usable: true, ...audit, from: '合订本（题干+解答同页）' });
}

const ok = rows.filter((r) => r.usable);
const sum = (k) => ok.reduce((a, b) => a + (b[k] || 0), 0);
const index = {
  subject: 'math2', label: '数学（二）', short: '数二',
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  repo: 'https://github.com/TsekaLuk/Kaoyan-Math2-Papers',
  note: '数二这份原料是「题干 + 解答」排在一起的合订本，没有独立试卷；解析器与分档口径和数一完全同一套代码。',
  years: rows,
  totals: {
    years: ok.length, years_A: rows.filter((r) => r.tier === 'A').length, years_B: rows.filter((r) => r.tier === 'B').length,
    questions: sum('n'), with_stem: sum('n_stem'), with_answer: sum('n_answer'), with_analysis: sum('n_analysis'),
    choice: sum('n_choice'), full_options: sum('n_full_options'),
  },
};
emitJS(path.join(OUT, 'index.js'), 'math2/index', index);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('年份', 6) + pad('题数', 6) + pad('声明', 6) + pad('题干', 6) + pad('已答', 6) + pad('解析', 6) + pad('4选项', 7) + pad('分值', 6) + '档 备注');
for (const r of rows) {
  if (!r.usable) { console.log(pad(r.year, 6) + '—'.padEnd(46) + '—  ' + r.why); continue; }
  console.log(pad(r.year, 6) + pad(r.n, 6) + pad(r.declared_n, 6) + pad(r.n_stem, 6) + pad(r.n_answered, 6) + pad(r.n_analysis, 6) + pad(r.n_full_options, 7) + pad(r.score_sum, 6) + pad(r.tier, 4) + (r.notes[0] || '—'));
}
console.log('\n合计：', JSON.stringify(index.totals));
