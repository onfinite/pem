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
  /** Welcome / marketing subtle surface */
  surfacePage: string;
  cardBackground: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  borderMuted: string;
  pemAmber: string;
  onPrimary: string;
  error: string;
  /** Placeholder / tertiary UI */
  placeholder: string;
  /** Neutral inputs / secondary buttons (light: white, dark: elevated surface) */
  secondarySurface: string;
  /** Subtle brand-tinted control surface (e.g. mic beside composer) */
  brandMutedSurface: string;
};

const lightSemantic: ThemeSemantic = {
  pageBackground: "#faf8f4",
  surfacePage: "#f7f5f1",
  /** Warm off-white — distinct from page + glass chrome (not pure white). */
  cardBackground: "#f4f1eb",
  textPrimary: "#1c1a16",
  textSecondary: "#6b6560",
  border: "#d8d0c4",
  borderMuted: "#e8e2d8",
  pemAmber: "#e8763a",
  onPrimary: "#ffffff",
  error: "#ff453a",
  placeholder: "#b8b0a4",
  /** Inputs / secondary controls — slightly lifted vs cards when needed. */
  secondarySurface: "#ffffff",
  brandMutedSurface: "#fdf2ea",
};

const darkSemantic: ThemeSemantic = {
  pageBackground: "#181614",
  surfacePage: "#1c1a18",
  cardBackground: "#242220",
  textPrimary: "#f4f1eb",
  textSecondary: "#a39e97",
  border: "#3d3834",
  borderMuted: "#2e2a26",
  pemAmber: "#e8763a",
  onPrimary: "#ffffff",
  error: "#ff6b6b",
  placeholder: "#7a746c",
  secondarySurface: "#2a2622",
  brandMutedSurface: "#332a22",
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
      colors: lightSemantic,
    };
  }
  return ctx;
}
