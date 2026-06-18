/**
 * The single source of truth for the app's visual design. Every screen and
 * component imports from here — no hardcoded colors, font sizes, spacing or
 * radii anywhere else in the codebase.
 */
export const theme = {
  colors: {
    // Backgrounds
    backgroundStart: '#FAF8F5', // warm cream
    backgroundEnd: '#FFFFFF', // pure white

    // Surfaces (cards, modals, sheets)
    surface: 'rgba(255, 253, 250, 0.75)', // glassy warm white
    surfaceBorder: 'rgba(210, 195, 178, 0.4)', // soft warm border

    // Accent (replaces all uses of #1d9e75)
    accent: '#8B6F47', // deep warm brown
    accentLight: '#C4A882', // lighter tan
    accentSubtle: '#F0E8DC', // very light tan tint (for chip backgrounds etc)

    // Text
    textPrimary: '#2C2416', // near-black warm brown
    textSecondary: '#8C7B6B', // medium warm grey-brown
    textTertiary: '#B8A898', // light warm grey

    // Semantic
    positive: '#5C8A6B', // muted sage green (money owed to you)
    negative: '#A05C4A', // muted terracotta (you owe)
    warning: '#C4934A', // warm amber

    // Glass
    glassBackground: 'rgba(250, 248, 245, 0.85)', // Android solid fallback
    glassBorder: 'rgba(255, 255, 255, 0.6)',
    glassShadow: 'rgba(139, 111, 71, 0.12)',
    glassTint: 'rgba(255, 253, 250, 0.4)', // faint warm wash over the iOS blur
    glassHighlight: 'rgba(255, 255, 255, 0.5)', // top hairline highlight on glass
    tabBarTint: 'rgba(252, 250, 247, 0.55)', // warm wash over the tab bar blur
    hairline: 'rgba(210, 195, 178, 0.5)', // subtle divider on cream

    // Fixed
    white: '#FFFFFF',
  },
  typography: {
    // Use system font (SF Pro on iOS) — no custom fonts needed
    sizes: {
      xs: 11,
      sm: 13,
      base: 15,
      md: 17,
      lg: 20,
      xl: 24,
      xxl: 30,
      display: 36,
    },
    weights: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
      heavy: '800' as const,
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.7,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#8B6F47',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: '#8B6F47',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    lg: {
      shadowColor: '#8B6F47',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 8,
    },
  },
} as const;
