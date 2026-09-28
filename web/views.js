/* 视图与路由：总览 / 数学 / 408 / 英语 / 知识库 / 收藏错题 / 数据体检
   约定：每个 view 函数返回 HTML 字符串，事件统一在 wire() 里用 data-* 委托绑定。 */
'use strict';

/* ================= 会话（每份卷子一套） ================= */
function sess(key) {
  if (!S.sess[key]) S.sess[key] = { mode: 'recite', t0: 0, used: 0, picks: {}, submitted: false, open: stampNow() };
  const s = S.sess[key];
  if (typeof s.picks !== 'object') s.picks = {};
  return s;
}
function timerHTML(key, sec) {
  const s = sess(key);
  return `<div class="timerbar" data-timer="${esc(key)}">
    <span class="clock">${fmtDur(s.used + (s.running ? (Date.now() - s.t0) / 1000 : 0) || sec || 0)}</span>
    <span class="note">计时</span>
    <div class="dots" data-dots>${''}</div>
  </div>`;
}

/* ================= 题卡 ================= */
function optRow(q, id) {
  const s = sess(id);
  const picked = s.picks[q.id];
  const graded = S.ans[q.id];
  const show = s.mode === 'recite' || s.submitted;
  const right = q.answer && /^[A-D]$/.test(String(q.answer)) ? q.answer : null;
  const items = ['A', 'B', 'C', 'D'].filter((k) => q.options && q.options[k] != null && String(q.options[k]).trim() !== '');
  if (!items.length) return '';
  return `<ul class="opts ${items.length === 4 && items.every((k) => (q.options[k] || '').length < 46) ? 'two' : ''}">` + items.map((k) => {
    let cls = '';
    if (show && right) {
      if (k === right) cls = 'right';
      else if (picked === k) cls = 'wrong';
    } else if (picked === k) cls = 'pick';
    return `<li class="opt ${cls}" data-opt="${esc(q.id)}" data-k="${k}"><b>${k}</b><span class="txt">${rich(q.options[k])}</span></li>`;
  }).join('') + '</ul>';
}

function revealHTML(q, kind) {
  const hasAns = q.answer != null && String(q.answer).trim() !== '';
  const exp = kind === 'en' ? q.explanation : (q.analysis || q.explanation);
  if (!hasAns && !exp) return `<div class="reveal"><span class="lab">答案</span><div class="ans">待核实 —— 本条数据的来源里没给出答案，请对原卷</div></div>`;
  let out = '<div class="reveal">';
  if (hasAns) {
    const src = q.answer_src ? ` <span class="note">（来源：${({ 'per-question': '逐题标记', grid: '卷首答案表', 'letter-run': '卷首字母串' })[q.answer_src] || q.answer_src}）</span>` : '';
    out += `<span class="lab">答案</span><div class="ans">${esc(String(q.answer))}${src}</div>`;
  }
  if (exp) out += `<div class="expl md">${rich(exp)}</div>`;
  return out + '</div>';
}

function qcard(q, i, kind, paperKey) {
  const id = q.id || `${paperKey}-${i}`;
  const s = sess(paperKey);
  const showReveal = s.mode === 'recite' || s.submitted;
  const graded = S.ans[id];
  const label = q.label || `第 ${q.no != null ? q.no : i + 1} 题`;
  const score = q.score ? chip(q.score + ' 分', 'dim') : '';
  const secCn = q.section ? chip(q.section + '、', 'dim') : '';
  const sub = q.subject ? chip(q.subject, 'gold') : '';
  return `<article class="q" data-q="${esc(id)}" data-kind="${kind}">
    <div class="q-head">
      ${secCn}<span class="q-no">${esc(label)}</span>${score}${sub}
      ${graded ? (graded.ok === true ? chip('做过·对', 'ok') : graded.ok === false ? chip('做过·错', 'warn') : '') : ''}
      <span class="spacer"></span>
      <button class="btn sm wrong" data-wrong="${esc(id)}" title="放进错题本">${(S.wrong || {})[id] ? '✗ 移出错题本' : '✗ 记为错题'}</button>
      ${starBtn(id)}
    </div>
    <div class="q-stem md">${rich(q.stem || '')}</div>
    ${kind === 'essay' ? `<div class="note" style="margin-top:6px">综合题按作答过程判分，先自己写再对解析。</div>` : optRow(q, paperKey)}
    ${showReveal ? revealHTML(q, kind) : '<div class="q-tools"><button class="btn sm" data-peek="' + esc(id) + '">看答案</button></div>'}
    <div class="flags">${flagChips(q.flags)}</div>
    <details class="q-tools"><summary class="note">我的笔记</summary>${noteBox(id)}</details>
  </article>`;
}

