/* 数学真题构建器（第 4 版）
 *
 * 原料两份，各司其职（第三方转录，见 FOOTER 版权说明）：
 *   papers/<年>.md             —— 题干 + 选项
 *   solutions/<年>年解析/*.md   —— 答案 + 解析（老文件常只给答案，不重复题干）
 *
 * 两条硬规矩：
 *  1) 认题只按「大题内顺序推进 + 大题标题声明的区间」，对不上号的一律当正文，绝不猜题号；
 *  2) 试卷和解析按「大题序号（一/二/三…）对齐，再按第几小题对齐」，两边题号不一致就留旗标。
 * 认不出、缺答案、转录乱码，全部如实进 audit，页面上看得见。
 */
import fs from 'node:fs';
import path from 'node:path';
import { emitJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VENDOR = path.join(ROOT, '_vendor/Kaoyan-Math1-Papers');
const OUT = path.join(ROOT, 'web/data/math');
const RAW = path.join(OUT, 'raw');
const IMG = path.join(OUT, 'img');

/* 原料里 ![](images/<hash>.jpg) 这些配图搬进站点，引用改成 img/<年>-<hash>.jpg；
   搬不出来的在正文里写明「配图未随包」，不留一个点开的死图。
   注意：图片真实躺在 images/<年份>/ 子目录下，正文却只写 images/<hash>.jpg —— 按文件名兜底查找。 */
const imgIndex = new Map();
function indexImages(dir) {
  if (imgIndex.has(dir)) return imgIndex.get(dir);
  const map = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(e.name)) map.set(e.name, p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  imgIndex.set(dir, map);
  return map;
}
function rewriteImages(txt, srcDir, tag) {
  let moved = 0, missing = 0;
  const idx = indexImages(tag.startsWith('p') ? path.join(VENDOR, 'papers') : path.join(VENDOR, 'solutions'));
  const out = txt.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m0, alt, p) => {
    if (/^https?:/.test(p)) return m0;
    const name = path.basename(p);
    const abs = [path.resolve(srcDir, p), idx.get(name)].find((x) => x && fs.existsSync(x));
    if (!abs) { missing++; return `〔配图未随包：${name}〕`; }
    const base = name.replace(/\.[^.]+$/, '').slice(0, 12);
    const ext = path.extname(abs).toLowerCase() === '.png' ? 'png' : 'jpg';
    fs.mkdirSync(IMG, { recursive: true });
    fs.copyFileSync(abs, path.join(IMG, `${tag}-${base}.${ext}`));
    moved++;
    return `![${alt}](img/${tag}-${base}.${ext})`;
  });
  return { txt: out, moved, missing };
}

/* ---------- 解析器（与数二共用一份，见 lib-math-parse.mjs） ---------- */
import { parseDoc, lines2Text, cnIndex, squeeze } from './lib-math-parse.mjs';

/* ---------- 原料定位 ---------- */
const flat = (secs) => secs.flatMap((s) => s.questions);
const garbled = (txt) => (txt.match(/\uFFFD/g) || []).length / Math.max(1, txt.length) > 0.0015;
function pickCandidate(dir, year) {
  if (!fs.existsSync(dir)) return null;
  const hits = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f.includes(String(year)) && !/^README/i.test(f));
  let best = null;
  for (const h of hits) {
    const p = path.join(dir, h);
    const txt = fs.readFileSync(p, 'utf8');
    if (txt.startsWith('%PDF')) continue;                       // 挂 .md 名的 PDF，不能当文本
    const g = garbled(txt);
    const n = g ? 0 : flat(parseDoc(txt)).filter((q) => q.stem.join('').length > 6).length;
    if (!best || n > best.n) best = { h, p, txt, n, garbled: g };
  }
  return best;
}
function findPaper(year) { return pickCandidate(path.join(VENDOR, 'papers'), year); }
function findSolution(year) { return pickCandidate(path.join(VENDOR, `solutions/${year}年解析`), year); }

