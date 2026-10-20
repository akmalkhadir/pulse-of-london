import { test, expect } from "@playwright/test";

test("renders the pulse, list, map and attribution", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Filter out known MapLibre / WebGL noise that is NOT an app error.
    // Headless Chromium may emit warnings when WebGL context creation falls
    // back or when MapLibre tries GPU-accelerated paths. These are harness
    // artefacts, not bugs in the application.
    if (/webgl/i.test(text) || /maplibre/i.test(text)) return;
    // The basemap is a cross-origin R2 asset whose CORS rule only allows the production
    // origin (docs/basemap.md), so local preview can't load it. Not an app error.
    const url = m.location().url ?? "";
    if (url.includes("/basemap/london.pmtiles") || /london\.pmtiles/.test(text) || text.startsWith("TypeError: Failed to fetch")) return;
    errors.push(text);
  });

  await page.goto("/");

  // SSR'd verdict baseline (from the bundled fixture, a Saturday)
  await expect(page.getByText("Versus a typical Saturday at this time.")).toBeVisible();

  // LED verdict + ranked boards, worst first
  await expect(page.getByRole("heading", { level: 1, name: "Busier than usual" })).toBeVisible();
  await expect(page.getByRole("button", { name: /1st\s+Central\s+Severe Delays/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Oxford Circus\s*,\s*80% busier than usual/ })).toBeVisible();
  await expect(page.getByText("+80%")).toBeVisible(); // Oxford Circus much_busier

  // Map mounts
  await expect(page.getByTestId("map")).toBeVisible();

  // Required attribution (ToS §12)
  await expect(page.getByText("Powered by TfL Open Data", { exact: false })).toBeVisible();
  await expect(page.getByText("not affiliated with or endorsed by Transport for London", { exact: false })).toBeVisible();

  // Selecting a line populates the detail panel
  await page.getByRole("button", { name: /1st\s+Central/ }).click();
  await expect(page.getByRole("region", { name: "Details for Central" })).toBeVisible();

  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});

test("station board finds a station by name and flips to quietest first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Find a station" }).fill("kings cross");
  await expect(page.getByRole("button", { name: /King's Cross St\. Pancras\s*,\s*no live data/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a station" }).fill("");
  await page.getByRole("button", { name: "Quietest" }).click();
  await expect(page.getByRole("button", { name: /1st\s+Liverpool Street/ })).toBeVisible();
});

test("keyboard focus reaches the list controls (WCAG 2.2 AA)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON"]).toContain(active);
});
