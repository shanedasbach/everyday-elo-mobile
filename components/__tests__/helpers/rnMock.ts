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
export const SafeAreaView = host('SafeAreaView');
export const ScrollView = host('ScrollView');

// Touchables are host stubs like the rest; `disabled` is enforced by the
// `press()` helper rather than here, so that a disabled node stays in the tree
// and remains queryable (real RN renders disabled touchables too).
export const TouchableOpacity = host('TouchableOpacity');
export const Pressable = host('Pressable');

// Static APIs (not components) that screens call imperatively. Plain
// `jest.fn()`s so a test can assert calls and, for Alert, invoke a captured
// button's `onPress` the same way a real user tapping it would.
export const Alert = { alert: jest.fn() };
export const Share = { share: jest.fn() };

// Animated stub: a real Value plus View/spring/timing that resolve
// synchronously. Screens under test only read `.interpolate()` for a style
// and call `.start(callback)` to react to animation completion — tests drive
// that completion by tapping the underlying control directly rather than
// replaying pan-gesture events, so the stub only needs to be inert, not
// numerically accurate.
class AnimatedValueMock {
  private value: number;
  constructor(value: number) {
    this.value = value;
  }
  setValue(value: number) {
    this.value = value;
  }
  interpolate() {
    return this.value;
  }
}

function animationStub(value: AnimatedValueMock, config: { toValue: number }) {
  return {
    start: (cb?: () => void) => {
      value.setValue(config.toValue);
      cb?.();
    },
  };
}

export const Animated = {
  Value: AnimatedValueMock,
  View: host('Animated.View'),
  spring: animationStub,
  timing: animationStub,
};

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
