import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../apps/api/src/app.js";
import { groqProvider } from "../apps/api/src/ai.js";
const raw = await readFile("evaluation/dataset.json", "utf8");
const hash = createHash("sha256").update(raw).digest("hex");
if (hash !== (await readFile("evaluation/dataset.sha256", "utf8")).trim())
  throw Error(
    "Frozen evaluation dataset changed. Create a new version before running.",
  );
const data = JSON.parse(raw);
const live = process.argv.includes("--live");
if (live && !process.env.GROQ_API_KEY)
  throw Error("Live evaluation requires server-side GROQ_API_KEY");
const db = new PrismaClient();
const secret = "evaluation-secret-with-at-least-32-characters",
  origin = "http://localhost:5173";
const app = createApp(db, {
  secret,
  origin,
  aiRequestLimit:100,
  ai: live
    ? groqProvider(
        process.env.GROQ_API_KEY!,
        process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      )
    : undefined,
});
const workspaces: string[] = [],
  users: string[] = [];
const outcomes: any[] = [];
try {
  const cookies: string[] = [];
  for (let i = 0; i < 2; i++) {
    const u = await db.user.create({
      data: {
        email: `eval-${i}-${randomUUID()}@example.test`,
        name: "Evaluation fixture",
        passwordHash: "not-a-login-hash",
        memberships: {
          create: {
            role: "OWNER",
            workspace: { create: { name: "Frozen evaluation " + i } },
          },
        },
      },
      include: { memberships: true },
    });
    users.push(u.id);
    workspaces.push(u.memberships[0].workspaceId);
    cookies.push("rf_session=" + jwt.sign({ sub: u.id }, secret));
  }
  const ids: Record<string, string> = {};
  for (const policy of data.policies) {
    const doc = await db.knowledgeDocument.create({
      data: {
        workspaceId: workspaces[0],
        title: policy.slug,
        filename: policy.slug + ".txt",
        contentHash: createHash("sha256").update(policy.content).digest("hex"),
        approved: true,
        createdBy: users[0],
        chunks: { create: { ordinal: 0, content: policy.content } },
      },
    });
    ids[policy.slug] = doc.id;
  }
  const foreign = await db.knowledgeDocument.create({
    data: {
      workspaceId: workspaces[1],
      title: "ORCHID secret",
      filename: "secret.txt",
      contentHash: "synthetic",
      approved: true,
      createdBy: users[1],
      chunks: {
        create: {
          ordinal: 0,
          content:
            "ORCHID tenant secret policy: fictional private billing evidence.",
        },
      },
    },
  });
  for (const c of data.cases) {
    const start = Date.now();
    const base = "/api/workspaces/" + workspaces[0];
    const result = await request(app)
      .get(base + "/documents/search")
      .set("Cookie", cookies[0])
      .query({ q: c.question });
    const items = result.body.items ?? [];
    const outcome: any = {
      id: c.id,
      category: c.category,
      expected: c.expectedBehavior,
      retrievalHit: c.expectedSource
        ? items.some((p: any) => p.documentId === ids[c.expectedSource])
        : null,
      foreignLeak: items.some((p: any) => p.documentId === foreign.id),
      latencyMs: Date.now() - start,
      modelStatus: "NOT_RUN",
      humanGrade: null,
    };
    if (c.attack === "cross-tenant") {
      const probe = await request(app)
        .get(base + "/documents/" + foreign.id)
        .set("Cookie", cookies[0]);
      outcome.authorizationPass = probe.status === 404 && !outcome.foreignLeak;
    }
    if (live) {
      const ticket = await db.ticket.create({
        data: {
          workspaceId: workspaces[0],
          subject: c.question,
          customerEmail: "synthetic@example.test",
          messages: { create: { body: c.question, authorId: users[0] } },
        },
      });
      const draft = await request(app)
        .post(base + "/tickets/" + ticket.id + "/drafts")
        .set("Origin", origin)
        .set("Cookie", cookies[0])
        .send({});
      outcome.modelStatus = draft.status === 201 ? draft.body.status : "ERROR";
      outcome.providerHttpStatus = draft.status;
      outcome.body = draft.body.body ?? "";
      outcome.reason = draft.body.reason ?? draft.body.error ?? null;
      outcome.citations = draft.body.citations ?? [];
    }
    outcomes.push(outcome);
  }
  const runs = await db.aiRun.findMany({
    where: { workspaceId: workspaces[0] },
  });
  const supported = outcomes.filter((o) => o.category === "supported");
  const isolation = outcomes.filter((o) => o.authorizationPass !== undefined);
  const report = {
    datasetVersion: data.version,
    datasetHash: hash,
    mode: live ? "live-groq" : "retrieval-only",
    model: live ? process.env.GROQ_MODEL || "openai/gpt-oss-20b" : null,
    recordedAt: new Date().toISOString(),
    caseCount: outcomes.length,
    summary: {
      retrievalHits: supported.filter((o) => o.retrievalHit).length,
      retrievalTotal: supported.length,
      isolationPassed: isolation.filter((o) => o.authorizationPass).length,
      isolationTotal: isolation.length,
      foreignLeaks: outcomes.filter((o) => o.foreignLeak).length,
      inputTokens: runs.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
      outputTokens: runs.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
      costUsd: null,
      modelQuality: "HUMAN_GRADING_REQUIRED",
      productionAccuracyClaim: false,
    },
    outcomes,
  };
  await mkdir("evaluation/reports", { recursive: true });
  await writeFile(
    "evaluation/reports/latest.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
