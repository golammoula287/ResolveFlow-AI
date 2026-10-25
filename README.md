# ResolveFlow AI

Multi-tenant support workspace built from `ResolveFlow_AI_Advanced_Project_Blueprint.pdf`.

The current implementation provides registration, secure cookie sign-in, workspace authorization, a real ticket inbox, assignment, status/priority changes, internal notes and transactional audit history. Owners can invite teammates, change roles and remove members; existing users can create and join additional workspaces. React + TypeScript + Vite frontend; Express + TypeScript API; PostgreSQL + Prisma persistence.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm. A bundled development PostgreSQL runtime is available; Docker is optional.

```sh
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Replace `JWT_SECRET` in `apps/api/.env` with a randomly generated secret of at least 32 characters. Keep the API origin, browser API URL and frontend port consistent. The example database password is for local development only.

For a persistent local database and both app servers:

```sh
npm run dev:local
```

Local data is stored in ignored `.local/postgres`. Stop with Ctrl+C. Use `localhost` in the browser to match the configured write origin. If you prefer Docker or an existing PostgreSQL server:

```sh
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://localhost:5173 and create a workspace. API: http://localhost:4000. The initial inbox is empty; use **New ticket** to add actual persisted records. Create a second account in a separate browser profile to exercise workspace separation. No demo metrics or simulated AI are displayed.

## Verification

```sh
npm run build
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
```

The API security tests cover unauthenticated access, mutation origins, role policy, membership rechecks and tenant-scoped reads. The database integration test is skipped unless `TEST_DATABASE_URL` is set. Point it at a dedicated migrated disposable PostgreSQL database:

```sh
TEST_DATABASE_URL=postgresql://resolveflow:local_password@localhost:5433/resolveflow npm test
```

`npm run test:db` creates a disposable PostgreSQL database, applies migrations, runs the full API suite and removes the database. `npm run test:e2e` does the same for browser tests, with app servers on ports 4000 and 5173; stop your development servers first.

The integration test creates random fixture accounts and removes its own records. It checks two-tenant reads, search, mutations, notes, audit isolation, cross-tenant assignments, live role changes, invitation binding/expiry/revocation/single-use acceptance, final-owner protection, member removal and logout. CI provisions a separate PostgreSQL service, applies migrations, builds and runs both suites.

Verified locally: both production builds pass, all three migrations apply to PostgreSQL, and all 18 API/unit/database tests pass with no skips. The latest dependency installation reported zero vulnerabilities. Both Chromium workflows also pass. Remote CI and deployment remain unverified.

## Architecture and security

```mermaid
flowchart LR
  Browser[React browser] -->|HttpOnly session cookie| API[Express API]
  API --> Session[JWT verification]
  Session --> Membership[Current database membership and role]
  Membership --> Query[Tenant-scoped Prisma operation]
  Query --> DB[(PostgreSQL)]
  Query --> Audit[Transactional audit event]
  Audit --> DB
```

Membership and roles come from the database on every workspace request. Ticket and message queries carry the current workspace ID. Message foreign keys include the workspace ID. Password hashes remain server-side; JWT cookies expire after eight hours. Writes require an exact matching Origin. Production cookie security requires `NODE_ENV=production` and HTTPS. Login and registration have an in-memory rate limiter, which must be replaced with a shared store for multiple API instances. Logging out clears the browser cookie; stolen tokens remain valid until expiration. Individual session revocation is a remaining hardening task.

Internal notes never send customer email. Knowledge ingestion, approval, search, provider integration and cited internal drafts are implemented as described below. Human draft approvals, customer delivery and background workers are not implemented yet. Invitations are created as tokens, displayed once to the owner for private sharing; this app does not send invitation emails. Tokens expire in seven days, are stored as SHA-256 hashes and can be revoked. Acceptance requires the invited account email. Account email verification and password recovery are not implemented. Workspace membership changes serialize on the workspace row to preserve the final owner. See [PLAN.md](PLAN.md) for the complete blueprint backlog and [CONTEXT.md](CONTEXT.md) for handoff context. This is not yet a production-ready advanced SaaS.

## References

Implementation guidance: [Express security practices](https://expressjs.com/advanced/best-practice-security/) and [Prisma 6 relations](https://docs.prisma.io/docs/orm/v6/prisma-schema/data-model/relations).

## Knowledge and grounded drafts

A synthetic policy is available at `docs/samples/refund-policy.md` for manual testing. Open **Knowledge base** to upload a UTF-8 `.txt`/`.md` document (up to 40,000 bytes) or paste plain text. Agents and owners can ingest documents; only owners can approve, withdraw or delete them. Unapproved content is excluded from retrieval. Documents are immutable; replacing one currently means withdrawing it and adding a new document. Version history and PDF extraction are not implemented.

Approved passages support PostgreSQL English full-text search immediately, without an AI key. Click a result to inspect its source. **Index for AI** generates real embeddings when a provider is configured. Vectors are stored as PostgreSQL float arrays and searched with exact cosine similarity in the API, combined with keyword results using reciprocal rank fusion. This implementation limits semantic search to 2,000 indexed passages per workspace; it is not an approximate vector index. The initial similarity threshold of 0.35 is not calibrated by the pending evaluation set. Larger collections require a scalable vector index such as pgvector and measured retrieval tuning.

For Groq draft generation, configure the server's `apps/api/.env`:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=<your server-side Groq key>
GROQ_MODEL=openai/gpt-oss-20b
```

Restart the API after configuration. Groq is the default provider. The configured model is hosted by Groq and uses its Chat Completions endpoint with strict JSON schema output; no OpenAI key is required. Choose a Groq model that supports strict structured outputs. See [Groq structured outputs and supported models](https://console.groq.com/docs/structured-outputs).

This Groq configuration uses PostgreSQL keyword retrieval over approved sources. Semantic search and **Index for AI** stay disabled because no embedding provider is configured. Existing stored embeddings are not sent to Groq or used for Groq draft retrieval. A separate embedding integration can be added later.

The optional OpenAI adapter remains available only when explicitly selected with `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `AI_MODEL` and optionally `EMBEDDING_MODEL=text-embedding-3-small`. In that mode **Index for AI** generates embeddings for approved sources and drafts can use hybrid retrieval.

Keys remain server-side. Draft requests send the initial ticket question and authorized evidence to the selected provider. Requests time out after 30 seconds, fail explicitly, and have an in-memory limit of 30 AI operations per IP per 15 minutes. Configure a shared limiter before multi-instance deployment. No embeddings or generated responses are simulated when credentials are missing.

Open a ticket and choose **Generate draft**. The app retrieves approved evidence, validates returned source IDs and exact quotations, and saves an internal draft with source links. Missing evidence creates an abstention without a provider call; matching evidence with no provider configuration returns a configuration error. Claims may still misinterpret a valid quote: quotation validation is not proof of factual support. Human review is required, and review approvals/customer delivery are not yet implemented. Draft bodies and citations are hidden on subsequent reads if a cited document has been withdrawn or deleted.

The knowledge screen shows recorded provider model, latency, token usage and failures. Monetary cost remains unknown (`null`), rather than an invented estimate. AI operations are synchronous in this release; job recovery and persisted ingestion failure states are pending.

Verification: 18 API/unit/database tests and two Chromium workflows pass. Groq/OpenAI contract tests and database draft tests use explicit test doubles; browser tests force both providers’ credentials off. No paid provider calls or model-quality evaluation were performed. Full live AI quality remains unverified until configured and evaluated against the planned frozen dataset.

API implementation references: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [OpenAI embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create).
