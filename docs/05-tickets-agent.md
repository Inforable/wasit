# Agent tickets — Wasit 4.1

Runtime model output is untrusted structured data. The server owns prices, state, sources, authorization and acceptance. Codex build work is distinct from runtime product agents.

| Ticket | Owner | Status | Scope / acceptance |
|---|---|---|---|
| AG-01 | B | Done | Rules extractor with line-specific source/item/unit/quantity checks; unknown remains null. |
| AG-02 | B | Done | OpenAI Responses adapter, local schema resolution, bounded 12s default timeout, refusal/transport/schema rejection and rules fallback are tested. No unsupported model claims. |
| AG-03 | A | Done | Buyer policy and model decision: ask_detail/counter/counter_terms/close; target authorization, equivalent competitor citations and server-rendered templates. |
| AG-04 | B | Done | Provider simulation using its own price list and floor, visibly labeled; support one human branch. |
| AG-05 | B | Done | Formatter fill, bill reader and card explanation adapters; only validated facts/amounts, OCR requires user confirmation. |
| AG-06 | A | Done | Persistent task state, engine/source events and validation rejection reasons are implemented and tested. |
| AG-07 | B | Done | Independent labels and offline model-adapter evaluation are recorded. Initial extraction 16/20, post-fix regression 18/20; unsupported-unit failures remain explicit. A bounded live OpenAI trial completed 30 actual calls, including a synthetic three-line bill image. Original model extraction 16/20 and the source/fallback fixes are recorded without inflating the quality score. |
| AG-08 | A | Done | Runtime integration, per-branch sequencing, global model lease/concurrency and restart/reset safeguards. |

Model failure → rules or explicit clarification. A model cannot invent provider claims or choose an amount outside code-computed citations. A public target requires consumer permission. An optional estimate is never a competitor quote. A provider model never sees consumer limits or other branches.

Model schemas resolve against local common definitions before use. Do not rely on a model endpoint fetching schema URLs. Do not request hidden reasoning. Save actual outputs, rejections, source checks and engine; do not manufacture evaluation results.

Verification: 15 adapter/evaluation tests and nine request-service tests pass. Runtime calls use OpenAI only when configured; Secrets remain outside source control.
