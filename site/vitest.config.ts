import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 120000,
    setupFiles: ["./test/setup.ts"],
  },
});
