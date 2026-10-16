import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

/** Colour tokens, modelled on shadcn/ui (zinc). */
export interface ChartTokens {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  positive: string;
  negative: string;
}

export interface ResolvedChartTheme extends ChartTokens {
  dark: boolean;
  /** Series colours, used in order: chart-1, chart-2, … */
  palette: string[];
  /** Corner radius for cards and bars. */
  radius: number;
  fontFamily?: string;
}

export type PaletteName =
  | "default"
  | "blue"
  | "green"
  | "violet"
  | "rose"
  | "orange"
  | "vivid";

export const palettes: Record<PaletteName, { light: string[]; dark: string[] }> = {
  default: {
    light: ["#E76E50", "#2A9D90", "#274754", "#E8C468", "#F4A462"],
    dark: ["#2662D9", "#2EB88A", "#E88C30", "#AF57DB", "#E23670"],
  },
  blue: {
    light: ["#2563EB", "#60A5FA", "#1E40AF", "#93C5FD", "#3B82F6"],
    dark: ["#3B82F6", "#93C5FD", "#2563EB", "#BFDBFE", "#60A5FA"],
  },
  green: {
    light: ["#16A34A", "#4ADE80", "#166534", "#86EFAC", "#22C55E"],
    dark: ["#22C55E", "#86EFAC", "#16A34A", "#BBF7D0", "#4ADE80"],
  },
  violet: {
    light: ["#7C3AED", "#A78BFA", "#5B21B6", "#C4B5FD", "#8B5CF6"],
    dark: ["#8B5CF6", "#C4B5FD", "#7C3AED", "#DDD6FE", "#A78BFA"],
  },
  rose: {
    light: ["#E11D48", "#FB7185", "#9F1239", "#FDA4AF", "#F43F5E"],
    dark: ["#F43F5E", "#FDA4AF", "#E11D48", "#FECDD3", "#FB7185"],
  },
  orange: {
    light: ["#EA580C", "#FB923C", "#9A3412", "#FDBA74", "#F97316"],
    dark: ["#F97316", "#FDBA74", "#EA580C", "#FED7AA", "#FB923C"],
  },
  vivid: {
    light: ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"],
    dark: ["#60A5FA", "#A78BFA", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#F472B6"],
  },
};

const lightTokens: ChartTokens = {
  background: "#FFFFFF",
  foreground: "#09090B",
  card: "#FFFFFF",
  muted: "#F4F4F5",
  mutedForeground: "#71717A",
  border: "#E4E4E7",
  popover: "#FFFFFF",
  popoverForeground: "#09090B",
  primary: "#18181B",
  primaryForeground: "#FAFAFA",
  positive: "#16A34A",
  negative: "#DC2626",
};

const darkTokens: ChartTokens = {
  background: "#09090B",
  foreground: "#FAFAFA",
  card: "#111113",
  muted: "#27272A",
  mutedForeground: "#A1A1AA",
  border: "#27272A",
  popover: "#18181B",
  popoverForeground: "#FAFAFA",
  primary: "#FAFAFA",
  primaryForeground: "#18181B",
  positive: "#22C55E",
  negative: "#F87171",
};

export interface ChartThemeOptions {
  palette?: PaletteName | string[];
  dark?: boolean;
  radius?: number;
  tokens?: Partial<ChartTokens>;
  fontFamily?: string;
}

export function resolveChartTheme({
  palette = "default",
  dark = false,
  radius = 12,
  tokens,
  fontFamily,
}: ChartThemeOptions = {}): ResolvedChartTheme {
  const colors = Array.isArray(palette)
    ? palette
    : (palettes[palette] ?? palettes.default)[dark ? "dark" : "light"];
  return {
    ...(dark ? darkTokens : lightTokens),
    ...tokens,
    dark,
    palette: colors.length ? colors : palettes.default.light,
    radius,
    fontFamily,
  };
}

const ChartThemeContext = createContext<ResolvedChartTheme | null>(null);

export interface ChartProviderProps extends Omit<ChartThemeOptions, "dark"> {
  /** "system" follows the phone's light/dark setting. */
  mode?: "light" | "dark" | "system";
  children: React.ReactNode;
}

/** Wrap your app (or one screen) to theme every chart at once. */
export function ChartProvider({
  mode = "system",
  palette,
  radius,
  tokens,
  fontFamily,
  children,
}: ChartProviderProps) {
  const scheme = useColorScheme();
  const dark = mode === "system" ? scheme === "dark" : mode === "dark";
  const paletteKey = Array.isArray(palette) ? palette.join(",") : palette;
  const tokensKey = tokens ? JSON.stringify(tokens) : "";
  const value = useMemo(
    () => resolveChartTheme({ palette, dark, radius, tokens, fontFamily }),
    [paletteKey, dark, radius, tokensKey, fontFamily]
  );
  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
}

/** Current chart theme. Without a ChartProvider it follows the system colour scheme. */
export function useChartTheme(): ResolvedChartTheme {
  const context = useContext(ChartThemeContext);
  const scheme = useColorScheme();
  return useMemo(
    () => context ?? resolveChartTheme({ dark: scheme === "dark" }),
    [context, scheme]
  );
}

export const seriesColor = (theme: ResolvedChartTheme, index: number) =>
  theme.palette[index % theme.palette.length];
