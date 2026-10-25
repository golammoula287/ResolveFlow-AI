import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { canWrite } from "./policy.js";
const secret = "test-secret-with-at-least-32-characters";
const origin = "http://localhost:5173";
const cookie =
  "rf_session=" + jwt.sign({ sub: "user-a" }, secret, { algorithm: "HS256" });
test("role policy denies viewer and unknown roles", () => {
  assert.equal(canWrite("VIEWER"), false);
  assert.equal(canWrite("ADMIN"), false);
  assert.equal(canWrite("OWNER"), true);
  assert.equal(canWrite("AGENT"), true);
});
test("unauthenticated API requests fail closed", async () => {
  const app = createApp({} as PrismaClient, { secret, origin });
  assert.equal((await request(app).get("/api/me")).status, 401);
});
test("mutations reject foreign or missing origins", async () => {
  const app = createApp({} as PrismaClient, { secret, origin });
  for (const o of ["", "https://evil.test"]) {
    const r = request(app).post("/api/auth/logout");
    if (o) r.set("Origin", o);
    assert.equal((await r).status, 403);
  }
});
test("foreign workspace is hidden before ticket queries execute", async () => {
  let lookups = 0;
  const db = {
    membership: {
      findUnique: async (args: any) => {
        assert.deepEqual(args.where.userId_workspaceId, {
          userId: "user-a",
          workspaceId: "workspace-b",
        });
        lookups++;
        return null;
      },
    },
  } as unknown as PrismaClient;
  const app = createApp(db, { secret, origin });
  const r = await request(app)
    .get("/api/workspaces/workspace-b/tickets/secret")
    .set("Cookie", cookie);
  assert.equal(r.status, 404);
  assert.equal(lookups, 1);
});
test("viewer cannot mutate tickets, roles are read again on next request", async () => {
  let role = "VIEWER";
  let checks = 0;
  const db = {
    membership: {
      findUnique: async () => {
        checks++;
        return { role };
      },
    },
    ticket: { findFirst: async () => null },
  } as unknown as PrismaClient;
  const app = createApp(db, { secret, origin });
  const r = await request(app)
    .patch("/api/workspaces/a/tickets/t")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .send({ status: "RESOLVED" });
  assert.equal(r.status, 403);
  role = "AGENT";
  const read = await request(app)
    .get("/api/workspaces/a/tickets/t")
    .set("Cookie", cookie);
  assert.equal(read.status, 404);
  assert.equal(checks, 2);
});
test("ticket reads always include workspace scope", async () => {
  const db = {
    membership: { findUnique: async () => ({ role: "AGENT" }) },
    ticket: {
      findFirst: async (args: any) => {
        assert.equal(args.where.workspaceId, "a");
        assert.equal(args.where.id, "t");
        return null;
      },
    },
  } as unknown as PrismaClient;
  assert.equal(
    (
      await request(createApp(db, { secret, origin }))
        .get("/api/workspaces/a/tickets/t")
        .set("Cookie", cookie)
    ).status,
    404,
  );
});

test("expired and tampered sessions cannot access workspace resources", async () => {
  const app = createApp({} as PrismaClient, { secret, origin });
  const expired = jwt.sign({ sub: "user-a" }, secret, { expiresIn: -1 });
  for (const token of [expired, jwt.sign({ sub: "user-a" }, "wrong-secret")]) {
    const result = await request(app)
      .get("/api/workspaces/a/tickets")
      .set("Cookie", "rf_session=" + token);
    assert.equal(result.status, 401);
  }
});
