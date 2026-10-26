# ResolveFlow AI — portfolio evidence

Suggested title: **ResolveFlow AI — Multi-Tenant Customer Support SaaS with Grounded Drafts and Workflow Automation**

A support workspace built with React, TypeScript, Express, PostgreSQL and Prisma. It enforces workspace membership and roles, retrieves approved knowledge for Groq drafts, preserves versioned human decisions, and processes approved delivery through a durable PostgreSQL outbox and BullMQ/Redis workers. Signed ticket and delivery webhooks carry real events into the audit trail.

Local engineering evidence includes database tenant-isolation tests, exact-version approval/concurrency tests, provider contract tests, real Redis retry/idempotency tests, and browser workflows for knowledge, tickets, review and local delivery capture. The retrieval-only frozen evaluation report records measured outcomes separately from ungraded model quality.

The captured walkthrough uses synthetic organizations, a clearly human-written response and real local file capture. It is not evidence of a live Groq answer, an externally delivered email or a deployed Vercel service. Replace or supplement those scenes with verified live-provider and deployment evidence before advertising a live advanced AI demo.

Artifacts: `docs/artifacts/knowledge.png`, `inbox.png`, `approval.png`, `workflows.png`, `audit.png`, and `walkthrough.webm`. Read DEMO.md for the complete reproducible scenario and VERCEL.md for hosting configuration. Nothing is published by these scripts.
