export const darkColors = {
  background: "#070b14",
  surface: "#101827",
  surfaceHigh: "#172338",
  surfaceHighest: "#21314b",
  primary: "#b9a1ff",
  primaryContainer: "#8b6cf6",
  secondary: "#5ee7f5",
  tertiary: "#ff8fbd",
  text: "#f7f9ff",
  muted: "#b8c6dd",
  outline: "rgba(191,211,245,0.24)",
  onPrimary: "#100b25",
  onSecondary: "#041c24",
  placeholder: "rgba(184,198,221,0.78)",
  surfaceGlass: "rgba(16,24,39,0.97)",
  surfaceGlassHigh: "rgba(23,35,56,0.96)",
  surfaceGlassHighest: "rgba(33,49,75,0.96)",
  primarySoft: "rgba(185,161,255,0.16)",
  primaryOutline: "rgba(185,161,255,0.48)",
  secondarySoft: "rgba(94,231,245,0.14)",
  secondaryOutline: "rgba(94,231,245,0.48)",
  pressedOverlay: "rgba(255,255,255,0.08)"
} as const;

export const lightColors = {
  background: "#f3f7ff",
  surface: "#ffffff",
  surfaceHigh: "#e5edff",
  surfaceHighest: "#d5e1fb",
  primary: "#5535b5",
  primaryContainer: "#6544c4",
  secondary: "#006f82",
  tertiary: "#a33d70",
  text: "#0b1220",
  muted: "#34445f",
  outline: "rgba(11,18,32,0.2)",
  onPrimary: "#ffffff",
  onSecondary: "#ffffff",
  placeholder: "rgba(52,68,95,0.78)",
  surfaceGlass: "rgba(255,255,255,0.98)",
  surfaceGlassHigh: "rgba(245,248,255,0.98)",
  surfaceGlassHighest: "rgba(229,238,255,0.98)",
  primarySoft: "rgba(85,53,181,0.13)",
  primaryOutline: "rgba(85,53,181,0.38)",
  secondarySoft: "rgba(0,111,130,0.12)",
  secondaryOutline: "rgba(0,111,130,0.36)",
  pressedOverlay: "rgba(16,24,43,0.06)"
} as const;

export type AppColors = Record<keyof typeof darkColors, string>;
export type ThemeMode = "dark" | "light";

export const colors = darkColors;
