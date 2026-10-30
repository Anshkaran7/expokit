import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { FlipCard, useFlipProgress } from '@/components/ui/flip-card';
import { TiltCard } from '@/components/ui/tilt-card';
import { alpha, motion, readableOn, useKit } from '@/lib/kit';
import {
  BarcodeLike,
  TicketShape,
  TicketStamp,
  ticketSafeRects,
  type TicketCorners,
  type TicketEdge,
  type TicketGeometry,
  type TicketPattern,
  type TicketRect,
  type TicketSide,
} from '@/lib/ticket-shape';

export type CouponStatus = 'available' | 'applied' | 'used' | 'expired' | 'locked';
/** Outline: `ticket` notches, `stamp` perforations, `receipt` torn zigzag ends, `scallop` bumps, `cutout` dashed "cut here". */
export type CouponVariant = 'ticket' | 'stamp' | 'receipt' | 'scallop' | 'cutout';
export type CouponThemeName = 'sunset' | 'candy' | 'ocean' | 'lime' | 'gold' | 'fire' | 'neon' | 'ink' | 'paper' | 'holo';
export type CouponSize = 'sm' | 'md' | 'lg';

export interface CouponTheme {
  /** Value panel paint: a colour, or 2+ colours for a gradient. */
  fill: string | readonly string[];
  /** Text on the value panel. */
  ink: string;
  /** Buttons, the code chip and the applied ring (default: the fill's last colour). */
  accent?: string | undefined;
  /** Details panel paint (default: the app's card colour). */
  body?: string | readonly string[] | undefined;
  /** Text on the details panel (default: the app's foreground). */
  bodyInk?: string | undefined;
  /** Texture on the value panel. */
  pattern?: TicketPattern | undefined;
}

export const couponThemes: Record<CouponThemeName, CouponTheme> = {
  sunset: { fill: ['#ffb000', '#ff6a3d', '#ff2e7e'], ink: '#ffffff', accent: '#ff3d6e', pattern: 'sunburst' },
  candy: { fill: ['#ff6ad5', '#c86bff', '#7b5cff'], ink: '#ffffff', accent: '#a64dff', pattern: 'confetti' },
  ocean: { fill: ['#2af5ff', '#1f8bff', '#3d47ff'], ink: '#ffffff', accent: '#1f6fff', pattern: 'waves' },
  lime: { fill: ['#e6ff4d', '#7cf05a', '#1fc46b'], ink: '#062b16', accent: '#15a057', pattern: 'dots' },
  gold: { fill: ['#fff1b8', '#ffc94a', '#e09a12'], ink: '#3d2500', accent: '#c47f00', pattern: 'stripes' },
  fire: { fill: ['#ffa53d', '#ff3d3d', '#c4002f'], ink: '#ffffff', accent: '#e8243a', pattern: 'sunburst' },
  neon: { fill: ['#120b2e', '#2b1660', '#3a0d58'], ink: '#3dff9a', accent: '#18c96f', pattern: 'grid' },
  ink: { fill: ['#262626', '#050505'], ink: '#ffe14d', accent: '#ffd000', pattern: 'stripes' },
  paper: { fill: '#ffe6bd', ink: '#b3361b', accent: '#c2410c', body: '#fffaf0', bodyInk: '#3b1d10', pattern: 'dots' },
  holo: { fill: ['#ffd1f5', '#d6cfff', '#c4f3ff', '#d4ffe4', '#fff3c2'], ink: '#2b2350', accent: '#6b4dff' },
};

export interface CouponLabels {
  copy?: string;
  copied?: string;
  apply?: string;
  applied?: string;
  used?: string;
  expired?: string;
  locked?: string;
  /** Before the countdown (default "Ends in"). */
  endsIn?: string;
  /** The link that turns the coupon over (default "T&C"). */
  terms?: string;
  /** Heading on the back (default "Terms & conditions"). */
  termsTitle?: string;
  /** Hint on the back (default "Tap to turn back"). */
  back?: string;
}

