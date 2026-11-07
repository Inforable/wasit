# Backend tickets — Wasit 4.1

Owner: A. Done means tested implementation. Partial identifies a remaining acceptance gate; production availability is recorded separately. Production runs on Vercel with an external persistent database; local SQLite supports development and invariant tests.

| Ticket | Status | Scope / acceptance |
|---|---|---|
| BE-01 | Done | Bootstrap HTTP/DB/UI, errors, migrations, static SPA and health; tests/build pass. |
| BE-02 | Partial | SQLite/PostgreSQL ports, named registration/login, persistent private profiles, scrypt passwords, login throttles, sessions/CSRF, owner checks and reset-safe branch grants are implemented. Eighteen auth/account HTTP checks pass. Neon Free provisioning and production persistence verification remain. |
| BE-03 | Done | Five service catalogs, units, money/WIB parsing and request formatter. English chip answers round-trip; maximum budget explicitly confirmed. |
| BE-04 | Done | Provider directory, consent, area/availability, private branches and idempotent messages. Provider payload is an allowlist. |
| BE-05 | Done | Persisted idempotent quote revisions, atomic item/price/unit source validation, conservative extraction fallback, schedule withdrawal and stale-generation rejection. |
| BE-06 | Done | Comparison groups and preference ranking. Required costs cannot be unknown; only equivalent scopes are ranked; optional estimates excluded. |
| BE-07 | Done | Request orchestration, takeover, finish, event snapshots and serverless-safe task processing. Persist jobs/leases; GET never triggers model mutations. |
| BE-08 | Done | Immutable versioned terms, public digest, explicit two-role acceptance, stale/replay checks and atomic activation. Pending changes preserve the active version. |
| BE-09 | Done | Bill checks, cumulative quantities, changes and explicit budget increase. Pending/rejected proposal preserves active agreement. |
| BE-10 | Done | Simulation ledger bound to versions, topups, completion and release. No real payments; idempotent money actions. |
| BE-11 | Done | Provider price list/profile, ratings and business feedback. Provider prices never become the reference price book. |
| BE-12 | Done | Disputes/evidence/reviews with role checks and explicit simulation policy. No invented refund guarantees. |
| BE-13 | Done | Reference-book validation, source/date/unit quality, strict sample/publisher thresholds and source-bound optional planning are implemented. Thirteen primary-source observations across five categories are recorded. Only the narrow AC base-item scope has enough observations for a band; other scopes honestly return insufficient_data. Published base-item data never becomes an all-in quote. |
| BE-14 | Done | Demo scenarios/reset with per-session generation, task cancellation and token rotation; never reset another session. |
| BE-15 | Done | HTTP/DB integration: stale quote/version, replay, parallel acceptance, privacy, task timeout, five categories and ledger. |
| BE-16 | Done | Initial Vercel foundation release: wasit-id.vercel.app is public and verified; UI, health, deep link, API 404 and assets pass. Business persistence remains BE-02. |

Dependencies: BE-02/03 → BE-04/05 → BE-06/07 → BE-08 → BE-09 → BE-10/12. BE-11/13/14 can proceed behind fixed contracts. BE-15 grows at every gate. BE-16 initial publication does not imply transactional production readiness.

Common acceptance: integer Rupiah; public provider projection; source-bound facts; immutable version terms; idempotent mutations; explicit expected quote/version. Every money/access/state rule has meaningful verification. No process-local timer or file is production persistence.

## Verification log

- BE-03: seven offline test groups pass; five schema-valid categories, money/WIB, explicit budget and English clarification.
- BE-06 / AG-03: thirteen tests pass for comparable ranking, latest revision, authorized citations, privacy and model fallback.
- Historical foundation/storage verification: 50 tests passed. Request orchestration and authenticated HTTP coverage have since been implemented.

- BE-02/04/11: auth eight HTTP/storage groups and provider communications twenty groups pass. Grants are hash-only, branch-bound and revoked by owner reset; own-price/profile/ratings/feedback omit competitor and private-budget data.
- BE-05/08/09: quote provenance/replay tests and nine agreement/bill service groups pass, including concurrent acceptance, explicit limit increase, source mismatch and cumulative bill quantity checks.
- BE-10/12: lifecycle service and cross-service checks pass for version-bound simulated holds/topups/release/refunds, replays, disputes/evidence/reviews and blocked agreement changes after settlement or during disputes.
- BE-07/14/15: persisted task/lease/reset tests and authenticated HTTP tests cover five categories, source-backed v1/v2, bills, stale versions, owner isolation and provider-token revocation. Full local suite: 174 tests passed on 7 November 2026; real browser role flows are recorded separately. Production PostgreSQL verification remains BE-02.
