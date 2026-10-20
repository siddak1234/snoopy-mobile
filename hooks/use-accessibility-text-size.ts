import { useWindowDimensions } from 'react-native';

import { ACCESSIBILITY_TEXT_SCALE } from '@/constants/theme';

/**
 * Whether the phone's text size is one of iOS's accessibility sizes
 * (`ACCESSIBILITY_TEXT_SCALE` and up), and again whenever it changes. There,
 * what sits side by side stacks — Home's and a flow's tiles, Add a flow's
 * cards, the inbox's header — so no word breaks inside itself (round 24's
 * simulator audit; the owner's build 23 F14).
 */
export function useAccessibilityTextSize(): boolean {
  return useWindowDimensions().fontScale >= ACCESSIBILITY_TEXT_SCALE;
}
