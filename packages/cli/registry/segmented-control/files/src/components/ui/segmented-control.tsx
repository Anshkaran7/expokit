import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type SegmentedControlVariant = 'pill' | 'underline' | 'outline';
export type SegmentedControlSize = 'sm' | 'md' | 'lg';

export interface SegmentOption {
  value: string;
  label?: string;
  /** Icon node, or a function that receives the current text colour. */
  icon?: React.ReactNode | ((state: { active: boolean; color: string }) => React.ReactNode);
  accessibilityLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  /** Segments — plain strings or `{ value, label, icon }` objects. */
  options: (string | SegmentOption)[];
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled (default: first segment). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: SegmentedControlVariant;
  size?: SegmentedControlSize;
  /** Equal-width segments that fill the row (default) or segments sized to their content. */
  fullWidth?: boolean;
  /** Indicator colour. Pill uses a raised surface unless an accent is given. */
  accent?: string;
  disabled?: boolean;
  /** Selection tick on change (default true). */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const SIZES: Record<SegmentedControlSize, { h: number; font: number; px: number; icon: number }> = {
  sm: { h: 32, font: 13, px: 12, icon: 14 },
  md: { h: 40, font: 14.5, px: 16, icon: 16 },
  lg: { h: 48, font: 16, px: 20, icon: 18 },
};

const INSET = 3;
// Liquid move: the edge in the direction of travel leads, the other one trails behind.
const LEAD = motion.snappy;
const TRAIL = { damping: 24, stiffness: 150, mass: 0.9 };

/**
 * Segmented control with a liquid indicator: its leading edge springs ahead and the trailing
 * edge catches up, so it stretches as it travels. Measured with onLayout so it fits any label.
 * Drag the selected segment to scrub across the others. Pill (iOS), underline (tabs) and outline
 * looks, with optional icons.
 */
export function SegmentedControl({
  options,
  value,
  defaultValue,
  onValueChange,
  variant = 'pill',
  size = 'md',
  fullWidth = true,
  accent,
  disabled,
  haptics = true,
  accessibilityLabel,
  style,
}: SegmentedControlProps) {
  const { colors, radius, dark } = useKit();
  const gid = 'sc' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduce = useReduceMotion();
  const items: SegmentOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value);
  const selected = value ?? inner;
  const index = Math.max(0, items.findIndex((o) => o.value === selected));
  const s = SIZES[size];

  const layouts = useRef<{ x: number; width: number }[]>([]);
  const [measured, setMeasured] = useState(0);
  // Left and right edges of the indicator, animated separately (JS driver, they set left/width).
  const lx = useRef(new Animated.Value(0)).current;
  const rx = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const shown = useRef(-1);

  useEffect(() => {
    const l = layouts.current[index];
    if (!l) return;
    // Reduce Motion: the indicator jumps to the new segment instead of sliding.
    if (!placed.current || reduce) {
      lx.setValue(l.x);
      rx.setValue(l.x + l.width);
      placed.current = true;
      shown.current = index;
      return;
    }
    const right = index >= shown.current;
    shown.current = index;
    Animated.parallel([
      Animated.spring(lx, { toValue: l.x, useNativeDriver: false, ...(right ? TRAIL : LEAD) }),
      Animated.spring(rx, { toValue: l.x + l.width, useNativeDriver: false, ...(right ? LEAD : TRAIL) }),
    ]).start();
  }, [index, measured, reduce, lx, rx]);

