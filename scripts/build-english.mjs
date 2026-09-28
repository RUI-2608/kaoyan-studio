/* 英语真题构建器
 *
 * 原料：structured-kaoyan-english 的结构化试卷（1998-2025，2010 年起分英语一/英语二）
 *       —— 每道题自带答案与逐题解析，这是四科里质量最高的一份数据。
 * 做法：只做「整形」不做「改写」：大题/小组/题目原样搬，配图从原料里拷进站点，
 *       顺手算一份体检（题量、答案覆盖、解析覆盖、题型清单）。
 * 输出：web/data/en/<考试>-<年份>.json + index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { emitJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, '_vendor/structured-kaoyan-english/data');
const OUT = path.join(ROOT, 'web/data/en');
const IMG = path.join(OUT, 'img');

const TYPE_LABEL = {
  cloze: '完形填空（Use of English）',
  reading: '阅读理解 Part A',
  gap_fill: '七选五（新题型）',
  ordering: '排序题（新题型）',
  matching: '搭配题（新题型）',
  heading_matching: '段落小标题匹配（新题型）',
  translation: '翻译',
  translation_sentences: '翻译（画线句英译汉）',
  translation_full: '翻译（整段英译汉）',
  writing: '写作',
  other: '其他题型（原料未标注）',
};
const SKILL = {
  cloze: '完形', reading: '阅读', gap_fill: '新题型', matching: '新题型', heading_matching: '新题型', ordering: '新题型',
  translation: '翻译', translation_sentences: '翻译', translation_full: '翻译', writing: '写作', other: '其他',
};

/* 逐题：把 passage 规范化成段落数组，图片引用改成站点内的路径 */
function moveImages(txt, srcDir, tag, seen) {
  return String(txt).replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m0, alt, p) => {
    if (/^https?:/.test(p)) return m0;
    const abs = path.resolve(srcDir, p);
    if (!fs.existsSync(abs)) return `〔配图未随包：${path.basename(p)}〕`;
    const ext = path.extname(abs).toLowerCase().replace('.', '') || 'jpg';
    const name = `${tag}-${path.basename(abs).replace(/\.[^.]+$/, '').slice(0, 24)}.${ext}`;
    if (!seen.has(name)) { fs.mkdirSync(IMG, { recursive: true }); fs.copyFileSync(abs, path.join(IMG, name)); seen.add(name); }
    return `![${alt}](img/${name})`;
  });
}

const toParas = (p) => {
  if (p == null) return [];
  const arr = Array.isArray(p) ? p : String(p).split(/\n\s*\n/);
  return arr.map((x) => String(x).replace(/\r/g, '').trim()).filter(Boolean);
};

function walk(obj, fn) {
  if (typeof obj === 'string') return fn(obj);
  if (Array.isArray(obj)) return obj.map((x) => walk(x, fn));
  if (obj && typeof obj === 'object') { const o = {}; for (const k of Object.keys(obj)) o[k] = walk(obj[k], fn); return o; }
  return obj;
}

