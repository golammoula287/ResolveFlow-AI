# Local verification — 2026-10-26

Completed against Node 24 with disposable PostgreSQL and real Redis 7.2.7:

| Check | Observed result |
| --- | --- |
| Prisma client generation | Passed |
| Frontend/API production build | Passed |
| Migration application | All five migrations applied |
| API/unit/PostgreSQL/Redis suite | 22 passed, zero failed, zero skipped |
| Chromium browser suite | Five passed |
| Combined release:check | Exit code 0 |
| Frozen retrieval evaluation | 50 cases processed; 20/20 supported-source hits; 5/5 direct isolation probes denied; zero foreign passages |
| Vercel function source bundle | Bundled successfully with esbuild; not an actual Vercel build |
| Captioned demo recording | Passed; measured video duration 92.12 seconds |
| Persistent local setup | Migrated, worker started, synthetic accounts seeded; API health ok and frontend HTTP 200 |
| Latest dependency installation audit | Zero reported vulnerabilities |
| Whitespace check | git diff --check passed |

Tests include real worker retry/backoff and capture files, duplicate requests, lost/stale approval protection, source invalidation, uncertain-send cutoff, signed/deduplicated webhook events, versioned review races, document replacement and tenant boundaries. Expected injected transient errors appear in the worker test log and do not indicate a failed suite.

The model/provider contract tests use explicit doubles. The recorded demo uses a human-written response and local file capture. The retrieval-only evaluation contains no generated answers or human quality grades. Remote CI, hosted Vercel execution, live Groq quality, external email acceptance/delivery, external backups and independent live review are unverified. No paid calls, external messages or public publication occurred.

## Homepage update

Production build passed after the public-home/auth-path change. All seven Chromium workflows passed: public desktop/mobile landing pages, browser history and CTAs, signed-in home-to-workspace navigation, login/logout, and the existing inbox, knowledge, review and delivery flows. No backend changes were made in this update; the previous 22 API/database/Redis test result remains the last recorded backend run.