  const onSegmentLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x: lx, width } = e.nativeEvent.layout;
    const prev = layouts.current[i];
    if (prev && prev.x === lx && prev.width === width) return;
    layouts.current[i] = { x: lx, width };
    setMeasured((n) => n + 1);
  };

  const select = (next: string) => {
    if (next === selected) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  // Scrub: a horizontal drag that starts on the selected segment slides the selection along.
  // Drags that start elsewhere are left alone, so the control still scrolls inside a ScrollView.
  const live = useRef({ items, select, disabled });
  live.current = { items, select, disabled };
  const touch = useRef({ originX: 0, onActive: false });
  const onSegmentPressIn = (i: number, active: boolean) => (e: GestureResponderEvent) => {
    const l = layouts.current[i];
    touch.current = { originX: e.nativeEvent.pageX - ((l?.x ?? 0) + e.nativeEvent.locationX), onActive: active };
  };
  const scrub = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !live.current.disabled && touch.current.onActive && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => (touch.current.onActive = false),
        onPanResponderTerminate: () => (touch.current.onActive = false),
        onPanResponderMove: (_, g) => {
          const at = g.moveX - touch.current.originX;
          const { items: opts, select: pick } = live.current;
          let best = -1;
          let dist = Infinity;
          layouts.current.forEach((l, i) => {
            if (!l || opts[i]?.disabled) return;
            const d = at < l.x ? l.x - at : at > l.x + l.width ? at - l.x - l.width : 0;
            if (d < dist) [best, dist] = [i, d];
          });
          if (best >= 0) pick(opts[best].value);
        },
      }),
    []
  );

  const tint = accent ?? colors.accent;
  const pill = variant === 'pill';
  const underline = variant === 'underline';
  const outline = variant === 'outline';
  const segRadius = Math.min(radius.md, (s.h - INSET * 2) / 2);

  const activeFg = pill ? (accent ? readableOn(accent) : colors.foreground) : underline ? colors.foreground : tint;
  const idleFg = colors.mutedForeground;

  const indicator: ViewStyle = pill
    ? {
        top: INSET,
        bottom: INSET,
        borderRadius: segRadius,
        backgroundColor: accent ?? (dark ? colors.input : colors.background),
        borderWidth: accent ? 0 : StyleSheet.hairlineWidth,
        borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
      }
    : underline
      ? { bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: tint }
      : {
          top: INSET,
          bottom: INSET,
          borderRadius: segRadius,
          backgroundColor: alpha(tint, 0.12),
          borderWidth: 1.5,
          borderColor: alpha(tint, 0.55),
        };

  // onLayout x includes the track border; absolute children start inside it.
  const trackBorder = pill ? StyleSheet.hairlineWidth : outline ? 1 : 0;

  return (
    <View
      {...scrub.panHandlers}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { opacity: disabled ? 0.5 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        pill && {
          padding: INSET,
          borderRadius: segRadius + INSET,
          backgroundColor: colors.muted,
          borderWidth: trackBorder,
          borderColor: colors.border,
        },
        outline && { padding: INSET, borderRadius: segRadius + INSET, borderWidth: 1, borderColor: colors.border },
        underline && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          indicator,
          pill && !accent && styles.shadow,
          {
            left: trackBorder ? Animated.add(lx, -trackBorder) : lx,
            width: Animated.subtract(rx, lx),
            opacity: layouts.current[index] ? 1 : 0,
          },
        ]}
      >
        {pill && accent ? (
          // A soft sheen on the filled accent pill.
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.26} />
                <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={segRadius} fill={`url(#${gid})`} />
          </Svg>
        ) : null}
      </Animated.View>
      {items.map((o, i) => (
        <Segment
          key={o.value}
          option={o}
          active={i === index}
          onPress={() => select(o.value)}
          onPressIn={onSegmentPressIn(i, i === index)}
          onLayout={onSegmentLayout(i)}
          fullWidth={fullWidth}
          size={s}
          height={underline ? s.h : s.h - INSET * 2}
          activeFg={activeFg}
          idleFg={idleFg}
          disabled={disabled || o.disabled}
          reduce={reduce}
        />
      ))}
    </View>
  );
}

interface SegmentProps {
  option: SegmentOption;
  active: boolean;
  onPress: () => void;
  onPressIn: (e: GestureResponderEvent) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  fullWidth: boolean;
  size: { h: number; font: number; px: number; icon: number };
  height: number;
  activeFg: string;
  idleFg: string;
  disabled?: boolean;
  reduce: boolean;
}

function Segment({ option, active, onPress, onPressIn, onLayout, fullWidth, size, height, activeFg, idleFg, disabled, reduce }: SegmentProps) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  // a: text colour (JS). press: content squish, pop: little bounce on selection (native, same view).
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);

  useEffect(() => {
    Animated.timing(a, { toValue: active ? 1 : 0, duration: reduce ? 150 : 180, useNativeDriver: false }).start();
    // Reduce Motion: no selection pop and no press squish; the label colour still fades.
    if (active && mounted.current && !reduce) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    }
    mounted.current = true;
  }, [active, reduce, a, pop]);

  const pressTo = (to: number) => {
    if (reduce) return press.setValue(1);
    Animated.spring(press, { toValue: to, useNativeDriver: true, ...(to < 1 ? motion.snappy : motion.bouncy) }).start();
  };

  const color = a.interpolate({ inputRange: [0, 1], outputRange: [idleFg, activeFg] });
  const icon =
    typeof option.icon === 'function' ? option.icon({ active, color: active ? activeFg : idleFg }) : option.icon;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={option.accessibilityLabel ?? option.label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={(e) => {
        onPressIn(e);
        pressTo(0.94);
      }}
      onPressOut={() => pressTo(1)}
      onLayout={onLayout}
      hitSlop={height < 44 ? { top: (44 - height) / 2, bottom: (44 - height) / 2 } : undefined}
      style={[styles.segment, fullWidth && styles.flex, { minHeight: height, paddingHorizontal: size.px }]}
    >
      <Animated.View style={[styles.content, { transform: [{ scale: Animated.multiply(press, pop) }] }]}>
        {icon ? <View style={{ minWidth: size.icon, alignItems: 'center' }}>{icon}</View> : null}
        {option.label ? (
          <Animated.Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.label, ff, { fontSize: size.font, color }]}>
            {option.label}
          </Animated.Text>
        ) : null}
      </Animated.View>
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
  track: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  indicator: { position: 'absolute' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segment: { alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: '400', letterSpacing: -0.1, userSelect: 'none' },
});
