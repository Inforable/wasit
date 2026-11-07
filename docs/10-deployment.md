# Deployment — Wasit

## Target

Hosting: Vercel. Production domain: https://wasit-id.vercel.app (free subdomain).
Initial release serves the English Wasit shell, component gallery and /api/health.
Business actions remain disabled until their tickets and persistent-storage gate are complete.

## Persistence

Vercel does not guarantee a persistent local filesystem for SQLite writes.
Use an external transactional database for agreements, acceptances, accounts and jobs.
Local SQLite remains for development/invariant tests; /tmp is not production persistence.
This boundary follows [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Persist job generation/deadlines/leases. Run bounded processing through authenticated mutating requests
or a durable worker. GET polling never creates tasks. Do not rely on process-local locks, timers or queues
across Vercel instances. The production database adapter belongs to BE-02.

## Configuration

vercel.json builds Vite into dist and routes /api to api/index.js.
The serverless handler imports no local SQLite bootstrap.
Node 22 runtime; frontend/API share the same origin.
Model keys and production session secrets belong in Vercel environment settings, never the client build.
No secrets are required for the foundation-only release.

## Release checks

- npm.cmd run check passes.
- Home and /components open; first visit is Light.
- /api/health returns JSON; unknown API paths return JSON 404.
- SPA deep links return the app and built assets load.
- Business forms do not submit to fake fixture endpoints.
- Production URL and wasit.app certificate/DNS are checked separately.
- Custom domain attachment does not prove DNS ownership/activation.

## Recorded release state

Verified production URL: https://wasit-id.vercel.app
Provider deployment: https://wasit-eehq1u1au-fayadhs-projects-f3190830.vercel.app
Project: wasit. The free production domain is registered and verified on the project and follows production releases.

Live checks passed: home, /components, SPA deep link, /api/health JSON, unknown API JSON 404, compiled JS/CSS.
Local verification: 16 contract fixtures, 27 tests and production build passed.
Document and application commits: a8c7e64 and 247ba58. Deployment configuration is committed separately.
No production database is provisioned by the foundation release. BE-02 remains the gate for transactional production features.

The requested custom domain was replaced by the free address at the user's direction; no domain purchase is needed.
