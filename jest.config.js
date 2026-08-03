/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'bundler',
        skipLibCheck: true,
        isolatedModules: true,
      },
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Any __tests__ directory in the repo, .ts or .tsx — so tests can live
  // alongside app/ and components/ code, not just lib/.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // Worktrees hold full copies of the tree; without this they present as
  // duplicate suites and Haste collisions.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/worktrees/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'lib/elo.ts',
    'lib/api.ts',
    'lib/deep-linking.ts',
    'lib/templates.ts',
    'lib/partial-ranking.ts',
    'lib/swipe-gesture.ts',
    'lib/follow-state.ts',
    'lib/notifications.ts',
    'lib/supabase-config.ts',
    'lib/pair-selection.ts',
    // The four modals covered by issue #48, listed individually rather than as
    // `components/*.tsx`. The glob would also pull in FollowButton.tsx, which
    // landed on main separately and has no tests — dropping the global gate
    // below 95% and failing this PR for code it does not touch. Adding a
    // component here is the deliberate step that puts it under the gate.
    'components/AddItemModal.tsx',
    'components/BulkAddModal.tsx',
    'components/ItemActionMenu.tsx',
    'components/ListActionSheet.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
