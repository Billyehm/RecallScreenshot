import React, { createContext, type PropsWithChildren, useContext, useMemo, useState } from "react";

import { createStyles } from "./styles";
import { darkColors, lightColors, type AppColors, type ThemeMode } from "./colors";

type ThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
  mode: ThemeMode;
  styles: ReturnType<typeof createStyles>;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const colors = mode === "dark" ? darkColors : lightColors;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const value = useMemo(
    () => ({
      colors,
      isDark: mode === "dark",
      mode,
      styles,
      toggleTheme: () => setMode((current) => (current === "dark" ? "light" : "dark"))
    }),
    [colors, mode, styles]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return theme;
}
