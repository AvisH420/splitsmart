import { Platform, useColorScheme } from 'react-native';

/**
 * Design tokens for SplitSmart. Two palettes — a warm linen light mode and a
 * warm charcoal dark mode (think aged paper by day, a dimly lit room at night,
 * never cold grey). Scale tokens (spacing, radii, type, shadows) are shared.
 *
 * Components read the active palette through `useTheme()`. `theme` is a
 * light-mode alias kept for convenience and back-compat.
 */

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  backgroundStart: string;
  backgroundEnd: string;
  surface: string;
  surfaceBorder: string;
  accent: string;
  accentLight: string;
  accentSubtle: string;
  onAccent: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  positive: string;
  negative: string;
  warning: string;
  glassBackground: string;
  glassBorder: string;
  glassShadow: string;
  glassTint: string;
  glassHighlight: string;
  tabBarTint: string;
  hairline: string;
  white: string;
};

const lightColors: Colors = {
  // Warm linen — soft light from above (lighter top, deeper bottom).
  backgroundStart: '#ECE6D9',
  backgroundEnd: '#DCD3C1',

  surface: '#F4EFE6', // a touch lighter than the background
  surfaceBorder: 'rgba(170, 150, 120, 0.28)',

  accent: '#8B6F47', // deep warm brown
  accentLight: '#B79B73',
  accentSubtle: '#E5DAC6',
  onAccent: '#FFFFFF',

  textPrimary: '#2A241E', // warm near-black ink
  textSecondary: '#6E6253',
  textTertiary: '#9F9079',

  positive: '#5E7C63', // muted sage
  negative: '#A6553C', // terracotta
  warning: '#B98B4E', // warm amber

  glassBackground: 'rgba(244, 239, 230, 0.72)', // Android / fallback fill
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  glassShadow: 'rgba(80, 60, 35, 0.16)',
  glassTint: 'rgba(244, 239, 230, 0.4)', // warm wash over iOS blur
  glassHighlight: 'rgba(255, 255, 255, 0.5)',
  tabBarTint: 'rgba(240, 234, 224, 0.4)',
  hairline: 'rgba(150, 130, 100, 0.28)',

  white: '#FFFFFF',
};

const darkColors: Colors = {
  // Warm charcoal — a dimly lit room, never cold.
  backgroundStart: '#201C16',
  backgroundEnd: '#15120D',

  surface: '#26211A', // slightly lifted warm dark
  surfaceBorder: 'rgba(120, 105, 82, 0.32)',

  accent: '#CBA76C', // warm brass, legible on dark
  accentLight: '#DDC18C',
  accentSubtle: 'rgba(203, 167, 108, 0.16)',
  onAccent: '#201C16',

  textPrimary: '#ECE4D6',
  textSecondary: '#A99C86',
  textTertiary: '#766A58',

  positive: '#88A98D',
  negative: '#CC8568',
  warning: '#D6AC6C',

  glassBackground: 'rgba(38, 33, 26, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassShadow: 'rgba(0, 0, 0, 0.4)',
  glassTint: 'rgba(32, 28, 22, 0.45)',
  glassHighlight: 'rgba(255, 255, 255, 0.06)',
  tabBarTint: 'rgba(28, 24, 18, 0.5)',
  hairline: 'rgba(150, 130, 100, 0.24)',

  white: '#FFFFFF',
};

const typography = {
  fonts: {
    serif: 'Georgia', // system serif on iOS, used for display moments
    mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 30,
    display: 36,
    giant: 52,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
  },
  lineHeights: { tight: 1.2, normal: 1.5, relaxed: 1.7 },
} as const;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

const radii = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

const shadows = {
  sm: {
    shadowColor: '#3A2C1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#3A2C1A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  lg: {
    shadowColor: '#3A2C1A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
} as const;

export type Theme = {
  scheme: ColorScheme;
  blurTint: 'light' | 'dark';
  colors: Colors;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
};

export const lightTheme: Theme = {
  scheme: 'light',
  blurTint: 'light',
  colors: lightColors,
  typography,
  spacing,
  radii,
  shadows,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  blurTint: 'dark',
  colors: darkColors,
  typography,
  spacing,
  radii,
  shadows,
};

/** Active theme based on the system colour scheme. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** Light-mode alias for back-compat and module-level (non-reactive) use. */
export const theme = lightTheme;
