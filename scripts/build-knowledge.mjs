/* 知识卡片构建器：content/knowledge/<科目>.md -> web/data/know/<科目>.js
 *
 * 卡片格式（+++ 分隔，前置字段 + 正文 markdown）：
 *   +++
 *   id: ds-01
 *   chapter: 一、算法与复杂度
 *   title: 时间复杂度怎么判
 *   tags: 必考,选择
 *   freq: 高
 *   scope: 数一,数二        （可选，数学卡用）
 *   +++
 *   正文…
 * 校验：缺 id/chapter/title/正文、id 重复、字段名不认识 —— 当场报错不出门。
 */
import fs from 'node:fs';
import path from 'node:path';
import { emitJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content/knowledge');
const OUT = path.join(ROOT, 'web/data/know');

const SUBJECTS = {
  ds: { label: '数据结构', code: '408 第 1 科', weight: '约 45 分', order: 1,
    note: '408 里分值最高的一科，代码大题 2 题约 15 分都出自这科。' },
  co: { label: '计算机组成原理', code: '408 第 2 科', weight: '约 45 分', order: 2,
    note: '计算题密度最大：地址划分、Cache、流水线、扩片。公式与位数划分是主要失分点。' },
  os: { label: '操作系统', code: '408 第 3 科', weight: '约 35 分', order: 3,
    note: '与组成原理重叠多（存储、I/O），概念辨析题多，背结构就能拿分。' },
  cn: { label: '计算机网络', code: '408 第 4 科', weight: '约 25 分', order: 4,
    note: '四科里最好拿分也最容易记混：协议字段、端口号、时延计算要单独整理。' },
  math: { label: '数学（一 / 二）公式与结论', code: '数学', weight: '150 分', order: 5,
    note: '数一/数二/数三的科目范围以当年《考试大纲》为准；卡片上的 scope 标注是常见归属，个别条目（如欧拉方程、伯努利方程、三重积分）请对照当年大纲核实。' },
};
const ALLOWED = new Set(['id', 'chapter', 'title', 'tags', 'freq', 'scope', 'minutes']);
const KNOWN_TITLES = ['一、', '二、', '三、', '四、', '五、', '六、', '七、', '八、', '九、', '十、'];

function parseFile(name, txt) {
  const errors = [];
  const cards = [];
  const blocks = txt.split(/^\+\+\+[ \t]*$/m);
  /* 文件以 +++ 开头：blocks[0] 为空，之后奇偶交替（front, body, front, body…） */
  for (let i = 1; i < blocks.length; i += 2) {
    const head = blocks[i] || '';
    const body = (blocks[i + 1] || '').trim();
    const meta = {};
    for (const line of head.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
      if (!m) { errors.push(`${name}: 字段行写法不对「${line.slice(0, 30)}」`); continue; }
      if (!ALLOWED.has(m[1])) errors.push(`${name}: 不认识的字段「${m[1]}」`);
      meta[m[1]] = m[2].trim();
    }
    for (const k of ['id', 'chapter', 'title']) if (!meta[k]) errors.push(`${name}: 卡片缺 ${k}（${meta.id || '?'}）`);
    if (meta.id && !/^[a-z]{2,4}-\d{2}$/.test(meta.id)) errors.push(`${name}: id 格式应为 ss-nn（${meta.id}）`);
    if (body.length < 120) errors.push(`${name}/${meta.id}: 正文太短（${body.length} 字）`);
    if (/(待补|TODO|TBD|XXX)/.test(body)) errors.push(`${name}/${meta.id}: 正文里有未完成的占位词`);
    cards.push({
      id: meta.id, chapter: meta.chapter, title: meta.title, body,
      tags: (meta.tags || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      freq: meta.freq || '中', scope: (meta.scope || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      minutes: +(meta.minutes || Math.max(6, Math.round(body.length / 220))),
      chars: body.length,
    });
  }
  if ((txt.match(/^\+\+\+[ \t]*$/gm) || []).length % 2) errors.push(`${name}: +++ 分隔符不是成对的，卡片会漏`);
  return { cards, errors };
}

const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.endsWith('.md')) : [];
const errors = [];
const seenId = new Map();
const index = [];
let total = 0;
for (const f of files) {
  const key = f.replace(/\.md$/, '');
  const sub = SUBJECTS[key];
  if (!sub) { errors.push(`${f}: 没有这个科目（可登记：${Object.keys(SUBJECTS).join('/')}）`); continue; }
  const { cards, errors: e2 } = parseFile(f, fs.readFileSync(path.join(SRC, f), 'utf8'));
  errors.push(...e2);
  for (const c of cards) {
    if (seenId.has(c.id)) errors.push(`${f}: id 重复 ${c.id}（已在 ${seenId.get(c.id)}）`);
    else seenId.set(c.id, f);
  }
  emitJS(path.join(OUT, `${key}.js`), `know/${key}`, { subject: key, ...sub, cards });
  index.push({
    subject: key, label: sub.label, code: sub.code, weight: sub.weight, order: sub.order, note: sub.note,
    cards: cards.length, chars: cards.reduce((a, c) => a + c.chars, 0),
    minutes: cards.reduce((a, c) => a + c.minutes, 0),
    chapters: [...new Set(cards.map((c) => c.chapter))],
    tags: [...new Set(cards.flatMap((c) => c.tags))],
    freqs: { 高: cards.filter((c) => c.freq === '高').length, 中: cards.filter((c) => c.freq === '中').length, 低: cards.filter((c) => c.freq === '低').length },
  });
  total += cards.length;
}
index.sort((a, b) => a.order - b.order);
const manifest = {
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  source: '本地手写（依据 408 考试大纲与通行教材整理，不复制任何第三方受版权保护的讲义）',
  caveat: '「考频」是按题型惯例给出的人工判断，不是官方统计；大纲与分值以当年《考试大纲》《考试分析》为准。',
  subjects: index, total_cards: total,
};
emitJS(path.join(OUT, 'index.js'), 'know/index', manifest);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('科目', 22) + pad('卡片', 6) + pad('字数', 8) + pad('建议分钟', 8) + '章');
for (const s of index) console.log(pad(s.label, 22) + pad(s.cards, 6) + pad(s.chars, 8) + pad(s.minutes, 8) + s.chapters.length);
console.log('\n合计卡片：', total, '| 字数：', index.reduce((a, b) => a + b.chars, 0));
if (errors.length) { console.log('\n校验不通过：'); errors.forEach((e) => console.log(' -', e)); process.exitCode = 1; }
else console.log('校验：全部通过');
