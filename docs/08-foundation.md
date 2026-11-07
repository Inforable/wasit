# Foundation - Wasit 4.1

Run `npm.cmd ci`, `npm.cmd run dev` and `npm.cmd run check`. The development UI uses port 5180 and the API uses port 3301. A production build can also be served with `npm.cmd start`.

Implemented services include five-category request formatting, provider discovery and private messaging, source-checked quote revisions, comparison and negotiation, immutable agreement versions, bilateral acceptance, bill checks, simulated settlement, disputes and reviews. HTTP endpoints use persistent authentication, exact-origin CSRF checks and branch-bound provider bearer tokens.

Local SQLite supports development and invariant tests. The production PostgreSQL adapter pins each transaction to one client. Production requires DATABASE_URL or POSTGRES_URL; there is no local-file fallback. Tasks, deadlines, generations and leases are persisted. Reads never initiate negotiation or create ledger entries.

The frontend includes customer request/clarification, live conversations, comparison, agreement history and changes, bill confirmation, provider inbox/business tools, simulated settlement and disputes/reviews. Light is the default. Theme choices, core styles and shared components remain consistent across screens.

Optional OpenAI adapters use locally resolved structured schemas, independent source checks, a bounded configurable timeout, shared model leases and explicit rules fallback. Bill images remain editable drafts that require customer confirmation. Model credentials belong only in server environment settings.

A owns server/domain/storage/shared contracts. B owns frontend and runtime adapters. Delegated implementation may cover both streams while a single integrator owns shared files. Routes return data or reply(status,data); clients preserve separate cookie/CSRF and bearer boundaries.

Verification includes contract fixtures, domain and storage tests, authenticated HTTP flows across all five categories, and real Chrome checks for independent roles, versions, bills, retries, disputes and 390px layouts. Test reports distinguish synthetic data, mocked transport and live model results.

The public foundation URL is https://wasit-id.vercel.app. Full production transactions remain gated by actual external-database provisioning and hosted checks. A successful local run or static deployment does not establish that gate.
