import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/candidates", "/journal", "/analytics", "/config", "/runs", "/admin"];

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  // resource failures are reported with their URL so a missing file is obvious; optional data files (jobs, universe) may be absent
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon|jobs\/index\.json|universe\/status\.json/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  return errors;
}

for (const route of ROUTES) {
  test(`route ${route} renders without errors`, async ({ page }) => {
    const errors = await collectErrors(page);
    await page.goto(`/#${route}`);
    await expect(page.getByText("NSE Swing Scanner")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/shot${route.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
}

test("dashboard shows the regime banner and a ranked table or empty state", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.locator("text=/BULL|BEAR|NEUTRAL|UNKNOWN|No runs published/").first()).toBeVisible({ timeout: 15000 });
});

test("candidates row expands to a chart canvas", async ({ page }) => {
  await page.goto("/#/candidates");
  const row = page.locator("table.data tbody tr").first();
  const empty = page.getByText(/No candidates match|No runs published|No candidates file/);
  await Promise.race([row.waitFor({ timeout: 15000 }), empty.waitFor({ timeout: 15000 })]);
  if (await row.count()) {
    await row.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Rule score")).toBeVisible();
    await page.screenshot({ path: "test-results/shot_candidate_detail.png", fullPage: false });
  }
});

test("readable at 380px", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto("/#/");
  await expect(page.getByText("NSE Swing Scanner")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "test-results/shot_mobile.png", fullPage: true });
});

test("no advice wording in rendered UI", async ({ page }) => {
  await page.goto("/#/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toMatch(/recommend|probabilit|buy signal/);
});
