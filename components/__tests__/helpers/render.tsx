// Shared render/query helpers built on react-test-renderer.
//
// Both off-the-shelf options were tried and neither runs on this repo's
// Jest 30 / Expo SDK 54 stack; `README.md` in this directory records the exact
// failures and how to re-check them. react-test-renderer plus the rnMock host
// stubs gives us the same querying power with zero native dependencies.
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
//
// A disabled touchable swallows the press in real RN, so this does too.
// Without it `disabled` is an inert attribute and no behavioural assertion can
// tell a correctly-disabled control apart from a live one.
export function press(node: TestInstance, event?: unknown): void {
  if (node.props.disabled === true) return;
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

// Invoke any other prop callback (onSubmitEditing, onRequestClose, …) inside
// act(). Calling these directly off `node.props` schedules a state update
// outside act and React warns; route them through here instead.
export function invoke(
  node: TestInstance,
  prop: string,
  ...args: unknown[]
): void {
  act(() => {
    (node.props[prop] as (...a: unknown[]) => void)(...args);
  });
}
