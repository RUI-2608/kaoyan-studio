/* 小验证：在真浏览器里调 collect()，看能不能把各来源的题取回来 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 9346;
const BASE = 'http://127.0.0.1:8137/index.html';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'ky-t2-'));
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
async function json(p) { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`); if (r.ok) return await r.json(); } catch (e) { } await sleep(250); } throw new Error('CDP 未就绪'); }
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && this.p.has(m.id)) { const f = this.p.get(m.id); this.p.delete(m.id); m.error ? f.rej(new Error(JSON.stringify(m.error))) : f.res(m.result); } }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.p.set(id, { res, rej })); }
}
const seed = { v: 1, ans: {}, star: { '2019-2-1': 1, '2015-1-3': 1, 'en12015-21': 1, 'co-06': 1, '2020-7': 1 }, note: {}, seen: {}, wrong: {}, sess: {}, set: { font: 'm', warm: false } };

const ver = await json('/json/version');
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '#/marks')}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const page = new CDP(ws);
await page.send('Page.enable'); await page.send('Runtime.enable');
await page.send('Page.navigate', { url: BASE + '#/marks' });
await sleep(2000);
await page.send('Runtime.evaluate', { expression: `localStorage.setItem('kaoyan-studio-v1', ${JSON.stringify(JSON.stringify(seed))})` });
await page.send('Page.reload', { ignoreCache: true });
await sleep(3000);
const expr = `(async () => {
  const cards = document.querySelectorAll('#view article.q').length;
  let direct;
  try { const r = await collect(['2019-2-1','2015-1-3','en12015-21','co-06','2020-7']); direct = r.length + ' 题：' + r.map(x => x.q.id + '@' + x.key).join(', '); }
  catch (e) { direct = '抛错：' + e.message; }
  return JSON.stringify({ star: Object.keys(S.star), 页面题卡: cards, 直接调用: direct, 报错: (window.__errs||[]).join('|').slice(0,200) || '无' }, null, 1);
})()`;
const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(r.result.value || JSON.stringify(r));
const shot = await page.send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.shots', 'marks-seeded.png'), Buffer.from(shot.data, 'base64'));
console.log('截图 → .shots/marks-seeded.png');
try { await page.send('Browser.close'); } catch (e) { }
browser.kill();
setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { } }, 500);
