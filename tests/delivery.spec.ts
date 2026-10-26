import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, copyFile } from "node:fs/promises";
const capture = process.env.CAPTURE_DEMO === "1";
test.use({ video: "on", viewport: { width: 1440, height: 1000 } });
test("human response reaches approved local capture through the real Redis worker", async ({
  page,
}) => {
  test.setTimeout(capture ? 150000 : 45000);
  async function scene(text: string, ms: number) {
    if (!capture) return;
    await page.evaluate((text) => {
      let el = document.getElementById("demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "demo-caption";
        el.style.cssText =
          "position:fixed;bottom:15px;left:50%;transform:translateX(-50%);background:#103c37;color:white;padding:14px 24px;border-radius:9px;z-index:10000;font:14px sans-serif;box-shadow:0 3px 12px #0004;max-width:90vw;";
        document.body.appendChild(el);
      }
      el.textContent = text;
    }, text);
    await page.waitForTimeout(ms);
  }
  const email = `delivery-${randomUUID()}@example.test`;
  await page.goto("/signin");
  await scene(
    "ResolveFlow: real support workflow with human-written evidence-backed responses. No AI call is simulated.",
    8000,
  );
  await page
    .getByRole("button", { name: "New here? Create a workspace" })
    .click();
  await page.getByLabel("Your name").fill("Demo support owner");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Northstar Demo");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill("delivery-browser-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your support, in flow." }),
  ).toBeVisible();
  await scene(
    "Each account belongs to an authorized workspace. All records in this walkthrough are synthetic.",
    7000,
  );
  const me = await (
    await page.request.get("http://localhost:4000/api/me")
  ).json();
  const base =
    "http://localhost:4000/api/workspaces/" + me.memberships[0].workspaceId;
  const origin = { Origin: "http://localhost:5173" };
  const doc = await (
    await page.request.post(base + "/documents", {
      headers: origin,
      data: {
        title: "Demo refund policy",
        filename: "refunds.txt",
        content:
          "Refund requests are accepted within 30 calendar days. Contact support with the invoice number.",
      },
    })
  ).json();
  await page.request.patch(base + "/documents/" + doc.id, {
    headers: origin,
    data: { approved: true },
  });
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await expect(
    page.getByText("Demo refund policy", { exact: true }),
  ).toBeVisible();
  await scene(
    "Only owner-approved knowledge is retrievable. Groq can generate cited drafts when a live key is configured.",
    9000,
  );
  if (capture) {
    await mkdir("docs/artifacts", { recursive: true });
    await page.screenshot({
      path: "docs/artifacts/knowledge.png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Ticket inbox", exact: true }).click();
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByLabel("Subject", { exact: true }).fill("Refund request");
  await page
    .getByLabel("Customer email")
    .fill("synthetic-customer@example.test");
  await page.getByLabel("Customer request").fill("Can I request a refund?");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await scene(
    "A customer request becomes a persisted ticket, with assignment, status and an audit history.",
    7000,
  );
  if (capture)
    await page.screenshot({ path: "docs/artifacts/inbox.png", fullPage: true });
  await page
    .getByRole("button", { name: "Refund request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Write manual response", exact: true })
    .click();
  await page
    .getByLabel("Manual response", { exact: true })
    .fill(
      "You can request a refund within 30 calendar days. Please provide the invoice number to support.",
    );
  await page.getByLabel("Find evidence", { exact: true }).fill("refund");
  await page
    .getByRole("button", { name: "Find source passages", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Demo refund policy/ }).check();
  await scene(
    "This response is explicitly human-written. Approved source passages are attached for the reviewer.",
    10000,
  );
  await page
    .getByRole("button", { name: "Submit manual draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I checked this response against its cited sources.",
      exact: true,
    })
    .check();
  await scene(
    "A human checks the claims and sources. Approval binds to an exact response version.",
    10000,
  );
  await page
    .getByRole("button", { name: "Approve version 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.getByText(/Approved version 1/)).toBeVisible();
  if (capture)
    await page.screenshot({
      path: "docs/artifacts/approval.png",
      fullPage: true,
    });
  await scene(
    "Edits or withdrawn sources invalidate approval. Customer delivery requires a separate explicit confirmation.",
    9000,
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Queue approved delivery", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    /local capture, no email sent/,
  );
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page
    .getByRole("button", { name: "Process pending jobs", exact: true })
    .click();
  await expect(page.getByText("LOCAL_CAPTURED", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await scene(
    "A real BullMQ/Redis worker processed the approved response. Local mode wrote a capture file; no email was sent.",
    10000,
  );
  if (capture)
    await page.screenshot({
      path: "docs/artifacts/workflows.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  await expect(
    page.getByText("delivery queued", { exact: true }),
  ).toBeVisible();
  await scene(
    "Every change, approval and workflow outcome has a tenant-scoped audit record.",
    10000,
  );
  if (capture)
    await page.screenshot({ path: "docs/artifacts/audit.png", fullPage: true });
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await scene(
    "Vercel-ready: hosted PostgreSQL and Redis, authenticated bounded job processing, and signed webhooks. Live AI/email need configured credentials.",
    10000,
  );
  if (capture) {
    const video = page.video();
    await page.close();
    await copyFile(await video!.path(), "docs/artifacts/walkthrough.webm");
  }
});
