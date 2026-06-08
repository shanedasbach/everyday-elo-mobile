// Shared render/query helpers built on react-test-renderer.
//
// We deliberately avoid @testing-library/react-native here: it imports the real
// `react-native` internals for host-component config, which cannot load under
// this repo's `node` test environment. react-test-renderer plus the rnMock
// host stubs gives us the same querying power with zero native dependencies.
import type { ComponentType, ReactElement } from 'react';
import TestRenderer, {
  act,
  type ReactTestRenderer,
  type TestInstance,
} from 'react-test-renderer';

export function renderComponent(element: ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

// Recursively concatenate every string descendant of a test instance.
export function textOf(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  if (!node.children) return '';
  return node.children.map((child) => textOf(child)).join('');
}

// Find the first instance of `type` whose rendered text contains `text`.
export function findByText(
  root: TestInstance,
  type: ComponentType<Record<string, unknown>>,
  text: string,
): TestInstance {
  const match = root
    .findAllByType(type)
    .find((node) => textOf(node).includes(text));
  if (!match) {
    const name = (type as { displayName?: string }).displayName;
    throw new Error(`No <${name}> containing "${text}"`);
  }
  return match;
}

// Invoke a host element's onPress inside act(), passing an optional event.
export function press(node: TestInstance, event?: unknown): void {
  act(() => {
    (node.props.onPress as (e?: unknown) => void)(event);
  });
}

// Drive a TextInput's onChangeText inside act().
export function changeText(node: TestInstance, value: string): void {
  act(() => {
    (node.props.onChangeText as (v: string) => void)(value);
  });
}
