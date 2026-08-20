// Flat ESLint config for the Expo / React Native app.
// Extends eslint-config-expo (React Native + TypeScript rules) and disables
// any stylistic rules that would conflict with Prettier.
//
// eslint-config-expo is pinned to the ~10.0.x line, which is the release that
// tracks Expo SDK 54 (this app's SDK). The SDK-numbered lines (55/56/57) bundle
// eslint-plugin-react-hooks v7 and its experimental React Compiler rules, which
// this app does not use. Bump this in lockstep with the Expo SDK, not ahead of it.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier/flat');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

module.exports = defineConfig([
  ...expoConfig,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Allow intentionally-unused identifiers when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // TODO: `@expo/vector-icons` resolves at runtime but eslint-plugin-import's
      // resolver is not configured for this project's TS paths. Ignoring the one
      // specifier is a stopgap; configure the TS resolver to drop it.
      'import/no-unresolved': ['error', { ignore: ['^@expo/vector-icons'] }],
      // Issue #45: catch stray `console.log` left behind by debugging.
      // `warn`/`error` are the app's deliberate diagnostic channels — 26 call
      // sites report handled failures — so only those two are allowed.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Test files legitimately import after jest.mock() calls and use
    // require() to reach dynamically-mocked modules.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // jest.setup.js runs inside the Jest environment, not through the
    // TypeScript parser that gives .test.ts(x) files ambient @types/jest
    // globals for free.
    files: ['jest.setup.js'],
    languageOptions: {
      globals: globals.jest,
    },
  },
  globalIgnores([
    '.expo/**',
    'coverage/**',
    'dist/**',
    'node_modules/**',
    // Claude Code worktrees and agent scratch directories.
    '.claude/**',
    'expo-env.d.ts',
  ]),
]);
