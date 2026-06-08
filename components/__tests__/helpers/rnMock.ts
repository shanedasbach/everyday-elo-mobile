// Lightweight react-native stand-in for component unit tests.
//
// jest-expo's preset does not run under this repo's `node` test environment
// (see issue #48), so instead of loading real native modules we render the
// components with react-test-renderer against these pass-through host stubs.
// Each primitive becomes a host element whose name and props are queryable.
import React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function host(name: string) {
  const Component = (props: AnyProps) =>
    React.createElement(name, props, props.children);
  Component.displayName = name;
  return Component;
}

export const View = host('View');
export const Text = host('Text');
export const TextInput = host('TextInput');
export const TouchableOpacity = host('TouchableOpacity');
export const Pressable = host('Pressable');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');
export const Modal = host('Modal');

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
};

// Mutable so individual tests can exercise both branches of
// `Platform.OS === 'ios' ? ... : ...` ternaries.
export const Platform: { OS: string; select: (spec: AnyProps) => unknown } = {
  OS: 'ios',
  select: (spec) => (spec.ios !== undefined ? spec.ios : spec.default),
};
