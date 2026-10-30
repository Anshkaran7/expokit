import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  useColorScheme,
  useWindowDimensions,
  type GestureResponderHandlers,
  type PanResponderCallbacks,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

/**
 * ExpoKit design tokens. Every component reads them through useKit(), so one
 * <KitProvider> (optional) re-skins the whole kit: light / dark, accent colour, radius.
 * Without a provider, components follow the system colour scheme.
 */

/**
 * Bumped whenever components start using a new kit API (2: radius.scale / radius.capsule,
 * 3: useLayout / shadow, 4: labels, 5: visible labels such as Cancel / Done / Today, AM / PM, usePanResponder / useLatest). The CLI won't keep an edited kit.tsx older than the component being added needs.
 */
export const KIT_VERSION = 5;

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
  font: { family?: string | undefined; mono: string };
  text: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl', TextStyle>;
  /** Text the kit shows or speaks on its own (buttons, placeholders, screen-reader names). Translate with <KitProvider labels={...}>. */
  labels: Labels;
}

/**
 * Every string the kit shows or speaks on its own: button text and placeholders (Cancel, Done, Today,
 * Search…) and what screen readers say (close buttons, grabbers, hints). A prop on a component, like
 * `cancelLabel` or `placeholder`, still wins over these.
 * Pass a partial map to <KitProvider labels={...}>; keys you leave out stay English.
 * Functions get the dynamic part, so word order can change per language.
 */
export interface Labels {
  close: string;
  dismiss: string;
  closeSheet: string;
  sheetGrabber: string;
  sheetResizeHint: string;
  sheetResizeOrCloseHint: string;
  navigationDrawer: string;
  closeDrawer: string;
  closeMenu: string;
  switchAccount: string;
  openActions: string;
  closeActions: string;
  action: string;
  loading: string;
  clearSearch: string;
  cancelSearch: string;
  clearField: (field: string) => string;
  back: string;
  previous: string;
  next: string;
  goToToday: string;
  goToSlide: (n: number) => string;
  showAllCards: string;
  expandNotification: string;
  collapseNotification: string;
  moreCount: (n: number) => string;
  peopleCount: (n: number) => string;
  namesAndMore: (names: string, n: number) => string;
  newCount: (badge: string) => string;
  remove: (item: string) => string;
  selectedCount: (n: number) => string;
  noneSelected: string;
  notSet: string;
  date: string;
  time: string;
  hour: string;
  minute: string;
  hours: (n: string) => string;
  minutes: (n: number) => string;
  booked: string;
  unavailable: string;
  timeDialHint: string;
  flipCalendarHint: string;
  increase: string;
  decrease: string;
  increaseItem: (item: string) => string;
  decreaseItem: (item: string) => string;
  range: string;
  rangeMinimum: (name: string) => string;
  rangeMaximum: (name: string) => string;
  ratingStars: string;
  ratingHearts: string;
  showPassword: string;
  hidePassword: string;
  passwordStrength: (level: string) => string;
  ruleMet: (rule: string) => string;
  ruleUnmet: (rule: string) => string;
  stepOf: (step: number, total: number, label: string) => string;
  allStepsComplete: string;
  stepCurrent: string;
  stepCompleted: string;
  stepNeedsAttention: string;
  stepNotStarted: string;
  goBackToStep: string;
  activateCodeField: string;
  qrCodeFor: (value: string) => string;
  undoStroke: string;
  signaturePad: string;
  signaturePadSigned: string;
  flipToBack: string;
  flipToFront: string;
  revealHint: string;
  confirmHint: string;
  prizeWheel: string;
  spinHint: string;
  prizes: (n: number, list: string) => string;
  orbReveal: string;
  orbBack: string;
  // Visible text
  cancel: string;
  done: string;
  doneCount: (n: number) => string;
  doneDays: (n: number) => string;
  clear: string;
  continue: string;
  delete: string;
  failed: string;
  search: string;
  noResults: string;
  noOptions: string;
  nothingMatches: (query: string) => string;
  selectPlaceholder: string;
  selectDate: string;
  selectDates: string;
  pickStartDate: string;
  pickEndDate: string;
  selectTime: string;
  setTime: (time: string) => string;
  /** Clock periods, shown on 12-hour pickers and times. */
  am: string;
  pm: string;
  /** Read for the AM / PM column. */
  amPm: string;
  morning: string;
  afternoon: string;
  evening: string;
  slotsOpen: (n: number) => string;
  full: string;
  today: string;
  tomorrow: string;
  nextMonday: string;
  inAWeek: string;
  inAMonth: string;
  next7Days: string;
  nextWeekend: string;
  thisMonth: string;
  last7Days: string;
  last30Days: string;
  chooseOneOrMore: string;
  /** After a rolling count, as in "2 selected". */
  selectedSuffix: string;
  chooseMonth: string;
  chooseYear: string;
  backToDays: string;
  dayAndWeek: (day: number, week: number) => string;
  daysLeft: (n: number) => string;
  /** Too short, Weak, Okay, Strong, Very strong. */
  passwordLevels: [string, string, string, string, string];
  passwordsMatch: string;
  passwordsDontMatch: string;
  showQrCode: string;
  copy: string;
  copied: string;
  slideToConfirm: string;
  confirmed: string;
  like: string;
  nope: string;
  swipeRight: string;
  swipeLeft: string;
}

