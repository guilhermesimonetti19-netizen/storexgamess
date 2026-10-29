// Servidor local de desenvolvimento (sem dependências): estáticos + /api. Uso: npm run dev
import http from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createApp } from './router.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, '.env'))) for (const l of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !l.trim().startsWith('#')) process.env[m[1]] ??= m[2]; }
const app = createApp({ env: process.env });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain', '.xml': 'application/xml' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    const r = await app(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let file = path.join(root, 'public', path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { if (!path.extname(file)) file = path.join(root, 'public', 'index.html'); }
  try { const d = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end('404'); }
}).listen(process.env.PORT || 3000, () => console.log('StoreX Games em http://localhost:' + (process.env.PORT || 3000)));
