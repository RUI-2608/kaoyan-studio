/* 408 真题构建器
 *
 * 原料：neville-studio/408-exam-paper（MIT）—— 2009-2025 试卷与答案解析，
 *       是「按图片重排的文字版 PDF」，poppler 能抽出中文。
 * 已知短板：插图（树、电路、网络拓扑）不会进文字，所以题干里出现「如图/下图」的题
 *            一律打旗标「含图，文字版可能不完整」，并给出原卷 PDF 入口 —— 不做任何补全猜测。
 * 输出：web/data/p408/<年>.js + index.js，并把原卷 PDF 拷进 web/papers/408/
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { emitJS } from './lib-emit.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VENDOR = path.join(ROOT, '_vendor/408-exam-paper');
const OUT = path.join(ROOT, 'web/data/p408');
const PDF = path.join(ROOT, 'web/papers/408');
import { parseAnswers } from './lib-408-answers.mjs';

const POPPLER = ['C:/Program Files/Git/mingw64/bin/pdftotext.exe', 'C:/Program Files (x86)/Git/mingw64/bin/pdftotext.exe', 'pdftotext']
  .find((c) => c === 'pdftotext' || fs.existsSync(c)) || 'pdftotext';

function pdfText(file) {
  if (!fs.existsSync(file)) return '';
  return execFileSync(POPPLER, ['-enc', 'UTF-8', '-q', file, '-'], { maxBuffer: 64 << 20 }).toString('utf8');
}

/* 题号-科目对应表各年不同，这里只按题干关键词给一个「自动归类」，页面上明说是猜的 */
const SUBJECT_KEYS = [
  ['数据结构', /链表|结点|指针|栈|队列|二叉树|哈夫曼|遍历|排序|查找|散列|哈希|堆|并查集|串|KMP|矩阵压缩|图|有向|无向|拓扑|生成树|关键路径|时间复杂度|空间复杂度|递归|数组|线性表|完全二叉树|平衡|B树|B\+树|基数|归并|快排|希尔|插入|选择|代价|路径长度|序列/],
  ['计算机组成原理', /指令|寻址|Cache|缓存|主存|存储程序|流水线|补码|原码|反码|移码|溢出|ALU|寄存器|总线路|总线|DMA|访存|地址|编址|微操作|微指令|时钟周期| CPI|字长|闪存|磁盘|硬盘|存取|译码器|数据通路|控制器|数制|浮点|IEEE|海明码|校验|码元/],
  ['操作系统', /进程|线程|调度|死锁|信号量|PV|管程|页面|缺页|段页|虚地址|虚拟存储|文件系统|索引节点|FCB|SPOOLing|假脱机|中断向量|系统调用|管态|目态|特权指令|对换|工作集| Belady|银行家|缓冲区|设备分配|临界区|唤醒|阻塞|就绪/],
  ['计算机网络', /以太网|CSMA|MAC|ARP|IP 地址|子网|路由|RIP|OSPF|BGP|TCP|UDP|滑动窗口|拥塞|慢开始|确认号|握手|HTTP|DNS|SMTP|FTP|POP3|DHCP|ICMP|CRC|曼彻斯特|奈奎斯特|香农|信道|带宽|时延|波特|复用|VLAN| PPP|帧|比特填充|组播|NAT|TLS|证书|前缀码|海明距离/],
];
function guessSubject(text) {
  const score = SUBJECT_KEYS.map(([name, re]) => [name, (text.match(new RegExp(re.source, 'g')) || []).length]);
  score.sort((a, b) => b[1] - a[1]);
  return score[0][1] ? { name: score[0][0], hits: score[0][1] } : { name: null, hits: 0 };
}

const FIG_RE = /如题?\s?\d*\s?图|如图|下图|上图|所示的图|示意图|流程图如下|逻辑电路|波形图|电路图|拓扑结构如图|树形图|如下左图|如下右图/;

function sectionOf(line) {
  const m = line.match(/^([一二三四五六])\s*[、.．]\s*(.{0,30})/);
  if (!m) return null;
  const kind = /单项选择|选择/.test(m[2]) ? 'choice' : /综合应用|综合/.test(m[2]) ? 'essay' : /其他|应用/.test(m[2]) ? 'other' : null;
  return { cn: m[1], title: m[2].trim(), kind };
}

