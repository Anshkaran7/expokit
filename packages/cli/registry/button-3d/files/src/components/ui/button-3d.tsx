import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { isTextNode, motion, readableOn, useKit } from '@/lib/kit';

export type Button3DAppearance = 'auto' | 'light' | 'dark' | 'glass';
export type Button3DSize = 'sm' | 'md' | 'lg';
export type Button3DShape = 'rounded' | 'pill' | 'circle';

export interface Button3DProps {
  /** Label, a single glyph (circle buttons) or custom content. */
  children?: React.ReactNode;
  onPress?: () => void;
  /**
   * Keycap material: `light` (white), `dark` (graphite), `glass` (frosted, for photos) or `auto`
   * — light on dark screens, dark on light ones (default).
   */
  appearance?: Button3DAppearance;
  /** A custom face colour instead of a material, e.g. your brand colour. */
  color?: string;
  size?: Button3DSize;
  /** `rounded` keycap, `pill` or `circle`. */
  shape?: Button3DShape;
  /** Edge height in points (default by size: 4 / 5 / 6). */
  depth?: number;
  /** Shown before the label. */
  icon?: React.ReactNode;
  /** Stretch to the parent's width. */
  block?: boolean;
  /** Swap the label for a spinner and ignore taps. */
  loading?: boolean;
  disabled?: boolean;
  /** Light haptic tap on press (default true). */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const SIZES = {
  sm: { h: 36, px: 14, font: 13, depth: 4, gap: 6 },
  md: { h: 46, px: 18, font: 15, depth: 5, gap: 8 },
  lg: { h: 56, px: 24, font: 17, depth: 6, gap: 8 },
} as const;

/** Darken (amount < 0) or lighten (amount > 0) a #rrggbb colour. */
function shade(hex: string, amount: number) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(full.slice(1, 7), 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('');
}

type Material = {
  face: [string, string];
  edge: [string, string];
  ink: string;
  rim: string;
  outline: string;
  shadow: number;
};

const MATERIALS: Record<'light' | 'dark' | 'glass', Material> = {
  light: { face: ['#ffffff', '#efeff2'], edge: ['#cfd0d6', '#b4b6bd'], ink: '#18181b', rim: 'rgba(255,255,255,0.9)', outline: 'rgba(0,0,0,0.07)', shadow: 0.28 },
  dark: { face: ['#3b3b41', '#2a2a2f'], edge: ['#151517', '#0b0b0c'], ink: '#ffffff', rim: 'rgba(255,255,255,0.14)', outline: 'rgba(0,0,0,0.5)', shadow: 0.45 },
  glass: {
    face: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.18)'],
    edge: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)'],
    ink: '#ffffff',
    rim: 'rgba(255,255,255,0.55)',
    outline: 'rgba(255,255,255,0.35)',
    shadow: 0.18,
  },
};

/** A material for a custom colour, built the same way the keycaps are. */
const tinted = (hex: string): Material => ({
  face: [shade(hex, 0.1), hex],
  edge: [shade(hex, -0.3), shade(hex, -0.44)],
  ink: readableOn(hex),
  rim: 'rgba(255,255,255,0.35)',
  outline: 'rgba(0,0,0,0.12)',
  shadow: 0.35,
});

/**
 * A physical, keycap-style button: a softly lit face on a darker edge that sinks in when pressed
 * — with a light haptic — and springs back. Light, dark or frosted-glass keycaps, or any colour.
 */
export function Button3D({
  children,
  onPress,
  appearance = 'auto',
  color,
  size = 'md',
  shape = 'rounded',
  depth: depthProp,
  icon,
  block,
  loading,
  disabled,
  haptics = true,
  accessibilityLabel,
  style,
}: Button3DProps) {
  const { dark, font } = useKit();
  const reduce = useReduceMotion();
  const ff = font.family ? { fontFamily: font.family } : null;
  const s = SIZES[size];
  const depth = depthProp ?? s.depth;
  const kind = appearance === 'auto' ? (dark ? 'light' : 'dark') : appearance;
  const m = color ? tinted(color) : MATERIALS[kind];
  const corner = shape === 'rounded' ? Math.round(s.h * 0.3) : s.h / 2;
  const round = shape === 'circle';
  const gid = `b3d-${color ? color.replace('#', '') : kind}`;

  const [press] = useState(() => new Animated.Value(0));
  const to = (v: number) =>
    reduce
      ? Animated.timing(press, { toValue: v, duration: 120, useNativeDriver: true }).start()
      : Animated.spring(press, { toValue: v, ...(v ? motion.snappy : motion.bouncy), useNativeDriver: true }).start();

  const label = loading ? (
    <ActivityIndicator color={m.ink} size="small" />
  ) : isTextNode(children) ? (
    // No numberOfLines: on a narrow fixed-width key ("esc", "Q") the label may use the padding
    // instead of being cut to an ellipsis.
    <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: m.ink, fontSize: round ? s.font + 4 : s.font, fontWeight: '600', letterSpacing: 0.1, flexShrink: 0, textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' }, ff]}>
      {children}
    </Text>
  ) : (
    children
  );

  const gradient = (id: string, [a, b]: [string, string]) => (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </LinearGradient>
      </Defs>
      <Rect width="1" height="1" fill={`url(#${id})`} />
    </Svg>
  );

  return (
    <Pressable
      onPress={() => {
        // Android has no touch delay inside scroll views, so the tap is only felt once it's a press.
        if (haptics && Platform.OS === 'android') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onPressIn={() => {
        to(1);
        // iOS delays touches in scroll views, so a key-down tap here never fires for a scroll.
        if (haptics && Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => to(0)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      hitSlop={s.h < 44 ? { top: (44 - s.h) / 2, bottom: (44 - s.h) / 2 } : undefined}
      style={[{ alignSelf: block ? 'stretch' : undefined, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <View style={{ paddingBottom: depth, width: round ? s.h : undefined }}>
        {/* Contact shadow on the surface: tightens and fades as the key goes down. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              top: depth,
              borderRadius: corner,
              backgroundColor: m.edge[1],
              // boxShadow: the same contact shadow on iOS, Android and web.
              boxShadow: `0px 5px 16px rgba(0,0,0,${m.shadow})`,
              opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
            },
          ]}
        />
        {/* The edge: the keycap's darker side. */}
        <View style={[styles.fill, { top: depth, borderRadius: corner, overflow: 'hidden' }]}>{gradient(`${gid}-e`, m.edge)}</View>
        <Animated.View
          style={[
            styles.face,
            {
              // A circle keeps its fixed size; other keys may grow taller for a large text size.
              minHeight: s.h,
              height: round ? s.h : undefined,
              paddingHorizontal: round ? 0 : s.px,
              gap: s.gap,
              borderRadius: corner,
              // Reduce Motion: the key doesn't sink; only the contact shadow dims.
              transform: reduce ? [] : [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] }) }],
            },
          ]}
        >
          {gradient(`${gid}-f`, m.face)}
          {/* A bright rim along the top edge and a hairline outline sell the bevel. */}
          <View pointerEvents="none" style={[styles.fill, { borderRadius: corner, borderTopWidth: 1, borderTopColor: m.rim }]} />
          <View pointerEvents="none" style={[styles.fill, { borderRadius: corner, borderWidth: StyleSheet.hairlineWidth, borderColor: m.outline }]} />
          {loading ? null : icon}
          {label}
        </Animated.View>
      </View>
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
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
