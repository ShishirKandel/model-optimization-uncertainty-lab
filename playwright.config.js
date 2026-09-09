import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: {
    baseURL:
      (process.env.TEST_BASE_URL || "http://127.0.0.1:4173").replace(
        /\/$/,
        "",
      ) + "/",
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm start",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
      },
  reporter: "list",
});
