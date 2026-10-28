# ResolveFlow AI completion plan

Updated 2026-10-26 (Asia/Dhaka). The user asked to complete the project and selected Groq plus Vercel hosting. The source blueprint remains `ResolveFlow_AI_Advanced_Project_Blueprint.pdf`.

Checked items mean implemented and locally verified unless explicitly described as configuration/artifacts only. Live-provider and hosted-release gates remain separate. No external sends, paid provider calls, publication or deployment were simulated.

## Phase 1 — Foundation

- [x] Monorepo, configuration, environment examples and PostgreSQL migrations.
- [x] Accounts, workspaces, invitations, OWNER/AGENT/VIEWER policy and current membership checks.
- [x] Tickets, threads, assignment, statuses/priorities, filtering and pagination.
- [x] Transactional audit history and cross-tenant database tests.
- [x] Browser checks for registration, sign-in/out, role enforcement, membership, ticket updates, search/pagination, assignment and mobile dialogs.

Local exit gate passed: two synthetic organizations share the app without cross-tenant ticket, document, draft, audit or workflow access.

## Phase 2 — Knowledge, review and workflow engine

- [x] Authorized UTF-8 text/Markdown ingestion, 40 KB limit, validation and persisted failure codes.
- [x] Immutable document series/versions, approval, withdrawal, supersession and source inspection; older superseded versions cannot be reapproved.
- [x] Groq strict structured drafts with approved English lexical evidence; optional explicit OpenAI embedding/hybrid adapter.
- [x] Exact source/quote validation, abstention, draft history, stale-source handling and provider failure/timeout paths.
- [x] Human-written evidence-backed response fallback, explicitly labelled HUMAN rather than AI output.
- [x] Immutable response revisions, exact-version human approval/rejection, reviewer/time/body hash, reasons and review queue.
- [x] Edits/source changes invalidate approval; stale and concurrent decisions fail safely.
- [x] Durable PostgreSQL outbox plus real Redis/BullMQ worker, bounded retries/backoff, duplicate protection, failure history and authorized recovery.
- [x] Explicitly confirmed approved delivery with recipient/body/version snapshot, worker reauthorization and stable provider idempotency key.
- [x] Actual local file capture channel and Resend adapter. Provider acceptance is distinct from signed confirmation of delivery/bounce/failure.
- [x] Stop uncertain delivery retries before the provider's idempotency retention expires; provide reconciliation instructions.
- [x] Priority escalation rule, manual/scheduled runs, idempotent processing and auditable outcomes.
- [x] Signed tenant ticket webhooks with expiry, event-ID/body binding and replay protection; signed/deduplicated Resend outcome webhooks.
- [x] Measured provider latency/tokens/failures, optional explicitly configured price snapshots, review/workflow metrics and worker heartbeat.
- [ ] Verify live Groq outputs and real external email with supplied credentials/domain; no live key was supplied.
- [ ] Run real embedding verification if selecting the optional embedding provider. Groq-only mode intentionally uses keyword retrieval and disables semantic controls.

Local workflow exit gate passed using a human-authored response and actual local capture through the real queue. The blueprint's live AI + externally delivered response exit gate remains unverified until configured.

## Evaluation

- [x] Freeze/hash 50 synthetic cases: 20 supported, 10 ambiguous, 10 unsupported/contradictory, 10 adversarial (five cross-tenant, five prompt-injection).
- [x] Define grading rubric and release thresholds before the first run; retain expected sources, model/source configuration and case-level results.
- [x] Run real PostgreSQL retrieval/authorization evaluation: 20/20 expected-source hits; 5/5 direct cross-tenant probes denied; zero foreign-passage leaks.
- [x] Implement live Groq runner and report fields for actual output/citations/usage; leave answer-quality grades unscored until human review.
- [ ] Run live model evaluation and manually grade claim support, abstention/clarification and injection resistance. Retrieval results are not model accuracy or production accuracy.

## Phase 3 — Quality and release assets

- [x] Resolve browser-discovered bugs, including the ticket update/close race and ambiguous control labels.
- [x] Responsive UI, empty/loading/error states, explicit form labels, keyboard dialog focus, Escape and return-to-trigger behavior.
- [x] Production builds and Prisma generation pass; all five migrations apply.
- [x] 22 API/unit/PostgreSQL/Redis tests pass with no skips.
- [x] Five Chromium workflows pass, including the full approved local-delivery path.
- [x] Combined `release:check` passes: build, database/queue suite, browser suite and frozen retrieval evaluation.
- [x] CI configuration provisions PostgreSQL/Redis, builds, tests, evaluates and uploads evidence. A remote passed run is not claimed.
- [x] Structured request/job logs with request IDs and safe error codes; Redis shares auth/AI limits across configured API instances.
- [x] Synthetic demo seed with two organizations and role accounts; idempotent setup that does not reset existing data.
- [x] Actual screenshots and a 92.12-second captioned browser video. It explicitly shows HUMAN responses/local capture; it is not presented as live AI/email evidence.
- [x] README, architecture, demo runbook, operations/recovery notes and factual portfolio evidence package.

