/* 408 第三来源：JDC2001/408 的「答案/*.pdf」（王道格式：卷首答案表 + 逐题【参考答案】【解析】）
 *
 * CodePanda66 那批只到 2020，neville 主源里 2021/2022 的答案卷是扫描图，所以这一批用来补空年份。
 * 但它只有答案、没有题干，「这一年到底是这套卷子」没法像第二来源那样逐题比对题干来证明，
 * 于是改用通道标定：拿它去撞本站已经确认过的年份（实测 2013/2016/2019 三年 120 题全对），
 * 标定过了（≥90% 且样本够多）才允许它去补没答案的年份；标定结果写进体检页。
 *
 * 答案表单独解析（thirdGrid）：这些书里的表常把两位数拆坏，「12．」印成「1 2.」、「31．」印成「31 .」，
 * 主源那套「题号必须逐号递增」的链式扫法会在这里断掉（实测 2021 只连到 38 个），
 * 所以改成：先在「单项选择题/参考答案」到第一个【解析】之间开窗，窗内允许题号中间有空格。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseAnswers, answersFromBlock, stripLeadMarkers } from './lib-408-answers.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, '_vendor/408-third');
const POPPLER = ['C:/Program Files/Git/mingw64/bin/pdftotext.exe', 'pdftotext'].find((c) => c === 'pdftotext' || fs.existsSync(c)) || 'pdftotext';

const GRID_RE = /(?:^|[\s>。；])(\d[\s]?\d?)[\s]*[.、．:：][\s]*([A-D])(?![A-Za-z])/g;

/** 卷首答案表：题号 1..40 必须齐全、同号不能给出两个字母，否则整表作废 */
export function thirdGrid(txt) {
  const at = txt.search(/单项选择题|参考答案|试题答案/);
  if (at < 0) return { ok: false, map: new Map(), have: 0, clash: 0, why: '找不到答案表起点' };
  const stop = [txt.indexOf('【解析】', at), txt.indexOf('【参考答案】', at), txt.indexOf('解答：', at)].filter((i) => i > at);
  const end = Math.min(stop.length ? stop[0] : at + 4000, at + 4000);
  const win = txt.slice(at, end);
  const g = new Map();
  let clash = 0;
  for (const m of win.matchAll(GRID_RE)) {
    const no = +m[1].replace(/\s/g, '');
    if (no < 1 || no > 40) continue;
    if (g.has(no) && g.get(no) !== m[2]) clash++;
    else g.set(no, m[2]);
  }
  const covered = [...Array(40)].every((_, i) => g.has(i + 1));
  return { ok: covered && !clash, map: g, have: g.size, clash, chars: win.replace(/\s/g, '').length };
}

/** 逐题块：这批书还有一种主源里没见过的排版——「01. D。【解析】……」，
 *  答案字母就贴在题号后面，所以题号后的那个字母单独认下来（主源那套 parseAnswers 不认这种）。
 *  表格里被分栏打乱的答案（2022 的 33~40 漂到别处、自相矛盾 1 处）就靠这里救回来。 */
export function thirdBlocks(text) {
  const answers = new Map();
  const exps = new Map();
  const marks = [...text.matchAll(/(?:^|[\n\s。；])(\d{1,2})\s*[.、．]\s*([A-D])?\s*[。.)）]?\s*(?=【\s*(?:参考)?答\s*案|【\s*解\s*析|解\s*析\s*[:：])/g)];
  for (let i = 0; i < marks.length; i++) {
    const no = +marks[i][1];
    if (!(no >= 1 && no <= 47)) continue;
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const blk = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (blk.length < 8 || blk.length > 4000) continue;
    const fromText = answersFromBlock(blk);
    const letter = marks[i][2] || (fromText ? fromText.letter : null);
    if (letter) {
      const had = answers.get(no);
      if (had === undefined) answers.set(no, letter);
      else if (had !== letter) answers.delete(no);   // 同一题号撞出两个字母：宁可不给
    }
    const exp = stripLeadMarkers(blk);
    if (exp.length > 20 && exp.length > (exps.get(no) || '').length) exps.set(no, exp);
  }
  return { answers, exps };
}

const cache = new Map();

/** { 年份: { file, chars, grid, blocks, note } }，只含有文字层的 */
export function thirdAll() {
  if (cache.size) return cache;
  if (!fs.existsSync(DIR)) return cache;
  for (const f of fs.readdirSync(DIR)) {
    if (!/\.pdf$/i.test(f)) continue;
    const m = f.match(/(20\d\d)/);
    if (!m) continue;
    const year = +m[1];
    let text = '';
    try { text = execFileSync(POPPLER, ['-enc', 'UTF-8', '-q', path.join(DIR, f), '-'], { maxBuffer: 64 << 20 }).toString('utf8'); }
    catch (e) { text = ''; }
    const chars = text.replace(/\s/g, '').length;
    if (chars < 1500) { cache.set(year, { file: f, chars, text: '', grid: { ok: false, map: new Map(), have: 0, clash: 0 }, blocks: new Map(), exps: new Map(), why: '抽出文字过少，这一份是扫描图' }); continue; }
    const grid = thirdGrid(text);
    /* 逐题块（「N.【参考答案】B 【解析】…」与「01. D。【解析】…」两种排版都收） */
    const { map: pm } = parseAnswers(text);
    const tb = thirdBlocks(text);
    const blocks = new Map();
    const exps = new Map();
    for (const [no, v] of pm) {
      if (v && v.src === 'per-question' && v.answer) blocks.set(no, v.answer);
      if (v && (v.explanation || '').length > 20) exps.set(no, v.explanation);
    }
    for (const [no, L] of tb.answers) if (L && !blocks.has(no)) blocks.set(no, L);
    for (const [no, e] of tb.exps) if (e.length > (exps.get(no) || '').length) exps.set(no, e);
    cache.set(year, { file: f, chars, text, grid, blocks, exps });
  }
  return cache;
}

export function thirdYear(year) {
  const all = thirdAll();
  const e = all.get(year);
  if (!e) return null;
  /* 表没凑齐 40 个就不用表（宁可整年不补，也不拿半张表去猜）；只留能自证的通道 */
  if (!e.grid.ok) e.grid = { ok: false, map: new Map(), have: e.grid.have, clash: e.grid.clash, why: '答案表没凑齐 40 个或自相矛盾' };
  if (!e.grid.map.size && e.blocks.size < 20) return null;
  return e;
}
