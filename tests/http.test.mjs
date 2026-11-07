import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/http.mjs';

test('HTTP routing, JSON limits, SPA fallback and path containment', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wasit-http-'));
  const dist = join(root, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Wasit</title>');
  await writeFile(join(root, 'private.txt'), 'private');
  const server = createAppServer({ distDir: dist, routes: [
    ['POST', /^\/api\/echo$/, ({ body }) => body],
    ['POST', /^\/api\/deals\/([^/]+)\/bill-preview$/, ({ body }) => ({ size: body.image?.length ?? 0 })],
  ] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const health = await fetch(base + '/api/health');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { ok: true, ai_mode: 'Offline · rules', models: null });
  assert.match(await (await fetch(base + '/r/xyz')).text(), /Wasit/);
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  assert.equal((await fetch(base + '/api/requests')).status, 404);
  assert.equal((await fetch(base + '/api')).status, 404);
  const invalid = await fetch(base + '/api/echo', { method: 'POST', body: '{bad' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'bad_json');
  const oversized = await fetch(base + '/api/echo', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(65536) }) });
  assert.equal(oversized.status, 413);
  const bill = await fetch(base + '/api/deals/deal_1/bill-preview', { method: 'POST', body: JSON.stringify({ image: 'x'.repeat(70000) }) });
  assert.equal(bill.status, 200);
  assert.equal((await bill.json()).size, 70000);
  assert.equal((await fetch(base + '/..%2fprivate.txt')).status, 403);
  assert.equal((await fetch(base + '/%00')).status, 403);
  assert.equal((await fetch(base + '/%')).status, 400);
  const head = await fetch(base + '/r/xyz', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
