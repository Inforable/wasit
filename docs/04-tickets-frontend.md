# Frontend tickets — Wasit 4.1

Owner: B. Preserve Wasit colors, spacing, radii, typography, motion and component markup. Light is the default; dark/system are explicit user choices. All product copy is English. Visual components do not imply connected business endpoints.

| Ticket | Status | Scope / acceptance |
|---|---|---|
| FE-01 | Done | React shell, exact Wasit tokens/styles, brand, API/router/viewport helpers, default Light and component gallery. |
| FE-02 | Partial | Cta, Avatar, Safety, flags, range, RefCard, ticker and engine chips exist. Complete remaining screen-level component bindings and interaction/accessibility states. |
| FE-03 | Partial | Consumer/provider client boundaries and CSRF/bearer hooks exist. Sign-in, session store, logout and account switching remain. |
| FE-04 | Todo | Request/profile/priority form and clarification sheet; preserve input; map English answers to canonical values. |
| FE-05 | Todo | Provider inbox/chat and fragment-to-memory bearer. Stable client_message_id on retries; polling stops at unmount. |
| FE-06 | Todo | Scoreboard/negotiation room with sources, engine, explanations, takeover and finish; no chain-of-thought display. |
| FE-07 | Todo | Compare/deck, comparison groups, preference presets, incomplete/scope exclusions and transparent ranking. |
| FE-08 | Todo | Agreement draft/submit/two-party accept/reject, stale conflict reload; never auto-accept a refreshed version. |
| FE-09 | Todo | Ticket and version history, public/provider projection, pending changes and full active agreement. |
| FE-10 | Todo | Bill form/OCR confirmation, results, provider-sourced change candidates, explicit new limit and version 2. |
| FE-11 | Todo | Simulation lifecycle and payment labels, extra amount due, provider completion and consumer release. |
| FE-12 | Todo | Provider profile, consent/area/hours, price list and own-quote feedback. |
| FE-13 | Todo | Dispute/evidence/review surfaces with shared role-aware components. |
| FE-14 | Todo | Demo controls/story/presentation mode and honest labels for script/model/human. |
| FE-15 | Partial | Default Light, dark option, reduced motion and core styles exist. Verify all finished screens at 390px/desktop, focus, keyboard and 44px targets. |
| FE-16 | Todo | Full English UI integration, five-category smoke tests, deployment/mobile verification and demo rehearsal. |

Build against validated fixtures, then switch transports to live APIs. Do not change schema shapes in a component. Every screen shows loading/error/empty/next-action states. Unknown cost is never displayed as free. A pending version never replaces the active version in UI. Do not expose secrets or private budgets in provider markup, payloads or logs.
