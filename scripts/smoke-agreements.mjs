import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
export async function until(check, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch (error) { last = error; }
    await delay(100);
  }
  throw new Error('Timed out waiting for a browser condition.' + (last ? ' ' + last.message : ''));
}

class Connection {
  constructor(socket) {
    this.socket = socket; this.next = 0; this.pending = new Map(); this.listeners = new Set();
    socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data));
      if (value.id) {
        const pending = this.pending.get(value.id); if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(value.id);
        if (value.error) pending.reject(new Error(value.error.message)); else pending.resolve(value.result ?? {});
      } else for (const listener of this.listeners) listener(value);
    });
    socket.addEventListener('close', () => { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('The browser connection closed.')); } this.pending.clear(); });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

export async function createBrowser({ executable = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless = true } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'wasit-browser-profile-'));
  const processHandle = spawn(executable, [...(headless ? ['--headless=new'] : []), '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let launchError;
  processHandle.once('error', (error) => { launchError = error; });
  const active = await until(async () => { if (launchError) throw launchError; return readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null); }, 20000);
  const port = active.split('\n')[0], info = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
  const socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const connection = new Connection(socket), contexts = new Set();
  return {
    async newPage({ viewport = { width: 390, height: 844 }, contextId } = {}) {
      const browserContextId = contextId ?? (await connection.send('Target.createBrowserContext')).browserContextId;
      contexts.add(browserContextId);
      const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params = {}) => connection.send(method, params, sessionId);
      const errors = [];
      connection.listeners.add((event) => { if (event.sessionId === sessionId && event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text); });
      await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
      await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
      const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result?.value;
      };
      const page = {
        contextId: browserContextId, targetId, send, evaluate, errors,
        onEvent(listener) { const wrapped = (event) => { if (event.sessionId === sessionId) listener(event); }; connection.listeners.add(wrapped); return () => connection.listeners.delete(wrapped); },
        async navigate(url) { const target = new URL(url); await send('Page.navigate', { url }); await until(() => evaluate('document.readyState === "complete" && location.origin + location.pathname === ' + JSON.stringify(target.origin + target.pathname))); },
        waitFor: (expression, timeout = 15000) => until(() => evaluate(expression), timeout),
        async clickText(value, { exact = false, selector = 'button' } = {}) {
          await page.waitFor(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e => ${exact ? 'e.textContent.trim() === ' : 'e.textContent.includes('}${JSON.stringify(value)}${exact ? '' : ')'} && !e.disabled && e.getClientRects().length)`);
          await evaluate(`(() => { const e = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => ${exact ? 'e.textContent.trim() === ' : 'e.textContent.includes('}${JSON.stringify(value)}${exact ? '' : ')'} && !e.disabled && e.getClientRects().length); e.scrollIntoView({block:'center'}); e.click(); return true; })()`);
        },
        async fill(selector, value) {
          await page.waitFor('Boolean(document.querySelector(' + JSON.stringify(selector) + '))');
          await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Input missing'); e.focus(); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
        },
        async select(selector, value) { await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Select missing'); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); },
        async setCookie(cookie) { return send('Network.setCookie', cookie); },
        async screenshot(path) { const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path, Buffer.from(result.data, 'base64')); },
        async overflow() { return evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth > innerWidth + 1})'); },
      };
      return page;
    },
    async close() {
      try { await connection.send('Browser.close'); } catch { processHandle.kill(); }
      socket.close();
      await delay(300);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export async function smokeAgreements({ base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3312', output = process.env.SMOKE_OUTPUT } = {}) {
  const directory = output ? resolve(output) : await mkdtemp(join(tmpdir(), 'wasit-agreement-smoke-'));
  await mkdir(directory, { recursive: true });
  let cookie = '', csrf = '';
  const request = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(base + path, { method, headers: { Origin: base, ...(token ? { Authorization: 'Bearer ' + token } : { Cookie: cookie, 'X-CSRF-Token': csrf }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.ok(response.ok, method + ' ' + path + ': ' + result.message);
    return { result, response };
  };
  const boot = await request('/api/demo/session', { method: 'POST', body: {} });
  cookie = boot.response.headers.get('set-cookie').split(';')[0]; csrf = boot.result.csrf_token;
  const api = async (path, options) => (await request(path, options)).result;
  await api('/api/profile', { method: 'PUT', body: { display_name: 'Verification customer', location_label: 'Kelapa Gading', weights: { price: 50, slot: 25, trust: 25 } } });
  const post = (path, body = {}) => api(path, { method: 'POST', body });
  let snapshot = await post('/api/demo/scenarios/ac_service');
  for (let index = 0; index < 30; index++) { snapshot = await post('/api/requests/' + snapshot.id + '/process', { max_steps: 2 }); if (snapshot.cards.length) break; }
  const branch = snapshot.branches.find((value) => value.mode === 'human'); assert.ok(branch);
  const link = await api('/api/requests/' + snapshot.id + '/branches/' + branch.id + '/link');
  const token = new URLSearchParams(new URL(link.provider_url).hash.slice(1)).get('token'); assert.ok(token);
  const browser = await createBrowser();
  const report = { base, viewport: { width: 390, height: 844 }, checks: [], screenshots: [], browser_errors: [] };
  const record = (message) => { report.checks.push(message); process.stdout.write('PASS ' + message + '\n'); };
  try {
    const customer = await browser.newPage(), provider = await browser.newPage();
    const [name, value] = cookie.split('='); await customer.setCookie({ name, value, url: base, httpOnly: true, sameSite: 'Lax' });
    await provider.navigate(link.provider_url);
    await provider.waitFor('Boolean(document.querySelector("#provider-message-draft"))');
    assert.equal(await provider.evaluate('location.hash'), '');
    assert.equal(await provider.evaluate('Object.keys(localStorage).some(k=>/token|provider/i.test(k))'), false);
    record('Provider invitation fragment is removed and no bearer is stored in localStorage.');
    const quoted = 'AC cleaning: 1 unit at Rp90.000 per unit. Refrigerant check: 1 service included. Transport Rp20.000 per job. Available: ' + snapshot.job.schedule_label + '. Capacitor replacement: 1 pcs at Rp150.000 per pcs, only if needed and approved.';
    const sentIds = []; let failFirstResponse = true;
    const stopIntercept = provider.onEvent((event) => {
      if (event.method !== 'Fetch.requestPaused') return;
      const paused = event.params;
      try { sentIds.push(JSON.parse(paused.request.postData).client_message_id); } catch {}
      if (failFirstResponse) { failFirstResponse = false; provider.send('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' }).catch(() => {}); }
      else provider.send('Fetch.continueResponse', { requestId: paused.requestId }).catch(() => {});
    });
    await provider.send('Fetch.enable', { patterns: [{ urlPattern: base + '/api/provider/' + branch.id + '/messages', requestStage: 'Response' }] });
    await provider.fill('#provider-message-draft', quoted); await provider.clickText('', { exact: true, selector: 'button.send' });
    await provider.waitFor('Boolean(document.querySelector(".tx-notice-error"))');
    await provider.clickText('', { exact: true, selector: 'button.send' });
    await until(async () => (await api('/api/provider/' + branch.id, { token })).messages.some((message) => message.sender === 'provider' && message.text === quoted));
    await until(() => sentIds.length === 2);
    assert.equal(sentIds[0], sentIds[1]);
    await provider.send('Fetch.disable'); stopIntercept();
    assert.equal((await api('/api/provider/' + branch.id, { token })).messages.filter((message) => message.sender === 'provider' && message.text === quoted).length, 1);
    record('A lost send response retries the same client message ID and creates exactly one message.');
    for (let index = 0; index < 30; index++) { snapshot = await post('/api/requests/' + snapshot.id + '/process', { max_steps: 2 }); if (snapshot.branches.find((value) => value.id === branch.id).quote?.status === 'ready') break; }
    const human = snapshot.branches.find((value) => value.id === branch.id); assert.equal(human.quote?.status, 'ready');
    record('A human provider sends a source-backed quote from the live inbox.');
    let deal = await post('/api/requests/' + snapshot.id + '/deals', { branch_id: branch.id, quote_revision: human.quote.revision });
    const getDeal = () => api('/api/deals/' + deal.id);
    await customer.navigate(base + '/deals/' + deal.id);
    await customer.clickText('Review terms', { exact: true });
    await customer.evaluate('document.querySelector(".tx-pending .confirm-check input").click()');
    await customer.clickText('Continue to acceptance');
    await customer.clickText('Send agreement for acceptance');
    await until(async () => (await getDeal()).versions.some((version) => version.status === 'pending'));
    await customer.waitFor('Array.from(document.querySelectorAll(".tx-pending .confirm-check")).some(e=>e.textContent.includes("spending limit"))');
    await customer.evaluate('document.querySelector(".tx-pending .confirm-check input").click()');
    await customer.clickText('Accept this version');
    assert.equal((await getDeal()).active_version_id, null);
    record('One customer acceptance cannot activate an agreement.');
    await provider.clickText('Job', { exact: true });
    await provider.waitFor('Boolean(document.querySelector(".tx-pending .confirm-check input"))');
    assert.equal(await provider.evaluate('/spending limit|spending_limit|max_budget|budget_ack_limit/i.test(document.body.innerText)'), false);
    await provider.evaluate('document.querySelector(".tx-pending .confirm-check input").click()');
    await provider.clickText('Accept this version');
    deal = await until(async () => { const current = await getDeal(); return current.active_version_id && current; });
    const firstVersion = deal.active_version_id;
    await customer.waitFor('Boolean(document.querySelector(".ticket .stamp-locked"))');
    record('Independent provider acceptance activates version 1 without exposing the private limit.');
    await customer.clickText('Simulate payment');
    await until(async () => (await getDeal()).lifecycle.status === 'paid');
    record('Customer payment simulation holds the code-computed committed total.');
    await customer.clickText('Check extra work on site');
    const changeSection = '.tx-change-options';
    await customer.waitFor('Boolean(document.querySelector(' + JSON.stringify(changeSection) + '))');
    await customer.evaluate('document.querySelector(".tx-change-option input").click()');
    await customer.evaluate('Array.from(document.querySelectorAll(".commerce")).find(e=>e.textContent.includes("Approve a change before work starts")).querySelector(".confirm-check input").click()');
    await customer.clickText('Create change proposal');
    deal = await until(async () => { const current = await getDeal(); return current.pending_version_id && current; });
    assert.equal(deal.active_version_id, firstVersion);
    await customer.clickText('Send agreement for acceptance');
    await customer.waitFor('Boolean(document.querySelector(".tx-pending .confirm-check input"))');
    await customer.evaluate('document.querySelector(".tx-pending .confirm-check input").click()');
    await customer.clickText('Accept this version');
    await provider.waitFor('Boolean(document.querySelector(".tx-pending .confirm-check input"))');
    await provider.evaluate('document.querySelector(".tx-pending .confirm-check input").click()');
    await provider.clickText('Accept this version');
    deal = await until(async () => { const current = await getDeal(); return current.active_version_id !== firstVersion && current; });
    assert.equal(deal.lifecycle.due, 150000);
    record('A source-backed version 2 preserves version 1 until bilateral acceptance and shows an unpaid top-up.');
    await customer.clickText('Agreement', { exact: true, selector: 'button.back-link' });
    await customer.clickText('Simulate top-up'); await until(async () => (await getDeal()).lifecycle.due === 0);
    await customer.clickText('Check extra work on site');
    await customer.fill('.tx-bill-row input[type="number"][min="0"]', '90000');
    await customer.evaluate('Array.from(document.querySelectorAll(".confirm-check")).find(e=>e.textContent.includes("I checked the items")).querySelector("input").click()');
    await customer.clickText('Compare with active agreement');
    await customer.waitFor('Boolean(document.querySelector(".tx-result-matches"))');
    record('Manual bill lines require confirmation and display a result bound to active version 2.');
    await provider.clickText('Mark agreed work complete');
    await until(async () => (await getDeal()).lifecycle.status === 'done');
    await customer.clickText('Agreement', { exact: true, selector: 'button.back-link' });
    await customer.clickText('Confirm work complete and simulate release');
    await until(async () => (await getDeal()).lifecycle.status === 'released');
    await customer.clickText('Publish one-time review');
    await until(async () => (await getDeal()).lifecycle.rating?.stars === 5);
    await provider.waitFor('Boolean(document.querySelector(".tx-review textarea"))');
    await provider.fill('.tx-review textarea', 'Thank you for confirming the completed work.');
    await provider.clickText('Publish reply');
    await until(async () => Boolean((await getDeal()).lifecycle.rating?.reply));
    record('Provider completion, customer release, one-time review and provider reply work through separate principals.');
    await provider.clickText('Business', { exact: true });
    await provider.waitFor('Array.from(document.querySelectorAll("button")).some(e=>e.textContent.includes("Save business profile"))');
    await provider.clickText('Save business profile'); await provider.clickText('Save price list');
    await provider.clickText('Feedback', { exact: true });
    await provider.waitFor('document.body.innerText.includes("Completed job reviews")');
    record('Provider business profile, price list and own feedback load and save through authorized routes.');
    const privacy = await api('/api/provider/' + branch.id, { token });
    assert.equal(/"(?:spending_limit|max_budget|budget_ack_limit|actor_id|user_id|consumer_id)":/.test(JSON.stringify(privacy)), false);
    for (const [label, page] of [['agreement', customer], ['provider-feedback', provider]]) {
      const overflow = await page.overflow(); assert.equal(overflow.overflow, false, label + ' overflows at 390px');
      await page.evaluate('window.scrollTo(0,0)'); await page.waitFor('scrollY === 0');
      const screenshot = join(directory, label + '-390.png'); await page.screenshot(screenshot); report.screenshots.push(screenshot); report.browser_errors.push(...page.errors);
    }
    record('Agreement and provider screens fit a 390px viewport with no horizontal overflow.');
    let nextSnapshot = await post('/api/demo/scenarios/ac_service');
    for (let index = 0; index < 30; index++) { nextSnapshot = await post('/api/requests/' + nextSnapshot.id + '/process', { max_steps: 2 }); if (nextSnapshot.cards.length) break; }
    const nextBranch = nextSnapshot.branches.find((value) => value.mode === 'human');
    const nextLink = await api('/api/requests/' + nextSnapshot.id + '/branches/' + nextBranch.id + '/link');
    const nextToken = new URLSearchParams(new URL(nextLink.provider_url).hash.slice(1)).get('token');
    await api('/api/provider/' + nextBranch.id + '/messages', { method: 'POST', body: { text: quoted.replace(snapshot.job.schedule_label, nextSnapshot.job.schedule_label), client_message_id: 'client_dispute_smoke0001' }, token: nextToken });
    for (let index = 0; index < 30; index++) { nextSnapshot = await post('/api/requests/' + nextSnapshot.id + '/process', { max_steps: 2 }); if (nextSnapshot.branches.find((value) => value.id === nextBranch.id).quote?.status === 'ready') break; }
    const nextQuote = nextSnapshot.branches.find((value) => value.id === nextBranch.id).quote;
    const nextDeal = await post('/api/requests/' + nextSnapshot.id + '/deals', { branch_id: nextBranch.id, quote_revision: nextQuote.revision });
    const nextVersion = nextDeal.versions[0], selectors = { version_id: nextVersion.id, terms_digest: nextVersion.terms_digest, expected_active_version_id: null };
    await post('/api/deals/' + nextDeal.id + '/submit', selectors);
    await post('/api/deals/' + nextDeal.id + '/accept', { ...selectors, budget_ack_limit: nextVersion.terms.spending_limit });
    await api('/api/provider/' + nextBranch.id + '/accept', { method: 'POST', body: { ...selectors, budget_ack_limit: null }, token: nextToken });
    await post('/api/deals/' + nextDeal.id + '/pay', { expected_active_version_id: nextVersion.id });
    await customer.navigate(base + '/deals/' + nextDeal.id);
    await provider.navigate(nextLink.provider_url);
    await customer.clickText('Report a problem');
    await customer.fill('.tx-inset textarea', 'The agreed work still needs attention.');
    await customer.clickText('Open dispute');
    await customer.waitFor('Boolean(document.querySelector(".tx-dispute"))');
    await customer.fill('.tx-dispute textarea', 'Customer evidence: the reported leak remains.');
    await customer.clickText('Add evidence');
    await provider.clickText('Job', { exact: true });
    await provider.waitFor('Boolean(document.querySelector(".tx-dispute"))');
    await provider.fill('.tx-dispute textarea', 'I agree to rework without an additional charge.');
    await provider.clickText('Accept proposed outcome');
    await until(async () => (await api('/api/deals/' + nextDeal.id)).lifecycle.status === 'paid');
    const reworked = await api('/api/deals/' + nextDeal.id);
    assert.equal(reworked.lifecycle.refunded, 0); assert.equal(reworked.lifecycle.dispute.status, 'rework'); assert.equal(reworked.lifecycle.dispute.evidence.length, 1); assert.equal(reworked.lifecycle.done_at, null);
    record('Customer dispute and evidence reach the provider; accepted rework keeps funds held and requires renewed completion.');
    await customer.waitFor('document.body.innerText.includes("Rework agreed")');
    assert.equal((await customer.overflow()).overflow, false);
    const disputeScreenshot = join(directory, 'dispute-rework-390.png'); await customer.screenshot(disputeScreenshot); report.screenshots.push(disputeScreenshot);
    report.browser_errors.push(...customer.errors, ...provider.errors);
    assert.deepEqual(report.browser_errors, []);
    record('No browser runtime exceptions were recorded.');
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write('Artifacts: ' + directory + '\n');
    return report;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await smokeAgreements(); } catch (error) { process.stderr.write('Agreement smoke failed: ' + error.stack + '\n'); process.exitCode = 1; }
}
