import {
  elevation,
  em,
  fonts,
  nocturneDark,
  nocturneLight,
  radius,
  status,
  typeScale,
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

/** WCAG 2's contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("danger — one red per theme, readable in each (the owner's build 12 item 5)", () => {
  it("is the design's red in dark — status.err itself — and the website's light red in light", () => {
    expect(nocturneDark.danger).toBe('#f87171');
    expect(nocturneDark.danger).toBe(status.err);
    expect(nocturneLight.danger).toBe('#dc2626');
  });

  it("reads at 4.5:1 or more on its own palette's surface, where the design's red on white does not", () => {
    expect(contrast(nocturneDark.danger, nocturneDark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(nocturneLight.danger, nocturneLight.surface)).toBeGreaterThanOrEqual(4.5);
    // Why light has its own: #f87171 on a white card is 2.77:1.
    expect(contrast(status.err, nocturneLight.surface)).toBeLessThan(3);
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

  it('ascends the type scale from a smallest step of 12 or more, each line clear of its glyphs (24.12)', () => {
    const steps = Object.values(typeScale);
    expect(Math.min(...steps.map((step) => step.fontSize))).toBeGreaterThanOrEqual(12);
    steps.slice(1).forEach((step, index) => {
      expect(step.fontSize).toBeGreaterThan(steps[index]!.fontSize);
      expect(step.lineHeight).toBeGreaterThan(steps[index]!.lineHeight);
    });
    // Inter's own line box is 1.21 em: a shorter line would cut its glyphs.
    for (const step of steps) expect(step.lineHeight).toBeGreaterThanOrEqual(step.fontSize * 1.21);
  });
});
