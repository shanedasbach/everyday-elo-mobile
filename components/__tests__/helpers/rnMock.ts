// Lightweight react-native stand-in for component unit tests.
//
// Neither of the two off-the-shelf options works on this repo's Jest 30 /
// Expo SDK 54 stack — see `components/__tests__/helpers/README.md` for the
// exact errors — so components are rendered with react-test-renderer against
// these host stubs instead. Each primitive becomes a host element whose name
// and props are queryable.
//
// The stubs are deliberately *not* pure pass-throughs: `Modal` honours
// `visible` and the touchables honour `disabled`, so those two props have real
// semantics a test can observe rather than being inert attributes on a node.
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
export const KeyboardAvoidingView = host('KeyboardAvoidingView');
export const ActivityIndicator = host('ActivityIndicator');

// Touchables are host stubs like the rest; `disabled` is enforced by the
// `press()` helper rather than here, so that a disabled node stays in the tree
// and remains queryable (real RN renders disabled touchables too).
export const TouchableOpacity = host('TouchableOpacity');
export const Pressable = host('Pressable');

// A real <Modal visible={false}> renders nothing. Mirroring that is what makes
// "the modal renders while it should be hidden" — the single most user-visible
// modal regression — observable to a test. The stub still appears in the tree
// so `visible` itself stays assertable.
const ModalHost = host('Modal');
export const Modal = (props: AnyProps) =>
  // `children` must be cleared on the props object itself: ModalHost reads
  // props.children, so a null third argument to createElement is ignored.
  React.createElement(
    ModalHost,
    props.visible === false ? { ...props, children: null } : props,
  );
Modal.displayName = 'Modal';

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
};

// Mutable so individual tests can exercise both branches of
// `Platform.OS === 'ios' ? ... : ...` ternaries.
export const Platform: { OS: string; select: (spec: AnyProps) => unknown } = {
  OS: 'ios',
  select: (spec) => (spec.ios !== undefined ? spec.ios : spec.default),
};
