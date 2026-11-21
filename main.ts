// Palmetto Six-Star — GTA VI trophy guide & tracker: the entrypoint.
//
// This file is the program you run. It is a small static file server with the
// Node standard library only (Node 22 runs it directly: `node main.ts`), so the
// guide works offline with no build step and no install. It serves everything
// under app/ — the page, its module script, its stylesheet and both JSON data
// files — and refuses any path that would escape app/.
//
// Usage:
//   node main.ts                 serve app/ on http://127.0.0.1:8080
//   node main.ts --port 18082    serve on another port
//   node main.ts --host 0.0.0.0  bind every interface (LAN access)
//
// On startup it prints the listening address and a short route list so you can
// see exactly what is being served without opening a browser.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The directory this file lives in, and the app/ folder it serves.
const here = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(here, 'app');

// MIME types the browser needs for the files we actually ship. Unknown
// extensions fall back to a generic binary type so nothing gets mislabelled.
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// A tiny command-line parser. It understands only the two flags this program
// documents; anything else is ignored so a stray argument never crashes it.
interface Options {
  port: number;
  host: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { port: 8080, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--port' && next !== undefined) {
      const n = Number(next);
      if (Number.isInteger(n) && n > 0 && n < 65536) {
        options.port = n;
        i++;
      }
    } else if (arg === '--host' && next !== undefined) {
      options.host = next;
      i++;
    }
  }
  return options;
}

// Resolve a request path to a file inside app/. Returns null when the path is
// missing, escapes app/, or points at a directory with no index.html.
function resolveTarget(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const candidate = resolve(join(appRoot, normalize(decoded)));
  if (candidate !== appRoot && !candidate.startsWith(appRoot + sep)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

// The short route list printed at startup: the handful of files a first load
// of the page touches, plus the data endpoints the app fetches.
function routeList(): string[] {
  return ['/', '/app.js', '/style.css', '/data/trophies.json', '/data/sources.json'];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const routes = routeList();

  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end('method not allowed');
      return;
    }

    const url = new URL(request.url ?? '/', `http://${options.host}`);
    const target = resolveTarget(url.pathname);
    if (target === null) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }

    const stats = statSync(target);
    const mime = MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': mime,
      'content-length': stats.size,
      'cache-control': 'no-store',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  });

  server.listen(options.port, options.host, () => {
    const address = `http://${options.host}:${options.port}`;
    console.log(`Palmetto Six-Star is serving app/ at ${address}`);
    console.log('Routes:');
    for (const route of routes) console.log(`  ${route}`);
    console.log(`  (any other file under app/ is served at its own path)`);
  });
}

main();
