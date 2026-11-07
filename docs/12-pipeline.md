# Wasit customer journey: request to settled work

Recorded on 7 November 2026. Wasit has **twelve customer stages, numbered 0?11**. The journey starts with a customer profile, helps the customer compare suitable offers, and ends with agreed work, an explicit bill/change decision, and a recorded outcome. Optional work stays outside the committed price until both parties approve a new agreement version.

The complete journey has been rehearsed through actual local HTTP for all five service categories. Two additional AC rehearsals used OpenAI with rules fallback. These are business-flow checks against synthetic providers and a simulated ledger; they are not evidence of real provider fulfillment, real payment processing or perfect model accuracy.

## The flow

[Open the flow diagram directly](12-pipeline.svg)

![Wasit end-to-end customer journey](12-pipeline.svg)

If the Markdown viewer does not render diagrams, the SVG link above opens directly without an extension.

```mermaid
flowchart LR
  P0[0 Profile] --> P1[1 Request]
  P1 --> P2[2 Format and clarify]
  P2 -->|Missing facts| Q[Customer answers]
  Q --> P2
  P2 --> P3[3 Discover providers]
  P3 --> P4[4 Private RFQs]
  P4 --> P5[5 Negotiate]
  P5 --> P6[6 Source-backed quotes]
  P6 -->|Clarify or counter| P5
  P6 --> P7[7 Compare equivalent work]
  P7 --> P8[8 Choose]
  P8 --> P9[9 Bilateral booking v1]
  P9 --> P10[10 On-site bill and changes]
  P10 -->|New work| V2[Both accept v2 and fund difference]
  V2 --> P10
  P10 --> P11[11 Complete, release and review]
  P11 -->|Unresolved work| D[Evidence and provider response]
  D -->|Agreed rework| P11
```

A missing reply, rejected model answer or incomplete price does not approve work. Choosing a quote creates a draft. An agreement becomes active only after both roles accept it. A new active version is funded separately.

## Stage overview

?Passed locally? below means the connected HTTP journey passed for AC service, washing-machine service, plumbing, electrical work and home cleaning. Hosted business stages remain blocked by persistent storage provisioning.

| # | Customer stage | What is implemented and checked | Remaining real-world gap |
|---|---|---|---|
| 0 | Profile | Private name, default area/category and price/schedule/trust weights. Demo sessions work; optional registration/login preserves identity and owned work. | Hosted persistence gate. Named email is not represented as verified. |
| 1 | Request | A customer describes a service need. The request belongs to that customer and appears in their history. | Customer voice input is not connected. |
| 2 | Format and clarify | Five supported categories; explicit location, schedule and maximum budget. Up to three questions at once. A repeated answer submission reuses the same owned child request. | Broader real-language coverage needs independent evaluation. |
| 3 | Discover providers | Category, consent, distance/radius and opening-hour checks; at most five provider branches. | Directory businesses and reputation data are synthetic. |
| 4 | Send private RFQs | Separate conversations; only service scope, area and schedule are sent. Human invitation links use a separate bearer role. | No live WhatsApp or voice transport. |
| 5 | Negotiate | Ask missing costs, counter only from permitted facts/targets, ask permitted terms, or close. Customer takeover and explicit process calls control progress. | Actual commercial provider negotiations have not been measured. |
| 6 | Build sourced quotes | Item, unit, quantity, price and exact provider message are checked. Missing or invalid terms remain unresolved; optional work is excluded from the fixed total. | Provider audio/image quotation extraction is not connected. |
| 7 | Compare equivalent work | Complete quotes are grouped by equivalent scope, quantity, location and time. Customer priorities determine ranking. Advisory context and optional scenarios remain separate. | Price observations do not establish a final all-in market price; insufficient data remains visible. |
| 8 | Choose | Current quotation, processed provider messages, scope, base quantity and appointment are checked again. Selection creates a draft. | Hosted rehearsal after storage is available. |
| 9 | Book with bilateral version 1 | Submit, customer acceptance with private-cap acknowledgement, and provider acceptance of the same public terms. Version 1 becomes active; simulated funding is a separate action. | Real payment/escrow and commercial booking integration are outside the build. |
| 10 | Check the on-site bill and agree changes | Manual or confirmation-only image preview, version-bound bill checks, explicit new-work proposal, sufficient new limit, bilateral version 2 and a separate top-up. Version 1 stays immutable. | Real bill-image coverage is unmeasured beyond a small synthetic image check. |
| 11 | Complete, resolve and close feedback | Provider completion, customer confirmation, exact simulated release, settled review/provider reply, and version-bound dispute/evidence/rework paths. History resumes the final agreement. | No operational mediator or real settlement service. Recurring hosted auto-release execution is not deployed. |

