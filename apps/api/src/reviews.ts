import { createHash } from "node:crypto";
import type { Express } from "express";
import { Prisma, type PrismaClient, type Draft } from "@prisma/client";
import { z } from "zod";
import { ServiceError } from "./ai.js";
import { lockMember } from "./access.js";
const bodyHash = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const citationSchema = z.array(
  z.object({
    chunkId: z.string(),
    documentId: z.string(),
    version: z.number().int(),
    quote: z.string().min(1),
  }),
);
export async function invalidateSourceApprovals(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  documentId: string,
  actorId: string,
  reason: string,
) {
  const approved = await tx.draft.findMany({
    where: { workspaceId, status: "APPROVED" },
  });
  for (const draft of approved) {
    const citations = citationSchema.parse(draft.citations);
    if (!citations.some((c) => c.documentId === documentId)) continue;
    await tx.draft.update({
      where: { id: draft.id },
      data: {
        status: "DRAFT",
        approvedVersion: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });
    await tx.draftReview.create({
      data: {
        draftId: draft.id,
        workspaceId,
        version: draft.version,
        action: "INVALIDATED",
        actorId,
        reason,
        bodyHash: bodyHash(draft.body),
      },
    });
    await tx.auditEvent.create({
      data: {
        workspaceId,
        actorId,
        action: "draft.approval_invalidated",
        resourceId: draft.id,
      },
    });
  }
}
export async function evidenceAvailable(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  citations: unknown,
) {
  const parsed = citationSchema.safeParse(citations);
  if (!parsed.success || !parsed.data.length) return false;
  const chunks = await tx.knowledgeChunk.findMany({
    where: {
      workspaceId,
      id: { in: parsed.data.map((c) => c.chunkId) },
      document: { approved: true },
    },
    include: { document: { select: { version: true } } },
  });
  return parsed.data.every((c) =>
    chunks.some(
      (p) =>
        p.id === c.chunkId &&
        p.documentId === c.documentId &&
        p.document.version === c.version &&
        p.content.includes(c.quote),
    ),
  );
}
export function reviewRoutes(app: Express, db: PrismaClient) {
  const base = "/api/workspaces/:workspaceId";
  async function sanitize<T extends Draft>(workspaceId: string, drafts: T[]) {
    const docs = new Set(
      (
        await db.knowledgeDocument.findMany({
          where: { workspaceId, approved: true },
          select: { id: true },
        })
      ).map((d) => d.id),
    );
    return drafts.map((d) => {
      const parsed = citationSchema.safeParse(d.citations);
      const sourcesAvailable =
        parsed.success && parsed.data.every((c) => docs.has(c.documentId));
      return {
        ...d,
        body: sourcesAvailable ? d.body : "",
        citations: sourcesAvailable ? d.citations : [],
        sourcesAvailable,
        reason: sourcesAvailable
          ? d.reason
          : "A cited source was withdrawn or deleted. Generate a new draft.",
      };
    });
  }
  app.get(base + "/drafts", async (req, res) => {
    const { status, page } = z
      .object({
        status: z
          .enum(["DRAFT", "APPROVED", "REJECTED", "ABSTAINED"])
          .default("DRAFT"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(req.query);
    const workspaceId = res.locals.workspaceId;
    const where = { workspaceId, status };
    const [items, total] = await db.$transaction([
      db.draft.findMany({
        where,
        include: {
          ticket: { select: { id: true, subject: true, customerEmail: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.draft.count({ where }),
    ]);
    res.json({ items: await sanitize(workspaceId, items), total, page });
  });
  app.get(base + "/drafts/:draftId", async (req, res) => {
    const workspaceId = res.locals.workspaceId;
    const draft = await db.draft.findFirst({
      where: { id: z.string().parse(req.params.draftId), workspaceId },
      include: {
        ticket: { select: { id: true, subject: true } },
        revisions: { orderBy: { version: "desc" }, take: 100 },
        reviews: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      },
    });
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    const actors = await db.user.findMany({
      where: {
        id: {
          in: [
            ...draft.reviews.map((r) => r.actorId),
            ...draft.revisions.map((r) => r.changedBy),
          ],
        },
      },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    const [safe] = await sanitize(workspaceId, [draft]);
    res.json({
      ...safe,
      reviews: draft.reviews.map((r) => ({
        ...r,
        actorName: names.get(r.actorId) ?? "Former teammate",
      })),
      revisions: safe.sourcesAvailable
        ? draft.revisions.map((r) => ({
            ...r,
            editorName: names.get(r.changedBy) ?? "Former teammate",
          }))
        : draft.revisions.map((r) => ({ ...r, body: "", citations: [] })),
    });
  });
  app.patch(base + "/drafts/:draftId", async (req, res) => {
    const input = z
      .object({
        body: z.string().trim().min(1).max(12000),
        expectedVersion: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    const draft = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const current = await tx.draft.findFirst({
        where: { id: z.string().parse(req.params.draftId), workspaceId },
      });
      if (!current) throw new ServiceError(404, "NOT_FOUND", "Draft not found");
      if (current.version !== input.expectedVersion)
        throw new ServiceError(
          409,
          "VERSION_CONFLICT",
          "This draft changed. Refresh before editing.",
        );
      if (!["DRAFT", "APPROVED", "REJECTED"].includes(current.status))
        throw new ServiceError(
          409,
          "INVALID_STATE",
          "Abstentions cannot be edited into responses. Generate a new evidence-backed draft.",
        );
      if (!(await evidenceAvailable(tx, workspaceId, current.citations)))
        throw new ServiceError(
          409,
          "SOURCE_CHANGED",
          "A source is unavailable. Generate a new draft.",
        );
      if (current.body === input.body) return current;
      const draft = await tx.draft.update({
        where: { id: current.id },
        data: {
          body: input.body,
          version: { increment: 1 },
          status: "DRAFT",
          approvedVersion: null,
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      });
      await tx.draftRevision.create({
        data: {
          draftId: draft.id,
          workspaceId,
          version: draft.version,
          body: draft.body,
          citations: draft.citations as Prisma.InputJsonValue,
          changedBy: userId,
        },
      });
      if (current.status === "APPROVED")
        await tx.draftReview.create({
          data: {
            draftId: current.id,
            workspaceId,
            version: current.version,
            action: "INVALIDATED",
            actorId: userId,
            reason: "Response edited after approval",
            bodyHash: bodyHash(current.body),
          },
        });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "draft.edited",
          resourceId: draft.id,
        },
      });
      return draft;
    });
    res.json(draft);
  });
  app.post(base + "/drafts/:draftId/review", async (req, res) => {
    const input = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("APPROVE"),
            expectedVersion: z.number().int().positive(),
            confirmEvidence: z.literal(true),
          })
          .strict(),
        z
          .object({
            action: z.literal("REJECT"),
            expectedVersion: z.number().int().positive(),
            reason: z.string().trim().min(1).max(1000),
          })
          .strict(),
      ])
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    const result = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const draft = await tx.draft.findFirst({
        where: { id: z.string().parse(req.params.draftId), workspaceId },
      });
      if (!draft) throw new ServiceError(404, "NOT_FOUND", "Draft not found");
      if (draft.version !== input.expectedVersion)
        throw new ServiceError(
          409,
          "VERSION_CONFLICT",
          "This draft changed. Refresh before reviewing.",
        );
      if (draft.status !== "DRAFT")
        throw new ServiceError(
          409,
          "INVALID_STATE",
          "Only pending drafts can be reviewed.",
        );
      if (
        input.action === "APPROVE" &&
        !(await evidenceAvailable(tx, workspaceId, draft.citations))
      )
        throw new ServiceError(
          409,
          "SOURCE_CHANGED",
          "A source is unavailable. Generate a new draft.",
        );
      const approved = input.action === "APPROVE";
      const reason = input.action === "REJECT" ? input.reason : null;
      const updated = await tx.draft.update({
        where: { id: draft.id },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          approvedVersion: approved ? draft.version : null,
          reviewedBy: userId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });
      await tx.draftReview.create({
        data: {
          draftId: draft.id,
          workspaceId,
          version: draft.version,
          action: approved ? "APPROVED" : "REJECTED",
          actorId: userId,
          reason,
          bodyHash: bodyHash(draft.body),
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: approved ? "draft.approved" : "draft.rejected",
          resourceId: draft.id,
        },
      });
      return updated;
    });
    res.json(result);
  });
}
