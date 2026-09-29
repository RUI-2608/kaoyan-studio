/* 408 第二来源：从 CodePanda66 的「真题及答案解析」本里抽参考答案表
 *
 * 这些 PDF 有文字层（neville 那批答案卷有几年是扫描图，抽不出字）。
 * 只认「1..40 全覆盖、同一个号不出现两个不同字母」的网格 —— 差一个号、有一次自相矛盾就整表作废，
 * 因为错位一位就等于把 40 个答案全安错题。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { answersFromBlock, answerHits, stripLeadMarkers } from './lib-408-answers.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ALT = path.join(ROOT, '_vendor/408-alt');
const POPPLER = ['C:/Program Files/Git/mingw64/bin/pdftotext.exe', 'pdftotext'].find((c) => c === 'pdftotext' || fs.existsSync(c)) || 'pdftotext';

const cache = new Map();
export function altFile(year) {
  if (!fs.existsSync(ALT)) return null;
  /* 文件名有「2019年…」「2020-408(讨论答案)」两种写法，还有一份「2009-2017年…真题及参考答案」合集。
     合集里有九年，按题号切不出这一年，所以优先取「<年份>年」开头的单本，合集只做兜底。 */
  const hits = fs.readdirSync(ALT).filter((f) => f.startsWith(String(year)) && /\.pdf$/i.test(f));
  if (!hits.length) return null;
  const best = hits.sort((a, b) => {
    const score = (f) => (new RegExp(`^${year}\\s*年`).test(f) ? 0 : new RegExp(`^${year}[^0-9]`).test(f) ? 1 : 2);
    return score(a) - score(b) || b.length - a.length;
  })[0];
  return path.join(ALT, best);
}
export function altText(year) {
  if (cache.has(year)) return cache.get(year);
  const f = altFile(year);
  let txt = '';
  if (f) {
    try { txt = execFileSync(POPPLER, ['-enc', 'UTF-8', '-q', f, '-'], { maxBuffer: 64 << 20 }).toString('utf8').replace(/\uFFFD/g, ''); }
    catch (e) { txt = ''; }
  }
  cache.set(year, txt);
  return txt;
}

/* 参考答案网格：只在「参考答案」这一小段里找。
   全文扫会把解析正文里的「1. A 选项…」当成答案表（2016 就这么冒出过一次自相矛盾）。 */
export function altGrid(year) {
  const txt = altText(year);
  const file = altFile(year);
  if (!txt || !file) return { ok: false, map: new Map(), file: null, chars: 0, have: 0, clash: 0 };
  const at = txt.search(/参考答案|试题答案|答案\s*$/m);
  const win = at >= 0 ? txt.slice(at, at + 6000) : txt.slice(0, 6000);
  const g = new Map();
  let clash = 0;
  for (const m of win.matchAll(/(?:^|[\s>、。；])(\d{1,2})[\s]*[.、．:：][\s]*([A-D])(?![A-Za-z0-9])/g)) {
    const no = +m[1];
    if (no < 1 || no > 40) continue;
    if (g.has(no) && g.get(no) !== m[2]) clash++;
    else g.set(no, m[2]);
  }
  const covered = [...Array(40)].every((_, i) => g.has(i + 1));
  return { ok: !clash && covered, map: g, file: path.basename(file), chars: txt.replace(/\s/g, '').length, clash, have: g.size, anchored: at >= 0 };
}

/* 第二来源里也印了试卷正文。要动用它的答案表，先拿题干对一遍：
   题干对不上，说明这份 PDF 可能是另一套卷子（或者年份标错），答案表再好也不能用。 */
const PAPER_CUT = /参考答案|试题答案|答案\s*与\s*解析|解析\s*与\s*答案|\u3010\s*答\s*案\s*\u3011/;

export function normStem(s) {
  return String(s || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
    .toLowerCase();
}

/** 从第二来源的试卷部分按题号收题干（跳过 A~D 选项行） */
export function altStems(year) {
  const txt = altText(year);
  const out = new Map();
  if (!txt) return out;
  const cut = txt.search(PAPER_CUT);
  const head = cut > 3000 ? txt.slice(0, cut) : txt;
  let cur = null;
  for (const raw of head.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[A-D]\s*[.、．:：]/.test(line)) continue;
    if (/^[一二三四五六]\s*[、.．]/.test(line)) { cur = null; continue; }
    const m = line.match(/^(\d{1,2})\s*[.、．]\s*(.*)$/);
    if (m && +m[1] >= 1 && +m[1] <= 40) {
      cur = +m[1];
      out.set(cur, ((out.get(cur) || '') + m[2]).slice(0, 400));
      continue;
    }
    if (cur !== null && out.has(cur)) out.set(cur, (out.get(cur) + line).slice(0, 400));
  }
  return out;
}

