ALTER TABLE "Draft" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "reviewedBy" TEXT,
 ADD COLUMN "reviewedAt" TIMESTAMP(3),
 ADD COLUMN "approvedVersion" INTEGER,
 ADD COLUMN "rejectionReason" TEXT;
CREATE UNIQUE INDEX "Draft_id_workspaceId_key" ON "Draft"("id","workspaceId");
CREATE INDEX "Draft_workspaceId_status_updatedAt_idx" ON "Draft"("workspaceId","status","updatedAt");
CREATE TABLE "DraftRevision" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "draftId" TEXT NOT NULL,
 "workspaceId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 "body" TEXT NOT NULL,
 "citations" JSONB NOT NULL,
 "changedBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DraftRevision_draftId_workspaceId_fkey" FOREIGN KEY ("draftId","workspaceId") REFERENCES "Draft"("id","workspaceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DraftRevision_draftId_workspaceId_version_key" ON "DraftRevision"("draftId","workspaceId","version");
INSERT INTO "DraftRevision" ("id","draftId","workspaceId","version","body","citations","changedBy","createdAt") SELECT 'initial_'||"id","id","workspaceId",1,"body","citations","createdBy","createdAt" FROM "Draft";
CREATE TABLE "DraftReview" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "draftId" TEXT NOT NULL,
 "workspaceId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 "action" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "reason" TEXT,
 "bodyHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DraftReview_draftId_workspaceId_fkey" FOREIGN KEY ("draftId","workspaceId") REFERENCES "Draft"("id","workspaceId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DraftReview_draftId_workspaceId_version_fkey" FOREIGN KEY ("draftId","workspaceId","version") REFERENCES "DraftRevision"("draftId","workspaceId","version") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DraftReview_workspaceId_draftId_createdAt_idx" ON "DraftReview"("workspaceId","draftId","createdAt");