export interface CouponProps {
  /** The headline: "50%", "₹200", "FREE", "BOGO". */
  value: string;
  /** Under the value: "OFF", "CASHBACK". */
  unit?: string | undefined;
  /** Above the value: "FLAT", "UP TO". */
  prefix?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  /** Promo code, shown in a dashed chip (tap to copy when `onCopy` is set). */
  code?: string | undefined;
  brand?: string | undefined;
  /** Logo before the brand (e.g. an <Image>). */
  logo?: React.ReactNode | undefined;
  /** Expiry line, e.g. "Valid till 31 Dec". */
  expires?: string | undefined;
  /** Live countdown to this moment; the coupon turns expired when it passes. */
  expiresAt?: Date | number | undefined;
  /** Shown on the back — the "T&C" link turns the coupon over. */
  terms?: string[] | undefined;
  status?: CouponStatus | undefined;
  /** Why it's locked, e.g. "Add ₹120 more to unlock". */
  lockedHint?: string | undefined;
  /** A preset or your own colours (default "sunset"). */
  theme?: CouponThemeName | CouponTheme | undefined;
  /** Override the theme's texture. */
  pattern?: TicketPattern | undefined;
  /** `horizontal` (value panel on the left) or `vertical` (value panel on top). */
  layout?: 'horizontal' | 'vertical' | undefined;
  variant?: CouponVariant | undefined;
  size?: CouponSize | undefined;
  /** A light sweep across the value panel every few seconds. */
  shine?: boolean | undefined;
  /** 3D: tilts toward the finger with a moving reflection. */
  tilt?: boolean | undefined;
  /** With `tilt`: a rainbow foil sheen. */
  holo?: boolean | undefined;
  /** With `tilt`: sway slowly on its own. */
  idle?: boolean | undefined;
  /** Called with the code from the chip — wire it to expo-clipboard. */
  onCopy?: ((code: string) => void) | undefined;
  /** Shows the Apply button. */
  onApply?: (() => void) | undefined;
  /** Tap on the coupon itself (e.g. open details or select it). */
  onPress?: (() => void) | undefined;
  flipped?: boolean | undefined;
  defaultFlipped?: boolean | undefined;
  onFlip?: ((flipped: boolean) => void) | undefined;
  labels?: CouponLabels | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const VARIANTS: Record<CouponVariant, { r: number; notch: number; edge?: TicketEdge; edgeSize: number; ends?: boolean }> = {
  ticket: { r: 16, notch: 10, edgeSize: 0 },
  stamp: { r: 3, notch: 9, edge: 'perforated', edgeSize: 4 },
  receipt: { r: 4, notch: 10, edge: 'zigzag', edgeSize: 6, ends: true },
  scallop: { r: 0, notch: 10, edge: 'scalloped', edgeSize: 5 },
  cutout: { r: 12, notch: 0, edgeSize: 0 },
};

const SIZES = {
  sm: { panel: 92, value: 30, pad: 12, title: 14, desc: 12, chip: 12.5, gap: 6 },
  md: { panel: 110, value: 38, pad: 14, title: 15.5, desc: 12.5, chip: 13.5, gap: 8 },
  lg: { panel: 128, value: 46, pad: 16, title: 17, desc: 13.5, chip: 14.5, gap: 10 },
};

const ICON = {
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  scissors:
    'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z',
};

function Icon({ d, size = 14, color }: { d: string; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} />
    </Svg>
  );
}

/** WCAG contrast between two #rgb / #rrggbb colours (1 … 21); unknown formats count as readable. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
    const n = parseInt(full.slice(1, 7), 16);
    if (!/^#[0-9a-f]{6}/i.test(full) || Number.isNaN(n)) return -1;
    const [red = 0, green = 0, blue = 0] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [x, y] = [lum(a), lum(b)];
  if (x < 0 || y < 0) return 21;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const DAY = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2d 4h" while there's more than a day, then "05:42:10". */
export function formatCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${pad2(h)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/** Milliseconds left until `at` — ticks every second in the last day, every 30s before that. */
function useRemaining(at?: Date | number) {
  const target = at === undefined ? undefined : new Date(at).getTime();
  const [now, setNow] = useState(() => Date.now());
  const left = target === undefined ? undefined : Math.max(0, target - now);
  const live = left !== undefined && left > 0;
  const fast = live && left < DAY;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [target, live, fast]);
  return left;
}

