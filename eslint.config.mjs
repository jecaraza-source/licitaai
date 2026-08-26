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
    // Local `vercel build`/`vercel deploy` output — generated bundles, not
    // source. Only listed in .gitignore before, which flat-config ESLint
    // doesn't consult automatically, so a bare `npm run lint` was silently
    // linting minified chunks under here.
    ".vercel/**",
    // Deno edge functions — separate runtime/conventions, linted via `deno lint`.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
