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

## Draft review build — 2026-10-26
- Added draft version/review metadata, immutable DraftRevision snapshots, DraftReview decision history and a migration that backfills revision 1 for existing drafts.
- Added tenant-scoped paginated review queues and detail/history endpoints. OWNER/AGENT can edit/approve/reject; VIEWER reads only. Writes recheck membership under the workspace row lock.
- Editing a changed response creates a revision, returns to DRAFT and clears approval. expectedVersion prevents stale edits/decisions; concurrent decisions serialize and only one succeeds. Approval requires explicit source-check confirmation; rejection requires a reason. Each review stores version, reviewer, timestamp and a hash of the exact response.
- Source withdrawal/deletion automatically clears approvals and records invalidation. Reapproving a source never restores old approval. Missing-source bodies and revision contents are hidden on subsequent reads.
- Added shared review controls to ticket details and the Review queue page, including editor, required confirmation/rejection reason, source inspection and revision/decision history. Human edits retain original evidence, requiring a fresh manual check.
- Production builds, all 19 API/unit/database tests and all three Chromium workflows passed. Four migrations apply to disposable PostgreSQL. Browser review fixture is hand-authored synthetic data; no live provider call is made.
- Next: Redis/BullMQ worker, idempotent approved delivery and rules automation. Approval currently never queues or sends a customer message. Groq remains selected; live provider/quality evaluation remains pending.

## Completion build — 2026-10-26
User requested completing all remaining work, then chose Vercel hosting. Implemented the remaining repository features and local verification:

- PostgreSQL durable outbox, Redis/BullMQ retries/backoff, idempotent attempts, recovery, worker authorization and exact-version approved delivery. Added local file capture (explicitly not email) and Resend integration with stable idempotency keys, 23-hour uncertainty cutoff and signed/deduplicated delivery outcome webhooks.
- Priority escalation rules and manual/scheduled runs; signed tenant ticket webhooks with timestamp, bound event ID/body and duplicate rejection. Real worker tests exercise Redis and actual capture files; external provider calls remain doubles in tests.
- Document replacement/version history, superseded-source handling and persisted ingestion failure codes; human-written cited manual responses explicitly labelled HUMAN. Measured operations/review/usage metrics and optional server price snapshots; unknown costs stay null.
- Shared Redis auth/AI limits, request correlation logs and keyboard dialog behavior. Fixed a browser-discovered race that reopened a ticket after close during an update.
- Vercel function entry, same-origin frontend, hosted-service template, daily cron fallback and bounded authenticated manual/cron job processing. Continuous worker remains available for a separate host/local dev. Vercel local capture is rejected because its filesystem is ephemeral. Actual deployment requires user service credentials.
- Frozen 50-case dataset/rubric/hash and retrieval/live evaluation runners. Retrieval run: 20/20 expected-source hits, 5/5 direct isolation probes denied, zero foreign passages. Model-quality fields remain ungraded; no live Groq calls were made.
- Combined release check passed: production builds/Prisma generation, five migrations, 22 API/unit/PostgreSQL/Redis tests, five Chromium workflows and retrieval evaluation. Vercel entry bundles with esbuild. CI configuration updated; remote CI remains unverified.
- Synthetic demo seed, Vercel/operations/demo/architecture docs and portfolio notes. Captured screenshots and an actual 92.12-second captioned video at docs/artifacts/walkthrough.webm; the video discloses human-written responses and local capture. No live AI/email/deployment success is implied.

Remaining work requires external state: Groq key/live grading, hosted database/Redis, verified Resend sender and signing secret, Vercel account/configuration/deployment, remote CI and independent live demo review. Do not invent success for these gates. See the rewritten PLAN.md and docs/VERCEL.md. Old phase plan retained in docs/PLAN_BEFORE_RELEASE.md.

Final local handoff: the fifth migration was applied to persistent local PostgreSQL, the API/frontend/worker are running under npm run dev:local, synthetic demo accounts were seeded, /api/health returned ok and the frontend returned HTTP 200. Local delivery mode remains local file capture. Verification evidence is in docs/VERIFICATION.md; live service gates remain as listed in PLAN.md.

## Public marketing homepage — 2026-10-26
User requested an advertising homepage before sign-in. Added a responsive branded landing page with a labelled illustrative product preview, feature benefits, request-to-delivery walkthrough, workspace/role explanation, FAQ and signup/sign-in calls to action. No fabricated testimonials, customer counts, pricing or performance metrics were added.

Public paths are `/`, `/signin`, `/signup`; the authenticated workspace uses `/app`. History/back navigation and deep links work with the existing Vercel SPA rewrite. Signed-in visitors can open their workspace from the homepage. Auth forms link back home; logout returns to sign-in. Session loading is separate from inbox loading to keep sign-in usable after logout.

