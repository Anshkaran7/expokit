import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native';

/**
 * ExpoKit design tokens. Every component reads them through useKit(), so one
 * <KitProvider> (optional) re-skins the whole kit: light / dark, accent colour, radius.
 * Without a provider, components follow the system colour scheme.
 */

/**
 * Bumped whenever components start using a new kit API (2: radius.scale / radius.capsule,
 * 3: useLayout / shadow). The CLI won't keep an edited kit.tsx older than the component being added needs.
 */
export const KIT_VERSION = 3;

export type ColorScheme = 'light' | 'dark';

export interface Colors {
  background: string;
  foreground: string;
  /** Cards, sheets, inputs. */
  card: string;
  cardForeground: string;
  /** Raised surfaces: popovers, toasts. */
  popover: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  success: string;
  warning: string;
  danger: string;
  dangerForeground: string;
  ring: string;
  overlay: string;
}

export interface Theme {
  dark: boolean;
  colors: Colors;
  /** Corner radius scale. `radius.full` makes pills. */
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
    /** A corner designed at the default radius (12), scaled to the current one: `radius.scale(16)` is 16 at 12, 0 at 0. */
    scale: (n: number) => number;
    /** Corner for a bar or chip of height `h`: a pill at radius ≥ 12, softer below, square at 0. */
    capsule: (h: number) => number;
  };
  /** 4pt spacing scale: space(4) === 16. */
  space: (n: number) => number;
  /** The same soft shadow on iOS, Android and web: `style={[styles.card, shadow('md')]}`. */
  shadow: (level: ShadowLevel, color?: string) => ViewStyle;
  font: { family?: string; mono: string };
  text: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', TextStyle>;
}

const light: Colors = {
  background: '#ffffff',
  foreground: '#09090b',
  card: '#ffffff',
  cardForeground: '#09090b',
  popover: '#ffffff',
  muted: '#f4f4f5',
  mutedForeground: '#71717a',
  border: '#e4e4e7',
  input: '#d4d4d8',
  primary: '#18181b',
  primaryForeground: '#fafafa',
  secondary: '#f4f4f5',
  secondaryForeground: '#18181b',
  accent: '#18181b',
  accentForeground: '#ffffff',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#e5484d',
  dangerForeground: '#ffffff',
  ring: '#18181b',
  overlay: 'rgba(0,0,0,0.4)',
};

const dark: Colors = {
  background: '#09090b',
  foreground: '#fafafa',
  card: '#111113',
  cardForeground: '#fafafa',
  popover: '#18181b',
  muted: '#1c1c20',
  mutedForeground: '#a1a1aa',
  border: '#27272a',
  input: '#34343a',
  primary: '#fafafa',
  primaryForeground: '#18181b',
  secondary: '#1f1f23',
  secondaryForeground: '#fafafa',
  accent: '#fafafa',
  accentForeground: '#09090b',
  success: '#3dd68c',
  warning: '#ffb224',
  danger: '#ff6369',
  dangerForeground: '#ffffff',
  ring: '#d4d4d8',
  overlay: 'rgba(0,0,0,0.6)',
};

export const palettes = { light, dark };

function build(scheme: ColorScheme, overrides?: ThemeOverrides): Theme {
  const base = scheme === 'dark' ? dark : light;
  const accent = overrides?.accent;
  const colors: Colors = {
    ...base,
    ...(accent ? { accent, ring: accent, accentForeground: readableOn(accent) } : null),
    ...overrides?.colors?.[scheme],
  };
  const r = overrides?.radius ?? 12;
  return {
    dark: scheme === 'dark',
    colors,
    radius: {
      sm: Math.round(r * 0.5),
      md: r,
      lg: Math.round(r * 1.35),
      xl: Math.round(r * 1.8),
      full: 999,
      scale: (n) => Math.round((n * r) / 12),
      capsule: (h) => Math.round((h / 2) * Math.min(1, r / 12)),
    },
    space: (n) => n * 4,
    shadow: (level, color) => shadowFor(level, scheme === 'dark', color),
    font: {
      family: overrides?.fontFamily,
      mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' })!,
    },
    text: {
      xs: { fontSize: 12, lineHeight: 16 },
      sm: { fontSize: 14, lineHeight: 20 },
      md: { fontSize: 16, lineHeight: 22 },
      lg: { fontSize: 18, lineHeight: 24, fontWeight: '400' },
      xl: { fontSize: 22, lineHeight: 28, fontWeight: '400', letterSpacing: -0.3 },
      xxl: { fontSize: 30, lineHeight: 36, fontWeight: '400', letterSpacing: -0.8 },
    },
  };
}

export interface ThemeOverrides {
  /** Brand colour used for focus rings, selected states and accent buttons. */
  accent?: string;
  /** Base corner radius in points (default 12). */
  radius?: number;
  fontFamily?: string;
  /** Override any token per scheme. */
  colors?: Partial<Record<ColorScheme, Partial<Colors>>>;
}

const KitContext = createContext<{ scheme?: ColorScheme; overrides?: ThemeOverrides } | null>(null);

