/* 视图（续）：408 真题 / 英语真题 / 知识库 / 收藏错题 / 数据体检 */
'use strict';

/* ================= 408 ================= */
route(/^p408$/, async (v) => {
  const idx = await M.pIdx();
  const tile = (y) => `<a class="tile ${y.ok ? '' : 'raw'}" href="#/p408/${y.year}">
    <div class="yr">${y.year}</div>
    <div class="meta">${y.n || 0} 题（单选 ${y.n_choice || 0} · 综合 ${y.n_essay || 0}）</div>
    <div class="meta">答案 ${y.n_answer || 0}/${y.n_choice || 0} · 解析 ${y.n_explanation || 0} · 含图 ${y.n_with_figure || 0}</div>
    <span class="badges">${y.n_answer >= (y.n_choice || 1) ? chip('答案齐', 'ok') : y.n_answer ? chip('部分缺答', 'gold') : chip('只有原卷', 'warn')}</span>
  </a>`;
  const full = idx.years.filter((y) => y.n_answer >= (y.n_choice || 1));
  const part = idx.years.filter((y) => y.n_answer && y.n_answer < (y.n_choice || 1));
  const none = idx.years.filter((y) => !y.n_answer);
  v.innerHTML = `
  <h1 class="page">408 计算机学科专业基础<small>2009-2025</small></h1>
  <p class="sub">来源：${esc(idx.repo)}（MIT）。原卷与答案 PDF 已一并放进 <span class="kbd">papers/408/</span>，含图的题务必回原卷看。</p>
  <div class="sect-h">答案齐全（${full.length} 年）</div><div class="grid">${full.map(tile).join('')}</div>
  <div class="sect-h">部分有答案（${part.length} 年）</div><div class="grid">${part.map(tile).join('')}</div>
  <div class="sect-h">只有原卷 PDF（${none.length} 年 · 答案卷是扫描件）</div><div class="grid">${none.map(tile).join('')}</div>
  <div class="sheet dark md" style="margin-top:16px">${rich(idx.caveat)}</div>`;
});

route(/^p408\/(\d{4})$/, async (v, [y]) => {
  const year = +y;
  const doc = await M.p408(year);
  const key = 'p408:' + year;
  const s = sess(key);
  const choice = doc.questions.filter((q) => q.kind === 'choice');
  const essay = doc.questions.filter((q) => q.kind !== 'choice');
  const bySubject = {};
  doc.questions.forEach((q) => { const k = q.subject || '未归类'; (bySubject[k] = bySubject[k] || []).push(q); });
  v.innerHTML = `
  <div class="row" style="margin-bottom:10px">
    <a class="btn ghost sm" href="#/p408">‹ 回 408 列表</a>
    <h1 class="page" style="margin:0">${doc.title}<small>${doc.audit.n} 题</small></h1>
    <span class="spacer"></span>
    <div class="modes" data-modes="${key}"><button data-mode="recite" class="${s.mode === 'recite' ? 'on' : ''}">背题</button><button data-mode="exam" class="${s.mode === 'exam' ? 'on' : ''}">考试</button></div>
    <a class="btn sm" href="${esc(doc.sources.paper)}" target="_blank">原卷 PDF</a>
    <a class="btn sm" href="${esc(doc.sources.answer)}" target="_blank">答案 PDF</a>
    <button class="btn sm" data-act="print">打印</button>
  </div>
  ${timerHTML(key)}
  <div class="sheet">
    <div class="row"><span class="chip dim">单选 ${choice.length}</span><span class="chip dim">综合 ${essay.length}</span>
      <span class="chip gold">按关键词猜的科目分类，可能错</span>
      <span class="spacer"></span><button class="btn primary sm" data-submit="${key}" ${s.mode === 'exam' ? '' : 'disabled'}>提交判分</button></div>
    <div id="scorebox"></div>
    <div class="en-tools" style="margin-top:10px">${Object.keys(bySubject).map((k) => `<button class="btn sm" data-jump="sub-${esc(k)}">${esc(k)} ${bySubject[k].length}</button>`).join('')}</div>
    <hr class="rule">
    ${Object.entries(bySubject).map(([k, list]) => `<div class="sect-h" id="sub-${esc(k)}" style="color:#7a5f21;font-size:1em">${esc(k)}<span class="note" style="margin-left:8px">按题干关键词自动归类</span></div>
      ${list.map((q, i) => qcard(q, i, q.kind === 'choice' ? 'p408' : 'essay', key)).join('')}`).join('')}
  </div>`;
  paintScore(key, doc.questions, 'p408');
});

