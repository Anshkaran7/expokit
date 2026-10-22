import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';
/**
 * `soft` — card with a glow of the tone behind the icon (default).
 * `outline` — transparent with a hairline tone border.
 * `solid` — filled with the solid tone.
 * @deprecated `accent-bar` — renders as `soft`; the side-bar look was retired.
 */
export type AlertAppearance = 'soft' | 'outline' | 'solid' | 'accent-bar';

export interface AlertAction {
  label: string;
  onPress: () => void;
}

export interface AlertActions {
  /** Filled pill tinted with the tone. */
  primary: AlertAction;
  /** Quiet neutral pill beside it. */
  secondary?: AlertAction;
}

export interface AlertProps {
  variant?: AlertVariant;
  /** Surface look. `accent-bar` is deprecated and renders as `soft`. */
  appearance?: AlertAppearance;
  title?: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Custom icon (shown inside the halo), or `false` to hide it. */
  icon?: React.ReactNode | false;
  /** One action: a pill under the text, or inline on the right in the compact (no title) layout. Or any node. */
  action?: AlertAction | React.ReactNode;
  /** A primary + secondary pill pair on the bottom row. */
  actions?: AlertActions;
  /** Show a close button that collapses the alert away. */
  dismissible?: boolean;
  /** Controlled visibility. Changing it to false collapses the alert smoothly. */
  visible?: boolean;
  /** Called when closed (button or `duration`). In controlled mode, set `visible` to false here. */
  onDismiss?: () => void;
  /** Auto-dismiss after this many ms. A hairline along the bottom drains to show the time left; touching pauses it. */
  duration?: number;
  /** Play a notification haptic (success / warning / error) when the alert appears. */
  haptics?: boolean;
  /** Override the tone colour. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;
const HALO = 34;
const HALO_COMPACT = 28;

/**
 * Inline banner with a living icon in a halo, a soft glow of its tone, and optional actions.
 * The icon draws itself in, an optional timer drains along the bottom edge (pausing while
 * touched), and on dismiss the alert fades and collapses its height so the content below glides up.
 */
export function Alert({
  variant = 'info',
  appearance = 'soft',
  title,
  description,
  children,
  icon,
  action,
  actions,
  dismissible,
  visible,
  onDismiss,
  duration,
  haptics = false,
  color,
  style,
}: AlertProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduceMotion = useReduceMotion();
  const tones: Record<AlertVariant, string> = {
    info: dark ? '#60a5fa' : '#2563eb',
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
  const tone = color ?? tones[variant];
  const look = appearance === 'accent-bar' ? 'soft' : appearance;
  const solid = look === 'solid';

  const [inner, setInner] = useState(true);
  const open = visible ?? inner;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [animating, setAnimating] = useState(false);
  const [gone, setGone] = useState(!open);

  // Native: card life, icon glyph pop, halo ripple, timer drain. JS: wrapper height, icon outline draw.
  const life = useRef(new Animated.Value(0)).current;
  const size = useRef(new Animated.Value(open ? 1 : 0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const glyph = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const drain = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  const dismiss = () => {
    if (visible === undefined) setInner(false);
    onDismiss?.();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const playIcon = () => {
    if (reduceRef.current) {
      draw.setValue(1);
      glyph.setValue(1);
      ripple.setValue(1);
      return;
    }
    draw.setValue(0);
    glyph.setValue(0);
    ripple.setValue(0);
    Animated.timing(draw, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.sequence([
      Animated.delay(280),
      Animated.spring(glyph, { toValue: 1, useNativeDriver: true, ...motion.bouncy }),
    ]).start();
    Animated.timing(ripple, { toValue: 1, duration: 700, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const buzz = () => {
    if (!haptics) return;
    const type =
      variant === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : variant === 'warning'
          ? Haptics.NotificationFeedbackType.Warning
          : variant === 'danger'
            ? Haptics.NotificationFeedbackType.Error
            : null;
    if (type !== null) Haptics.notificationAsync(type).catch(() => {});
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (open) {
        Animated.spring(life, { toValue: 1, useNativeDriver: true, ...motion.gentle }).start();
        playIcon();
        buzz();
      }
      return;
    }
    setAnimating(true);
    if (open) {
      setGone(false);
      playIcon();
      buzz();
      Animated.parallel([
        Animated.timing(size, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.spring(life, { toValue: 1, useNativeDriver: true, ...motion.gentle }),
      ]).start(() => setAnimating(false));
    } else {
      Animated.parallel([
        Animated.timing(life, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(size, {
          toValue: 0,
          duration: 280,
          delay: 90,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setAnimating(false);
        setGone(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reduce motion switched on mid-animation: jump the decorative icon motion to its end.
  useEffect(() => {
    if (!reduceMotion) return;
    draw.stopAnimation();
    draw.setValue(1);
    glyph.setValue(1);
    ripple.setValue(1);
  }, [reduceMotion, draw, glyph, ripple]);

  // Auto-dismiss timer. Wall-clock bookkeeping so pause/resume is exact without reading native values.
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const held = useRef({ press: false, hover: false });
  const running = useRef(false);

  const runTimer = () => {
    if (!duration || remaining.current <= 0) return;
    running.current = true;
    startedAt.current = Date.now();
    Animated.timing(drain, {
      toValue: 0,
      duration: remaining.current,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        running.current = false;
        dismissRef.current();
      }
    });
  };

  const hold = (key: 'press' | 'hover', on: boolean) => {
    held.current[key] = on;
    const paused = held.current.press || held.current.hover;
    if (paused && running.current) {
      running.current = false;
      remaining.current -= Date.now() - startedAt.current;
      drain.stopAnimation();
    } else if (!paused && !running.current && open) {
      runTimer();
    }
  };

  useEffect(() => {
    if (!open || !duration) return;
    drain.setValue(1);
    remaining.current = duration;
    held.current = { press: false, hover: false };
    runTimer();
    return () => {
      running.current = false;
      drain.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duration]);

  if (gone && !animating) return null;

  const compact = !title && !actions;
  const haloSize = compact ? HALO_COMPACT : HALO;
  const pad = compact ? 10 : 14;
  const ink = dark ? tone : mix(tone, colors.foreground, 0.28);

  const fg = solid ? readableOn(tone) : colors.foreground;
  const sub = solid ? alpha(fg, 0.82) : colors.mutedForeground;
  const iconColor = solid ? fg : tone;
  const disc = solid ? alpha('#ffffff', 0.24) : alpha(tone, 0.14);
  const ring = solid ? alpha('#ffffff', 0.12) : alpha(tone, 0.08);

  const surface: ViewStyle = solid
    ? { backgroundColor: tone }
    : look === 'outline'
      ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: alpha(tone, dark ? 0.45 : 0.38) }
      : { backgroundColor: colors.card, borderWidth: 1, borderColor: alpha(colors.foreground, dark ? 0.1 : 0.08) };

  // Only the soft look gets a light-leak, and it is the tone itself at low opacity.
  const glow = look === 'soft' ? { c: tone, a: dark ? 0.18 : 0.12 } : null;
  const glowCenter = pad + haloSize / 2;

  const pillColors = {
    primary: solid ? { bg: fg, fg: tone } : { bg: tone, fg: readableOn(tone) },
    secondary: solid
      ? { bg: alpha(fg, 0.16), fg }
      : { bg: alpha(colors.foreground, dark ? 0.08 : 0.05), fg: colors.foreground },
    tint: solid ? { bg: alpha(fg, 0.16), fg } : { bg: alpha(tone, dark ? 0.18 : 0.12), fg: ink },
  };

  const single = isAction(action) ? action : null;
  const pair: AlertActions | null = actions ?? (single && !compact ? { primary: single } : null);

  const iconNode =
    icon === false ? null : (
      <Halo size={haloSize} corner={radius.capsule} disc={disc} ring={ring} ripple={ripple}>
        {icon ?? (
          <LivingIcon variant={variant} color={iconColor} size={compact ? 16 : 20} draw={draw} glyph={glyph} />
        )}
      </Halo>
    );

  const closeNode = dismissible ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      hitSlop={8}
      onPress={dismiss}
      style={({ pressed }) => [
        styles.close,
        {
          borderRadius: radius.capsule(28),
          backgroundColor: solid ? alpha(fg, pressed ? 0.24 : 0.14) : alpha(colors.foreground, pressed ? 0.12 : 0.06),
          marginTop: compact ? 0 : (HALO - 28) / 2,
        },
      ]}
    >
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Path d="M6 6l12 12M18 6L6 18" stroke={solid ? fg : colors.mutedForeground} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Pressable>
  ) : null;

  const textTop = compact || icon === false ? 0 : (HALO - (title ? 21 : 20)) / 2;

  const row = (
    <>
      {iconNode}
      <View style={[styles.body, { paddingTop: textTop }]}>
        {title ? <Text style={[styles.title, ff, { color: fg }]}>{title}</Text> : null}
        {typeof description === 'string' ? (
          <Text style={[styles.desc, ff, { color: title ? sub : fg }]}>{description}</Text>
        ) : (
          description
        )}
        {children}
        {pair ? (
          <View style={styles.actions}>
            <Pill action={pair.primary} height={32} radius={radius.capsule(32)} {...pillColors.primary} />
            {pair.secondary ? (
              <Pill action={pair.secondary} height={32} radius={radius.capsule(32)} {...pillColors.secondary} />
            ) : null}
          </View>
        ) : !single && action ? (
          (action as React.ReactNode)
        ) : null}
      </View>
      {compact && single ? <Pill action={single} height={28} radius={radius.capsule(28)} {...pillColors.tint} /> : null}
      {closeNode}
    </>
  );

  const rowStyle = [styles.row, compact ? styles.rowCompact : null, { padding: pad }];

  return (
    <Animated.View
      style={[
        animating && box.h > 0
          ? { height: size.interpolate({ inputRange: [0, 1], outputRange: [0, box.h] }), overflow: 'hidden' }
          : null,
        style,
      ]}
    >
      <Animated.View
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          { borderRadius: radius.scale(compact ? 14 : 16) },
          surface,
          {
            opacity: life,
            transform: [
              { translateY: life.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
              { scale: life.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          },
        ]}
      >
        {box.w > 0 && glow && icon !== false ? (
          <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient
                id={`glow${uid}`}
                cx={glowCenter}
                cy={glowCenter}
                fx={glowCenter}
                fy={glowCenter}
                r={Math.min(240, Math.max(120, box.w * 0.5))}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={glow.c} stopOpacity={glow.a} />
                <Stop offset="0.35" stopColor={glow.c} stopOpacity={glow.a * 0.4} />
                <Stop offset="1" stopColor={glow.c} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={box.w} height={box.h} fill={`url(#glow${uid})`} />
          </Svg>
        ) : null}

        {duration ? (
          <Pressable
            accessible={false}
            focusable={false}
            onPressIn={() => hold('press', true)}
            onPressOut={() => hold('press', false)}
            onHoverIn={() => hold('hover', true)}
            onHoverOut={() => hold('hover', false)}
            style={rowStyle}
          >
            {row}
          </Pressable>
        ) : (
          <View style={rowStyle}>{row}</View>
        )}

        {duration && box.w > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.timer,
              {
                backgroundColor: solid ? alpha(fg, 0.7) : tone,
                transform: [
                  { translateX: drain.interpolate({ inputRange: [0, 1], outputRange: [-box.w / 2, 0] }) },
                  { scaleX: drain.interpolate({ inputRange: [0, 1], outputRange: [0.0001, 1] }) },
                ],
              },
            ]}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

function Pill({
  action,
  height,
  radius,
  bg,
  fg,
}: {
  action: AlertAction;
  height: number;
  radius: number;
  bg: string;
  fg: string;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      hitSlop={(44 - height) / 2}
      style={({ pressed }) => [
        styles.pill,
        { minHeight: height, borderRadius: radius, backgroundColor: bg, paddingHorizontal: height >= 32 ? 14 : 12 },
        pressed ? { opacity: 0.75, transform: [{ scale: 0.97 }] } : null,
      ]}
    >
      <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.pillText, ff, { color: fg }]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

/** Tinted disc with a faint outer ring; the ring ripples out once when `ripple` runs 0 → 1. */
function Halo({
  size,
  corner,
  disc,
  ring,
  ripple,
  children,
}: {
  size: number;
  corner: (h: number) => number;
  disc: string;
  ring: string;
  ripple: Animated.Value;
  children: React.ReactNode;
}) {
  const outer = size + 8;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: outer,
          height: outer,
          borderRadius: corner(outer),
          backgroundColor: ring,
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: corner(size),
          borderWidth: 1.5,
          borderColor: disc,
          opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: corner(size),
          backgroundColor: disc,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const OUTLINE_LEN = 64;

function iconPaths(variant: AlertVariant) {
  const outline =
    variant === 'warning'
      ? 'M10.3 4.2a2 2 0 0 1 3.4 0l7.1 12.6a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3z'
      : // Circle r=9 drawn from 12 o'clock so it sweeps in clockwise.
        'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18';
  const mark =
    variant === 'success'
      ? 'M8 12.4l2.7 2.7L16.2 9.4'
      : variant === 'danger'
        ? 'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6'
        : variant === 'warning'
          ? 'M12 9.5v4'
          : 'M12 11v5';
  const dot = variant === 'warning' ? { cx: 12, cy: 16.6 } : variant === 'info' ? { cx: 12, cy: 7.9 } : null;
  return { outline, mark, dot };
}

/** Outline draws itself (JS-driven dash offset), then the glyph springs in (native scale). */
function LivingIcon({
  variant,
  color,
  size,
  draw,
  glyph,
}: {
  variant: AlertVariant;
  color: string;
  size: number;
  draw: Animated.Value;
  glyph: Animated.Value;
}) {
  const { outline, mark, dot } = iconPaths(variant);
  const s = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <AnimatedPath
          d={outline}
          {...s}
          strokeDasharray={[OUTLINE_LEN, OUTLINE_LEN]}
          strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [OUTLINE_LEN, 0] })}
        />
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: glyph.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
            transform: [
              { translateY: glyph.interpolate({ inputRange: [0, 1], outputRange: [-3, 0] }) },
              { scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={mark} {...s} />
          {dot ? <Circle cx={dot.cx} cy={dot.cy} r={1.25} fill={color} /> : null}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** The four built-in icons, static, drawn with react-native-svg. */
export function AlertIcon({ variant, color, size = 20 }: { variant: AlertVariant; color: string; size?: number }) {
  const { outline, mark, dot } = iconPaths(variant);
  const s = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={outline} {...s} />
      <Path d={mark} {...s} />
      {dot ? <Circle cx={dot.cx} cy={dot.cy} r={1.25} fill={color} /> : null}
    </Svg>
  );
}

function isAction(a: unknown): a is AlertAction {
  return !!a && typeof a === 'object' && 'label' in a && 'onPress' in a;
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function parseHex(hex: string): [number, number, number] | null {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  if (!/^#[0-9a-fA-F]{6}/.test(full)) return null;
  const n = parseInt(full.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend `a` toward `b` by t (0–1). Used to deepen tone text so it reads on light surfaces. */
function mix(a: string, b: string, t: number) {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowCompact: { alignItems: 'center', gap: 10 },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '400', lineHeight: 21, letterSpacing: -0.1 },
  desc: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '400', lineHeight: 18 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  timer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
});
