import React from 'react';

/** Shared router spy — cleared between tests by jest's clearMocks. */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

export const useRouter = () => mockRouter;

export function Stack({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Tabs({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
