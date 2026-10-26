# Operations and recovery

## Startup and readiness

Local: `npm run dev:local` starts persistent PostgreSQL, persistent local Redis, API, frontend and worker. It defaults to local delivery capture when the prepared local environment is used. Capture files are written under `.local/outbox`; they are real local artifacts, not email delivery.

Production on Vercel: follow VERCEL.md. `/api/health` verifies database access. A recent worker heartbeat and job outcomes are visible in Workflows. A missing heartbeat indicates no recent worker/cron invocation; it does not prove an infrastructure outage. Watch failed jobs, provider errors, and workflow latency in structured logs and the Operations view.

## Retry behavior

PostgreSQL stores each requested action before Redis dispatch. Dispatcher polling recovers pending rows after Redis or process interruptions. Jobs use stable queue IDs and an explicit generation for authorized retries. Each attempt rechecks workspace membership, the exact approved response version, reviewer access, recipient, source approval and body hash. Mutations and source withdrawal serialize against delivery on the workspace row.

Transient failures retry three times with exponential backoff. Known permanent failures cancel the job. FAILED jobs can be retried explicitly from Workflows while still within the delivery provider's idempotency window. Do not manually remove queue keys or change job payloads to force an external action.

A worker crash after an external provider accepts but before the database commits is inherently ambiguous. Retries use the same Resend idempotency key within the retention window. After 23 hours from first attempt, the app marks the job UNCERTAIN and will not retry automatically. Inspect the provider using the delivery ID/idempotency key, reconcile the actual outcome, and retain the audit evidence. Never mark an unknown outcome delivered or create a new delivery just to bypass this check.

Changing a draft after queueing invalidates the current approval; a worker that has not sent it cancels. If delivery already completed, the external action cannot be undone by editing. The sender and recipient are captured at queue time. Only explicitly confirmed queue requests can create delivery jobs.

## Database changes and rollback

Back up PostgreSQL before a release. Apply additive migrations with `npm run db:migrate` using the direct/migration connection recommended by the database provider. Verify application and tenant-isolation checks before enabling delivery. Do not run development migrate-reset commands against production.

Rollback application code only when compatible with the applied schema; retain additive columns/tables and use a forward correction migration when necessary. Restore backups into a separate database first and verify data before switching traffic. Redis persistence/noeviction and database backups should be monitored through their providers.

## Webhook signing

Ticket endpoint: `/api/hooks/:workspaceId/tickets`, JSON body `{subject,customerEmail,body,priority?}`. Enable in Workflows, reveal the workspace signing key as owner, then send:

- `x-rf-timestamp`: current Unix seconds, within five minutes.
- `x-rf-event-id`: UUID, retained as the duplicate key.
- `x-rf-signature`: lowercase hex HMAC-SHA256 of `timestamp + '.' + eventId + '.' + rawBody`, signed with the revealed workspace key.

The signature binds the event ID and exact body. A duplicate event with the same body returns the original ticket; changing the body under the same ID is rejected. Timestamp/signature failures do not create records. The global signing secret is never returned; workspace keys are derived and revealed only to owners. Rotate the master secret to invalidate all derived keys and update integrations.

## Release check

Run `npm run release:check`, plus live Groq evaluation and manual grading when credentials are available. Verify actual provider/domain configuration with synthetic recipients. Never substitute local capture or mocked provider tests for live email/AI validation. See evaluation/RUBRIC.md for thresholds and limitations.
