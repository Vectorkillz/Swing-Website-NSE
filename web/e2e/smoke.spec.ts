import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/optionable", "/universe", "/track-record", "/data"];

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
  const badge = page.getByTestId("regime-badge").first();
  const empty = page.getByText(/No scan published/);
  await expect(badge.or(empty).first()).toBeVisible({ timeout: 15000 });
  if (await badge.count()) await expect(badge).toHaveText(/BULL|BEAR|NEUTRAL|UNKNOWN/);
});

test("a setup card opens the reasoning drawer with a chart", async ({ page }) => {
  await page.goto("/#/");
  const card = page.locator("button[aria-label$='setup']").first();
  const empty = page.getByText(/No setups match|No scan published/);
  await Promise.race([card.waitFor({ timeout: 15000 }), empty.waitFor({ timeout: 15000 })]);
  if (await card.count()) {
    await card.click();
    const drawer = page.getByTestId("drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Technical reasoning")).toBeVisible();
    await expect(drawer.getByText("Price plan")).toBeVisible();
    await expect(drawer.locator("canvas").first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "test-results/shot_detail.png", fullPage: false });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  }
});

test("cap filter pills toggle", async ({ page }) => {
  await page.goto("/#/");
  const pill = page.getByRole("button", { name: "Mid cap" });
  await pill.waitFor({ timeout: 15000 });
  await pill.click();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
});

test("card sort control flips direction on second click", async ({ page }) => {
  await page.goto("/#/");
  const score = page.locator("[data-sort-key='score']").first();
  await score.waitFor({ timeout: 15000 });
  await score.click();
  await expect(score).toHaveAttribute("data-sort-dir", "desc");
  await score.click();
  await expect(score).toHaveAttribute("data-sort-dir", "asc");
});

test("universe column headers sort highest-to-lowest then lowest-to-highest", async ({ page }) => {
  await page.goto("/#/universe");
  const table = page.getByTestId("universe-table");
  await table.waitFor({ timeout: 20000 });
  const atr = table.locator("th.sortable", { hasText: "ATR %" });
  await atr.locator("button").click();
  await expect(atr).toHaveAttribute("aria-sort", "descending");
  const first = await table.locator("tbody tr").first().locator("td").nth(7).innerText();
  await atr.locator("button").click();
  await expect(atr).toHaveAttribute("aria-sort", "ascending");
  const firstAsc = await table.locator("tbody tr").first().locator("td").nth(7).innerText();
  const n = (s: string) => parseFloat(s.replace("%", ""));
  if (!Number.isNaN(n(first)) && !Number.isNaN(n(firstAsc))) expect(n(firstAsc)).toBeLessThanOrEqual(n(first));
});

test("universe row opens a reasoning drawer", async ({ page }) => {
  await page.goto("/#/universe");
  const row = page.getByTestId("universe-table").locator("tbody tr").first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  await expect(page.getByTestId("reasoning")).toBeVisible();
  await page.getByRole("button", { name: "Close detail" }).click();
  await expect(page.getByTestId("drawer")).toHaveCount(0);
});

test("refresh button spins then settles", async ({ page }) => {
  await page.goto("/#/");
  const btn = page.getByTestId("refresh-data");
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-busy", "false", { timeout: 15000 });
  await expect(btn).toBeEnabled();
});

test("optionable tab only lists F&O names", async ({ page }) => {
  await page.goto("/#/optionable");
  await expect(page.getByRole("heading", { name: "Optionable Swing Moves" })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(await page.getByText("Cash only").count()).toBe(0);
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
  for (const route of ["/", "/optionable"]) {
    await page.goto(`/#${route}`);
    await page.waitForTimeout(1000);
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/recommend|probabilit|buy signal/);
  }
});
