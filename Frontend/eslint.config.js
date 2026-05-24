import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      // Wires in @typescript-eslint/parser (so .ts/.tsx parse) + recommended TS rules.
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // This codebase intentionally uses `any` for loose API payloads
      // (Record<string, any>, axios response bodies). Type safety is enforced
      // via `tsc --noEmit`; flagging every `any` here is noise, not signal.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Plain-JS config/tooling files (e.g. this file) — Node ESM, no TS rules.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
