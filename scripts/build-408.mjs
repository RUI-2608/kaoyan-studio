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
import { altGrid, altExplanations, altStemMatch } from './lib-408-alt.mjs';
import { thirdYear } from './lib-408-third.mjs';

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

/* 每页页眉/页脚「20XX 年全国硕士研究生…第 2 页（共 11 页）」会被文字层混进题干或选项里
   （每年 11~13 处），整段抹掉再解析 —— 它不是题目内容。 */
const FOOTER_RE = /\d{4}\s*年全国硕士研究生[^0-9]{0,90}?第\s*\d+\s*页[^0-9]{0,4}共\s*\d+\s*页[）)]?/g;
const stripFooter = (t) => t.replace(FOOTER_RE, ' ');

function sectionOf(line) {
  const m = line.match(/^([一二三四五六])\s*[、.．]\s*(.{0,30})/);
  if (!m) return null;
  const kind = /单项选择|选择/.test(m[2]) ? 'choice' : /综合应用|综合/.test(m[2]) ? 'essay' : /其他|应用/.test(m[2]) ? 'other' : null;
  return { cn: m[1], title: m[2].trim(), kind };
}

/* ---------- 试卷 ---------- */
/* 重排 PDF 的文字层里有三种「挤在一行」的排版要拆开：
   1) 选项粘在题干行尾 —— 2022 年第 1 题「sum++; A. O(log n)」，不拆就整题只剩 3 个选项；
   2) 四个选项挤在同一行 —— 2015 年第 37 题；
   3) 选项行末尾直接跟着下一题的题号 —— 同一行「… D. 以太网交换机可… 38.某路由器的路由表如下表所示。」。
   切选项只认「下一个该出现的字母」，而且分隔符限定为 . 或 ．：
   题干里「某系统中有 A、B 两类资源」「站点 A、B、C 通过 CDMA」这种枚举如果也认，
   就会把题干腰斩成选项（第一版就踩了这个，2014/2020 两年被切坏）。 */
const NEXT_OPT = { A: 'B', B: 'C', C: 'D', D: null };

