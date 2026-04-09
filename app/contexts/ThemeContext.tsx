import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, type ColorSchemeName } from "react-native";

const STORAGE_KEY = "pem-theme-preference";

export type ThemePreference = "light" | "dark" | "system";

export type ThemeSemantic = {
  pageBackground: string;
  /** Grouped / alternate sections (iOS-style secondary system background). */
  surfacePage: string;
  cardBackground: string;
  /** Main labels — near-black (light) / near-white (dark). */
  textPrimary: string;
  /** Subheadlines, secondary labels — solid mid contrast, not “washed out”. */
  textSecondary: string;
  /** Timestamps, meta, captions — still legible (Apple tertiary / Material on-surface-variant). */
  textTertiary: string;
  border: string;
  borderMuted: string;
  pemAmber: string;
  onPrimary: string;
  error: string;
  /** Inputs — same role as textTertiary for placeholder text */
  placeholder: string;
  /** Inputs / secondary buttons */
  secondarySurface: string;
  /** Subtle brand-tinted control surface */
  brandMutedSurface: string;
  /** User chat bubble background */
  userBubble: string;
  /** Text on user chat bubble */
  userBubbleText: string;
  /** Dim/meta text on user chat bubble (timestamps, ticks) */
  userBubbleMeta: string;
};

/** Light: white canvas, clear grays, solid ink (Apple/Google clarity). */
const lightSemantic: ThemeSemantic = {
  pageBackground: "#ffffff",
  surfacePage: "#f2f2f7",
  cardBackground: "#ffffff",
  textPrimary: "#000000",
  textSecondary: "#3a3a3c",
  textTertiary: "#6e6e73",
  border: "#c6c6c8",
  borderMuted: "#e5e5ea",
  pemAmber: "#e8763a",
  onPrimary: "#ffffff",
  error: "#d70015",
  placeholder: "#8e8e93",
  secondarySurface: "#f2f2f7",
  brandMutedSurface: "#fff4ed",
  userBubble: "#e2ddd5",
  userBubbleText: "#1c1a16",
  userBubbleMeta: "#8a847d",
};

/** Dark: true black base, elevated surfaces, light gray text (not muddy brown-gray). */
const darkSemantic: ThemeSemantic = {
  pageBackground: "#000000",
  surfacePage: "#1c1c1e",
  cardBackground: "#2c2c2e",
  textPrimary: "#ffffff",
  textSecondary: "#d1d1d6",
  textTertiary: "#98989d",
  border: "#48484a",
  borderMuted: "#3a3a3c",
  pemAmber: "#e8763a",
  onPrimary: "#ffffff",
  error: "#ff453a",
  placeholder: "#8e8e93",
  secondarySurface: "#1c1c1e",
  brandMutedSurface: "#3a2e26",
  userBubble: "#3b3330",
  userBubbleText: "#f5f2ef",
  userBubbleMeta: "#a09891",
};

function resolveScheme(
  pref: ThemePreference,
  system: ColorSchemeName,
): "light" | "dark" {
  if (pref === "system") {
    return system === "dark" ? "dark" : "light";
  }
  return pref;
}

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolved: "light" | "dark";
  colors: ThemeSemantic;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(() =>
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setPreferenceState(v);
      }
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const resolved = useMemo(
    () => resolveScheme(preference, systemScheme),
    [preference, systemScheme],
  );

  const colors = resolved === "dark" ? darkSemantic : lightSemantic;

  const value = useMemo(
    () => ({ preference, setPreference, resolved, colors }),
    [preference, setPreference, resolved, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      preference: "system",
      setPreference: () => {},
      resolved: "light",
      colors: { ...lightSemantic },
    };
  }
  return ctx;
}
