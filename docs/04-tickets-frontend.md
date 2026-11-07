# Frontend tickets - Wasit 4.1

Implementation ownership: B scope, completed collaboratively with parallel agents. Preserve Wasit colors, spacing, radii, typography, motion and component markup. Light is the default; dark/system are explicit user choices. Product copy is English. Status below describes implemented behavior and actual verification, not deployment readiness.

| Ticket | Status | Scope / acceptance |
|---|---|---|
| FE-01 | Done | React shell, Wasit tokens/styles, brand, API/router/viewport helpers, default Light and component gallery. Integrated production build passes. |
| FE-02 | Done | Existing buttons, avatars, safety labels, cards, tickers and engine chips are bound to consumer, provider and agreement screens, with loading/error/empty/action states. |
| FE-03 | Done | Named registration/sign-in, invalid-password errors, explicit sign-out/account switching and session restoration use real authenticated routes. CSRF and provider bearer tokens stay in memory; customer and provider boundaries remain separate. |
| FE-04 | Done | Persistent two-step profile/area and locked priority sliders, compact composer, rotating examples, presets, repeated request, draft preservation and inline canonical clarification are connected. Profile defaults never silently fill a spending cap or override a different requested service. |
| FE-05 | Done | Private provider inbox/chat, fragment-to-memory bearer and unmount cleanup are implemented. A deliberately lost response retries the same client message ID and stores one message. |
| FE-06 | Done | Animated scoreboard, phases, negotiation trace, provider focus/QR invitation, source snippets, engine/action summaries, takeover/send/handback and finish use current request contracts. Completed requests transition to offers after the progress completion beat. |
| FE-07 | Done | Expandable offer list, scope groups, view-order presets, item/source/conversation details, exclusions and visible weight/score parts are connected. Retry starts a separate request; optional planning never enters quoted totals or agreement approval. |
| FE-08 | Done | Agreement draft/submit, independent two-party acceptance/rejection and stale-conflict reload are implemented. Browser verification proves one acceptance does not activate a version; refreshed versions require explicit review. |
| FE-09 | Done | Active agreement, pending proposal, version history and provider public projection are connected. A pending version preserves the active version until both parties accept. |
| FE-10 | Done | Bill item entry, photo-preview/edit/confirmation surface, active-version results, provider-sourced changes, explicit spending limit and version 2 are implemented. Manual bill/change flow is browser-verified; live image-model verification remains FE-16. |
| FE-11 | Done | Labeled payment simulation, extra amount due/top-up, provider completion and customer release are connected and browser-verified. No real payment processing is claimed. |
| FE-12 | Done | Provider consent, business area/hours/radius, editable private price list, own reviews and own-quote feedback load and save through authorized routes. |
| FE-13 | Done | Role-aware dispute/evidence/review/reply surfaces are connected. Browser verification covers accepted rework, held funds, one-time review and provider reply. |
| FE-14 | Done | Five-category scenario cards, explicit owner reset, watch/story/presentation display tiles, keyboard controls, wide scoreboard/room layout and capability-aware fullscreen are implemented. Explicit app/welcome return preserves the session and data; labels stay honest. |
| FE-15 | Partial | Default Light, dark/system choices, reduced motion, keyboard priority/room controls and mobile/desktop layouts are implemented. Current consumer flows pass 390px comparison and desktop composer/presentation overflow checks; agreement/provider pass mobile overflow. A complete keyboard and 44px touch-target audit across every role screen remains. |
| FE-16 | Partial | Integrated English UI build and local browser flows pass. Hosted PostgreSQL and the public HTTPS business journey now pass. The new interview/model controls need their final production browser check; broader live bill-image browser coverage and a complete timed demo rehearsal remain. |

Unknown cost is never displayed as free. A pending version never replaces the active version in UI. Provider payloads and screens exclude customer spending limits, customer acceptance identifiers, internal events and competitor branches. Source messages retain the provider's original wording.

## Verification log

- `npm run build`: integrated consumer, agreement and provider frontend passed production compilation.
- `node scripts/smoke-consumer.mjs`: 27 real Chrome checks passed after the screen-flow alignment, against the isolated current backend. Covered chrome-less entry, profile setup and locked weights, saved defaults with a blank cap, compact composer, inline clarification, scoreboard/negotiation, takeover/send/handback, keyboard tabs, expandable comparison/source/exclusions/advisory planning, immutable agreement review, real named registration/login/errors/session restore, persistent profile, draft preservation, mobile/desktop overflow, demo app/welcome return, fullscreen and no runtime exceptions.
- Five additional focused Chrome checks passed for watch/presentation keyboard preferences, wide scoreboard plus negotiation room and phase narration, explicit lazy-loaded provider QR invitation, session-preserving welcome/app re-entry and no runtime exceptions.
- Entry, composer, scoreboard and offer-list screenshots were opened side by side during visual review. Composer geometry matched x=20px, y=291.765625px, width=350px, radius=28px and padding=22px; offer width=350px, radius=24px, header padding=14px 16px and body padding=14px 16px 16px.

- `node scripts/smoke-agreements.mjs`: 13 real Chrome checkpoints passed with separate customer/provider contexts. Covered bearer cleanup, lost-response replay, provider quote, two-party version activation, simulated payment/top-up, version 2, confirmed manual bill check, completion/release/review/reply, provider settings/feedback, 390px overflow, dispute evidence/accepted rework and no runtime exceptions.
- Consumer welcome/request/compare and agreement/provider screenshots were opened for visual inspection. Browser outputs use isolated local SQLite storage and labeled demo data.
- Live bill-image reading was not exercised with configured model credentials. Those local results alone do not establish hosted readiness; the later public HTTPS journey passes PostgreSQL business actions. A complete timed presentation rehearsal remains open.
