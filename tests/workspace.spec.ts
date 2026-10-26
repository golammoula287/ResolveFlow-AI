import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function register(page: Page, email: string, workspace: string) {
  await page.goto("/signin");
  await page
    .getByRole("button", { name: "New here? Create a workspace" })
    .click();
  await page.getByLabel("Your name").fill("Test agent");
  await page.getByLabel("Workspace name", { exact: true }).fill(workspace);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill("browser-test-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your support, in flow." }),
  ).toBeVisible();
}
test("ticket lifecycle and email-bound invitation work across two browser sessions", async ({
  browser,
}) => {
  const suffix = randomUUID(),
    emailA = `a-${suffix}@example.test`,
    emailB = `b-${suffix}@example.test`;
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await register(a, emailA, "Workspace A");
    await register(b, emailB, "Workspace B");
    await a.getByRole("button", { name: "New ticket", exact: true }).click();
    await a.getByLabel("Subject", { exact: true }).fill("Invoice help");
    await a.getByLabel("Customer email").fill("customer@example.test");
    await a.getByLabel("Customer request").fill("Please review my invoice.");
    await a.getByRole("button", { name: "Create ticket", exact: true }).click();
    await a.getByRole("button", { name: "Invoice help", exact: true }).click();
    const dialog = a.getByRole("dialog");
    await expect(dialog.getByText("Please review my invoice.")).toBeVisible();
    await dialog
      .getByLabel("Internal note", { exact: true })
      .fill("Checking the invoice now.");
    await dialog.getByRole("button", { name: "Add note" }).click();
    await expect(dialog.getByText("Checking the invoice now.")).toBeVisible();
    await dialog.getByLabel("Status", { exact: true }).selectOption("RESOLVED");
    await expect(dialog.getByLabel("Status", { exact: true })).toHaveValue(
      "RESOLVED",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(b.getByText("Invoice help", { exact: true })).toHaveCount(0);
    await a
      .getByRole("button", { name: "People & workspaces", exact: true })
      .click();
    await a.getByLabel("Email", { exact: true }).fill(emailB);
    await a
      .getByRole("button", { name: "Create invitation", exact: true })
      .click();
    const token = await a
      .getByLabel("Invitation token · shown once")
      .inputValue();
    await b
      .getByRole("button", { name: "People & workspaces", exact: true })
      .click();
    await b.getByLabel("Invitation token", { exact: true }).fill(token);
    await b
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      b.getByRole("combobox", { name: "Workspace", exact: true }),
    ).toHaveValue(
      await a
        .getByRole("combobox", { name: "Workspace", exact: true })
        .inputValue(),
    );
    await b.getByRole("button", { name: "Ticket inbox", exact: true }).click();
    await expect(
      b.getByRole("button", { name: "Invoice help", exact: true }),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Refresh members", exact: true })
      .click();
    await a
      .getByRole("combobox", { name: "Role for " + emailB, exact: true })
      .selectOption("VIEWER");
    await b.reload();
    await expect(
      b.getByRole("button", { name: "New ticket", exact: true }),
    ).toHaveCount(0);
    await a.getByRole("button", { name: "Activity log", exact: true }).click();
    await expect(
      a.getByText("invitation accepted", { exact: true }),
    ).toBeVisible();
  } finally {
    await ca.close().catch(() => {});
    await cb.close().catch(() => {});
  }
});
