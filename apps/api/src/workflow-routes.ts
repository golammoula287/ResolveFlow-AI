import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ServiceError } from "./ai.js";
import { lockMember } from "./access.js";
import { evidenceAvailable } from "./reviews.js";
import { hashBody, type DeliveryProvider } from "./delivery.js";
export type WorkflowConfig = {
  delivery?: DeliveryProvider;
  redisConfigured?: boolean;
  webhookSecret?: string;
  runJobs?: () => Promise<void>;
};
export const hookKey = (master: string, workspaceId: string) =>
  createHmac("sha256", master).update(workspaceId).digest("hex");
export function inboundHooks(app: Express, db: PrismaClient, secret?: string) {
  app.post(
    "/api/hooks/:workspaceId/tickets",
    rateLimit({ windowMs: 60000, limit: 60 }),
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      if (!secret)
        throw new ServiceError(
          503,
          "WEBHOOK_DISABLED",
          "Webhook signing is not configured",
        );
      const workspaceId = z.string().parse(req.params.workspaceId),
        timestamp = z
          .string()
          .regex(/^\d{10}$/)
          .parse(req.headers["x-rf-timestamp"]),
        eventId = z.uuid().parse(req.headers["x-rf-event-id"]),
        signature = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(req.headers["x-rf-signature"]);
      if (
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        !Buffer.isBuffer(req.body)
      )
        throw new ServiceError(
          401,
          "INVALID_SIGNATURE",
          "Invalid or expired signature",
        );
      const expected = createHmac("sha256", hookKey(secret, workspaceId))
        .update(timestamp + "." + eventId + ".")
        .update(req.body)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
        throw new ServiceError(
          401,
          "INVALID_SIGNATURE",
          "Invalid or expired signature",
        );
      const input = z
        .object({
          subject: z.string().trim().min(1).max(200),
          customerEmail: z.email(),
          body: z.string().trim().min(1).max(20000),
          priority: z
            .enum(["LOW", "NORMAL", "HIGH", "URGENT"])
            .default("NORMAL"),
        })
        .strict()
        .parse(JSON.parse(req.body.toString("utf8")));
      const hash = createHash("sha256").update(req.body).digest("hex");
      const outcome = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (!workspace?.webhookEnabled)
          throw new ServiceError(404, "NOT_FOUND", "Webhook not enabled");
        const previous = await tx.webhookEvent.findUnique({
          where: { workspaceId_eventId: { workspaceId, eventId } },
        });
        if (previous) {
          if (previous.payloadHash !== hash)
            throw new ServiceError(
              409,
              "EVENT_CONFLICT",
              "Event ID already used with different content",
            );
          return { ticketId: previous.ticketId, duplicate: true };
        }
        const ticket = await tx.ticket.create({
          data: {
            workspaceId,
            subject: input.subject,
            customerEmail: input.customerEmail,
            priority: input.priority,
            messages: { create: { body: input.body, authorId: "webhook" } },
          },
        });
        await tx.webhookEvent.create({
          data: {
            workspaceId,
            eventId,
            payloadHash: hash,
            ticketId: ticket.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: "webhook",
            action: "ticket.received",
            resourceId: ticket.id,
          },
        });
        return { ticketId: ticket.id, duplicate: false };
      });
      res.status(outcome.duplicate ? 200 : 201).json(outcome);
    },
  );
}
export function workflowRoutes(
  app: Express,
  db: PrismaClient,
  config: WorkflowConfig,
) {
  const base = "/api/workspaces/:workspaceId";
  app.post(base + "/workflows/process", async (_req, res) => {
    await db.$transaction((tx) =>
      lockMember(tx, res.locals.workspaceId, res.locals.userId, true),
    );
    if (!config.runJobs)
      throw new ServiceError(
        503,
        "WORKER_DISABLED",
        "Configure Redis to process pending jobs",
      );
    await config.runJobs();
    res.json({ ok: true });
  });
  app.get(base + "/metrics", async (_req, res) => {
    const workspaceId = res.locals.workspaceId;
    const [tickets, jobs, drafts, reviews, runs, failures] = await Promise.all([
      db.ticket.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: true,
      }),
      db.workflowJob.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: true,
      }),
      db.draft.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: true,
      }),
      db.draftReview.findMany({
        where: { workspaceId, action: { in: ["APPROVED", "REJECTED"] } },
        select: { action: true, version: true },
      }),
      db.aiRun.findMany({
        where: { workspaceId },
        select: {
          status: true,
          latencyMs: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
      }),
      db.ingestionFailure.count({ where: { workspaceId } }),
    ]);
    const approved = reviews.filter((r) => r.action === "APPROVED"),
      latencies = runs.map((r) => r.latencyMs).sort((a, b) => a - b);
    res.json({
      tickets,
      jobs,
      drafts,
      reviewDecisions: reviews.length,
      approvals: approved.length,
      approvedWithoutEdits: approved.filter((r) => r.version === 1).length,
      approvalRate: reviews.length ? approved.length / reviews.length : null,
      aiRequests: runs.length,
      aiFailures: runs.filter((r) => r.status === "FAILED").length,
      inputTokens: runs.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
      outputTokens: runs.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
      p95LatencyMs: latencies.length
        ? latencies[Math.ceil(latencies.length * 0.95) - 1]
        : null,
      costUsd:
        runs.length && runs.every((r) => r.costUsd !== null)
          ? runs.reduce((s, r) => s + r.costUsd!, 0)
          : null,
      ingestionFailures: failures,
    });
  });
  app.get(base + "/workflows", async (req, res) => {
    const { page } = z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .parse(req.query),
      workspaceId = res.locals.workspaceId;
    const [jobs, total, rule, heart, workspace] = await Promise.all([
      db.workflowJob.findMany({
        where: { workspaceId },
        include: {
          delivery: {
            select: {
              id: true,
              status: true,
              provider: true,
              providerId: true,
              recipient: true,
              version: true,
            },
          },
          history: { orderBy: { createdAt: "desc" }, take: 10 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.workflowJob.count({ where: { workspaceId } }),
      db.automationRule.findUnique({ where: { workspaceId } }),
      db.workerHeartbeat.findFirst({ orderBy: { updatedAt: "desc" } }),
      db.workspace.findUnique({
        where: { id: workspaceId },
        select: { webhookEnabled: true },
      }),
    ]);
    res.json({
      items: jobs,
      total,
      page,
      rule,
      deliveryMode: config.delivery?.name ?? "disabled",
      redisConfigured: !!config.redisConfigured,
      workerHealthy: !!heart && Date.now() - heart.updatedAt.getTime() < 120000,
      webhookConfigured: !!config.webhookSecret,
      webhookEnabled: workspace?.webhookEnabled ?? false,
    });
  });
  app.post(base + "/drafts/:draftId/delivery", async (req, res) => {
    const { expectedVersion } = z
      .object({
        expectedVersion: z.number().int().positive(),
        confirmSend: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    if (!config.delivery || !config.redisConfigured)
      throw new ServiceError(
        503,
        "DELIVERY_DISABLED",
        "Configure a delivery provider, Redis and a worker before queueing delivery",
      );
    const result = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const draft = await tx.draft.findFirst({
        where: { id: z.string().parse(req.params.draftId), workspaceId },
        include: { ticket: true },
      });
      if (!draft) throw new ServiceError(404, "NOT_FOUND", "Draft not found");
      if (
        draft.version !== expectedVersion ||
        draft.approvedVersion !== expectedVersion ||
        draft.status !== "APPROVED"
      )
        throw new ServiceError(
          409,
          "APPROVAL_CHANGED",
          "Approve the current response version before queueing delivery",
        );
      if (!(await evidenceAvailable(tx, workspaceId, draft.citations)))
        throw new ServiceError(
          409,
          "SOURCE_CHANGED",
          "A source is no longer approved",
        );
      const approval = await tx.draftReview.findFirst({
        where: {
          draftId: draft.id,
          workspaceId,
          version: expectedVersion,
          action: "APPROVED",
          bodyHash: hashBody(draft.body),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!approval)
        throw new ServiceError(
          409,
          "APPROVAL_MISSING",
          "Approval record not available",
        );
      const existing = await tx.delivery.findUnique({
        where: {
          workspaceId_draftId_version: {
            workspaceId,
            draftId: draft.id,
            version: expectedVersion,
          },
        },
      });
      if (existing)
        return {
          jobId: existing.jobId,
          id: existing.id,
          duplicate: true,
          mode: existing.provider,
        };
      const job = await tx.workflowJob.create({
        data: {
          workspaceId,
          kind: "DELIVERY",
          actorId: userId,
          idempotencyKey: "deliver-" + draft.id + "-" + expectedVersion,
        },
      });
      const delivery = await tx.delivery.create({
        data: {
          workspaceId,
          jobId: job.id,
          draftId: draft.id,
          version: expectedVersion,
          approvalId: approval.id,
          recipient: draft.ticket.customerEmail,
          subject: "Re: " + draft.ticket.subject,
          body: draft.body,
          bodyHash: hashBody(draft.body),
          provider: config.delivery!.name,
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "delivery.queued",
          resourceId: delivery.id,
        },
      });
      return {
        jobId: job.id,
        id: delivery.id,
        duplicate: false,
        mode: delivery.provider,
      };
    });
    res.status(result.duplicate ? 200 : 202).json(result);
  });
  app.post(base + "/jobs/:id/retry", async (req, res) => {
    z.object({ confirmRetry: z.literal(true) })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    const job = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const job = await tx.workflowJob.findFirst({
        where: { id: z.string().parse(req.params.id), workspaceId },
      });
      if (!job) throw new ServiceError(404, "NOT_FOUND", "Job not found");
      if (job.status !== "FAILED")
        throw new ServiceError(
          409,
          "INVALID_STATE",
          "Only failed jobs can be retried. Uncertain deliveries require provider reconciliation.",
        );
      if (
        job.kind === "DELIVERY" &&
        job.firstAttemptAt &&
        Date.now() - job.firstAttemptAt.getTime() > 23 * 3600000
      )
        throw new ServiceError(
          409,
          "IDEMPOTENCY_WINDOW_EXPIRED",
          "Inspect the provider outcome before attempting another delivery.",
        );
      const updated = await tx.workflowJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          generation: { increment: 1 },
          actorId: userId,
          dispatchedAt: null,
          lastError: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "job.retry_requested",
          resourceId: job.id,
        },
      });
      return updated;
    });
    res.status(202).json(job);
  });
  app.put(base + "/automation", async (req, res) => {
    const input = z
      .object({
        enabled: z.boolean(),
        minAgeHours: z.number().int().min(1).max(720),
      })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    const rule = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId, true);
      const rule = await tx.automationRule.upsert({
        where: { workspaceId },
        create: { workspaceId, createdBy: userId, ...input },
        update: { ...input, createdBy: userId },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "automation.configured",
          resourceId: workspaceId,
        },
      });
      return rule;
    });
    res.json(rule);
  });
  app.post(base + "/automation/run", async (req, res) => {
    const { workspaceId, userId } = res.locals;
    const job = await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId);
      const rule = await tx.automationRule.findUnique({
        where: { workspaceId },
      });
      if (!rule?.enabled)
        throw new ServiceError(
          409,
          "RULE_DISABLED",
          "Enable the escalation rule first",
        );
      const job = await tx.workflowJob.create({
        data: {
          workspaceId,
          actorId: userId,
          kind: "ESCALATE",
          idempotencyKey: "manual-" + randomUUID(),
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "automation.queued",
          resourceId: job.id,
        },
      });
      return job;
    });
    res.status(202).json(job);
  });
  app.put(base + "/integrations/webhook", async (req, res) => {
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    if (enabled && !config.webhookSecret)
      throw new ServiceError(
        503,
        "WEBHOOK_DISABLED",
        "Configure the webhook signing secret on the server",
      );
    await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId, true);
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { webhookEnabled: enabled },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: enabled ? "webhook.enabled" : "webhook.disabled",
          resourceId: workspaceId,
        },
      });
    });
    res.json({ enabled });
  });
  app.post(base + "/integrations/webhook-key", async (_req, res) => {
    const { workspaceId, userId } = res.locals;
    if (!config.webhookSecret)
      throw new ServiceError(
        503,
        "WEBHOOK_DISABLED",
        "Webhook signing is not configured",
      );
    await db.$transaction(async (tx) => {
      await lockMember(tx, workspaceId, userId, true);
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "webhook.key_revealed",
          resourceId: workspaceId,
        },
      });
    });
    res.set("Cache-Control", "no-store").json({
      path: "/api/hooks/" + workspaceId + "/tickets",
      key: hookKey(config.webhookSecret, workspaceId),
    });
  });
}