fs.mkdirSync(OUT, { recursive: true });
const dirs = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((d) => fs.statSync(path.join(SRC, d)).isDirectory()) : [];
const papers = [];
const seen = new Set();
for (const d of dirs.sort()) {
  const jf = path.join(SRC, d, `${d}.json`);
  if (!fs.existsSync(jf)) { papers.push({ dir: d, usable: false, why: '目录里没有同名 JSON' }); continue; }
  const raw = JSON.parse(fs.readFileSync(jf, 'utf8'));
  const tag = d.replace(/[^0-9-]/g, '');
  const exam = raw.exam === '英语二' ? 'en2' : raw.exam === '英语一' ? 'en1' : (/-2$/.test(d) ? 'en2' : 'en1');
  const doc = walk(raw, (s) => moveImages(s, path.join(SRC, d), tag, seen));
  const sections = (doc.sections || []).map((s) => ({
    title: s.title || '', instructions: s.instructions || '', score: s.score ?? null,
    groups: (s.groups || []).map((g) => {
      const type = g.type || 'other';
      return {
        type, type_label: TYPE_LABEL[type] || type, skill: SKILL[type] || type, title: g.title || '',
        passage: toParas(g.passage),
        passage_cn: toParas(g.passage_translation || g.passage_cn || g.translation),
        options: g.options || null,
        images: (g.images || []).map((im) => (typeof im === 'string' ? im : im.src || im.url || '')).filter(Boolean),
        questions: (g.questions || []).map((q) => ({
          no: q.number ?? q.no ?? null,
          stem: typeof q.stem === 'string' ? q.stem.trim() : (q.stem ? JSON.stringify(q.stem) : ''),
          fill: q.fill || q.blank || q.text || null,
          options: q.options && !Array.isArray(q.options) ? q.options : (Array.isArray(q.options) ? Object.fromEntries(q.options.map((o, i) => [String.fromCharCode(65 + i), o])) : {}),
          score: q.score ?? null,
          answer: q.answer != null ? String(q.answer) : null,
          explanation: q.explanation != null ? String(q.explanation) : (q.analysis != null ? String(q.analysis) : ''),
        })),
      };
    }),
  }));
  const qs = sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  const audit = {
    n: qs.length,
    n_answer: qs.filter((q) => q.answer).length,
    n_explanation: qs.filter((q) => (q.explanation || '').length > 20).length,
    n_stem: qs.filter((q) => (q.stem || '').length > 3 || (q.fill || '')).length,
    objective: qs.filter((q) => Object.keys(q.options || {}).length >= 3).length,
    score_sum: sections.reduce((a, s) => a + (s.score || 0), 0) || null,
    skills: [...new Set(sections.flatMap((s) => s.groups.map((g) => g.skill)))].join('、'),
    images: sections.reduce((a, s) => a + s.groups.reduce((b, g) => b + g.images.length, 0), 0),
    has_passage_cn: sections.some((s) => s.groups.some((g) => g.passage_cn.length)),
  };
  audit.writing_only = audit.objective === 0;
  const rec = {
    year: raw.year ?? +(d.match(/\d{4}/)?.[0] || 0), exam, exam_label: raw.exam || (exam === 'en2' ? '英语二' : '英语一'),
    dir: d, sources: { repo: 'github.com/LIziak112/structured-kaoyan-english', file: `data/${d}/${d}.json` },
    sections, audit,
  };
  emitJS(path.join(OUT, exam + '-' + rec.year + '.js'), 'en/' + exam + '-' + rec.year, rec);
  papers.push({ year: rec.year, exam, usable: true, ...audit });
}

const ok = papers.filter((p) => p.usable);
const sum = (k) => ok.reduce((a, b) => a + (b[k] || 0), 0);
const index = {
  subject: 'english', label: '英语（一 / 二）',
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  repo: 'https://github.com/LIziak112/structured-kaoyan-english',
  note: '真题、答案与逐题解析来自上述开源仓库的结构化数据集；本站只做整形，未改写题干与解析文字。',
  papers: ok, gaps_papers: papers.filter((p) => !p.usable),
  totals: {
    papers: ok.length, en1: ok.filter((p) => p.exam === 'en1').length, en2: ok.filter((p) => p.exam === 'en2').length,
    questions: sum('n'), objective: sum('objective'), with_answer: sum('n_answer'), with_explanation: sum('n_explanation'), images: sum('images'),
  },
};
emitJS(path.join(OUT, 'index.js'), 'en/index', index);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('年份', 6) + pad('卷', 6) + pad('题数', 6) + pad('客观题', 7) + pad('有答案', 7) + pad('有解析', 7) + pad('分值', 6) + pad('配图', 6) + '题型');
for (const p of papers) {
  if (!p.usable) { console.log(pad(p.dir, 12) + p.why); continue; }
  console.log(pad(p.year, 6) + pad(p.exam === 'en1' ? '英语一' : '英语二', 6) + pad(p.n, 6) + pad(p.objective, 7) + pad(p.n_answer, 7) + pad(p.n_explanation, 7) + pad(p.score_sum, 6) + pad(p.images, 6) + p.skills + (p.has_passage_cn ? ' ·含全文译文' : ''));
}
console.log('\n合计：', JSON.stringify(index.totals));