/* ================= 英语 ================= */
route(/^en$/, async (v) => {
  const idx = await M.enIdx();
  const one = (p) => `<a class="tile" href="#/en/${p.exam}/${p.year}">
    <div class="yr">${p.year} <span style="font-size:.6em">${p.exam === 'en1' ? '英语一' : '英语二'}</span></div>
    <div class="meta">${p.n} 题 · 客观题 ${p.objective}</div>
    <div class="meta">解析 ${pct(p.n_explanation, p.n)} · ${esc(p.skills)}</div></a>`;
  const en1 = idx.papers.filter((p) => p.exam === 'en1').reverse();
  const en2 = idx.papers.filter((p) => p.exam === 'en2').reverse();
  v.innerHTML = `
  <h1 class="page">英语真题<small>${idx.papers.length} 套 · 1998-2025</small></h1>
  <p class="sub">来源：${esc(idx.repo)}。每道题都带答案与逐题精解；文章与题目左右分栏（横屏时）。</p>
  <div class="sect-h">英语一（${en1.length} 年）</div><div class="grid">${en1.map(one).join('')}</div>
  ${en2.length ? `<div class="sect-h">英语二（${en2.length} 年）</div><div class="grid">${en2.map(one).join('')}</div>` : ''}`;
});

route(/^en\/(en1|en2)\/(\d{4})$/, async (v, [exam, y]) => {
  const year = +y;
  const doc = await M.en(exam, year);
  const key = `en:${exam}${year}`;
  const s = sess(key);
  const groups = doc.sections.flatMap((sec) => sec.groups.map((g) => ({ ...g, sec })));
  v.innerHTML = `
  <div class="row" style="margin-bottom:10px">
    <a class="btn ghost sm" href="#/en">‹ 回英语列表</a>
    <h1 class="page" style="margin:0">${year} ${esc(doc.exam_label)}<small>${doc.audit.n} 题 · 分值合计 ${num(doc.audit.score_sum)}</small></h1>
    <span class="spacer"></span>
    <div class="modes" data-modes="${key}"><button data-mode="recite" class="${s.mode === 'recite' ? 'on' : ''}">精读</button><button data-mode="exam" class="${s.mode === 'exam' ? 'on' : ''}">考试</button></div>
    <button class="btn sm" data-act="print">打印</button>
  </div>
  ${(doc.audit.score_sum && doc.audit.score_sum !== 100) ? `<div class="sheet dark"><span class="note">来源数据里各大题分值合计为 ${doc.audit.score_sum}（满分 100），是原料自身的标注口径，原样保留。</span></div>` : ''}
  ${timerHTML(key)}
  ${groups.map((g, gi) => `
    <section class="sheet">
      <div class="paper-head"><h2>${esc(g.sec.title || '')}</h2>${g.sec.score ? chip(g.sec.score + ' 分', 'dim') : ''}<span class="spacer"></span><span class="note">${esc(g.type_label || '')}</span></div>
      ${g.instructions ? `<p class="note md" style="margin-top:0">${rich(g.instructions)}</p>` : ''}
      <div class="en-wrap">
        <div class="passage md">${(g.passage || []).map((p, i) => `<p class="pp">${(g.passage || []).length > 1 && !/^\s*\d+\s/.test(p) ? `<span class="para-n">${i + 1}</span>` : ''}${richInline(p)}</p>`).join('')}
          ${(g.images || []).map((im) => `<img src="${esc(im)}" alt="原文配图" loading="lazy">`).join('')}
          ${(g.passage_cn || []).length ? `<details class="trans"><summary>参考译文 / 全文翻译</summary>${g.passage_cn.map((p) => `<p>${rich(p)}</p>`).join('')}</details>` : ''}
        </div>
        <div>
          ${g.options && !g.questions.every((q) => q.options && Object.keys(q.options).length) ? `<div class="md" style="font-size:.9em">${rich(Object.entries(g.options).map(([k, val]) => `**[${k}]** ${typeof val === 'string' ? val : (val.text || JSON.stringify(val))}`).join('\n\n'))}</div>` : ''}
          ${(g.questions || []).map((q, i) => qcard({
            ...q, id: `${exam}${year}-${q.no}`,
            answer: q.answer, answer_src: null,
            analysis: q.explanation, flags: (q.stem && q.stem.length < 4 && (g.type || '').indexOf('trans') === 0) ? ['翻译题按中文译文作答'] : [],
          }, i, (g.questions || []).length && Object.keys(q.options || {}).length ? 'en' : 'essay', key)).join('')}
        </div>
      </div>
    </section>`).join('')}
  <p class="note">解析里的表格、中文精解与「考点提炼」等标签都是来源原文，本站没有改写。</p>`;
  paintScore(key, groups.flatMap((g) => g.questions || []).map((q) => ({ ...q, id: `${exam}${year}-${q.no}` })), 'en');
});