/* ================= 路由 ================= */
const routes = [];
const route = (re, fn) => routes.push({ re, fn });
async function render() {
  const hash = location.hash.replace(/^#\/?/, '') || '';
  const parts = hash.split('/').filter(Boolean);
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) {
      const view = $('#view');
      view.innerHTML = '<div class="boot">正在装载…</div>';
      try { await r.fn(view, m.slice(1).map(decodeURIComponent)); }
      catch (e) { console.error(e); view.innerHTML = `<div class="sheet"><h3>这一页没能打开</h3><p class="note">${esc(e.message)}</p><p class="note">数据没装好时先回总览页；如果是 file:// 下打开，请确认 web 目录整体拷过去了。</p></div>`; }
      paintDots();
      return;
    }
  }
  $('#view').innerHTML = '<div class="sheet"><h3>没有这个页面</h3><p class="note">地址形如 <span class="kbd">#/math/2015</span></p></div>';
}

/* ================= 总览 ================= */
function stats() {
  const ans = Object.values(S.ans);
  const done = ans.length;
  const right = ans.filter((a) => a.ok === true).length;
  return { done, right, rate: done ? Math.round((right / done) * 100) : null, star: Object.keys(S.star).length, wrong: Object.keys(S.wrong || {}).length, read: Object.keys(S.seen).length };
}
route(/^$/, async (v) => {
  const [mi, ei, pi, ki] = await Promise.all([M.mathIdx(), M.enIdx(), M.pIdx(), M.kIdx()]);
  const st = stats();
  const mathOk = mi.years.filter((y) => y.tier !== 'C');
  const pOk = pi.years.filter((y) => y.ok);
  const enOk = ei.papers;
  const cards = mi.years.filter((y) => y.tier === 'C').length + pi.years.filter((y) => !y.ok).length;
  v.innerHTML = `
  <h1 class="page">总览<small>本机离线可用</small></h1>
  <p class="sub">真题与解析全部来自可核对的公开来源；<b>认不出的地方一律留白并标「待核实」</b>，缺口清单在「数据体检」页。</p>
  <div class="grid" id="tiles">
    <a class="tile" href="#/math"><div class="yr">数学（一）</div><div class="meta">${mi.totals.years} 个年份 · ${mathOk.length} 年可整卷刷 · ${mi.totals.questions} 题</div><div class="meta">题干 ${mi.totals.with_stem} · 答案 ${mi.totals.with_answer} · 解析 ${mi.totals.with_analysis}</div></a>
    <a class="tile" href="#/p408"><div class="yr">408 计算机</div><div class="meta">${pOk.length} 年真题 · ${pi.totals.questions} 题（单选 ${pi.totals.choice} / 综合 ${pi.totals.essay}）</div><div class="meta">答案 ${pi.totals.with_answer} · 解析 ${pi.totals.with_explanation} · 含图题 ${pi.totals.figures}</div></a>
    <a class="tile" href="#/know"><div class="yr">知识库</div><div class="meta">${ki.subjects.length} 科 · ${ki.total_cards} 张卡片 · ${ki.subjects.reduce((a, s) => a + s.chars, 0).toLocaleString()} 字</div><div class="meta">${ki.subjects.map((s) => esc(s.label.split('（')[0])).join(' / ')}</div></a>
    <a class="tile" href="#/en"><div class="yr">英语（一/二）</div><div class="meta">${enOk.length} 套 · ${ei.totals.questions} 题</div><div class="meta">解析覆盖 ${pct(ei.totals.with_explanation, ei.totals.questions)}</div></a>
    <a class="tile" href="#/marks"><div class="yr">收藏与错题</div><div class="meta">★ ${st.star} 条收藏 · ✗ ${st.wrong} 道错题</div><div class="meta">支持重做与笔记</div></a>
    <a class="tile" href="#/audit"><div class="yr">数据体检</div><div class="meta">逐年题量 / 答案来源 / 缺口点名</div><div class="meta">来源仓库与许可</div></a>
  </div>
  <div class="sect-h">今天的进度</div>
  <div class="sheet">
    <div class="row">
      <div>已作答 <b>${st.done}</b> 题</div><div>·</div><div>答对 <b>${st.right}</b></div><div>·</div>
      <div>正确率 <b>${st.rate == null ? '—' : st.rate + '%'}</b></div><div>·</div><div>收藏 <b>${st.star}</b></div><div>·</div><div>错题 <b>${st.wrong}</b></div>
      <span class="spacer"></span><button class="btn sm" data-act="reset">清空进度</button>
    </div>
    <div class="bar"><i style="width:${clamp(st.rate || 0, 0, 100)}%"></i></div>
    <p class="note" style="margin-bottom:0">进度只存在这台设备浏览器里（localStorage）。换设备用顶栏「进度备份」导出 JSON。</p>
  </div>
  <div class="sect-h">建议的用法</div>
  <div class="sheet md">${rich([
    '1. **先在「知识库」过一遍四科体系**，再开真题；每页右上角可切字号与夜读。',
    '2. **真题两种模式**：背题模式点一下就出答案解析；考试模式先整卷作答、最后提交判分，用时会被记住。',
    '3. **看到橙色旗标就去看原卷**：写着「含图」「答案待核实」「不一致」的题，是数据本身有缺口，不是我编的话。',
    `4. 数二 / 自命题的方向还没定：目前数学只有**数一** 的完整文本源（数二只找到 1 年且是 PDF 冒充 md，已排除）；408 之外的自命题需要给我学校名才能去采。`,
  ].join('\n'))}
    <p class="note" style="margin-bottom:0">全站共 ${cards} 个年份/科目存在已知缺口，逐条见「数据体检」。</p>
  </div>`;
});

