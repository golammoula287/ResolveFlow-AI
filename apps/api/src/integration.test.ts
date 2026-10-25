import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "./app.js";
test(
  "database: two tenants, role changes, scoped mutations and atomic audit",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    const origin = "http://localhost:5173";
    const app = createApp(db, {
      origin,
      secret: "integration-secret-with-at-least-32-chars",
    });
    const suffix = randomUUID();
    const emailA = `a-${suffix}@example.test`,
      emailB = `b-${suffix}@example.test`;
    const a = request.agent(app),
      b = request.agent(app);
    const ids: string[] = [];
    try {
      for (const [agent, email] of [
        [a, emailA],
        [b, emailB],
      ] as const) {
        const r = await agent
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({
            email,
            password: "a-long-test-password-123",
            name: "Test",
            workspace: "Integration " + suffix,
          });
        assert.equal(r.status, 201);
      }
      const ua = await a.get("/api/me"),
        ub = await b.get("/api/me");
      const wa = ua.body.memberships[0].workspaceId,
        wb = ub.body.memberships[0].workspaceId;
      ids.push(wa, wb);
      const ticket = await a
        .post(`/api/workspaces/${wa}/tickets`)
        .set("Origin", origin)
        .send({
          subject: "Private billing question",
          customerEmail: "customer@example.test",
          body: "Please check my invoice.",
        });
      assert.equal(ticket.status, 201);
      const id = ticket.body.id;
      assert.equal((await b.get(`/api/workspaces/${wa}/tickets`)).status, 404);
      assert.equal(
        (await b.get(`/api/workspaces/${wb}/tickets/${id}`)).status,
        404,
      );
      assert.equal(
        (
          await b
            .patch(`/api/workspaces/${wb}/tickets/${id}`)
            .set("Origin", origin)
            .send({ status: "RESOLVED" })
        ).status,
        404,
      );
      assert.equal(
        (
          await b
            .post(`/api/workspaces/${wb}/tickets/${id}/messages`)
            .set("Origin", origin)
            .send({ body: "Injection" })
        ).status,
        404,
      );
      assert.equal(
        (await b.get(`/api/workspaces/${wb}/tickets?q=Private`)).body.total,
        0,
      );
      assert.equal(
        (await b.get(`/api/workspaces/${wb}/events`)).body.length,
        0,
      );
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/tickets/${id}`)
            .set("Origin", origin)
            .send({ assigneeId: ub.body.id })
        ).status,
        400,
      );
      await db.membership.update({
        where: { userId_workspaceId: { userId: ua.body.id, workspaceId: wa } },
        data: { role: "VIEWER" },
      });
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/tickets/${id}`)
            .set("Origin", origin)
            .send({ status: "RESOLVED" })
        ).status,
        403,
      );
      assert.equal(
        (await a.get(`/api/workspaces/${wa}/tickets/${id}`)).status,
        200,
      );
      await db.membership.update({
        where: { userId_workspaceId: { userId: ua.body.id, workspaceId: wa } },
        data: { role: "AGENT" },
      });
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/tickets/${id}`)
            .set("Origin", origin)
            .send({ status: "RESOLVED" })
        ).status,
        200,
      );
      assert.equal(
        (await db.ticket.findUniqueOrThrow({ where: { id } })).status,
        "RESOLVED",
      );
      const events = await db.auditEvent.findMany({
        where: { workspaceId: wa },
      });
      assert.deepEqual(events.map((e) => e.action).sort(), [
        "ticket.created",
        "ticket.updated",
      ]);
      // Owner-only administration and single-use, email-bound invitation lifecycle.
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/manage/members/${ua.body.id}`)
            .set("Origin", origin)
            .send({ role: "AGENT" })
        ).status,
        403,
      );
      await db.membership.update({
        where: { userId_workspaceId: { userId: ua.body.id, workspaceId: wa } },
        data: { role: "OWNER" },
      });
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/manage/members/${ua.body.id}`)
            .set("Origin", origin)
            .send({ role: "VIEWER" })
        ).status,
        409,
      );
      assert.equal(
        (
          await a
            .delete(`/api/workspaces/${wa}/manage/members/${ua.body.id}`)
            .set("Origin", origin)
        ).status,
        409,
      );
      const invite = await a
        .post(`/api/workspaces/${wa}/manage/invitations`)
        .set("Origin", origin)
        .send({ email: emailB, role: "VIEWER" });
      assert.equal(invite.status, 201);
      assert.equal(invite.body.token.length, 64);
      const saved = await db.invitation.findUniqueOrThrow({
        where: { id: invite.body.id },
      });
      assert.notEqual(saved.tokenHash, invite.body.token);
      assert.equal(
        (
          await a
            .post("/api/invitations/accept")
            .set("Origin", origin)
            .send({ token: invite.body.token })
        ).status,
        403,
      );
      assert.equal(
        (await b.get(`/api/workspaces/${wb}/manage/invitations`)).body.some(
          (i: any) => i.id === invite.body.id,
        ),
        false,
      );
      assert.equal(
        (
          await b
            .post("/api/invitations/accept")
            .set("Origin", origin)
            .send({ token: invite.body.token })
        ).status,
        200,
      );
      assert.equal(
        (
          await b
            .post("/api/invitations/accept")
            .set("Origin", origin)
            .send({ token: invite.body.token })
        ).status,
        409,
      );
      assert.equal(
        (await b.get(`/api/workspaces/${wa}/tickets/${id}`)).status,
        200,
      );
      assert.equal(
        (await b.get(`/api/workspaces/${wa}/manage/invitations`)).status,
        403,
      );
      assert.equal(
        (
          await b
            .patch(`/api/workspaces/${wa}/tickets/${id}`)
            .set("Origin", origin)
            .send({ status: "OPEN" })
        ).status,
        403,
      );
      assert.equal(
        (
          await a
            .patch(`/api/workspaces/${wa}/manage/members/${ub.body.id}`)
            .set("Origin", origin)
            .send({ role: "AGENT" })
        ).status,
        200,
      );
      assert.equal(
        (
          await b
            .patch(`/api/workspaces/${wa}/tickets/${id}`)
            .set("Origin", origin)
            .send({ status: "OPEN" })
        ).status,
        200,
      );
      assert.equal(
        (
          await a
            .delete(`/api/workspaces/${wa}/manage/members/${ub.body.id}`)
            .set("Origin", origin)
        ).status,
        200,
      );
      assert.equal((await b.get(`/api/workspaces/${wa}/tickets`)).status, 404);
      for (const expired of [false, true]) {
        const inv = await a
          .post(`/api/workspaces/${wa}/manage/invitations`)
          .set("Origin", origin)
          .send({ email: emailB, role: "AGENT" });
        assert.equal(inv.status, 201);
        if (expired)
          await db.invitation.update({
            where: { id: inv.body.id },
            data: { expiresAt: new Date(0) },
          });
        else
          assert.equal(
            (
              await a
                .delete(
                  `/api/workspaces/${wa}/manage/invitations/${inv.body.id}`,
                )
                .set("Origin", origin)
            ).status,
            200,
          );
        assert.equal(
          (
            await b
              .post("/api/invitations/accept")
              .set("Origin", origin)
              .send({ token: inv.body.token })
          ).status,
          409,
        );
      }
      const extra = await a
        .post("/api/workspaces")
        .set("Origin", origin)
        .send({ name: "Another workspace" });
      assert.equal(extra.status, 201);
      ids.push(extra.body.id);
      assert.equal((await a.get("/api/me")).body.memberships.length, 2);
      await a.post("/api/auth/logout").set("Origin", origin);
      assert.equal((await a.get("/api/me")).status, 401);
    } finally {
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
      await db.$disconnect();
    }
  },
);
