import { createHash, randomBytes } from "node:crypto";
import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
class WorkflowError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
// Lock the workspace before membership changes so concurrent removals cannot delete the last owner.
async function owner(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const membership = await tx.membership.findUnique({
    where: { userId_workspaceId: { workspaceId, userId } },
  });
  if (!membership) throw new WorkflowError(404, "Workspace not found");
  if (membership.role !== "OWNER")
    throw new WorkflowError(403, "Workspace owner access required");
}
export function workspaceRoutes(app: Express, db: PrismaClient) {
  app.post("/api/workspaces", async (req, res) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(req.body);
    const userId = res.locals.userId;
    const workspace = await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name, memberships: { create: { userId, role: "OWNER" } } },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: workspace.id,
          actorId: userId,
          action: "workspace.created",
          resourceId: workspace.id,
        },
      });
      return workspace;
    });
    res.status(201).json(workspace);
  });
  app.post("/api/invitations/accept", async (req, res, next) => {
    try {
      const { token } = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body);
      const userId = res.locals.userId;
      const result = await db.$transaction(async (tx) => {
        const invitation = await tx.invitation.findUnique({
          where: { tokenHash: hash(token) },
        });
        if (!invitation)
          throw new WorkflowError(404, "Invitation not available");
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${invitation.workspaceId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.email !== invitation.email)
          throw new WorkflowError(
            403,
            "Sign in with the invited email address",
          );
        const claimed = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
        if (!claimed.count)
          throw new WorkflowError(409, "Invitation expired or already used");
        const existing = await tx.membership.findUnique({
          where: {
            userId_workspaceId: { userId, workspaceId: invitation.workspaceId },
          },
        });
        if (existing)
          throw new WorkflowError(409, "Already a workspace member");
        await tx.membership.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId,
            role: invitation.role,
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: invitation.workspaceId,
            actorId: userId,
            action: "invitation.accepted",
            resourceId: invitation.id,
          },
        });
        return { workspaceId: invitation.workspaceId };
      });
      res.json(result);
    } catch (error) {
      if (error instanceof WorkflowError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    }
  });
  // All management routes below resolve owner authorization inside the transaction.
  app.all(
    "/api/workspaces/:workspaceId/manage/{*path}",
    async (req, res, next) => {
      try {
        const workspaceId = z.string().parse(req.params.workspaceId),
          userId = res.locals.userId;
        const path = req.path.split("/manage/")[1];
        const result = await db.$transaction(async (tx) => {
          await owner(tx, workspaceId, userId);
          const audit = async (action: string, resourceId: string) =>
            tx.auditEvent.create({
              data: { workspaceId, actorId: userId, action, resourceId },
            });
          if (path === "invitations" && req.method === "GET")
            return {
              status: 200,
              data: await tx.invitation.findMany({
                where: { workspaceId },
                select: {
                  id: true,
                  email: true,
                  role: true,
                  expiresAt: true,
                  acceptedAt: true,
                  revokedAt: true,
                  createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: 100,
              }),
            };
          if (path === "invitations" && req.method === "POST") {
            const input = z
              .object({
                email: z
                  .email()
                  .max(254)
                  .transform((v) => v.toLowerCase()),
                role: z.enum(["OWNER", "AGENT", "VIEWER"]),
              })
              .parse(req.body);
            const existing = await tx.membership.findFirst({
              where: { workspaceId, user: { email: input.email } },
            });
            if (existing)
              throw new WorkflowError(409, "Already a workspace member");
            const token = randomBytes(32).toString("hex");
            const invitation = await tx.invitation.create({
              data: {
                workspaceId,
                ...input,
                tokenHash: hash(token),
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
              select: { id: true, email: true, role: true, expiresAt: true },
            });
            await audit("invitation.created", invitation.id);
            return { status: 201, data: { ...invitation, token } };
          }
          const revoke = /^invitations\/([^/]+)$/.exec(path);
          if (revoke && req.method === "DELETE") {
            const result = await tx.invitation.updateMany({
              where: {
                id: revoke[1],
                workspaceId,
                acceptedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: new Date() },
            });
            if (!result.count)
              throw new WorkflowError(404, "Pending invitation not found");
            await audit("invitation.revoked", revoke[1]);
            return { status: 200, data: { ok: true } };
          }
          const member = /^members\/([^/]+)$/.exec(path);
          if (member && ["PATCH", "DELETE"].includes(req.method)) {
            const target = await tx.membership.findUnique({
              where: { userId_workspaceId: { workspaceId, userId: member[1] } },
            });
            if (!target) throw new WorkflowError(404, "Member not found");
            const role =
              req.method === "PATCH"
                ? z
                    .object({ role: z.enum(["OWNER", "AGENT", "VIEWER"]) })
                    .parse(req.body).role
                : null;
            if (
              target.role === "OWNER" &&
              role !== "OWNER" &&
              (await tx.membership.count({
                where: { workspaceId, role: "OWNER" },
              })) <= 1
            )
              throw new WorkflowError(
                409,
                "The workspace must retain an owner",
              );
            if (role)
              await tx.membership.update({
                where: {
                  userId_workspaceId: { workspaceId, userId: member[1] },
                },
                data: { role },
              });
            else {
              await tx.ticket.updateMany({
                where: { workspaceId, assigneeId: member[1] },
                data: { assigneeId: null },
              });
              await tx.membership.delete({
                where: {
                  userId_workspaceId: { workspaceId, userId: member[1] },
                },
              });
            }
            await audit(
              role ? "member.role_changed" : "member.removed",
              member[1],
            );
            return { status: 200, data: { ok: true } };
          }
          throw new WorkflowError(404, "Route not found");
        });
        res.status(result.status).json(result.data);
      } catch (error) {
        if (error instanceof WorkflowError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );
}
