# Component-test harness — why not `@testing-library/react-native`?

Issue #48 offered two paths: use `@testing-library/react-native` (RNTL), or
switch `testEnvironment` to `jest-expo`. **Both were tried against this repo's
actual stack and both fail before a single test executes.** This file records
the errors so the decision can be re-checked rather than taken on trust.

Issue #73 asked to re-verify this rather than assume it from a code comment,
and to settle on one shared harness instead of one per PR. Both paths were
re-run 2026-08-06 against the versions below and reproduced the identical
failures — the conclusion stands. The formerly-unused `jest-expo`,
`@testing-library/react-native`, and `@testing-library/jest-native`
devDependencies have been dropped from `package.json` accordingly; this
`helpers/` harness is the one shared implementation going forward.

Stack at time of writing:

| Package | Version |
|---|---|
| `jest` | 30.2.0 |
| `jest-expo` | 55.0.13 (also tried 54.0.17) |
| `expo` | 54.0.33 |
| `react-native` | 0.81.5 |
| `@testing-library/react-native` | 13.3.3 |
| `react` / `react-test-renderer` | 19.1.0 |

## Path A — `preset: 'jest-expo'`

```
ReferenceError: You are trying to `import` a file outside of the scope of the test code.
  at require (node_modules/expo/src/winter/runtime.native.ts:20:43)
  at getValue (node_modules/expo/src/winter/installGlobal.ts:97:21)
  at Object.get [as __ExpoImportMetaRegistry] (node_modules/expo/src/winter/installGlobal.ts:44:16)
```

Adding `roots: ['<rootDir>']` gets past that one and straight into the next:

```
TypeError: Cannot read properties of undefined (reading 'protocol')
  at Object.setup (node_modules/expo/src/async-require/hmr.ts:89:40)
  at Object.<anonymous> (node_modules/expo/src/async-require/setupHMR.ts:19:14)
  at Object.<anonymous> (node_modules/jest-expo/src/preset/setup.js:305:1)
```

The preset's setup file is booting Expo's dev-server HMR client and expecting a
dev-server manifest that does not exist in a test run.

**Root cause:** `jest-expo` pins the Jest 29 toolchain throughout its own
dependencies — `@jest/globals@^29.2.1`, `jest-environment-jsdom@^29.2.1`,
`babel-jest@^29.2.1`, `jest-snapshot@^29.2.1` — while this repo runs Jest 30.
Installing the SDK-matched `jest-expo@~54.0.0` (54.0.17) reproduces the *same*
first error, so this is not a `jest-expo` 54-vs-55 version skew. Making this
path work means moving the repo back to Jest 29, which is a separate decision
with its own blast radius, not something a test-adding PR should smuggle in.

## Path B — RNTL under the existing `ts-jest` / `node` config

```
/node_modules/react-native/index.js:27
import typeof * as ReactNativePublicAPI from './index.js.flow';
^^^^^^
SyntaxError: Cannot use import statement outside a module
  at Object.require (node_modules/@testing-library/react-native/src/helpers/accessibility.ts:2:1)
  at Object.require (node_modules/@testing-library/react-native/src/index.ts:2:1)
```

RNTL's entry point reaches `react-native/index.js`, which is untranspiled Flow
ESM. `ts-jest` does not transform it, and swapping in `babel-jest` for
`node_modules/react-native` is the first step down Path A again.

## What we do instead

`react-test-renderer` against the host stubs in `rnMock.ts`. The stubs are not
pure pass-throughs — `Modal` honours `visible` and `press()` honours `disabled`
— so the two props that carry real user-visible behaviour are observable to a
test rather than being inert attributes.

## Reproducing

Write a probe test at `probe/__tests__/rntl.test.tsx` that imports `render`
from `@testing-library/react-native` and renders any of the four modals, then:

```bash
# Path A — jest-expo preset
cat > jest.probe.config.js <<'EOF'
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>'],                     // drop this to see the first error
  testMatch: ['**/probe/__tests__/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
EOF
npx jest -c jest.probe.config.js

# Path B — RNTL on the existing ts-jest/node config
cat > jest.probe.config.js <<'EOF'
const base = require('./jest.config.js');
module.exports = {
  ...base,
  testMatch: ['**/probe/__tests__/**/*.test.tsx'],
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
};
EOF
npx jest -c jest.probe.config.js
```

Remember to delete `probe/` and `jest.probe.config.js` afterwards.

## Dropped devDependencies

`@testing-library/react-native`, `@testing-library/jest-native`, and
`jest-expo` were removed from `devDependencies` (issue #73) — they were
unusable while the above holds, and `@testing-library/jest-native` is
upstream-deprecated besides. Re-add them if a future move to the Jest 29
toolchain reopens Path A.
