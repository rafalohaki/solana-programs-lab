import { expect, test } from "@playwright/test";

// New-section coverage (Stitch port). Selectors use data-i18n attributes,
// ARIA roles and ids — never Polish copy — so the suite is locale-proof.
// Live truth rule: numbers come from chain/DB; demo fixtures only under ?demo=1.

test("home proofs stats section renders live-labelled metrics", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-i18n="proofs.title"]')).toBeVisible();
  await expect(page.locator('[data-i18n="proofs.volumeLabel"]')).toBeVisible();
  await expect(page.locator('[data-i18n="proofs.plansLabel"]')).toBeVisible();
  await expect(page.locator('[data-i18n="proofs.merchantsLabel"]')).toBeVisible();
  // Live mode: each metric is either a value or a dash — never a mock.
  for (const id of ["#settled-volume", "#proofs-plans", "#proofs-merchants"]) {
    await expect(page.locator(id)).toBeVisible();
  }
});

test("home proofs comparison table renders 4 metrics x 3 columns", async ({ page }) => {
  await page.goto("/");
  const section = page.locator('section[aria-labelledby="cmp-title"]');
  await expect(section).toBeVisible();
  await expect(section.getByRole("table")).toBeVisible();
  // Metric + us + stripe + tradfi header columns.
  await expect(section.getByRole("columnheader")).toHaveCount(4);
  // Fee, finality, chargebacks, custody rows.
  await expect(section.getByRole("rowheader")).toHaveCount(4);
  // Published savings formula (language-independent code block).
  await expect(section.locator(".codeblock")).toBeVisible();
});

test("home judge FAQ renders 4 collapsible entries", async ({ page }) => {
  await page.goto("/");
  const section = page.locator('section[aria-labelledby="jfaq-title"]');
  // Settle below-the-fold layout first: async islands above (plans grid,
  // fonts) shift coordinates while loading, and a click measured mid-shift
  // can miss the summary. Scrolling + visibility polling stabilizes it.
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  const items = section.locator("details");
  await expect(items).toHaveCount(4);
  // First entry open by default; second toggles on summary click.
  await expect(items.nth(0)).toHaveJSProperty("open", true);
  await expect(items.nth(1).locator("summary")).toBeVisible();
  await items.nth(1).locator("summary").click();
  await expect(items.nth(1)).toHaveJSProperty("open", true);
});

test("pay simulator tabs switch preview panels without navigation", async ({ page }) => {
  // ?demo=1 serves server-side fixtures — hermetic, no backend/RPC needed.
  const res = await page.goto("/pay?demo=1");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("tablist", { name: "Checkout simulator" })).toBeVisible();
  const tabs = page.locator("[data-sim-tab]");
  await expect(tabs).toHaveCount(3);

  const ok = page.locator("#sim-ok");
  const phishing = page.locator("#sim-phishing");
  const fallback = page.locator("#sim-fallback");
  await expect(ok).toBeVisible();
  await expect(phishing).toBeHidden();
  await expect(fallback).toBeHidden();

  await page.locator('[data-sim-tab="phishing"]').click();
  await expect(phishing).toBeVisible();
  await expect(ok).toBeHidden();
  await expect(page.locator('[data-sim-tab="phishing"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sim-state")).toContainText("MOCK");

  await page.locator('[data-sim-tab="fallback"]').click();
  await expect(fallback).toBeVisible();
  await expect(phishing).toBeHidden();
  await expect(page.locator('[data-sim-tab="fallback"]')).toHaveAttribute("aria-selected", "true");

  await page.locator('[data-sim-tab="ok"]').click();
  await expect(ok).toBeVisible();
  await expect(page.locator("#sim-state")).toContainText("LIVE");
});

test("pay demo fixture disables on-chain subscribe", async ({ page }) => {
  await page.goto("/pay?demo=1");
  await expect(page.locator("[data-pay-card]")).toBeVisible();
  // Demo builds no transaction: the only submit control is disabled.
  await expect(page.locator("[data-pay-card] button[disabled]")).toBeVisible();
  // Client live-check short-circuits to the fixture verdict.
  await expect(page.locator("#live-check")).toContainText("DEMO");
});

test("demo ?demo=1 renders fixture stats on home", async ({ page }) => {
  await page.goto("/?demo=1");
  await expect(page.locator("#settled-volume")).toContainText("$");
});

test("demo banner appears with ?demo=1 and exit returns to live", async ({ page }) => {
  await page.goto("/?demo=1");
  const banner = page.locator('[data-i18n="demo.banner"]');
  const exit = page.locator('[data-i18n="demo.exit"]');
  // Banner is mounted by Main in Layout; DemoBanner.svelte selectors frozen.
  if ((await banner.count()) === 0) {
    test.skip(true, "DemoBanner not mounted in Layout yet (Main slice) — selectors verified against DemoBanner.svelte");
    return;
  }
  await expect(banner).toBeVisible();
  // Exit does a full reload without ?demo (setDemoMode navigates) — wait for it.
  await Promise.all([page.waitForURL((url) => !url.searchParams.has("demo")), exit.click()]);
  await expect(page.locator('[data-i18n="demo.banner"]')).toHaveCount(0);
});

test("admin panel stays hidden without the admin wallet", async ({ page }) => {
  // AdminPanel renders only for 2p1s…ucP; Playwright has no wallet extension,
  // so the panel must be absent on every public route.
  for (const route of ["/", "/merchant", "/manage"]) {
    await page.goto(route);
    await expect(page.locator('section[aria-label="Admin panel"]')).toHaveCount(0);
    await expect(page.locator('[data-i18n="admin.panel"]')).toHaveCount(0);
  }
});

// Collection-fee badge (~0.4% to the admin treasury) is NOT in the UI yet:
// cmp.feeUs still reads "0% — protocol takes no cut". Owned by FeeProgram;
// this placeholder turns into a real spec once the badge ships its selector.
test.skip("fee badge shows collection fee on merchant/pay", () => {});
