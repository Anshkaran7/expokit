import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { alpha, motion, useKit } from '@/lib/kit';

export type PaginationDotsVariant = 'dots' | 'scale' | 'line' | 'numbers';
export type PaginationDotsSize = 'sm' | 'md' | 'lg';

/** A page position: 0 = first page, 1.5 = halfway between the second and third. */
export type PaginationProgress = Animated.Value | Animated.AnimatedInterpolation<number> | number;

export interface PaginationDotsProps {
  /** Number of pages. */
  count: number;
  /** Active page. Changes spring the indicator across. Ignored when `progress` is an Animated value. */
  index?: number;
  /**
   * Live page position, e.g. `Animated.divide(scrollX, pageWidth)`, so the indicator follows the
   * finger while swiping. Drive it with `useNativeDriver: false` for the 'dots' variant (it
   * animates widths); 'scale', 'line' and 'numbers' work with either driver.
   */
  progress?: PaginationProgress;
  /** 'dots' active dot stretches into a pill · 'scale' active dot grows · 'line' progress segments · 'numbers' "2 / 5". */
  variant?: PaginationDotsVariant;
  size?: PaginationDotsSize;
  /** Makes each dot a button (with a 44pt hit area) that reports its page. */
  onPress?: (index: number) => void;
  /** Active colour (default: theme accent). */
  accent?: string;
  /** Inactive dot colour (default: a soft tint of the foreground). */
  inactiveColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<PaginationDotsSize, { dot: number; gap: number; pill: number; line: number; font: number }> = {
  sm: { dot: 6, gap: 6, pill: 18, line: 3, font: 12 },
  md: { dot: 8, gap: 8, pill: 24, line: 4, font: 13 },
  lg: { dot: 10, gap: 10, pill: 32, line: 5, font: 15 },
};

/**
 * Page indicator for carousels and onboarding. Feed it a live `progress` value and it tracks the
 * swipe continuously: the active dot stretches into a pill that hands its width to the next dot,
 * scales up, fills a segmented line or rolls the page number.
 */
export function PaginationDots({
  count,
  index = 0,
  progress,
  variant = 'dots',
  size = 'md',
  onPress,
  accent,
  inactiveColor,
  accessibilityLabel = 'Page',
  style,
}: PaginationDotsProps) {
  const { colors, radius } = useKit();
  const tint = accent ?? colors.accent;
  const idle = inactiveColor ?? alpha(colors.foreground, 0.18);
  const s = SIZES[size];
  const n = Math.max(1, count);

  // A spring-driven position when we aren't handed an Animated value.
  const external = typeof progress === 'object' ? progress : null;
  const target = typeof progress === 'number' ? progress : index;
  const internal = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    if (external) return;
    if (typeof progress === 'number') internal.setValue(target);
    else Animated.spring(internal, { toValue: target, useNativeDriver: false, ...motion.snappy }).start();
  }, [external, progress, target, internal]);
  const pos = external ?? internal;

  // Rounded page for the 'numbers' label and accessibility.
  const [page, setPage] = useState(Math.round(target));
  useEffect(() => {
    if (!external) {
      setPage(Math.round(target));
      return;
    }
    const id = external.addListener(({ value }: { value: number }) => setPage(Math.min(n - 1, Math.max(0, Math.round(value)))));
    return () => external.removeListener(id);
  }, [external, target, n]);

  const pages = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const around = (i: number, outside: number, inside: number) =>
    pos.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [outside, inside, outside], extrapolate: 'clamp' });

  const onAction = (e: AccessibilityActionEvent) => {
    if (!onPress) return;
    if (e.nativeEvent.actionName === 'increment' && page < n - 1) onPress(page + 1);
    if (e.nativeEvent.actionName === 'decrement' && page > 0) onPress(page - 1);
  };

  const a11y = {
    accessible: true,
    accessibilityRole: onPress ? ('adjustable' as const) : ('text' as const),
    accessibilityLabel,
    accessibilityValue: { min: 1, max: n, now: page + 1, text: `${page + 1} of ${n}` },
    accessibilityActions: onPress ? [{ name: 'increment' as const }, { name: 'decrement' as const }] : undefined,
    onAccessibilityAction: onAction,
  };

  const hit = (i: number, child: React.ReactNode, extra?: ViewStyle) =>
    onPress ? (
      <Pressable
        key={i}
        onPress={() => onPress(i)}
        hitSlop={{ top: 18, bottom: 18, left: s.gap / 2, right: s.gap / 2 }}
        accessibilityLabel={`Go to page ${i + 1}`}
        style={extra}
      >
        {child}
      </Pressable>
    ) : (
      <View key={i} style={extra}>
        {child}
      </View>
    );

  if (variant === 'numbers') {
    return (
      <View {...a11y} style={[styles.numbers, { borderRadius: radius.capsule(Math.ceil(s.font * 1.4) + 10), backgroundColor: alpha(colors.foreground, 0.06) }, style]}>
        <RollingNumber value={page + 1} color={tint} size={s.font} />
        <Text style={[styles.numText, { fontSize: s.font, color: colors.mutedForeground }]}> / {n}</Text>
      </View>
    );
  }

  if (variant === 'line') return <LineSegments {...{ pages, pos, s, tint, idle, a11y, hit, style }} />;

  return (
    <View {...a11y} style={[styles.row, { gap: s.gap, height: s.dot * (variant === 'scale' ? 1.8 : 1) }, style]}>
      {pages.map((i) =>
        variant === 'scale'
          ? hit(
              i,
              <Animated.View
                style={{
                  width: s.dot,
                  height: s.dot,
                  borderRadius: s.dot,
                  backgroundColor: tint,
                  opacity: around(i, 0.28, 1),
                  transform: [{ scale: around(i, 1, 1.55) }],
                }}
              />
            )
          : hit(
              i,
              // Width (JS driver) on the outer view, the accent fill fades on an inner view.
              <Animated.View
                style={{ width: around(i, s.dot, s.pill), height: s.dot, borderRadius: s.dot, backgroundColor: idle, overflow: 'hidden' }}
              >
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: around(i, 0, 1) }]} />
              </Animated.View>
            )
      )}
    </View>
  );
}

