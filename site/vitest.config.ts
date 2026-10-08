import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.{ts,mjs}", "brand/**/*.test.mjs"],
    exclude: [
      ...configDefaults.exclude,
      "test/a11y.test.ts",
      "test/browser.test.ts",
    ],
    testTimeout: 120000,
  },
});
