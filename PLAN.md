# ResolveFlow AI implementation plan

Updated: 2026-10-26 (Asia/Dhaka).

## Scope and source

Reviewed all five pages of `/Users/golammoula/Downloads/ResolveFlow_AI_Advanced_Project_Blueprint (1).pdf` against the repository. It is byte-identical to `ResolveFlow_AI_Advanced_Project_Blueprint.pdf` (SHA-256: `5aee23da36c06fb25d933d43f7c77b0b73abbe82789bc422c2a7df5503618eed`).

The user has now requested continuing project implementation after the blueprint review. Document directions are product requirements for planning; this review does not authorize deployment, external sends, or publication. The PDF refers to a starter ZIP that was not supplied; the existing foundation was created locally.

Target workflow: customer request → ticket → authorized knowledge retrieval → cited draft → human review and approval → queued delivery → delivery outcome and audit record.

Checked items below mean code or artifacts exist, not that an entire phase passed. Verification and phase exit gates are listed separately.

## Current evidence

| Area | Repository state | Verification status |
| --- | --- | --- |
| Monorepo and configuration | React/Vite/TypeScript frontend, Express/TypeScript API, PostgreSQL Compose, environment examples, lockfile | Both builds passed in the preceding implementation turn |
| Persistence | Prisma models and initial SQL migration | Client generation passed; all three migrations applied to persistent local PostgreSQL and disposable test PostgreSQL |
| Accounts and roles | Registration, multiple workspaces, invitations, owner administration; cookie sign-in/out; request-time authorization | All 18 API/unit/database tests pass with no skips |
| Tickets | Create, list, search, paginate, detail, assignment, status/priority updates, internal notes | Database integration and two-session Chromium workflow passed |
| Audit | Transactional events for ticket creation, edits and notes; scoped event list | Database integration passed |
| CI | Workflow provisions PostgreSQL, migrates, builds and runs tests | Configuration exists; no remote passing run verified |
| Knowledge and drafts | Approved text ingestion/search, optional provider embeddings and cited drafts, abstention, source withdrawal and telemetry | 18 API/unit/database tests and two browser workflows pass; live provider quality unverified; review/delivery/workers pending |

A bundled development PostgreSQL runtime now enables local development and disposable database testing without Docker. All 18 API/unit/database tests passed against PostgreSQL with no skips; all three migrations applied. Latest dependency installation reported zero vulnerabilities. Both Chromium workflows passed; remote CI is unverified.

## Phase 1 — Foundation and configuration

### Implemented foundation

- [x] Create AGENTS.md, CONTEXT.md, README and npm workspaces.
- [x] Add server/client environment examples and PostgreSQL configuration on port 5433.
- [x] Define users, workspaces, memberships, roles, tickets, messages and audit models with tenant indexes.
- [x] Generate Prisma client and initial migration SQL.
- [x] Implement registration, login/logout, JWT cookie verification, origin validation and auth rate limits.
- [x] Query current workspace membership and role on every workspace request; deny VIEWER mutations.
- [x] Implement tenant-scoped ticket creation, reads, search, pagination, assignment and lifecycle updates.
- [x] Implement internal ticket threads and transactional audit records.
- [x] Build registration/sign-in, inbox, detail, note composer and activity interfaces.
- [x] Add API security tests, a database integration suite and CI configuration.

### Next work, in execution order

1. [x] Configure local server/client `.env` values with a generated JWT secret and matching CORS/API origins; keep credentials out of version control.
2. [x] Make a local or supplied PostgreSQL instance available, apply the initial migration, verify readiness and start both apps. Verified with `npm run dev:local`; the servers were then stopped for isolated browser tests.
3. [x] Run the existing PostgreSQL integration suite against a dedicated test database; record actual results.
4. [x] Complete workspace lifecycle: existing-account workspace creation, membership management and workspace switching across real memberships.
5. [x] Implement owner-controlled invitations with workspace/email binding, expiry, single-use acceptance and revocation; audit membership and role changes. These lifecycle details are implementation choices supporting the blueprint's invitation requirement.
6. [x] Add owner role administration; prevent non-owners from managing roles and accidental removal of the final owner.
7. [x] Expand database tests for invitation abuse, removed memberships, immediate role changes, VIEWER restrictions, session expiration and invalid tokens, and cross-workspace list/search/read/update access.
8. [ ] Expand browser coverage for login/logout, assignment, filters and pagination. The existing passing Chromium test covers registration, ticket creation, notes, status changes, tenant isolation, invitation acceptance, workspace selection, role enforcement and activity history.

