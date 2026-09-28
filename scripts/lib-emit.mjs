/* 站点数据读写
 *
 * 为什么不是 .json：平板上很可能直接双击 index.html（file://），
 * 那时 fetch() 读本地 JSON 会被浏览器拦成跨域。改成 .js（window.KY[...] = {...}）
 * 用 <script> 注入，file:// 和 http:// 都能跑。体检脚本用 loadJs() 反向解析。
 */
import fs from 'node:fs';
import path from 'node:path';

export function emitJS(file, key, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `window.KY=Object.assign(window.KY||{},${JSON.stringify({ [key]: obj })});`, 'utf8');
}

export function loadJS(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const m = txt.match(/Object\.assign\(window\.KY\|\|\{\},\s*([\s\S]*\})\s*\)\s*;?\s*$/);
  if (!m) throw new Error('不是本站数据文件格式：' + file);
  const bag = JSON.parse(m[1]);
  return Object.values(bag)[0];
}

export function listKeys(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
}
