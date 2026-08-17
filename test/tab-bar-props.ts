import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * The navigation props `NocturneTabBar` needs, in the design's tab order.
 *
 * Shared by the behaviour suite and the visual suite so there is one fake rather
 * than two that can drift. It is a fake, and worth being honest about what that
 * costs: it proves nothing about real navigation. What it does hold is the
 * component's own rendering — which is the whole of what a snapshot asserts.
 */
const ROUTES = ['(home)', 'flows', 'solutions', 'activity', 'settings'];

export function makeTabBarProps(activeIndex = 0) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props = {
    state: {
      index: activeIndex,
      routes: ROUTES.map((name) => ({ key: `${name}-key`, name })),
    },
    descriptors: Object.fromEntries(ROUTES.map((name) => [`${name}-key`, { options: {} }])),
    navigation,
  } as unknown as BottomTabBarProps;
  return { props, navigation };
}