interface LineProps {
  pages: number[];
  pos: Animated.Value | Animated.AnimatedInterpolation<number>;
  s: (typeof SIZES)[PaginationDotsSize];
  tint: string;
  idle: string;
  a11y: object;
  hit: (i: number, child: React.ReactNode, extra?: ViewStyle) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Segments fill left-to-right as the position moves into each page. */
function LineSegments({ pages, pos, s, tint, idle, a11y, hit, style }: LineProps) {
  const [w, setW] = useState(0);
  const n = pages.length;
  const segW = w ? (w - s.gap * (n - 1)) / n : 0;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View {...a11y} onLayout={onLayout} style={[styles.line, { gap: s.gap }, style]}>
      {pages.map((i) =>
        hit(
          i,
          <View style={{ height: s.line, borderRadius: s.line, backgroundColor: idle, overflow: 'hidden' }}>
            {segW ? (
              <Animated.View
                style={{
                  width: segW,
                  height: s.line,
                  borderRadius: s.line,
                  backgroundColor: tint,
                  transform: [
                    {
                      translateX: pos.interpolate({ inputRange: [i - 1, i], outputRange: [-segW, 0], extrapolate: 'clamp' }),
                    },
                  ],
                }}
              />
            ) : null}
          </View>,
          styles.segment
        )
      )}
    </View>
  );
}

function RollingNumber({ value, color, size }: { value: number; color: string; size: number }) {
  const v = useRef(new Animated.Value(1)).current;
  const last = useRef(value);
  const dir = value >= last.current ? 1 : -1;
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [value, v]);
  return (
    <Animated.Text
      style={[
        styles.numText,
        {
          fontSize: size,
          color,
          fontWeight: '400',
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dir * size * 0.7, 0] }) }],
        },
      ]}
    >
      {value}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  segment: { flex: 1, justifyContent: 'center' },
  numbers: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  numText: { fontVariant: ['tabular-nums'], fontWeight: '400' },
});