/* ---------- 对齐：先按大题序号，再按第几小题 ---------- */
function align(pSecs, sSecs) {
  const byKey = (s) => (s.cn ? 'cn' + s.cn : 't' + squeeze(s.title).slice(0, 8));
  const smap = new Map(sSecs.map((s) => [byKey(s), s]));
  const used = new Set();
  const pairs = pSecs.map((p) => { const s = smap.get(byKey(p)) || null; if (s) used.add(s); return [p, s]; });
  for (const s of sSecs) if (!used.has(s)) pairs.push([null, s]);
  pairs.sort((a, b) => cnIndex((a[0] || a[1]).cn) - cnIndex((b[0] || b[1]).cn));
  return pairs;
}

/* ---------- 主流程 ---------- */
fs.mkdirSync(OUT, { recursive: true });
/* Windows 上目录可能被占用（rmSync 直接 EPERM），所以逐个删文件、删不掉就报错而不是静默留旧数据 */
for (const p of fs.readdirSync(OUT)) {
  const abs = path.join(OUT, p);
  if (fs.statSync(abs).isDirectory()) { for (const q of fs.readdirSync(abs)) fs.rmSync(path.join(abs, q), { force: true }); }
  else fs.rmSync(abs, { force: true });
}
fs.mkdirSync(RAW, { recursive: true });
const rows = [];
for (let year = 1987; year <= 2025; year++) {
  const paper = findPaper(year);
  const sol = findSolution(year);
  if (!paper && !sol) { rows.push({ year, usable: false, why: '开源仓库里没有这一年的文本' }); continue; }
  fs.mkdirSync(IMG, { recursive: true });
  const pTxt = paper ? rewriteImages(paper.txt, path.dirname(paper.p), `p${year}`) : { txt: '', moved: 0, missing: 0 };
  const sTxt = sol ? rewriteImages(sol.txt, path.dirname(sol.p), `s${year}`) : { txt: '', moved: 0, missing: 0 };
  const images = pTxt.moved + sTxt.moved;
  const pSecs = paper && !paper.garbled ? parseDoc(pTxt.txt) : [];
  const sSecs = sol && !sol.garbled ? parseDoc(sTxt.txt) : [];
  fs.writeFileSync(path.join(RAW, `${year}-paper.md`), pTxt.txt, 'utf8');
  if (sol) fs.writeFileSync(path.join(RAW, `${year}-solution.md`), sTxt.txt, 'utf8');
  /* 站点在 file:// 下 fetch 不了 .md，所以原文也发一份 .js 供「看原文」页加载 */
  emitJS(path.join(RAW, `${year}-paper.js`), `mathraw/${year}-paper`, { year, kind: 'paper', text: pTxt.txt });
  if (sol) emitJS(path.join(RAW, `${year}-solution.js`), `mathraw/${year}-solution`, { year, kind: 'solution', text: sTxt.txt });

  const pairs = align(pSecs, sSecs);
  const sections = [];
  let gno = 0;
  for (const [ps, ss] of pairs) {
    const base = ps || ss;
    const questions = [];
    /* 配对：两边题号能对上六成以上就按号配，否则按第几小题配 */
    const pList = ps ? ps.questions : [];
    const sList = ss ? ss.questions : [];
    const sNos = new Set(sList.map((q) => q.no));
    const inter = pList.filter((q) => sNos.has(q.no)).length;
    let seq = [];
    if (pList.length && sList.length && inter >= 0.6 * Math.max(pList.length, sList.length)) {
      const sByNo = new Map(sList.map((q) => [q.no, q]));
      const usedS = new Set();
      for (const p of pList) { const s = sByNo.get(p.no) || null; if (s) usedS.add(s); seq.push([p, s]); }
      for (const s of sList) if (!usedS.has(s)) seq.push([null, s]);
      seq.sort((a, b) => (a[0] || a[1]).no - (b[0] || b[1]).no);
    } else {
      const n = Math.max(pList.length, sList.length);
      for (let i = 0; i < n; i++) seq.push([pList[i] || null, sList[i] || null]);
    }
    for (let i = 0; i < seq.length; i++) { const [pq, sq] = seq[i];
      const own = (x) => (x ? { stem: lines2Text(x.stem), options: Object.fromEntries(Object.entries(x.options || {}).map(([k, v]) => [k, (v || []).join(' ').replace(/\s+/g, ' ').trim()])), answer: x.sawAnswer ? String(x.answer || '').replace(/\s+/g, ' ').trim() : null, analysis: lines2Text(x.analysis) } : { stem: '', options: {}, answer: null, analysis: '' });
      const P = own(pq), S = own(sq);
      const stem = P.stem || S.stem || (sq && !sq.sawAnswer ? S.analysis : '');
      const options = Object.keys(P.options).length ? P.options : S.options;
      const answer = P.answer || S.answer || (sq && !sq.sawAnswer ? null : null);
      const analysis = [P.analysis, S.analysis].filter((t) => t && t.length > 4).join('\n\n');
      const flags = [];
      if (!stem) flags.push('缺题干');
      if (!answer && !analysis) flags.push('缺答案与解析');
      else if (!answer && base.kind === 'choice') flags.push('答案未标注（解析里有过程，字母没印出来）');
      else if (!answer && base.kind === 'blank') flags.push('填空答案未抽出');
      if (pq && sq && pq.no !== sq.no) flags.push(`题号不一致(卷${pq.no}/解${sq.no})`);
      const kindOfSection = base.kind;
      if (kindOfSection === 'choice' && Object.keys(options).length && Object.keys(options).length < 4) flags.push('选项不足4个');
      if (kindOfSection === 'solution' && !analysis) flags.push('解答无过程');
      if (pq && pq.unnumbered) flags.push('整题未编号');
      const uniqFlags = [...new Set(flags)];
      if (pq && Object.keys(options).length && Object.keys(options).length < 4 && base.kind === 'choice') flags.push('选项不足4个');
      if (pq && pq.unnumbered) flags.push('整题未编号');
      gno++;
      questions.push({
        id: `${year}-${sections.length + 1}-${gno}`, no: gno, local_no: i + 1,
        label: (pq || sq) ? `第${(pq || sq).no}题` : null,
        stem, options, answer: answer && answer.length ? answer : null, analysis,
        score: pq?.score ?? sq?.score ?? base.score_each ?? null, flags: uniqFlags,
      });
    }
    sections.push({
      cn: base.cn, title: base.title, kind: base.kind, declared_n: base.declared_n, questions,
      score_each: base.score_each, score_total: base.score_total, n: questions.length,
      skipped: ((ps && ps.skipped) || []).length + ((ss && ss.skipped) || []).length,
      jumps: ((ps && ps.jumps) || []).length + ((ss && ss.jumps) || []).length,
    });
  }
  const qs = sections.flatMap((s) => s.questions);
  const declaredSum = sections.reduce((a, s) => a + (s.declared_n || 0), 0);
  const obj = (q) => Object.keys(q.options || {}).length;
    const audit = {
    year,
    n: qs.length, declared_n: declaredSum || null,
    n_stem: qs.filter((q) => q.stem).length,
    n_answer: qs.filter((q) => q.answer).length,
    n_analysis: qs.filter((q) => (q.analysis || '').length > 12).length,
    n_choice: qs.filter((q) => obj(q) >= 3).length,
    n_full_options: qs.filter((q) => obj(q) === 4).length,
    score_sum: sections.reduce((a, s) => a + (s.score_total || 0), 0) || null,
    skipped: sections.reduce((a, s) => a + (s.skipped || 0), 0),
    jumps: sections.reduce((a, s) => a + (s.jumps || 0), 0),
    garbled_paper: !!(paper && paper.garbled), garbled_solution: !!(sol && sol.garbled),
    no_paper: !paper, no_solution: !sol,
  };
  /* 分三档，页面和体检都按这个说话：
     A 完整可刷（题干齐、客观题答案基本齐）
     B 可刷，但有个别题答案/解析没随转录提供 —— 逐题标「待核实」
     C 转录对不齐（题号错乱、题干大面积缺失）—— 只做原文阅读 */
  const answered = qs.filter((q) => q.answer || (q.analysis || '').length > 12).length;
  audit.n_answered = answered;
  audit.images = images;
  audit.missing_images = pTxt.missing + sTxt.missing;
  audit.stem_from_solution = !!(audit.garbled_paper || !paper);
  audit.answer_rate = audit.n ? +(answered / audit.n).toFixed(2) : 0;
  audit.stem_rate = audit.n ? +(audit.n_stem / audit.n).toFixed(2) : 0;
  const countOff = declaredSum ? Math.abs(audit.n - declaredSum) - Math.max(2, declaredSum * 0.1) : 0;
  audit.tier = (audit.n < 10 || audit.stem_rate < 0.85 || countOff > 0) ? 'C'
    : audit.answer_rate >= 0.95 ? 'A' : audit.answer_rate >= 0.6 ? 'B' : 'C';
  audit.ok = audit.tier !== 'C';
  audit.notes = [
    countOff > 0 ? `试卷转录的题数(${audit.n})和大题标题声明的题数(${declaredSum})对不上，这轮只做原文阅读` : null,
    audit.stem_rate < 0.85 && audit.tier === 'C' ? `有 ${audit.n - audit.n_stem} 道题的题干没接上题号，只做原文阅读` : null,
    audit.tier === 'C' && audit.answer_rate < 0.6 ? `答案/解析只覆盖 ${audit.n_answered}/${audit.n} 题（早期年份题型结构与现在差别大），只做原文阅读` : null,
    audit.tier === 'B' ? `本卷有 ${audit.n - answered} 道题的答案/解析没随转录提供，题里已标「待核实」` : null,
    audit.garbled_paper ? '该年试卷转录出现乱码，题干改从「解析」那份文本取' : null,
    audit.no_solution && audit.tier !== 'C' ? '开源仓库里没有单独的解析文件，答案取自试卷文本自带的答案标记' : null,
    audit.missing_images ? `${audit.missing_images} 处配图没能从原料里搬出来，正文里已写明` : null,
  ].filter(Boolean);
  const rec = {
    year, subject: 'math1',
    sources: { paper: paper ? 'papers/' + paper.h : null, solution: sol ? sol.h : null, repo: 'github.com/TsekaLuk/Kaoyan-Math1-Papers' },
    sections, audit,
  };
  emitJS(path.join(OUT, year + '.js'), 'math/' + year, rec);
  rows.push({ ...audit, tier: audit.tier, notes: audit.notes, from: [paper && (paper.garbled ? '试卷乱码' : '试卷'), sol && (sol.garbled ? '解析乱码' : '解析')].filter(Boolean).join('+'), usable: true });
}

