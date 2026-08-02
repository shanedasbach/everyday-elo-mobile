/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
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
    'lib/notifications.ts',
    'lib/supabase-config.ts',
    'lib/pair-selection.ts',
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
