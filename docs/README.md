# Wasit documentation

Product direction: compare and negotiate service offers, then control agreed costs and approve changes before extra work.

| File | Purpose |
|---|---|
| 01-prd.md | Standalone product specification 4.1, including the Codex build workflow |
| 02-design-system.md | Wasit visual tokens, components, motion and accessibility |
| 03-tickets-backend.md | BE-01–16 with actual status |
| 04-tickets-frontend.md | FE-01–16 with actual status |
| 05-tickets-agent.md | AG-01–08 with ownership/status |
| 06-contracts.md | API/domain contracts and implemented boundary |
| 07-two-person-plan.md | Two owners assisted by Codex; integration gates |
| 08-foundation.md | Run commands, available primitives and verification limits |
| 09-product-language.md | English copy and Light default |
| 10-deployment.md | Vercel release, persistent-storage and domain status |
| 11-revision.md | Confirmed product decisions, implementation revisions and open gates |
| 12-pipeline.md | Detailed stage-by-stage business/AI pipeline, authority and implementation/release status |
| contracts/ | JSON Schema 2020-12 |
| ../tests/fixtures/ | Validated comparison, negotiation and agreement examples |

Implemented domain/API services and verified frontend flows are recorded by ticket. Production availability is separate: https://wasit-id.vercel.app serves the current UI/API; hosted transactions require configured PostgreSQL. Actual browser, source-data and OpenAI evaluation reports are retained alongside these specifications.
A database table or schema is not a completed business flow.
Read the PRD and ownership boundaries before starting feature branches.
