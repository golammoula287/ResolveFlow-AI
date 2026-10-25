# ResolveFlow AI context

Last updated: 2026-10-26 (Asia/Dhaka).

## User request
Create agent and context files, plan the project, and implement it. The workspace initially contained only the five-page advanced project blueprint PDF. No starter ZIP, existing application, credentials, or deployment target were supplied.

## Product
A multi-tenant customer support SaaS with ticket workflows, auditable mutations, document-grounded AI drafts, human approval, and recoverable background automation. No fake AI or fabricated analytics.

## Implementation decisions
- Build the missing foundation from scratch using the blueprint's React/TypeScript/Express/PostgreSQL/Prisma stack.
- Use Prisma 6.19 with its conventional schema and migration tooling, pinned explicitly.
- Use signed eight-hour JWTs in HttpOnly SameSite=Strict cookies; enforce exact browser origin on writes. Production requires HTTPS and NODE_ENV=production.
- Recheck database memberships on every workspace request. Scope all ticket reads/writes to workspaceId.
- Registration creates a user, workspace, and OWNER membership atomically.
- Ticket creation, edits, and notes generate transactional audit events.
- No customer emails are sent. Messages after the initial request are internal notes.

## Current scope
Registration/login/logout, workspace selection, inbox filtering and pagination, ticket creation/detail, assignment, lifecycle status and priority editing, internal notes, activity history, role enforcement, Prisma schema and migration, local database Compose configuration, CI and security tests.

## Remaining blueprint scope
Knowledge ingestion and retrieval; provider integration; cited drafts and abstention; approval queue; delivery; Redis/BullMQ; webhooks; frozen 50-case AI evaluation; browser E2E tests; deployment and portfolio artifacts. See PLAN.md.

## Environment
Node 24 and npm 11 available. Docker and PostgreSQL command-line/server binaries were not installed at initial inspection. Do not claim a running PostgreSQL-backed application without verifying it.

## Verification results
- npm install completed and package-lock.json is committed to the deliverable.
- Prisma client generation passed; initial migration SQL generated from the schema. Migration has not been applied to a running database here.
- npm run build passed for both workspaces.
- npm test: six security tests passed; one PostgreSQL integration test skipped because TEST_DATABASE_URL is absent.
- npm audit after updating effect and deepmerge-ts overrides: zero reported vulnerabilities. Prisma generation, build and tests were rerun successfully after these changes.
- Browser E2E, database runtime behavior and deployment remain unverified.

## Blueprint review — 2026-10-26
The user requested scanning `/Users/golammoula/Downloads/ResolveFlow_AI_Advanced_Project_Blueprint (1).pdf` and updating the plan. All five pages were extracted; its SHA-256 matches the workspace PDF. PLAN.md now follows the blueprint's three phases, identifies implementation versus verification status, supplies phase exit gates, and includes previously underspecified webhooks, rules-based automation, AI telemetry, the exact 20/10/10/10 evaluation split, release checks and portfolio deliverables. This turn changed planning documents only; it did not run tests, deploy, publish or send externally. Next priority is PostgreSQL runtime verification followed by workspace membership/invitation completion.

## Foundation build continuation — 2026-10-26
- Added existing-account workspace creation; owner-only invitation listing/creation/revocation, single-use email-bound acceptance with seven-day expiration and hashed tokens. Tokens are shared manually; no invitation email is sent.
- Added owner-controlled role changes and member removal. Management transactions lock the workspace row, recheck owner access and protect the final owner. Removal clears ticket assignments.
- Added People & workspaces UI and per-account active workspace persistence within the browser session.
- Added invitation migration, embedded local PostgreSQL, npm run dev:local, npm run test:db and npm run test:e2e. Local environment files were created without replacing any existing files; secrets are ignored.
- Both migrations applied to persistent local PostgreSQL and disposable test PostgreSQL. All eight API/security/database tests passed without skips. Builds passed. Two-session Chromium workflow passed (one browser test); all eight API/security/database tests passed.
- Added Playwright workflow test and CI browser steps; remote CI remains unverified. Browser checks cover registration, tickets, notes, status changes, workspace separation, invitation acceptance, workspace persistence, viewer role enforcement and audit history. Next implementation priority is Phase 2 knowledge ingestion and retrieval.

## Knowledge and draft build — 2026-10-26
- Added workspace-owned immutable text/Markdown documents, 40 KB/UTF-8 validation, owner approval/withdrawal/deletion, overlapping chunks, PostgreSQL English full-text search and source inspection UI. No PDF extraction or version editing yet.
- Added an optional OpenAI embedding/Responses adapter based on official documentation, strict output validation, timeout/error handling and rate limiting. Requires server-only OPENAI_API_KEY and AI_MODEL; no key was supplied or used.
- Semantic retrieval uses exact cosine similarity over PostgreSQL float arrays, limited to 2,000 passages per workspace, combined with lexical ranking. Initial 0.35 threshold is uncalibrated; pgvector/scalable indexing remains future work.
- Added cited draft history, source ID/exact-quote checks, abstention, stale-source hiding and measured provider telemetry. Cost is null; no provider quality claims are made.
- Three migrations apply successfully to disposable PostgreSQL. All 15 API/unit/database tests and two Chromium workflows pass. Provider/draft tests use explicit test doubles; Chromium forces provider credentials off. Live provider calls and the frozen evaluation set remain unverified.
- Next: human review/edit/approval/rejection, then background automation and approved delivery. No customer messages are sent.

## Groq provider selection — 2026-10-26
User chose Groq. Added a Groq Chat Completions adapter with strict structured output and default model openai/gpt-oss-20b, based on Groq official docs. AI_PROVIDER defaults to groq; server configuration uses GROQ_API_KEY/GROQ_MODEL. Local .env selects Groq without adding or displaying a key. Groq drafts use tenant-approved keyword evidence without calling an embedding provider. Semantic search/indexing are explicitly unavailable in this configuration. OpenAI remains an opt-in alternative only. Browser tests disable both provider keys; provider-contract and database tests use doubles. Live Groq calls are unverified because no key was supplied.

Groq validation: production builds passed; all 18 API/unit/database tests passed without skips; both Chromium workflows passed. No live Groq request was made.
