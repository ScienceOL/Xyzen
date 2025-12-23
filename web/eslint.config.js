import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config([
  globalIgnores(["dist", "site", "dev-dist", "node_modules"]),
  // TypeScript/TSX files in src directory
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^React$" },
      ],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // JavaScript files in site directory - relaxed rules
  {
    files: ["site/**/*.{js,jsx}"],
    extends: [js.configs.recommended],
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // TypeScript declaration files - disable type-only warnings
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
