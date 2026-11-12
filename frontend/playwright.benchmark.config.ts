import { defineConfig, devices } from "@playwright/test";

const development = process.env.BENCH_MODE === "development";
export default defineConfig({
  testDir: "./benchmarks",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: `test-results/benchmark-${development ? "development" : "production"}`,
  use: { baseURL: "http://127.0.0.1:4183", trace: "retain-on-failure" },
  projects: [{ name: development ? "development" : "production", use: devices["Desktop Chrome"] }],
  webServer: {
    command: development
      ? "npm run dev -- --host 127.0.0.1 --port 4183 --strictPort"
      : "npm run build && npm run preview -- --host 127.0.0.1 --port 4183 --strictPort",
    url: "http://127.0.0.1:4183", reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "https://demo.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key", VITE_API_URL: "/api/v1" },
  },
});
