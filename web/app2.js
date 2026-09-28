/* 交互装配：选项点击、模式切换、计时、整卷判分、笔记、导出导入、字号与夜读 */
'use strict';

/* ---------- 计时 ---------- */
let tick = null;
function startTicker() {
  clearInterval(tick);
  tick = setInterval(() => {
    $$('[data-timer]').forEach((bar) => {
      const s = S.sess[bar.dataset.timer]; if (!s) return;
      const el = $('.clock', bar); if (!el) return;
      const t = s.used + (s.running ? (Date.now() - s.t0) / 1000 : 0);
      el.textContent = fmtDur(t);
    });
  }, 1000);
}
function runTimer(key, on) {
  const s = sess(key);
  if (on && !s.running) { s.t0 = Date.now(); s.running = true; }
  if (!on && s.running) { s.used = Math.round(s.used + (Date.now() - s.t0) / 1000); s.running = false; }
  save();
}

/* ---------- 题号点阵与判分 ---------- */
function paperQuestions() {
  const art = $$('#view article.q');
  return art.map((el) => ({ id: el.dataset.q, kind: el.dataset.kind, el }));
}
function paintDots() {
  const bar = $('[data-timer]'); if (!bar) return;
  const key = bar.dataset.timer; const s = sess(key);
  const box = $('[data-dots]', bar); if (!box) return;
  const items = paperQuestions();
  box.innerHTML = items.map((it, i) => {
    const a = S.ans[it.id]; const pick = s.picks[it.id];
    let cls = '';
    if (s.submitted && a) cls = a.ok ? 'right' : 'wrong';
    else if (pick || a) cls = 'done';
    if (S.star[it.id]) cls += ' star';
    return `<span class="dot ${cls}" data-goto="${esc(it.id)}" title="第 ${i + 1} 卡">${i + 1}</span>`;
  }).join('');
}
function paintScore(key, qs, kind) {
  const box = $('#scorebox'); if (!box) return;
  const s = sess(key);
  if (!s.submitted) { box.innerHTML = ''; return; }
  const obj = (qs || []).filter((q) => q.options && Object.keys(q.options).length >= 3 && q.answer);
  const done = obj.filter((q) => s.picks[q.id] || (S.ans[q.id] && S.ans[q.id].pick));
  const right = obj.filter((q) => {
    const pick = s.picks[q.id] || (S.ans[q.id] || {}).pick;
    return pick && String(pick).toUpperCase() === String(q.answer).toUpperCase().slice(0, 1);
  });
  const score = right.reduce((a, q) => a + (q.score || 0), 0);
  const total = obj.reduce((a, q) => a + (q.score || 0), 0);
  box.innerHTML = `<div class="reveal" style="margin-top:12px">
    <span class="lab">整卷判分</span>
    <div class="ans">客观题 ${right.length}/${obj.length} 正确${total ? ` · 得分约 ${score}/${total}` : ''} · 用时 ${fmtDur(s.used)}</div>
    <div class="row" style="margin-top:6px">
      <button class="btn sm" data-act="again">再做一遍</button>
      <button class="btn sm" data-act="towrong">把错题收进错题本</button>
      <span class="note">未作答的题不会记为错，只算没做。</span></div>
  </div>`;
}

