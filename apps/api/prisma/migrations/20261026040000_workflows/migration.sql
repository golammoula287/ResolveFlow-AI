ALTER TABLE "Draft" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'AI';
ALTER TABLE "Workspace" ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "seriesId" TEXT;
UPDATE "KnowledgeDocument" SET "seriesId"="id";
ALTER TABLE "KnowledgeDocument" ALTER COLUMN "seriesId" SET NOT NULL;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "supersedesId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "approvalId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minAgeHours" INTEGER NOT NULL DEFAULT 24,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionFailure" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowJob_workspaceId_createdAt_idx" ON "WorkflowJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowJob_status_dispatchedAt_idx" ON "WorkflowJob"("status", "dispatchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowJob_workspaceId_idempotencyKey_key" ON "WorkflowJob"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowJob_id_workspaceId_key" ON "WorkflowJob"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "JobAttempt_workspaceId_jobId_createdAt_idx" ON "JobAttempt"("workspaceId", "jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_jobId_key" ON "Delivery"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_providerId_key" ON "Delivery"("providerId");

-- CreateIndex
CREATE INDEX "Delivery_workspaceId_createdAt_idx" ON "Delivery"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_jobId_workspaceId_key" ON "Delivery"("jobId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_workspaceId_draftId_version_key" ON "Delivery"("workspaceId", "draftId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_workspaceId_eventId_key" ON "WebhookEvent"("workspaceId", "eventId");

-- CreateIndex
CREATE INDEX "IngestionFailure_workspaceId_createdAt_idx" ON "IngestionFailure"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowJob" ADD CONSTRAINT "WorkflowJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_workspaceId_fkey" FOREIGN KEY ("jobId", "workspaceId") REFERENCES "WorkflowJob"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_jobId_workspaceId_fkey" FOREIGN KEY ("jobId", "workspaceId") REFERENCES "WorkflowJob"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_draftId_workspaceId_fkey" FOREIGN KEY ("draftId", "workspaceId") REFERENCES "Draft"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngestionFailure" ADD CONSTRAINT "IngestionFailure_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "KnowledgeDocument_workspaceId_seriesId_version_key" ON "KnowledgeDocument"("workspaceId","seriesId","version");
ALTER TABLE "Delivery" ADD COLUMN "providerEventAt" TIMESTAMP(3);
