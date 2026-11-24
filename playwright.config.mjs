// Browser tests (tests/e2e): the real page in Chromium, served as-is by a static server.
// Locally, CHROME_PATH can point at an installed Chromium-based browser instead of
// Playwright's own (npx playwright install chromium).
import { defineConfig, devices } from "@playwright/test";

const PORT = 5417;
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: "retain-on-failure",
    launchOptions
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 }, launchOptions }, grep: /@layout/ },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, launchOptions }, grep: /@layout|@mobile/ }
  ],
  webServer: {
    command: `node tools/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "ignore"
  }
});
