import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // uses the Chrome that is already installed (also present on GitHub runners), so no browser download is needed
  use: { baseURL: "http://localhost:3123", channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "npm run build && npx next start -p 3123", url: "http://localhost:3123", timeout: 180000, reuseExistingServer: !process.env.CI },
});
