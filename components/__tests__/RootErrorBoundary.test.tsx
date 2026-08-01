import React from 'react';
// react-test-renderer ships no bundled types and @types/react-test-renderer is
// deprecated on the React 19 line, so require() keeps it untyped rather than
// adding a stale type-only dependency.
const TestRenderer = require('react-test-renderer');
const act: (callback: () => void) => void = TestRenderer.act;

// The project's unit-test environment is `testEnvironment: 'node'` + ts-jest
// with no babel/jest-expo transform, so react-native's Flow-typed source is not
// transformable here. Verified: importing @testing-library/react-native under
// this config fails with `SyntaxError: Cannot use import statement outside a
// module` at node_modules/react-native/index.js:27. We therefore mock
// react-native with minimal host components so the boundary's render tree can
// be exercised inside the existing fast suite.
//
// This is a config limitation, not a verdict on RTL — it is installed
// (package.json devDependencies) and issue #46's Proposal names it. Switching
// the suite to the jest-expo preset so RTL is usable repo-wide is tracked
// separately; see the issue linked from PR #49.
jest.mock('react-native', () => {
  const ReactActual = require('react');
  const host = (name: string) =>
    function MockHost(props: { children?: React.ReactNode }) {
      return ReactActual.createElement(name, props, props.children);
    };
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  };
});

// Imported after the mock is registered (jest hoists jest.mock above imports).
import { RootErrorBoundary } from '../RootErrorBoundary';

type JsonNode =
  | string
  | null
  | { type: string; props: Record<string, any>; children: JsonNode[] | null };

function flattenText(node: JsonNode | JsonNode[] | undefined): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return flattenText(node.children ?? undefined);
}

function findHost(node: JsonNode | JsonNode[] | undefined, type: string): any {
  if (node == null || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findHost(child, type);
      if (found) return found;
    }
    return null;
  }
  if (node.type === type) return node;
  return findHost(node.children ?? undefined, type);
}

function Boom(): React.ReactElement {
  throw new Error('boom');
}

describe('RootErrorBoundary', () => {
  const originalError = console.error;

  beforeEach(() => {
    // React logs caught render errors to console.error; silence the noise and
    // let us assert on our own componentDidCatch logging.
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when nothing throws', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <RootErrorBoundary>
          <>{'child content'}</>
        </RootErrorBoundary>
      );
    });
    const text = flattenText(renderer.toJSON() as JsonNode);
    expect(text).toContain('child content');
    expect(text).not.toContain('Something went wrong');
  });

  it('renders the fallback when a child throws', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <RootErrorBoundary>
          <Boom />
        </RootErrorBoundary>
      );
    });
    const text = flattenText(renderer.toJSON() as JsonNode);
    expect(text).toContain('Something went wrong');
    expect(text).toContain('Try again');
  });

  it('logs the caught error in componentDidCatch', () => {
    act(() => {
      TestRenderer.create(
        <RootErrorBoundary>
          <Boom />
        </RootErrorBoundary>
      );
    });
    // Asserted positionally rather than with expect.anything(): React does not
    // contractually guarantee info.componentStack is non-null, and
    // expect.anything() fails on null/undefined.
    const logged = (console.error as jest.Mock).mock.calls.find(
      (args: unknown[]) => args[0] === 'Uncaught render error:'
    );
    expect(logged).toBeDefined();
    expect(logged).toHaveLength(3);
    expect(logged[1]).toBeInstanceOf(Error);
    expect((logged[1] as Error).message).toBe('boom');
  });

  it('re-mounts the subtree when retry is pressed', () => {
    // Mount/unmount counters are what make this an assertion about *re-mounting*
    // rather than about re-rendering: the two produce identical output, so
    // asserting on rendered text alone cannot tell them apart.
    let mounts = 0;
    let unmounts = 0;
    let shouldThrow = false;

    function Flaky(): React.ReactElement {
      React.useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      if (shouldThrow) {
        throw new Error('flaky');
      }
      return <>{'recovered child'}</>;
    }

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <RootErrorBoundary>
          <Flaky />
        </RootErrorBoundary>
      );
    });

    // Child mounted cleanly first, so a later mount can only be a re-mount.
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    expect(flattenText(renderer.toJSON() as JsonNode)).toContain('recovered child');

    // The child starts throwing; re-render so the boundary catches it.
    shouldThrow = true;
    act(() => {
      renderer.update(
        <RootErrorBoundary>
          <Flaky />
        </RootErrorBoundary>
      );
    });

    // The failed subtree was torn down and the fallback is shown.
    expect(unmounts).toBe(1);
    expect(flattenText(renderer.toJSON() as JsonNode)).toContain('Something went wrong');

    // Fix the underlying condition, then press "Try again".
    shouldThrow = false;
    const pressable = findHost(renderer.toJSON() as JsonNode, 'Pressable');
    expect(pressable).not.toBeNull();
    act(() => {
      pressable.props.onPress();
    });

    // A *new* instance mounted — this fails if retry merely re-rendered a
    // preserved child instead of re-mounting the subtree.
    expect(mounts).toBe(2);
    expect(unmounts).toBe(1);
    const text = flattenText(renderer.toJSON() as JsonNode);
    expect(text).toContain('recovered child');
    expect(text).not.toContain('Something went wrong');
  });
});