/* ================= 知识库 ================= */
route(/^know$/, async (v) => {
  const idx = await M.kIdx();
  v.innerHTML = `
  <h1 class="page">408 知识库<small>${idx.total_cards} 张卡片</small></h1>
  <p class="sub">${esc(idx.source)}。<b>${esc(idx.caveat)}</b></p>
  <div class="grid">${idx.subjects.map((s) => `<a class="tile" href="#/know/${s.subject}">
    <div class="yr">${esc(s.label)}</div>
    <div class="meta">${esc(s.code)} · ${esc(s.weight)}</div>
    <div class="meta">${s.cards} 张卡 · ${s.chars.toLocaleString()} 字 · 约 ${s.minutes} 分钟通读</div>
    <div class="meta">高频 ${s.freqs['高']} · 常考 ${s.freqs['中']}</div>
    <div class="bar"><i style="width:${knowProgress(s)}%"></i></div></a>`).join('')}</div>
  <div class="sect-h">数学公式与结论</div>
  <div class="sheet dark md">${rich('数学卡片按「考什么怎么算」组织：极限工具箱、中值定理构造表、积分公式、微分方程解法表、线代与概率必用结论。渲染用本机 KaTeX，公式若失败会保留原文并标红。')}</div>`;
});
function knowProgress(s) {
  const ids = s.ids || [];
  const n = ids.filter((i) => S.seen[i] || (S.ans || {})[i]).length;
  return s.cards ? Math.round(n / s.cards * 100) : 0;
}

