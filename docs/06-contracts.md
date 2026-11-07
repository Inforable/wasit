# Product contracts — Wasit 4.1

## Authority and implemented boundary

JSON Schema 2020-12 defines payload shape. Domain code additionally verifies arithmetic, source/item association, ownership, comparison equivalence, budget acknowledgement and state transitions. Schema-valid does not mean the application works.

The application implements the business endpoints below and validates request bodies against local schemas. Hosted availability additionally requires configured authentication and external persistent storage. Unknown API paths return JSON 404.

## Conventions

- Integer Rupiah; prices null only when unknown. Included is explicitly zero.
- Record timestamps: epoch milliseconds. Structured schedule windows: ISO UTC; English labels state WIB.
- IDs: server-created prefix + underscore; message/source IDs are strings. client_message_id is caller-generated and deduplicated per branch.
- Categories: ac_service, washer, plumbing, electrical, cleaning.
- Roles in acceptance: consumer/provider. Display: Customer/Provider. Do not silently mix account-role enums with acceptance-role enums.
- Quote kinds: fixed/included/optional/unknown. Agreement kinds: committed/included/optional/unknown.
- Quote states: needs_detail/ready/over_budget. Scope comparability is a separate field/group.
- Buyer actions: ask_detail/counter/counter_terms/close. Code supplies any cited amount; model chooses a valid citation key.
- Error: {error,message}, English. JSON API and secret-bearing responses use no-store.

## Schema selectors

common.schema.json contains job, source, message, quote_line, quote, branch, comparison, card, event,
terms/public_terms, acceptance, version/provider_version, deal, lifecycle/payment, bill_line/result/check,
snapshot/provider_snapshot and error.

The job/quote/event/snapshot/deal files wrap common definitions.
api.schema.json contains request-body selectors.
agent-buyer.schema.json is the raw buyer model decision.
agent-schemas.json contains formatter/extractor/buyer/provider/bill/explainer model bodies.
price-survey.schema.json describes reference-price research, not an agreed price.

shared/contracts.d.ts gives internal type hints. It is not an automatic typecheck or runtime validator.
The fixture manifest is tests/fixtures/manifest.json; model selectors use <role>.model.schema.json.
All schema IDs are local resolver identities, not network dependencies.

## Implemented API contracts

| Method / route | Principal | Body selector / behavior |
|---|---|---|
| GET /api/health | public | implemented: {ok,ai_mode,models} |
| POST /api/demo/session | origin-checked | api:empty → session_response, CSRF + HttpOnly cookie |
| POST /api/requests | consumer + CSRF | api:create_request; missing hard facts produce clarification |
| GET /api/requests/:id | owner | common:snapshot |
| POST /api/requests/:id/clarify | owner + CSRF | canonical answers; one child per original clarification |
| POST /api/requests/:id/process | owner + CSRF | claim/process bounded persisted task; GET never starts work |
| POST /api/requests/:id/finish | owner + CSRF | finish available quotes without inventing missing data |
| GET /api/requests/:id/branches/:branch/link | owner | expiring fragment URL, never embedded in general snapshot |
| GET /api/provider/:branch | provider bearer/account | common:provider_snapshot |
| POST /api/provider/:branch/messages | provider | api:provider_message |
| POST /api/requests/:id/deals | owner + CSRF | api:create_deal; stale revision rejected |
| GET /api/deals/:id | consumer owner | common:deal |
| POST /api/deals/:id/submit | consumer + CSRF | api:submit_version |
| POST /api/deals/:id/accept | consumer + CSRF | api:accept_version; budget_ack_limit exactly equals version limit |
| POST /api/provider/:branch/accept | provider | api:accept_version; budget_ack_limit=null |
| POST /api/deals/:id/reject | consumer + CSRF | api:reject_version |
| POST /api/provider/:branch/reject | provider | api:reject_version |
| POST /api/deals/:id/changes | consumer + CSRF | api:propose_change; source candidates and explicit spending_limit |
| POST /api/deals/:id/bill-checks | consumer + CSRF | api:check_bill |
| POST /api/demo/reset | owner + CSRF | api:reset; cancels only own persisted tasks/resources |

Additional implemented routes include GET /api/catalog, GET /api/providers, owner request history and planning scenarios; owner takeover/say; provider profile/prices/ratings/feedback; consumer payment/confirmation/disputes/evidence/reviews; provider completion/dispute responses/evidence/review replies; demo scenarios and explicit simulated-provider actions. Each mutating role action has its own strict body selector. POST /api/deals/:id/bill-preview returns an editable image-reading draft and requires configured OpenAI support; it never checks or approves a bill automatically.

## Invariants

Quoted total sums fixed required scope; missing transport stays unknown. Optional work never enters ranking price or committed total.
Only equivalent category/scope/unit/quantity/location/window groups rank together.
Source snippet and item/amount/unit must match provider messages from the authorized source.

Public terms omit spending_limit. SHA-256 hashes recursively sorted JSON object keys, unchanged array order,
UTF-8 and no whitespace. Provider projection also omits budget acknowledgements, consumer actor IDs,
internal events and competitor branches. Acceptances remain private records; provider receives boolean flags.

Terms immutable from draft. Acceptance is unique per version/role. One active and one draft/pending version per deal.
Second acceptance atomically activates its version and supersedes the old active. Replay identical acceptance returns current state.
Provider cannot create a consumer proposal or acknowledge a private spending limit.
New work must be sourced from the selected provider; stale quote/version/digest is rejected.
Price/quantity changes need an explicit proposal, never an overwrite of an active agreement.
Bill-check aggregates duplicate item/unit quantities and never changes agreement state.

## Storage and async work

Local SQLite includes structural uniqueness/immutability checks. Production on Vercel uses a shared external
transactional store. In-memory tasks/locks/timers and local SQLite files are not production state.
Persist task generation, deadlines and leases; process through a bounded authenticated POST or worker.
Model call sequencing and reset checks must hold across instances.

## Error classes

400 invalid payload/JSON, 401 session required, 403 wrong role/token/CSRF,
404 not found/non-owner, 409 stale/replay conflict/invalid transition,
413 oversized body, 422 budget/source/scope/quantity rejection, 429 rate limit, 503 unavailable.
Model timeout normally produces fallback, not a generic 503.

The HTTP layer also uses bad_json/bad_path/not_found/forbidden/too_large/ui_not_built/internal_error.
Preserve clients' structured error handling when adding business codes.