**Exit gate:** two fictional organizations use the same running deployment; database-backed tests prove they cannot access each other's tickets or audit events. Roles, invitations and secure sessions work end to end. Local exit gate passed: two-session Chromium workflow and PostgreSQL integration tests verify the implemented foundation. Remote deployment remains unverified.

## Phase 2 — AI knowledge and workflow engine

Start after the Phase 1 exit gate. Keep provider secrets server-side; use synthetic, approved source material.

### 2A. Knowledge ingestion and retrieval

- [x] Implement Groq structured draft generation with keyword retrieval by default, plus an explicitly selected OpenAI adapter for embeddings/hybrid retrieval. Document configuration, 2,000-passage limit and scalable vector-index migration needs.
- [ ] Complete immutable document version history and persisted ingestion failure states. Workspace-owned immutable documents, chunks, approval metadata and source references are implemented; current documents start at version 1.
- [x] Authorize UTF-8 text/Markdown ingestion; enforce file extensions, a 40 KB content limit, valid Unicode and bounded HTTP payloads. PDF extraction is outside the initial supported formats.
- [ ] Verify real provider embeddings end to end after server-side credentials/model configuration. Text chunking, approved-document indexing and vector persistence are implemented and tested with provider doubles.
- [x] Enforce tenant and document authorization before retrieval; exclude unapproved or removed content.
- [x] Test invalid/oversized ingestion, stale/deleted sources, role restrictions and cross-tenant search attempts against PostgreSQL.

### 2B. Grounded drafts

- [x] Implement authorized hybrid retrieval and a structured model request treating retrieved text as untrusted evidence. Provider contract tested with doubles; live-provider verification remains pending.
- [x] Save drafts with source/version/chunk references; inspect quoted source passages from the ticket UI and hide stale-source drafts on subsequent reads.
- [ ] Evaluate appropriate abstention/clarification on contradictory or ambiguous evidence with a real configured model. No-match abstention and structured model abstention handling are implemented.
- [x] Handle provider HTTP errors, timeouts, invalid embeddings, incomplete drafts and unverifiable citations explicitly.
- [x] Record model, token usage, measured provider latency and failures; report unknown monetary cost as null.
- [ ] Complete live prompt-injection and claim-support evaluation. Draft/citation UI, exact-quote/source-ID checks, provider-contract tests and workspace-isolation tests are implemented; exact quotes alone do not prove semantic support.

### 2C. Human review and approved delivery

- [ ] Model draft edits, review state, approval/rejection, reviewer identity and rejection reasons.
- [ ] Build the review queue and track the precise response version approved; edits must invalidate stale approval.
- [ ] Authorize review actions and audit every transition.
- [ ] Add a configured delivery integration; require explicit approval for every external send under the initial policy.
- [ ] Persist delivery attempts, outcomes and provider references; distinguish internal notes, drafts and delivered replies.

### 2D. Recoverable automation and webhooks

- [ ] Add Redis, BullMQ and a separately runnable worker with environment validation and health checks.
- [ ] Implement bounded retries, backoff, idempotency, failure recording and authorized recovery/replay.
- [ ] Implement one rules-based automation: priority escalation or owner assignment; log its trigger, decision and result.
- [ ] Carry workspace context into jobs and recheck applicable permissions/approval before executing actions.
- [ ] Implement webhook integration with documented events, authentication/signature verification, replay protection and duplicate handling. Select the provider and inbound/outbound contract before implementation.
- [ ] Test duplicate jobs, transient failures, worker restarts, stale approvals and webhook retries without duplicate external actions.