Built production assets successfully. All seven Chromium workflows passed, including desktop/mobile homepage, CTA/FAQ/browser-history checks, no horizontal mobile overflow, signup/login/logout and signed-in homepage-to-workspace navigation. Existing ticket/knowledge/review/delivery workflows passed. Desktop/mobile screenshots are saved in docs/artifacts/home-desktop.png and home-mobile.png. No backend behavior or hosting provider was changed, and no Site was published.

## Homepage visual revision — 2026-10-26
User requested a less AI-generated appearance and was understood to request no arrow icons. Rebuilt the public page with a restrained editorial layout, paper/ink palette, serif accents, simpler copy and fewer repeated cards. Replaced the illustrative interface with actual synthetic-demo product screenshots served as static public assets. Added keyboard-accessible inbox/knowledge/review screenshot tabs and removed homepage arrow/chevron/sparkle icons. Auth routes and workspace functionality are preserved. Production builds and all seven browser workflows passed; desktop/mobile screenshots were refreshed. User then explicitly requested starting the server.

## User-supplied Neon database and demo login — 2026-10-26
User supplied a Neon DATABASE_URL in the ignored API environment and requested a demo login. Confirmed the database was reachable and had no public tables, then applied all five existing migrations without resetting data. Created the requested demo account with a bcrypt password hash and an OWNER membership in Demo workspace. No plaintext password was saved in tracked files.

Added npm run dev:connected for the configured hosted database; it skips embedded PostgreSQL and can still manage local Redis. Restarted frontend/API/worker against Neon. Login and owner-workspace verification are performed against the running API. Delivery remains in local capture mode; no external customer message is sent.

## Existing-workspace demo seed — 2026-10-26
Added `npm run demo:workspace` with explicit account selection, confirmation and hosted-database opt-in. Seeded the requested account's Demo workspace in Neon with 12 labelled fictional tickets, five fictional approved policies and three HUMAN drafts with source citations and initial revisions. Mutations have demo-specific audit events in the same transaction. Existing accounts/passwords and records are preserved; no AI runs, review decisions, delivery jobs or emails are fabricated. Customer addresses use example.test. See docs/DEMO.md for repeatable usage.
Verified a second run created zero tickets, documents or drafts. No destructive integration tests were run against Neon.

## UI refinement — 2026-10-27
User requested UI work only. Added a shared product presentation layer with warm paper backgrounds, forest accents, readable text and editorial headings matching the public homepage. Refined the sidebar, unique navigation icons/current-page semantics, summary strip, ticket list, knowledge/review surfaces, dialogs and authentication screens. Mobile navigation retains visible labels and workspace selection; ticket rows show status/priority/date without requiring horizontal scrolling. Improved homepage copy sizes and refreshed its product previews using the redesigned UI with clearly fictional intercepted data. No backend behavior, credentials, database records or delivery configuration changed.

Frontend TypeScript/production build passed. Chromium checks covered desktop/mobile homepage, sign-in, inbox, ticket/new-ticket dialogs, knowledge, review, team, workflows and activity, with no page errors or page overflow. API calls were intercepted with fictional fixtures; this was presentation verification, not live-service integration validation. Screenshots are in docs/artifacts/ui-*.png. The separate frontend preview uses port 5174; the existing app configuration remains unchanged.

## Softer color palette — 2026-10-27
User explicitly requested a soothing alternative to green. Replaced the forest/olive treatment in base, homepage and workspace styles with slate-blue actions, lavender supporting surfaces, warm ivory backgrounds and blue-gray text. Renamed accent variables to avoid color-specific names. Preserved amber/error status distinctions. Refreshed all three public product previews and key desktop/mobile screenshots with fictional intercepted API data. Frontend production build and Chromium palette/layout checks passed; no live data or functionality changed.

## Product-focused site redesign — 2026-10-27
User requested a more human, less templated design across the whole site. Rebuilt the homepage around one clearly fictional support question, its policy and the agent's decision, followed by product previews, a concise three-stage walkthrough and practical FAQs. Removed the repeated promotional sections and giant serif slogans. Retained the requested slate-blue/lavender/ivory palette, accessible preview tabs and mobile navigation. Public copy explicitly explains that intake is manual/webhook-based and public forms/email inbox intake are not implemented.

Reworked the workspace into a compact help desk: plain screen titles, a single measured ticket-count line instead of decorative summary cards, simpler sidebar and workspace header, more focused review styling and a right-side conversation panel (full-screen on phones). Sign-in/signup use a practical support example rather than promotional headings. Existing API actions, review/approval constraints and delivery behavior are unchanged. Public preview images and UI screenshots were refreshed using fictional intercepted API responses; no Neon data was mutated.

