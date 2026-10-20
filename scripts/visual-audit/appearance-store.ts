/**
 * The visual audit's appearance store (round 24 A4): the real module
 * (`lib/platform/appearance-store.ts`), but the app follows the simulator's
 * appearance (Auto), so `xcrun simctl ui <device> appearance light|dark`
 * captures both palettes. Swapped in by `metro.config.js` only when
 * `VISUAL_AUDIT=1`.
 */
import type { Appearance } from '../../lib/platform/appearance-store';

export { writeAppearance, type Appearance } from '../../lib/platform/appearance-store';

export async function readAppearance(): Promise<Appearance> {
  return 'auto';
}
