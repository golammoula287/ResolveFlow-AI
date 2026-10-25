import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "./app.js";
test(
  "database: immutable revisions, exact-version review, source invalidation and tenant isolation",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const secret = "review-test-secret-with-at-least-32-chars",
      origin = "http://localhost:5173";
    const app = createApp(db, { secret, origin });
    const suffix = randomUUID(),
      users: string[] = [],
      workspaces: string[] = [];
    try {
      const cookies: string[] = [];
      for (let i = 0; i < 2; i++) {
        const u = await db.user.create({
          data: {
            email: `reviews-${i}-${suffix}@example.test`,
            name: "Review tester " + i,
            passwordHash: "test-fixture-not-login",
            memberships: {
              create: {
                role: "OWNER",
                workspace: { create: { name: "Reviews " + i } },
              },
            },
          },
          include: { memberships: true },
        });
        users.push(u.id);
        workspaces.push(u.memberships[0].workspaceId);
        cookies.push("rf_session=" + jwt.sign({ sub: u.id }, secret));
      }
      const [wa, wb] = workspaces,
        [owner, outsider] = cookies;
      const req = (
        method: "get" | "post" | "patch" | "delete",
        path: string,
        cookie = owner,
      ) =>
        request(app)[method](path).set("Cookie", cookie).set("Origin", origin);
      const prefix = `/api/workspaces/${wa}`;
      const source = await db.knowledgeDocument.create({
        data: {
          workspaceId: wa,
          title: "Test fixture policy",
          filename: "fixture.txt",
          contentHash: "test-fixture",
          createdBy: users[0],
          approved: true,
          chunks: {
            create: {
              ordinal: 0,
              content: "Refunds are available within 30 days.",
            },
          },
        },
        include: { chunks: true },
      });
      const citations = [
        {
          chunkId: source.chunks[0].id,
          documentId: source.id,
          title: source.title,
          version: 1,
          quote: "within 30 days",
          claim: "You can request a refund within 30 days.",
        },
      ];
      const ticket = await db.ticket.create({
        data: {
          workspaceId: wa,
          subject: "Review fixture",
          customerEmail: "fixture@example.test",
        },
      });
      async function seed(status = "DRAFT") {
        return db.$transaction(async (tx) => {
          const d = await tx.draft.create({
            data: {
              workspaceId: wa,
              ticketId: ticket.id,
              status,
              body:
                status === "ABSTAINED"
                  ? ""
                  : "You can request a refund within 30 days.",
              citations: status === "ABSTAINED" ? [] : citations,
              createdBy: users[0],
            },
          });
          await tx.draftRevision.create({
            data: {
              workspaceId: wa,
              draftId: d.id,
              version: 1,
              body: d.body,
              citations: d.citations!,
              changedBy: users[0],
            },
          });
          return d;
        });
      }
      const draft = await seed(),
        path = prefix + "/drafts/" + draft.id;
      assert.equal((await req("get", prefix + "/drafts")).body.total, 1);
      assert.equal(
        (await req("get", `/api/workspaces/${wb}/drafts`, outsider)).body.total,
        0,
      );
      for (const method of ["get", "patch"] as const) {
        const result = await req(
          method,
          `/api/workspaces/${wb}/drafts/${draft.id}`,
          outsider,
        ).send(
          method === "patch"
            ? { body: "Tampered", expectedVersion: 1 }
            : undefined,
        );
        assert.equal(result.status, 404);
      }
      assert.equal(
        (
          await req(
            "post",
            `/api/workspaces/${wb}/drafts/${draft.id}/review`,
            outsider,
          ).send({
            action: "APPROVE",
            expectedVersion: 1,
            confirmEvidence: true,
          })
        ).status,
        404,
      );
      await db.membership.update({
        where: { userId_workspaceId: { userId: users[0], workspaceId: wa } },
        data: { role: "VIEWER" },
      });
      assert.equal(
        (await req("patch", path).send({ body: "No", expectedVersion: 1 }))
          .status,
        403,
      );
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "APPROVE",
            expectedVersion: 1,
            confirmEvidence: true,
          })
        ).status,
        403,
      );
      assert.equal((await req("get", path)).status, 200);
      await db.membership.update({
        where: { userId_workspaceId: { userId: users[0], workspaceId: wa } },
        data: { role: "AGENT" },
      });
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "APPROVE",
            expectedVersion: 1,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "APPROVE",
            expectedVersion: 2,
            confirmEvidence: true,
          })
        ).status,
        409,
      );
      const approved = await req("post", path + "/review").send({
        action: "APPROVE",
        expectedVersion: 1,
        confirmEvidence: true,
      });
      assert.equal(approved.status, 200);
      assert.equal(approved.body.approvedVersion, 1);
      assert.equal(approved.body.reviewedBy, users[0]);
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "APPROVE",
            expectedVersion: 1,
            confirmEvidence: true,
          })
        ).status,
        409,
      );
      const edited = await req("patch", path).send({
        body: "Please request a refund within 30 days.",
        expectedVersion: 1,
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.version, 2);
      assert.equal(edited.body.status, "DRAFT");
      assert.equal(edited.body.approvedVersion, null);
      assert.equal(edited.body.reviewedBy, null);
      assert.equal(
        (
          await req("patch", path).send({
            body: "Outdated edit",
            expectedVersion: 1,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "REJECT",
            expectedVersion: 2,
            reason: "  ",
          })
        ).status,
        400,
      );
      const rejected = await req("post", path + "/review").send({
        action: "REJECT",
        expectedVersion: 2,
        reason: "Needs a clearer explanation",
      });
      assert.equal(rejected.status, 200);
      assert.equal(rejected.body.status, "REJECTED");
      assert.equal(
        rejected.body.rejectionReason,
        "Needs a clearer explanation",
      );
      const fixed = await req("patch", path).send({
        body: "A refund request is eligible within 30 days.",
        expectedVersion: 2,
      });
      assert.equal(fixed.body.version, 3);
      assert.equal(fixed.body.status, "DRAFT");
      const decisions = await Promise.all([
        req("post", path + "/review").send({
          action: "APPROVE",
          expectedVersion: 3,
          confirmEvidence: true,
        }),
        req("post", path + "/review").send({
          action: "REJECT",
          expectedVersion: 3,
          reason: "Concurrent decision",
        }),
      ]);
      assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
      const current = await req("get", path);
      assert.equal(current.body.revisions.length, 3);
      assert.equal(current.body.revisions[2].body, draft.body);
      const originalApproval = current.body.reviews.find(
        (r: any) => r.action === "APPROVED" && r.version === 1,
      );
      assert.equal(
        originalApproval.bodyHash,
        createHash("sha256").update(draft.body).digest("hex"),
      );
      assert.equal(originalApproval.actorName, "Review tester 0");
      // Ensure a currently approved draft exists before exercising source invalidation.
      if (current.body.status === "REJECTED") {
        await req("patch", path).send({
          body: "Refund requests are available within 30 days.",
          expectedVersion: 3,
        });
        await req("post", path + "/review").send({
          action: "APPROVE",
          expectedVersion: 4,
          confirmEvidence: true,
        });
      }
      await db.membership.update({
        where: { userId_workspaceId: { userId: users[0], workspaceId: wa } },
        data: { role: "OWNER" },
      });
      assert.equal(
        (
          await req("patch", prefix + "/documents/" + source.id).send({
            approved: false,
          })
        ).status,
        200,
      );
      const invalidated = await req("get", path);
      assert.equal(invalidated.body.status, "DRAFT");
      assert.equal(invalidated.body.approvedVersion, null);
      assert.equal(invalidated.body.body, "");
      assert.equal(invalidated.body.sourcesAvailable, false);
      assert.ok(invalidated.body.revisions.every((r: any) => r.body === ""));
      assert.ok(
        invalidated.body.reviews.some(
          (r: any) =>
            r.action === "INVALIDATED" && r.reason === "Cited source withdrawn",
        ),
      );
      assert.equal(
        (
          await req("post", path + "/review").send({
            action: "APPROVE",
            expectedVersion: invalidated.body.version,
            confirmEvidence: true,
          })
        ).status,
        409,
      );
      await req("patch", prefix + "/documents/" + source.id).send({
        approved: true,
      });
      assert.equal((await req("get", path)).body.status, "DRAFT");
      await req("post", path + "/review").send({
        action: "APPROVE",
        expectedVersion: invalidated.body.version,
        confirmEvidence: true,
      });
      await req("delete", prefix + "/documents/" + source.id);
      assert.equal((await req("get", path)).body.status, "DRAFT");
      const abstained = await seed("ABSTAINED");
      assert.equal(
        (
          await req(
            "post",
            prefix + "/drafts/" + abstained.id + "/review",
          ).send({
            action: "APPROVE",
            expectedVersion: 1,
            confirmEvidence: true,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req("patch", prefix + "/drafts/" + abstained.id).send({
            body: "Invented policy",
            expectedVersion: 1,
          })
        ).status,
        409,
      );
      const audit = await db.auditEvent.findMany({
        where: { workspaceId: wa, resourceId: draft.id },
      });
      assert.ok(audit.some((e) => e.action === "draft.approved"));
      assert.ok(audit.some((e) => e.action === "draft.edited"));
      assert.ok(audit.some((e) => e.action === "draft.rejected"));
      assert.ok(audit.some((e) => e.action === "draft.approval_invalidated"));
    } finally {
      await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  },
);
