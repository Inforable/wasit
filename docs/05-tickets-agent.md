# Agent tickets — Wasit 4.1

Runtime model output is untrusted structured data. The server owns prices, state, sources, authorization and acceptance. Codex build work is distinct from runtime product agents.

| Ticket | Owner | Status | Scope / acceptance |
|---|---|---|---|
| AG-01 | B | Todo | Rules extractor with line-specific source/item/unit/quantity checks; unknown remains null. |
| AG-02 | B | Partial | Model schemas exist; implement model adapter, schema resolution, 8s timeout and fallback. No unsupported provider/model claims. |
| AG-03 | A | Todo | Buyer policy and model decision: ask_detail/counter/counter_terms/close; target authorization, equivalent competitor citations and server-rendered templates. |
| AG-04 | B | Todo | Provider simulation using its own price list and floor, visibly labeled; support one human branch. |
| AG-05 | B | Todo | Formatter fill, bill reader and card explanation adapters; only validated facts/amounts, OCR requires user confirmation. |
| AG-06 | A | Partial | Event schema/fixtures exist; add persistent task state, engine/source events and rejection reasons. |
| AG-07 | B | Todo | Independent eval labels and held-out messages, rules/model baseline, actual failures/timing and documented limitations. |
| AG-08 | A | Todo | Runtime integration, per-branch sequencing, global model lease/concurrency and restart/reset safeguards. |

Model failure → rules or explicit clarification. A model cannot invent provider claims or choose an amount outside code-computed citations. A public target requires consumer permission. An optional estimate is never a competitor quote. A provider model never sees consumer limits or other branches.

Model schemas resolve against local common definitions before use. Do not rely on a model endpoint fetching schema URLs. Do not request hidden reasoning. Save actual outputs, rejections, source checks and engine; do not manufacture evaluation results.
