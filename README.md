# ResolveFlow AI

Multi-tenant customer support and workflow automation built with React, TypeScript, Express, PostgreSQL/Prisma, Groq, Redis and BullMQ. Vercel deployment configuration is included.

Implemented: accounts/workspaces, invitations and roles; ticket threads, assignment, filtering/pagination; versioned approved knowledge; cited AI or explicitly human-written drafts; immutable revisions and human approvals; durable approved-delivery jobs; retry/backoff/idempotency; priority escalation; signed ticket and email-status webhooks; tenant-scoped audit and operational metrics.

## Run locally

Use Node 24, npm and a compiler/make toolchain for the bundled real Redis runtime. Docker is optional. First install/start may download and compile Redis 7.2.7.

```sh
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set a random JWT_SECRET of at least 32 characters. Configure REDIS_URL=redis://127.0.0.1:6380. Choose DELIVERY_MODE=local for actual local file capture (no email), or disabled to turn delivery off. Add separate random WEBHOOK_SIGNING_SECRET and CRON_SECRET values if using those integrations.

```sh
npm run dev:local
```

Open http://localhost:5173. This starts persistent PostgreSQL, persistent Redis, API, frontend and worker. Data and local capture files stay under ignored `.local/`. For Docker databases, `docker compose up -d`, generate/migrate Prisma, then `npm run dev` instead.

Optional synthetic demo:

```sh
npm run demo:seed -- --confirm
```

See [demo accounts and walkthrough](docs/DEMO.md). Seeding never resets existing records.

## Groq

Set server-only values in apps/api/.env:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=<your-key>
GROQ_MODEL=openai/gpt-oss-20b
```

Restart the API. No OpenAI key is required. Groq drafts use approved PostgreSQL English keyword evidence and strict structured output. Source IDs and exact quotes are validated, but citation presence does not prove that a claim follows from the evidence. Human review remains required. Missing evidence abstains; missing provider configuration returns an explicit error. No AI answer or metric is fabricated.

The optional OpenAI adapter is selected explicitly with AI_PROVIDER=openai, OPENAI_API_KEY and AI_MODEL. Its embeddings enable bounded exact cosine search over PostgreSQL arrays (2,000 passages/workspace, uncalibrated initial threshold 0.35). Groq mode disables semantic indexing/search until a separate embedding integration is configured.

Text/Markdown uploads are limited to 40 KB and validated as text. Owners approve, withdraw and replace sources with immutable versions. Older versions cannot be reapproved while superseded. Invalid ingestion attempts are recorded without raw document content. PDF extraction is outside the supported input formats.

## Review and delivery

Owners/agents can edit and review drafts; viewers read only. Changed edits create immutable revisions, return to pending review and clear approval. Decisions require an expected version; approval requires a source-check confirmation, rejection a reason. Withdrawing a source invalidates current approvals. Edited responses retain original evidence references, which the reviewer must recheck.

Delivery requires a separate explicit confirmation on an approved version. The PostgreSQL outbox survives queue interruptions; BullMQ uses stable IDs, bounded retries and exponential backoff. The worker rechecks membership, current approval, exact version/body, recipient and sources immediately before delivery.

- local: writes a real idempotent JSON capture file; status LOCAL_CAPTURED never means email delivery.
- resend: uses the configured sender/key and a stable provider idempotency key; ACCEPTED is not DELIVERED. Signed Resend events set delivery/bounce outcomes.
- disabled: rejects delivery requests.

Uncertain sends are not retried after 23 hours from first attempt because Resend retains idempotency keys for 24 hours. See [operations and recovery](docs/OPERATIONS.md). Workflow history, provider usage, review counts, ingestion failures and worker heartbeat are measured from stored events. Monetary cost is null unless explicit model price snapshots are configured with AI_INPUT_USD_PER_MILLION, AI_OUTPUT_USD_PER_MILLION and optionally EMBEDDING_USD_PER_MILLION. Historical unknown costs remain unknown.

## Vercel

Follow [the Vercel setup guide](docs/VERCEL.md) and [environment template](deployment/vercel.env.example). The frontend uses same-origin `/api`; the Express function never starts a listening server. Hosted PostgreSQL and a TCP/TLS Redis service are required. Local capture is rejected on Vercel.

Job processing uses authenticated bounded cron/manual invocations. The default daily cron is compatible with Hobby scheduling; timely support delivery needs the documented frequent scheduler or a separately hosted worker. Redis shares auth/AI rate limits across configured API instances. Runtime JSON logs include request IDs and safe metadata, without credentials or bodies.

## Verification and evidence

```sh
npm run release:check
npm run demo:capture
```

The release check generates Prisma, builds both apps, runs unit/API/PostgreSQL/Redis tests, runs Chromium workflows and produces the frozen retrieval evaluation report. Disposable services are removed afterward. Browser tests disable provider keys; no external email or paid AI call occurs. CI defines the same checks with PostgreSQL/Redis services, but a remote CI run is not claimed until observed.

The frozen [50-case dataset](evaluation/dataset.json) and [rubric](evaluation/RUBRIC.md) separate retrieval/authorization from answer quality. The retrieval-only run recorded 20/20 expected-source hits, 5/5 direct cross-tenant denials, zero foreign passage leaks. These are synthetic retrieval results, not model accuracy. Live Groq evaluation and manual grading remain required.

[Walkthrough and screenshots](docs/artifacts/) show synthetic workspaces, an explicitly human-written response and real local capture. The approximately 90-second video does not claim live AI generation or external delivery. [Architecture](docs/ARCHITECTURE.md), [portfolio evidence notes](docs/PORTFOLIO.md), [plan](PLAN.md) and [handoff context](CONTEXT.md) describe the implementation and outstanding external gates.

## Remaining external gates and limitations

Live Groq answers/evaluation, real Resend delivery/domain setup, hosted database/Redis provisioning, Vercel deployment and independent live-demo review need the user's accounts, credentials and validation. They were not replaced with simulated success. Account email verification/password recovery and individual stolen-token revocation are not implemented; browser logout clears the cookie, while a copied JWT remains valid until its eight-hour expiry. Review history is application-audited, not tamper-proof against database administrators. Backups, log retention and production resource limits must be configured on the selected services before real customer use.

References: [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [BullMQ connections](https://docs.bullmq.io/guide/connections), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Public homepage

Visitors enter through the public product homepage at `/`. Its feature/workflow sections and FAQ link to `/signup` and `/signin`; the authenticated workspace is at `/app`. Signed-in visitors can reopen their workspace from the homepage. The responsive product preview is explicitly illustrative and contains no fabricated customer or performance claims. Desktop/mobile screenshots are in docs/artifacts/home-desktop.png and home-mobile.png. The latest frontend build and all seven browser workflows pass.

For development against a configured hosted database such as Neon, use `npm run dev:connected`. It uses DATABASE_URL from apps/api/.env, applies the existing migrations, and manages Redis locally only when its URL is localhost. `dev:local` retains its localhost-database guard. Hosted services and accounts are never reset by these launchers.
