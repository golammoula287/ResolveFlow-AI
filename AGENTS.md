# ResolveFlow AI contributor instructions

Read CONTEXT.md and PLAN.md before changing code. The source of product requirements is ResolveFlow_AI_Advanced_Project_Blueprint.pdf.

## Architecture
- npm workspaces: apps/web (React + TypeScript + Vite), apps/api (Express + TypeScript + Prisma), PostgreSQL on port 5433.
- Tenant-owned data must always be scoped to the authenticated workspace. Resolve membership and role from the database on each request; never trust a client-provided role.
- VIEWER is read only. Only workspace members may be assigned tickets.
- Write audit records in the same transaction as the mutation.
- Never expose credentials or password hashes. Sessions use HttpOnly cookies. Validate request bodies and request origins.
- Internal notes are not customer deliveries. Never implement automatic external sends without a recorded human approval.
- Do not simulate AI, citations, analytics, background processing, or evaluation results. Label unimplemented functionality honestly.

## Commands
npm install
npm run db:generate
npm run build
npm test
npm run test:db
npm run test:e2e
npm run release:check
npm run eval:retrieval

`npm run test:db` and `npm run test:e2e` create and remove their own disposable PostgreSQL cluster. Direct integration test runs need TEST_DATABASE_URL pointed at a dedicated disposable PostgreSQL database. `npm run dev:local` starts persistent local PostgreSQL and both apps; do not run it concurrently with browser tests on ports 4000/5173. Never run them against customer data. Keep PLAN.md and CONTEXT.md current with verified outcomes and remaining work. Do not claim a passing check unless it actually ran.

## Release constraints
Groq is the selected default. Vercel hosts the frontend/API; use bounded cron/manual queue processing rather than a permanent worker inside a function. Local delivery capture is an actual file artifact and must never be labelled externally delivered. Resend acceptance is not delivery; only verified signed status events update it. Never retry uncertain external sends past the configured idempotency window. Keep live provider/hosted deployment gates unverified until credentials and evidence exist.
