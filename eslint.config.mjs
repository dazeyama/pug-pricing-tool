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
  { ignores: ['dist/', 'node_modules/', 'supabase/functions/', 'supabase/.temp/'] },
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
    },
  },
  {
    // Run under Node, not in the browser.
    files: ['tests/**', 'scripts/**', '*.config.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
];