/** The promo code in a dashed chip; a tap copies it and flips the icon to a check for a moment. */
function CodeChip({ code, color, ink, fontSize, onCopy, labels, reduce }: { code: string; color: string; ink: string; fontSize: number; onCopy?: ((code: string) => void) | undefined; labels: Required<CouponLabels>; reduce: boolean }) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [copied, setCopied] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    onCopy?.(code);
    setCopied(true);
    if (!reduce) {
      pop.setValue(0.4);
      Animated.spring(pop, { toValue: 1, ...motion.bouncy, useNativeDriver: true }).start();
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Pressable
      onPress={onCopy ? copy : undefined}
      disabled={!onCopy}
      hitSlop={6}
      accessibilityRole={onCopy ? 'button' : 'text'}
      accessibilityLabel={onCopy ? `${copied ? labels.copied : labels.copy} ${code}` : code}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={({ pressed }) => [styles.chip, { backgroundColor: alpha(color, pressed ? 0.16 : 0.08) }]}
    >
      {box.w ? (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Rect x={0.75} y={0.75} width={box.w - 1.5} height={box.h - 1.5} rx={8} fill="none" stroke={alpha(color, 0.75)} strokeWidth={1.5} strokeDasharray={[5, 4]} />
        </Svg>
      ) : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[{ color: ink, fontSize, fontWeight: '800', letterSpacing: 1, flexShrink: 1, includeFontPadding: false, textAlignVertical: 'center' }, ff]}>
        {code}
      </Text>
      {onCopy ? (
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          {copied ? <Icon d={ICON.check} size={fontSize + 2} color="#16a34a" /> : <Icon d={ICON.copy} size={fontSize + 1} color={color} />}
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** A light band that sweeps across, every few seconds, through the given windows. */
function Shine({ windows, width, height }: { windows: TicketRect[]; width: number; height: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(2400)])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const band = Math.max(36, width * 0.35);
  const tall = height * 2;
  const P = 24;
  return (
    <>
      {windows.map((r, i) => (
        <View key={i} pointerEvents="none" style={[styles.window, { left: r.x, top: r.y, width: r.width, height: r.height }]}>
          <Animated.View
            style={{
              position: 'absolute',
              width: P,
              height: P,
              left: -r.x - P / 2,
              top: -r.y + height / 2 - P / 2,
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-band, width + band] }) },
                { rotate: '20deg' },
                { scaleX: band / P },
                { scaleY: tall / P },
              ],
            }}
          >
            <Svg width={P} height={P}>
              <Defs>
                <LinearGradient id="coupon-shine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.55} />
                  <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width={P} height={P} fill="url(#coupon-shine)" />
            </Svg>
          </Animated.View>
        </View>
      ))}
    </>
  );
}

/**
 * A coupon worth tapping: a vivid value panel (gradient, sunburst, confetti…) joined to a details
 * panel by a perforated tear line with real cut-outs. Copyable code, Apply button, live countdown,
 * applied / used / expired / locked states, a light sweep, and an optional 3D tilt with a holo sheen
 * that flips over to the terms. Flat by default, so long lists stay light.
 */
