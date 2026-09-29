/* 408 的「第三来源」：JDC2001/408 的 答案/*.pdf
 *
 * 为什么要第三份：CodePanda66 那批只到 2020，且 2020/2021/2022 的主源答案卷是扫描图。
 * 这批文件小（26 万~200 万字节），先看有没有文字层；有文字层也**不直接采信**，
 * 要用已知年份（2013/2016/2019）交叉对一遍——能对上的抽取通道才允许补空白年份。
 *
 * 用法：node scripts/fetch-408-third.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_vendor/408-third');
fs.mkdirSync(OUT, { recursive: true });

const curl = (args, timeout = 60) => execFileSync('curl', ['-s', '-m', timeout, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
function curlBin(args, to, timeout = 300) {
  try {
    execFileSync('curl', ['-s', '-L', '--retry', '3', '--retry-delay', '2', '-m', timeout, ...args, '-o', to], { maxBuffer: 1 << 20, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch (e) { return -1; }
  return fs.existsSync(to) ? fs.statSync(to).size : 0;
}

const REPO = 'JDC2001/408';
const tree = JSON.parse(curl(['-H', 'Accept: application/vnd.github+json', `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`], 40));
const want = tree.tree.filter((t) => t.type === 'blob' && /^答案\/.*(2013|2016|2019|2020|2021|2022)/.test(t.path));
console.log(`要取 ${want.length} 份`);
const manifest = [];
for (const f of want) {
  const year = f.path.match(/(20\d\d)/)[1];
  const name = `${year}-答案-${path.basename(f.path).replace(/[\\/:*?"<>|]/g, '')}`;
  const to = path.join(OUT, name);
  if (fs.existsSync(to) && fs.statSync(to).size === f.size) { console.log(' · 已在', name); manifest.push({ path: f.path, file: name, size: f.size, sha: f.sha }); continue; }
  const size = curlBin(['-H', 'Accept: application/vnd.github.raw+json', `https://api.github.com/repos/${REPO}/git/blobs/${f.sha}`], to);
  const ok = size > 10000 && Math.abs(size - f.size) < 4096;
  console.log(ok ? ' ✓' : ' ✗', name, size, '字节（仓库标', f.size + '）');
  if (ok) manifest.push({ path: f.path, file: name, size, sha: f.sha });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ repo: `github.com/${REPO}`, at: new Date().toISOString().slice(0, 16).replace('T', ' '), files: manifest }, null, 1), 'utf8');
console.log(`\n取到 ${manifest.length} 份 → ${OUT}`);
