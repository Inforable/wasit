# Foundation — Wasit 4.1

## Run

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run check
```

UI: http://localhost:5180. API: http://127.0.0.1:3301.
Build then npm.cmd start serves static UI and API in one local process.

## Available

- Node 22 ESM, table router, structured English errors, JSON limits, static SPA and health.
- Local SQLite additive migrations, version/acceptance immutability, unique active/proposal/role and message replay indexes.
- publicTerms allowlist, stable canonical JSON, public digest and committed-only arithmetic.
- Schema 2020-12 for quotes/comparison/agreements and model/API selectors; 16 deterministic fixtures.
- Consumer CSRF and provider bearer client boundaries, router, currency/avatar helpers and viewport.
- Wasit styles/brand/primitives, Light by default, dark option, reduced motion and /components gallery.
- CI: contract fixtures + meaningful unit/DB/HTTP tests + production build.
- Vercel serverless adapter without opening a local DB file.

The HTTP application implements health only; business routes remain in tickets.
Database primitives do not implement acceptance authorization, activation services or provider discovery.
Model schema is not a connected model. Fixture evaluation is not a live-business-flow result.

## Module ownership and interfaces

A owns server routes/storage/domain, agreement helpers and shared contracts.
B owns web, component bindings, LLM adapters and model extraction.
Internal interfaces use shared/contracts.d.ts; public payloads use the schema registry.
createAppHandler(options) is reusable without a listening socket; createAppServer wraps it locally.
Route handlers return data or reply(status,data). SSE is not required for the first release.

createApi accepts getCsrfToken/onUnauthorized. createProviderApi accepts getBearerToken,
uses Authorization Bearer and omits consumer cookies. Tokens remain in memory.
Provider clients are restricted to local /api/provider/ paths.

## Verification scope

Contract tests validate positive/negative shapes, unknown vs zero, quoted-vs-optional arithmetic,
public digests/privacy and v1/v2 fixture consistency.
SQLite tests verify additive migrations and structural invariants.
HTTP tests verify errors, body limits, SPA fallback and path containment.
API-helper tests verify auth headers and cookie boundaries.

These are foundation checks. They do not yet prove application-level ownership,
two-party activation, runtime model provenance or cross-instance production transactions.

## Vercel persistence

Deployment serves the UI and health; request actions are unavailable.
Local SQLite is a development adapter. Production transactional features require a shared external store
and persisted tasks/leases. Do not write a database under /tmp and claim agreement persistence.
