import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, isTextNode, motion, readableOn, type Colors, useKit } from '@/lib/kit';

export type BadgeIconName = 'bell' | 'message' | 'package' | 'cart' | 'heart' | 'clock' | 'refresh' | 'check' | 'alert';

const ICON_STROKE = { strokeWidth: 1.85, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };

/** Line icon for notification anchors and badge labels. */
export function BadgeIcon({ name, color, size = 22 }: { name: BadgeIconName; color: string; size?: number }) {
  const p = { ...ICON_STROKE, stroke: color };
  const body: Record<BadgeIconName, React.ReactNode> = {
    bell: (
      <>
        <Path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" {...p} />
        <Path d="M10 21h4" {...p} />
      </>
    ),
    message: (
      <>
        <Path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4V7a2 2 0 0 1 2-2z" {...p} />
      </>
    ),
    package: (
      <>
        <Path d="M4 8l8-4 8 4v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" {...p} />
        <Path d="M4 8l8 4 8-4M12 12v9" {...p} />
      </>
    ),
    cart: (
      <>
        <Path d="M6 6h15l-1.5 7H8L6 6z" {...p} />
        <Circle cx={10} cy={19} r={1.4} fill={color} />
        <Circle cx={17} cy={19} r={1.4} fill={color} />
        <Path d="M6 6L5 3H2" {...p} />
      </>
    ),
    clock: (
      <>
        <Circle cx={12} cy={12} r={8.5} {...p} />
        <Path d="M12 7.5V12l3 2" {...p} />
      </>
    ),
    refresh: <Path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V8h-3.5" {...p} />,
    check: <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />,
    alert: (
      <>
        <Circle cx={12} cy={12} r={8.5} {...p} />
        <Path d="M12 7.5v5M12 16.2v.3" {...p} />
      </>
    ),
    heart: <Path d="M12 20.5l-1.1-1C6.1 15.1 3 12.2 3 8.6A4.6 4.6 0 0 1 7.6 4c2 0 3.1 1.2 4.4 2.5C13.3 5.2 14.4 4 16.4 4A4.6 4.6 0 0 1 21 8.6c0 3.6-3.1 6.5-7.9 10.9L12 20.5z" {...p} />,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {body[name]}
    </Svg>
  );
}

export interface BadgeIconTileProps {
  /** Built-in icon name. */
  name?: BadgeIconName | undefined;
  /** Your own icon node — overrides `name`. */
  icon?: React.ReactNode | undefined;
  /** Tile size in points (default 48). */
  size?: number | undefined;
  /** Glyph colour (default: foreground). */
  color?: string | undefined;
  /** Tile background (default: muted). */
  backgroundColor?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/** Rounded square anchor for `NotificationBadge` — pass a built-in `name` or your own `icon`. */
export function BadgeIconTile({ name, icon, size = 48, color, backgroundColor, style }: BadgeIconTileProps) {
  const { colors, radius } = useKit();
  const tint = color ?? colors.foreground;
  const glyph = icon ?? (name ? <BadgeIcon name={name} color={tint} size={Math.round(size * 0.46)} /> : null);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.scale(14),
          backgroundColor: backgroundColor ?? colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {glyph}
    </View>
  );
}

export type BadgeVariant = 'solid' | 'soft' | 'outline' | 'dot';
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant | undefined;
  tone?: BadgeTone | undefined;
  size?: BadgeSize | undefined;
  /** Custom colour — overrides `tone`. */
  color?: string | undefined;
  /** Icon or emoji before the label. */
  icon?: React.ReactNode | undefined;
  /** 'pill' (default) or 'rounded' corners. */
  shape?: 'pill' | 'rounded' | undefined;
  /** Pulse the leading dot (dot variant) — "live" states. */
  pulse?: boolean | undefined;
  /**
   * When the label, icon or colour changes: roll the old label up and the new one in, pop the icon,
   * cross-fade the colours and spring the width (default true). Never animates on mount.
   */
  animateChanges?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const SIZES: Record<BadgeSize, { h: number; px: number; font: number; dot: number; gap: number }> = {
  sm: { h: 20, px: 7, font: 11, dot: 6, gap: 4 },
  md: { h: 24, px: 9, font: 12.5, dot: 7, gap: 5 },
  lg: { h: 28, px: 11, font: 14, dot: 8, gap: 6 },
};

