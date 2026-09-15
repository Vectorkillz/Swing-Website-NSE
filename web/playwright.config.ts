import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1280, height: 900 } },
  webServer: { command: "npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 60_000 },
  reporter: [["list"]],
  outputDir: "./test-results",
});
