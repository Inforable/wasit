import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, createProviderApi, ApiError } from '../web/src/lib/api.js';

test('consumer API sends cookies, JSON and CSRF and reports unauthorized sessions', async () => {
  let calls = 0;
  const api = createApi({ getCsrfToken: () => 'csrf-demo', onUnauthorized: () => { calls++; }, fetcher: async (_path, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-demo');
    assert.equal(options.body, '{"text":"AC service"}');
    return new Response(JSON.stringify({ error: 'unauthenticated', message: 'Sign in to continue.' }), { status: 401 });
  } });
  await assert.rejects(api('/api/requests', { method: 'POST', body: { text: 'AC service' } }), (error) => error instanceof ApiError && error.status === 401);
  assert.equal(calls, 1);
});
test('provider bearer never carries consumer cookies or CSRF and stays on provider endpoints', async () => {
  const api = createProviderApi({ getBearerToken: () => 'secret-demo', getCsrfToken: () => 'private', fetcher: async (_path, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, 'Bearer secret-demo');
    assert.equal(options.headers['X-CSRF-Token'], undefined);
    return new Response('{"ok":true}', { status: 200 });
  } });
  assert.deepEqual(await api('/api/provider/branch_demo01'), { ok: true });
  await assert.rejects(api('/api/requests'), /restricted/);
  await assert.rejects(api('https://example.com/api/provider/branch_demo01'), /local/);
});
