import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/", "/optionable", "/screeners", "/analytics", "/universe", "/track-record", "/data"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon|jobs\/index\.json|universe\/status\.json|index_membership/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
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

test("a setup card opens the reasoning drawer with a chart, RSI pane and bias tally", async ({ page }) => {
  await page.goto("/#/");
  const card = page.locator("[role='button'][aria-label$='setup']").first();
  const empty = page.getByText(/No setups match|No scan published/);
  await Promise.race([card.waitFor({ timeout: 15000 }), empty.waitFor({ timeout: 15000 })]);
  if (await card.count()) {
    await card.click();
    const drawer = page.getByTestId("drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Technical reasoning")).toBeVisible();
    await expect(drawer.getByTestId("bias")).toBeVisible();
    await expect(drawer.getByText("Price plan")).toBeVisible();
    await expect(drawer.locator("canvas").first()).toBeVisible({ timeout: 15000 });
    await expect(drawer.getByRole("button", { name: "RSI 14" })).toHaveAttribute("aria-pressed", "true");
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

test("universe column headers sort, flip, and shift-click adds a secondary key", async ({ page }) => {
  await page.goto("/#/universe");
  const table = page.getByTestId("universe-table");
  await table.waitFor({ timeout: 20000 });
  const atr = table.locator("th.sortable", { hasText: "ATR %" });
  await atr.locator("button").click();
  await expect(atr).toHaveAttribute("aria-sort", "descending");
  await atr.locator("button").click();
  await expect(atr).toHaveAttribute("aria-sort", "ascending");
  const rs = table.locator("th.sortable", { has: page.locator("button[title^='Relative strength']") }); // text changes to "RS 2" once it is a secondary key
  await rs.locator("button").click({ modifiers: ["Shift"] });
  await expect(rs).toHaveAttribute("aria-sort", "descending");
  await expect(atr).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByText(/2 sort keys/)).toBeVisible();
});

test("universe sticky symbol column and header are sticky", async ({ page }) => {
  await page.goto("/#/universe");
  const table = page.getByTestId("universe-table");
  await table.waitFor({ timeout: 20000 });
  expect(await table.locator("thead th").first().evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  expect(await table.locator("tbody td.sticky-col").first().evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
});

test("fuzzy search narrows the universe and scope pills work", async ({ page }) => {
  await page.goto("/#/universe");
  const table = page.getByTestId("universe-table");
  await table.waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Swing-tradable" }).click(); // show all
  await page.getByTestId("search").fill("relianc");
  await expect(table.locator("tbody tr").first()).toContainText("RELIANCE");
  await page.getByTestId("search").fill("");
  const n50 = page.getByRole("button", { name: /Nifty 50/ });
  if (await n50.isEnabled()) {
    await n50.click();
    await expect(n50).toHaveAttribute("aria-pressed", "true");
    const shown = await table.locator("tbody tr").count();
    expect(shown).toBeLessThanOrEqual(50);
  }
});

test("star adds to watchlist and the watchlist scope shows it", async ({ page }) => {
  await page.goto("/#/universe");
  const table = page.getByTestId("universe-table");
  await table.waitFor({ timeout: 20000 });
  const firstRow = table.locator("tbody tr").first();
  const sym = (await firstRow.locator("td").first().locator(".font-semibold").innerText()).trim();
  await firstRow.locator("button.star").click();
  await expect(firstRow.locator("button.star")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Watchlist/ }).click();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr").first()).toContainText(sym);
  expect(await page.evaluate(() => localStorage.getItem("nse-swing.watchlist.v1"))).toContain(sym);
});

test("universe row opens a reasoning drawer", async ({ page }) => {
  await page.goto("/#/universe");
  const row = page.getByTestId("universe-table").locator("tbody tr").first();
  await row.waitFor({ timeout: 20000 });
  await row.locator("td").nth(2).click();
  await expect(page.getByTestId("reasoning")).toBeVisible();
  await page.getByRole("button", { name: "Close detail" }).click();
  await expect(page.getByTestId("drawer")).toHaveCount(0);
});

test("refresh button spins then settles and toasts", async ({ page }) => {
  await page.goto("/#/");
  const btn = page.getByTestId("refresh-data");
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-busy", "false", { timeout: 15000 });
  await expect(btn).toBeEnabled();
  await expect(page.getByTestId("toaster")).toContainText("Data refreshed");
});

test("optionable momentum tiles filter the list", async ({ page }) => {
  await page.goto("/#/optionable");
  await expect(page.getByRole("heading", { name: "Optionable Swing Moves" })).toBeVisible({ timeout: 15000 });
  await page.getByTestId("tile-down").waitFor();
  await page.getByTestId("tile-down").click();
  await expect(page.getByTestId("tile-down")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Downward", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("momentum-section").getByRole("heading")).toContainText("Downward momentum");
  await page.getByTestId("tile-up").click();
  await expect(page.getByTestId("momentum-section").getByRole("heading")).toContainText("Upward momentum");
  await page.waitForTimeout(500);
  expect(await page.getByText("Cash only").count()).toBe(0);
});

test("screeners page switches screens and lists matches or an empty state", async ({ page }) => {
  await page.goto("/#/screeners");
  await page.getByTestId("screen-volume").waitFor({ timeout: 15000 });
  await page.getByTestId("screen-pullback").click();
  await expect(page.getByTestId("screen-pullback")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Max distance to EMA/)).toBeVisible();
  await page.getByTestId("screen-custom").click();
  await expect(page.getByText(/Min avg volume/)).toBeVisible();
  const table = page.getByTestId("universe-table");
  const empty = page.getByText(/No stock passes this screen/);
  await expect(table.or(empty).first()).toBeVisible();
});

test("theme toggle switches to light and persists", async ({ page }) => {
  await page.goto("/#/");
  const t = page.getByTestId("theme-toggle").first();
  await t.waitFor();
  await t.click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(244, 245, 248)"); // waits out the 200ms transition
  await page.screenshot({ path: "test-results/shot_light.png", fullPage: false });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await page.getByTestId("theme-toggle").first().click();
});

test("analytics shows the mood meter with components, breadth tiles and sector bars", async ({ page }) => {
  await page.goto("/#/analytics");
  const meter = page.getByTestId("mood-meter");
  await expect(meter).toBeVisible({ timeout: 20000 });
  await expect(meter.getByRole("img", { name: /Market mood/ })).toBeVisible();
  await expect(meter.getByText(/Nifty trend/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sector strength" })).toBeVisible();
  await expect(page.getByText(/Above 200-day EMA/i)).toBeVisible();
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toMatch(/recommend|probabilit|buy signal/);
  await page.screenshot({ path: "test-results/shot_analytics.png", fullPage: true });
});

test("scanner shows a mood chip that links to analytics", async ({ page }) => {
  await page.goto("/#/");
  const chip = page.getByTestId("mood-chip");
  await chip.waitFor({ timeout: 15000 });
  await chip.click();
  await expect(page).toHaveURL(/#\/analytics/);
});

test("track record tiles filter the table by outcome", async ({ page }) => {
  await page.goto("/#/track-record");
  await page.getByRole("button", { name: "Last month" }).click();
  const tile = page.getByTestId("tile-stopped_out");
  await tile.waitFor({ timeout: 30000 });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Stopped out only/)).toBeVisible();
  const badges = page.locator("tbody td .badge", { hasText: /Target hit|On track|Below entry|Above entry|Too new/ });
  expect(await badges.count()).toBe(0);
  await page.getByTestId("tile-target_hit").click();
  await expect(page.getByText(/Target hit only/)).toBeVisible();
  await page.getByTestId("tile-target_hit").click();
  await expect(page.getByText(/All setups in range/)).toBeVisible();
});

test("legal footer is present", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByTestId("legal-footer")).toContainText("Not SEBI-registered investment advice");
});

test("readable at 380px", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto("/#/");
  await expect(page.locator("text=Swing Scanner >> visible=true").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await expect(page.locator("nav .legal")).toBeVisible();
  await page.screenshot({ path: "test-results/shot_mobile.png", fullPage: true });
});

test("no advice wording in rendered UI", async ({ page }) => {
  for (const route of ["/", "/optionable", "/screeners"]) {
    await page.goto(`/#${route}`);
    await page.waitForTimeout(1000);
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/recommend|probabilit|buy signal/);
  }
});
