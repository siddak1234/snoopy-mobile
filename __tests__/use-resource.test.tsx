import React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { useResource } from '@/hooks/use-resource';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformUnreachableError,
} from '@/lib/platform/problem';
import { renderWithProviders } from '@/test/render';

/**
 * The four states a read can be in, and why they are not interchangeable.
 *
 * The design draws a different screen for each: "You're offline" when nothing
 * reached the platform, "Couldn't load X" when the platform refused, and the
 * prototype's own content when the build simply has no backend. Collapsing any
 * pair would put the wrong words in front of a person.
 */

function Probe({ read }: { read: () => Promise<string> }) {
  const state = useResource(read, []);
  return <Text>{state.status === 'ready' ? `ready:${state.data}` : state.status}</Text>;
}

async function stateFor(read: () => Promise<string>): Promise<string> {
  await renderWithProviders(<Probe read={read} />);
  return (await screen.findByText(/ready|error|offline|unconfigured/)).props.children as string;
}

describe('useResource', () => {
  it('reports ready with the value on success', async () => {
    expect(await stateFor(async () => 'catalog')).toBe('ready:catalog');
  });

  it('reports OFFLINE when the request never landed', async () => {
    // A DNS failure or refused connection. Nothing is wrong with the platform,
    // so the design says so rather than blaming it.
    expect(
      await stateFor(async () => {
        throw new PlatformUnreachableError();
      }),
    ).toBe('offline');
  });

  it('reports ERROR when the platform answered and refused', async () => {
    expect(
      await stateFor(async () => {
        throw new PlatformError('Service Unavailable', 503, 'NOT_CONFIGURED');
      }),
    ).toBe('error');
  });

  it('separates a real 502 from an unreachable one, though both are 502', async () => {
    // `PlatformUnreachableError` IS a 502 so that every `status === 502` rule
    // keeps working; the type is what tells the screen which happened.
    expect(
      await stateFor(async () => {
        throw new PlatformError('Bad Gateway', 502);
      }),
    ).toBe('error');
  });

  it('reports UNCONFIGURED rather than a failure, so the prototype stays browsable', async () => {
    expect(
      await stateFor(async () => {
        throw new PlatformNotConfiguredError();
      }),
    ).toBe('unconfigured');
  });

  it('catches a SYNCHRONOUS throw rather than letting it crash the render', async () => {
    // Regression: `useWorkspaceResource` throws synchronously when no workspace
    // has resolved, which is the normal case in an unconfigured build. Before
    // the read was wrapped, that escaped the promise chain and surfaced as a
    // render error — every wired screen crashed instead of showing the
    // prototype. The async cases below did not catch it, because an async throw
    // is already a rejected promise.
    const syncThrow = (() => {
      throw new PlatformNotConfiguredError();
    }) as unknown as () => Promise<string>;
    expect(await stateFor(syncThrow)).toBe('unconfigured');
  });

  it('treats a non-platform throw as an error rather than crashing the screen', async () => {
    expect(
      await stateFor(async () => {
        throw new Error('boom');
      }),
    ).toBe('error');
  });
});