## What the customer does at each stage

### 0. Set a profile

Welcome leads to profile setup before the in-app composer. The customer provides a display name and service area and can select a default category and priorities. Registration is optional; a demo session is sufficient to begin. When a demo customer registers, their existing identity, profile and requests are retained.

The runner saves a profile, optionally registers, logs out and logs back in, then verifies that the same customer and profile return. It creates a different owner for each service journey.

### 1. Describe the need

The customer writes a natural-language request. Their maximum budget stays private. An approximate amount is not silently treated as a spending limit, and a target can be used publicly only with explicit permission.

The rehearsal deliberately starts with a category and an incomplete description, so the next stage must ask for hard facts instead of inventing them.

### 2. Confirm missing facts

The formatter creates a structured job or asks for missing location, appointment and maximum budget. The customer supplies the answers. A clarified request is a new child of the original; retrying the same clarification does not create duplicate children.

The job becomes ready only after the required facts are explicit. The runner verifies an explicit cap and an unauthorized-by-default public target.

### 3. Find suitable providers

Wasit selects providers that offer the category, consent to requests and match the requested service area and opening hours. Each selected provider gets its own branch. A contact cap bounds the search.

The rehearsal checks the branches against the category directory and includes one human invitation branch alongside labeled simulated providers. Directory eligibility does not claim that a real technician has accepted a job.

### 4. Ask each provider privately

The RFQ states the service, quantity, area, appointment and required cost details. It excludes the customer's identity and private spending limit. A provider sees only its own conversation and public agreement information.

The runner opens the separate human invitation through HTTP, checks the private-data projection and confirms that its bearer cannot enter the customer's request route. The unanswered human branch later follows the timeout path.

### 5. Negotiate within the customer's authority

Wasit can clarify missing costs, cite an eligible same-scope offer or an explicitly authorized target, ask an allowed term once, or close. The server computes what is allowed and renders factual outgoing text. The customer can take over a conversation without the agent guessing personal or technical facts.

A clear provider question about an unknown brand/model, capacity, inverter, access/floor, photo, serial number or private budget pauses automatic replies. Taking over preserves the raw question; an explicit customer reply clears it, and handing control back resumes the policy. The pending question removes quotation readiness and blocks selecting or proposing changed work, while an already accepted agreement remains unchanged. Ordinary price-acceptance proposals do not trigger this pause.

Progress is driven by authenticated, bounded POST processing. A page read does not run hidden negotiation. In the rehearsal, scripted branches finish their bounded turns and a virtual clock advances the unanswered human branch past its persisted ninety-second deadline.

### 6. Turn replies into trustworthy cost lines

Each line retains a provider message ID and exact source snippet. Item, supported unit, quantity and price must agree with that source. An included item costs zero only when the provider says so. Unknown fees stay unknown.

The runner checks source ownership and arithmetic for every quotation. Fixed totals include the quoted fixed scope only; possible refills, parts or other optional work are not automatically added. A changed but invalid item statement cannot preserve a stale ready price.

### 7. Compare what is actually comparable

