/* 408 答案抽取：两条通道，可靠度从高到低
 *
 *   1) 逐题块里的显式标记：「N.【参考答案】D」「故选 C」「应选 B」「答案为 A」
 *   2) 卷首网格：要求 1..40 每个号都出现、同号不冲突，否则整张表作废
 *
 * 两条都不成立就留 null，由调用方标「答案待核实」。位置错一位整卷答案全错，
 * 这种代价不能靠猜来冒。
 *
 * 曾有的第 3 条「把卷首 40 个 A-D 按位置对应题号」已删除，原因见文件末尾注释。
 */
const ANS_PAT = /【\s*(?:参考)?答\s*案\s*】\s*[（(]?\s*([A-D])|(?:参考)?答\s*案\s*[）)]?\s*[:：是为选]\s*[（(]?\s*([A-D])|故\s*(?:选|应选|答案选)\s*[（(]?\s*([A-D])|应\s*选\s*[（(]?\s*([A-D])|正确的?选项\s*(?:是|为)\s*[（(]?\s*([A-D])|(?:因此|所以|可见|则)\s*选\s*[（(]?\s*([A-D])(?![A-Za-z])|解\s*答\s*[:：是为]\s*[（(]?\s*([A-D])(?![A-Za-z])/g;

export function answerHits(blk) {
  return [...blk.matchAll(ANS_PAT)]
    .map((m) => ({ letter: m.slice(1).find((x) => x) || null, at: m.index, raw: m[0] }))
    .filter((h) => h.letter);
}

export function answersFromBlock(blk) {
  const hits = answerHits(blk);
  if (!hits.length) return null;
  /* 解析里可能提到别的选项字母，结论总在末尾 —— 取最后一个；前后不一致要报出来 */
  const letters = hits.map((h) => h.letter);
  return { letter: letters[letters.length - 1], at: hits[hits.length - 1].at, raw: hits[hits.length - 1].raw, multi: new Set(letters).size > 1 ? letters.join('/') : null };
}

/** 把块开头的「【参考答案】B」「【解析】」「解答：」这类标记切掉，只留正文。
 *  三个来源的排版都不一样，标记残留成「解析】……」很难看，所以统一走这里。 */
export function stripLeadMarkers(blk) {
  return String(blk || '')
    .replace(/^\s*(?:【\s*(?:参考)?答\s*案\s*】\s*[A-D]?\s*[。.]?\s*)?/, '')
    .replace(/^\s*(?:【\s*(?:解析|详解|解答|分析)\s*】|解\s*析\s*[:：]?|解\s*答\s*[:：]?|答\s*案\s*[:：]?|分\s*析\s*[:：]?)/, '')
    .trim();
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
    const exp = stripLeadMarkers(blk);
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

  /* ---- 3) 字母串通道已删除 ----
     原来「把卷首的 A-D 连成 40 个字母按位置对应」在竖排答案表上是错的：
     答案表常印成「1．B 9．B 17．B 25．C 33．C / 2．B 10．D …」，按文字流读出来是
     1,9,17,25,33,2,10… 而不是 1,2,3…，位置一错整卷全错。
     实测这样读出来的答案与第二来源在 2010 有 29/40 处不一致（随机水平），故只保留
     「题号 + 字母」成对出现的通道（网格与逐题标记），它们天然带题号，不会错位。 */
  return { map: byNo, note };
}
