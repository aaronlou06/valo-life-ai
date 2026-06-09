import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Returns the design tokens for the current color scheme.
 *
 * Reads from ThemeContext so the user's explicit light/dark preference
 * (persisted to AsyncStorage) takes precedence over the system setting.
 * Falls back to the system preference when no stored value exists.
 */
export function useColors() {
  const { colorScheme } = useTheme();
  const palette =
    colorScheme === "dark" && "dark" in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
