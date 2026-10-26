import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "./app.js";
import { ServiceError, type AiProvider } from "./ai.js";
test(
  "database: authorized knowledge, search, embeddings, grounded drafts and stale sources",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const secret = "knowledge-test-secret-with-at-least-32-chars",
      origin = "http://localhost:5173";
    const suffix = randomUUID();
    const workspaces: string[] = [],
      users: string[] = [];
    let mode = "supported",
      calls = 0;
    // Provider double only for deterministic integration coverage; no AI quality claim.
    const provider: AiProvider = {
      draftModel: "test-double-model",
      embeddingModel: "test-double-embedding",
      async embed(texts) {
        calls++;
        return {
          vectors: texts.map(() => [1, 0]),
          usage: { inputTokens: 10, outputTokens: 0 },
        };
      },
      async answer(_question, passages) {
        calls++;
        if (mode === "failed")
          throw new ServiceError(
            502,
            "PROVIDER_UNAVAILABLE",
            "Provider unavailable",
          );
        const p = passages[0];
        return {
          answer: {
            abstain: mode === "abstain",
            reason: mode === "abstain" ? "Conflicting policy" : "",
            claims:
              mode === "abstain"
                ? []
                : [
                    {
                      text: "Refunds are available within 30 days.",
                      chunkId: mode === "foreign" ? "foreign-chunk" : p.id,
                      quote: "Refunds are available within 30 days.",
                    },
                  ],
          },
          usage: { inputTokens: 22, outputTokens: 12 },
        };
      },
    };
    const app = createApp(db, { secret, origin, ai: provider });
    const noAi = createApp(db, { secret, origin });
    try {
      const cookies: string[] = [];
      for (let i = 0; i < 2; i++) {
        const u = await db.user.create({
          data: {
            email: `knowledge-${i}-${suffix}@example.test`,
            name: "Knowledge test",
            passwordHash: "not-a-login-password",
            memberships: {
              create: {
                role: "OWNER",
                workspace: { create: { name: "Knowledge " + i } },
              },
            },
          },
          include: { memberships: true },
        });
        users.push(u.id);
        workspaces.push(u.memberships[0].workspaceId);
        cookies.push("rf_session=" + jwt.sign({ sub: u.id }, secret));
      }
      const wa = workspaces[0],
        wb = workspaces[1],
        a = cookies[0],
        b = cookies[1];
      const req = (
        method: "get" | "post" | "patch" | "delete",
        path: string,
        cookie = a,
      ) =>
        request(app)[method](path).set("Cookie", cookie).set("Origin", origin);
      const ticket = await req("post", `/api/workspaces/${wa}/tickets`).send({
        subject: "Refund request",
        customerEmail: "customer@example.test",
        body: "Can I request a refund?",
      });
      assert.equal(ticket.status, 201);
      const id = ticket.body.id;
      const empty = await req(
        "post",
        `/api/workspaces/${wa}/tickets/${id}/drafts`,
      ).send({});
      assert.equal(empty.status, 201);
      assert.equal(empty.body.status, "ABSTAINED");
      assert.equal(calls, 0);
      for (const data of [
        { title: "Bad Unicode", filename: "bad.txt", content: "bad\ud800text" },
        { title: "Bad", filename: "policy.pdf", content: "text" },
        { title: "Bad", filename: "policy.txt", content: "bad\u0000content" },
        { title: "Bad", filename: "policy.txt", content: "a".repeat(40001) },
      ])
        assert.equal(
          (await req("post", `/api/workspaces/${wa}/documents`).send(data))
            .status,
          400,
        );
      assert.equal(
        (
          await req("post", `/api/workspaces/${wa}/documents`).send({
            title: "Too large",
            filename: "large.txt",
            content: "a".repeat(70000),
          })
        ).status,
        413,
      );
      const document = await req(
        "post",
        `/api/workspaces/${wa}/documents`,
      ).send({
        title: "Refund policy",
        filename: "refunds.md",
        content:
          "Refunds are available within 30 days. Contact support with your invoice.",
      });
      assert.equal(document.status, 201);
      const doc = document.body.id;
      assert.equal(
        (await req("get", `/api/workspaces/${wa}/documents/search?q=refund`))
          .body.items.length,
        0,
      );
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/documents/${doc}`, b)).status,
        404,
      );
      assert.equal(
        (
          await req("patch", `/api/workspaces/${wb}/documents/${doc}`, b).send({
            approved: true,
          })
        ).status,
        404,
      );
      assert.equal(
        (await req("post", `/api/workspaces/${wb}/documents/${doc}/index`, b))
          .status,
        404,
      );
      assert.equal(
        (await req("post", `/api/workspaces/${wb}/tickets/${id}/drafts`, b))
          .status,
        404,
      );
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/tickets/${id}/drafts`, b))
          .status,
        404,
      );
      await db.membership.update({
        where: { userId_workspaceId: { workspaceId: wa, userId: users[0] } },
        data: { role: "AGENT" },
      });
      assert.equal(
        (
          await req("patch", `/api/workspaces/${wa}/documents/${doc}`).send({
            approved: true,
          })
        ).status,
        403,
      );
      await db.membership.update({
        where: { userId_workspaceId: { workspaceId: wa, userId: users[0] } },
        data: { role: "OWNER" },
      });
      assert.equal(
        (
          await req("patch", `/api/workspaces/${wa}/documents/${doc}`).send({
            approved: true,
          })
        ).status,
        200,
      );
      const found = await req(
        "get",
        `/api/workspaces/${wa}/documents/search?q=refund`,
      );
      assert.equal(found.body.items[0].documentId, doc);
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/documents/search?q=refund`, b))
          .body.items.length,
        0,
      );
      const unavailable = await request(noAi)
        .post(`/api/workspaces/${wa}/tickets/${id}/drafts`)
        .set("Origin", origin)
        .set("Cookie", a)
        .send({});
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.code, "AI_NOT_CONFIGURED");
      assert.equal(
        (await req("post", `/api/workspaces/${wa}/documents/${doc}/index`))
          .status,
        200,
      );
      const indexed = await db.knowledgeChunk.findFirstOrThrow({
        where: { documentId: doc },
      });
      assert.deepEqual(indexed.embedding, [1, 0]);
      const semantic = await req(
        "get",
        `/api/workspaces/${wa}/documents/search?q=reimbursement&mode=semantic`,
      );
      assert.equal(semantic.body.items[0].documentId, doc);
      const draft = await req(
        "post",
        `/api/workspaces/${wa}/tickets/${id}/drafts`,
      ).send({});
      assert.equal(draft.status, 201);
      assert.equal(draft.body.status, "DRAFT");
      assert.equal(draft.body.citations[0].documentId, doc);
      const lexicalOnly = createApp(db, {
        secret,
        origin,
        ai: {
          ...provider,
          embeddingModel: null,
          async embed() {
            throw Error(
              "Embedding must not be called for Groq-style retrieval",
            );
          },
        },
      });
      const lexicalDraft = await request(lexicalOnly)
        .post(`/api/workspaces/${wa}/tickets/${id}/drafts`)
        .set("Origin", origin)
        .set("Cookie", a)
        .send({});
      assert.equal(lexicalDraft.status, 201);
      assert.equal(lexicalDraft.body.status, "DRAFT");
      const lexicalStatus = await request(lexicalOnly)
        .get(`/api/workspaces/${wa}/ai/status`)
        .set("Cookie", a);
      assert.equal(lexicalStatus.body.configured, true);
      assert.equal(lexicalStatus.body.embeddingsConfigured, false);
      assert.equal(
        (
          await request(lexicalOnly)
            .post(`/api/workspaces/${wa}/documents/${doc}/index`)
            .set("Cookie", a)
            .set("Origin", origin)
        ).status,
        503,
      );
      assert.equal(
        (
          await request(lexicalOnly)
            .get(
              `/api/workspaces/${wa}/documents/search?q=refund&mode=semantic`,
            )
            .set("Cookie", a)
        ).status,
        503,
      );
      mode = "foreign";
      const forged = await req(
        "post",
        `/api/workspaces/${wa}/tickets/${id}/drafts`,
      ).send({});
      assert.equal(forged.status, 502);
      assert.equal(forged.body.code, "UNSUPPORTED_CITATION");
      mode = "failed";
      assert.equal(
        (
          await req("post", `/api/workspaces/${wa}/tickets/${id}/drafts`).send(
            {},
          )
        ).status,
        502,
      );
      const failed = await db.aiRun.findMany({
        where: { workspaceId: wa, status: "FAILED" },
      });
      assert.equal(failed.length, 2);
      mode = "abstain";
      const abstain = await req(
        "post",
        `/api/workspaces/${wa}/tickets/${id}/drafts`,
      ).send({});
      assert.equal(abstain.body.status, "ABSTAINED");
      await db.membership.update({
        where: { userId_workspaceId: { workspaceId: wa, userId: users[0] } },
        data: { role: "VIEWER" },
      });
      assert.equal(
        (
          await req("post", `/api/workspaces/${wa}/documents`).send({
            title: "No",
            filename: "no.txt",
            content: "no",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req("post", `/api/workspaces/${wa}/tickets/${id}/drafts`).send(
            {},
          )
        ).status,
        403,
      );
      assert.equal(
        (await req("get", `/api/workspaces/${wa}/documents/search?q=refund`))
          .status,
        200,
      );
      await db.membership.update({
        where: { userId_workspaceId: { workspaceId: wa, userId: users[0] } },
        data: { role: "OWNER" },
      });
      assert.equal(
        (
          await req("patch", `/api/workspaces/${wa}/documents/${doc}`).send({
            approved: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            "get",
            `/api/workspaces/${wa}/documents/search?q=refund&mode=semantic`,
          )
        ).body.items.length,
        0,
      );
      const stale = await req(
        "get",
        `/api/workspaces/${wa}/tickets/${id}/drafts`,
      );
      const old = stale.body.find((d: any) => d.id === draft.body.id);
      assert.equal(old.sourcesAvailable, false);
      assert.equal(old.body, "");
      assert.deepEqual(old.citations, []);
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/ai/runs`, b)).body.length,
        0,
      );
      const revision = await req(
        "post",
        `/api/workspaces/${wa}/documents/${doc}/versions`,
      ).send({
        title: "Updated refund policy",
        filename: "refunds.md",
        content: "Refunds are available within 14 days.",
      });
      assert.equal(revision.status, 201);
      assert.equal(revision.body.version, 2);
      assert.equal(
        (await req("get", `/api/workspaces/${wa}/documents/${doc}/versions`))
          .body.length,
        2,
      );
      assert.equal(
        (
          await req("patch", `/api/workspaces/${wa}/documents/${doc}`).send({
            approved: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "patch",
            `/api/workspaces/${wa}/documents/${revision.body.id}`,
          ).send({ approved: true })
        ).status,
        200,
      );
      const passage = await db.knowledgeChunk.findFirstOrThrow({
        where: { documentId: revision.body.id },
      });
      const manual = await req(
        "post",
        `/api/workspaces/${wa}/tickets/${id}/manual-drafts`,
      ).send({
        body: "Please request a refund within 14 days.",
        citations: [{ chunkId: passage.id, quote: "within 14 days" }],
      });
      assert.equal(manual.status, 201);
      assert.equal(manual.body.origin, "HUMAN");
      assert.equal(
        await db.draftRevision.count({ where: { draftId: manual.body.id } }),
        1,
      );
      assert.ok(
        (await req("get", `/api/workspaces/${wa}/documents/failures`)).body
          .length >= 4,
      );
      assert.equal(
        (await req("delete", `/api/workspaces/${wa}/documents/${doc}`)).status,
        200,
      );
      assert.equal(
        await db.knowledgeChunk.count({ where: { documentId: doc } }),
        0,
      );
    } finally {
      await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  },
);
