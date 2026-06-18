import { Platform, useColorScheme } from 'react-native';
import { useThemeMode } from './theme-context';

/**
 * Design tokens for SplitSmart. Two palettes - a warm linen light mode and a
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
  tabBarBorder: string;
  hairline: string;
  vignette: string; // faint edge-darkening for depth over the gradient
  white: string;
};

const lightColors: Colors = {
  // Near-white neutral canvas with just a whisper of warmth - the colour
  // should barely be nameable; warmth comes from the accent, not the surface.
  backgroundStart: '#F5F4F2',
  backgroundEnd: '#FFFFFF',

  surface: 'rgba(255, 255, 255, 0.85)', // cards lift slightly off the canvas
  surfaceBorder: 'rgba(0, 0, 0, 0.06)',

  accent: '#8B6F47', // deep warm brown / brass - unchanged
  accentLight: '#B79B73',
  accentSubtle: '#E5DAC6',
  onAccent: '#FFFFFF',

  textPrimary: '#2A241E', // warm near-black ink
  textSecondary: '#6E6253',
  textTertiary: '#9F9079',

  positive: '#5E7C63', // muted sage
  negative: '#A6553C', // terracotta
  warning: '#B98B4E', // warm amber

  glassBackground: 'rgba(255, 255, 255, 0.85)', // Android / fallback fill
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassShadow: 'rgba(60, 50, 40, 0.14)',
  glassTint: 'rgba(255, 255, 255, 0.12)', // near-zero neutral lift over the blur
  glassHighlight: 'rgba(255, 255, 255, 0.6)',
  tabBarTint: 'rgba(255, 255, 255, 0.5)',
  tabBarBorder: 'rgba(255, 255, 255, 0.8)',
  hairline: 'rgba(0, 0, 0, 0.07)',
  vignette: 'rgba(0, 0, 0, 0.025)',

  white: '#FFFFFF',
};

const darkColors: Colors = {
  // Native iOS dark - deep and clean, not brownish.
  backgroundStart: '#1C1C1E',
  backgroundEnd: '#000000',

  surface: 'rgba(44, 44, 46, 0.9)', // iOS elevated surface
  surfaceBorder: 'rgba(255, 255, 255, 0.08)',

  accent: '#CBA76C', // brass/gold, legible on dark - same gold identity
  accentLight: '#DDC18C',
  accentSubtle: 'rgba(203, 167, 108, 0.18)',
  onAccent: '#1C1C1E',

  textPrimary: '#ECE4D6',
  textSecondary: '#A99C86',
  textTertiary: '#766A58',

  positive: '#88A98D',
  negative: '#CC8568',
  warning: '#D6AC6C',

  glassBackground: 'rgba(44, 44, 46, 0.9)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassShadow: 'rgba(0, 0, 0, 0.5)',
  glassTint: 'rgba(255, 255, 255, 0.04)',
  glassHighlight: 'rgba(255, 255, 255, 0.08)',
  tabBarTint: 'rgba(44, 44, 46, 0.55)',
  tabBarBorder: 'rgba(255, 255, 255, 0.15)',
  hairline: 'rgba(255, 255, 255, 0.1)',
  vignette: 'rgba(0, 0, 0, 0.3)',

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

/** Active theme: the user's preference, or the system scheme when 'system'. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const { mode } = useThemeMode();
  const effective = mode === 'system' ? system ?? 'light' : mode;
  return effective === 'dark' ? darkTheme : lightTheme;
}

/** Light-mode alias for back-compat and module-level (non-reactive) use. */
export const theme = lightTheme;
