/* 取 408 的「第二来源」答案本
 *
 * CodePanda66/CSPostgraduate-408 的 408Exam/ 里是 2009-2020 的「真题及答案解析」，
 * 有文字层（实测 2019 抽出 1.4 万字），可以补 neville 那批答案卷是扫描件的年份。
 * 整仓 clone 会被大文件卡死（index-pack failed），所以走 tree + blob API 单文件取。
 *
 * 用法：node scripts/fetch-408-alt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '_vendor/408-alt');
fs.mkdirSync(OUT, { recursive: true });

function curl(args, opts = {}) {
  return execFileSync('curl', ['-s', '-m', opts.timeout || 60, ...args], { encoding: 'utf8', maxBuffer: opts.buf || 1 << 26 });
}
function curlBin(args, to, timeout) {
  execFileSync('curl', ['-s', '-m', timeout || 240, ...args, '-o', to], { maxBuffer: 1 << 20, stdio: ['ignore', 'ignore', 'inherit'] });
  return fs.existsSync(to) ? fs.statSync(to).size : 0;
}

const REPO = 'CodePanda66/CSPostgraduate-408';
const tree = JSON.parse(curl(['-m', '40', `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`]));
const want = tree.tree.filter((t) => t.type === 'blob' && /^408Exam\/\d{4}.*\.pdf$/.test(t.path) && /答案|解析|参考答案/.test(t.path));
console.log(`仓库里 408Exam 的答案本共 ${want.length} 个`);
const manifest = [];
for (const f of want) {
  const name = path.basename(f.path).replace(/[\\/:*?"<>|]/g, '');
  const to = path.join(OUT, name);
  if (fs.existsSync(to) && fs.statSync(to).size === f.size) { console.log(' · 已在', name); manifest.push({ path: f.path, file: name, size: f.size }); continue; }
  const size = curlBin(['-H', 'Accept: application/vnd.github.raw+json', `https://api.github.com/repos/${REPO}/git/blobs/${f.sha}`], to, 300);
  const okSize = size > 100000 && Math.abs(size - f.size) < 4096;
  console.log(okSize ? ' ✓' : ' ✗', name, size, '字节（仓库标', f.size + '）');
  if (okSize) manifest.push({ path: f.path, file: name, size, sha: f.sha });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ repo: `github.com/${REPO}`, at: new Date().toISOString().slice(0, 16).replace('T', ' '), files: manifest }, null, 1), 'utf8');
console.log(`\n取到 ${manifest.length} 份 → ${OUT}`);