/* ---------- 试卷 ---------- */
function parsePaper(txt) {
  const lines = txt.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const qs = new Map();
  let cur = null, sec = null, mode = 'stem', optKey = null;
  const push = (t) => { if (!cur) return; if (mode === 'stem') cur.stem.push(t); else if (mode === 'option' && optKey) cur.options[optKey].push(t); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const s = sectionOf(line);
    if (s && /题/.test(s.title)) { sec = s; mode = 'stem'; continue; }
    let m = line.match(/^(\d{1,2})\s*[.、．]\s*(.*)$/);
    if (m && +m[1] >= 1 && +m[1] <= 60) {
      const no = +m[1];
      if (!cur || no === (cur.no || 0) + 1 || !qs.has(no)) {
        cur = { no, section: sec ? sec.cn : null, kind: sec ? sec.kind : (no <= 40 ? 'choice' : 'essay'), stem: [], options: {}, answer: null, explanation: '' };
        qs.set(no, cur); mode = 'stem';
        if (m[2]) push(m[2]);
        continue;
      }
    }
    m = line.match(/^([A-D])\s*[.、．]\s*(.*)$/);
    if (m && cur && cur.kind === 'choice') { mode = 'option'; optKey = m[1]; (cur.options[m[1]] = cur.options[m[1]] || []).push(m[2]); continue; }
    push(line);
  }
  return [...qs.values()].sort((a, b) => a.no - b.no);
}

/* 答案抽取（三条通道 + 可靠性门槛）拆到 lib-408-answers.mjs，见该文件注释 */

/* ---------- 主流程 ---------- */
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PDF, { recursive: true });
const years = [];
for (let y = 2009; y <= 2025; y++) years.push(y);

const rows = [];
for (const year of years) {
  const paperFile = path.join(VENDOR, `papers-rebuild/${year}.pdf`);
  const ansFile = path.join(VENDOR, `answers/${year}-answer.pdf`);
  if (!fs.existsSync(paperFile)) { rows.push({ year, usable: false, why: '仓库里没有这一年的试卷 PDF' }); continue; }
  const pTxt = pdfText(paperFile);
  const aTxt = fs.existsSync(ansFile) ? pdfText(ansFile) : '';
  if (pTxt.replace(/\s/g, '').length < 3000) { rows.push({ year, usable: false, why: '抽出文字过少，可能这一年是扫描图' }); continue; }
  for (const [src, name] of [[paperFile, `${year}-试卷.pdf`], [ansFile, `${year}-答案解析.pdf`]]) {
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PDF, name));
  }
  fs.writeFileSync(path.join(OUT, `${year}-paper.txt`), pTxt, 'utf8');
  if (aTxt) fs.writeFileSync(path.join(OUT, `${year}-answer.txt`), aTxt, 'utf8');

  const qs = parsePaper(pTxt);
  const { map: key, note: knote } = parseAnswers(aTxt);
  const questions = qs.map((q) => {
    const k = key.get(q.no) || {};
    const stem = q.stem.join(' ').replace(/\s{2,}/g, ' ').replace(/\uFFFD/g, '?').trim();
    const options = Object.fromEntries(Object.entries(q.options).map(([a, v]) => [a, v.join(' ').replace(/\s{2,}/g, ' ').trim()]));
    const flags = [];
    if (q.kind === 'choice' && Object.keys(options).length !== 4) flags.push(`选项数 ${Object.keys(options).length}（应 4 个）`);
    if (!stem || stem.length < 8) flags.push('题干过短');
    if (FIG_RE.test(stem) || Object.values(options).some((v) => FIG_RE.test(v))) flags.push('含图：文字版可能不完整，请对原卷');
    if (q.kind === 'choice' && !k.answer) flags.push('答案待核实（本年答案卷是扫描件或排版没认出来）');
    if (k.src === 'letter-run') flags.push(knote.runKind === 'scattered' ? '答案按卷首字母表顺序对应题号' : '答案取自卷首 40 字母串（按位置对应）');
    if (knote.conflictNos.has(q.no)) flags.push(`答案的两个来源不一致（此处取 ${k.answer}），务必对原卷`);
    if (!(k.explanation || '').length) flags.push('解析未抽出');
    const g = guessSubject(stem + ' ' + Object.values(options).join(' '));
    return {
      no: q.no, id: `${year}-${q.no}`, kind: q.kind, section: q.section, subject: g.name, subject_hits: g.hits,
      stem, options, answer: k.answer || null, answer_src: k.src || null, explanation: k.explanation || '', flags: [...new Set(flags)],
    };
  });
  const choice = questions.filter((q) => q.kind === 'choice');
  const essay = questions.filter((q) => q.kind !== 'choice');
  const audit = {
    year, n: questions.length, n_choice: choice.length, n_essay: essay.length,
    n_answer: choice.filter((q) => q.answer).length,
    n_explanation: questions.filter((q) => (q.explanation || '').length > 20).length,
    n_full_options: choice.filter((q) => Object.keys(q.options).length === 4).length,
    n_with_figure: questions.filter((q) => q.flags.some((f) => f.startsWith('含图'))).length,
    n_unknown_subject: questions.filter((q) => !q.subject).length,
    answer_from: { perQuestion: knote.perQuestion, grid: knote.grid, run: knote.run, runLength: knote.runLength, runKind: knote.runKind, gridOk: knote.gridOk },
    conflicts: knote.conflicts.slice(0, 6), n_conflicts: knote.conflicts.length, ambiguous: knote.ambiguous,
    answer_txt_chars: aTxt.replace(/\s/g, '').length,
    /* 替换符是抽取时留下的「这个字认不出」记号，数量进体检，别当成正常文字 */
    ocr_noise: (pTxt.match(/\uFFFD/g) || []).length + (aTxt.match(/\uFFFD/g) || []).length,
    chars: pTxt.length, ok: choice.length >= 38 && essay.length >= 5,
  };
  emitJS(path.join(OUT, `${year}.js`), `p408/${year}`, {
    year, subject: '408',
    sources: { repo: 'github.com/neville-studio/408-exam-paper', license: 'MIT', paper: `papers/408/${year}-试卷.pdf`, answer: `papers/408/${year}-答案解析.pdf` },
    title: `${year} 年计算机学科专业基础综合试题`,
    sections: [...new Map(questions.map((q) => [q.section, q.section])).keys()].filter(Boolean),
    questions, audit,
  });
  rows.push(audit);
}

