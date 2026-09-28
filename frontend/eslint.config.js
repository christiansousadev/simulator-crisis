// ESLint 9 flat config for the React + TypeScript + Vite frontend
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // this is a Vite app, not a library -- every component file exports its default
      // component plus small local helper types/constants, which is the existing codebase
      // convention throughout components/**, so the strict "only a component" check is off
      "react-refresh/only-export-components": "off",
      // unused locals/params are deliberately off in tsconfig.json too (existing project
      // convention -- several handlers keep an unused but documentary parameter name)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // the codebase intentionally uses `any` at a few untyped-payload boundaries (parsed
      // WebSocket frames, third-party catalog shapes); warn rather than block on it
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
