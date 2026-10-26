import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("public home explains the product and connects signup, signin and browser history", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your support team, on the same page.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Actual product screenshots. Synthetic demo data.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "The knowledge", exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute(
    "src",
    "/product-knowledge.png",
  );
  await page.getByRole("tab", { name: "The review", exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute(
    "src",
    "/product-review.png",
  );
  await page.getByRole("tab", { name: "The inbox", exact: true }).click();
  await expect(
    page.locator(
      ".marketing svg.lucide-arrow-right, .marketing svg.lucide-arrow-up-right, .marketing svg.lucide-chevron-right",
    ),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "See how it works", exact: true })
    .click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(
    page.getByRole("heading", { name: "Bring the request in", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Does AI send customer replies automatically?", { exact: true })
    .click();
  await expect(
    page.getByText(/No\. AI creates an internal draft from approved evidence/),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Create your workspace", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/signup");
  await expect(
    page.getByRole("heading", { name: "Start a new workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Workspace name", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/signin");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/");
  await mkdir("docs/artifacts", { recursive: true });
  await page.screenshot({
    path: "docs/artifacts/home-desktop.png",
    fullPage: true,
  });
});
test("public home navigation and signup work on mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await toggle.click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "FAQ", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("link", { name: "Get started", exact: true }).click();
  await expect(page).toHaveURL("/signup");
  await expect(
    page.getByRole("heading", { name: "Start a new workspace", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await page.screenshot({
    path: "docs/artifacts/home-mobile.png",
    fullPage: true,
  });
});