Verified the frontend production build, desktop/mobile visual checks across all six workspace views, sign-in/homepage and ticket panel, and all seven existing browser workflows on disposable PostgreSQL/Redis. Browser regression configuration now supports TEST_API_ORIGIN/TEST_WEB_ORIGIN, enabling isolated ports 4001/5175 while the live Neon demo keeps running on 4000/5173. Fixed decorative tab numbering being exposed in accessible names during regression testing. Updated existing heading expectations for the revised screen names.

## Reference-inspired plum palette and illustration — 2026-10-27
User supplied a four-band purple reference and requested matching colors and visuals. Applied deep plum (#4b2563), muted violet (#805c94), reference lilac (#9e7eb5) and pale lavender across homepage, dashboard, dialogs and auth. Added a responsive original SVG support illustration showing a clearly fictional question, policy and draft awaiting human review; reused it on desktop auth. Kept illustrations code-native for crisp rendering and labelled the example honestly. Refreshed all three public product previews and desktop/mobile UI captures. Frontend build and browser visual/layout checks passed using intercepted fictional API responses with writes blocked. Corrected mobile header wrapping and illustration corner clipping during inspection. No backend or live database changes.
All seven browser regression workflows also passed against disposable services on ports 4001/5175 after this change.

## Back to home navigation — 2026-10-27
Added a visible Back to home link styled as a secondary button in the workspace header, including on mobile. It uses existing client-side navigation and preserves the signed-in session. Verified desktop/mobile visibility, navigation home and return to the workspace with intercepted fictional API data. Frontend production build passed.

## Cream and caramel reference — 2026-10-27
User replaced the purple reference with #fff8f0 cream, #c08552 caramel, #8c5a3c brown and #4b2e2b espresso. Applied these colors throughout the homepage, dashboard, authentication, dialogs, Back to home control and SVG illustration; kept existing layouts and functionality. Darker brown supports readable actions/text; caramel is used for supporting accents. Regenerated public product previews and UI captures. Desktop/mobile checks across all workspace views, homepage, sign-in and ticket panel passed with intercepted fictional API data; frontend production build passed. No live records changed.

## Darker navigation and contained scrolling — 2026-10-27
Darkened the workspace sidebar to a warm brown with cream text and caramel selected states. The workspace fills the viewport; its content section scrolls independently beneath a stationary header. Sidebar scrolling remains available for short displays, and mobile retains a bounded navigation area above the content. Content is keyboard-focusable and returns to the top when switching tabs/workspaces. Verified independent scrolling, stationary header, no body overflow and tab scroll reset at desktop/mobile widths with fictional fixtures. Updated previews/screenshots; frontend build and all seven browser regression workflows passed on disposable services. Live Neon data remained untouched.
User requested a substantially darker sidebar: changed it to deep espresso #35211e and darkened the workspace selector, hover background and account divider while retaining cream text.

## Navy and gray reference — 2026-10-27
User supplied a new navy/mid-blue/muted-blue/light-gray reference. Replaced the warm brown palette with navy #1c3c50, primary blue #234d6b, muted blue #456982 and light cool-gray surfaces. Kept the user's darker sidebar (#142f40), fixed header and independent content scrolling. Recolored the SVG illustration and regenerated product previews/UI screenshots. Desktop/mobile visual checks passed across all workspace screens, ticket panel, sign-in and homepage with fictional intercepted data. No live database or backend changes.

## Logo, subtle motion and UI stability — 2026-10-28
Replaced the generic Layers mark with a custom response-bubble/R SVG shared across homepage/footer, auth, sidebar and session loading; added a matching favicon. Added small entrance transitions, slow four-pixel illustration drift and restrained button feedback using opacity/transforms. Reduced-motion preferences disable decorative animations and transitions.

Stabilized product preview height/captions, kept all three images mounted to preload previews and reset the inner preview scroll on tab changes. Corrected the inbox's loading hint so it does not claim no matches while a request is pending. Improved dialog focus handling for the topmost visible dialog and preventScroll focus restoration to avoid scroll jumps. Existing seven browser flows passed against disposable services, and additional isolated browser checks verified reduced motion, stable desktop/mobile preview heights, one accessible preview image and nested-dialog Escape/focus behavior. Refreshed previews/UI captures with fictional data and reduced motion for deterministic screenshots; no live records changed.

Homepage scroll reveals — 2026-10-28: Added small fade/14px rise reveals to the product, workflow, FAQ and final call-to-action sections as they enter the viewport. The effect uses IntersectionObserver, reveals above-the-fold content immediately, and is disabled for reduced-motion users or browsers without IntersectionObserver. Frontend production build passed.
