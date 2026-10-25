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

Verified locally: both production builds pass, both migrations apply to PostgreSQL, and all eight API/security/database tests pass with no skips. The latest dependency installation reported zero vulnerabilities. The two-session Chromium workflow also passes. Remote CI and deployment remain unverified.

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

Internal notes never send customer email. AI provider credentials, document ingestion, citations, approval workflows and background workers are not implemented yet. Invitations are created as tokens, displayed once to the owner for private sharing; this app does not send invitation emails. Tokens expire in seven days, are stored as SHA-256 hashes and can be revoked. Acceptance requires the invited account email. Account email verification and password recovery are not implemented. Workspace membership changes serialize on the workspace row to preserve the final owner. See [PLAN.md](PLAN.md) for the complete blueprint backlog and [CONTEXT.md](CONTEXT.md) for handoff context. This is not yet a production-ready advanced SaaS.

## References

Implementation guidance: [Express security practices](https://expressjs.com/advanced/best-practice-security/) and [Prisma 6 relations](https://docs.prisma.io/docs/orm/v6/prisma-schema/data-model/relations).
