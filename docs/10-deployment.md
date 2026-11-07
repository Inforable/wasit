# Deployment - Wasit

Production URL: https://wasit-id.vercel.app. Hosting uses Vercel and a free project subdomain; no domain purchase is required.

The current published build includes the customer/provider frontend and business API. GET /api/health reports configured model capability. Production business actions require a shared PostgreSQL database. Until that is provisioned, authenticated business routes return storage_not_configured with HTTP 503. This is separate from an unknown API route, which returns JSON 404.

Local development uses SQLite and is available at http://localhost:5180 with the API at http://127.0.0.1:3301. The development supervisor watches backend modules. A stale process must be restarted after changing the supervisor or environment file.

## Production configuration

- DATABASE_URL or POSTGRES_URL: transactional PostgreSQL connection.
- WASIT_SESSION_SECRET: private random secret of at least 32 bytes.
- WASIT_PUBLIC_ORIGIN: https://wasit-id.vercel.app.
- WASIT_ALLOWED_ORIGINS: explicit production origins.
- OPENAI_API_KEY: server secret only.
- OPENAI_MODEL: configured text model; OPENAI_MODEL_SUPPORT can select the image model.
- OPENAI_REASONING_EFFORT: configured per the selected model.
- WASIT_MODEL_DAILY_CALL_LIMIT: defaults to 500 attempts per UTC day across the shared store. Exhausted capacity uses rules or manual bill entry.

Session and model secrets are configured in Vercel. They are not frontend environment variables and are excluded from Git. OpenAI account access and a bounded live test were verified. Model calls retain independent validation, deadlines and fallback.

Functions use the Singapore region to match the intended database region. Local SQLite, process memory and /tmp are not production persistence. This follows [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

## Database provisioning gate

The intended integration is Neon Free, plan free_v3, region sin1. No paid plan is authorized.

Vercel enforces human acceptance of marketplace terms. Its agent CLI refuses to accept those terms even with account-owner authorization. An operator must run once in an interactive terminal:

```powershell
vercel integration accept-terms neon --scope fayadhs-projects-f3190830
```

After acceptance, provisioning and environment connection can continue automatically. No Neon resource is currently provisioned. A database connection must be tested before transactional production readiness is marked complete.

## Release verification

Check the canonical URL without an authenticated Vercel browser session. Verify home/deep links/assets, Light default, health and unknown API errors. Then verify real session creation, owner-only history, a human provider link, bilateral versions, bill checks, simulated ledger actions and reset across separate requests.

Static hosting, successful local tests and model credentials do not establish hosted database readiness. Long preview URLs can remain protected while the canonical production domain is public. Deployment protection has not been disabled.

Latest published deployment before the shared-flow update: https://wasit-91eg0lakv-fayadhs-projects-f3190830.vercel.app. The canonical project domain follows subsequent production releases.
