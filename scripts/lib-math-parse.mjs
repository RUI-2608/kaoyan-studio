/* 数学真题解析器（数一 / 数二 共用同一套口径）
 *
 * 认题只有一条硬规矩：题号必须按大题声明的区间顺序推进（一、选择题 1～10 就只收 1..10）。
 * 对不上一律当正文 —— 绝不为了凑题数猜题号。
 * 从 build-math.mjs 原样抽出，两个年份段（数一/数二）共用，避免两套口径。
 */

/* ---------- 行识别 ---------- */
export const CNCH = '[一二三四五六七八九十]{1,3}';
export const cnIndex = (cn) => ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13 }[cn] || 99);

/* 把标题里的 LaTeX 噪音抹平，才能认出 "$\mathsf { 1 } \sim \mathsf { 1 0 }$ 小题" */
export function squeeze(s) {
  return s
    .replace(/\\sim|\\backsim|\\thicksim/g, '～')
    .replace(/\\mathsf|\\mathrm|\\text|\\mathbf|\\displaystyle/g, '')
    .replace(/[${}\\]/g, '')
    .replace(/\\[,;:! ]/g, '')
    .replace(/\s+/g, '');
}
export function sectionHead(line) {
  const m = line.match(/^#{1,4}\s*(.+?)\s*$/);
  if (!m) return null;
  const s = m[1].trim().match(new RegExp(`^(${CNCH})\\s*[、.．，,]\\s*(.*)$`));
  if (!s) return null;
  return { cn: s[1], title: s[2] || '', ...sectionInfo(s[2] || '') };
}
export function sectionInfo(title) {
  const t = squeeze(title);
  const range = t.match(/(\d{1,2})(?:[～\-—~]{1,2})(\d{1,2})\s*小?题/);
  const cnt = t.match(/(?:本题共|共|有)\s*(\d{1,2})\s*小?题/);
  const each = t.match(/每小?题?[（(]?(\d+(?:\.\d+)?)分/);
  const all = t.match(/(?:本题)?(?:满分|共)(\d+(?:\.\d+)?)分/);
  const kind = /选择题|单选|多选/.test(t) ? 'choice' : /填空/.test(t) ? 'blank' : /解答|证明/.test(t) ? 'solution' : null;
  return {
    range: range ? [+range[1], +range[2]] : null,
    declared_n: range ? +range[2] - +range[1] + 1 : (cnt ? +cnt[1] : null),
    score_each: each ? +each[1] : null,
    score_total: all ? +all[1] : null,
    kind,
  };
}
export function questionNo(line) {
  let m = line.match(/^#{1,4}\s*(\d{1,2})\s*[.、．]\s*(.*)$/);              // 2023: "# 21. (本小题满分12分)"
  if (m) return { no: +m[1], rest: m[2], mark: m[0].replace(/\d.*/, '') };
  m = line.match(/^\s*[【[(（]\s*(\d{1,2})\s*[】\])）]\s*[.、．]?\s*(.*)$/); // (1) （1） 【1】 1)
  if (m) return { no: +m[1], rest: m[2] };
  m = line.match(/^\s*(\d{1,2})\s*[.、．)）]\s*(.*)$/);                       // 1. 1、 1）
  if (m && +m[1] <= 30) return { no: +m[1], rest: m[2] };
  m = line.match(/^\s*(\d{1,2})\s+(\S.*)$/);                                  // 2022: "1 设 ..." —— 只有顺序接得上才认
  if (m && +m[1] <= 30) return { no: +m[1], rest: m[2] };
  return null;
}
export function optionTag(line) {
  /* 选项常见写法：A. / （A） / $\mathrm{(A)}\;f'(1)=1.$ —— 先把公式外壳剥掉再认，正文保留原样 */
  let bare = line.replace(/^\s*\$?\s*\\(?:mathrm|text|mathbf|mathit|mathsf|mathcal)\s*\{?\s*/, '').replace(/^\s*\$+\s*/, '');
  const m = bare.match(/^\s*[（(【]?\s*([A-D])\s*[)）】}]\s*[.、．]?\s*(.*)$/) || bare.match(/^\s*([A-D])\s*[.、．]\s+(.*)$/);
  if (!m) return null;
  let rest = m[2].replace(/^\s*[.、．]\s*/, '').replace(/^\\(?:mathrm|text)\s*\{[^}]*\}\s*/, '').trim();
  if (!rest) return null;
  return { key: m[1], rest };
}
export const ANSWER_RE = /^\s*(?:[【\[]\s*(?:答案|正确答案)\s*[】\]]|答案|正确答案)\s*[：:.、]?\s*(.*)$/;
export const ANALYSIS_RE = /^\s*(?:[【\[]\s*(解析|分析|解答|证明)\s*[】\]]|(解析|分析|详解))\s*[：:]?\s*(.*)$/;
export const SOLVE_RE = /^\s*(?:[【\[]\s*(解|证明)\s*[】\]]|(?:(?:详解|解答))\s*[：:])\s*(.*)$/;   // 【解】后面可以没有冒号；裸写的'解：'必须有冒号，免得把正文吃掉
export const SCORE_TAG_RE = /^[（(]\s*本题?满分\s*(\d+(?:\.\d+)?)\s*分\s*[)）]\s*/;

/* 「解. / 证明. / 【解】」有时跟在同一行中间（数二合订本就是这样，D 选项后面直接接「解. 应选 (D).」），
   所以除了整行匹配，还要能在行内劈开。 */
const INLINE_SOLVE = /(?:^|\s)(?:【\s*解\s*】|解\s*[.．:：]|证明\s*[.．:：]|【\s*解析\s*】)/;
export function splitAtSolve(text) {
  const t = String(text || '');
  const m = INLINE_SOLVE.exec(t);
  if (!m || m.index === 0 && !m[0].trim()) return [t, null];
  const head = t.slice(0, m.index).trim();
  const tail = t.slice(m.index + m[0].length).trim();
  return [head, tail];
}

/* ---------- 大题内切题：只认「按序推进」的题号 ---------- */
export function splitQuestions(lines, { from = 1, to = Infinity } = {}) {
  let expect = from;
  const out = [];
  const skipped = [];
  const jumps = [];
  let cur = null, mode = 'stem', optKey = null;
  const flush = () => { if (cur) out.push(cur); };
  const eatRest = (rest) => {
    if (!cur || !rest) return;
    const sc = rest.match(SCORE_TAG_RE);
    if (sc) { cur.score = +sc[1]; rest = rest.slice(sc[0].length); }
    let m = rest.match(ANSWER_RE);
    if (m) { cur.sawAnswer = true; cur.answer = m[1].trim(); mode = 'analysis'; cur.analysis.push(''); return; }
    m = rest.match(ANALYSIS_RE) || rest.match(SOLVE_RE);
    if (m) { mode = 'analysis'; cur.analysis.push((m[3] || m[6] || m[2] || '').trim()); return; }
    if (rest.trim()) cur.stem.push(rest);
  };
  const newQ = (no) => { flush(); cur = { no, stem: [], options: {}, answer: null, analysis: [], sawAnswer: false, score: null }; mode = 'stem'; expect = no + 1; };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;
    const qn = questionNo(line);
    if (qn && qn.no === expect && qn.no <= to) { newQ(qn.no); eatRest(qn.rest); continue; }
    /* 往前跳 1~3 个号：源文件里那一行的题号没在行首（2024 的【6】【12】就是这样丢的）。
       认下来，但把跳跃记进旗标 —— 号码是原文自己印的，不算猜。 */
    if (qn && qn.no > expect && qn.no <= to && qn.no - expect <= 3) { jumps.push([expect, qn.no]); newQ(qn.no); eatRest(qn.rest); continue; }
    let m = line.match(ANSWER_RE);
    if (m && cur) { cur.sawAnswer = true; cur.answer = m[1].trim(); mode = 'analysis'; continue; }
    m = line.match(ANALYSIS_RE) || line.match(SOLVE_RE);
    if (m && cur) { mode = 'analysis'; cur.analysis.push((m[3] || m[6] || m[2] || '').trim()); continue; }
    if (qn && qn.no > expect && qn.no <= to) skipped.push(qn.no);            // 往后跳 = 转录里像题号却没接上
    const o = optionTag(line);
    if (o && cur && mode !== 'analysis') { mode = 'option'; optKey = o.key; (cur.options[o.key] = cur.options[o.key] || []).push(o.rest); continue; }
    if (!cur) continue;
    /* 行内劈开「…… 解. 应选 (B). ……」：前半留在原位，后半进解析 */
    if (mode === 'stem' || mode === 'option') {
      const [head, tail] = splitAtSolve(line);
      if (tail != null) {
        if (head !== '') { if (mode === 'option' && optKey) cur.options[optKey].push(head); else cur.stem.push(head); }
        mode = 'analysis'; cur.analysis.push(tail);
        continue;
      }
    }
    if (mode === 'analysis') cur.analysis.push(line);
    else if (mode === 'option' && optKey) cur.options[optKey].push(line);
    else cur.stem.push(line);
  }
  flush();
  out.skipped = skipped;
  out.jumps = jumps;
  return out;
}

