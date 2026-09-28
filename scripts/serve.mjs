/* 零依赖静态服务器（本地看站 + 截图工具用）
   用法：node scripts/serve.mjs [--port=8137] [--dir=web] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const eq = args.find((a) => a.startsWith(`--${k}=`)); return eq ? eq.split('=')[1] : d; };
const PORT = +arg('port', 8137);
const DIR = path.join(root, arg('dir', 'web'));

const TYPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(DIR, u === '/' ? 'index.html' : u);
  if (!p.startsWith(DIR)) { res.writeHead(403).end('forbidden'); return; }
  fs.stat(p, (err, st) => {
    if (!err && st.isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (e2, buf) => {
      if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + u); return; }
      res.writeHead(200, { 'Content-Type': TYPE[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
});
server.listen(PORT, () => console.log(`本机预览 http://127.0.0.1:${PORT}/  （目录 ${DIR}）`));