/* ---------- 事件委托 ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  const closest = (sel) => t.closest && t.closest(sel);

  const opt = closest('.opt[data-opt]');
  if (opt) {
    const id = opt.dataset.opt, k = opt.dataset.k;
    const key = $$('.timerbar').length ? $('.timerbar').dataset.timer : '';
    const s = sess(key);
    if (s.mode === 'exam' && !s.submitted) {
      s.picks[id] = k; save();
      $$(`.opt[data-opt="${CSS.escape(id)}"]`).forEach((el) => el.classList.toggle('pick', el.dataset.k === k));
      paintDots();
    } else {
      // 背题模式 / 已提交：直接判分并显示解析
      const card = opt.closest('article.q');
      const right = (s.picks[id] || k) && card && (() => {
        const ans = (card.querySelector('.reveal .ans') || {}).textContent || '';
        return ans.trim().toUpperCase().startsWith(k.toUpperCase());
      })();
      s.picks[id] = k;
      if (s.mode === 'recite') grade(id, k, !!right);
      $$(`.opt[data-opt="${CSS.escape(id)}"]`).forEach((el) => {
        el.classList.remove('pick');
        const kk = el.dataset.k;
        if (right === true && kk === k) el.classList.add('right');
        else if (right === false && kk === k) el.classList.add('wrong');
      });
      if (card && !card.querySelector('.reveal')) { seen(id); card.querySelector('.q-stem').insertAdjacentHTML('afterend', '<div class="reveal"><span class="lab">已标记</span></div>'); }
      else if (card) { const r = card.querySelector('.reveal'); if (r) r.hidden = false; }
      save(); paintDots();
    }
    return;
  }

  const peek = closest('[data-peek]');
  if (peek) {
    const card = peek.closest('article.q');
    const id = peek.dataset.peek;
    const q = { id };
    fetchReveal(card, id).then((html) => { if (html) { card.querySelector('.flags').insertAdjacentHTML('beforebegin', html); peek.remove(); } });
    seen(id);
    return;
  }

  const st = closest('[data-star]');
  if (st) {
    const on = toggleStar(st.dataset.star);
    st.textContent = on ? '★ 已收藏' : '☆ 收藏';
    toast(on ? '已收藏' : '已取消收藏');
    paintDots();
    return;
  }
  const wr = closest('[data-wrong]');
  if (wr) {
    const id = wr.dataset.wrong; const bad = !(S.wrong || {})[id];
    markWrong(id, bad); wr.textContent = bad ? '✗ 移出错题本' : '✗ 记为错题';
    toast(bad ? '已放进错题本' : '已从错题本移除'); paintDots();
    return;
  }
  const rd = closest('[data-read]');
  if (rd) { seen(rd.dataset.read); render(); return; }
  const jump = closest('[data-jump]');
  if (jump) { const el = document.getElementById(jump.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const goto = closest('[data-goto]');
  if (goto) { const el = $(`article.q[data-q="${CSS.escape(goto.dataset.goto)}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--gold)'; setTimeout(() => { el.style.outline = ''; }, 1200); } return; }

  const mode = closest('[data-mode]');
  if (mode) {
    const key = mode.closest('[data-modes]').dataset.modes;
    const s = sess(key);
    if (mode.dataset.mode === 'exam' && s.mode !== 'exam') { s.picks = {}; s.submitted = false; s.used = 0; runTimer(key, true); }
    if (mode.dataset.mode === 'recite') runTimer(key, false);
    s.mode = mode.dataset.mode; save(); render();
    return;
  }
  const sub = closest('[data-submit]');
  if (sub) {
    const key = sub.dataset.submit; const s = sess(key);
    runTimer(key, false);
    Object.entries(s.picks).forEach(([id, k]) => {
      const card = $(`article.q[data-q="${CSS.escape(id)}"]`);
      const ansTxt = card && (card.querySelector('.reveal .ans') || {}).textContent;
      const right = ansTxt ? ansTxt.trim().toUpperCase().startsWith(k.toUpperCase()) : null;
      grade(id, k, right);
    });
    s.submitted = true; s.open = stampNow(); save(); render();
    toast('已提交，逐题解析已展开');
    return;
  }
  const act = closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'print') { window.print(); return; }
    if (a === 'reset') { if (confirm('确定清空本机做题进度？收藏与笔记会一并清掉。')) { S = blankState(); save(); render(); toast('进度已清空'); } return; }
    if (a === 'again') { const key = $$('.timerbar')[0] && $('.timerbar').dataset.timer; const s = sess(key); s.submitted = false; s.picks = {}; s.used = 0; save(); render(); return; }
    if (a === 'towrong') { $$('.dot.wrong').length ? null : null; $$('article.q').forEach((el) => { const a = S.ans[el.dataset.q]; if (a && a.ok === false) S.wrong[el.dataset.q] = stampNow(); }); save(); toast('错题已收进错题本'); return; }
    if (a === 'memorize') { document.body.classList.toggle('memorize'); toast(document.body.classList.contains('memorize') ? '背诵模式：卡片正文已收起' : '已展开正文'); $$('#cards article .body').forEach((el) => el.hidden = document.body.classList.contains('memorize')); return; }
    if (a === 'export') { exportData(); return; }
    if (a === 'import') { $('#import-file').click(); return; }
    if (a === 'close-drawer') { $('#drawer').hidden = true; return; }
    return;
  }
  const raw = closest('[data-raw]');
  if (raw) { location.hash = `#/math/${raw.dataset.raw}?raw=1`; openRaw(+raw.dataset.raw); return; }
});

async function openRaw(year) {
  const idx = await M.mathIdx(); const meta = idx.years.find((y) => y.year === year);
  const v = $('#view'); v.innerHTML = '<div class="boot">读取原文…</div>';
  await mathRawView(v, year, meta || { notes: [] }, idx);
}
/* 背题模式下未展开的卡：从数据里取该题重新渲染解析 */
async function fetchReveal(card, id) {
  const m = id.match(/^(\d{4})-(\d+)-(\d+)$/);
  if (m) { try { const doc = await M.math(+m[1]); const sec = doc.sections[+m[2] - 1]; const q = sec && sec.questions.find((x) => String(x.local_no) === m[3]); if (q) { seen(id); return revealHTML({ ...q, answer: q.answer, analysis: q.analysis }, 'math'); } } catch (e) { } }
  const p = id.match(/^(\d{4})-(\d{1,2})$/);
  if (p) { try { const doc = await M.p408(+p[1]); const q = doc.questions.find((x) => x.id === id); if (q) { seen(id); return revealHTML(q, 'p408'); } } catch (e) { } }
  const e = id.match(/^(en[12])(\d{4})-(\d{1,2})$/);
  if (e) { try { const doc = await M.en(e[1], +e[2]); const q = doc.sections.flatMap((s) => s.groups.flatMap((g) => g.questions || [])).find((x) => String(x.no) === e[3]); if (q) { seen(id); return revealHTML({ ...q, answer: q.answer, analysis: q.explanation }, 'en'); } } catch (err) { } }
  return '';
}

