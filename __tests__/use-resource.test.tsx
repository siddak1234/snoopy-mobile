import React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { ScreenError } from '@/components/screen-state';
import { busyBody, useResource } from '@/hooks/use-resource';
import { ERROR_BODY } from '@/lib/content/screen-states';
import {
  PlatformError,
  PlatformNotConfiguredError,
  PlatformRateLimitedError,
  PlatformUnreachableError,
} from '@/lib/platform/problem';
import { renderWithProviders } from '@/test/render';

/**
 * The four states a read can be in, and why they are not interchangeable.
 *
 * The design draws a different screen for each: "You're offline" when nothing
 * reached the platform, "Couldn't load X" when the platform refused, and the
 * a controlled refusal when the build simply has no backend. Collapsing any
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

  it('says a 429 load in words with its wait, never as a plain failure (24.3.3)', async () => {
    function Busy() {
      const state = useResource<string>(async () => {
        throw new PlatformRateLimitedError('The platform is busy right now. Try again in 30 seconds.', 30);
      }, []);
      if (state.status !== 'error') return <Text>{state.status}</Text>;
      return <ScreenError title="Couldn't load this" body={busyBody(state)} onRetry={state.reload} />;
    }
    await renderWithProviders(<Busy />);
    expect(await screen.findByText('The platform is busy right now. Try again in 30 seconds.')).toBeTruthy();
    expect(screen.queryByText(ERROR_BODY)).toBeNull();
  });

  it('keeps the design body for an ordinary refusal', async () => {
    expect(busyBody({ status: 'error', message: 'Forbidden' })).toBeUndefined();
  });

  it('reports UNCONFIGURED rather than inventing a backend failure', async () => {
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
    // controlled state. The async cases below did not catch it, because an async throw
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
