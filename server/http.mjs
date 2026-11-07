import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { HttpError } from './errors.mjs';

const RESPONSE = Symbol('wasit.response');
export const reply = (status, body) => ({ [RESPONSE]: true, status, body });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const inside = (root, target) => {
  const part = relative(root, target);
  return part === '' || (part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part));
};

export async function readJson(req, limit = 64 * 1024) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new HttpError(413, 'too_large', 'The request body is too large.');
    chunks.push(chunk);
  }
  if (!bytes) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'bad_json', 'Send a valid JSON request body.'); }
}

export function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function serveUi(pathname, res, distDir, head) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new HttpError(400, 'bad_path', 'The URL is invalid.'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) {
    throw new HttpError(403, 'forbidden', 'This path is not available.');
  }
  const root = await realpath(distDir).catch(() => null);
  if (!root) throw new HttpError(503, 'ui_not_built', 'Build the app before serving it.');
  const candidate = resolve(root, '.' + decoded);
  if (!inside(root, candidate)) throw new HttpError(403, 'forbidden', 'This path is not available.');
  let target = await realpath(candidate).catch(() => null);
  if (target && !inside(root, target)) throw new HttpError(403, 'forbidden', 'This path is not available.');
  if (!target || !(await stat(target)).isFile()) {
    if (extname(decoded)) throw new HttpError(404, 'not_found', 'The file was not found.');
    target = await realpath(resolve(root, 'index.html')).catch(() => null);
    if (!target || !inside(root, target)) throw new HttpError(404, 'not_found', 'The page was not found.');
  }
  const content = await readFile(target);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
    'Content-Length': content.length, 'Cache-Control': 'no-store',
  });
  res.end(head ? undefined : content);
}

// Route handlers receive a single context; request bodies are parsed only for matched routes.
export function createAppHandler({ distDir, routes = [], health = () => ({ ok: true, ai_mode: 'Offline · rules', models: null }) }) {
  const table = [['GET', /^\/api\/health$/, () => health()], ...routes];
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      for (const [verb, pattern, handler] of table) {
        const match = url.pathname.match(pattern);
        if (verb !== method || !match) continue;
        const limit = /^\/api\/deals\/[^/]+\/bill-preview$/.test(url.pathname) ? 3 * 1024 * 1024 : 64 * 1024;
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req, limit) : {};
        const value = await handler({ req, res, url, params: match.slice(1), body });
        if (!res.writableEnded && !res.headersSent) {
          if (req.method === 'HEAD') { res.writeHead(200); res.end(); }
          else json(res, value?.[RESPONSE] ? value.status : 200, value?.[RESPONSE] ? value.body : value ?? { ok: true });
        }
        return;
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        throw new HttpError(404, 'not_found', 'This API endpoint is not available.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'method_not_allowed', 'Use GET to open this page.');
      await serveUi(url.pathname, res, distDir, req.method === 'HEAD');
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.end(); return; }
      const known = error instanceof HttpError;
      if (!known) console.error(error);
      json(res, known ? error.status : 500, {
        error: known ? error.code : 'internal_error',
        message: known ? error.message : 'Something went wrong. Please try again.',
      });
    }
  };
}

export const createAppServer = (options) => createServer(createAppHandler(options));