/** 与主源题干逐题比对，返回匹配率；调用方用 rate >= 0.8 作为闸门
 *  两边都是翻印件，会有「己知/已知」「三又树/三叉树」「节点/结点」这类单字错，所以除了前缀相同，
 *  再算一次前 60 字的字符重合度。实测：同一年同题的重合度中位数 1.00、5% 分位 0.89，
 *  而故意把 2010 与 2013 的题错位相比重合度最大只到 0.33 —— 0.6 这条线两边都离得远。 */
function charOverlap(a, b) {
  const n = Math.min(a.length, b.length, 60);
  if (n < 8) return 0;
  const s = a.slice(0, n), t = b.slice(0, n);
  const cnt = new Map();
  for (const ch of s) cnt.set(ch, (cnt.get(ch) || 0) + 1);
  let hit = 0;
  for (const ch of t) { const c = cnt.get(ch) || 0; if (c > 0) { cnt.set(ch, c - 1); hit++; } }
  return hit / n;
}

export function altStemMatch(year, questions) {
  const stems = altStems(year);
  let cmp = 0, hit = 0;
  const bad = [];
  for (const q of questions) {
    if (q.kind !== 'choice' || q.no > 40) continue;
    const otherRaw = stems.get(q.no);
    const other = normStem(otherRaw);
    if (!other) continue;
    const mine = normStem(q.stem);
    if (mine.length < 8 || other.length < 8) continue;
    cmp++;
    let lcp = 0;
    while (lcp < Math.min(mine.length, other.length) && mine[lcp] === other[lcp]) lcp++;
    const ratio = lcp / Math.min(mine.length, other.length);
    const sub = mine.includes(other.slice(0, 10)) || other.includes(mine.slice(0, 10));
    const ovl = charOverlap(mine, other);
    if (ratio >= 0.6 || sub || ovl >= 0.6) hit++;
    else if (bad.length < 8) bad.push({ no: q.no, lcp: +ratio.toFixed(2), ovl: +ovl.toFixed(2), a: q.stem.slice(0, 26), b: String(otherRaw).slice(0, 26) });
  }
  return { have: stems.size, cmp, hit, rate: cmp ? hit / cmp : 0, bad };
}

/* 逐题块：这些解析本排版五花八门——
   2009/2010 是「1．B」式表格（走 altGrid），2011 是「题干 + 选项 + 解答：C。……」穿插排，
   2013 起又是「1．【答案】B【解析】…」。所以这里只认「行首题号」切块，
   块内答案交给 answersFromBlock（题号就写在这一块的开头，天然成对，不会错位）。
   只有块里确实出现「解答：／解析：／【答案】」这类字样才算解析，免得把题干当解析。 */
const HAS_EXPLAIN = /解\s*答\s*[:：]|【\s*解\s*析|解\s*析\s*[:：]|【\s*(?:参考)?答\s*案|答\s*案\s*[:：]/;

export function altExplanations(year) {
  const txt = altText(year);
  const out = new Map();
  const marks = [...txt.matchAll(/(?:^|[\n\s。；])(\d{1,2})\s*[.、．]\s*(?=[\u4e00-\u9fffA-Za-z（(【\u3000])/g)];
  for (let i = 0; i < marks.length; i++) {
    const no = +marks[i][1];
    if (!(no >= 1 && no <= 47)) continue;
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : txt.length;
    const blk = txt.slice(start, end).replace(/\s+/g, ' ').trim();
    if (blk.length < 12 || blk.length > 4000 || !HAS_EXPLAIN.test(blk)) continue;
    const a = answersFromBlock(blk);
    /* 字母取块里最后一个结论（前面出现的往往是「A 选项错在…」），
       解析正文从第一个答案标记之后截，这样题干和选项不会被当成解析抄进来。 */
    const first = answerHits(blk)[0];
    const exp = stripLeadMarkers(first ? blk.slice(first.at + first.raw.length) : blk);
    const prev = out.get(no);
    if (!prev || exp.length > prev.text.length) out.set(no, { answer: a ? a.letter : null, text: exp });
  }
  return out;
}
