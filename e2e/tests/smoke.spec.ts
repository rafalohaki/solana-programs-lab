import { expect, test } from "@playwright/test";

// Stack: frontend :3725 → proxy /api/* → backend :3001 (internal).
// Site is English by default; PL via the header toggle (persisted).

test("home renders in English by default", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("body")).toContainText(/Subscriptions that live/i);
});

test("language toggle switches to Polish and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Language / Język" }).getByRole("button", { name: "pl" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.locator("body")).toContainText(/Subskrypcje, które żyją/i);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
});

test("merchant page renders plan form and invoice panel", async ({ page }) => {
  const res = await page.goto("/merchant");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/Create a plan/i);
  await expect(page.locator("body")).toContainText(/Recurring invoices/i);
});

test("examples gallery renders use cases", async ({ page }) => {
  const res = await page.goto("/examples");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/widget|example|use case/i);
});

test("pay gate rejects missing plan", async ({ request }) => {
  const res = await request.get("/pay");
  expect(res.status()).toBe(400);
});

test("actions proxy serves plan metadata", async ({ request }) => {
  const res = await request.get(
    "/api/actions/plan?merchant=11111111111111111111111111111111&planId=1&mint=4zMMC9srt5Ri5X14GAgXhaHii3rxKWbyF5VHsNe9Q&amount=1000000&period=30",
  );
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { title?: string; label?: string };
  expect(json.title ?? json.label).toBeTruthy();
});

test("backend reachable through proxy (report validation)", async ({ request }) => {
  // No invoice param → backend 400 proves the full proxy path works.
  const res = await request.get("/api/actions/report");
  expect(res.status()).toBe(400);
});
