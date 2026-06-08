// Flat ESLint config for the Expo / React Native app.
// Extends eslint-config-expo (React Native + TypeScript rules) and disables
// any stylistic rules that would conflict with Prettier.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier/flat');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');

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
      'import/no-unresolved': ['error', { ignore: ['^@expo/vector-icons'] }],
      // eslint-plugin-react-hooks v6 (bundled with eslint-config-expo) ships
      // experimental React Compiler rules in its recommended preset. This app
      // does not yet use the React Compiler, and these rules fire heavily on
      // correct, idiomatic code (e.g. hoisted handlers referenced in effects,
      // ref access patterns). Downgrade them to warnings so they surface as
      // advisories without blocking CI. The classic, high-value hook rules
      // (rules-of-hooks, exhaustive-deps) keep their default severity.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
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