A customer compares complete equivalent work. A cheaper quote for fewer units or a different appointment cannot win the requested scope by accident. Scores use the customer's price, schedule and trust priorities.

Published price context and optional-cost planning help the customer ask better questions. They do not change ranking, diagnose a fault, authorize extra work or increase the customer's cap. The rehearsal reads both views and verifies that the comparison remains unchanged.

### 8. Choose a quote and inspect the draft

The customer selects a branch and exact quote revision. The service checks ownership, category/scope, base quantity, appointment, arithmetic and pending provider messages again. Posting an ID directly cannot bypass those checks.

The result is a draft containing fixed, included and optional lines. It is not yet a booking, an accepted change or a payment.

### 9. Book version 1 with both parties

The customer submits the draft, reviews the exact terms and acknowledges their private limit. The provider separately accepts the same public terms. One acceptance alone does not activate the agreement.

The accepted terms and their digest remain immutable. The provider projection excludes the private limit and acknowledgement. The rehearsal then holds the version-1 committed amount in the labeled simulation ledger and repeats the action to verify that funds are not counted twice.

### 10. Check the bill, then agree version 2 if needed

At the site, the customer confirms manually entered rows or an editable image-reading preview. A bill check compares the rows with the active version and can flag an increased price, a charge for an included item or unapproved new work. Repeated quantities are aggregated before comparison.

In every category, the rehearsal checks a changed bill against v1, rejects extra work under an insufficient old cap, and submits an explicit sufficient new cap with a provider-sourced optional item. Version 1 stays active until both parties accept version 2. Its old terms and digest are preserved.

Version 2 does not fund itself. The runner rejects completion before top-up, rejects a bill tied to the old active version, checks the approved v2 bill, and pays the precise difference once.

| Rehearsed category | v1 committed total | Explicit old cap | v2 committed total | Separate top-up |
|---|---:|---:|---:|---:|
| AC service | Rp120,000 | Rp160,000 | Rp340,000 | Rp220,000 |
| Washing-machine service | Rp180,000 | Rp230,000 | Rp480,000 | Rp300,000 |
| Plumbing | Rp150,000 | Rp200,000 | Rp250,000 | Rp100,000 |
| Electrical work | Rp160,000 | Rp210,000 | Rp320,000 | Rp160,000 |
| Home cleaning | Rp230,000 | Rp280,000 | Rp430,000 | Rp200,000 |

These are synthetic rehearsal offers, not market reference prices. Every demonstrated new total exceeds the original cap; the new limit is an actual increase.

### 11. Finish, resolve a problem and record the outcome

The provider marks the funded current version complete. Reading the agreement keeps funds held. Customer confirmation releases the exact simulated amount once; retries do not duplicate the release.

The same rehearsal includes an unresolved-work branch before final settlement: the customer opens a dispute, adds evidence, and cannot release funds while the dispute is open. The simulated provider accepts rework. Funds stay held, completion must be marked again, and only then does the customer confirm release.

A settled review and provider reply are saved. The customer's history resumes the correct v2 agreement and its released lifecycle. The current history row reports the agreement state as `locked`; the resumed agreement supplies the settled outcome. It is not described as a released-history status that the row does not yet expose.

## Actual end-to-end evidence

The runner starts an isolated in-memory SQLite backend and uses actual HTTP, cookies, CSRF and separate provider actions. It does not edit agreement/payment tables to force the business outcome, use another customer's records, reset other users, or call a model in rules mode.

| Recorded run | Connected stages | Stage invariants | HTTP requests | Observed interval |
|---|---:|---:|---:|---:|
| Rules, five categories | 60/60 | 260/260 | 330 | 2.925 seconds |
| OpenAI AC journey, first run | 12/12 | 52/52 | 64 | 46.479 seconds |
| AC capped fallback rehearsal | 12/12 | 52/52 | 66 | 69.560 seconds |

