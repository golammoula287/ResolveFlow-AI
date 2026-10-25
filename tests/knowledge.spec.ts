import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("knowledge approval, source search, withdrawal and honest draft abstention", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create a workspace" })
    .click();
  await page.getByLabel("Your name").fill("Knowledge owner");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Knowledge browser test");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`kb-${randomUUID()}@example.test`);
  await page.getByLabel(/^Password/).fill("knowledge-browser-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await expect(
    page.getByText("AI provider not configured", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Refund policy");
  await page
    .getByLabel("Text or Markdown file", { exact: true })
    .setInputFiles({
      name: "refunds.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "Refunds are available within 30 days. Contact support with an invoice.",
      ),
    });
  await expect(
    page.getByLabel("Document content", { exact: true }),
  ).toHaveValue(/Refunds are available/);
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await expect(
    page.getByText("Pending approval", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Knowledge query", { exact: true }).fill("refund");
  await page
    .getByRole("button", { name: "Search knowledge", exact: true })
    .click();
  await expect(
    page.getByText("No approved passages matched this search.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Search knowledge", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refund policy · version 1", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(
        "Refunds are available within 30 days. Contact support with an invoice.",
        { exact: true },
      ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Index for AI", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page
    .getByRole("button", { name: "Search knowledge", exact: true })
    .click();
  await expect(
    page.getByText("No approved passages matched this search.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ticket inbox", exact: true }).click();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByLabel("Subject", { exact: true }).fill("Refund inquiry");
  await page.getByLabel("Customer email").fill("customer@example.test");
  await page.getByLabel("Customer request").fill("What is the refund policy?");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refund inquiry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(
    page.getByText(
      "No approved evidence matched this request. Add or approve relevant knowledge before drafting.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/INSUFFICIENT EVIDENCE/)).toBeVisible();
});
