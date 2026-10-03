/**
 * A finger on a press, as React Native's responder system delivers it — the two
 * events RNTL's own `userEvent.press` sends a Pressable — so a test can hold a
 * press down (`responderGrant`) and read what the control draws while pressed,
 * then let go (`responderRelease`).
 */
export function touch(registrationName: 'onResponderGrant' | 'onResponderRelease') {
  return {
    persist: () => {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    preventDefault: () => {},
    stopPropagation: () => {},
    nativeEvent: {
      changedTouches: [],
      identifier: 0,
      locationX: 0,
      locationY: 0,
      pageX: 0,
      pageY: 0,
      target: 0,
      timestamp: Date.now(),
      touches: [],
    },
    currentTarget: { measure: () => {} },
    dispatchConfig: { registrationName },
  };
}