route(/^know\/([a-z]+)$/, async (v, [sub]) => {
  const doc = await M.know(sub);
  const idx = await M.kIdx();
  const meta = idx.subjects.find((x) => x.subject === sub) || {};
  const q = (location.hash.split('?')[1] || '');
  v.innerHTML = `
  <div class="row" style="margin-bottom:10px"><a class="btn ghost sm" href="#/know">‹ 全部科目</a>
    <h1 class="page" style="margin:0">${esc(doc.label)}<small>${esc(doc.weight)}</small></h1>
    <span class="spacer"></span><input class="btn" id="kq" placeholder="搜卡片标题 / 正文" style="min-width:200px">
    <button class="btn sm" data-act="memorize">背诵模式</button>
    <button class="btn sm" data-act="print">打印整科</button></div>
  <p class="sub">${esc(doc.note)}</p>
  <div class="know-layout">
    <nav class="toc" id="toc">
      ${doc.cards.map((c) => `<div class="ch">${esc(c.chapter)}</div>
        <a href="#/know/${sub}/${c.id}" data-card="${c.id}">${esc(c.title)} ${(S.seen[c.id]) ? '·' : ''}</a>`).join('')}
    </nav>
    <div id="cards">${doc.cards.map((c) => cardHTML(c, sub)).join('')}</div>
  </div>`;
  $('#kq').addEventListener('input', (e) => {
    const t = e.target.value.trim().toLowerCase();
    $$('#cards > article').forEach((el) => { el.style.display = !t || el.dataset.hit.includes(t) ? '' : 'none'; });
  });
  const one = (location.hash.match(/know\/[a-z]+\/([a-z]+-\d+)/) || [])[1];
  if (one) { const el = $(`[data-card="${one}"]`); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('on'); } }
});
function cardHTML(c, sub) {
  const hit = (c.title + ' ' + c.chapter + ' ' + c.body).toLowerCase().replace(/\s+/g, ' ');
  return `<article class="sheet know" id="${c.id}" data-hit="${esc(hit.slice(0, 900))}">
    <div class="row" style="font-size:.78em;color:#7a6a48;letter-spacing:.06em"><span>${esc(c.chapter)}</span>
      ${c.freq === '高' ? chip('高频', 'gold') : ''}${(c.tags || []).map((t) => chip(t, 'dim')).join('')}
      ${(c.scope || []).length ? (c.scope).map((t) => chip(t, 'ok')).join('') : ''}
      <span class="spacer"></span><span>${c.chars} 字 · 约 ${c.minutes} 分钟</span>
      <button class="btn sm" data-star="${c.id}">${S.star[c.id] ? '★ 已收藏' : '☆ 收藏'}</button></div>
    <h3 class="card-title">${esc(c.title)}</h3>
    <div class="md body ${S.seen[c.id] ? '' : ''}">${rich(c.body)}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm primary" data-read="${c.id}">${S.seen[c.id] ? '已学过 · 再标一次' : '标记学过'}</button>
      <a class="btn sm ghost" href="#/know/${sub}">收起</a>
      <span class="spacer"></span><span class="note">${S.seen[c.id] ? '学过 · ' + esc(S.seen[c.id]) : '未标记'}</span></div>
  </article>`;
}

