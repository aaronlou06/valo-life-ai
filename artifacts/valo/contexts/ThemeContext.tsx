import React, { createContext, useContext, useEffect, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";

const STORAGE_KEY = "@valo/theme";

interface ThemeContextType {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: "light",
  setColorScheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setScheme] = useState<ColorScheme>(
    Appearance.getColorScheme() === "dark" ? "dark" : "light"
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark") {
          setScheme(stored);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function setColorScheme(scheme: ColorScheme) {
    setScheme(scheme);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, scheme);
    } catch {}
  }

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colorScheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
