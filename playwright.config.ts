import { defineConfig } from "@playwright/test";
const webOrigin = process.env.TEST_WEB_ORIGIN || "http://localhost:5173";
const apiOrigin = process.env.TEST_API_ORIGIN || "http://localhost:4000";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: webOrigin, trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -w apps/api",
      url: apiOrigin + "/api/health",
      env: {
        JWT_SECRET: "browser-test-secret-at-least-32-characters",
        WEB_ORIGIN: webOrigin,
        PORT: new URL(apiOrigin).port,
        NODE_ENV: "test",
        AI_PROVIDER: "groq",
        GROQ_API_KEY: "",
        OPENAI_API_KEY: "",
        AI_MODEL: "",
      },
      timeout: 30000,
    },
    {
      command: "npm run dev -w apps/web -- --port " + new URL(webOrigin).port,
      url: webOrigin,
      env: { VITE_API_URL: apiOrigin },
      timeout: 30000,
    },
  ],
});
