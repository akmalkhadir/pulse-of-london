import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    // PORT env var is required because @react-router/serve reads the port from
    // the PORT environment variable, not a --port flag.
    command: "pnpm build && PORT=4173 pnpm start",
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
