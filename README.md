# Wasit

**Better deals from local pros. No surprise extras.**

Wasit helps customers find a better deal from local service providers, then keep control of the agreed work and final bill. Compare equivalent offers, negotiate within your instructions, and approve changes before extra work begins.

## The problem

Choosing a household service in Indonesia involves weighing price, schedule, scope and trust. An initial quote can leave transport, inspection or possible extra work unclear, making offers difficult to compare and the final bill uncertain once work begins.

Wasit addresses two connected decisions: which provider offers the best deal for the requested work, and which costs both parties have actually agreed to.

## The solution

Wasit connects the whole service journey:

1. **Describe the work.** A request becomes a structured scope, location, schedule and explicit spending cap. Ambiguous facts are clarified; the cap stays private.
2. **Compare and negotiate.** Private provider conversations collect itemized prices and source-backed terms. Only equivalent, complete scopes enter the ranking. Unknown costs stay unknown, and optional work stays separate.
3. **Agree before work.** The customer and provider independently accept the same immutable agreement version. Choosing an offer opens review; it does not automatically book or accept it.
4. **Check the bill and approve changes.** Bill lines are checked against the active agreement. Extra work requires a sourced proposal and a new version accepted by both parties; version 1 remains active while version 2 is pending.
5. **Complete and review.** Provider completion, customer confirmation, reviews and disputes follow explicit roles and recorded state transitions.

The same engine supports AC service, washing machine service, plumbing, electrical service and home cleaning. A customer can take over a conversation when a provider asks about facts Wasit cannot know, then hand it back. Provider views omit private profile fields, spending caps, customer acceptance identifiers and competing offers.

Seeded providers, generated service photos, payment movements and dispute outcomes are clearly labeled demo or simulation data. No real money is held or transferred.

## Build direction alignment

**Primary direction: 02 - AI-Native Products & Operations.** Wasit redesigns the service-buying workflow around delegated, multi-provider work. A customer describes a job once; coordinated model roles help collect and negotiate comparable offers, preserve inspectable sources, prepare a bilateral agreement and check later bill changes. The product carries that work across a complete transaction rather than leaving the customer to coordinate each step manually.

**Secondary alignment: 01 - Autonomous & Adaptive AI.** Persisted tasks, bounded negotiation actions, source validation, deadlines and fallback let the agent handle routine steps without constant supervision. When a provider asks about facts the system cannot know, it asks the customer instead of guessing. Agreement activation and extra work still require explicit acceptance. The current implementation does not learn or update its policy automatically from production activity.

The build keeps customer control inside that workflow. Model roles help format requests, extract quotations, choose permitted negotiation actions, simulate provider replies and read bill images. Server validation controls money, source matching, ownership and state transitions. Both agreement parties retain explicit approval over committed work and later changes.

## How Codex was utilised

Codex supported implementation through parallel tasks with clear module ownership: request formatting and catalogs; provider discovery and messaging; comparison and buyer policy; agreements, bills and lifecycle; and customer/provider interfaces. Shared contracts and integration checks kept those tasks synchronized.

Its work included reproducing and correcting concrete failures: a price associated with the wrong item, stale prices surviving new unknown terms, mismatched quantities, writes arriving after a reset, an unclear next provider-acceptance action, invisible entry controls, modal focus/backdrop problems and model timeouts. Fixes were checked through domain tests, authenticated HTTP journeys and real Chrome interactions.

Codex also helped build independent labeled evaluations and bounded live-model trials. On the recorded 20-case extraction set, rules results improved from 16/20 to 18/20 after corrective work. A separate live-model run scored 16/20 after validation and fallback. These are results for those test sets, not a claim of perfect model quality.

The local five-category pipeline completed 60/60 business stages and 260 stage assertions. Browser checks separately exercised customer, provider, agreement, navigation and model-setting flows. A separate public production AC journey passed 12/12 stages and 52 checks across 64 HTTPS requests, including persistent account/profile, bilateral v1/v2 and simulated hold, top-up and release. Broader browser accessibility and real bill-image quality remain separate verification gaps.

## Run locally

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

To run the isolated five-category HTTP pipeline without live model calls:

```powershell
node scripts/e2e-pipeline.mjs
```

The frontend uses React 19, Vite 6.4.5 and the shared Wasit components. Product copy is English, Light is the default, and the topbar offers theme controls.

## Models and private configuration

OpenAI features are optional. With a server-side API key configured, customers can choose supported request and bill models in Settings. Choices are stored per customer; a request keeps the model configuration captured when it was created. Supported choices are GPT-6 Luna and GPT-6.1 Terra.

Structured outputs are independently validated. Text workflows retain rules fallback; bill-image reading returns an editable preview requiring confirmation, with manual entry available when image reading is unavailable. Shared call limits, concurrency leases and deadlines bound model use. API keys remain server secrets and are never sent to the frontend.

## Deployment

Canonical URL: https://wasit-id.vercel.app.

Vercel hosts the frontend and API. Business actions require an external PostgreSQL database; local SQLite remains a development adapter. Neon Free has been provisioned and connected, and real PostgreSQL connectivity and migrations have been checked. The integrated production release is active; its public AC journey passed all twelve business stages.

Production configuration uses DATABASE_URL or POSTGRES_URL, WASIT_SESSION_SECRET, WASIT_PUBLIC_ORIGIN and WASIT_ALLOWED_ORIGINS. OPENAI_API_KEY is optional and server-only. Keep these values in the deployment's private environment configuration.

Actual hosted readiness and remaining gates are recorded in docs/10-deployment.md; individual completion is recorded in the ticket files. Product scope, shared interactions, task ownership and verification evidence are documented in docs/.
