import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Hard errors: hooks ordering and stale closure bugs must never land.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // The React Compiler plugin's set-state-in-effect rule fires on legitimate
      // patterns (initialising state from localStorage, resetting on navigation).
      // Disable globally; rules-of-hooks + exhaustive-deps cover real correctness.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
