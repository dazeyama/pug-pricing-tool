// Lint (FABLE_REPORT C5): `npm run lint`. ESLint's recommended rules and
// React's rules of hooks, for the app, the tests and the scripts. The Edge
// Functions are Deno, built and checked by Supabase, so they're left out.
// eslint-plugin-react is here for one rule only, jsx-uses-vars: without it a
// component used only in JSX (<Modal />) reads as an unused import.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // public/tesseract/: the scanner's OCR files, copied minified from node_modules (vite.config.js).
  { ignores: ['dist/', 'node_modules/', 'supabase/functions/', 'supabase/.temp/', 'public/tesseract/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'react/jsx-uses-vars': 'error',
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // A value read above its own line in the same scope throws when that code runs (2026-10-18: the
      // Buy screen went blank, \`candidates\` read before its \`const\`); uses inside functions that run
      // later are fine and not flagged.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: false, allowNamedExports: true }],
    },
  },
  {
    // Run under Node, not in the browser.
    files: ['tests/**', 'scripts/**', '.claude/**', '*.config.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
];
