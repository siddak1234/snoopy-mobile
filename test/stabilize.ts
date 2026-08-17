/**
 * Removes sampled-animation noise from a snapshot tree, and nothing else.
 *
 * `Skeleton` pulses its opacity 0.45→1 forever (`withRepeat`), so a rendered
 * tree captures whatever phase the animation happened to be at when `toJSON()`
 * ran. Measured, not theorised: rendering one Skeleton twelve times returned
 * `0.45000422837574194` once and `0.45` the other eleven times, which is a
 * snapshot mismatch and was the cause of an observed full-suite failure that
 * eleven later runs could not reproduce. A frozen-UI gate that fails at random
 * is one people learn to re-run, and that is how a real regression gets waved
 * through.
 *
 * **This denoises; it does not weaken the gate.** Only *numbers* under the
 * `jestAnimated*` props are rounded:
 *
 * - Animated colours are strings, so `NocToggle`'s track — `interpolateColor`
 *   from neutral-800 to the accent — is compared exactly as before. That value
 *   is real gate signal: it moves when the accent token moves.
 * - `NocToggle` cannot drift anyway. It seeds `useSharedValue(value ? 1 : 0)`
 *   and then animates to that same value, so its progress never travels and its
 *   knob sits at exactly 0 or 18.
 * - Ordinary `style` / `jestInlineStyle` are untouched, so every colour,
 *   dimension, radius and font a component resolves is still asserted.
 *
 * Two decimal places is chosen so a value a human would author (0.45, 18) is
 * unchanged while sub-frame drift disappears. A real change — 0.45→0.5, or a
 * knob travelling 18→20 — still fails. Applying this function to the existing
 * snapshots changes none of them, which is the property that proves it is a
 * denoiser rather than a mask; `nocturne-visual` asserts that by continuing to
 * pass against snapshots written before it existed.
 */

const PRECISION = 100; // 2 decimal places

/** Keys whose subtree holds a sampled animation value rather than authored style. */
const ANIMATED_KEYS = ['jestAnimatedStyle', 'jestAnimatedProps'];

/**
 * The one animated property that genuinely travels, and so cannot be pinned.
 *
 * Rounding was tried first and was not enough. It removes sub-frame drift
 * (0.45000422… → 0.45) but a *whole* frame moves the value far further: the
 * pulse eases 0.45→1 over 700ms, so ~80ms of scheduler delay reads 0.46, which
 * survives rounding and fails the snapshot. That is exactly what happened when
 * the suite grew to 23 files and the extra parallel load slowed each render.
 *
 * So the sampled phase is replaced outright. Nothing is lost that this gate
 * asserts: Skeleton's colour, width, height and radius live in the ordinary
 * `style`/`jestInlineStyle` and are still compared exactly, and the pulse itself
 * is motion — which Gate 8 does not name and DESIGN-GAPS item 11 tracks
 * separately as undesigned. `NocToggle` is untouched by this: its animated
 * values are a colour (a string) and a knob position that never travels.
 */
const SAMPLED = new Set(['opacity']);
const SAMPLED_MARKER = '<animated>';

function roundDeep(value: unknown, key?: string): unknown {
  if (typeof value === 'number') {
    if (key && SAMPLED.has(key)) return SAMPLED_MARKER;
    return Number.isFinite(value) ? Math.round(value * PRECISION) / PRECISION : value;
  }
  if (Array.isArray(value)) return value.map((v) => roundDeep(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundDeep(v, k)]),
    );
  }
  // Strings — including every animated colour — pass through untouched.
  return value;
}

/** Returns a copy of a react-test-renderer tree with animation noise removed. */
export function stabilizeAnimated<T>(tree: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;

    const entries = Object.entries(node as Record<string, unknown>).map(([key, value]) => {
      if (ANIMATED_KEYS.includes(key)) return [key, roundDeep(value)];
      return [key, walk(value)];
    });
    return Object.fromEntries(entries);
  };

  return walk(tree) as T;
}
