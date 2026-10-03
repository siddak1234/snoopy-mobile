import React from 'react';

/** Shared router spy — cleared between tests by jest's clearMocks. */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  setParams: jest.fn(),
  // A screen opened from another has somewhere to go back to.
  canGoBack: jest.fn(() => true),
};

export const useRouter = () => mockRouter;

/** A screen's own navigation object: what a screen uses to change its own route's params. */
export const mockNavigation = { setParams: jest.fn() };

export const useNavigation = () => mockNavigation;

export const useFocusEffect = (effect: React.EffectCallback) => React.useEffect(effect, [effect]);

/** Route params for useLocalSearchParams — set via setMockParams before
 *  rendering; reset automatically between tests. */
const mockParams: Record<string, string> = {};

export function setMockParams(params: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, params);
}

export const useLocalSearchParams = () => ({ ...mockParams });

beforeEach(() => {
  setMockParams({});
});

/** Records where a route guard sent the user, without a navigator to run it. */
export const mockRedirect = jest.fn();

export function Redirect({ href }: { href: string }) {
  mockRedirect(href);
  return null;
}

/**
 * Navigator stand-ins.
 *
 * `Screen` is a declaration, not a rendered view: the real navigators read it as
 * configuration and render the matching route themselves. Rendering nothing is
 * therefore the faithful stand-in — a layout under test is asserted on the
 * routes it declares and the guards it applies, not on a child screen it never
 * draws itself.
 */
function Screen(_props: { name: string; options?: unknown }) {
  return null;
}

export function Stack({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
Stack.Screen = Screen;

/** Records each time a layout draws its tab navigator: a guard's test says whether the tabs were drawn. */
export const mockTabsDrawn = jest.fn();

export function Tabs({ children }: { children?: React.ReactNode }) {
  mockTabsDrawn();
  return <>{children}</>;
}
Tabs.Screen = Screen;