export const defaultLabels: Labels = {
  close: 'Close',
  dismiss: 'Dismiss',
  closeSheet: 'Close sheet',
  sheetGrabber: 'Sheet grabber',
  sheetResizeHint: 'Swipe up or down to resize',
  sheetResizeOrCloseHint: 'Swipe up or down to resize or close',
  navigationDrawer: 'Navigation drawer',
  closeDrawer: 'Close drawer',
  closeMenu: 'Close menu',
  switchAccount: 'Switch account',
  openActions: 'Open actions',
  closeActions: 'Close actions',
  action: 'Action',
  loading: 'Loading',
  clearSearch: 'Clear search',
  cancelSearch: 'Cancel search',
  clearField: (field) => `Clear ${field}`,
  back: 'Back',
  previous: 'Previous',
  next: 'Next',
  goToToday: 'Go to today',
  goToSlide: (n) => `Go to slide ${n}`,
  showAllCards: 'Shows all cards',
  expandNotification: 'Expands the notification',
  collapseNotification: 'Collapses the notification',
  moreCount: (n) => `${n} more`,
  peopleCount: (n) => `${n} people`,
  namesAndMore: (names, n) => `${names} and ${n} more`,
  newCount: (badge) => `${badge} new`,
  remove: (item) => `Remove ${item}`,
  selectedCount: (n) => `${n} selected`,
  noneSelected: 'None selected',
  notSet: 'Not set',
  date: 'Date',
  time: 'Time',
  hour: 'Hour',
  minute: 'Minute',
  hours: (n) => `${n} hours`,
  minutes: (n) => `${n} minutes`,
  booked: 'booked',
  unavailable: 'unavailable',
  timeDialHint: 'Drag around the dial, or swipe up or down to adjust.',
  flipCalendarHint: 'Swipe up to turn to the next day, down for the previous one.',
  increase: 'Increase',
  decrease: 'Decrease',
  increaseItem: (item) => `Increase ${item}`,
  decreaseItem: (item) => `Decrease ${item}`,
  range: 'Range',
  rangeMinimum: (name) => `${name} minimum`,
  rangeMaximum: (name) => `${name} maximum`,
  ratingStars: 'Rating, stars',
  ratingHearts: 'Rating, hearts',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  passwordStrength: (level) => `Password strength: ${level}`,
  ruleMet: (rule) => `${rule}: done`,
  ruleUnmet: (rule) => `${rule}: not yet`,
  stepOf: (step, total, label) => `Step ${step} of ${total}, ${label}`,
  allStepsComplete: 'All steps complete',
  stepCurrent: 'current',
  stepCompleted: 'completed',
  stepNeedsAttention: 'needs attention',
  stepNotStarted: 'not started',
  goBackToStep: 'Goes back to this step',
  activateCodeField: 'Activates the code field',
  qrCodeFor: (value) => `QR code for ${value}`,
  undoStroke: 'Undo last stroke',
  signaturePad: 'Signature pad, draw your signature',
  signaturePadSigned: 'Signature pad, signed',
  flipToBack: 'Tap to flip to the back.',
  flipToFront: 'Showing the back. Tap to flip to the front.',
  revealHint: 'Double-tap to reveal',
  confirmHint: 'Double tap to confirm',
  prizeWheel: 'Prize wheel',
  spinHint: 'Spins the wheel for a prize',
  prizes: (n, list) => `${n} prizes: ${list}`,
  orbReveal: 'Reveal',
  orbBack: 'Glass orb, drag down to go back',
  cancel: 'Cancel',
  done: 'Done',
  doneCount: (n) => `Done · ${n}`,
  doneDays: (n) => `Done · ${n} days`,
  clear: 'Clear',
  continue: 'Continue',
  delete: 'Delete',
  failed: 'Failed',
  search: 'Search',
  noResults: 'No results',
  noOptions: 'No options',
  nothingMatches: (query) => `Nothing matches “${query}”.`,
  selectPlaceholder: 'Select…',
  selectDate: 'Select a date',
  selectDates: 'Select dates',
  pickStartDate: 'Pick a start date',
  pickEndDate: 'pick an end date',
  selectTime: 'Select a time',
  setTime: (time) => `Set ${time}`,
  am: 'AM',
  pm: 'PM',
  amPm: 'AM or PM',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  slotsOpen: (n) => `${n} open`,
  full: 'Full',
  today: 'Today',
  tomorrow: 'Tomorrow',
  nextMonday: 'Next Monday',
  inAWeek: 'In a week',
  inAMonth: 'In a month',
  next7Days: 'Next 7 days',
  nextWeekend: 'Next weekend',
  thisMonth: 'This month',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  chooseOneOrMore: 'Choose one or more',
  selectedSuffix: 'selected',
  chooseMonth: 'choose month',
  chooseYear: 'choose year',
  backToDays: 'back to days',
  dayAndWeek: (day, week) => `Day ${day} · Week ${week}`,
  daysLeft: (n) => `${n} left`,
  passwordLevels: ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'],
  passwordsMatch: 'Passwords match',
  passwordsDontMatch: "Passwords don't match",
  showQrCode: 'Show QR Code',
  copy: 'Copy',
  copied: 'Copied',
  slideToConfirm: 'Slide to confirm',
  confirmed: 'Confirmed',
  like: 'LIKE',
  nope: 'NOPE',
  swipeRight: 'Right',
  swipeLeft: 'Left',
};

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
    labels: overrides?.labels ? { ...defaultLabels, ...overrides.labels } : defaultLabels,
  };
}

