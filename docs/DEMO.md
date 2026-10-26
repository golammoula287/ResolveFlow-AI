# Synthetic demo runbook

Run `npm run dev:local`, then in another shell run `npm run demo:seed -- --confirm`. This creates fictional Northstar and Orchid workspaces without resetting existing records. Local-only default password: `ResolveFlow-Demo-2026!`. Remote seeding requires an explicit dedicated-demo opt-in and a separately configured strong password.

| Workspace | Owner | Agent | Viewer |
| --- | --- | --- | --- |
| Northstar | owner@northstar.example.test | agent@northstar.example.test | viewer@northstar.example.test |
| Orchid | owner@orchid.example.test | agent@orchid.example.test | viewer@orchid.example.test |

1. Sign in as Northstar owner. Inspect the inbox, filter/search tickets, assign one, add an internal note and update its status.
2. Open Knowledge base. Inspect the approved fictional policy. Upload a replacement as a new version and approve it; the old version is withdrawn automatically.
3. For live AI, configure Groq and generate a ticket draft. Without credentials, use **Write manual response**, find a policy passage, and submit a clearly human-written draft. Do not present a manual response as generated AI.
4. Open Review queue. Inspect evidence, edit the response, confirm the source check and approve the current version. History preserves previous versions and decisions.
5. Queue approved delivery with explicit confirmation. In local mode, inspect Workflows and the capture file: it is not an email. In configured Resend mode, use a controlled synthetic/test recipient and confirm acceptance/delivery through signed provider events.
6. Enable the priority rule, queue an escalation, and inspect its actual run and audit events. Incoming signed ticket webhooks can be demonstrated using the signing procedure in OPERATIONS.md.
7. Sign in as the viewer in another session: write controls are absent and protected writes fail. Sign in as Orchid: Northstar tickets/documents/jobs are not accessible.
8. Inspect measured provider activity, review counts, attempts and the retrieval-only evaluation report. Null metrics mean unavailable; they are not replaced with invented numbers.

`npm run demo:capture` records a roughly 90–120 second browser walkthrough and screenshots into docs/artifacts using disposable synthetic data. Captions explicitly disclose human-written responses, local delivery capture, and unverified live provider behavior. It never calls a paid model or sends external mail.

Portfolio evidence should distinguish implemented and locally verified behavior from live Groq/email and Vercel deployment results. Never claim passed remote CI or production AI accuracy from the supplied local evidence.

To populate an existing account's workspace without creating users or changing passwords:

```sh
npm run demo:workspace -- --email YOUR_ACCOUNT_EMAIL --confirm
```

For an intentionally selected hosted database, also pass `--allow-remote`. The account must own exactly one workspace. This command preserves existing records and adds 12 labelled fictional tickets, five approved fictional policy documents and three human-written drafts awaiting review. Repeated runs skip the existing seed records. It creates no AI runs, delivery jobs or outgoing emails. Demo customer addresses use the reserved `example.test` domain. Document approval is a disclosed seed setup operation recorded as `demo.document_seeded` in the audit log.
