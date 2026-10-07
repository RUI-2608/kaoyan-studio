/* 真渲染截图（无头 Edge + CDP，零依赖）
   为什么必须拍真图：公式有没有渲染出来、英语左右分栏在平板横屏下挤不挤、
   橙色旗标在米白底上看不看得见 —— 只看代码看不出来。

   用法：
     node scripts/shot.mjs                      # 全部场景
     node scripts/shot.mjs math- p408-          # 只截前缀匹配的
     node scripts/shot.mjs --probe="#/math"     # 不出图，打印页面自报的数字
   输出：.shots/<场景名>.png
*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, '.shots');
const args = process.argv.slice(2);
const argKv = (k, d) => { const eq = args.find((a) => a.startsWith(`--${k}=`)); return eq ? eq.split('=').slice(1).join('=') : d; };
const BASE = argKv('base', 'http://127.0.0.1:8137/index.html');
const PORT = +argKv('cdp', 9333);
const DPR = +argKv('dpr', 2);
const PROBE = args.includes('--probe') ? argKv('probe', '') : null;
const prefixes = args.filter((a) => !a.startsWith('--'));

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome'); process.exit(1); }

/* 场景：view = hash 路由；size = [w,h,dpr]；click = 进入后要点的东西（CSS 选择器）；wait = 额外等待毫秒 */
const SCENES = [
  { name: 'home-1024', hash: '#/', size: [1024, 768] },
  { name: 'math-list-1024', hash: '#/math', size: [1024, 768] },
  { name: 'math2-list-1024', hash: '#/math2', size: [1024, 768] },
  { name: 'math2-paper-1024', hash: '#/math2/2015', size: [1024, 768], scroll: 520 },
  { name: 'math2-raw-1024', hash: '#/math2/1998', size: [1024, 768] },
  { name: 'math-paper-1024', hash: '#/math/2015', size: [1024, 768], scroll: 620 },
  { name: 'math-paper-opts', hash: '#/math/2015', size: [1024, 768], click: '.opt' },
  { name: 'math-exam-1024', hash: '#/math/2015', size: [1024, 768], clickText: '考试' },
  { name: 'math-raw-1024', hash: '#/math/2001', size: [1024, 768] },
  /* 2022 那份试卷转录是坏的（garbled_paper），原文页必须把这句话印在乱码上面 */
  { name: 'math-raw-garbled-1024', hash: '#/math/2022', size: [1024, 768], clickText: '看转录原文', wait: 2600 },
  { name: 'p408-list-1024', hash: '#/p408', size: [1024, 768] },
  { name: 'p408-paper-1024', hash: '#/p408/2023', size: [1024, 768], scroll: 520 },
  { name: 'p408-prov-1024', hash: '#/p408/2022', size: [1024, 768], clickText: '背题', scroll: 700 },
  { name: 'p408-2022top-1024', hash: '#/p408/2022', size: [1024, 768], clickText: '背题', scroll: 300 },
  { name: 'p408-filter-1024', hash: '#/p408/2023', size: [1024, 768], click: 'button[data-subj="计算机网络"]' },
  { name: 'know-1024', hash: '#/know', size: [1024, 768] },
  { name: 'know-co-1024', hash: '#/know/co', size: [1024, 768] },
  { name: 'know-ds-math-1024', hash: '#/know/math', size: [1024, 768], scroll: 400 },
  { name: 'en-paper-1024', hash: '#/en/en1/2015', size: [1024, 768], scroll: 460 },
  { name: 'en-list-834', hash: '#/en', size: [834, 1112] },
  { name: 'marks-1024', hash: '#/marks', size: [1024, 768] },
  { name: 'audit-1024', hash: '#/audit', size: [1024, 768] },
  { name: 'audit-p408-1024', hash: '#/audit', size: [1024, 768], scroll: 1780 },
  { name: 'home-portrait', hash: '#/', size: [768, 1024] },
  { name: 'math-phone', hash: '#/math/2015', size: [390, 844], dpr: 3 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ky-shot-'));
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function json(pathname) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${pathname}`); if (r.ok) return await r.json(); } catch (e) { }
    await sleep(250);
  }
  throw new Error('CDP 未就绪');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  static async attach(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    return new CDP(ws);
  }
}

async function shoot(cdp, scene) {
  const [w, h] = scene.size;
  const dpr = scene.dpr || DPR;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 800 });
  await cdp.send('Page.navigate', { url: `${BASE}${scene.hash}` });
  await sleep(scene.wait || 1700);
  if (scene.click) await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(scene.click)}) && document.querySelector(${JSON.stringify(scene.click)}).click()`, returnByValue: true });
  if (scene.clickText) {
    const r = await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(scene.clickText)}); if(b)b.click(); return !!b})()`, returnByValue: true });
    if (!(r.result && r.result.value)) console.log('   ! 没找到按钮：', scene.clickText);
    await sleep(900);
  }
  if (scene.scroll) await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scene.scroll})` });
  await sleep(320);
  const errs = await cdp.send('Runtime.evaluate', { expression: `(window.__errs||[]).join(' | ').slice(0,400)`, returnByValue: true });
  const e = errs.result && errs.result.value;
  if (e) console.log('   ! 页面报错：', e);
  /* 服务器没起来时浏览器会画出自己的错误页 —— 那不算截图成功，必须判出来 */
  const alive = await cdp.send('Runtime.evaluate', { expression: `!!document.querySelector('#view') && (window.KY || document.title.indexOf('考研') >= 0)`, returnByValue: true });
  if (!alive.result || !alive.result.value) { console.log('✗', scene.name, '页面没加载（服务器没起？先跑 node scripts/serve.mjs）'); return; }
  if (PROBE !== null) {
    const r = await cdp.send('Runtime.evaluate', { expression: PROBE || 'document.title', returnByValue: true });
    console.log(scene.name, '=>', r.result && r.result.value);
    return;
  }
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${scene.name}.png`), Buffer.from(shot.data, 'base64'));
  console.log('✓', scene.name, `${w}×${h}@${dpr}`);
}

const list = SCENES.filter((s) => !prefixes.length || prefixes.some((p) => s.name.startsWith(p)));
const { webSocketDebuggerUrl: bws } = await json('/json/version');
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const cdp = await CDP.attach(target.webSocketDebuggerUrl || bws);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
for (const s of list) { try { await shoot(cdp, s); } catch (e) { console.log('✗', s.name, e.message); } }
try { await cdp.send('Browser.close').catch(() => { }); } catch (e) { }
await new Promise((r) => setTimeout(r, 200));
try { cdp.ws.close(); } catch (e) { }
browser.kill();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 浏览器还没退干净，留着临时目录不影响 */ } }, 800);
console.log(`\n输出目录 ${OUT}`);
