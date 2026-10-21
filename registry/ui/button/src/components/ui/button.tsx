import * as Haptics from 'expo-haptics';
import React, { useId, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { alpha, isTextNode, motion, readableOn, useKit } from '@/lib/kit';

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'soft'
  | 'destructive'
  | 'link'
  | 'gradient'
  | 'glow'
  | 'elevated';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and blocks presses. */
  loading?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Stretch to the parent's width. */
  block?: boolean;
  /** Fully rounded ends. */
  pill?: boolean;
  /**
   * Any colour. Recolours every tinted variant (accent, soft, outline, ghost, link, gradient,
   * glow, elevated); text on filled buttons picks black or white automatically.
   */
  color?: string;
  /** Second gradient stop for `variant="gradient"` (default: `color` shifted along the hue wheel). */
  gradientTo?: string;
  /** Light tap on press (default false — most buttons shouldn't buzz). */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const SIZES: Record<ButtonSize, { h: number; px: number; font: number; gap: number }> = {
  sm: { h: 36, px: 14, font: 14, gap: 6 },
  md: { h: 46, px: 18, font: 15.5, gap: 8 },
  lg: { h: 54, px: 22, font: 17, gap: 10 },
  icon: { h: 44, px: 0, font: 15, gap: 0 },
};

/** Rotates a #rrggbb colour around the hue wheel by `deg` and nudges its lightness by `dl` (0–1). */
function shift(hex: string, deg: number, dl = 0) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(full.slice(1, 7), 16);
  if (!hex.startsWith('#') || Number.isNaN(n)) return hex;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const L = Math.min(1, Math.max(0, l + dl));
  const c = (1 - Math.abs(2 * L - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** Midpoint of two #rrggbb colours (to pick readable text for a gradient). */
function mid(a: string, b: string) {
  const n = (h: string) => parseInt((h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h).slice(1, 7), 16);
  const [x, y] = [n(a), n(b)];
  if (!a.startsWith('#') || !b.startsWith('#') || Number.isNaN(x) || Number.isNaN(y)) return a;
  return '#' + [16, 8, 0].map((sh) => Math.round((((x >> sh) & 255) + ((y >> sh) & 255)) / 2).toString(16).padStart(2, '0')).join('');
}

/**
 * Pressable with spring feedback, 11 variants, 4 sizes, icons and a loading state. Pass any
 * `color` and every tinted variant — including the gradient and glow looks — follows it.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  left,
  right,
  block,
  pill,
  color,
  gradientTo,
  haptics = false,
  disabled,
  style,
  textStyle,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const gid = 'btn' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;
  const tint = color ?? colors.accent;
  const onTint = color ? readableOn(tint) : colors.accentForeground;
  const s = SIZES[size];
  const corner = pill || size === 'icon' ? radius.full : radius.md;
  // Only the opt-in gradient variant gets a second tone; everything else is one solid colour.
  const to = variant === 'gradient' ? gradientTo ?? shift(tint, 38, 0.04) : tint;

  const look: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    accent: { bg: tint, fg: onTint },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
    outline: { bg: 'transparent', fg: color ?? colors.foreground, border: color ? alpha(tint, 0.5) : colors.border },
    ghost: { bg: 'transparent', fg: color ?? colors.foreground },
    soft: { bg: alpha(tint, dark ? 0.2 : 0.14), fg: tint },
    destructive: { bg: colors.danger, fg: colors.dangerForeground },
    link: { bg: 'transparent', fg: tint },
    gradient: { bg: tint, fg: readableOn(mid(tint, to)) },
    glow: { bg: tint, fg: onTint },
    elevated: { bg: dark ? colors.popover : colors.card, fg: color ?? colors.foreground, border: alpha(colors.foreground, dark ? 0.1 : 0.06) },
  };
  const { bg, fg, border } = look[variant];
  const solid = bg !== 'transparent';
  const quiet = variant === 'ghost' || variant === 'outline' || variant === 'link';

  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();

  const label = isTextNode(children) ? (
    <Text
      numberOfLines={1}
      style={[styles.label, ff, { color: fg, fontSize: s.font }, variant === 'link' && styles.link, textStyle]}
    >
      {children}
    </Text>
  ) : (
    children
  );

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        block && styles.block,
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!isDisabled, busy: loading }}
        disabled={isDisabled}
        onPress={(e) => {
          if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.(e);
        }}
        onPressIn={(e) => {
          spring(0.96);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          spring(1);
          onPressOut?.(e);
        }}
        style={({ pressed }) => [
          styles.base,
          {
            height: s.h,
            width: size === 'icon' ? s.h : undefined,
            paddingHorizontal: variant === 'link' ? 0 : s.px,
            gap: s.gap,
            borderRadius: corner,
            backgroundColor: bg,
            borderColor: border ?? 'transparent',
            borderWidth: border ? StyleSheet.hairlineWidth * 2 : 0,
            opacity: isDisabled ? 0.5 : pressed && variant === 'link' ? 0.6 : 1,
          },
          pressed && quiet && variant !== 'link' && { backgroundColor: color ? alpha(tint, 0.1) : colors.muted },
          // Coloured glow under the button (iOS / web; Android shows plain elevation).
          variant === 'glow' && !isDisabled && [styles.glow, { shadowColor: tint }],
          variant === 'elevated' && styles.elevated,
        ]}
        {...props}
      >
        {({ pressed }) => (
          <>
            {variant === 'gradient' || variant === 'glow' ? (
              // Two-tone fill (gradient) or a faint white top sheen on the solid glow fill, drawn behind the content.
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: corner, overflow: 'hidden' }]}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                      {variant === 'gradient'
                        ? [
                            <Stop key="a" offset="0" stopColor={tint} />,
                            <Stop key="b" offset="1" stopColor={to} />,
                          ]
                        : [
                            <Stop key="a" offset="0" stopColor="#ffffff" stopOpacity={0.12} />,
                            <Stop key="b" offset="0.55" stopColor="#ffffff" stopOpacity={0} />,
                          ]}
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#${gid})`} />
                </Svg>
              </View>
            ) : null}
            {/* Press feedback on filled buttons: a light wash on dark fills, a shade on light ones. */}
            {solid && pressed && !quiet ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: corner, backgroundColor: readableOn(bg) === '#ffffff' ? alpha('#ffffff', 0.14) : alpha('#000000', 0.08) }]}
              />
            ) : null}
            {loading ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color={fg} />
                {size !== 'icon' && isTextNode(children) ? (
                  <Text style={[styles.label, ff, { color: fg, fontSize: s.font, opacity: 0.85 }]}>{children}</Text>
                ) : null}
              </View>
            ) : (
              <>
                {left}
                {label}
                {right}
              </>
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  block: { alignSelf: 'stretch' },
  label: { fontWeight: '400', letterSpacing: -0.1 },
  link: { textDecorationLine: 'underline' },
  glow: {
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
