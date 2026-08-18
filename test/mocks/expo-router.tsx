import React from 'react';

/** Shared router spy — cleared between tests by jest's clearMocks. */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  setParams: jest.fn(),
};

export const useRouter = () => mockRouter;

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

export function Tabs({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
Tabs.Screen = Screen;