## Vercel deployment

- [x] Root Vercel configuration, same-origin frontend API access and Express function entry without a listening server.
- [x] Bounded authenticated cron/manual worker invocation; no permanent worker inside Vercel Functions.
- [x] Hobby-compatible daily cron fallback; document frequent scheduling requirements for timely work.
- [x] Hosted PostgreSQL/Redis/Groq/Resend environment template, migrations, HTTPS/cookies/origin guidance and backups/rollback notes.
- [x] Vercel function entry source bundles locally; actual Vercel build/runtime is not claimed.
- [ ] Connect/provision the user's hosted PostgreSQL and TCP/TLS Redis services.
- [ ] Configure Groq key, verified email sender/key/signing secret, production origins/secrets and scheduler in Vercel.
- [ ] Apply hosted migrations, deploy and verify production tenant boundaries, worker execution, signed events, logs and backups.
- [ ] Record remote CI and live evaluation/delivery evidence; complete an independent live-demo review.
- [ ] Publish the approved live demo/portfolio assets when the hosting setup and release gates are satisfied.

## Practical release status

The remaining repository implementation, local verification and handoff artifacts are complete. Live launch is pending external accounts/credentials and live validation. Known hardening limits outside the original demo scope include account email verification/password recovery, individual stolen-JWT revocation, and tamper-proof external audit retention; see README. Do not mark the hosted/live-provider gates complete without actual evidence.

## Public homepage addition — complete locally

- [x] Add a public advertising homepage before sign-in, with honest feature copy and a labelled illustrative preview.
- [x] Add navigation to signup/sign-in and the existing workspace; preserve browser history and direct auth links.
- [x] Verify responsive desktop/mobile layout, CTA links, FAQ and auth regression coverage.
- [x] Production build passed; all seven Chromium workflows passed. Save desktop/mobile screenshots.

## Homepage visual refinement
- [x] Replace the initial promotional card layout with a restrained editorial presentation and actual demo-product screenshots.
- [x] Remove homepage arrow icons; retain accessible preview tabs and public/auth navigation.
- [x] Verify desktop/mobile appearance, no mobile horizontal overflow, preview interactions and existing auth/workspace flows. Both builds and all seven Chromium workflows pass.

## Hosted demo workspace data
- [x] Add an explicit, repeatable seed for an existing owner's workspace without changing credentials or resetting records.
- [x] Populate the requested Neon workspace with 12 fictional tickets, five policy documents and three human-written drafts; preserve real AI/delivery activity metrics.

## UI-only refinement — 2026-10-27
- [x] Unify dashboard/auth/home presentation with readable typography, a warm neutral palette, clearer navigation and review surfaces.
- [x] Improve phone layouts, retain workspace selection and show ticket metadata without horizontal table scrolling.
- [x] Refresh public product screenshots; verify frontend production build and desktop/mobile screens using isolated fictional API responses, preserving live data and backend behavior.
- [x] Replace green with a soothing slate-blue, lavender and ivory palette across all UI surfaces; refresh previews and verify desktop/mobile presentation.

## Product-focused visual redesign — 2026-10-27
- [x] Rebuild the homepage around a concrete support example, product previews, a shorter walkthrough and honest intake/delivery FAQs.
- [x] Replace dashboard slogans and decorative summary cards with plain titles, compact inbox context and a focused ticket side panel.
- [x] Refine sign-in, knowledge, team and review presentation while preserving existing workflows and the softer palette.
- [x] Verify desktop/mobile layouts, production frontend build and all seven browser workflows against disposable services on separate ports; leave the running Neon demo untouched.

## User's purple reference and visuals
- [x] Apply the supplied plum/violet/lilac direction across public and authenticated screens.
- [x] Add an original responsive SVG workflow illustration to homepage and desktop authentication; preserve honest demo labels.
- [x] Refresh product previews and verify desktop/mobile presentation and frontend production build without touching live data.
- [x] Add a desktop/mobile Back to home control in the workspace header; verify navigation preserves the session and frontend builds.
- [x] Apply the user's replacement cream/caramel/brown/espresso reference across UI and illustration, refresh previews and verify frontend build plus desktop/mobile layouts.
- [x] Darken sidebar and contain page scrolling below the header on desktop/mobile; verify scroll behavior, frontend build and all seven browser workflows.
- [x] Apply the user's latest navy/blue/gray reference across UI and illustration, retaining the dark sidebar and independent scrolling; refresh previews and verify desktop/mobile layout and frontend build.
- [x] Add an original shared logo/favicon, gentle motion with reduced-motion support, stable preview switching, accurate loading hints and reliable dialog focus; verify browser regressions and UI stability.
- [x] Add subtle scroll-triggered reveals to homepage sections with reduced-motion and browser fallback support.
