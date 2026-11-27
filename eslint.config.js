import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-pwa', 'android', 'ios', 'public', 'spikes', 'node_modules', 'coverage', '.claude'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  {
    // ADR-009: no hard-coded user-visible strings in UI code.
    files: ['src/screens/**/*.tsx', 'src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-only', 'jsx-attributes': { include: ['label', 'placeholder', 'title', 'aria-label', 'alt', 'header', 'message', 'text'] } }],
    },
  },
  {
    // Service worker (plain JS, prefixed with the precache list at build time: scripts/pwaPlugin.ts).
    files: ['src/pwa/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
);
