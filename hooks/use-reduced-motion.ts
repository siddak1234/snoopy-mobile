import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person has Reduce Motion on (round 23: the running step's turn
 * and the drop-down's grow, A2 and A4), and again whenever it changes. Read
 * from the system's accessibility settings; until the first answer, off.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (live) setReduced(value);
      },
      () => undefined,
    );
    const changed = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      changed.remove();
    };
  }, []);
  return reduced;
}
