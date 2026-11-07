# Revision history - Wasit

This log records confirmed product decisions and implementation revisions from the current build. The PRD describes the active specification. A decision or local implementation is not a claim of production availability.

Recorded on 7 November 2026. Entries follow decision order; earlier timestamps are not reconstructed.

| Revision | Change and reason | State / evidence |
|---|---|---|
| R01 | Establish the product foundation, standalone PRD, contracts and a two-person implementation plan. | Foundation and contract fixtures implemented. |
| R02 | Center positioning on choosing the best service offer and obtaining price certainty before and during work. Preserve comparison, negotiation and the full service lifecycle. | Active PRD. |
| R03 | Keep five service categories, explicit scope/units and full customer/provider flows. Agent-assisted capacity supports the agreed scope. | Catalog, domain and HTTP coverage across all five categories. |
| R04 | Separate fixed, included, optional and unknown costs. Rank complete equivalent scope; optional estimates do not enter the quoted total. | Source-checked quote, comparison and arithmetic tests. |
| R05 | Introduce immutable agreement versions and explicit acceptance by both roles. Pending changes preserve the active version and require an explicit new limit when needed. | Agreement v1/v2, stale/replay and bilateral-activation tests. |
| R06 | Keep simulation labels for providers, payments and dispute outcomes. Preserve a separate human provider branch with private access. | Role-isolated browser flows and ledger tests. |
| R07 | Make product copy, errors and agent summaries English while preserving Wasit and original user/place/business names. | Active language contract and translated interface. |
| R08 | Maximize the documented Codex build workflow: isolated tasks, parallel implementation, meaningful tests, independent review and actual build evidence. | Task ownership and recorded defects/fixes. |
| R09 | Preserve the established visual tokens, shared components and interaction rules. Remove source provenance from project code, comments, docs, names and commits. | Source scanning; shared component/style verification. |
| R10 | Set Light as the first-visit theme. Dark and system preferences remain explicit choices. | Theme tests and actual Chrome checks under a dark operating-system preference. |
| R11 | Publish early on Vercel and use a short free Wasit address. | https://wasit-id.vercel.app is the canonical project domain. |
| R12 | Use external PostgreSQL for hosted transactions; retain SQLite for development and invariant tests. Persist tasks, deadlines, generations and leases. | Adapters and reset/concurrency tests implemented; Neon Free is now connected and the later public AC journey passes. |
| R13 | Keep commits modular around coherent features and update tickets as work is verified. Proceed without per-ticket review after explicit authorization. | Documentation, foundation and domain commits; ticket verification logs. |
| R14 | Move the public message toward finding the best deal, then adopt the final headline: Clear quotes. No surprise extras. | Earlier approved copy; updated by R41. |
| R15 | Restore the headline to centered alignment. | Mobile and desktop screenshots inspected. |
| R16 | Implement Person A services first; extend delegated implementation to Person B when requested. Keep integration ownership explicit. | Backend and frontend tasks run in parallel with isolated file ownership. |
| R17 | Add source-bound quotes, bounded buyer actions, owner-only branches, profiles/prices, bill checks, simulated settlement, disputes and reviews. | Unit/storage/authenticated HTTP tests and separate-role Chrome flows. |
| R18 | Replace stale foundation-only local server processes and enable backend watch mode. | localhost:5180 verified session creation 201 and authenticated identity 200. |
| R19 | Add named customer registration/login, persistent private profiles, scrypt password storage, session rotation and persistent login throttles. | Eighteen account/auth HTTP checks pass; onboarding integration is being verified. |
| R20 | Use OpenAI for runtime AI and configure server-side credentials. Run a bounded live trial before claiming live capability. | Thirty actual calls, 17,842 tokens; all HTTP 200. Original extraction score 16/20 and limitations remain recorded in the PRD. |
| R21 | Strengthen validation after live evaluation: reject full-message instruction attacks, omitted explicit costs and lost source-verified prices. Quarantine untrusted quotes and retain immutable history. | Regression checks; additional source/state review fixes are in progress. |
| R22 | Collect actual public reference observations with source, date, unit and scope. Keep insufficient evidence explicit. | Thirteen observations across five categories. Only a narrow AC base-item scope has a sufficient band. |
| R23 | Reconcile ticket statuses with actual implementation and verification. Record production and unfinished UX gates as Partial. | Current BE/FE/AG ticket files; percentages count Done tickets only. |
| R24 | Align matching screen structure, shared components, user flow and animation. Restore welcome/setup/app phases, composer, history drawer, progress, comparison and ticket visuals. | Current frontend alignment work; visual/browser checks required before completion. |
| R25 | Make routes explicit. Welcome can be reopened after a demo without deleting a session, profile or history. Distinguish Home, Welcome, Settings, History, Demo and separate provider access. | Route contract and browser navigation checks being completed. |
| R26 | Consolidate agent evaluation, consumer/provider frontend verification and reference-price evidence into numbered PRD appendices. | Four separate report Markdown files removed; links updated. |
| R27 | Create this numbered revision log for historical changes. Keep new standalone documents numbered and justify their need. | This file and documentation index. |
| R28 | Restore complete shared style rules and actual matching screen/component structures, including history and phase transitions. | Shared style files restored; browser alignment checks in progress. |
| R29 | Reject stale prices after invalid new item terms, unprocessed provider changes, wrong requested quantities and archived request mutations. | Quote, agreement, lifecycle and HTTP regression checks. |
| R30 | Bound model credit use with a shared UTC daily attempt cap and fail-closed budget records. | Default 500 attempts/day; concurrency and counter tests pass. |
| R31 | Replace raw model error codes with clear fallback messages, allow a bounded 12-second default deadline and reduce output budgets for short roles. | Corrective change after an observed model_timeout; no automatic retries. |
| R32 | Add a numbered pipeline document with every business/AI stage, outputs, persistence, safeguards and separate local/UI/hosted status. | 12-pipeline.md records the active pipeline and actual remaining gates. |
| R33 | Simplify the public engine status to AI ready while retaining factual per-action engine evidence. | Public health copy updated; technical fallback codes are not primary navigation copy. |
| R34 | Keep theme switching in the topbar and remove the settings-page theme control. | Shared shell adjustment and browser verification. |
| R35 | Add one-provider chat, customer-perspective speaker labels and explicit hard-fact questions that pause the agent. | Real question, takeover, reply and handback checks pass; no invented facts. |
| R36 | Allow per-actor OpenAI choices in Settings and freeze the request configuration at creation. | Model API/router and six browser settings checks pass; server keys stay private. |
| R37 | Add synthetic service photos with explicit lazy loading and initials fallback. | Five WebP images total about 106 KB; Welcome loads zero provider images. |
| R38 | Correct welcome visibility, avoid blocking font CSS, split heavy routes, restore sessions in one read and bind both local loopbacks. | Welcome visible in 849 ms with delayed authentication; local requests now 4-41 ms. |
| R39 | Provision and connect Neon Free after human acceptance; cache schema revisions across cold instances. | Real PostgreSQL connectivity/migrations pass; cached opens approximately 0.2 seconds. |
| R40 | Make the next provider acceptance action visible above the agreement after customer acceptance. | Four focused demo/human acceptance-to-active browser checks pass; no auto-accept. |

