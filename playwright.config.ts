import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -w apps/api",
      url: "http://localhost:4000/api/health",
      env: {
        JWT_SECRET: "browser-test-secret-at-least-32-characters",
        WEB_ORIGIN: "http://localhost:5173",
        PORT: "4000",
        NODE_ENV: "test",
      },
      timeout: 30000,
    },
    {
      command: "npm run dev -w apps/web",
      url: "http://localhost:5173",
      timeout: 30000,
    },
  ],
});