/* ---------- 整篇：大题 → 小题 ---------- */
export function parseDoc(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const sections = [];
  let curSec = null, bucket = [], cursor = 1;
  const take = () => {
    if (!bucket.length) return;
    const src = bucket.slice();
    const declared = curSec && curSec.range ? curSec.range : null;
    const qs = splitQuestions(src, declared ? { from: declared[0], to: declared[1] } : { from: cursor });
    bucket = [];
    if (curSec) {
      curSec.skipped = (curSec.skipped || []).concat(qs.skipped || []);
      curSec.jumps = (curSec.jumps || []).concat(qs.jumps || []);
    }
    if (qs.length) {
      cursor = qs[qs.length - 1].no + 1;
      if (curSec) curSec.questions.push(...qs);
      else sections.push({ cn: null, title: '（未标大题）', questions: qs, declared_n: null, score_total: null, score_each: null, kind: null, range: null });
      return;
    }
    /* 一个编号小题都没有：这份材料把整个大题当一题（1987-2003 的解答题就是这样） */
    const body = lines2Text(src);
    if (curSec && body) {
      curSec.questions.push({ no: curSec.range ? curSec.range[0] : cursor, stem: [body], options: {}, answer: null, analysis: [], sawAnswer: false, score: curSec.score_total, unnumbered: true });
      cursor++;
    }
  };
  for (const line of lines) {
    const s = sectionHead(line);
    if (s) {
      take();
      curSec = { cn: s.cn, title: s.title, declared_n: s.declared_n, score_each: s.score_each, score_total: s.score_total, kind: s.kind, range: s.range, questions: [], skipped: [] };
      cursor = s.range ? s.range[0] : cursor;
      sections.push(curSec);
      continue;
    }
    bucket.push(line);
  }
  take();
  return sections.filter((s) => s.questions.length);
}
export const lines2Text = (arr) => arr.map((l) => l.trim()).filter((l) => l && !/^#{1,4}\s/.test(l)).join('\n').trim();