| R41 | Adopt the approved home-services referee positioning, Better deals from local pros headline, explanatory paragraph and three benefits. Preserve centered entry layout and animations. | Welcome copy, page metadata and PRD updated; centered responsive checks pass at 320px, 390px and 1440px. |

| R42 | Complete a real public production AC journey on connected Neon without direct state edits. | 12/12 stages, 52/52 checks and 64 HTTPS requests pass, including bilateral v1/v2 and simulated hold/top-up/release. |
| R43 | Give each of the fifteen seeded providers its own service-appropriate photo. | Ten additional generated WebP assets; fifteen distinct local paths, lazy loading and initials fallback. |

| R44 | Add request-specific negotiation model selection with explicit apply and an idle-safe pause of future automatic actions. | 22 focused backend/runtime checks, 16 contract fixtures and 11 browser checks pass; prior events and account defaults are preserved. |
| R45 | Require the post-submit service interview to present one question per step, with Back/Next and preserved answers. | Full-page one-question UI passes 37 Chrome checks; Back/Next, optional skip and final facts are preserved. |
| R46 | Correct negated free/included statements and audit private provider access and non-price negotiation terms. | 219 automated tests pass after complete-message fee/warranty safeguards and immutable-history checks. |

| R47 | Move the model choice into the topbar and align the actual stage progress structure and motion. | Context-aware header controls, real-state percentages and 22 browser checks pass. |
| R48 | Show every provider outcome, with explicit reasons for incomplete, unanswered or unranked results. | All branches visible; only valid comparable offers enable Review. |
| R49 | Add GPT-5.4 Nano (Fast) as an explicit third choice while preserving current defaults. | Three live structured calls complete in about 1.35-1.77 seconds; final expected facts pass with two validated rules fallbacks. No automatic retry or SLA claim. |
| R50 | Verify provider grants against the current signing secret and support explicit owner renewal of expired private invitations. | Secret rotation, nonce tampering, CSRF failure and new-grant access checks pass. |
| R51 | Restore failing extraction evaluation without changing independent expected labels. | Contextual inspection no longer invents a line; 219-test suite and GitHub CI on 63a28c2/9815a42 pass. |

| R52 | Keep paid warranty upgrades and parts-only exclusions from becoming unconditional service promises; renew expired invitations only through an authenticated owner action. | Focused regressions and 219-test final suite pass; accepted history remains immutable. |
| R53 | Rehearse the public journey with the new fast model and reconcile release evidence. | Nano-selected AC journey passes 12/12 stages, 52 checks and 65 HTTPS requests; no automatic fallback-model or latency guarantee is claimed. |

| R54 | Publish and verify the complete corrective source release. | c06b0f0 is Ready in production; 219 tests and CI pass. Public Chrome verifies the topbar Nano choice and full-page one-question interview with preserved answers. |

## Open release gates

- Neon Free is connected. The integrated public AC journey passed all twelve stages; new revisions receive a separate production browser check.
- The earlier storage_not_configured failure is resolved in the integrated public release; account/session and persisted business actions pass.
- Shared UI/flow alignment, final accessibility checks and hosted end-to-end verification must finish before their tickets become Done.
- Live-model results are limited to the recorded trial and synthetic bill fixture. Larger independent language and real-bill evaluation remain a quality limitation.

## Update rules

Append a new revision when a product rule, flow, contract, visual behavior, deployment decision or substantive corrective change is agreed. Record the reason, current state and actual evidence. Update existing entries when their implementation state changes; preserve prior decisions and measured failures. Keep credentials and private customer data out of this log.
