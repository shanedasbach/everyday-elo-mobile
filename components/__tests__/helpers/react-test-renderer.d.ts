// Minimal ambient types for react-test-renderer. The package ships no types and
// @types/react-test-renderer is not installed; these cover only the surface this
// repo's component tests use (see issue #48).
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestInstance {
    type: unknown;
    props: Record<string, unknown>;
    children: (TestInstance | string)[];
    find(predicate: (node: TestInstance) => boolean): TestInstance;
    findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
    findByType(type: unknown): TestInstance;
    findAllByType(type: unknown): TestInstance[];
  }

  export interface ReactTestRenderer {
    root: TestInstance;
    unmount(): void;
    toJSON(): unknown;
  }

  // The real `act` returns a thenable, so `await act(async () => …)` awaits the
  // flush. Typing the return as plain `void` would make that await a no-op at
  // the type level and hide un-flushed updates.
  export function act(callback: () => Promise<void>): PromiseLike<void>;
  export function act(callback: () => void): void;
  export function create(element: ReactElement): ReactTestRenderer;

  const TestRenderer: {
    act: typeof act;
    create: typeof create;
  };
  export default TestRenderer;
}