/* ================= 数学 ================= */
route(/^math$/, async (v) => {
  const idx = await M.mathIdx();
  const A = idx.years.filter((y) => y.tier === 'A'), B = idx.years.filter((y) => y.tier === 'B'), C = idx.years.filter((y) => y.tier === 'C');
  const tile = (y) => {
    const st = S.sess['math:' + y.year];
    const done = idx && y.n ? Math.round(Object.keys(S.ans).filter((k) => k.startsWith(y.year + '-') || k.startsWith('math' + y.year)).length / y.n * 100) : 0;
    return `<a class="tile ${y.tier === 'C' ? 'raw' : ''}" href="#/math/${y.year}">
      <div class="yr">${y.year}</div>
      <div class="meta">${y.tier === 'C' ? '只给原文阅读' : `${y.n} 题 · 答案 ${y.n_answered}/${y.n}`}</div>
      <div class="meta">${(y.notes || []).length ? esc((y.notes || [])[0]) : (y.tier === 'C' ? '题号与转录对不齐，见体检页' : `${y.n_choice} 道客观题 · 解析 ${y.n_analysis} 题`)}${(y.notes || []).length > 1 ? ` 等 ${(y.notes || []).length} 项` : ''}</div>
      ${st ? `<div class="meta">上次：${esc(st.open)} · 用 ${fmtDur(st.used)}</div>` : ''}
      <span class="badges">${y.tier === 'A' ? chip('齐', 'ok') : y.tier === 'B' ? chip('部分缺答', 'gold') : chip('原文', 'dim')}</span>
    </a>`;
  };
  v.innerHTML = `
  <h1 class="page">数学（一）历年真题<small>1987-2025</small></h1>
  <p class="sub">来源：${esc(idx.repo)}。题干、选项、答案、解析按原样搬运；<b>认不出的题号一律不猜</b>，所以 C 档年份只做原文阅读。</p>
  <div class="sect-h">A 档 · 题目与答案齐全（${A.length} 年）</div><div class="grid">${A.map(tile).join('')}</div>
  <div class="sect-h">B 档 · 可刷，个别题缺答案（${B.length} 年）</div><div class="grid">${B.map(tile).join('')}</div>
  <div class="sect-h">C 档 · 转录对不齐，只提供原文（${C.length} 年）</div><div class="grid">${C.map(tile).join('')}</div>
  <p class="note">缺口口径与逐年明细在「数据体检」页；数学（二）目前只有 2024 一份且是 PDF 冒充 .md，已排除，见体检页说明。</p>`;
});

