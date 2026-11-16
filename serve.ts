// DUSTLINE dev server: serves game/ on http://localhost:8080 (Node stdlib only).
//
//   node serve.ts [port]
//
// Static files only: correct MIME types, no directory listing, no path escape
// above game/. This is a playtesting helper; the entry itself is handed in
// by main.ts and needs no server.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const GAME_DIR = resolve(join(here, 'game'));
const PORT = Number(process.argv[2] ?? 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glsl': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const rawPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const rel = normalize(rawPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
  const file = resolve(join(GAME_DIR, rel === '' ? 'index.html' : rel));
  if (file !== GAME_DIR && !file.startsWith(GAME_DIR + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden\n');
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
    return;
  }
  if (!stat.isFile()) {
    // No directory listing: a directory path serves its index.html, else 404.
    const index = join(file, 'index.html');
    if (existsSync(index) && statSync(index).isFile()) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      createReadStream(index).pipe(res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  process.stdout.write(`dustline: serving game/ at http://localhost:${PORT}/\n`);
});
