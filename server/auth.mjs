import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { reply } from './http.mjs';

export const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const PROVIDER_TTL_MS = 6 * 60 * 60 * 1000;
const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const fail = (status, code, message) => new HttpError(status, code, message);
const header = (req, name) => typeof req.headers?.[name.toLowerCase()] === 'string' ? req.headers[name.toLowerCase()] : null;
const equal = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length > 256 || right.length > 256) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
function originOf(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch { return null; }
}
function cookieValue(req, name) {
  const values = String(header(req, 'cookie') ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return tokenPattern.test(token) ? token : null;
}
function bearerValue(req) {
  const authorization = header(req, 'authorization');
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
  return match?.[1] ?? null;
}
function emptyBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0;
}

export function createAuth({
  store, now = Date.now, secret = process.env.WASIT_SESSION_SECRET,
  allowedOrigins = process.env.WASIT_ALLOWED_ORIGINS, publicOrigin = process.env.WASIT_PUBLIC_ORIGIN,
  secure,
} = {}) {
  if (!store?.query) throw new TypeError('Authentication requires a persistent store.');
  const production = secure === true || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const isSecure = production || secure === true;
  const key = secret ?? (production ? null : 'wasit-local-development-session-secret');
  const configuredPublicOrigin = publicOrigin ?? (production ? null : 'http://localhost:5180');
  const canonicalPublicOrigin = originOf(configuredPublicOrigin);
  const configuredOrigins = allowedOrigins instanceof Set ? [...allowedOrigins]
    : Array.isArray(allowedOrigins) ? allowedOrigins
      : typeof allowedOrigins === 'string' ? allowedOrigins.split(',').map((value) => value.trim()).filter(Boolean)
        : production ? [canonicalPublicOrigin].filter(Boolean) : ['http://localhost:5180', 'http://127.0.0.1:5180', 'http://localhost:3301', 'http://127.0.0.1:3301'];
  const origins = new Set(configuredOrigins.map(originOf).filter(Boolean));
  const cookieName = isSecure ? '__Host-wasit_session' : 'wasit_session';
  const first = async (text, params = []) => (await store.query(text, params)).rows[0] ?? null;
  function configured() {
    if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') < 32 || !canonicalPublicOrigin || (production && !canonicalPublicOrigin.startsWith('https://')) || !origins.size || configuredOrigins.some((value) => !originOf(value))) throw fail(503, 'auth_not_configured', 'Authentication is not configured for this deployment.');
  }
  const csrfFor = (token) => createHmac('sha256', key).update('csrf:' + token).digest('hex');
  const providerToken = (branchId, nonce) => createHmac('sha256', key).update('provider:' + branchId + ':' + nonce).digest('base64url');
  function requireOrigin(req) {
    const origin = header(req, 'origin');
    if (!origin || !origins.has(origin) || originOf(origin) !== origin) throw fail(403, 'csrf_failed', 'Open Wasit from its configured address before continuing.');
  }
  function requireJsonOrEmpty(req, body) {
    if (!emptyBody(body)) throw fail(400, 'invalid_payload', 'This action accepts an empty request body only.');
    const hasBody = Number(header(req, 'content-length') ?? 0) > 0 || header(req, 'transfer-encoding') != null;
    const contentType = header(req, 'content-type')?.split(';')[0].trim().toLowerCase();
    if (hasBody && contentType !== 'application/json') throw fail(400, 'invalid_payload', 'Send a JSON request body.');
  }
  function cookie(token, expired = false) {
    return cookieName + '=' + (expired ? '' : token) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (expired ? '0' : String(SESSION_TTL_MS / 1000)) + (isSecure ? '; Secure' : '');
  }
  async function consumerSession(req) {
    const token = cookieValue(req, cookieName);
    if (!token) return null;
    const row = await first('SELECT * FROM sessions WHERE id=$1', [hash(token)]);
    if (!row || !row.actor_id || !Number.isFinite(Number(row.expires_at)) || Number(row.expires_at) <= now()) return null;
    const csrf = csrfFor(token);
    if (!equal(hash(csrf), row.csrf_hash)) return null;
    return { token, csrf, row, actor: { role: 'consumer', actor_id: row.actor_id, session_id: row.id, generation: Number(row.generation ?? 0) } };
  }
  async function providerForToken(req, expectedBranchId = null) {
    const token = bearerValue(req);
    if (!token) throw fail(403, 'invalid_provider_token', 'The provider link is invalid or has expired.');
    const row = expectedBranchId == null
      ? await first('SELECT * FROM branches WHERE token_hash=$1', [hash(token)])
      : await first('SELECT * FROM branches WHERE id=$1', [expectedBranchId]);
    if (!row || row.mode !== 'human' || !row.provider_id || !equal(row.token_hash, hash(token)) || !Number.isFinite(Number(row.token_expires_at)) || Number(row.token_expires_at) <= now()) throw fail(403, 'invalid_provider_token', 'The provider link is invalid or has expired.');
    const request = await first('SELECT id FROM requests WHERE id=$1 AND archived_at IS NULL', [row.request_id]);
    if (!request) throw fail(403, 'invalid_provider_token', 'The provider link is invalid or has expired.');
    return { role: 'provider', actor_id: row.provider_id, provider_id: row.provider_id, branch_id: row.id, request_id: row.request_id };
  }

  async function requireConsumer(req, { mutation = false } = {}) {
    configured();
    if (header(req, 'authorization')) {
      await providerForToken(req);
      throw fail(403, 'wrong_role', 'This action is available to the customer only.');
    }
    const session = await consumerSession(req);
    if (!session) throw fail(401, 'session_required', 'Sign in to continue.');
    if (mutation) {
      requireOrigin(req);
      const supplied = header(req, 'x-csrf-token');
      if (!equal(supplied, session.csrf) || !equal(hash(supplied ?? ''), session.row.csrf_hash)) throw fail(403, 'csrf_failed', 'Your session could not verify this request. Reload Wasit and try again.');
    }
    return session.actor;
  }
  async function ownRequest(req, requestId, options) {
    const actor = await requireConsumer(req, options);
    const row = await first('SELECT * FROM requests WHERE id=$1 AND user_id=$2 AND archived_at IS NULL', [requestId, actor.actor_id]);
    if (!row) throw fail(404, 'not_found', 'The request was not found.');
    return { ...actor, request: row };
  }
  async function ownDeal(req, dealId, options) {
    const actor = await requireConsumer(req, options);
    const row = await first('SELECT d.* FROM deals d JOIN requests r ON r.id=d.request_id JOIN branches b ON b.id=d.branch_id AND b.request_id=d.request_id WHERE d.id=$1 AND r.user_id=$2 AND r.archived_at IS NULL', [dealId, actor.actor_id]);
    if (!row) throw fail(404, 'not_found', 'The agreement was not found.');
    return { ...actor, deal: row };
  }
  async function ownVersion(req, dealId, versionId, options) {
    const actor = await ownDeal(req, dealId, options);
    const row = await first('SELECT * FROM agreement_versions WHERE id=$1 AND deal_id=$2', [versionId, dealId]);
    if (!row) throw fail(404, 'not_found', 'The agreement version was not found.');
    return { ...actor, version: row };
  }
  async function requireProvider(req, branchId) {
    configured();
    return providerForToken(req, branchId);
  }
  async function mintProviderGrant(branchId) {
    configured();
    return store.transaction(async tx => {
      const get = async (sql,params) => (await tx.query(sql,params)).rows[0];
      const related = await get('SELECT request_id FROM branches WHERE id=$1',[branchId]);
      if (related) await tx.query('UPDATE requests SET status=status WHERE id=$1',[related.request_id]);
      const row = await get('SELECT b.*,r.archived_at FROM branches b JOIN requests r ON r.id=b.request_id WHERE b.id=$1',[branchId]);
      if (!row || row.mode !== 'human' || !row.provider_id || row.archived_at != null) throw fail(404, 'not_found', 'The human provider branch was not found.');
      const nonce = opaque(), token = providerToken(branchId, nonce), expires_at = now() + PROVIDER_TTL_MS;
      await tx.query('UPDATE branches SET token_hash=$1,token_nonce=$2,token_expires_at=$3 WHERE id=$4', [hash(token), nonce, expires_at, branchId]);
      return { branch_id: branchId, token, expires_at };
    });
  }

  async function ownedBranch(req, requestId, branchId, mutation) {
    const actor = await ownRequest(req, requestId, { mutation });
    const branch = await first('SELECT * FROM branches WHERE id=$1 AND request_id=$2', [branchId, requestId]);
    if (!branch || branch.mode !== 'human') throw fail(404, 'not_found', 'The human provider branch was not found.');
    return { actor, branch };
  }
  function link(branchId, token, expires_at) {
    const url = new URL('/provider/' + encodeURIComponent(branchId), canonicalPublicOrigin);
    url.hash = 'token=' + token;
    return { branch_id: branchId, provider_url: url.toString(), expires_at };
  }
  async function getProviderLink(req, requestId, branchId) {
    const { branch } = await ownedBranch(req, requestId, branchId, false);
    if (!tokenPattern.test(branch.token_nonce ?? '') || !Number.isFinite(Number(branch.token_expires_at)) || Number(branch.token_expires_at) <= now()) throw fail(409, 'provider_link_unavailable', 'Issue a new provider link before continuing.');
    const token = providerToken(branchId, branch.token_nonce);
    if (!equal(hash(token), branch.token_hash)) throw fail(409, 'provider_link_unavailable', 'Issue a new provider link before continuing.');
    return link(branchId, token, Number(branch.token_expires_at));
  }
  async function issueProviderLink(req, requestId, branchId) {
    await ownedBranch(req, requestId, branchId, true);
    const grant = await mintProviderGrant(branchId);
    return link(branchId, grant.token, grant.expires_at);
  }
  async function bootstrap({ req, res, body }) {
    configured(); requireOrigin(req); requireJsonOrEmpty(req, body);
    if (header(req, 'authorization')) throw fail(403, 'wrong_role', 'Open a customer session separately from the provider link.');
    const existing = await consumerSession(req);
    if (existing) return reply(200, { actor_id: existing.actor.actor_id, csrf_token: existing.csrf });
    const token = opaque(), csrf = csrfFor(token), created_at = now(), actor_id = 'consumer_' + randomBytes(10).toString('hex');
    await store.query('INSERT INTO sessions (id,actor_id,csrf_hash,created_at,expires_at,generation) VALUES ($1,$2,$3,$4,$5,$6)', [hash(token), actor_id, hash(csrf), created_at, created_at + SESSION_TTL_MS, 0]);
    res.setHeader('Set-Cookie', cookie(token));
    return reply(201, { actor_id, csrf_token: csrf });
  }
  async function me({ req }) {
    configured();
    if (header(req, 'authorization')) {
      const actor = await providerForToken(req);
      return { user: { id: actor.actor_id, role: actor.role, branch_id: actor.branch_id } };
    }
    const session = await consumerSession(req);
    return { user: session ? { id: session.actor.actor_id, role: 'consumer' } : null };
  }
  async function logout({ req, res, body }) {
    requireJsonOrEmpty(req, body);
    const actor = await requireConsumer(req, { mutation: true });
    await store.query('DELETE FROM sessions WHERE id=$1', [actor.session_id]);
    res.setHeader('Set-Cookie', cookie('', true));
    return { ok: true };
  }
  const linkRoute = /^\/api\/requests\/([^/]+)\/branches\/([^/]+)\/link$/;
  const routes = [
    ['POST', /^\/api\/demo\/session$/, bootstrap],
    ['GET', /^\/api\/auth\/me$/, me],
    ['POST', /^\/api\/auth\/logout$/, logout],
    ['GET', linkRoute, ({ req, params }) => getProviderLink(req, params[0], params[1])],
    ['POST', linkRoute, ({ req, params, body }) => { requireJsonOrEmpty(req, body); return issueProviderLink(req, params[0], params[1]); }],
  ];
  return { routes, requireConsumer, ownRequest, ownDeal, ownVersion, requireProvider, mintProviderGrant, getProviderLink, issueProviderLink, cookieName };
}
