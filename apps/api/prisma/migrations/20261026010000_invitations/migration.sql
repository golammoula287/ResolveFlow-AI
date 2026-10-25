CREATE TABLE "Invitation" (
 "id" TEXT NOT NULL,
 "workspaceId" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "role" "Role" NOT NULL,
 "tokenHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "acceptedAt" TIMESTAMP(3),
 "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_workspaceId_email_idx" ON "Invitation"("workspaceId", "email");
