import { defineConfig, devices } from "@playwright/test";

const port = process.env.NIMBUS_TEST_PORT ?? "4321";
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.NIMBUS_TEST_PRODUCTION === "1" ? "npm run start" : `npm run dev -- --host 127.0.0.1 --port ${port}`,
    // Astro 7 otherwise detaches when it detects an agent environment.
    env: { ASTRO_DEV_BACKGROUND: "1", HOST: "127.0.0.1", PORT: port },
    url: `${origin}/chat`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
