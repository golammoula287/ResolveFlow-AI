import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("inbox supports pagination, filters, assignment, secure sign-in and mobile dialogs", async ({
  page,
}) => {
  const email = `inbox-${randomUUID()}@example.test`,
    password = "inbox-browser-password-123";
  await page.goto("/signin");
  await page
    .getByRole("button", { name: "New here? Create a workspace" })
    .click();
  await page.getByLabel("Your name").fill("Inbox tester");
  await page.getByLabel("Workspace name", { exact: true }).fill("Inbox tests");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your support, in flow." }),
  ).toBeVisible();
  const me = await (
    await page.request.get("http://localhost:4000/api/me")
  ).json();
  const base =
    "http://localhost:4000/api/workspaces/" + me.memberships[0].workspaceId;
  for (let i = 0; i < 21; i++) {
    const response = await page.request.post(base + "/tickets", {
      headers: { Origin: "http://localhost:5173" },
      data: {
        subject: `Searchable ticket ${String(i).padStart(2, "0")}`,
        customerEmail: "synthetic@example.test",
        body: "Test request",
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await expect(
    page.getByText("21 matching tickets · Page 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("21 matching tickets · Page 2", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByLabel("Search tickets").fill("ticket 20");
  await expect(
    page.getByRole("button", { name: "Searchable ticket 20", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Searchable ticket 20", exact: true })
    .click();
  await page.getByLabel("Assignee", { exact: true }).selectOption(me.id);
  await page.getByLabel("Status", { exact: true }).selectOption("RESOLVED");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Searchable ticket 20", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Inbox tester Sign out/ }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your support, in flow." }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL("/app");
  await expect(
    page.getByRole("heading", { name: "Your support, in flow." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
