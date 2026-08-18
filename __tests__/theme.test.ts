import {
  elevation,
  em,
  fonts,
  nocturneDark,
  nocturneLight,
  radius,
  status,
  withAlpha,
} from '@/constants/theme';

describe('withAlpha (color-mix equivalent)', () => {
  it('converts hex + alpha to rgba', () => {
    expect(withAlpha('#9184d9', 0.12)).toBe('rgba(145,132,217,0.12)');
    expect(withAlpha('#e9e9ed', 0.16)).toBe('rgba(233,233,237,0.16)');
    expect(withAlpha('#161826', 0.88)).toBe('rgba(22,24,38,0.88)');
  });
});

describe('em (CSS letter-spacing → RN points)', () => {
  it('multiplies track by font size', () => {
    expect(em(0.36, 12)).toBeCloseTo(4.32);
    expect(em(-0.015, 26)).toBeCloseTo(-0.39);
  });
});

describe('Nocturne dark palette — byte-exact vs the DS manifest', () => {
  it('carries the root tokens', () => {
    expect(nocturneDark.bg).toBe('#161826');
    expect(nocturneDark.surface).toBe('#232532');
    expect(nocturneDark.text).toBe('#e9e9ed');
    expect(nocturneDark.accent).toBe('#9184d9');
    expect(nocturneDark.divider).toBe('rgba(233,233,237,0.16)');
  });

  it('carries the full neutral ramp', () => {
    expect(nocturneDark.neutral).toEqual({
      100: '#f3f5fe', 200: '#e4e7f5', 300: '#cfd3e5', 400: '#b2b6ca', 500: '#9397ab',
      600: '#75798c', 700: '#595d6c', 800: '#3f424d', 900: '#292b31',
    });
  });

  it('carries the full accent ramp', () => {
    expect(nocturneDark.accentRamp).toEqual({
      100: '#f5f4ff', 200: '#e7e5fe', 300: '#d2cefd', 400: '#b5abfc', 500: '#968ae0',
      600: '#796cbf', 700: '#5d5294', 800: '#423a6a', 900: '#2b2741',
    });
  });
});

describe('Nocturne light palette — .thm-light overrides + inheritance', () => {
  it('applies the overrides', () => {
    expect(nocturneLight.bg).toBe('#f5f5f8');
    expect(nocturneLight.surface).toBe('#ffffff');
    expect(nocturneLight.text).toBe('#20222f');
    expect(nocturneLight.accent).toBe('#6a5cc4');
    expect(nocturneLight.divider).toBe('#dcdde6');
    expect(nocturneLight.neutral[700]).toBe('#c9cbdb');
    expect(nocturneLight.accentRamp[300]).toBe('#5548ab');
  });

  it('inherits unlisted ramp steps from the dark palette (CSS cascade)', () => {
    expect(nocturneLight.neutral[100]).toBe(nocturneDark.neutral[100]);
    expect(nocturneLight.neutral[200]).toBe(nocturneDark.neutral[200]);
    expect(nocturneLight.accentRamp[100]).toBe(nocturneDark.accentRamp[100]);
    expect(nocturneLight.accentRamp[500]).toBe(nocturneDark.accentRamp[500]);
    expect(nocturneLight.accentRamp[600]).toBe(nocturneDark.accentRamp[600]);
  });

  it('tints the brand mark on light only (design invert(.87))', () => {
    expect(nocturneDark.brandTint).toBeUndefined();
    expect(nocturneLight.brandTint).toBe('#383838');
  });
});

describe('status colors — from the design screen logic', () => {
  it('carries ok/warn/err and pill tints', () => {
    expect(status.ok).toBe('#34d399');
    expect(status.warnText).toBe('#fbbf24');
    expect(status.err).toBe('#f87171');
    expect(status.okBg).toBe('rgba(52,211,153,0.1)');
    expect(status.warnCalloutBorder).toBe('rgba(245,158,11,0.25)');
  });
});

describe('elevation — ring on dark, ink shadow on light', () => {
  it('dark sm is a hairline neutral-800 ring', () => {
    const e = elevation(nocturneDark);
    expect(e.sm).toEqual({ borderWidth: 1, borderColor: '#3f424d' });
    expect(e.md.borderColor).toBe('#595d6c');
  });

  it('light sm is a soft shadow, no ring', () => {
    const e = elevation(nocturneLight);
    expect(e.sm.borderWidth).toBeUndefined();
    expect(e.sm.shadowOpacity).toBeCloseTo(0.12);
  });
});

describe('scales', () => {
  it('keeps the DS radius scale', () => {
    expect(radius).toMatchObject({ sm: 4, md: 8, lg: 14, pill: 999 });
  });

  it('loads Inter at the three design weights', () => {
    expect(fonts).toEqual({
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
    });
  });
});