const ok = rows.filter((r) => r.ok);
const sum = (k) => ok.reduce((a, b) => a + (b[k] || 0), 0);
const index = {
  subject: '408', label: '408 计算机学科专业基础',
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  repo: 'https://github.com/neville-studio/408-exam-paper',
  license_note: 'MIT License © Neville Studio；试卷原文版权归命题机构，本站仅作个人备考用途。',
  caveat: '重排版 PDF 的文字里不含插图与部分公式符号；标了「含图」的题务必对照原卷 PDF。题目所属科目是按关键词猜的，可能错。',
  years: rows,
  totals: {
    years: ok.length, questions: sum('n'), choice: sum('n_choice'), essay: sum('n_essay'),
    with_answer: sum('n_answer'), with_explanation: sum('n_explanation'), figures: sum('n_with_figure'), full_options: sum('n_full_options'),
  },
};
emitJS(path.join(OUT, 'index.js'), 'p408/index', index);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('年份', 6) + pad('题数', 6) + pad('单选', 6) + pad('有答案', 7) + pad('有解析', 7) + pad('满4项', 7) + pad('含图', 6) + pad('答案来源', 22) + '冲突');
for (const r of rows) {
  if (!r.n && r.why) { console.log(pad(r.year, 6) + r.why); continue; }
  const src = [`逐题${r.answer_from.perQuestion}`, `网格${r.answer_from.grid}`, `字母串${r.answer_from.run}/${r.answer_from.runLength}${r.answer_from.runKind ? '(' + r.answer_from.runKind + ')' : ''}`].join(' ');
  console.log(pad(r.year, 6) + pad(r.n, 6) + pad(r.n_choice, 6) + pad(r.n_answer, 7) + pad(r.n_explanation, 7) + pad(r.n_full_options, 7) + pad(r.n_with_figure, 6) + pad(src, 30) + (r.n_conflicts ? `${r.n_conflicts} 处：` + r.conflicts.map((c) => `#${c.no} ${c.a}/${c.b}`).slice(0, 2).join(' ') : '无冲突'));
}
console.log('\n合计：', JSON.stringify(index.totals));