export interface ThemeOverrides {
  /** Brand colour used for focus rings, selected states and accent buttons. */
  accent?: string | undefined;

  /** Base corner radius in points (default 12). */
  radius?: number | undefined;

  fontFamily?: string | undefined;

  /** Override any token per scheme. */
  colors?: Partial<Record<ColorScheme, Partial<Colors>>> | undefined;

  /** Screen-reader strings in your language, e.g. { close: "बंद करें" }. Keys you leave out stay English. */
  labels?: Partial<Labels> | undefined;
}

const KitContext = createContext<{ scheme?: ColorScheme | undefined; overrides?: ThemeOverrides | undefined } | null>(null);

export function KitProvider({
  scheme,
  children,
  ...overrides
}: ThemeOverrides & { scheme?: ColorScheme | 'system'; children: React.ReactNode }) {
  const value = useMemo(
    () => ({ scheme: scheme === 'system' ? undefined : scheme, overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, overrides.accent, overrides.radius, overrides.fontFamily, overrides.colors, overrides.labels]
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

/**
 * A ref that always holds the latest `value`, for gesture and timer callbacks that must not go stale.
 * Read `.current` only inside callbacks and effects, never while rendering.
 */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

const panKeys = [
  'onStartShouldSetPanResponder',
  'onStartShouldSetPanResponderCapture',
  'onMoveShouldSetPanResponder',
  'onMoveShouldSetPanResponderCapture',
  'onPanResponderGrant',
  'onPanResponderStart',
  'onPanResponderMove',
  'onPanResponderEnd',
  'onPanResponderRelease',
  'onPanResponderReject',
  'onPanResponderTerminate',
] as const;

/**
 * PanResponder handlers that always call the latest `config`, created once. Write the callbacks inline:
 * they may read refs and props freely, and nothing is recreated between renders, so a drag in progress
 * is never cut off. Spread the result: `<View {...pan} />`.
 */
export function usePanResponder(config: PanResponderCallbacks): GestureResponderHandlers {
  const latest = useLatest(config);
  const [handlers] = useState(() => {
    const forward: Record<string, (...args: never[]) => unknown> = {};
    for (const key of panKeys) {
      forward[key] = (...args) => (latest.current[key] as ((...a: never[]) => unknown) | undefined)?.(...args);
    }
    // React Native's defaults when these are left out are `true`, so keep them when the config has none.
    forward.onPanResponderTerminationRequest = (...args) =>
      (latest.current.onPanResponderTerminationRequest as ((...a: never[]) => boolean) | undefined)?.(...args) ?? true;
    forward.onShouldBlockNativeResponder = (...args) =>
      (latest.current.onShouldBlockNativeResponder as ((...a: never[]) => boolean) | undefined)?.(...args) ?? true;
    return PanResponder.create(forward as PanResponderCallbacks).panHandlers;
  });
  return handlers;
}
