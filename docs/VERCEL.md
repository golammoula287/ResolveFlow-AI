# Vercel setup

The repository contains one Vercel project: static React frontend plus an Express function at `api/index.ts`. It does not start a listening server or permanent worker inside a function. Job processing uses bounded invocations of the real BullMQ worker. PostgreSQL is the durable outbox; Redis contains the queue state.

## Connect and configure

1. Import this repository in Vercel. Set root directory to the repository root and framework preset to Other. Keep the committed build/output settings in `vercel.json`; use Node 24.
2. Add a hosted PostgreSQL database (for example Neon) and a Redis service with a TCP/TLS Redis URL (for example Upstash's Redis URL). A REST-only Redis URL is not compatible with BullMQ. Keep Redis configured with `maxmemory-policy=noeviction`.
3. Add server-only environment values:

| Variable | Value |
| --- | --- |
| DATABASE_URL | Hosted PostgreSQL URL; use provider pooling settings and a small per-function connection limit |
| JWT_SECRET | Random secret, at least 32 characters |
| WEB_ORIGIN | Exact production HTTPS origin, no trailing slash |
| NODE_ENV | production |
| AI_PROVIDER | groq |
| GROQ_API_KEY | Your Groq API key |
| GROQ_MODEL | openai/gpt-oss-20b or a verified strict-structured-output model |
| REDIS_URL | redis:// or rediss:// TCP connection URL |
| CRON_SECRET | A separate random secret, at least 32 characters |
| WEBHOOK_SIGNING_SECRET | Another random secret, at least 32 characters |
| DELIVERY_MODE | disabled initially; resend when email delivery is configured |
| RESEND_API_KEY | Resend key, when using resend mode |
| DELIVERY_FROM | A sender on your verified Resend domain |
| RESEND_WEBHOOK_SECRET | Resend/Svix signing secret for delivery status events |
| VITE_API_URL | Leave unset or empty so the frontend uses same-origin `/api` |

Never set provider/database secrets with a VITE_ prefix. Preview deployments should use a separate database and disabled delivery. Set WEB_ORIGIN to the exact preview origin if testing writes there; wildcard origins are not accepted. `DELIVERY_MODE=local` is rejected on Vercel because its temporary filesystem is not durable.

4. Apply migrations to the intended database with `DATABASE_URL=<URL> npm run db:migrate` from a trusted shell or release CI. The build deliberately generates the Prisma client but does not run production migrations on every preview build.
5. Deploy, then check `/api/health`, sign-in, both tenant boundaries, ticket creation, knowledge approval, manual/Groq drafting, review, and a controlled delivery to a verified test recipient.

## Jobs and cron

`vercel.json` includes a daily cron at 05:00 UTC, compatible with the documented Hobby scheduling limit. This schedule is a low-frequency fallback, not timely support delivery. Vercel Pro or a suitable external scheduler can invoke `/api/cron/workflows` every minute with `Authorization: Bearer <CRON_SECRET>`. Set the schedule to `* * * * *` only when your Vercel plan supports it. An owner can also use **Workflows → Process pending jobs** for a bounded on-demand run.

Every invocation processes queued/delayed jobs for a bounded window, closes its connections, and leaves unfinished work in PostgreSQL/Redis for the next invocation. The function max duration is 60 seconds. A long-running worker remains available through `npm run worker:start -w apps/api` if a separate worker host is later chosen. Do not start it from the API function.

Resend idempotency keys expire after 24 hours. This app stops retrying an uncertain delivery after 23 hours from its first attempt; it does not automatically send again outside that safety window. Use frequent scheduling for normal operation, inspect uncertain outcomes in Resend, and follow the recovery runbook.

## Delivery webhooks

In Resend, register `https://YOUR_DOMAIN/api/hooks/resend` for `email.delivered`, `email.bounced`, `email.failed`, and `email.complained`, then set RESEND_WEBHOOK_SECRET. The endpoint verifies the raw-body Svix signature and deduplicates event IDs. Provider acceptance is shown as ACCEPTED; DELIVERED is set only from a signed delivery event. Local captures never claim external delivery.

## Operations

Runtime logs are structured JSON with request IDs, route, response code, duration and safe error codes. Bodies, tokens, keys and document contents are not logged. Vercel Runtime Logs/Observability collect the API/cron logs centrally; configure retention or a log drain for your requirements. Redis also shares auth/AI request limits across function instances; unavailable rate-limit storage fails closed. The Workflows view contains tenant-scoped provider usage, review decisions, workflow attempts and recent worker heartbeat. Database and Redis backups must be enabled in their provider consoles.

The supplied configuration is source-validated and tested locally. A Vercel build/deployment and live provider delivery still require the user's account and credentials and must be verified after setup.

Sources: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Securing and managing cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests).
