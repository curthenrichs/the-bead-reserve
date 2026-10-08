import { defineConfig } from "vitest/config";

/* The headless-Chrome suites. Plain `npm test` excludes them. Same
   global setup: they read dist. */
export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/browser.test.ts", "test/a11y.test.ts"],
    testTimeout: 120000,
    hookTimeout: 60000,
  },
});
