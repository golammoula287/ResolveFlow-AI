import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
test("review queue binds approval to a version and keeps revision/rejection history", async ({
  page,
}) => {
  const db = new PrismaClient({
    datasources: {
      db: { url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL },
    },
  });
  try {
    const email = `review-${randomUUID()}@example.test`;
    await page.goto("/signin");
    await page
      .getByRole("button", { name: "New here? Create a workspace" })
      .click();
    await page.getByLabel("Your name").fill("Browser reviewer");
    await page
      .getByLabel("Workspace name", { exact: true })
      .fill("Review workspace");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel(/^Password/).fill("review-browser-password-123");
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ticket inbox" }),
    ).toBeVisible();
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    const workspaceId = user.memberships[0].workspaceId;
    // Synthetic, hand-authored browser fixture: no model output or paid provider call is simulated by the app.
    const doc = await db.knowledgeDocument.create({
      data: {
        workspaceId,
        title: "Browser fixture refund policy",
        filename: "fixture.txt",
        contentHash: "browser-fixture",
        createdBy: user.id,
        approved: true,
        chunks: {
          create: {
            ordinal: 0,
            content: "Refunds are available within 30 days.",
          },
        },
      },
      include: { chunks: true },
    });
    const citations = [
      {
        documentId: doc.id,
        chunkId: doc.chunks[0].id,
        title: doc.title,
        version: 1,
        quote: "within 30 days",
        claim: "Refunds are available within 30 days.",
      },
    ];
    const ticket = await db.ticket.create({
      data: {
        workspaceId,
        subject: "Browser review request",
        customerEmail: "fixture@example.test",
      },
    });
    await db.$transaction(async (tx) => {
      const draft = await tx.draft.create({
        data: {
          workspaceId,
          ticketId: ticket.id,
          status: "DRAFT",
          body: "Refunds are available within 30 days.",
          createdBy: user.id,
          citations,
        },
      });
      await tx.draftRevision.create({
        data: {
          draftId: draft.id,
          workspaceId,
          version: 1,
          body: draft.body,
          citations,
          changedBy: user.id,
        },
      });
    });
    await page
      .getByRole("button", { name: "Review queue", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Browser review request",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve version 1", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: "I checked this response against its cited sources.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Approve version 1", exact: true })
      .click();
    await expect(
      page.getByText("No drafts in this queue.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approved", exact: true }).click();
    await expect(page.getByText(/Approved version 1/)).toBeVisible();
    await page
      .getByRole("button", { name: "Edit response", exact: true })
      .click();
    await page
      .getByLabel("Response text", { exact: true })
      .fill("Please request your refund within 30 days.");
    await page
      .getByRole("button", { name: "Save revision", exact: true })
      .click();
    await expect(
      page.getByText("No drafts in this queue.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pending review", exact: true })
      .click();
    await expect(
      page.getByText("Please request your refund within 30 days.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve version 2", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reject draft", exact: true })
      .click();
    await page
      .getByLabel("Rejection reason", { exact: true })
      .fill("Clarify how customers contact support.");
    await page
      .getByRole("button", { name: "Confirm rejection", exact: true })
      .click();
    await expect(
      page.getByText("No drafts in this queue.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rejected", exact: true }).click();
    await expect(
      page.getByText(
        "Rejection reason: Clarify how customers contact support.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View review history", exact: true })
      .click();
    await expect(
      page.getByText(/APPROVED · version 1 · Browser reviewer/),
    ).toBeVisible();
    await expect(
      page.getByText(/INVALIDATED · version 1 · Browser reviewer/),
    ).toBeVisible();
    await expect(
      page.getByText(/REJECTED · version 2 · Browser reviewer/),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
