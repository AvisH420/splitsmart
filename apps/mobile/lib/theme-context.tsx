import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * The user's appearance preference. 'system' follows the OS; 'light'/'dark'
 * force a scheme. Persisted across launches. theme.ts's useTheme() reads this
 * (combined with the OS scheme) to pick the active palette.
 *
 * This module intentionally imports nothing from theme.ts to avoid a cycle.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'splitsmart.themeMode';

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'system',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setModeState(value);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  return (
    <ThemeModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}
