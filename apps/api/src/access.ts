import { Prisma } from "@prisma/client";
import { ServiceError } from "./ai.js";
export async function lockMember(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  owner = false,
) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
  const m = await tx.membership.findUnique({
    where: { userId_workspaceId: { workspaceId, userId } },
  });
  if (!m) throw new ServiceError(404, "NOT_FOUND", "Workspace not found");
  if (m.role === "VIEWER" || (owner && m.role !== "OWNER"))
    throw new ServiceError(
      403,
      "FORBIDDEN",
      owner ? "Owner access required" : "Read-only workspace access",
    );
}
