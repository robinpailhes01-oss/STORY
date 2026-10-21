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
    // Copies de travail temporaires des agents Claude Code.
    ".claude/**",
    // Chargeur Emscripten de MediaPipe, copié tel quel depuis node_modules.
    "public/mediapipe/**",
  ]),
]);

export default eslintConfig;
