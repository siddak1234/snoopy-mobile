import type { Href } from 'expo-router';

import { status } from '@/constants/theme';
import type { useTheme } from '@/hooks/use-theme';
import type { Block, BlockOpen } from '@/lib/platform/automations';
import type { RunOrigin } from '@/lib/view/runs';

/**
 * How the blocks look and where they go (backend ADR-0048 decisions 8–10): a
 * tone is a theme token, never a colour of its own; a link is https only,
 * checked again here; a press is a typed target this app maps to its route.
 * Anything this build does not know draws neutral, or without a press.
 */

export type BlockOf<K extends Block['type']> = Extract<Block, { type: K }>;
export type Tone = 'neutral' | 'success' | 'warning' | 'error';
type Palette = ReturnType<typeof useTheme>['palette'];

const TONES: readonly string[] = ['neutral', 'success', 'warning', 'error'];

/** A tone this build knows, else neutral. */
export function toneOf(tone: unknown): Tone {
  return typeof tone === 'string' && TONES.includes(tone) ? (tone as Tone) : 'neutral';
}

/** A tone's colour, from the theme: the document chip's and the tiles' (`status`), neutral the text's. */
export function toneColor(tone: unknown, palette: Palette, neutral: string = palette.text): string {
  switch (toneOf(tone)) {
    case 'success':
      return status.ok;
    case 'warning':
      return status.warnText;
    case 'error':
      return status.err;
    default:
      return neutral;
  }
}

/**
 * An address to open outside the app: `https:` only, with a host and no user
 * or password — as the platform checks it, checked again when drawn. Anything
 * else is null and is not drawn as a link. ~~`opensOutside`, http or https~~
 * until Round 21 (backend ADR-0048 decision 9).
 */
export function httpsLink(url: unknown): { href: string; host: string } | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.host || parsed.username || parsed.password) return null;
    return { href: parsed.href, host: parsed.host };
  } catch {
    return null;
  }
}

/** Where the blocks are drawn: a run opened from another tab says where it came from (`returnTo`). */
export type BlockPlace = { runOrigin?: RunOrigin };

const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * A press's screen in this app: a run, a run's file, an item's file. A target
 * this build does not know, or one missing its ids, is null — drawn without a
 * press.
 */
export function openRoute(
  open: BlockOpen | undefined,
  place: BlockPlace,
): { href: Href; withAnchor: boolean } | null {
  if (!open || typeof open !== 'object') return null;
  const { runId, fileId, itemId } = open as Record<string, unknown>;
  switch (open.target) {
    case 'run':
      if (!id(runId)) return null;
      return place.runOrigin
        ? { href: { pathname: '/(tabs)/activity/run', params: { runId, returnTo: place.runOrigin } }, withAnchor: true }
        : { href: { pathname: '/(tabs)/activity/run', params: { runId } }, withAnchor: false };
    case 'run-file':
      return id(runId) && id(fileId)
        ? { href: { pathname: '/(tabs)/activity/run-file', params: { runId, fileId } }, withAnchor: false }
        : null;
    case 'item-file':
      return id(itemId) ? { href: { pathname: '/(tabs)/flows/item-file', params: { item: itemId } }, withAnchor: false } : null;
    default:
      return null;
  }
}

/**
 * A page's parts in the order its flow's manifest gives them
 * (`Subscription.pages`, backend ADR-0048 decision 5), else `fallback`, today's
 * order. A part this build does not know is `null`: the page draws the fallback
 * sentence in its place. The website's `pageParts`.
 */
export function pageParts<T extends string>(
  declared: readonly string[] | undefined,
  known: readonly T[],
  fallback: readonly T[],
): (T | null)[] {
  return (declared ?? fallback).map((part) => ((known as readonly string[]).includes(part) ? (part as T) : null));
}
