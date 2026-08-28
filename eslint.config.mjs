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
    "coverage/**",
    "next-env.d.ts",
    // Local `vercel build`/`vercel deploy` output — generated bundles, not
    // source. Only listed in .gitignore before, which flat-config ESLint
    // doesn't consult automatically, so a bare `npm run lint` was silently
    // linting minified chunks under here.
    ".vercel/**",
    // Deno edge functions — separate runtime/conventions, linted via `deno lint`.
    "supabase/functions/**",
    // Generado por `npm run typegen` (supabase gen types) — no es fuente.
    "src/lib/supabase/database.types.ts",
    // k6 load scripts — run by the k6 runtime, not Node; its API (default
    // export, `open()`, `__ENV`) trips the Next/TS rules. See tests/load/README.md.
    "tests/load/*.k6.js",
  ]),
]);

export default eslintConfig;