function toneColor(colors: Colors, tone: BadgeTone) {
  return { neutral: colors.mutedForeground, accent: colors.accent, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
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

interface Look {
  bg: string;
  fg: string;
  border: string;
  dot: string;
}

interface Change {
  /** Outgoing label rolling up and out; the current label rolls in under it. */
  text?: { from: string; fg: string; perLetter: boolean; duration: number };
  /** Outgoing icon (null when an icon was just added). */
  icon?: { from: React.ReactNode };
  /** Colours being faded from. */
  look?: Look;
}

/** Short Latin labels roll letter by letter; anything else (CJK, emoji, long text) rolls as one piece. */
const LATIN = /^[A-Za-z0-9À-ɏ .,:;'’&+\-!?#%()/]{1,18}$/;
/** Roll timing in ms: delay between letters, one letter's travel, and how far the new label trails the old. */
const STAGGER = 24;
const ROLL = 320;
const LEAD = 70;

function labelText(node: React.ReactNode): string | null {
  if (!isTextNode(node)) return null;
  return Array.isArray(node) ? node.join('') : String(node);
}

function sameValue(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || React.isValidElement(a) || React.isValidElement(b)) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Icons compare by type, key and props (ignoring colour), so an inline `<BadgeIcon />` only "changes" with its glyph. */
function sameIcon(a: React.ReactNode, b: React.ReactNode) {
  if (Object.is(a, b)) return true;
  if (!React.isValidElement(a) || !React.isValidElement(b)) return false;
  if (a.type !== b.type || a.key !== b.key) return false;
  const pa = a.props as Record<string, unknown>;
  const pb = b.props as Record<string, unknown>;
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    if (k !== 'color' && !sameValue(pa[k], pb[k])) return false;
  }
  return true;
}

/** Eased move from `from` to `to` while `v` runs start → end (held outside), sampled for the native driver. */
function span(v: Animated.Value, start: number, end: number, from: number, to: number, ease: (t: number) => number) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k <= 10; k++) {
    inputRange.push(start + ((end - start) * k) / 10);
    outputRange.push(from + (to - from) * ease(k / 10));
  }
  return v.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

const easeIn = Easing.in(Easing.cubic);
const easeSettle = Easing.bezier(0.32, 0.72, 0, 1);
const easeLinear = Easing.linear;

/** One side of a label roll: letters (or the whole label) slide up out of / up into the clipped slot. */
function RollingLabel({
  text,
  color,
  fontSize,
  progress,
  out,
  perLetter,
  duration,
}: {
  text: string;
  color: string;
  fontSize: number;
  progress: Animated.Value;
  out: boolean;
  perLetter: boolean;
  duration: number;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const pieces = perLetter ? [...text].map((ch) => (ch === ' ' ? ' ' : ch)) : [text];
  const distance = Math.ceil(fontSize * 1.35);
  return (
    <View pointerEvents="none" style={styles.roll}>
      {pieces.map((piece, i) => {
        const begin = ((out ? 0 : LEAD) + i * STAGGER) / duration;
        const travel = (out ? ROLL * 0.7 : ROLL) / duration;
        const end = Math.min(1, begin + travel);
        const fade = Math.min(1, begin + travel * 0.5);
        return (
          <Animated.View
            key={i}
            style={{
              opacity: out ? span(progress, begin, fade, 1, 0, easeLinear) : span(progress, begin, fade, 0, 1, easeLinear),
              transform: [
                { translateY: out ? span(progress, begin, end, 0, -distance, easeIn) : span(progress, begin, end, distance, 0, easeSettle) },
              ],
            }}
          >
            <Text numberOfLines={1} allowFontScaling={false} style={[styles.label, ff, { color, fontSize }]}>
              {piece}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Small status label: solid, soft, outline or dot — five tones, three sizes. When its text, icon or
 * tone changes, the label rolls over, the icon pops, the colour cross-fades and the pill springs to size.
 */
export function Badge({
  children,
  variant = 'soft',
  tone = 'neutral',
  size = 'md',
  color,
  icon,
  shape = 'pill',
  pulse,
  animateChanges = true,
  style,
}: BadgeProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const s = SIZES[size];
  const c = color ?? toneColor(colors, tone);
  const neutral = !color && tone === 'neutral';
  const [pulseV] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!pulse || variant !== 'dot') return;
    const loop = Animated.loop(
      Animated.timing(pulseV, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, variant, pulseV]);

  const look: Record<BadgeVariant, { bg: string; fg: string; border: string }> = {
    solid: neutral
      ? { bg: colors.primary, fg: colors.primaryForeground, border: 'transparent' }
      : { bg: c, fg: color ? readableOn(c) : tone === 'accent' ? colors.accentForeground : readableOn(c), border: 'transparent' },
    soft: neutral
      ? { bg: colors.muted, fg: colors.foreground, border: 'transparent' }
      : { bg: alpha(c, dark ? 0.2 : 0.13), fg: c, border: 'transparent' },
    outline: neutral
      ? { bg: 'transparent', fg: colors.foreground, border: colors.border }
      : { bg: 'transparent', fg: c, border: alpha(c, 0.45) },
    dot: { bg: 'transparent', fg: colors.foreground, border: colors.border },
  };
  const { bg, fg, border } = look[variant];
  const dotColor = neutral ? colors.mutedForeground : c;
  const text = labelText(children);

  // Change tracking: diff against the last render and start a transition — never on mount.
  const [last, setLast] = useState({ seq: 0, text, icon, look: { bg, fg, border, dot: dotColor } as Look });
  const [change, setChange] = useState<Change | null>(null);
  // While set, the pill keeps this width (number), then springs (Animated.Value) to the new content.
  const [pin, setPin] = useState<number | Animated.Value | null>(null);
  const [natural, setNatural] = useState<number | null>(null);
  const rowWidth = useRef<number | null>(null);
  const [widthV] = useState(() => new Animated.Value(0));
  const flat = flattenView(style);
  const canSize = flat.width == null && flat.minWidth == null && flat.flex == null && flat.flexGrow == null && flat.alignSelf !== 'stretch';

  const textChanged = text !== last.text;
  const iconChanged = !sameIcon(icon, last.icon);
  const lookChanged = bg !== last.look.bg || fg !== last.look.fg || border !== last.look.border || dotColor !== last.look.dot;
  if (textChanged || iconChanged || lookChanged) {
    setLast({ seq: last.seq + 1, text, icon, look: { bg, fg, border, dot: dotColor } });
    const next: Change = {};
    if (animateChanges && !reduce) {
      if (textChanged && last.text != null && text != null) {
        const perLetter = LATIN.test(last.text) && LATIN.test(text);
        const n = perLetter ? Math.max(last.text.length, text.length) : 1;
        next.text = { from: last.text, fg: last.look.fg, perLetter, duration: LEAD + (n - 1) * STAGGER + ROLL };
      }
      if (iconChanged && icon != null) next.icon = { from: last.icon ?? null };
      if (lookChanged) next.look = last.look;
    }
    const animated = !!(next.text || next.icon || next.look);
    setChange(animated ? next : null);
    setPin(animated && (textChanged || iconChanged) && canSize && natural != null ? natural : null);
  }

  // Fresh values per change, so the first frame of a transition already sits at its start.
  const anim = useMemo(
    () => ({ seq: last.seq, roll: new Animated.Value(0), pop: new Animated.Value(0), mix: new Animated.Value(0) }),
    [last.seq]
  );

  useEffect(() => {
    if (!change) return;
    const runs: Animated.CompositeAnimation[] = [];
    if (change.text) {
      runs.push(Animated.timing(anim.roll, { toValue: 1, duration: change.text.duration, easing: easeLinear, useNativeDriver: true }));
    }
    if (change.icon) runs.push(Animated.spring(anim.pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }));
    if (change.look) {
      runs.push(Animated.timing(anim.mix, { toValue: 1, duration: motion.normal, easing: Easing.out(Easing.quad), useNativeDriver: false }));
    }
    let left = runs.length;
    runs.forEach((r) =>
      r.start(({ finished }) => {
        left -= 1;
        if (finished && left === 0) setChange((cur) => (cur === change ? null : cur));
      })
    );
    return () => runs.forEach((r) => r.stop());
  }, [change, anim]);

  const onRoot = (e: LayoutChangeEvent) => {
    if (pin == null) setNatural(e.nativeEvent.layout.width);
  };
  // The icon + label row remounts on every change, so this always reports the new content's width.
  const onRow = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const prev = rowWidth.current;
    rowWidth.current = w;
    if (typeof pin !== 'number') return;
    if (prev == null || Math.abs(w - prev) < 0.5) {
      setPin(null);
      return;
    }
    const to = Math.max(0, pin + (w - prev));
    widthV.setValue(pin);
    setNatural(to);
    setPin(widthV);
    Animated.spring(widthV, { toValue: to, useNativeDriver: false, ...motion.snappy }).start(({ finished }) => {
      if (finished) setPin((p) => (p === widthV ? null : p));
    });
  };

  const from = change?.look;
  const mix = (a: string, b: string) => (from ? anim.mix.interpolate({ inputRange: [0, 1], outputRange: [a, b] }) : b);
  const roll = change?.text;

  let label: React.ReactNode = children;
  if (text != null) {
    label = (
      <View style={roll ? styles.clip : undefined}>
        <Animated.Text
          numberOfLines={1}
          allowFontScaling={false}
          style={[styles.label, ff, { color: from && !roll ? mix(from.fg, fg) : fg, fontSize: s.font }, roll ? styles.hidden : null]}
        >
          {text}
        </Animated.Text>
        {roll ? (
          <>
            <RollingLabel text={roll.from} color={roll.fg} fontSize={s.font} progress={anim.roll} out perLetter={roll.perLetter} duration={roll.duration} />
            <RollingLabel text={text} color={fg} fontSize={s.font} progress={anim.roll} out={false} perLetter={roll.perLetter} duration={roll.duration} />
          </>
        ) : null}
      </View>
    );
  }

  const pop = anim.pop;
  const iconNode =
    icon != null && change?.icon ? (
      <View>
        {change.icon.from != null ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.center,
              {
                opacity: pop.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' }),
                transform: [
                  { scale: pop.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0.3], extrapolate: 'clamp' }) },
                  { rotate: pop.interpolate({ inputRange: [0, 0.5], outputRange: ['0deg', '100deg'], extrapolate: 'clamp' }) },
                ],
              },
            ]}
          >
            {change.icon.from}
          </Animated.View>
        ) : null}
        <Animated.View
          style={{
            opacity: pop.interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-100deg', '0deg'] }) },
            ],
          }}
        >
          {icon}
        </Animated.View>
      </View>
    ) : (
      icon
    );

  return (
    <Animated.View
      accessible={text != null ? true : undefined}
      accessibilityRole="text"
      accessibilityLabel={text ?? undefined}
      accessibilityLiveRegion={animateChanges && text != null ? 'polite' : undefined}
      onLayout={animateChanges ? onRoot : undefined}
      style={[
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          gap: s.gap,
          backgroundColor: from ? mix(from.bg, bg) : bg,
          borderColor: from ? mix(from.border, border) : border,
          borderRadius: shape === 'pill' ? radius.capsule(s.h) : radius.sm,
        },
        pin != null ? { width: pin, overflow: 'hidden' as const } : null,
        style,
      ]}
    >
      {variant === 'dot' ? (
        <View style={{ width: s.dot, height: s.dot }}>
          {pulse ? (
            <Animated.View
              style={[
                styles.fill,
                {
                  borderRadius: s.dot,
                  backgroundColor: dotColor,
                  opacity: pulseV.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                  transform: [{ scale: pulseV.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
                },
              ]}
            />
          ) : null}
          {/* Colour fades on the JS driver, so it lives on this view — the pulse above owns the native transforms. */}
          <Animated.View style={[styles.fill, { borderRadius: s.dot, backgroundColor: from ? mix(from.dot, dotColor) : dotColor }]} />
        </View>
      ) : null}
      <View key={last.seq} onLayout={animateChanges ? onRow : undefined} style={[styles.row, { gap: s.gap }]}>
        {iconNode}
        {label}
      </View>
    </Animated.View>
  );
}

