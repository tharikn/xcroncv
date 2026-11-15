// Zero-dependency static server with SPA fallback for the built app (dist/web/browser).
// Used by `npm start` and by Playwright. Exists because `ng serve` (Vite) loads a native Rollup binary that
// some locked-down Windows machines (Application Control policy) block; `ng build` does not need it.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.WEB_ROOT ?? 'dist/web/browser');
const port = Number(process.env.PORT ?? 4200);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.txt': 'text/plain',
};

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback
  if (!existsSync(file)) { res.writeHead(503, { 'content-type': 'text/plain' }).end('Build not ready yet. Run: npm run build:dev'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`XCron CV web on http://localhost:${port}  (serving ${root})`));