/* ================= 收藏与错题 ================= */
route(/^marks$/, async (v) => {
  const stars = Object.keys(S.star), wrongs = Object.keys(S.wrong || {});
  const items = await collect(stars.concat(wrongs));
  v.innerHTML = `
  <h1 class="page">收藏与错题<small>★ ${stars.length} · ✗ ${wrongs.length}</small></h1>
  <p class="sub">收藏来自题卡右上角的 ★；错题是答错过或手工「记为错题」的题。都只存在这台设备上。</p>
  ${items.length ? items.map((it) => `<div class="sheet">${qcard(it.q, 0, it.kind, it.key)}</div>`).join('')
    : '<div class="sheet"><p class="note">还没有收藏或错题。做题时点 ★ 或 ✗ 就会出现在这里。</p></div>'}`;
});
async function collect(ids) {
  /* id 形如：数学 2015-1-3 / 408 2023-7 / 英语 en1 2015-21 / 卡片 co-05 —— 按前缀分组回源取题 */
  const out = [];
  const groups = new Map();
  const put = (key, meta, id) => { if (!groups.has(key)) groups.set(key, { ...meta, ids: [] }); groups.get(key).ids.push(id); };
  for (const id of uniq(ids)) {
    let g = id.match(/^(\d{4})-(\d+)-(\d+)$/); if (g) { put("math:" + g[1], { t: "math", y: +g[1] }, id); continue; }
    g = id.match(/^(\d{4})-(\d{1,2})$/); if (g) { put("p408:" + g[1], { t: "p408", y: +g[1] }, id); continue; }
    g = id.match(/^(en[12])(\d{4})-(\d{1,2})$/); if (g) { put("en:" + g[1] + g[2], { t: "en", exam: g[1], y: +g[2] }, id); continue; }
    g = id.match(/^([a-z]+)-(\d{2})$/); if (g) { put("know:" + g[1], { t: "know", sub: g[1] }, id); }
  }
  for (const [key, grp] of groups) {
    const want = new Set(grp.ids);
    try {
      if (grp.t === "math") {
        const doc = await M.math(grp.y);
        doc.sections.forEach((sec, i) => sec.questions.forEach((q) => {
          const id = grp.y + "-" + (i + 1) + "-" + q.local_no;
          if (want.has(id)) out.push({ q: { ...q, id, section: sec.cn }, kind: sec.kind === "solution" ? "essay" : "math", key });
        }));
      } else if (grp.t === "p408") {
        const doc = await M.p408(grp.y);
        doc.questions.forEach((q) => { if (want.has(q.id)) out.push({ q, kind: q.kind === "choice" ? "p408" : "essay", key }); });
      } else if (grp.t === "en") {
        const doc = await M.en(grp.exam, grp.y);
        doc.sections.forEach((sec) => sec.groups.forEach((gr) => (gr.questions || []).forEach((q) => {
          const id = grp.exam + grp.y + "-" + q.no;
          if (want.has(id)) out.push({ q: { ...q, id, analysis: q.explanation }, kind: Object.keys(q.options || {}).length >= 3 ? "en" : "essay", key });
        })));
      } else if (grp.t === "know") {
        const doc = await M.know(grp.sub);
        doc.cards.forEach((c) => {
          if (want.has(c.id)) out.push({ q: { id: c.id, no: "", stem: "【" + c.chapter + "】" + c.title, options: {}, answer: null, analysis: c.body, flags: ["知识卡片"] }, kind: "essay", key });
        });
      }
    } catch (e) { console.warn("取题失败", key, e); }
  }
  return out;
}
/* ================= 数据体检 ================= */
route(/^audit$/, async (v) => {
  const [mi, ei, pi, ki] = await Promise.all([M.mathIdx(), M.enIdx(), M.pIdx(), M.kIdx()]);
  const rowsM = mi.years.map((y) => `<tr class="${y.tier === 'C' ? 'bad' : ''}"><td>${y.year}</td><td>${esc(y.tier === 'C' ? '只读原文' : y.tier + ' 档')}</td><td class="num">${num(y.n)}</td><td class="num">${num(y.declared_n)}</td><td class="num">${num(y.n_stem)}</td><td class="num">${num(y.n_answered)}</td><td class="num">${num(y.n_analysis)}</td><td class="num">${num(y.n_full_options)}/${num(y.n_choice)}</td><td class="num">${num(y.score_sum)}</td><td>${esc((y.notes || []).join('；') || '—')}</td></tr>`).join('');
  const rowsP = pi.years.map((y) => `<tr class="${!y.ok || y.n_answer < y.n_choice ? 'bad' : ''}"><td>${y.year}</td><td class="num">${num(y.n)}</td><td class="num">${num(y.n_choice)}</td><td class="num">${num(y.n_answer)}</td><td class="num">${num(y.n_full_options)}</td><td class="num">${num(y.n_explanation)}</td><td class="num">${num(y.n_with_figure)}</td><td>${esc([y.answer_from && `逐题${y.answer_from.perQuestion}/网格${y.answer_from.grid}/字母串${y.answer_from.run}`, y.n_conflicts ? `答案冲突 ${y.n_conflicts} 处` : '', y.answer_txt_chars < 200 ? '答案卷无文字(扫描件)' : ''].filter(Boolean).join(' · '))}</td></tr>`).join('');
  const rowsE = ei.papers.map((p) => `<tr class="${p.n_answer < p.n ? 'bad' : ''}"><td>${p.year} ${esc(p.exam_label || (p.exam === 'en1' ? '英一' : '英二'))}</td><td class="num">${p.n}</td><td class="num">${p.objective}</td><td class="num">${p.n_answer}</td><td class="num">${p.n_explanation}</td><td class="num">${num(p.score_sum)}</td><td>${esc(p.skills)}</td></tr>`).join('');
  v.innerHTML = `
  <h1 class="page">数据体检<small>缺口全部点名</small></h1>
  <p class="sub">口径：能从来源里逐字抽出来的才算「有」；抽不出来就留白并在这里点名。构建于 ${esc(mi.built_at)}。</p>
  <div class="sect-h">数学（一）· ${mi.years.length} 年</div>
  <div class="sheet"><div class="scroll-x"><table class="audit"><thead><tr><th>年份</th><th>档位</th><th>题数</th><th>声明</th><th>有题干</th><th>有答案</th><th>有解析</th><th>满4选项</th><th>分值合计</th><th>说明</th></tr></thead><tbody>${rowsM}</tbody></table></div></div>
  <div class="sect-h">408 · ${pi.years.length} 年</div>
  <div class="sheet"><div class="scroll-x"><table class="audit"><thead><tr><th>年份</th><th>题数</th><th>单选</th><th>有答案</th><th>满4选项</th><th>有解析</th><th>含图题</th><th>答案来源与疑点</th></tr></thead><tbody>${rowsP}</tbody></table></div>
    <p class="note">${esc(pi.caveat)}</p></div>
  <div class="sect-h">英语 · ${ei.papers.length} 套</div>
  <div class="sheet"><div class="scroll-x"><table class="audit"><thead><tr><th>年份/卷别</th><th>题数</th><th>客观题</th><th>有答案</th><th>有解析</th><th>分值合计</th><th>题型</th></tr></thead><tbody>${rowsE}</tbody></table></div></div>
  <div class="sect-h">知识库 · ${ki.total_cards} 张</div>
  <div class="sheet"><div class="scroll-x"><table class="audit"><thead><tr><th>科目</th><th>卡片</th><th>字数</th><th>高频</th><th>章</th></tr></thead><tbody>
    ${ki.subjects.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.cards}</td><td class="num">${s.chars}</td><td class="num">${s.freqs['高']}</td><td class="num">${s.chapters.length}</td></tr>`).join('')}
  </tbody></table></div><p class="note">${esc(ki.caveat)}</p></div>
  <div class="sect-h">没做到的事（别当成已核实）</div>
  <div class="sheet md">${rich([
    '- **数学（二）**：可达的开源文本源里只有 2024 一年，且那份 .md 其实是 PDF（前 5 字节 %PDF-1.3，仅 4 页，不像真卷），已排除不用；需要数二就得再找源或按学校科目代码走自命题路线。',
    '- **2021、2022 部分题干**：转录里填空题题号被打散（`11)`、`(2)` 混排），没接上题号的题不做结构化，只做原文阅读。',
    '- **408 插图**：重排 PDF 的文字层不含图形，凡题干出现「如图/电路/树形图」等字样的题（全站共 ' + pi.totals.figures + ' 道）都要求回原卷 PDF 核对。',
    '- **408 部分年份答案**：2019、2021、2022、2024、2025 的答案卷抽出文字为空或排版无法定位，只给原卷/答案 PDF，没有硬凑答案。',
    '- **政治**：真题原文与押题受版权限制，本机可达源里没有，整块未做。',
    '- **考频标注**：知识卡上的「高频」是按题型惯例的人工判断，不是官方统计。',
  ].join('\n'))}</div>
  <div class="sect-h">来源与许可</div>
  <div class="sheet md">${rich([
    '| 内容 | 来源 | 说明 |',
    '| --- | --- | --- |',
    `| 数学（一）真题与解析 | [${esc(mi.repo.split('/').pop())}](${mi.repo}) | 第三方转录；题干/答案/解析按原样搬运 |`,
    `| 英语真题结构化题库 | [${esc(ei.repo.split('/').pop())}](${ei.repo}) | 含逐题精解；数据集许可见仓库 LICENSE |`,
    `| 408 试卷与答案解析 | [${esc(pi.repo.split('/').pop())}](${pi.repo}) | MIT；重排文字版 PDF，含图题需对原卷 |`,
    '| 408 / 数学知识卡片 | 本地手写 | 依据 408 大纲与通行教材整理，未复制第三方讲义原文 |',
    '',
    '试卷与真题原文版权归命题机构所有，本站仅供个人备考使用。',
  ].join('\n'))}</div>`;
});