export interface NotificationBadgeProps {
  /** The number to show. 0 hides the badge (unless `showZero`). */
  count?: number | undefined;
  /** Above this, show "99+". */
  max?: number | undefined;
  /** Just a dot, no number. */
  dot?: boolean | undefined;
  showZero?: boolean | undefined;
  tone?: BadgeTone | undefined;
  color?: string | undefined;
  size?: 'sm' | 'md' | undefined;
  /** What the badge sits on (icon, avatar, button). Omit to render the badge inline. */
  children?: React.ReactNode | undefined;
  /** Nudge the badge from the top-right corner: [x, y] in points. */
  offset?: [number, number] | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/** Count bubble that springs in, pops every time the number changes, and shrinks away at zero. */
export function NotificationBadge({
  count = 0,
  max = 99,
  dot,
  showZero,
  tone = 'danger',
  color,
  size = 'md',
  children,
  offset = [0, 0],
  style,
}: NotificationBadgeProps) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const c = color ?? toneColor(colors, tone);
  const fg = !color && tone === 'accent' ? colors.accentForeground : readableOn(c);
  const visible = count > 0 || !!showZero;

  // Keep the last number on screen while it shrinks away.
  const [shown, setShown] = useState(count);
  const [show] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(1));
  const prev = useRef(count);
  if (visible && shown !== count) setShown(count);

  useEffect(() => {
    Animated.spring(show, { toValue: visible ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
    if (visible && prev.current !== count && prev.current > 0) {
      pop.setValue(1.35);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 29, stiffness: 320, mass: 0.6 }).start();
    }
    prev.current = count;
  }, [count, visible, show, pop]);

  const h = size === 'sm' ? 18 : 22; // includes the 2pt ring
  const d = size === 'sm' ? 11 : 13;
  const text = shown > max ? `${max}+` : String(shown);

  const bubble = (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.bubble,
        dot
          ? { width: d, height: d, borderRadius: d / 2 }
          : { minWidth: h, height: h, borderRadius: h / 2, paddingHorizontal: text.length > 1 ? 4 : 0 },
        {
          backgroundColor: c,
          borderColor: colors.background,
          opacity: show.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: Animated.multiply(show, pop) }],
        },
        children
          ? { position: 'absolute', top: -(dot ? d : h) / 3 + offset[1], right: -(dot ? d : h) / 3 - offset[0] }
          : null,
      ]}
    >
      {dot ? null : (
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.count, ff, { color: fg, fontSize: size === 'sm' ? 10 : 11.5 }]}>
          {text}
        </Text>
      )}
    </Animated.View>
  );

  const a11y = visible ? (dot ? 'New activity' : `${count} notification${count === 1 ? '' : 's'}`) : undefined;
  if (!children) {
    return (
      <View accessibilityLabel={a11y} style={style}>
        {bubble}
      </View>
    );
  }
  return (
    <View accessibilityLabel={a11y} style={[styles.anchor, style]}>
      {children}
      {bubble}
    </View>
  );
}

/**
 * The user's root style as one object. Not StyleSheet.flatten: with TypeScript 6 its RN 0.88 signature
 * rejects a plain StyleProp<ViewStyle> once expo/types adds web-only keys to ViewStyle.
 */
function flattenView(style: StyleProp<ViewStyle>): ViewStyle {
  if (!style || typeof style !== 'object') return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map((s) => flattenView(s as StyleProp<ViewStyle>)));
  return style as ViewStyle;
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1 },
  label: { fontWeight: '400', letterSpacing: 0.1, includeFontPadding: false, textAlignVertical: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  // Clips the roll; the 2pt slack (cancelled by negative margins) keeps overshoot and unkerned letters whole.
  clip: { overflow: 'hidden', padding: 2, margin: -2 },
  hidden: { opacity: 0 },
  roll: { position: 'absolute', top: 2, left: 2, flexDirection: 'row' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  anchor: { alignSelf: 'flex-start' },
  bubble: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  count: { fontWeight: '400', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' },
});