document.addEventListener('input', (e) => {
  const n = e.target.closest && e.target.closest('[data-note]');
  if (n) { setNote(n.dataset.note, n.value.trim()); }
});

/* ---------- 导出 / 导入 ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `考研备考台-进度-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('进度已导出为 JSON 文件');
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => { try { S = Object.assign(blankState(), JSON.parse(r.result)); save(); render(); toast('进度已导入'); } catch (e) { toast('这个文件读不了：' + e.message); } };
  r.readAsText(file);
}

/* ---------- 顶栏 ---------- */
function bootTop() {
  const FONTS = ['s', 'm', 'l'];
  const setFont = (f) => { document.body.classList.remove('fs-s', 'fs-m', 'fs-l'); document.body.classList.add('fs-' + f); S.set.font = f; save(); $('#btn-font').textContent = '字号 ' + ({ s: '小', m: '中', l: '大' })[f]; };
  setFont(S.set.font || 'm');
  $('#btn-font').onclick = () => setFont(FONTS[(FONTS.indexOf(S.set.font) + 1) % FONTS.length]);
  $('#btn-mode').onclick = () => { document.body.classList.toggle('warm'); S.set.warm = document.body.classList.contains('warm'); save(); $('#btn-mode').textContent = S.set.warm ? '暖白' : '夜读'; };
  $('#btn-mode').textContent = S.set.warm ? '暖白' : '夜读';
  $('#btn-data').onclick = () => {
    $('#drawer').hidden = false;
    $('.drawer-inner').innerHTML = `<div class="row"><h3 style="margin:0;flex:1">进度备份</h3><button class="btn sm" data-act="close-drawer">关闭</button></div>
      <p class="note">进度只存在本机浏览器里。换设备、清缓存前先导出。</p>
      <div class="row"><button class="btn primary" data-act="export">导出 JSON</button>
      <button class="btn" data-act="import">导入 JSON</button>
      <input type="file" id="import-file" accept=".json" style="display:none"></div>
      <hr class="rule">
      <p class="note">当前记录：作答 ${Object.keys(S.ans).length} 条 · 收藏 ${Object.keys(S.star).length} · 错题 ${Object.keys(S.wrong).length} · 笔记 ${Object.keys(S.note).length}</p>
      <p class="note">本机存储可用：${(() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return '可以'; } catch (e) { return '不行（用 Chrome/Safari 的文件打开方式或部署到网上）'; } })()}</p>`;
    $('#import-file').onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); };
  };
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer' || (e.target.closest && e.target.closest('[data-act="close-drawer"]'))) $('#drawer').hidden = true; });
  const idx = window.KY && window.KY['math/index'];
  $('#built-at').textContent = '数据 ' + (idx ? idx.built_at : '—');
}

/* ---------- 启动 ---------- */
window.addEventListener('hashchange', () => { runTimerStopAll(); render(); });
function runTimerStopAll() { /* 离开页面时把运行中的计时收进 used */ Object.values(S.sess).forEach((s) => { if (s.running) { s.used = Math.round(s.used + (Date.now() - s.t0) / 1000); s.running = false; } }); save(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { runTimerStopAll(); } });

bootTop();
startTicker();
render();
