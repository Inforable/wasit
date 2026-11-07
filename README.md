# Wasit

Compare service offers. Negotiate with confidence. Stay in control of the final bill.

## Local development

Requires Node.js 22.13+ within Node 22.

```powershell
npm.cmd ci
npm.cmd run dev
```

UI: http://localhost:5180. API: http://127.0.0.1:3301.
Component gallery: /components. Light is the default theme.

```powershell
npm.cmd run check
npm.cmd start
```

The check command validates contracts, runs tests and builds the UI.
Start serves an existing build. Copy .env.example to .env for local ports/database settings.

## Available foundation

HTTP/router/static SPA/health, local SQLite migrations and structural agreement invariants,
shared contracts and fixtures, public terms/digest helpers, API auth boundaries, Wasit component styles,
brand/primitives, CI and Vercel adapter.

Request processing, sign-in, negotiation, comparison, agreement actions, models and lifecycle
remain assigned to their tickets. Fixtures are never served as real customer requests.

## Deployment

Live foundation: https://wasit-id.vercel.app

Vercel serves the initial shell and health. Persistent business features require an external transactional database;
the Vercel handler does not initialize a local SQLite file.

Product specification and task ownership are in docs/. The product interface uses English.
