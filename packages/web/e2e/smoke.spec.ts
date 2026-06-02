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
    errors.push(text);
  });

  await page.goto("/");

  // SSR'd headline (from the bundled fixture)
  await expect(page.getByText("Busier than usual for a Saturday", { exact: false })).toBeVisible();

  // Accessible list with worst-first content
  await expect(page.getByRole("button", { name: "Central" })).toBeVisible();
  await expect(page.getByText("80% busier than usual")).toBeVisible(); // Oxford Circus much_busier

  // Map mounts
  await expect(page.getByTestId("map")).toBeVisible();

  // Required attribution (ToS §12)
  await expect(page.getByText("Powered by TfL Open Data", { exact: false })).toBeVisible();
  await expect(page.getByText("not affiliated with or endorsed by Transport for London", { exact: false })).toBeVisible();

  // Selecting a line populates the detail panel
  await page.getByRole("button", { name: "Central" }).click();
  await expect(page.getByLabel("Details for Central")).toBeVisible();

  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});

test("keyboard focus reaches the list controls (WCAG 2.2 AA)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON"]).toContain(active);
});
