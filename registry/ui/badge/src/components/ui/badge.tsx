import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, isTextNode, motion, readableOn, type Colors, useKit } from '@/lib/kit';

export type BadgeIconName = 'bell' | 'message' | 'package' | 'cart' | 'heart';

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
  name?: BadgeIconName;
  /** Your own icon node — overrides `name`. */
  icon?: React.ReactNode;
  /** Tile size in points (default 48). */
  size?: number;
  /** Glyph colour (default: foreground). */
  color?: string;
  /** Tile background (default: muted). */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
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
  variant?: BadgeVariant;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Custom colour — overrides `tone`. */
  color?: string;
  /** Icon or emoji before the label. */
  icon?: React.ReactNode;
  /** 'pill' (default) or 'rounded' corners. */
  shape?: 'pill' | 'rounded';
  /** Pulse the leading dot (dot variant) — "live" states. */
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<BadgeSize, { h: number; px: number; font: number; dot: number; gap: number }> = {
  sm: { h: 20, px: 7, font: 11, dot: 6, gap: 4 },
  md: { h: 24, px: 9, font: 12.5, dot: 7, gap: 5 },
  lg: { h: 28, px: 11, font: 14, dot: 8, gap: 6 },
};

function toneColor(colors: Colors, tone: BadgeTone) {
  return { neutral: colors.mutedForeground, accent: colors.accent, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
}

/** Small status label: solid, soft, outline or dot — five tones, three sizes. */
export function Badge({
  children,
  variant = 'soft',
  tone = 'neutral',
  size = 'md',
  color,
  icon,
  shape = 'pill',
  pulse,
  style,
}: BadgeProps) {
  const { colors, radius, dark } = useKit();
  const s = SIZES[size];
  const c = color ?? toneColor(colors, tone);
  const neutral = !color && tone === 'neutral';
  const pulseV = useRef(new Animated.Value(0)).current;

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

  const label =
    isTextNode(children) ? (
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.label, { color: fg, fontSize: s.font }]}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          gap: s.gap,
          backgroundColor: bg,
          borderColor: border,
          borderRadius: shape === 'pill' ? radius.capsule(s.h) : radius.sm,
        },
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
          <View style={[styles.fill, { borderRadius: s.dot, backgroundColor: dotColor }]} />
        </View>
      ) : null}
      {icon}
      {label}
    </View>
  );
}

export interface NotificationBadgeProps {
  /** The number to show. 0 hides the badge (unless `showZero`). */
  count?: number;
  /** Above this, show "99+". */
  max?: number;
  /** Just a dot, no number. */
  dot?: boolean;
  showZero?: boolean;
  tone?: BadgeTone;
  color?: string;
  size?: 'sm' | 'md';
  /** What the badge sits on (icon, avatar, button). Omit to render the badge inline. */
  children?: React.ReactNode;
  /** Nudge the badge from the top-right corner: [x, y] in points. */
  offset?: [number, number];
  style?: StyleProp<ViewStyle>;
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
  const { colors } = useKit();
  const c = color ?? toneColor(colors, tone);
  const fg = !color && tone === 'accent' ? colors.accentForeground : readableOn(c);
  const visible = count > 0 || !!showZero;

  // Keep the last number on screen while it shrinks away.
  const [shown, setShown] = useState(count);
  const show = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);

  useEffect(() => {
    if (visible) setShown(count);
    Animated.spring(show, { toValue: visible ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
    if (visible && prev.current !== count && prev.current > 0) {
      pop.setValue(1.35);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 320, mass: 0.6 }).start();
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
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.count, { color: fg, fontSize: size === 'sm' ? 10 : 11.5 }]}>
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

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1 },
  label: { fontWeight: '400', letterSpacing: 0.1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  anchor: { alignSelf: 'flex-start' },
  bubble: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  count: { fontWeight: '400', fontVariant: ['tabular-nums'], includeFontPadding: false },
});
