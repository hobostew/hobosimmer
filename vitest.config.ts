import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keeps every run off the real network: see vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
  },
});