export function Coupon({
  value,
  unit,
  prefix,
  title,
  description,
  code,
  brand,
  logo,
  expires,
  expiresAt,
  terms,
  status = 'available',
  lockedHint,
  theme: themeProp = 'sunset',
  pattern: patternProp,
  layout = 'horizontal',
  variant = 'ticket',
  size = 'md',
  shine = false,
  tilt = false,
  holo = false,
  idle = false,
  onCopy,
  onApply,
  onPress,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlip,
  labels: labelsProp,
  style,
}: CouponProps) {
  const { colors, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const theme = typeof themeProp === 'object' ? themeProp : couponThemes[themeProp];
  const fills = typeof theme.fill === 'string' ? [theme.fill] : theme.fill;
  const accent = theme.accent ?? fills[fills.length - 1] ?? colors.primary;
  const body = theme.body ?? (dark ? colors.popover : colors.card);
  const bodyInk = theme.bodyInk ?? colors.foreground;
  const bodySoft = alpha(bodyInk, 0.6);
  // The accent as text on the details panel — or the panel's ink when they'd blend (yellow on white).
  const textAccent = contrast(accent, typeof body === 'string' ? body : (body[0] ?? colors.card)) >= 2.6 ? accent : bodyInk;
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const horizontal = layout === 'horizontal';
  const labels: Required<CouponLabels> = {
    copy: 'Copy',
    copied: 'Copied!',
    apply: 'Apply',
    applied: 'Applied',
    used: 'Used',
    expired: 'Expired',
    locked: 'Locked',
    endsIn: 'Ends in',
    terms: 'T&C',
    termsTitle: 'Terms & conditions',
    back: 'Tap to turn back',
    ...labelsProp,
  };

  const left = useRemaining(expiresAt);
  const state: CouponStatus = status === 'available' && left === 0 ? 'expired' : status;
  const spent = state === 'used' || state === 'expired';
  const locked = state === 'locked';

  const controlled = flippedProp !== undefined;
  const [own, setOwn] = useState(defaultFlipped);
  const flipped = controlled ? flippedProp : own;
  // One flip drives the card and the tilt shadow, so the shadow never shows as a dark box mid-turn.
  const flip = useFlipProgress(flipped);
  const [backReady, setBackReady] = useState(flipped);
  const canFlip = !!terms?.length;
  const toggle = () => {
    if (!canFlip) return;
    setBackReady(true);
    if (!controlled) setOwn(!flipped);
    onFlip?.(!flipped);
  };
  // Once the back has been shown it stays mounted (it has to, to turn back); until then it costs nothing.
  if (flipped && !backReady) setBackReady(true);

  // Outline: two panels meet at the tear line; their cut-in corners make the notches.
  const n = v.notch;
  const endEdge = v.edge;
  const sideEdge = v.ends ? undefined : v.edge;
  const valueEdges: Partial<Record<TicketSide, TicketEdge | undefined>> = horizontal ? { left: endEdge, top: sideEdge, bottom: sideEdge } : { top: endEdge, left: sideEdge, right: sideEdge };
  const detailEdges: Partial<Record<TicketSide, TicketEdge | undefined>> = horizontal ? { right: endEdge, top: sideEdge, bottom: sideEdge } : { bottom: endEdge, left: sideEdge, right: sideEdge };
  const corners = (tl: number, tr: number, br: number, bl: number): TicketCorners => [tl, tr, br, bl];
  const valueCorners = horizontal ? corners(v.r, -n, -n, v.r) : corners(v.r, v.r, -n, -n);
  const detailCorners = horizontal ? corners(-n, v.r, v.r, -n) : corners(-n, -n, v.r, v.r);
  const [valueBox, setValueBox] = useState({ width: 0, height: 0 });
  const [detailBox, setDetailBox] = useState({ width: 0, height: 0 });
  const W = horizontal ? valueBox.width + detailBox.width : detailBox.width;
  const H = horizontal ? detailBox.height : valueBox.height + detailBox.height;
  const split = horizontal ? valueBox.width : valueBox.height;
  const outline: TicketGeometry = {
    width: W,
    height: H,
    corners: v.r,
    edgeSize: v.edgeSize,
    edges: horizontal ? { left: endEdge, right: endEdge, top: sideEdge, bottom: sideEdge } : { top: endEdge, bottom: endEdge, left: sideEdge, right: sideEdge },
    notches: n
      ? horizontal
        ? [{ side: 'top', at: split, radius: n }, { side: 'bottom', at: split, radius: n }]
        : [{ side: 'left', at: split, radius: n }, { side: 'right', at: split, radius: n }]
      : [],
  };
  const measured = W > 0 && H > 0 && split > 0;
  const edgePad = v.edgeSize;

  // Locked coupons go grey; the rest keep their colours.
  const valueFill = locked ? ['#a3a8b3', '#6b7280'] : theme.fill;
  const valueInk = locked ? '#ffffff' : theme.ink;
  const valueSoft = alpha(valueInk, 0.82);
  const pattern = patternProp ?? theme.pattern ?? 'none';
  const vLen = value.length;
  const valueSize = Math.round(s.value * (horizontal ? 1 : 1.3) * (vLen <= 3 ? 1 : vLen <= 4 ? 0.86 : vLen <= 5 ? 0.74 : 0.62));
  const lift = valueInk === '#ffffff' ? styles.lift : null;
  const inline = !horizontal && value.length + (unit?.length ?? 0) <= 9;

  // The countdown chip: calm until the last hour, then red. On the colourful panel (vertical) it
  // sits on a dark glass chip, and turns solid red when urgent, so it reads on any colour.
  const urgent = left !== undefined && left < 3_600_000;
  const timerBg = horizontal ? alpha(urgent ? '#ef4444' : bodyInk, urgent ? 0.14 : 0.08) : urgent ? '#ef4444' : 'rgba(0,0,0,0.22)';
  const timerInk = horizontal ? (urgent ? '#ef4444' : bodySoft) : '#ffffff';
  const countdown =
    left !== undefined && left > 0 && !spent ? (
      <View style={[styles.timer, { backgroundColor: timerBg }]}>
        <Icon d={ICON.clock} size={11} color={timerInk} />
        <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: timerInk, fontSize: 10.5, fontWeight: '800', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' }, ff]}>
          {labels.endsIn} {formatCountdown(left)}
        </Text>
      </View>
    ) : null;

  const brandRow =
    brand || logo || countdown ? (
      <View style={styles.row}>
        <View style={[styles.row, { gap: 6, flexShrink: 1 }]}>
          {logo}
          {brand ? (
            <Text numberOfLines={1} style={[{ color: horizontal ? bodySoft : valueSoft, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2, flexShrink: 1 }, ff]}>
              {brand.toUpperCase()}
            </Text>
          ) : null}
        </View>
        {countdown}
      </View>
    ) : null;

  // Value panel ------------------------------------------------------------------------------------
  const valueBlock = (
    <View style={{ alignItems: 'center' }}>
      {prefix ? <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: valueSoft, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.6 }, ff, lift]}>{prefix.toUpperCase()}</Text> : null}
      {locked ? <Icon d={ICON.lock} size={valueSize * 0.6} color={valueInk} /> : null}
      {/* Vertical coupons set "50% OFF" on one line when it fits, and stack a long unit ("CASHBACK"). */}
      <View style={{ flexDirection: inline ? 'row' : 'column', alignItems: inline ? 'flex-end' : 'center', gap: inline ? 6 : 0 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={FONT_CAP} style={[{ color: valueInk, fontSize: valueSize, lineHeight: valueSize * 1.08, fontWeight: '900', letterSpacing: -1.2 }, ff, lift]}>
          {value}
        </Text>
        {unit ? (
          <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: valueInk, fontSize: horizontal ? 12.5 : 16, fontWeight: '900', letterSpacing: 2.4, marginBottom: inline ? valueSize * 0.14 : 0 }, ff, lift]}>
            {unit.toUpperCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
  const valuePanel = (
    <TicketShape
      corners={valueCorners}
      edges={valueEdges}
      edgeSize={v.edgeSize}
      fill={valueFill}
      pattern={locked ? 'none' : pattern}
      seed={code ?? value}
      onSize={setValueBox}
      style={
        horizontal
          ? { width: s.panel, justifyContent: 'center', paddingVertical: s.pad + edgePad, paddingLeft: 8 + edgePad, paddingRight: 8 }
          : { paddingHorizontal: s.pad + edgePad, paddingTop: s.pad + edgePad, paddingBottom: s.pad + 4, gap: 10 }
      }
    >
      {horizontal ? (
        valueBlock
      ) : (
        <>
          {brandRow}
          {valueBlock}
          {title ? (
            <Text numberOfLines={2} style={[{ color: valueInk, fontSize: s.title + 1, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 }, ff, lift]}>
              {title}
            </Text>
          ) : null}
        </>
      )}
    </TicketShape>
  );

  // Details panel ----------------------------------------------------------------------------------
  const applied = state === 'applied';
  const action = onApply ? (
    <Pressable
      onPress={onApply}
      disabled={state !== 'available'}
      accessibilityRole="button"
      accessibilityState={{ disabled: state !== 'available', selected: applied }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.apply,
        {
          marginLeft: 'auto',
          backgroundColor: applied ? '#16a34a' : locked || spent ? alpha(bodyInk, 0.12) : accent,
          transform: [{ scale: pressed && !reduce ? 0.95 : 1 }],
          paddingHorizontal: size === 'sm' ? 11 : size === 'md' ? 13 : 16,
        },
      ]}
    >
      {applied || locked ? <Icon d={applied ? ICON.check : ICON.lock} size={13} color={applied ? '#ffffff' : bodySoft} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[{ color: applied ? '#ffffff' : locked || spent ? bodySoft : readableOn(accent), fontSize: s.chip - 0.5, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' }, ff]}>
        {applied ? labels.applied : locked ? labels.locked : labels.apply}
      </Text>
    </Pressable>
  ) : null;

  const footer =
    expires || canFlip ? (
      <View style={[styles.row, { justifyContent: 'flex-start', gap: 6 }]}>
        {expires ? <Text style={[{ color: bodySoft, fontSize: 11, fontWeight: '600', flexShrink: 1 }, ff]}>{expires}</Text> : null}
        {expires && canFlip ? <Text style={[{ color: bodySoft, fontSize: 11 }, ff]}>·</Text> : null}
        {canFlip ? (
          <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={labels.termsTitle}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: textAccent, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' }, ff]}>{labels.terms}</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;

  const detailPanel = (
    <TicketShape
      corners={detailCorners}
      edges={detailEdges}
      edgeSize={v.edgeSize}
      fill={body}
      tear={n || variant === 'cutout' ? (horizontal ? 'left' : 'top') : undefined}
      tearColor={alpha(bodyInk, variant === 'cutout' ? 0.45 : 0.22)}
      onSize={setDetailBox}
      style={[
        horizontal ? { flex: 1 } : null,
        {
          paddingTop: (horizontal ? s.pad + edgePad : s.pad + 2) + (variant === 'cutout' ? 2 : 0),
          paddingBottom: s.pad + edgePad,
          paddingLeft: horizontal ? s.pad + 2 : s.pad + edgePad,
          paddingRight: s.pad + edgePad,
          gap: s.gap,
        },
      ]}
    >
      {horizontal ? brandRow : null}
      {horizontal && title ? (
        <Text numberOfLines={2} style={[{ color: bodyInk, fontSize: s.title, fontWeight: '800', letterSpacing: -0.3 }, ff]}>
          {title}
        </Text>
      ) : null}
      {locked && lockedHint ? (
        <Text numberOfLines={2} style={[{ color: textAccent, fontSize: s.desc, fontWeight: '700' }, ff]}>
          {lockedHint}
        </Text>
      ) : description ? (
        <Text numberOfLines={size === 'sm' ? 1 : 2} style={[{ color: bodySoft, fontSize: s.desc, lineHeight: s.desc * 1.35 }, ff]}>
          {description}
        </Text>
      ) : null}
      {code || action ? (
        // The code never gets cut short: when it and the button don't fit side by side, the button
        // wraps under it (and stays right-aligned).
        <View style={[styles.row, { gap: 8, marginTop: 2, flexWrap: 'wrap' }]}>
          {code ? <CodeChip code={code} color={textAccent} ink={bodyInk} fontSize={s.chip} onCopy={spent || locked ? undefined : onCopy} labels={labels} reduce={reduce} /> : <View />}
          {action}
        </View>
      ) : null}
      {footer}
    </TicketShape>
  );

  const { width: _w, height: _h, ...shape } = outline;
  const glareClip = measured ? ticketSafeRects(outline) : undefined;
  // The sweep is decorative, so Reduce Motion drops it.
  const valueWindows = shine && !reduce && measured && !spent && !locked
    ? ticketSafeRects({ width: valueBox.width, height: valueBox.height, corners: valueCorners, edges: valueEdges, edgeSize: v.edgeSize })
    : null;

  const front = (
    <View>
      <View style={[{ flexDirection: horizontal ? 'row' : 'column' }, spent ? { opacity: 0.5 } : null]}>
        {valuePanel}
        {detailPanel}
      </View>
      {valueWindows ? <Shine windows={valueWindows} width={valueBox.width} height={valueBox.height} /> : null}
      {variant === 'cutout' && measured ? (
        <>
          {/* "Cut here": a dashed frame just inside the edge, and scissors on the tear line. */}
          <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Rect x={5} y={5} width={W - 10} height={H - 10} rx={Math.max(0, v.r - 4)} fill="none" stroke={alpha(bodyInk, 0.4)} strokeWidth={1.5} strokeDasharray={[6, 5]} />
          </Svg>
          <View pointerEvents="none" style={[styles.scissors, { backgroundColor: typeof body === 'string' ? body : body[0] }, horizontal ? { left: split - 11, top: -2 } : { top: split - 11, left: -2, transform: [{ rotate: '90deg' }] }]}>
            <Icon d={ICON.scissors} size={16} color={alpha(bodyInk, 0.75)} />
          </View>
        </>
      ) : null}
      {measured ? (
        // A hairline around the real outline (notches, perforations and all), so a white coupon still
        // reads on a white screen; it turns into a green ring once the coupon is applied.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <TicketShape
            {...shape}
            fill="transparent"
            stroke={applied ? '#16a34a' : alpha(bodyInk, dark ? 0.16 : 0.11)}
            strokeWidth={applied ? 3 : 2}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
      {spent ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, horizontal ? { left: split } : { top: split }]}>
          <TicketStamp text={state === 'used' ? labels.used : labels.expired} color={state === 'used' ? alpha(bodyInk, 0.75) : '#e5484d'} size={size === 'sm' ? 14 : 17} />
        </View>
      ) : null}
    </View>
  );

  const back =
    canFlip && backReady ? (
      <TicketShape {...shape} fill={body} style={StyleSheet.absoluteFill}>
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityHint={labels.back} style={[StyleSheet.absoluteFill, { padding: s.pad + edgePad, gap: 6, flexDirection: horizontal ? 'row' : 'column' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: bodyInk, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 }, ff]}>{labels.termsTitle}</Text>
            {terms!.slice(0, size === 'lg' ? 5 : 4).map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: textAccent, fontSize: 11, fontWeight: '900' }, ff]}>•</Text>
                <Text numberOfLines={2} maxFontSizeMultiplier={FONT_CAP} style={[{ color: bodySoft, fontSize: 11, lineHeight: 14.5, flex: 1 }, ff]}>
                  {t}
                </Text>
              </View>
            ))}
            <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: alpha(bodyInk, 0.4), fontSize: 10, fontWeight: '700', marginTop: 'auto' }, ff]}>{labels.back}</Text>
          </View>
          {code ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <View style={styles.plate}>
                <BarcodeLike code={code} width={horizontal ? 74 : 200} height={horizontal ? 54 : 46} />
              </View>
              <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: bodyInk, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, ff]}>{code}</Text>
            </View>
          ) : null}
        </Pressable>
      </TicketShape>
    ) : (
      <View />
    );

  const card = canFlip ? <FlipCard front={front} back={back} flipped={flipped} progress={flip.progress} trigger="none" perspective={1400} radius={v.r} shadow={false} /> : front;

  if (tilt) {
    return (
      <TiltCard shadowScaleX={flip.shadowScaleX} onPress={flipped ? toggle : onPress} glare={holo ? 'holo' : 'soft'} glareClip={glareClip} idle={idle} maxTilt={10} radius={v.r} shadow={measured && !spent} style={style}>
        {card}
      </TiltCard>
    );
  }
  const inset = Math.max(n, v.edgeSize) + 8;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={style}>
      {({ pressed }) => (
        <View style={{ transform: [{ scale: pressed && !reduce ? 0.985 : 1 }] }}>
          {/* The plate waits for the painted outline (no black flash on mount), and a dimmed (used /
              expired) coupon is see-through, so it gets none. */}
          {spent || !measured ? null : <View pointerEvents="none" style={[styles.shadow, { top: inset, bottom: inset - 4, left: inset, right: inset, borderRadius: v.r, boxShadow: `0px 8px 28px rgba(0,0,0,${dark ? 0.5 : 0.2})` }]} />}
          <View>{card}</View>
        </View>
      )}
    </Pressable>
  );
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  lift: { textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, maxWidth: '100%' },
  apply: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, borderRadius: 999 },
  window: { position: 'absolute', overflow: 'hidden' },
  scissors: { position: 'absolute', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  plate: { padding: 5, borderRadius: 6, backgroundColor: '#ffffff' },
  shadow: {
    position: 'absolute',
    backgroundColor: '#000',
  },
});