**Exit gate:** an authorized source-backed draft is reviewed and approved, queued and delivered through a real configured integration; job attempts and failures are traceable and recoverable. Unsupported questions abstain and tenant boundaries hold for documents, drafts and jobs. Gate is currently unmet.

## AI evaluation — required before advanced release

Freeze a synthetic test set, expected evidence and grading rubric before collecting results:

| Category | Cases | Expected behavior |
| --- | ---: | --- |
| Straightforward supported requests | 20 | Retrieve relevant approved evidence and produce supported citations |
| Ambiguous requests | 10 | Ask for clarification or limit the answer to supported facts |
| Unsupported or contradictory requests | 10 | Abstain rather than invent a policy |
| Cross-tenant or prompt-injection attempts | 10 | Preserve authorization and resist instructions embedded in evidence |

- [ ] Measure retrieval hit rate, claim-level citation support, appropriate abstention and tenant isolation.
- [ ] Track human approval without edits, edit/rejection reasons and acceptance denominator.
- [ ] Record measured latency, tokens, calculable provider cost, failure rate and retry count.
- [ ] Store evaluation configuration, model/source versions and per-case outcomes; distinguish retrieval failures from generation failures.
- [ ] Define release thresholds before the run, publish limitations and avoid claiming production accuracy from 50 synthetic cases.

## Phase 3 — Bugs, UI, deployment and portfolio

### Quality and release readiness

- [ ] Fix defects found in full workflow testing; verify loading, empty, error and retry states.
- [ ] Verify mobile layouts, keyboard operation, dialog focus handling and accessible labels.
- [ ] Expand API/database tests across documents, drafts, reviews, jobs and webhooks.
- [ ] Add browser E2E tests for the complete approved-delivery journey and two-tenant access boundaries; run them in CI.
- [ ] Add structured request/job logs, correlation IDs, redaction, centralized collection and monitoring of errors, queue failures and latency.
- [ ] Complete environment validation, dependency review and release checks; document secure session limitations and shared rate limiting for multi-instance deployment.
- [ ] Verify clean setup from lockfile, migration deployment and independent demo instructions; retain passing CI/E2E evidence.

### Deployment

- [ ] Prepare frontend/API/worker deployment configuration, persistent PostgreSQL/vector storage and Redis.
- [ ] Configure HTTPS, isolated credentials, production cookie/CORS settings, backups, migration procedure and rollback/recovery notes.
- [ ] Select hosting and provide required service credentials; perform deployment only within user-authorized scope.
- [ ] Verify production readiness, worker recovery and the complete workflow after deployment.

### Demo and portfolio

- [ ] Seed two fictional organizations with predictable demo accounts and safe synthetic tickets/documents.
- [ ] Write a self-contained demo runbook and document architecture, implemented scope, setup, tests and limitations in README.
- [ ] Capture annotated screenshots: dashboard, inbox/detail, citations, approval, workflow run and evaluation metrics.
- [ ] Produce a 90–120 second walkthrough showing sign-in, tenant boundaries, a live ticket, cited draft, human approval and automation.
- [ ] Prepare portfolio copy and publish demo/video/screenshots only when authorized.

**Exit gate:** an independent reviewer can complete the live demo without developer assistance; CI, database and browser checks have recorded passing results, and limitations are disclosed. Gate is currently unmet.

## Immediate priority

Continue Phase 2 with draft editing and human approval/rejection, followed by background jobs and delivery integrations. Configure a server-side AI key/model for live provider verification; the planned 50-case evaluation remains unrun. Knowledge ingestion/search and cited draft infrastructure are implemented and tested, but the full Phase 2 exit gate is unmet.

## Provider decision — Groq
User selected Groq. Use AI_PROVIDER=groq, GROQ_API_KEY and GROQ_MODEL (default openai/gpt-oss-20b on Groq). Groq draft generation uses approved lexical evidence and strict JSON schema output. Semantic indexing/search require a separate embedding provider and remain disabled in the Groq configuration. No OpenAI key is required or implicitly used. Contract tests cover the Groq endpoint, schema, token accounting, truncation, malformed output and failures; live calls remain unverified until a key is configured.