function parsePaper(txt) {
  const lines = txt.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const qs = new Map();
  let cur = null, sec = null, mode = 'stem', optKey = null;
  const push = (t) => { if (!cur) return; if (mode === 'stem') cur.stem.push(t); else if (mode === 'option' && optKey) cur.options[optKey].push(t); };
  const wantLetter = () => (mode === 'option' && optKey ? NEXT_OPT[optKey] : 'A');

  function feed(text) {
    let buf = String(text || '').trim();
    if (!buf || !cur || cur.kind !== 'choice') return false;
    const want0 = wantLetter();
    if (!want0) return false;
    const re = (L) => new RegExp('(?:^|[\\s;；。])(' + L + ')\\s*[.．]\\s*');
    const m0 = re(want0).exec(buf);
    if (!m0) return false;
    const head = buf.slice(0, m0.index).trim();
    let rest = buf.slice(m0.index + m0[0].length).trim();
    if (!rest) return false;
    /* 先把「哪个字母 → 哪段文字」切清楚，再一次性落地；
       边切边写会把上一选项的整段又当成下一选项的前缀重复一遍（第一版就重复了） */
    const parts = [[want0, '']];
    let curL = want0;
    while (NEXT_OPT[curL]) {
      const nx = NEXT_OPT[curL];
      const mm = re(nx).exec(rest);
      if (!mm) break;
      const before = rest.slice(0, mm.index).trim();
      const after = rest.slice(mm.index + mm[0].length).trim();
      if (!after) break;
      parts[parts.length - 1][1] = before;
      parts.push([nx, '']);
      rest = after; curL = nx;
    }
    parts[parts.length - 1][1] = rest;
    if (head) push(head);
    for (const [L, v] of parts) {
      cur.options[L] = cur.options[L] || [];
      if (v) cur.options[L].push(v);
    }
    mode = 'option'; optKey = curL;
    return true;
  }

  function handle(line) {
    const s = sectionOf(line);
    if (s && /题/.test(s.title)) { sec = s; mode = 'stem'; return; }
    const m = line.match(/^(\d{1,2})\s*[.、．]\s*(.*)$/);
    if (m && +m[1] >= 1 && +m[1] <= 60) {
      const no = +m[1];
      if (!cur || no === (cur.no || 0) + 1 || !qs.has(no)) {
        cur = { no, section: sec ? sec.cn : null, kind: sec ? sec.kind : (no <= 40 ? 'choice' : 'essay'), stem: [], options: {}, answer: null, explanation: '' };
        qs.set(no, cur); mode = 'stem';
        if (m[2] && !feed(m[2])) push(m[2]);
        return;
      }
    }
    if (feed(line)) return;
    const o = line.match(/^([A-D])\s*[.、．]\s*(.*)$/);
    if (o && cur && cur.kind === 'choice') { mode = 'option'; optKey = o[1]; (cur.options[o[1]] = cur.options[o[1]] || []).push(o[2]); return; }
    push(line);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let rest = line;
    for (let g = 0; g < 3; g++) {
      const nxt = cur ? cur.no + 1 : null;
      const cut = nxt != null && nxt <= 60 ? new RegExp('[\\s;；。]' + nxt + '\\s*[.、．]\\s*(?=[\\u4e00-\\u9fff(（])').exec(rest) : null;
      if (!cut) { handle(rest); break; }
      handle(rest.slice(0, cut.index + 1).trim());
      rest = rest.slice(cut.index + 1).trim();
      if (!rest) break;
    }
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
const built = [];
for (const year of years) {
  const paperFile = path.join(VENDOR, `papers-rebuild/${year}.pdf`);
  const ansFile = path.join(VENDOR, `answers/${year}-answer.pdf`);
  if (!fs.existsSync(paperFile)) { rows.push({ year, usable: false, why: '仓库里没有这一年的试卷 PDF' }); continue; }
  const rawP = pdfText(paperFile);
  const rawA = fs.existsSync(ansFile) ? pdfText(ansFile) : '';
  const footers = (rawP.match(FOOTER_RE) || []).length + (rawA.match(FOOTER_RE) || []).length;
  const pTxt = stripFooter(rawP);
  const aTxt = stripFooter(rawA);
  if (pTxt.replace(/\s/g, '').length < 3000) { rows.push({ year, usable: false, why: '抽出文字过少，可能这一年是扫描图' }); continue; }
  for (const [src, name] of [[paperFile, `${year}-试卷.pdf`], [ansFile, `${year}-答案解析.pdf`]]) {
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PDF, name));
  }
  fs.writeFileSync(path.join(OUT, `${year}-paper.txt`), pTxt, 'utf8');
  if (aTxt) fs.writeFileSync(path.join(OUT, `${year}-answer.txt`), aTxt, 'utf8');

  const qs = parsePaper(pTxt);
  const { map: key, note: knote } = parseAnswers(aTxt);
  /* 第二来源（CodePanda66 的解析本，有文字层）：主源没有答案/解析时来补，两边都有但不一致就点名。
     但它必须先自证是这一年这套卷子：拿它印的题干和主源逐题比对，八成对不上就整本弃用。
     （2009 一度匹配到「2009-2017 合集」，题号错位——正是这道闸拦下来的。） */
  const alt = altGrid(year);
  const altMatch = altStemMatch(year, qs.map((q) => ({ no: q.no, kind: q.kind, stem: q.stem.join(' ') })));
  /* 闸门：第二来源印的题干要和主源逐题对得上（≥80%，且至少 20 题可比），否则整本弃用。
     过了这道闸，逐题解析块（答案写在题号那一行上）就可以用；答案表网格还额外要求 1..40 凑齐。 */
  const altUsable = altMatch.cmp >= 20 && altMatch.rate >= 0.8;
  const altGridUsable = altUsable && alt.ok;
  const altEx = altUsable ? altExplanations(year) : new Map();
  const altWhy = !alt.file ? '没有第二来源这一年的文件'
    : altMatch.cmp < 20 ? '第二来源里读不出可对照的题干'
    : altMatch.rate < 0.8 ? `第二来源的题干与主源只有 ${Math.round(altMatch.rate * 100)}% 对得上，可能是另一套卷子`
    : null;
  const gridWhy = altWhy || (!alt.ok ? `答案表没凑齐 40 个（有 ${alt.have} 个${alt.clash ? `、自相矛盾 ${alt.clash} 处` : ''}）` : null);
  knote.alt_self_clash = 0;
  const questions = qs.map((q) => {
    const k = key.get(q.no) || {};
    const ae = altEx.get(q.no);
    const stem = q.stem.join(' ').replace(/\s{2,}/g, ' ').replace(/\uFFFD/g, '?').trim();
    const options = Object.fromEntries(Object.entries(q.options).map(([a, v]) => [a, v.join(' ').replace(/\s{2,}/g, ' ').trim()]));
    let answer = k.answer || null, answer_src = k.src || null;
    const altLetter = q.kind === 'choice' && altGridUsable ? alt.map.get(q.no) : null;
    const flags = [];
    if (q.kind === 'choice' && Object.keys(options).length !== 4) flags.push(`选项数 ${Object.keys(options).length}（应 4 个）`);
    if (!stem || stem.length < 8) flags.push('题干过短');
    if (FIG_RE.test(stem) || Object.values(options).some((v) => FIG_RE.test(v))) flags.push('含图：文字版可能不完整，请对原卷');
    if (!answer && altLetter) { answer = altLetter; answer_src = 'alt-grid'; }
    else if (answer && altLetter && altLetter !== String(answer)[0]) {
      knote.conflicts.push({ no: q.no, a: answer, b: altLetter });
      knote.conflictNos.add(q.no);
    }
    /* 逐题解析块里的「解答：X／【答案】X」：题号写在这一行上，比位置网格更可靠。
       同年如果两种排法都在（表格 + 逐题），两值不一致就当没这题的答案，标待核实。 */
    const altBlockLetter = q.kind === 'choice' && ae && ae.answer ? ae.answer : null;
    if (altBlockLetter && altLetter && altBlockLetter !== altLetter) {
      knote.alt_self_clash++;
      knote.conflicts.push({ no: q.no, a: `表${altLetter}`, b: `块${altBlockLetter}` });
      knote.conflictNos.add(q.no);
    } else if (!answer && altBlockLetter) { answer = altBlockLetter; answer_src = 'alt-block'; }
    else if (answer && altBlockLetter && altBlockLetter !== String(answer)[0] && !knote.conflictNos.has(q.no)) {
      knote.conflicts.push({ no: q.no, a: answer, b: altBlockLetter });
      knote.conflictNos.add(q.no);
    }
    if (q.kind === 'choice' && !answer) flags.push(`答案待核实（两个来源都取不到：${altWhy || gridWhy || '主源答案卷没认出这一题'}）`);
    if (answer_src === 'alt-grid') flags.push(`答案取自第二来源参考答案表（${alt.file}，该年题干比对 ${Math.round(altMatch.rate * 100)}% 相符）`);
    if (answer_src === 'alt-block') flags.push(`答案取自第二来源逐题解析（${alt.file}）`);
    if (knote.conflictNos.has(q.no)) flags.push(`两个来源的答案不一致（此处取 ${answer}），务必对原卷`);
    let explanation = k.explanation || '';
    if (!explanation && ae && ae.text) { explanation = ae.text; flags.push('解析取自第二来源'); }
    if (!explanation) flags.push('解析未抽出');
    const g = guessSubject(stem + ' ' + Object.values(options).join(' '));
    return {
      no: q.no, id: `${year}-${q.no}`, kind: q.kind, section: q.section, subject: g.name, subject_hits: g.hits,
      stem, options, answer, answer_src, explanation, flags: [...new Set(flags)],
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
    answer_from: { perQuestion: knote.perQuestion, grid: knote.grid, altGrid: questions.filter((q) => q.answer_src === 'alt-grid').length, altBlock: questions.filter((q) => q.answer_src === 'alt-block').length, gridOk: knote.gridOk },
    conflicts: knote.conflicts.slice(0, 6), n_conflicts: knote.conflicts.length, ambiguous: knote.ambiguous,
    answer_txt_chars: aTxt.replace(/\s/g, '').length,
    /* 替换符是抽取时留下的「这个字认不出」记号，数量进体检，别当成正常文字 */
    ocr_noise: (pTxt.match(/\uFFFD/g) || []).length + (aTxt.match(/\uFFFD/g) || []).length,
    alt: {
      usable: altUsable, why: altWhy, grid_usable: altGridUsable, grid_why: gridWhy, grid_ok: alt.ok,
      file: alt.file || null, have: alt.have || 0, clash: alt.clash || 0, self_clash: knote.alt_self_clash,
      stem_cmp: altMatch.cmp, stem_match: +altMatch.rate.toFixed(3),
      used: questions.filter((q) => q.answer_src === 'alt-grid').length,
      used_block: questions.filter((q) => q.answer_src === 'alt-block').length,
      ex_used: questions.filter((q) => (q.flags || []).includes('解析取自第二来源')).length,
    },
    chars: pTxt.length, footers_stripped: footers, ok: choice.length >= 38 && essay.length >= 5,
  };
  built.push({
    year, questions, audit, rows_note: { altWhy, gridWhy },
    doc: {
      year, subject: '408',
      sources: { repo: 'github.com/neville-studio/408-exam-paper', license: 'MIT', paper: `papers/408/${year}-试卷.pdf`, answer: `papers/408/${year}-答案解析.pdf`,
        alt: altUsable ? { repo: 'github.com/CodePanda66/CSPostgraduate-408', file: `408Exam/${alt.file}`, stem_match: +altMatch.rate.toFixed(3) } : null },
      title: `${year} 年计算机学科专业基础综合试题`,
      sections: [...new Map(questions.map((q) => [q.section, q.section])).keys()].filter(Boolean),
      questions, audit,
    },
  });
  rows.push(audit);
}

/* ---------- 第三来源：先标定通道，再补空 ----------
   这批答案本只有答案没有题干，无法像第二来源那样比对题干自证身份，
   所以拿它去撞本站已经确认过的年份；撞得准（≥90% 且样本 ≥40 题）才允许它补空白年份。 */
const calib = [];
for (const b of built) {
  const e = thirdYear(b.year);
  if (!e) continue;
  const useBlocks = e.blocks.size >= 20;
  const src = useBlocks ? e.blocks : e.grid.map;
  let cmp = 0, agree = 0;
  const dis = [];
  for (const q of b.questions) {
    if (q.kind !== 'choice' || !q.answer || !src.has(q.no)) continue;
    cmp++;
    if (src.get(q.no) === q.answer) agree++;
    else if (dis.length < 4) dis.push(`#${q.no} 本站${q.answer}/三源${src.get(q.no)}`);
  }
  calib.push({ year: b.year, file: e.file, via: useBlocks ? '逐题块' : '答案表', have: e.grid.have, block_have: e.blocks.size, cmp, agree, rate: cmp ? agree / cmp : 0, dis, filled: 0, ex_filled: 0, usable: e.grid.ok || useBlocks });
}
const cmpTotal = calib.reduce((a, c) => a + c.cmp, 0);
const agreeTotal = calib.reduce((a, c) => a + c.agree, 0);
const thirdOk = cmpTotal >= 40 && agreeTotal / cmpTotal >= 0.9;
const thirdRate = cmpTotal ? agreeTotal / cmpTotal : 0;

if (thirdOk) {
  for (const c of calib) {
    const b = built.find((x) => x.year === c.year);
    if (!b) continue;
    const e = thirdYear(b.year);
    if (!e) continue;
    const useBlocks = e.blocks.size >= 20;
    const src = useBlocks ? e.blocks : e.grid.map;
    const calibYears = calib.filter((x) => x.cmp).map((x) => x.year).join('/');
    for (const q of b.questions) {
      if (q.kind !== 'choice' || q.answer || !src.has(q.no)) continue;
      q.answer = src.get(q.no);
      q.answer_src = useBlocks ? 'third-block' : 'third-grid';
      const note = `答案取自第三来源 ${e.file}（该通道在 ${calibYears} 年共 ${agreeTotal}/${cmpTotal} 题与已核实答案一致）`;
      q.flags = [...new Set([...q.flags.filter((f) => !f.startsWith('答案待核实')), note])];
      c.filled++;
    }
    for (const q of b.questions) {
      if ((q.explanation || '').length > 20 || !e.exps.has(q.no)) continue;
      q.explanation = e.exps.get(q.no);
      q.flags = [...new Set([...q.flags.filter((f) => !f.startsWith('解析未抽出')), '解析取自第三来源'])];
      c.ex_filled++;
    }
  }
}

/* 补完重算各年体检数，别让报告停在补之前的数字上 */
for (const b of built) {
  const choice = b.questions.filter((q) => q.kind === 'choice');
  b.audit.n_answer = choice.filter((q) => q.answer).length;
  b.audit.n_explanation = b.questions.filter((q) => (q.explanation || '').length > 20).length;
  const c = calib.find((x) => x.year === b.year);
  b.audit.third = c ? { ...c, channel_ok: thirdOk, channel_rate: +thirdRate.toFixed(3) } : { present: false, channel_ok: thirdOk, channel_rate: +thirdRate.toFixed(3) };
  b.audit.answer_from.third = c ? c.filled : 0;
  b.doc.sources.third = c ? { repo: 'github.com/JDC2001/408', file: `答案/${c.file}`, via: c.via, channel: `标定 ${agreeTotal}/${cmpTotal}` } : null;
}

for (const b of built) emitJS(path.join(OUT, `${b.year}.js`), `p408/${b.year}`, b.doc);

const ok = rows.filter((r) => r.ok);
const sum = (k) => ok.reduce((a, b) => a + (b[k] || 0), 0);
const index = {
  subject: '408', label: '408 计算机学科专业基础',
  built_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  repo: 'https://github.com/neville-studio/408-exam-paper',
  license_note: 'MIT License © Neville Studio；试卷原文版权归命题机构，本站仅作个人备考用途。',
  caveat: '重排版 PDF 的文字里不含插图与部分公式符号；标了「含图」的题务必对照原卷 PDF。题目所属科目是按关键词猜的，可能错。',
  years: rows,
  third: {
    repo: 'github.com/JDC2001/408', adopted: thirdOk, cmp: cmpTotal, agree: agreeTotal, rate: +thirdRate.toFixed(3),
    note: thirdOk ? `第三来源通道在 ${calib.filter((c) => c.cmp).map((c) => c.year).join('/')} 年共 ${cmpTotal} 题上与已核实答案一致（${Math.round(thirdRate * 100)}%），据此补其余年份` : `第三来源通道只撞上 ${agreeTotal}/${cmpTotal}，不到 90%，未采用`,
    per_year: calib,
  },
  totals: {
    years: ok.length, questions: sum('n'), choice: sum('n_choice'), essay: sum('n_essay'),
    with_answer: sum('n_answer'), with_explanation: sum('n_explanation'), figures: sum('n_with_figure'), full_options: sum('n_full_options'),
    from_third: built.reduce((a, y) => a + ((y.audit.third || {}).filled || 0), 0),
    third_ex: built.reduce((a, y) => a + ((y.audit.third || {}).ex_filled || 0), 0),
  },
};
emitJS(path.join(OUT, 'index.js'), 'p408/index', index);

const pad = (v, n) => String(v ?? '').padEnd(n, ' ');
console.log(pad('年份', 6) + pad('题数', 6) + pad('单选', 6) + pad('有答案', 7) + pad('有解析', 7) + pad('满4项', 7) + pad('含图', 6) + pad('答案来源', 40) + '第二源题干比对 / 冲突');
for (const r of rows) {
  if (!r.n && r.why) { console.log(pad(r.year, 6) + r.why); continue; }
  const src = [`逐题${r.answer_from.perQuestion}`, `主源网格${r.answer_from.grid}`, `二源表${r.alt.used}`, `二源逐题${r.alt.used_block}`, `三源${r.answer_from.third || 0}`].join(' ');
  const gate = !r.alt.usable ? `整本弃用（${r.alt.why || '未知原因'}）`
    : r.alt.grid_usable ? `${Math.round(r.alt.stem_match * 100)}% 题干相符·表+逐题` : `${Math.round(r.alt.stem_match * 100)}% 题干相符·只用逐题（${r.alt.grid_why}）`;
  console.log(pad(r.year, 6) + pad(r.n, 6) + pad(r.n_choice, 6) + pad(r.n_answer, 7) + pad(r.n_explanation, 7) + pad(r.n_full_options, 7) + pad(r.n_with_figure, 6) + pad(src, 44) + pad(gate, 34) + (r.n_conflicts ? `${r.n_conflicts} 处：` + r.conflicts.map((c) => `#${c.no} ${c.a}/${c.b}`).slice(0, 2).join(' ') : '无冲突'));
}
console.log('\n第三来源标定（通道级，先撞已知年份再补空）：');
for (const c of calib) {
  console.log(pad(c.year, 6) + pad(c.file, 30) + pad(c.via, 8) + '可比 ' + pad(c.cmp, 4) + '一致 ' + pad(c.agree, 4) + (c.cmp ? pad(Math.round(c.rate * 100) + '%', 6) : pad('—', 6)) + pad('补答案 ' + c.filled, 10) + pad('补解析 ' + c.ex_filled, 11) + c.dis.join(' '));
}
console.log('\n' + index.third.note + (index.third.adopted ? '，已采用' : '，未采用'));
console.log('\n合计：', JSON.stringify(index.totals));
