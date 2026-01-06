import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Enable globals for describe, it, expect without imports
    globals: true,
    // Use jsdom for DOM-related tests
    environment: "jsdom",
    // Include test files
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Exclude node_modules
    exclude: ["node_modules", "dist", "site"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/main.tsx",
        "src/index.ts",
        "src/vite-env.d.ts",
      ],
    },
    // Setup files
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
