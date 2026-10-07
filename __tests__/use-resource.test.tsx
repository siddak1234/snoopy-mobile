import React from 'react';
import { Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';

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

/**
 * Every focus callback a screen registers, so a test can return to the screen.
 * The shared router mock runs a focus effect once, on mount; this one also lets
 * a test fire it again, which is what a person switching back to a tab does.
 */
const mockFocusEffects: (() => void)[] = [];
jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/test/mocks/expo-router');
  const ReactActual = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.push(effect);
        effect();
      }, [effect]),
  };
});

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
    // Busy, not signed out, and the wait it stated — the website's words (Gate 24 parity, G3).
    expect(
      await screen.findByText(
        'The platform is busy right now. You have not been signed out, and nothing was lost. Try again in 30 seconds.',
      ),
    ).toBeTruthy();
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

  it('re-reads when the screen regains focus, keeping its rows in place (24.4.4)', async () => {
    const seen: string[] = [];
    let answer = 'first';
    const read = jest.fn(async () => answer);
    function Watch() {
      const state = useResource(read, []);
      const label = state.status === 'ready' ? `ready:${state.data}` : state.status;
      seen.push(label);
      return <Text>{label}</Text>;
    }
    await renderWithProviders(<Watch />);
    expect(await screen.findByText('ready:first')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);

    answer = 'second';
    await act(async () => mockFocusEffects.at(-1)?.());
    expect(await screen.findByText('ready:second')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
    // No skeleton between the two: the rows stayed until the answer replaced them.
    expect(seen.slice(seen.indexOf('ready:first'))).not.toContain('loading');
  });

  it('keeps the rows on screen when a re-read fails', async () => {
    let fail = false;
    const read = jest.fn(async () => {
      if (fail) throw new PlatformError('Refused', 500);
      return 'rows';
    });
    await renderWithProviders(<Probe read={read} />);
    expect(await screen.findByText('ready:rows')).toBeTruthy();

    fail = true;
    await act(async () => mockFocusEffects.at(-1)?.());
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('ready:rows')).toBeTruthy();
  });

  it('re-reads on refresh() after a change, keeping the rows, so a page never goes blank to confirm what it just showed (feedback #6)', async () => {
    // Pausing a workflow records the platform's answer and then re-reads; the
    // first TestFlight build re-read with reload(), which replaced the page
    // with a skeleton the owner read as blank. refresh() is the focus re-read,
    // deliberately: same request, rows kept, answer replaces them.
    const seen: string[] = [];
    let answer = 'live';
    let refresh: () => void = () => undefined;
    const read = jest.fn(async () => answer);
    function Watch() {
      const state = useResource(read, []);
      refresh = state.refresh;
      const label = state.status === 'ready' ? `ready:${state.data}` : state.status;
      seen.push(label);
      return <Text>{label}</Text>;
    }
    await renderWithProviders(<Watch />);
    expect(await screen.findByText('ready:live')).toBeTruthy();

    answer = 'paused';
    await act(async () => refresh());
    expect(await screen.findByText('ready:paused')).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
    expect(seen.slice(seen.indexOf('ready:live'))).not.toContain('loading');
  });

  it('starts a reload() — after a change, or Retry — from loading, and says when it fails', async () => {
    // The rows on screen are known to be out of date after a change, so they
    // are not left to act on, and a failed reload is not hidden behind them.
    const seen: string[] = [];
    let fail = false;
    let reload: () => void = () => undefined;
    const read = jest.fn(async () => {
      if (fail) throw new PlatformError('Refused', 500);
      return 'rows';
    });
    function Watch() {
      const state = useResource(read, []);
      reload = state.reload;
      const label = state.status === 'ready' ? `ready:${state.data}` : state.status;
      seen.push(label);
      return <Text>{label}</Text>;
    }
    await renderWithProviders(<Watch />);
    expect(await screen.findByText('ready:rows')).toBeTruthy();

    fail = true;
    await act(async () => reload());
    expect(await screen.findByText('error')).toBeTruthy();
    expect(seen.slice(seen.indexOf('ready:rows'))).toContain('loading');
  });

  it("starts a CHANGED request from loading, never showing the last one's rows", async () => {
    const seen: string[] = [];
    function Scoped({ workspace }: { workspace: string }) {
      const state = useResource(async () => `data for ${workspace}`, [workspace]);
      const label = state.status === 'ready' ? `ready:${state.data}` : state.status;
      seen.push(label);
      return <Text>{label}</Text>;
    }
    const view = await renderWithProviders(<Scoped workspace="w1" />);
    expect(await screen.findByText('ready:data for w1')).toBeTruthy();
    const before = seen.length;
    await view.rerender(<Scoped workspace="w2" />);
    expect(await screen.findByText('ready:data for w2')).toBeTruthy();
    // Between the two, the screen said loading — not w1's rows under w2.
    expect(seen.slice(before)).toContain('loading');
  });
});

