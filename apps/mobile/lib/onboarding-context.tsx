import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Tracks whether the one-time onboarding has been completed. `complete` is
 * null while the persisted flag is still loading. Calling finish() marks it
 * done (and persists), which flips the root navigator past onboarding.
 */
const STORAGE_KEY = 'onboarding_complete';

type OnboardingContextValue = {
  complete: boolean | null;
  finish: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue>({
  complete: null,
  finish: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => setComplete(value === 'true'));
  }, []);

  const finish = () => {
    setComplete(true);
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
  };

  return (
    <OnboardingContext.Provider value={{ complete, finish }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
