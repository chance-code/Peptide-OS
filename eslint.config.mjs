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
  // Custom rules to catch common mistakes
  {
    rules: {
      // Catch fire-and-forget promises (fetch without await)
      "@typescript-eslint/no-floating-promises": "warn",
      // Require handling promise rejections
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
]);

export default eslintConfig;
