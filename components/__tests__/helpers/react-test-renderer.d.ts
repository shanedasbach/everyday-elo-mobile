// Minimal ambient types for react-test-renderer. The package ships no types and
// @types/react-test-renderer is not installed; these cover only the surface this
// repo's component tests use (see issue #48).
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestInstance {
    type: unknown;
    props: Record<string, unknown>;
    children: Array<TestInstance | string>;
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

  export function act(callback: () => void | Promise<void>): void;
  export function create(element: ReactElement): ReactTestRenderer;

  const TestRenderer: {
    act: typeof act;
    create: typeof create;
  };
  export default TestRenderer;
}
