import { Redis } from "ioredis";
import {
  Queue,
  Worker,
  UnrecoverableError,
  type ConnectionOptions,
} from "bullmq";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { JobError, hashBody, type DeliveryProvider } from "./delivery.js";
import { evidenceAvailable } from "./reviews.js";
export const QUEUE = "resolveflow-workflows";
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: decodeURIComponent(u.password) || undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
export async function processJob(
  db: PrismaClient,
  workspaceId: string,
  id: string,
  provider?: DeliveryProvider,
) {
  const started = Date.now();
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    const job = await tx.workflowJob.findFirst({ where: { id, workspaceId } });
    if (!job || ["SUCCEEDED", "CANCELLED", "UNCERTAIN"].includes(job.status))
      return null;
    return tx.workflowJob.update({
      where: { id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        firstAttemptAt: job.firstAttemptAt ?? new Date(),
        dispatchedAt: job.dispatchedAt ?? new Date(),
      },
    });
  });
  if (!claimed) return;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
        const job = await tx.workflowJob.findFirstOrThrow({
          where: { id, workspaceId },
        });
        if (["SUCCEEDED", "CANCELLED", "UNCERTAIN"].includes(job.status))
          return;
        const member = await tx.membership.findUnique({
          where: { userId_workspaceId: { workspaceId, userId: job.actorId } },
        });
        if (!member || member.role === "VIEWER")
          throw new JobError("ACTOR_ACCESS_REVOKED", true);
        let result: Prisma.InputJsonValue = {};
        if (job.kind === "DELIVERY") {
          const delivery = await tx.delivery.findUniqueOrThrow({
            where: { jobId: id },
          });
          const draft = await tx.draft.findFirst({
            where: { id: delivery.draftId, workspaceId },
            include: { ticket: true },
          });
          if (
            !draft ||
            draft.status !== "APPROVED" ||
            draft.version !== delivery.version ||
            draft.approvedVersion !== delivery.version ||
            hashBody(draft.body) !== delivery.bodyHash ||
            draft.ticket.customerEmail !== delivery.recipient
          )
            throw new JobError("APPROVAL_CHANGED", true);
          const approval = await tx.draftReview.findFirst({
            where: {
              id: delivery.approvalId,
              draftId: draft.id,
              workspaceId,
              version: delivery.version,
              action: "APPROVED",
              bodyHash: delivery.bodyHash,
            },
          });
          const latestApproval = await tx.draftReview.findFirst({
            where: {
              draftId: draft.id,
              workspaceId,
              version: delivery.version,
              action: "APPROVED",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          if (latestApproval?.id !== delivery.approvalId)
            throw new JobError("APPROVAL_SUPERSEDED", true);
          const reviewer =
            approval &&
            (await tx.membership.findUnique({
              where: {
                userId_workspaceId: { workspaceId, userId: approval.actorId },
              },
            }));
          if (
            !reviewer ||
            reviewer.role === "VIEWER" ||
            !(await evidenceAvailable(tx, workspaceId, draft.citations))
          )
            throw new JobError("APPROVAL_OR_SOURCE_REVOKED", true);
          if (!provider || provider.name !== delivery.provider)
            throw new JobError("DELIVERY_NOT_CONFIGURED", true);
          // Resend's idempotency retention is 24h. Stop uncertain retries before that window expires.
          if (Date.now() - (job.firstAttemptAt?.getTime() ?? 0) > 23 * 3600000)
            throw new JobError("IDEMPOTENCY_WINDOW_EXPIRED", true);
          const receipt = await provider.send({
            id: delivery.id,
            recipient: delivery.recipient,
            subject: delivery.subject,
            body: delivery.body,
          });
          await tx.delivery.update({
            where: { id: delivery.id },
            data: { status: receipt.outcome, providerId: receipt.id },
          });
          result = { providerId: receipt.id, outcome: receipt.outcome };
        } else if (job.kind === "ESCALATE") {
          const rule = await tx.automationRule.findUnique({
            where: { workspaceId },
          });
          if (!rule?.enabled) throw new JobError("RULE_DISABLED", true);
          const tickets = await tx.ticket.findMany({
            where: {
              workspaceId,
              status: "OPEN",
              priority: { in: ["LOW", "NORMAL"] },
              createdAt: {
                lte: new Date(Date.now() - rule.minAgeHours * 3600000),
              },
            },
            select: { id: true },
            take: 1000,
          });
          for (const t of tickets) {
            await tx.ticket.updateMany({
              where: {
                id: t.id,
                workspaceId,
                status: "OPEN",
                priority: { in: ["LOW", "NORMAL"] },
              },
              data: { priority: "HIGH" },
            });
            await tx.auditEvent.create({
              data: {
                workspaceId,
                actorId: job.actorId,
                action: "ticket.escalated",
                resourceId: t.id,
              },
            });
          }
          result = { escalated: tickets.length };
        } else throw new JobError("UNKNOWN_JOB_KIND", true);
        await tx.workflowJob.update({
          where: { id },
          data: { status: "SUCCEEDED", result, lastError: null },
        });
        await tx.jobAttempt.create({
          data: {
            jobId: id,
            workspaceId,
            number: claimed.attempts,
            status: "SUCCEEDED",
            durationMs: Date.now() - started,
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: job.actorId,
            action: "job.succeeded",
            resourceId: id,
          },
        });
      },
      { timeout: 20000, maxWait: 20000 },
    );
  } catch (error) {
    const failure =
      error instanceof JobError ? error : new JobError("JOB_PROCESSING_FAILED");
    const status =
      failure.code === "IDEMPOTENCY_WINDOW_EXPIRED"
        ? "UNCERTAIN"
        : failure.permanent
          ? "CANCELLED"
          : claimed.attempts % 3 === 0
            ? "FAILED"
            : "QUEUED";
    await db.$transaction(async (tx) => {
      await tx.workflowJob.updateMany({
        where: { id, workspaceId, status: { not: "SUCCEEDED" } },
        data: { status, lastError: failure.code },
      });
      await tx.delivery.updateMany({
        where: {
          jobId: id,
          status: { notIn: ["ACCEPTED", "DELIVERED", "LOCAL_CAPTURED"] },
        },
        data: {
          status:
            status === "UNCERTAIN"
              ? "UNCERTAIN"
              : failure.permanent
                ? "CANCELLED"
                : "FAILED",
        },
      });
      await tx.jobAttempt.create({
        data: {
          jobId: id,
          workspaceId,
          number: claimed.attempts,
          status: "FAILED",
          errorCode: failure.code,
          durationMs: Date.now() - started,
        },
      });
    });
    if (failure.permanent) throw new UnrecoverableError(failure.code);
    throw failure;
  }
}
export function startWorkflows(
  db: PrismaClient,
  redisUrl: string,
  provider?: DeliveryProvider,
  options: { pollMs?: number; backoffMs?: number; heartbeatId?: string } = {},
) {
  const connection = redisConnection(redisUrl);
  const queue = new Queue(QUEUE, {
    connection: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  });
  const worker = new Worker(
    QUEUE,
    async (job) => {
      const { id, workspaceId } = z
        .object({ id: z.string(), workspaceId: z.string() })
        .parse(job.data);
      await processJob(db, workspaceId, id, provider);
    },
    { connection, concurrency: 4 },
  );
  worker.on("error", () =>
    console.error(
      JSON.stringify({ level: "error", event: "worker.connection_error" }),
    ),
  );
  worker.on("failed", (job, error) =>
    console.error(
      JSON.stringify({
        level: "error",
        event: "job.failed",
        jobId: job?.id,
        code: error.message,
      }),
    ),
  );
  let active = false;
  let closing = false;
  const heartbeatId = options.heartbeatId ?? "main";
  async function dispatch() {
    if (active || closing) return;
    active = true;
    try {
      await queue.getJobCounts("waiting");
      await db.workerHeartbeat.upsert({
        where: { id: heartbeatId },
        create: { id: heartbeatId },
        update: { updatedAt: new Date() },
      });
      const rules = await db.automationRule.findMany({
        where: { enabled: true },
        take: 500,
      });
      for (const r of rules) {
        const key = "scheduled-escalation-" + Math.floor(Date.now() / 3600000);
        await db.workflowJob.upsert({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: r.workspaceId,
              idempotencyKey: key,
            },
          },
          create: {
            workspaceId: r.workspaceId,
            idempotencyKey: key,
            kind: "ESCALATE",
            actorId: r.createdBy,
          },
          update: {},
        });
      }
      const jobs = await db.workflowJob.findMany({
        where: {
          OR: [
            { status: "PENDING" },
            {
              status: "QUEUED",
              dispatchedAt: { lt: new Date(Date.now() - 60000) },
            },
            {
              status: "RUNNING",
              updatedAt: { lt: new Date(Date.now() - 120000) },
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      for (const j of jobs) {
        await queue.add(
          j.kind,
          { id: j.id, workspaceId: j.workspaceId },
          {
            jobId: j.id + "-" + j.generation,
            attempts: 3,
            backoff: { type: "exponential", delay: options.backoffMs ?? 1000 },
            removeOnComplete: { age: 86400, count: 10000 },
            removeOnFail: false,
          },
        );
        await db.workflowJob.updateMany({
          where: { id: j.id, status: { in: ["PENDING", "QUEUED"] } },
          data: { status: "QUEUED", dispatchedAt: new Date() },
        });
      }
    } catch {
      console.error(
        JSON.stringify({ level: "error", event: "outbox.dispatch_failed" }),
      );
    } finally {
      active = false;
    }
  }
  const timer = setInterval(() => void dispatch(), options.pollMs ?? 2000);
  const ready = dispatch();
  return {
    queue,
    ready,
    worker,
    dispatch,
    async close() {
      closing = true;
      clearInterval(timer);
      while (active) await new Promise((resolve) => setTimeout(resolve, 25));
      await worker.close();
      await queue.close();
    },
  };
}

// Bounded invocation for Vercel Cron or an authenticated manual dispatch.
export async function runWorkflowBatch(
  db: PrismaClient,
  redisUrl: string,
  provider?: DeliveryProvider,
  durationMs = 12000,
) {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
  } finally {
    probe.disconnect();
  }
  const service = startWorkflows(db, redisUrl, provider, {
    pollMs: 2000,
    heartbeatId: "cron",
  });
  try {
    await service.ready;
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      const counts = await service.queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
      );
      if (!counts.waiting && !counts.active && !counts.delayed) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await service.close();
  }
}