export function KitProvider({
  scheme,
  children,
  ...overrides
}: ThemeOverrides & { scheme?: ColorScheme | 'system'; children: React.ReactNode }) {
  const value = useMemo(
    () => ({ scheme: scheme === 'system' ? undefined : scheme, overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, overrides.accent, overrides.radius, overrides.fontFamily, overrides.colors]
  );
  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}

export function useKit(): Theme {
  const ctx = useContext(KitContext);
  const system = useColorScheme();
  const scheme: ColorScheme = ctx?.scheme ?? (system === 'dark' ? 'dark' : 'light');
  return useMemo(() => build(scheme, ctx?.overrides), [scheme, ctx?.overrides]);
}

export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg' | 'xl';

const SHADOWS: Record<Exclude<ShadowLevel, 'none'>, [y: number, blur: number, opacity: number]> = {
  sm: [1, 3, 0.08],
  md: [4, 14, 0.1],
  lg: [10, 30, 0.14],
  xl: [18, 48, 0.2],
};

/**
 * A shadow as `boxShadow`, which React Native (0.76+) draws identically on iOS, Android and web —
 * unlike `elevation`, whose Android shadow looks nothing like the iOS one. Darker in dark mode so
 * it still reads on near-black. `color` is a #rrggbb tint (default black).
 */
export function shadowFor(level: ShadowLevel, dark: boolean, color = '#000000'): ViewStyle {
  if (level === 'none') return {};
  const [y, blur, opacity] = SHADOWS[level];
  const a = Math.min(0.6, dark ? opacity * 2.8 : opacity);
  const full = color.length === 4 ? '#' + [...color.slice(1)].map((c) => c + c).join('') : color;
  const n = parseInt(full.slice(1, 7), 16);
  const [r, g, b] = Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return { boxShadow: `0px ${y}px ${blur}px rgba(${r},${g},${b},${+a.toFixed(3)})` };
}

/**
 * Screen size classes, shared by every component so phones, foldables and tablets all get the
 * right layout without any work from you. `compact` — phones (any orientation); `medium` — open
 * foldables (Galaxy Z Fold, Pixel Fold), Surface Duo and small tablets; `expanded` — iPad and
 * larger. Decided by the screen's short side, so a phone on its side stays a phone.
 */
export type SizeClass = 'compact' | 'medium' | 'expanded';

export const breakpoints = { medium: 600, expanded: 840 };

/** Widest a sheet / picker / popover card and a screen's content column get on big screens. */
export const layoutLimits = { sheet: 560, content: 720, gutter: 24 };

export function sizeClassOf(shortSide: number): SizeClass {
  if (!(shortSide >= breakpoints.medium)) return 'compact';
  return shortSide >= breakpoints.expanded ? 'expanded' : 'medium';
}

export interface Layout {
  width: number;
  height: number;
  size: SizeClass;
  /** Foldable, tablet or desktop — anything bigger than a phone. */
  wide: boolean;
  landscape: boolean;
  fontScale: number;
  /** Width for a bottom sheet, picker or action sheet: the full screen on a portrait phone, a centred card on anything wider. */
  sheetWidth: number;
  /** Width for a screen's main column (forms, feeds, blocks): full on phones, a readable centred column on tablets. */
  contentWidth: number;
  /** Grid columns that fit the current width: 1 phone, 2 foldable / landscape phone, 3 tablet. */
  columns: number;
  /** A value per size class; a missing one falls back to the next smaller: `pick({ compact: 16, expanded: 24 })`. */
  pick: <T>(values: { compact: T; medium?: T; expanded?: T }) => T;
}

const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** The layout for a window of `width` × `height` points (the pure part of useLayout). */
export function layoutFor(rawWidth: number, rawHeight: number, fontScale = 1): Layout {
  const width = finite(rawWidth);
  const height = finite(rawHeight);
  const size = sizeClassOf(Math.min(width, height || width));
  const roomy = width >= breakpoints.medium;
  const { sheet, content, gutter } = layoutLimits;
  return {
    width,
    height,
    size,
    wide: size !== 'compact',
    landscape: width > height,
    fontScale,
    sheetWidth: roomy ? Math.min(sheet, width - gutter * 2) : width,
    contentWidth: roomy ? Math.min(content, width - gutter * 2) : width,
    columns: width >= breakpoints.expanded + 160 ? 3 : roomy ? 2 : 1,
    pick: (values) =>
      (size === 'expanded' ? values.expanded ?? values.medium : size === 'medium' ? values.medium : undefined) ??
      values.compact,
  };
}

/**
 * The current screen's layout; re-renders on rotation, split view, Stage Manager and fold / unfold.
 * Components use it so they look right on every device; use it in your own screens the same way:
 * `const { contentWidth } = useLayout()` → `<View style={{ width: '100%', maxWidth: contentWidth, alignSelf: 'center' }}>`.
 */
export function useLayout(): Layout {
  const { width, height, fontScale } = useWindowDimensions();
  return useMemo(() => layoutFor(width, height, fontScale), [width, height, fontScale]);
}

/**
 * Shared motion presets so the whole kit moves the same way. Every spring is critically damped
 * (damping ≥ 2·√(stiffness·mass)): it settles smoothly with no overshoot or wobble.
 */
export const motion = {
  /** Toggles, selection indicators. */
  snappy: { damping: 30, stiffness: 260, mass: 0.8 },
  /** Press feedback, pops. (Kept under its old name; it no longer bounces.) */
  bouncy: { damping: 26, stiffness: 220, mass: 0.7 },
  /** Sheets, layout changes. */
  gentle: { damping: 27, stiffness: 160, mass: 1 },
  fast: 160,
  normal: 240,
};

/** Adds alpha to a #rrggbb colour: alpha('#6366f1', 0.2). */
export function alpha(hex: string, a: number) {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex;
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  return full + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(full.slice(1, 7), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#09090b' : '#ffffff';
}

/**
 * True for children that must be wrapped in <Text>: strings, numbers and arrays of them —
 * `{count} new` is the array [3, ' new'], and raw text outside <Text> crashes on native.
 */
export function isTextNode(node: React.ReactNode): node is string | number | (string | number)[] {
  if (typeof node === 'string' || typeof node === 'number') return true;
  return Array.isArray(node) && node.length > 0 && node.every((n) => typeof n === 'string' || typeof n === 'number');
}
