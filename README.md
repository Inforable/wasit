# Wasit

Clear quotes. No surprise extras.

Compare equivalent service offers, negotiate within your instructions, agree on a version, and approve extra work before the bill changes.

Requires Node.js 22.13+ within Node 22.

```powershell
npm.cmd ci
npm.cmd run dev
```

Development UI: http://localhost:5180. API: http://127.0.0.1:3301. The API restarts when imported backend modules change. Copy .env.example to the ignored .env for configuration.

```powershell
npm.cmd run check
npm.cmd start
```

The check command validates contract fixtures, runs domain/storage/authenticated HTTP tests and builds the frontend. Start serves the existing build. Browser verification scripts use isolated test sessions and storage.

The application implements five-category requests, private provider branches, source-checked quotes, comparison and negotiation, bilateral immutable agreements, bill checks, optional-work changes and a labeled payment/dispute simulation. Optional OpenAI features use structured output, independent validation and rules fallback.

Production URL: https://wasit-id.vercel.app. Vercel requires an external PostgreSQL database for business actions. Local SQLite remains a development adapter. Actual hosted readiness and remaining gates are recorded in docs/10-deployment.md; individual completion is recorded in the ticket files.

Product copy uses English. Light is the default. Product scope, shared interaction rules, task ownership and actual verification evidence are documented in docs/.
