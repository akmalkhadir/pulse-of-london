import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    // Build, then serve the worker build in the Workers runtime (workerd) via
    // `vite preview` (the @cloudflare/vite-plugin runs SSR in workerd).
    command: "pnpm build && pnpm preview --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