const ok = rows.filter((r) => r.usable);
const sum = (k) => ok.reduce((a, b) => a + (b[k] || 0), 0);
const index = {
  subject: 'math1', label: '数学（一）',
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  repo: 'https://github.com/TsekaLuk/Kaoyan-Math1-Papers',
  note: '题干/选项/答案/解析均为第三方转录，按原样保留；认不出的部分留白并在体检页点名。',
  years: rows,
  totals: {
    years: ok.length, years_A: rows.filter((r) => r.tier === 'A').length, years_B: rows.filter((r) => r.tier === 'B').length,
    questions: sum('n'), with_stem: sum('n_stem'), with_answer: sum('n_answer'),
    with_analysis: sum('n_analysis'), choice: sum('n_choice'), full_options: sum('n_full_options'), skipped: sum('skipped'),
  },
};
emitJS(path.join(OUT, 'index.js'), 'math/index', index);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('年份', 6) + pad('原料', 12) + pad('题数', 6) + pad('声明', 6) + pad('题干', 6) + pad('答案', 6) + pad('解析', 6) + pad('已答', 6) + pad('4选项', 6) + pad('跳号', 6) + '可刷  疑点');
for (const r of rows) {
  if (!r.usable) { console.log(pad(r.year, 6) + '—'.padEnd(56) + r.why); continue; }
  const note = [r.garbled_paper && '试卷乱码→题干取自解析', r.declared_n && r.n !== r.declared_n && `题数${r.n}≠声明${r.declared_n}`,
    r.n_stem < r.n && `缺题干${r.n - r.n_stem}`, (r.n - r.n_answered) > 0 && `缺答${r.n - r.n_answered}`,
    r.n_choice > r.n_full_options && `选项缺${r.n_choice - r.n_full_options}题`, r.skipped && `跳号${r.skipped}`, r.images && `配图${r.images}张`].filter(Boolean).join(' ');
  console.log(pad(r.year, 6) + pad(r.from, 12) + pad(r.n, 6) + pad(r.declared_n, 6) + pad(r.n_stem, 6) + pad(r.n_answer, 6) + pad(r.n_analysis, 6) + pad(r.n_answered, 6) + pad(r.n_full_options, 6) + pad(r.skipped, 6) + pad(r.tier, 5) + (note || '—'));
}
console.log('\n可用年份：', index.totals.years, '| 合计：', JSON.stringify(index.totals));
