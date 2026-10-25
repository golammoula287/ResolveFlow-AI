import { lockMember } from "./access.js";
import { invalidateSourceApprovals } from "./reviews.js";
import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";
import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  chunkText,
  cosine,
  ServiceError,
  validateClaims,
  type AiProvider,
  type Passage,
  type Usage,
} from "./ai.js";
const base = "/api/workspaces/:workspaceId";
const documentInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    filename: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^/\\]+\.(txt|md)$/i),
    content: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) =>
          !Array.from(v).some((c) => {
            const n = c.codePointAt(0)!;
            return n >= 0xd800 && n <= 0xdfff;
          }),
        "Only valid Unicode text is supported",
      )
      .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 40000,
        "Document limit is 40 KB",
      )
      .refine(
        (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(v),
        "Only valid UTF-8 plain text is supported",
      ),
  })
  .strict();
export function knowledgeRoutes(
  app: Express,
  db: PrismaClient,
  provider?: AiProvider,
) {
  const aiLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "AI request limit reached. Try again later." },
  });
  app.use(
    [base + "/documents/:id/index", base + "/tickets/:id/drafts"],
    (req, res, next) => {
      if (req.method === "POST") return aiLimit(req, res, next);
      next();
    },
  );
  app.use(base + "/documents/search", (req, res, next) => {
    if (req.query.mode === "semantic") return aiLimit(req, res, next);
    next();
  });
  async function measured<T extends { usage: Usage }>(
    workspaceId: string,
    operation: string,
    model: string,
    fn: () => Promise<T>,
  ) {
    const started = Date.now();
    try {
      const result = await fn();
      await db.aiRun.create({
        data: {
          workspaceId,
          operation,
          model,
          status: "SUCCEEDED",
          latencyMs: Date.now() - started,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      });
      return result;
    } catch (e) {
      await db.aiRun.create({
        data: {
          workspaceId,
          operation,
          model,
          status: "FAILED",
          latencyMs: Date.now() - started,
          errorCode: e instanceof ServiceError ? e.code : "INVALID_OUTPUT",
        },
      });
      throw e;
    }
  }
  async function retrieve(
    workspaceId: string,
    query: string,
    semantic = false,
  ): Promise<Passage[]> {
    const lexicalQuery = (query.match(/[\p{L}\p{N}]+/gu) ?? [])
      .slice(0, 40)
      .join(" OR ");
    const lexical = await db.$queryRaw<
      Passage[]
    >`SELECT c.id,c."documentId",d.title,d.version,c.content,ts_rank_cd(to_tsvector('english',c.content),websearch_to_tsquery('english',${lexicalQuery}))::float8 AS score FROM "KnowledgeChunk" c JOIN "KnowledgeDocument" d ON d.id=c."documentId" AND d."workspaceId"=c."workspaceId" WHERE c."workspaceId"=${workspaceId} AND d.approved=true AND to_tsvector('english',c.content) @@ websearch_to_tsquery('english',${lexicalQuery}) ORDER BY score DESC,c.id LIMIT 6`;
    if (!semantic) return lexical;
    if (!provider)
      throw new ServiceError(
        503,
        "AI_NOT_CONFIGURED",
        "AI is not configured. Set AI_PROVIDER and its server-side API key (GROQ_API_KEY for Groq).",
      );
    if (!provider.embeddingModel)
      throw new ServiceError(
        503,
        "EMBEDDINGS_NOT_CONFIGURED",
        "Semantic embeddings are not configured. Use keyword search with this provider.",
      );
    const chunks = await db.knowledgeChunk.findMany({
      where: {
        workspaceId,
        embeddingModel: provider.embeddingModel,
        document: { approved: true },
      },
      include: { document: { select: { title: true, version: true } } },
      take: 2001,
    });
    if (chunks.length > 2000)
      throw new ServiceError(
        409,
        "VECTOR_CAPACITY",
        "Exact vector search is limited to 2,000 indexed passages per workspace.",
      );
    if (!chunks.length) return lexical;
    const { vectors } = await measured(
      workspaceId,
      "query.embedding",
      provider.embeddingModel,
      () => provider.embed([query]),
    );
    const ranked = chunks
      .map((c) => ({
        id: c.id,
        documentId: c.documentId,
        title: c.document.title,
        version: c.document.version,
        content: c.content,
        score: cosine(c.embedding, vectors[0]),
      }))
      .filter((p) => p.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    // Reciprocal rank fusion combines lexical and semantic rankings without comparing unlike scores.
    const merged = new Map<string, Passage>();
    for (const list of [lexical, ranked])
      list.forEach((p, i) => {
        const previous = merged.get(p.id);
        merged.set(p.id, {
          ...p,
          score: (previous?.score ?? 0) + 1 / (60 + i + 1),
        });
      });
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  }
  app.get(base + "/ai/status", (_req, res) =>
    res.json({
      configured: !!provider,
      embeddingsConfigured: !!provider?.embeddingModel,
      embeddingModel: provider?.embeddingModel ?? null,
      draftModel: provider?.draftModel ?? null,
      retrieval:
        "PostgreSQL full-text; optional exact cosine vectors (2,000-passage limit)",
      costTracking: "Token usage recorded; monetary cost is not estimated",
    }),
  );
  app.get(base + "/documents", async (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .default(1)
      .parse(req.query.page);
    const workspaceId = res.locals.workspaceId;
    const [items, total] = await db.$transaction([
      db.knowledgeDocument.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          filename: true,
          version: true,
          approved: true,
          createdAt: true,
          approvedAt: true,
          _count: { select: { chunks: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.knowledgeDocument.count({ where: { workspaceId } }),
    ]);
    res.json({ items, total, page });
  });
  app.post(base + "/documents", async (req, res) => {
    const input = documentInput.parse(req.body),
      { workspaceId, userId } = res.locals;
    const document = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const document = await tx.knowledgeDocument.create({
        data: {
          workspaceId,
          title: input.title,
          filename: input.filename,
          createdBy: userId,
          contentHash: createHash("sha256").update(input.content).digest("hex"),
          chunks: {
            create: chunkText(input.content).map((content, ordinal) => ({
              content,
              ordinal,
            })),
          },
        },
        select: { id: true, title: true, approved: true },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "document.ingested",
          resourceId: document.id,
        },
      });
      return document;
    });
    res.status(201).json(document);
  });
  app.get(base + "/documents/search", async (req, res) => {
    const { q, mode } = z
      .object({
        q: z.string().trim().min(1).max(500),
        mode: z.enum(["lexical", "semantic"]).default("lexical"),
      })
      .parse(req.query);
    res.json({
      items: await retrieve(res.locals.workspaceId, q, mode === "semantic"),
      mode,
    });
  });
  app.get(base + "/documents/:id", async (req, res) => {
    const document = await db.knowledgeDocument.findFirst({
      where: {
        workspaceId: res.locals.workspaceId,
        id: z.string().parse(req.params.id),
      },
      include: {
        chunks: {
          select: {
            id: true,
            ordinal: true,
            content: true,
            embeddingModel: true,
          },
          orderBy: { ordinal: "asc" },
        },
      },
    });
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(document);
  });
  app.patch(base + "/documents/:id", async (req, res) => {
    const { approved } = z
        .object({ approved: z.boolean() })
        .strict()
        .parse(req.body),
      { workspaceId, userId } = res.locals;
    const result = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId, true);
      const result = await tx.knowledgeDocument.updateMany({
        where: { id: z.string().parse(req.params.id), workspaceId },
        data: {
          approved,
          approvedBy: approved ? userId : null,
          approvedAt: approved ? new Date() : null,
        },
      });
      if (result.count && !approved)
        await invalidateSourceApprovals(
          tx,
          workspaceId,
          z.string().parse(req.params.id),
          userId,
          "Cited source withdrawn",
        );
      if (result.count)
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: userId,
            action: approved ? "document.approved" : "document.withdrawn",
            resourceId: z.string().parse(req.params.id),
          },
        });
      return result;
    });
    res
      .status(result.count ? 200 : 404)
      .json(result.count ? { ok: true } : { error: "Document not found" });
  });
  app.delete(base + "/documents/:id", async (req, res) => {
    const { workspaceId, userId } = res.locals;
    const result = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId, true);
      const result = await tx.knowledgeDocument.deleteMany({
        where: { id: z.string().parse(req.params.id), workspaceId },
      });
      if (result.count)
        await invalidateSourceApprovals(
          tx,
          workspaceId,
          z.string().parse(req.params.id),
          userId,
          "Cited source deleted",
        );
      if (result.count)
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: userId,
            action: "document.deleted",
            resourceId: z.string().parse(req.params.id),
          },
        });
      return result;
    });
    res
      .status(result.count ? 200 : 404)
      .json(result.count ? { ok: true } : { error: "Document not found" });
  });
  app.post(base + "/documents/:id/index", async (req, res) => {
    const { workspaceId, userId } = res.locals;
    const document = await db.knowledgeDocument.findFirst({
      where: {
        id: z.string().parse(req.params.id),
        workspaceId,
        approved: true,
      },
      include: { chunks: { orderBy: { ordinal: "asc" } } },
    });
    if (!document) {
      res.status(404).json({ error: "Approved document not found" });
      return;
    }
    if (!provider)
      throw new ServiceError(
        503,
        "AI_NOT_CONFIGURED",
        "AI is not configured. Set AI_PROVIDER and its server-side API key (GROQ_API_KEY for Groq).",
      );
    if (!provider.embeddingModel)
      throw new ServiceError(
        503,
        "EMBEDDINGS_NOT_CONFIGURED",
        "This provider uses keyword retrieval. Semantic indexing is not configured.",
      );
    const { vectors } = await measured(
      workspaceId,
      "document.embedding",
      provider.embeddingModel,
      () => provider.embed(document.chunks.map((c) => c.content)),
    );
    await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      if (
        !(await tx.knowledgeDocument.findFirst({
          where: { id: document.id, workspaceId, approved: true },
        }))
      )
        throw new ServiceError(
          409,
          "SOURCE_CHANGED",
          "Source is no longer approved.",
        );
      for (let i = 0; i < document.chunks.length; i++)
        await tx.knowledgeChunk.updateMany({
          where: { id: document.chunks[i].id, workspaceId },
          data: {
            embedding: vectors[i],
            embeddingModel: provider!.embeddingModel,
          },
        });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "document.indexed",
          resourceId: document.id,
        },
      });
    });
    res.json({ ok: true, chunks: document.chunks.length });
  });
  app.get(base + "/ai/runs", async (_req, res) =>
    res.json(
      await db.aiRun.findMany({
        where: { workspaceId: res.locals.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
  );
  app.post(base + "/tickets/:id/drafts", async (req, res) => {
    const { workspaceId, userId } = res.locals;
    const ticket = await db.ticket.findFirst({
      where: { id: z.string().parse(req.params.id), workspaceId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const question = (
      ticket.subject +
      "\n" +
      (ticket.messages[0]?.body ?? "")
    ).slice(0, 4000);
    const passages = await retrieve(
      workspaceId,
      question,
      !!provider?.embeddingModel,
    );
    let result: ReturnType<typeof validateClaims> = {
      status: "ABSTAINED",
      body: "",
      reason:
        "No approved evidence matched this request. Add or approve relevant knowledge before drafting.",
      citations: [],
    };
    if (passages.length) {
      if (!provider)
        throw new ServiceError(
          503,
          "AI_NOT_CONFIGURED",
          "AI is not configured. Set AI_PROVIDER and its server-side API key (GROQ_API_KEY for Groq).",
        );
      const response = await measured(
        workspaceId,
        "draft.generate",
        provider.draftModel,
        async () => {
          const response = await provider.answer(question, passages);
          validateClaims(response.answer, passages);
          return response;
        },
      );
      result = validateClaims(response.answer, passages);
    }
    const draft = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const ids = [...new Set(result.citations.map((c) => c.documentId))];
      if (
        ids.length !==
        (await tx.knowledgeDocument.count({
          where: { id: { in: ids }, workspaceId, approved: true },
        }))
      )
        throw new ServiceError(
          409,
          "SOURCE_CHANGED",
          "Sources changed while drafting. Generate a new draft.",
        );
      const draft = await tx.draft.create({
        data: {
          workspaceId,
          ticketId: ticket.id,
          createdBy: userId,
          ...result,
          citations: result.citations as Prisma.InputJsonValue,
        },
      });
      await tx.draftRevision.create({
        data: {
          draftId: draft.id,
          workspaceId,
          version: 1,
          body: draft.body,
          citations: draft.citations as Prisma.InputJsonValue,
          changedBy: userId,
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action:
            result.status === "ABSTAINED" ? "draft.abstained" : "draft.created",
          resourceId: draft.id,
        },
      });
      return draft;
    });
    res.status(201).json(draft);
  });
  app.get(base + "/tickets/:id/drafts", async (req, res) => {
    const { workspaceId } = res.locals;
    const ticketId = z.string().parse(req.params.id);
    if (
      !(await db.ticket.findFirst({ where: { id: ticketId, workspaceId } }))
    ) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const drafts = await db.draft.findMany({
      where: { workspaceId, ticketId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const approved = new Set(
      (
        await db.knowledgeDocument.findMany({
          where: { workspaceId, approved: true },
          select: { id: true },
        })
      ).map((d) => d.id),
    );
    res.json(
      drafts.map((d) => {
        const citations = d.citations as { documentId: string }[];
        const sourcesAvailable = citations.every((c) =>
          approved.has(c.documentId),
        );
        return {
          ...d,
          body: sourcesAvailable ? d.body : "",
          citations: sourcesAvailable ? d.citations : [],
          sourcesAvailable,
          reason: sourcesAvailable
            ? d.reason
            : "A cited source was withdrawn or deleted. Generate a new draft.",
        };
      }),
    );
  });
}
