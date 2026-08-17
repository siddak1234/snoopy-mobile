/**
 * Nocturne design-system tokens, translated 1:1 from the Claude Design project
 * "Autom8x.ai iOS App Design":
 * - dark values: _ds/nocturne-…/styles.css `:root`
 * - light values: Screen.dc.html `.thm-light` overrides (unlisted steps
 *   intentionally inherit the dark ramp value, matching the CSS cascade)
 * - status colors: Screen.dc.html screen logic (ok/warn/err + pill triples)
 *
 * Adherence rule (from _ds/_adherence.oxlintrc.json): no raw hex colors and no
 * ad-hoc font families outside this file — screens and components must consume
 * these tokens.
 */
import type { TextStyle, ViewStyle } from 'react-native';

/** CSS color-mix(in srgb, <hex> N%, transparent) equivalent. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** CSS letter-spacing in em → RN points (em × font size). */
export function em(track: number, fontSize: number): number {
  return track * fontSize;
}

type Ramp = {
  100: string; 200: string; 300: string; 400: string; 500: string;
  600: string; 700: string; 800: string; 900: string;
};

export type NocturnePalette = {
  scheme: 'dark' | 'light';
  bg: string;
  surface: string;
  text: string;
  accent: string;
  divider: string;
  neutral: Ramp;
  accentRamp: Ramp;
  /** Brand mark tint: design renders the (light-grey) PNG as-is on dark and
   *  applies CSS invert(.87) on light, which computes to ~#383838. */
  brandTint: string | undefined;
};

const darkNeutral: Ramp = {
  100: '#f3f5fe', 200: '#e4e7f5', 300: '#cfd3e5', 400: '#b2b6ca', 500: '#9397ab',
  600: '#75798c', 700: '#595d6c', 800: '#3f424d', 900: '#292b31',
};

const darkAccent: Ramp = {
  100: '#f5f4ff', 200: '#e7e5fe', 300: '#d2cefd', 400: '#b5abfc', 500: '#968ae0',
  600: '#796cbf', 700: '#5d5294', 800: '#423a6a', 900: '#2b2741',
};

export const nocturneDark: NocturnePalette = {
  scheme: 'dark',
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  divider: withAlpha('#e9e9ed', 0.16),
  neutral: darkNeutral,
  accentRamp: darkAccent,
  brandTint: undefined,
};

export const nocturneLight: NocturnePalette = {
  scheme: 'light',
  bg: '#f5f5f8',
  surface: '#ffffff',
  text: '#20222f',
  accent: '#6a5cc4',
  divider: '#dcdde6',
  neutral: {
    ...darkNeutral,
    300: '#535770', 400: '#666a82', 500: '#7c8095', 600: '#5d617a',
    700: '#c9cbdb', 800: '#dfe0ea', 900: '#ebecf2',
  },
  accentRamp: {
    ...darkAccent,
    200: '#453a91', 300: '#5548ab', 400: '#5d50b5',
    700: '#c3bcec', 800: '#dcd8f4', 900: '#e9e6f8',
  },
  brandTint: '#383838',
};

/** Run/status colors from the design's screen logic. */
export const status = {
  ok: '#34d399',
  okBg: 'rgba(52,211,153,0.1)',
  okBorder: 'rgba(52,211,153,0.35)',
  /** "All caught up" banner (design apprAllDone). */
  okBannerBg: 'rgba(52,211,153,0.07)',
  okBannerBorder: 'rgba(52,211,153,0.3)',
  warnText: '#fbbf24',
  warnBg: 'rgba(245,158,11,0.1)',
  warnBorder: 'rgba(245,158,11,0.35)',
  warnCalloutBg: 'rgba(245,158,11,0.08)',
  warnCalloutBorder: 'rgba(245,158,11,0.25)',
  err: '#f87171',
  errBg: 'rgba(248,113,113,0.1)',
  errBorder: 'rgba(248,113,113,0.35)',
  errCalloutBg: 'rgba(248,113,113,0.08)',
  errCalloutBorder: 'rgba(248,113,113,0.3)',
  /** Dialog backdrop (design: rgba(12,13,22,.62) + blur). */
  overlay: 'rgba(12,13,22,0.62)',
  /**
   * Toggle knob + its drop shadow (the design's only pure white + black).
   *
   * The design writes the shadow as a single `rgba(0,0,0,.3)`. React Native
   * cannot consume that form: `shadowOpacity` is iOS-only, and Android tints its
   * elevation shadow with the colour's own alpha, so a combined value dims the
   * Android shadow. The one design value is therefore carried as a colour and an
   * alpha, which recombine to exactly `rgba(0,0,0,.3)` on iOS.
   */
  knob: '#ffffff',
  knobShadowColor: '#000000',
  knobShadowOpacity: 0.3,
} as const;

/** Inter, loaded via @expo-google-fonts/inter (design: --font-heading/body,
 *  heading weight 500 — hierarchy is size and space, never bolder). */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

/** DS radius scale + the specific radii the screens are drawn with. */
export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
  input: 12,
  tile: 11,
  card: 14,
  seg: 9,
  faceid: 26,
  hero: 32,
  pill: 999,
} as const;

/** DS spacing scale (0.70× density — compact on purpose). */
export const space = {
  s1: 2.8, s2: 5.6, s3: 8.4, s4: 11.2, s6: 16.8, s8: 22.4,
} as const;

/** Recurring screen-layout metrics measured from Screen.dc.html. The design
 *  canvas is 402×874 (iPhone 16 Pro pt grid) and bakes a ~59pt status area
 *  into its fixed top paddings; live screens use safe-area insets instead:
 *  paddingTop = insets.top + (designTop − 59). */
export const layout = {
  screenX: 20,
  authX: 24,
  welcomeX: 28,
  cardPad: 15,
  rowPadV: 13,
  rowPadH: 14,
  statusArea: 59,
  designTop: { app: 74, auth: 78, onboarding: 82, welcome: 120 },
} as const;

export type Elevation = { sm: ViewStyle; md: ViewStyle };

/** --shadow-sm/md. On dark these are a hairline ring (+ ambient darkness for
 *  md); on light (.thm-light) they are soft ink shadows. */
export function elevation(p: NocturnePalette): Elevation {
  if (p.scheme === 'dark') {
    return {
      sm: { borderWidth: 1, borderColor: p.neutral[800] },
      md: {
        borderWidth: 1,
        borderColor: p.neutral[700],
        shadowColor: '#000000',
        shadowOpacity: 0.55,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      },
    };
  }
  return {
    sm: {
      shadowColor: '#1e1e3c',
      shadowOpacity: 0.12,
      shadowRadius: 1.5,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    md: {
      shadowColor: '#1e1e3c',
      shadowOpacity: 0.14,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  };
}

/** Kicker/section-label text style ("AUTOMATION × AI", "RECENT RUNS", …). */
export function kicker(p: NocturnePalette, size = 11, track = 0.14): TextStyle {
  return {
    fontFamily: fonts.regular,
    fontSize: size,
    letterSpacing: em(track, size),
    color: p.neutral[400],
  };
}
