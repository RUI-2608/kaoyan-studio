/* 408 答案抽取：三条通道，可靠度从高到低
 *
 *   1) 逐题块里的显式标记：「N.【参考答案】D」「故选 C」「应选 B」「答案为 A」
 *   2) 卷首网格：要求 1..40 每个号都出现、同号不冲突，否则整张表作废
 *   3) 卷首 40 字母串：去掉非 A-D 后**正好** 40 个才按位置对应（38、41 个一律不用）
 *
 * 三条都不成立就留 null，由调用方标「答案待核实」。位置错一位整卷答案全错，
 * 这种代价不能靠猜来冒。
 */
const ANS_PAT = /【\s*(?:参考)?答\s*案\s*】\s*[（(]?\s*([A-D])|(?:参考)?答\s*案\s*[）)]?\s*[:：是为选]\s*[（(]?\s*([A-D])|故\s*(?:选|应选|答案选)\s*[（(]?\s*([A-D])|应\s*选\s*[（(]?\s*([A-D])|正确的?选项\s*(?:是|为)\s*[（(]?\s*([A-D])|(?:因此|所以|可见|则)\s*选\s*[（(]?\s*([A-D])(?![A-Za-z])/g;

export function answersFromBlock(blk) {
  const hits = [...blk.matchAll(ANS_PAT)].map((m) => m.slice(1).find((x) => x) || null).filter(Boolean);
  if (!hits.length) return null;
  /* 解析里可能提到别的选项字母，结论总在末尾 —— 取最后一个；前后不一致要报出来 */
  return { letter: hits[hits.length - 1], multi: new Set(hits).size > 1 ? hits.join('/') : null };
}

export function parseAnswers(txt) {
  const byNo = new Map();
  const note = { perQuestion: 0, grid: 0, run: 0, runLength: 0, runKind: null, gridOk: false, conflicts: [], conflictNos: new Set(), ambiguous: 0 };

  /* ---- 1) 逐题块 ----
     注意：答案卷常把「1.【参考答案】B 【解析】… 2.【参考答案】C …」排成同一行，
     所以题号前面允许是空格/句号，不能只认行首。 */
  const marks = [...txt.matchAll(/(?:^|[\n\s。；])(\d{1,2})\s*[.、．:：]\s*(?=【\s*(?:参考)?答\s*案|【\s*解析|(?:参考)?答\s*案\s*】|解析\s*[：:]|答案\s*[：:])/g)];
  for (let i = 0; i < marks.length; i++) {
    const no = +marks[i][1];
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : txt.length;
    const blk = txt.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!(no >= 1 && no <= 60) || blk.length < 4) continue;
    const a = answersFromBlock(blk);
    const exp = blk.replace(/^[^\u4e00-\u9fff]{0,8}?(?:【\s*(?:参考)?答\s*案\s*】|解析|答案)?[^\u4e00-\u9fff]{0,6}/, '').trim();
    const prev = byNo.get(no) || {};
    byNo.set(no, {
      answer: a ? a.letter : (prev.answer || null),
      explanation: exp.length > (prev.explanation || '').length ? exp : prev.explanation,
      src: a ? 'per-question' : (prev.src || null),
    });
    if (a) { note.perQuestion++; if (a.multi) note.ambiguous++; }
  }

  /* 卷首区：只取答案表那一小段 —— 再往后的解析正文里也有「1. A 选项…」，扫全域会造假答案 */
  const stops = [txt.search(/^[\s]*.{0,4}解析/m), txt.search(/\n[ \t]*[一二三四五六][、.．]/), txt.search(/【\s*参考?答\s*案\s*】/)]
    .map((i) => (i > 120 ? i : -1)).filter((i) => i > 0);
  const headEnd = stops.length ? Math.min(...stops, 2600) : Math.min(1800, txt.length);
  const head = txt.slice(0, headEnd);

  /* ---- 2) 网格：全文扫，但要求「从 1 开始逐号递增」连成一条 —— 解析正文里的
        「1. A 选项…」是断开的，接不上这条链，所以不会被当成答案表。 */
  const g = new Map();
  let want = 1, clash = 0;
  for (const m of txt.matchAll(/(?:^|[\s>。；])(\d{1,2})[\s]*[.、．:：][\s]*([A-D])(?![A-Za-z])/g)) {
    const no = +m[1];
    if (no < want || no > want + 1) continue;
    if (no === want + 1) { want = no; }          // 允许中间漏一个号（下一题再接上）
    if (g.has(want) && g.get(want) !== m[2]) clash++;
    else g.set(want, m[2]);
    want += 1;
    if (want > 40) break;
  }
  const covered = [...Array(40)].every((_, i) => g.has(i + 1));
  note.gridOk = !clash && covered;
  note.gridSpan = g.size;
  if (note.gridOk) {
    for (const [no, L] of g) {
      const prev = byNo.get(no) || {};
      if (!prev.answer) { byNo.set(no, { ...prev, answer: L, src: prev.src || 'grid' }); note.grid++; }
      else if (prev.answer !== L) { note.conflicts.push({ no, a: prev.answer, b: L }); note.conflictNos.add(no); }
    }
  }

  /* ---- 3) 字母串：没有可用网格时，看卷首区里的 A-D 字母 ----
     两种形态都要求「正好 40 个」：连续串（2010/2011 那样），或被打散在编号之间但顺序就是 1..40（2013/2016/2017）。
     差一个都不用 —— 位置错一位，整卷答案全错。 */
  if (!note.gridOk) {
    const zone = txt.slice(0, Math.max(2600, txt.length * 0.3));
    const runs = [...zone.matchAll(/[A-D](?:[\s]*[A-D]){25,}/g)]
      .map((m) => m[0].replace(/[^A-D]/g, '')).sort((a, b) => b.length - a.length);
    const contiguous = runs[0] ? runs[0].length : 0;
    const scattered = (zone.slice(0, 900).match(/[A-D]/g) || []).join('');
    const seq = contiguous === 40 ? runs[0] : (scattered.length === 40 ? scattered : null);
    note.runLength = contiguous || scattered.length;
    note.runKind = seq ? (contiguous === 40 ? 'contiguous' : 'scattered') : null;
    if (seq) {
      for (let i = 0; i < 40; i++) {
        const no = i + 1;
        const prev = byNo.get(no) || {};
        if (!prev.answer) { byNo.set(no, { ...prev, answer: seq[i], src: 'letter-run' }); note.run++; }
        else if (prev.answer !== seq[i]) { note.conflicts.push({ no, a: prev.answer, b: seq[i] }); note.conflictNos.add(no); }
      }
    }
  }
  return { map: byNo, note };
}
