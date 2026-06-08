import React from 'react';
// react-test-renderer ships no bundled types and @types/react-test-renderer is
// deprecated on the React 19 line, so require() keeps it untyped rather than
// adding a stale type-only dependency.
const TestRenderer = require('react-test-renderer');
const act: (callback: () => void) => void = TestRenderer.act;

// The project's unit-test environment is node + ts-jest, which can't transform
// react-native's Flow-typed source. We mock react-native with minimal host
// components so the boundary's render tree can be exercised without pulling in
// the full RN/jest-expo runtime (which is currently incompatible with this
// jest 30 / Expo SDK 54 stack). This keeps the test in the existing fast suite.
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
    expect(console.error).toHaveBeenCalledWith(
      'Uncaught render error:',
      expect.any(Error),
      expect.anything()
    );
  });

  it('re-mounts the subtree when retry is pressed', () => {
    let shouldThrow = true;
    function Flaky(): React.ReactElement {
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

    // Initial render threw → fallback is shown.
    expect(flattenText(renderer.toJSON() as JsonNode)).toContain('Something went wrong');

    // Fix the underlying condition, then press "Try again".
    shouldThrow = false;
    const pressable = findHost(renderer.toJSON() as JsonNode, 'Pressable');
    expect(pressable).not.toBeNull();
    act(() => {
      pressable.props.onPress();
    });

    // Subtree re-mounted and now renders successfully.
    const text = flattenText(renderer.toJSON() as JsonNode);
    expect(text).toContain('recovered child');
    expect(text).not.toContain('Something went wrong');
  });
});
