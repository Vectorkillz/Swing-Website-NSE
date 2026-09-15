import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/universe", "/data"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon|jobs\/index\.json|universe\/status\.json/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  return errors;
}

for (const route of ROUTES) {
  test(`route ${route} renders without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/#${route}`);
    await expect(page.locator("text=Swing Scanner >> visible=true").first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/shot${route.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("scanner shows regime and either setup cards or an empty state", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.locator("text=/BULL|BEAR|NEUTRAL|UNKNOWN|No scan published/").first()).toBeVisible({ timeout: 15000 });
});

test("a setup card opens the detail view with a chart", async ({ page }) => {
  await page.goto("/#/");
  const card = page.locator("button[aria-label$='setup']").first();
  const empty = page.getByText(/No setups match|No scan published/);
  await Promise.race([card.waitFor({ timeout: 15000 }), empty.waitFor({ timeout: 15000 })]);
  if (await card.count()) {
    await card.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Price plan")).toBeVisible();
    await page.screenshot({ path: "test-results/shot_detail.png", fullPage: false });
  }
});

test("cap filter pills toggle", async ({ page }) => {
  await page.goto("/#/");
  const pill = page.getByRole("button", { name: "Mid cap" });
  await pill.waitFor({ timeout: 15000 });
  await pill.click();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
});

test("readable at 380px", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto("/#/");
  await expect(page.locator("text=Swing Scanner >> visible=true").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "test-results/shot_mobile.png", fullPage: true });
});

test("no advice wording in rendered UI", async ({ page }) => {
  await page.goto("/#/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toMatch(/recommend|probabilit|buy signal/);
});
