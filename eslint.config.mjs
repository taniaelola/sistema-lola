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
    // Saídas de build do OpenNext/Cloudflare e worktrees locais:
    ".open-next/**",
    ".wrangler/**",
    ".claude/**",
    // Loja anterior de referência (zip extraído, não é código nosso):
    "reference/**",
  ]),
  {
    // Fixtures de teste usam formas mínimas com `as any` de propósito.
    files: ["__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
