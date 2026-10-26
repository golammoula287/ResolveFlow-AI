import { Webhook } from "svix";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "./app.js";
import {
  hashBody,
  localDelivery,
  resendDelivery,
  JobError,
  type DeliveryProvider,
} from "./delivery.js";
import { processJob, startWorkflows } from "./jobs.js";
import { hookKey } from "./workflow-routes.js";
test("Resend uses a stable idempotency key and never claims mailbox delivery", async () => {
  const provider = resendDelivery("test-key", "test@example.test", (async (
    url: any,
    options: any,
  ) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers["Idempotency-Key"], "resolveflow-message-id");
    assert.deepEqual(JSON.parse(options.body).to, ["recipient@example.test"]);
    return Response.json({ id: "receipt" });
  }) as typeof fetch);
  const result = await provider.send({
    id: "message-id",
    recipient: "recipient@example.test",
    subject: "Subject",
    body: "Body",
  });
  assert.equal(result.outcome, "ACCEPTED");
  const rejected = resendDelivery(
    "test",
    "a@example.test",
    (async () => new Response("", { status: 422 })) as typeof fetch,
  );
  await assert.rejects(
    () =>
      rejected.send({
        id: "x",
        recipient: "b@example.test",
        subject: "s",
        body: "b",
      }),
    (e: unknown) => e instanceof JobError && e.permanent,
  );
});
test(
  "database + Redis: durable delivery, retry/backoff, duplicates, revoked approval, automation and signed webhooks",
  { skip: !process.env.TEST_DATABASE_URL || !process.env.REDIS_URL },
  async () => {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const dir = await mkdtemp(join(tmpdir(), "rf-capture-"));
    const secret = "workflow-test-secret-at-least-32-characters",
      hookSecret = "webhook-master-secret-at-least-32-characters",
      origin = "http://localhost:5173";
    const workspaces: string[] = [],
      users: string[] = [];
    let service: ReturnType<typeof startWorkflows> | undefined;
    const capture = localDelivery(dir);
    let calls = 0;
    const provider: DeliveryProvider = {
      name: "local",
      async send(message) {
        calls++;
        if (calls <= 2) throw new JobError("TRANSIENT_TEST_FAILURE");
        return capture.send(message);
      },
    };
    const app = createApp(db, {
      secret,
      origin,
      resendWebhookSecret:
        "whsec_" +
        Buffer.from("test-resend-signature-secret-value").toString("base64"),
      workflows: {
        delivery: provider,
        redisConfigured: true,
        webhookSecret: hookSecret,
      },
    });
    try {
      const cookies: string[] = [];
      for (let i = 0; i < 2; i++) {
        const user = await db.user.create({
          data: {
            email: `worker-${i}-${randomUUID()}@example.test`,
            name: "Worker tester",
            passwordHash: "test-fixture",
            memberships: {
              create: {
                role: "OWNER",
                workspace: { create: { name: "Worker fixture" } },
              },
            },
          },
          include: { memberships: true },
        });
        users.push(user.id);
        workspaces.push(user.memberships[0].workspaceId);
        cookies.push("rf_session=" + jwt.sign({ sub: user.id }, secret));
      }
      const [wa, wb] = workspaces;
      const prefix = "/api/workspaces/" + wa;
      const req = (
        method: "get" | "post" | "put" | "patch",
        path: string,
        cookie = cookies[0],
      ) =>
        request(app)[method](path).set("Origin", origin).set("Cookie", cookie);
      const doc = await db.knowledgeDocument.create({
        data: {
          workspaceId: wa,
          title: "Worker fixture policy",
          filename: "fixture.txt",
          createdBy: users[0],
          contentHash: "fixture",
          approved: true,
          chunks: {
            create: { ordinal: 0, content: "Refunds within 30 days." },
          },
        },
        include: { chunks: true },
      });
      const ticket = await db.ticket.create({
        data: {
          workspaceId: wa,
          subject: "Synthetic workflow request",
          customerEmail: "test@example.test",
          createdAt: new Date(Date.now() - 48 * 3600000),
        },
      });
      const citations = [
        {
          documentId: doc.id,
          chunkId: doc.chunks[0].id,
          title: doc.title,
          version: 1,
          quote: "within 30 days",
          claim: "Refunds within 30 days.",
        },
      ];
      async function approvedDraft() {
        return db.$transaction(async (tx) => {
          const d = await tx.draft.create({
            data: {
              workspaceId: wa,
              ticketId: ticket.id,
              status: "APPROVED",
              body: "Refunds within 30 days.",
              citations,
              createdBy: users[0],
              approvedVersion: 1,
              reviewedBy: users[0],
              reviewedAt: new Date(),
            },
          });
          await tx.draftRevision.create({
            data: {
              workspaceId: wa,
              draftId: d.id,
              version: 1,
              body: d.body,
              citations,
              changedBy: users[0],
            },
          });
          await tx.draftReview.create({
            data: {
              workspaceId: wa,
              draftId: d.id,
              version: 1,
              action: "APPROVED",
              actorId: users[0],
              bodyHash: hashBody(d.body),
            },
          });
          return d;
        });
      }
      const d = await approvedDraft(),
        path = prefix + "/drafts/" + d.id + "/delivery";
      assert.equal(
        (await req("post", path).send({ expectedVersion: 1 })).status,
        400,
      );
      assert.equal(
        (
          await req(
            "post",
            `/api/workspaces/${wb}/drafts/${d.id}/delivery`,
            cookies[1],
          ).send({ expectedVersion: 1, confirmSend: true })
        ).status,
        404,
      );
      const queued = await req("post", path).send({
        expectedVersion: 1,
        confirmSend: true,
      });
      assert.equal(queued.status, 202);
      const jobId = queued.body.jobId;
      const dup = await req("post", path).send({
        expectedVersion: 1,
        confirmSend: true,
      });
      assert.equal(dup.status, 200);
      assert.equal(dup.body.jobId, jobId);
      service = startWorkflows(db, process.env.REDIS_URL!, provider, {
        pollMs: 50,
        backoffMs: 10,
        heartbeatId: "integration",
      });
      await service.ready;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (
          (await db.workflowJob.findUniqueOrThrow({ where: { id: jobId } }))
            .status === "SUCCEEDED"
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const job = await db.workflowJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      assert.equal(job.status, "SUCCEEDED");
      assert.equal(job.attempts, 3);
      assert.equal(calls, 3);
      assert.equal(await db.jobAttempt.count({ where: { jobId } }), 3);
      const delivery = await db.delivery.findUniqueOrThrow({
        where: { jobId },
      });
      assert.equal(delivery.status, "LOCAL_CAPTURED");
      assert.equal(
        JSON.parse(await readFile(join(dir, delivery.id + ".json"), "utf8"))
          .body,
        d.body,
      );
      await processJob(db, wa, jobId, provider);
      assert.equal(calls, 3);
      assert.equal((await readdir(dir)).length, 1);
      await service.close();
      service = undefined;
      const stale = await approvedDraft();
      const staleJob = await req(
        "post",
        prefix + "/drafts/" + stale.id + "/delivery",
      ).send({ expectedVersion: 1, confirmSend: true });
      await req("patch", prefix + "/drafts/" + stale.id).send({
        body: "Edited policy response.",
        expectedVersion: 1,
      });
      await assert.rejects(() =>
        processJob(db, wa, staleJob.body.jobId, capture),
      );
      assert.equal(
        (
          await db.workflowJob.findUniqueOrThrow({
            where: { id: staleJob.body.jobId },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal((await readdir(dir)).length, 1);
      const uncertain = await approvedDraft();
      const uncertainJob = await req(
        "post",
        prefix + "/drafts/" + uncertain.id + "/delivery",
      ).send({ expectedVersion: 1, confirmSend: true });
      await db.workflowJob.update({
        where: { id: uncertainJob.body.jobId },
        data: { firstAttemptAt: new Date(Date.now() - 24 * 3600000) },
      });
      await assert.rejects(() =>
        processJob(db, wa, uncertainJob.body.jobId, capture),
      );
      assert.equal(
        (
          await db.workflowJob.findUniqueOrThrow({
            where: { id: uncertainJob.body.jobId },
          })
        ).status,
        "UNCERTAIN",
      );
      await req("put", prefix + "/automation").send({
        enabled: true,
        minAgeHours: 24,
      });
      const run = await req("post", prefix + "/automation/run");
      assert.equal(run.status, 202);
      await processJob(db, wa, run.body.id, capture);
      assert.equal(
        (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .priority,
        "HIGH",
      );
      await processJob(db, wa, run.body.id, capture);
      assert.equal(
        await db.auditEvent.count({
          where: {
            workspaceId: wa,
            resourceId: ticket.id,
            action: "ticket.escalated",
          },
        }),
        1,
      );
      await req("put", prefix + "/integrations/webhook").send({
        enabled: true,
      });
      const key = hookKey(hookSecret, wa),
        eventId = randomUUID(),
        timestamp = String(Math.floor(Date.now() / 1000)),
        payload = JSON.stringify({
          subject: "Webhook fixture",
          customerEmail: "hook@example.test",
          body: "Incoming request",
        });
      async function sendHook(
        body = payload,
        time = timestamp,
        signatureKey = key,
      ) {
        const signature = createHmac("sha256", signatureKey)
          .update(time + "." + eventId + "." + body)
          .digest("hex");
        return request(app)
          .post("/api/hooks/" + wa + "/tickets")
          .set("Content-Type", "application/json")
          .set("x-rf-timestamp", time)
          .set("x-rf-event-id", eventId)
          .set("x-rf-signature", signature)
          .send(body);
      }
      assert.equal((await sendHook()).status, 201);
      const duplicate = await sendHook();
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.duplicate, true);
      assert.equal(
        (await sendHook(payload.replace("Incoming", "Different"))).status,
        409,
      );
      assert.equal(
        (await sendHook(payload, String(Number(timestamp) - 600))).status,
        401,
      );
      assert.equal(
        (await sendHook(payload, timestamp, hookKey(hookSecret, wb))).status,
        401,
      );
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/workflows`, cookies[1])).body
          .total,
        0,
      );
      await db.delivery.update({
        where: { id: delivery.id },
        data: {
          provider: "resend",
          providerId: "test-resend-provider-id",
          status: "ACCEPTED",
        },
      });
      const signedBody = JSON.stringify({
          type: "email.delivered",
          data: { email_id: "test-resend-provider-id" },
        }),
        svixId = "msg_" + randomUUID(),
        signedAt = new Date(),
        svixSecret =
          "whsec_" +
          Buffer.from("test-resend-signature-secret-value").toString("base64");
      const signature = new Webhook(svixSecret).sign(
        svixId,
        signedAt,
        signedBody,
      );
      const sendReceipt = () =>
        request(app)
          .post("/api/hooks/resend")
          .set("Content-Type", "application/json")
          .set("svix-id", svixId)
          .set("svix-timestamp", String(Math.floor(signedAt.getTime() / 1000)))
          .set("svix-signature", signature)
          .send(signedBody);
      assert.equal((await sendReceipt()).status, 200);
      assert.equal((await sendReceipt()).status, 200);
      assert.equal(
        (await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } }))
          .status,
        "DELIVERED",
      );
      assert.equal(
        await db.webhookEvent.count({
          where: { workspaceId: wa, eventId: "resend-" + svixId },
        }),
        1,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/hooks/resend")
            .set("Content-Type", "application/json")
            .send(signedBody)
        ).status,
        401,
      );
      await db.membership.update({
        where: { userId_workspaceId: { userId: users[0], workspaceId: wa } },
        data: { role: "VIEWER" },
      });
      assert.equal(
        (
          await req("post", path).send({
            expectedVersion: 1,
            confirmSend: true,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req("put", prefix + "/automation").send({
            enabled: false,
            minAgeHours: 24,
          })
        ).status,
        403,
      );
    } finally {
      if (service) await service.close();
      await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