route(/^math\/(\d{4})$/, async (v, [y]) => {
  const year = +y;
  const idx = await M.mathIdx();
  const meta = idx.years.find((r) => r.year === year);
  if (meta && meta.tier === 'C') return mathRawView(v, year, meta, idx);
  const doc = await M.math(year);
  const key = 'math:' + year;
  const s = sess(key);
  const qs = doc.sections.flatMap((sec, i) => sec.questions.map((q) => ({ ...q, id: `${year}-${i + 1}-${q.local_no}`, section: sec.cn, section_title: sec.title, kind: sec.kind })));
  const answerable = qs.filter((q) => !q.options || Object.keys(q.options).length >= 3);
  v.innerHTML = `
  <div class="row" style="margin-bottom:10px">
    <a class="btn ghost sm" href="#/math">‹ 回数学列表</a>
    <h1 class="page" style="margin:0">${year} 年数学（一）<small>${doc.audit.n} 题 · 分值合计 ${num(doc.audit.score_sum)}</small></h1>
    <span class="spacer"></span>
    <div class="modes" data-modes="${key}">
      <button data-mode="recite" class="${s.mode === 'recite' ? 'on' : ''}">背题</button>
      <button data-mode="exam" class="${s.mode === 'exam' ? 'on' : ''}">考试</button>
    </div>
    <button class="btn sm" data-act="print">打印 / 存 PDF</button>
    <button class="btn sm ghost" data-raw="${year}">看转录原文</button>
  </div>
  ${(meta && meta.notes || []).length ? `<div class="sheet dark md" style="margin-bottom:12px">${rich('本页数据说明：\n' + meta.notes.map((n) => '- ' + n).join('\n'))}</div>` : ''}
  ${timerHTML(key)}
  <div class="sheet">
    <div class="paper-head"><h2>${year} 年全国硕士研究生招生考试 · 数学（一）</h2>
      <span class="spacer"></span><span class="note">来源：${esc(doc.sources.paper || '')} + ${esc(doc.sources.solution || '')}</span></div>
    <div class="row"><span class="chip dim">${answerable.length} 道客观题</span><span class="chip dim">${qs.length - answerable.length} 道解答/综合题</span>
      <span class="spacer"></span><button class="btn primary sm" data-submit="${key}" ${s.mode === 'exam' ? '' : 'disabled'}>提交整卷判分</button></div>
    <div id="scorebox"></div>
    <hr class="rule">
    ${doc.sections.map((sec, i) => `<div class="sect-h" style="color:#7a5f21;font-size:1em;margin-top:18px">${esc(sec.cn || '')}、${esc(sec.title || '')}</div>
      ${sec.questions.map((q, j) => qcard({ ...q, id: `${year}-${i + 1}-${q.local_no}`, section: sec.cn }, j, sec.kind === 'solution' ? 'essay' : 'math', key)).join('')}`).join('')}
  </div>
  ${timerFoot(key)}`;
  paintScore(key, qs, 'math');
});

function timerFoot(key) {
  return `<div class="row" style="margin-top:10px"><span class="note">翻页：平板上直接左右滑动列表或用系统返回；本页进度已自动保存。</span></div>`;
}

async function mathRawView(v, year, meta, idx) {
  const [paper, sol] = await Promise.all([
    M.mathRaw(year, 'paper').catch(() => null),
    M.mathRaw(year, 'solution').catch(() => null),
  ]);
  const body = (o) => (o && o.text ? `<div class="sheet md">${rich(o.text)}</div>` : '<div class="sheet"><p class="note">这一年没有留下原文文件。</p></div>');
  v.innerHTML = `
  <div class="row" style="margin-bottom:10px"><a class="btn ghost sm" href="#/math">‹ 回数学列表</a>
    <h1 class="page" style="margin:0">${year} 年数学（一）· 原文<small>只做阅读</small></h1></div>
  <div class="sheet dark md" style="margin-bottom:12px">${rich((meta.notes || []).length ? meta.notes.map((n) => '- ' + n).join('\n') : '这一年的题号在转录里对不齐，没有结构化成题库；下面是来源仓库里的原始文本。')}
    <p class="note" style="margin-bottom:0">来源：${esc(idx.repo)}。公式若渲染失败会保留原始 LaTeX 并以红色下标出。</p></div>
  <div class="sect-h">试卷原文</div>${body(paper)}
  <div class="sect-h">解析原文</div>${body(sol)}`;
}
