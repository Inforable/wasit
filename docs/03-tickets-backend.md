# Backend tickets — Wasit 4.1

Owner: A. Done means tested implementation. Partial identifies a remaining acceptance gate; production availability is recorded separately. Production runs on Vercel with an external persistent database; local SQLite supports development and invariant tests.

| Ticket | Status | Scope / acceptance |
|---|---|---|
| BE-01 | Done | Bootstrap HTTP/DB/UI, errors, migrations, static SPA and health; tests/build pass. |
| BE-02 | Partial | SQLite/PostgreSQL ports, sessions/CSRF, owner checks, branch bearer/expiry and reset-safe token issuance are implemented and tested. Neon Free provisioning and production persistence verification remain. |
| BE-03 | Done | Five service catalogs, units, money/WIB parsing and request formatter. English chip answers round-trip; maximum budget explicitly confirmed. |
| BE-04 | Done | Provider directory, consent, area/availability, private branches and idempotent messages. Provider payload is an allowlist. |
| BE-05 | Done | Persisted idempotent quote revisions, atomic item/price/unit source validation, conservative extraction fallback, schedule withdrawal and stale-generation rejection. |
| BE-06 | Done | Comparison groups and preference ranking. Required costs cannot be unknown; only equivalent scopes are ranked; optional estimates excluded. |
| BE-07 | Todo | Request orchestration, takeover, finish, event snapshots and serverless-safe task processing. Persist jobs/leases; GET never triggers model mutations. |
| BE-08 | Done | Immutable versioned terms, public digest, explicit two-role acceptance, stale/replay checks and atomic activation. Pending changes preserve the active version. |
| BE-09 | Done | Bill checks, cumulative quantities, changes and explicit budget increase. Pending/rejected proposal preserves active agreement. |
| BE-10 | Todo | Simulation ledger bound to versions, topups, completion and release. No real payments; idempotent money actions. |
| BE-11 | Done | Provider price list/profile, ratings and business feedback. Provider prices never become the reference price book. |
| BE-12 | Todo | Disputes/evidence/reviews with role checks and explicit simulation policy. No invented refund guarantees. |
| BE-13 | Todo | Reference price data, source/date/unit quality and optional planning estimates. No effect on committed totals, counter cites or budget eligibility. |
| BE-14 | Todo | Demo scenarios/reset with per-session generation, task cancellation and token rotation; never reset another session. |
| BE-15 | Todo | HTTP/DB integration: stale quote/version, replay, parallel acceptance, privacy, task timeout, five categories and ledger. |
| BE-16 | Done | Initial Vercel foundation release: wasit-id.vercel.app is public and verified; UI, health, deep link, API 404 and assets pass. Business persistence remains BE-02. |

Dependencies: BE-02/03 → BE-04/05 → BE-06/07 → BE-08 → BE-09 → BE-10/12. BE-11/13/14 can proceed behind fixed contracts. BE-15 grows at every gate. BE-16 initial publication does not imply transactional production readiness.

Common acceptance: integer Rupiah; public provider projection; source-bound facts; immutable version terms; idempotent mutations; explicit expected quote/version. Every money/access/state rule has meaningful verification. No process-local timer or file is production persistence.

## Verification log

- BE-03: seven offline test groups pass; five schema-valid categories, money/WIB, explicit budget and English clarification.
- BE-06 / AG-03: thirteen tests pass for comparable ranking, latest revision, authorized citations, privacy and model fallback.
- Combined verification with foundation/storage: 50 tests passed. HTTP request orchestration remains BE-07.

- BE-02/04/11: auth eight HTTP/storage groups and provider communications twenty groups pass. Grants are hash-only, branch-bound and revoked by owner reset; own-price/profile/ratings/feedback omit competitor and private-budget data.
- BE-05/08/09: quote provenance/replay tests and nine agreement/bill service groups pass, including concurrent acceptance, explicit limit increase, source mismatch and cumulative bill quantity checks.
