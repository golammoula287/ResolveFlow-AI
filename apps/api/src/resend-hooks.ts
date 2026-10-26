import express, { type Express } from "express";
import { Webhook } from "svix";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ServiceError } from "./ai.js";
import { createHash } from "node:crypto";
export function resendHooks(app: Express, db: PrismaClient, secret?: string) {
  app.post(
    "/api/hooks/resend",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      if (!secret)
        throw new ServiceError(
          503,
          "WEBHOOK_DISABLED",
          "Resend webhook not configured",
        );
      let payload: unknown;
      try {
        new Webhook(secret).verify(req.body.toString("utf8"), {
          "svix-id": String(req.headers["svix-id"] ?? ""),
          "svix-timestamp": String(req.headers["svix-timestamp"] ?? ""),
          "svix-signature": String(req.headers["svix-signature"] ?? ""),
        });
      } catch {
        throw new ServiceError(
          401,
          "INVALID_SIGNATURE",
          "Invalid webhook signature",
        );
      }
      payload = JSON.parse(req.body.toString("utf8"));
      const event = z
        .object({
          type: z.string(),
          created_at: z.iso.datetime().optional(),
          data: z.object({ email_id: z.string() }),
        })
        .parse(payload);
      const statuses: Record<string, string> = {
        "email.delivered": "DELIVERED",
        "email.bounced": "BOUNCED",
        "email.failed": "FAILED",
        "email.complained": "COMPLAINED",
      };
      const status = statuses[event.type];
      if (!status) {
        res.json({ ignored: true });
        return;
      }
      const delivery = await db.delivery.findUnique({
        where: { providerId: event.data.email_id },
        include: { draft: { select: { ticketId: true } } },
      });
      if (!delivery || delivery.provider !== "resend") {
        res.status(503).json({
          error: "Delivery receipt not recorded yet; retry this event",
        });
        return;
      }
      const eventId = "resend-" + String(req.headers["svix-id"]);
      const hash = createHash("sha256").update(req.body).digest("hex");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${delivery.workspaceId} FOR UPDATE`;
        const previous = await tx.webhookEvent.findUnique({
          where: {
            workspaceId_eventId: { workspaceId: delivery.workspaceId, eventId },
          },
        });
        if (previous) return;
        await tx.webhookEvent.create({
          data: {
            workspaceId: delivery.workspaceId,
            eventId,
            payloadHash: hash,
            ticketId: delivery.draft.ticketId,
          },
        });
        const current = await tx.delivery.findUniqueOrThrow({
          where: { id: delivery.id },
        });
        const eventAt = event.created_at
          ? new Date(event.created_at)
          : new Date(Number(req.headers["svix-timestamp"]) * 1000);
        if (current.providerEventAt && current.providerEventAt >= eventAt)
          return;
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status, providerEventAt: eventAt },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: delivery.workspaceId,
            actorId: "resend-webhook",
            action: "delivery." + status.toLowerCase(),
            resourceId: delivery.id,
          },
        });
      });
      res.json({ ok: true });
    },
  );
}
