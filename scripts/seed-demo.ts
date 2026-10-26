import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
dotenv.config({ path: "apps/api/.env", quiet: true });
if (!process.argv.includes("--confirm"))
  throw Error(
    "Use --confirm to create synthetic demo records. Existing records are not reset.",
  );
const url = new URL(process.env.DATABASE_URL!);
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
if (!local && process.env.DEMO_SEED_ALLOW_REMOTE !== "true")
  throw Error(
    "Remote demo seeding requires DEMO_SEED_ALLOW_REMOTE=true and a dedicated demo database.",
  );
const password =
  process.env.DEMO_PASSWORD || (local ? "ResolveFlow-Demo-2026!" : "");
if (password.length < 20)
  throw Error("Set DEMO_PASSWORD to at least 20 characters");
const db = new PrismaClient();
try {
  const hash = await bcrypt.hash(password, 12);
  for (const [slug, name] of [
    ["northstar", "Northstar Demo"],
    ["orchid", "Orchid Demo"],
  ]) {
    const workspaceId = "demo-" + slug;
    await db.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name },
      update: {},
    });
    for (const role of ["OWNER", "AGENT", "VIEWER"] as const) {
      const id = "demo-" + slug + "-" + role.toLowerCase(),
        email = role.toLowerCase() + "@" + slug + ".example.test";
      const existing = await db.user.findUnique({ where: { email } });
      if (existing && existing.id !== id)
        throw Error("Demo email already belongs to another account");
      await db.user.upsert({
        where: { id },
        create: {
          id,
          email,
          name: name + " " + role.toLowerCase(),
          passwordHash: hash,
        },
        update: {},
      });
      await db.membership.upsert({
        where: { userId_workspaceId: { userId: id, workspaceId } },
        create: { userId: id, workspaceId, role },
        update: {},
      });
    }
    const owner = "demo-" + slug + "-owner";
    for (let i = 0; i < 6; i++) {
      const id = "demo-" + slug + "-ticket-" + i;
      await db.ticket.upsert({
        where: { id },
        create: {
          id,
          workspaceId,
          subject: [
            "Refund request",
            "Invoice copy",
            "Workspace invitation",
            "Account access",
            "Priority escalation",
            "Plan change",
          ][i],
          customerEmail: "customer" + i + "@example.test",
          priority: i === 4 ? "NORMAL" : "LOW",
          createdAt: new Date(Date.now() - (i + 1) * 24 * 3600000),
          messages: {
            create: {
              body: [
                "Can I request a refund?",
                "Where can I download my invoice?",
                "My invitation expired.",
                "How do I reset my password?",
                "This request needs attention.",
                "How do I change my subscription?",
              ][i],
              authorId: owner,
            },
          },
        },
        update: {},
      });
    }
    const content =
      slug === "northstar"
        ? await readFile("docs/samples/refund-policy.md", "utf8")
        : "Orchid Demo private policy: enterprise support requests are reviewed by a dedicated account owner. This is fictional tenant-specific material.";
    const docId = "demo-" + slug + "-policy";
    await db.knowledgeDocument.upsert({
      where: { id: docId },
      create: {
        id: docId,
        workspaceId,
        title: name + " refund policy",
        filename: "policy.md",
        contentHash: createHash("sha256").update(content).digest("hex"),
        approved: true,
        approvedBy: owner,
        approvedAt: new Date(),
        createdBy: owner,
        chunks: { create: { ordinal: 0, content } },
      },
      update: {},
    });
    const doc = await db.knowledgeDocument.findUniqueOrThrow({
      where: { id: docId },
      include: { chunks: true },
    });
    if (
      slug === "northstar" &&
      !(await db.draft.findUnique({ where: { id: "demo-manual-response" } }))
    ) {
      const body =
        "You may request a refund within 30 calendar days of your first paid subscription invoice. Please provide the invoice number and account email for eligibility review.";
      const citations = [
        {
          documentId: doc.id,
          chunkId: doc.chunks[0].id,
          title: doc.title,
          version: doc.version,
          quote:
            "Customers may request a refund within 30 calendar days of their first paid subscription invoice.",
          claim: body,
        },
      ];
      await db.$transaction(async (tx) => {
        const d = await tx.draft.create({
          data: {
            id: "demo-manual-response",
            workspaceId,
            ticketId: "demo-northstar-ticket-0",
            status: "DRAFT",
            origin: "HUMAN",
            body,
            citations,
            createdBy: owner,
          },
        });
        await tx.draftRevision.create({
          data: {
            draftId: d.id,
            workspaceId,
            version: 1,
            body,
            citations,
            changedBy: owner,
          },
        });
      });
    }
  }
  console.log(
    "Synthetic demo accounts created without resetting existing records. See docs/DEMO.md for sign-in details.",
  );
} finally {
  await db.$disconnect();
}