The five rules journeys also passed five owner-history isolation checks. Every journey reached bilateral v2, a funded change, dispute/rework, final release, review and provider reply. Passing workflow checks is not a claim of perfect extraction quality or production availability.

The first AC run made sixteen OpenAI calls: one formatter, five provider simulations, five extractions and five buyer decisions. All sixteen returned completed HTTP 200 responses. Its recorded events used twelve model engines and six rules engines; rules still own arithmetic and agreement/payment decisions.

A separate eight-attempt run exercised timeout, transport failure and credit-cap continuation. Two requests completed, one was aborted at the model deadline, and five had transport errors. The persisted model-attempt counter reached 8/8. The journey still completed through verified rules fallback, recording one model event, thirty-one rules events, six rules quote fallbacks and eleven explicit rejection events. The formatter also retained rules with one rejection event.

Across both live rehearsals, the authorized additional cap was **24 network attempts**. Completed responses reported **8,752 input tokens and 2,058 output tokens**, totaling **10,810 tokens**. Usage for failed/aborted requests was unavailable; no claim is made that those attempts were unbilled. No non-OpenAI provider was used.

Reproduce the rules journey with:

```sh
node --disable-warning=ExperimentalWarning scripts/e2e-pipeline.mjs
```

An explicitly authorized live run uses the ignored environment file:

```sh
node --disable-warning=ExperimentalWarning --env-file=.env scripts/e2e-pipeline.mjs --live
```

`--call-cap=8` runs the same AC journey with a smaller model-attempt ceiling. The hard maximum is 24. Reports are written to ignored `results/pipeline-e2e-rules.json` and `results/pipeline-e2e-live.json`; the initial sixteen-call trace was preserved as `results/pipeline-e2e-live-first.json`. Reports contain stage matrices, exact invariant flags, latencies, HTTP totals, actual engine counts and sanitized model usage. They contain no passwords, cookies, invitation tokens or authorization headers.

## Local versus hosted status

The public UI is deployed. The latest read-only public check returned HTTP 200 for health with AI available and HTTP 503 `storage_not_configured` for the account route. Persistent hosted PostgreSQL remains the release gate for all customer business stages.

Storage provisioning, secure deployment configuration and a real hosted multi-request rehearsal are **cross-cutting release requirements**, not additional customer stages. The local HTTP evidence above does not close that hosted gate or establish real PostgreSQL race/latency behavior.

The remaining commercial gaps are verified participating providers, actual communication transport, real payment/escrow, an operational dispute mediator and broader bill/language evidence. Browser layout verification is separate from this HTTP business rehearsal.

## Bounded execution and authority appendix

- The customer owns the request, private cap, public-target permission, version acceptance, bill confirmation and review. A model cannot supply those permissions.
- Provider statements own quoted prices and optional-work candidates. Exact source, unit and quantity checks precede ranking or agreement creation.
- The server owns eligibility, arithmetic, version/digest matching, both role acceptances and the simulation ledger. Accepted versions and acceptances are immutable.
- Tasks persist source keys, request generation, deadlines and leases. At most two tasks run globally and one per branch. Expired claims recover; archive/reset prevents late mutations. A task lease lasts 45 seconds.
- A human reply deadline is persisted at 90 seconds. The runner advances an injected clock for this case; the reported seconds are not a real ninety-second waiting trial.
- Model calls have a separate shared concurrency cap of two. The current default deadline is 12 seconds, configurable up to 20 seconds, with leases lasting two seconds longer. There are no automatic model retries.
- Production model attempts have a shared persisted daily cap, default 500 per UTC day. The live runner uses its own smaller persisted cap before network use.
- A completed funded version can qualify for simulated release after 72 hours without an unresolved dispute or pending change. The explicit settlement service exists; a recurring hosted executor is not deployed. GET requests never settle money.
- Advisory reference bands need the same item, unit and narrow scope, with at least five accepted observations from three publishers. Missing evidence remains insufficient data; it is not filled from synthetic offers.
