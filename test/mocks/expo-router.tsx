import React from 'react';

/** Shared router spy — cleared between tests by jest's clearMocks. */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  setParams: jest.fn(),
};

export const useRouter = () => mockRouter;

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

export function Stack({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Tabs({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
