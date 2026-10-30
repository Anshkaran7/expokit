import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const CHECK_LEN = 22;

export type ChipGroupVariant = 'solid' | 'outline' | 'soft';
export type ChipGroupSize = 'sm' | 'md' | 'lg';

export interface ChipOption {
  value: string;
  label?: string | undefined;
  /** Leading icon or emoji. */
  icon?: React.ReactNode | undefined;
  /** Small number after the label, e.g. result count. */
  count?: number | undefined;
  disabled?: boolean | undefined;
}

export interface ChipGroupProps {
  /** Chips — plain strings or `{ value, label, icon, count }` objects. */
  options: (string | ChipOption)[];
  /** Allow several chips at once. Single mode still reports an array (`[]` or `[value]`). */
  multiple?: boolean | undefined;
  /** Controlled selection. */
  value?: string[] | undefined;
  /** Initial selection when uncontrolled. */
  defaultValue?: string[] | undefined;
  onValueChange?: ((value: string[]) => void) | undefined;
  /** Single mode: tapping the selected chip clears it (default true). */
  deselectable?: boolean | undefined;
  variant?: ChipGroupVariant | undefined;
  size?: ChipGroupSize | undefined;
  /** One horizontally scrolling row instead of wrapping lines. */
  scrollable?: boolean | undefined;
  /** Morph a check in front of the label when selected (default true). */
  showCheck?: boolean | undefined;
  /** Selected colour (default: theme accent). */
  accent?: string | undefined;
  disabled?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  /** Padding at the ends of the scroll row, so chips line up with your screen gutter. */
  contentInset?: number | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const SIZES: Record<ChipGroupSize, { h: number; px: number; font: number; check: number }> = {
  sm: { h: 30, px: 12, font: 13, check: 14 },
  md: { h: 36, px: 14, font: 14.5, check: 16 },
  lg: { h: 42, px: 16, font: 15.5, check: 18 },
};

/**
 * Filter chips for single or multiple choice. Selecting one morphs a check mark in — the chip
 * widens smoothly to make room while its colours cross-fade.
 */
export function ChipGroup({
  options,
  multiple = false,
  value,
  defaultValue = [],
  onValueChange,
  deselectable = true,
  variant = 'solid',
  size = 'md',
  scrollable = false,
  showCheck = true,
  accent,
  disabled,
  accessibilityLabel,
  contentInset = 0,
  style,
}: ChipGroupProps) {
  const { colors } = useKit();
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const items: ChipOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const [inner, setInner] = useState<string[]>(defaultValue);
  const selected = value ?? inner;

  const toggle = (v: string) => {
    const has = selected.includes(v);
    let next: string[];
    if (multiple) next = has ? selected.filter((x) => x !== v) : [...selected, v];
    else if (has) {
      if (!deselectable) return;
      next = [];
    } else next = [v];
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const s = SIZES[size];
  const chips = items.map((o) => (
    <Chip
      key={o.value}
      option={o}
      active={selected.includes(o.value)}
      onPress={() => toggle(o.value)}
      variant={variant}
      size={s}
      tint={tint}
      showCheck={showCheck}
      multiple={multiple}
      disabled={disabled || o.disabled}
      reduce={reduce}
    />
  ));

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={accessibilityLabel}
        style={[{ flexGrow: 0, marginHorizontal: -contentInset }, style]}
        contentContainerStyle={[styles.row, { paddingHorizontal: contentInset, paddingVertical: 2 }]}
      >
        {chips}
      </ScrollView>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.row, styles.wrap, style]}>
      {chips}
    </View>
  );
}

interface ChipProps {
  option: ChipOption;
  active: boolean;
  onPress: () => void;
  variant: ChipGroupVariant;
  size: { h: number; px: number; font: number; check: number };
  tint: string;
  showCheck: boolean;
  multiple: boolean;
  disabled?: boolean | undefined;
  reduce: boolean;
}

function Chip({ option, active, onPress, variant, size, tint, showCheck, multiple, disabled, reduce }: ChipProps) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  // p: colours, check width + stroke (JS driver). press: squish (native, on the outer view).
  const [p] = useState(() => new Animated.Value(active ? 1 : 0));
  const [press] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Reduce Motion: the chip swaps state at once (no widening, no check draw).
    if (reduce) p.setValue(active ? 1 : 0);
    else Animated.spring(p, { toValue: active ? 1 : 0, useNativeDriver: false, ...motion.snappy }).start();
  }, [active, p, reduce]);

  const pressTo = (to: number) => {
    if (reduce) return;
    Animated.spring(press, { toValue: to, useNativeDriver: true, ...(to < 1 ? motion.snappy : motion.bouncy) }).start();
  };

  const look: Record<ChipGroupVariant, { bg: [string, string]; border: [string, string]; fg: [string, string] }> = {
    solid: {
      bg: [colors.muted, tint],
      border: [colors.muted, tint],
      fg: [colors.foreground, readableOn(tint)],
    },
    outline: {
      bg: [alpha(tint, 0), alpha(tint, 0.08)],
      border: [colors.border, tint],
      fg: [colors.foreground, tint],
    },
    soft: {
      bg: [alpha(colors.mutedForeground, 0.1), alpha(tint, 0.16)],
      border: [alpha(colors.mutedForeground, 0), alpha(tint, 0)],
      fg: [colors.foreground, tint],
    },
  };
  const l = look[variant];
  const range = { inputRange: [0, 1], extrapolate: 'clamp' as const };
  const checkBox = size.check + 4; // check + gap

  return (
    <Animated.View style={{ opacity: disabled ? 0.45 : 1, transform: [{ scale: press }] }}>
      <Pressable
        accessibilityRole={multiple ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: active, disabled: !!disabled }}
        accessibilityLabel={option.label}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => pressTo(0.94)}
        onPressOut={() => pressTo(1)}
        hitSlop={size.h < 44 ? { top: (44 - size.h) / 2, bottom: (44 - size.h) / 2 } : undefined}
      >
        <Animated.View
          style={[
            styles.chip,
            {
              minHeight: size.h,
              borderRadius: radius.capsule(size.h),
              paddingHorizontal: size.px - 1,
              backgroundColor: p.interpolate({ ...range, outputRange: l.bg }),
              borderColor: p.interpolate({ ...range, outputRange: l.border }),
            },
          ]}
        >
          {showCheck ? (
            <Animated.View
              style={[
                styles.checkWrap,
                {
                  width: p.interpolate({ ...range, outputRange: [0, checkBox], extrapolate: 'clamp' }),
                  marginLeft: p.interpolate({ ...range, outputRange: [0, -2], extrapolate: 'clamp' }),
                  opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1], extrapolate: 'clamp' }),
                },
              ]}
            >
              <Svg width={size.check} height={size.check} viewBox="0 0 24 24">
                <AnimatedPath
                  d={CHECK}
                  stroke={l.fg[1]}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={CHECK_LEN}
                  strokeDashoffset={p.interpolate({ inputRange: [0.2, 1], outputRange: [CHECK_LEN, 0], extrapolate: 'clamp' }) as unknown as number}
                />
              </Svg>
            </Animated.View>
          ) : null}
          {option.icon ? <View style={styles.icon}>{option.icon}</View> : null}
          {option.label ? (
            <Animated.Text
              numberOfLines={1}
              maxFontSizeMultiplier={FONT_CAP}
              style={[styles.label, ff, { fontSize: size.font, color: p.interpolate({ ...range, outputRange: l.fg }) }]}
            >
              {option.label}
            </Animated.Text>
          ) : null}
          {option.count !== undefined ? (
            <Animated.Text
              maxFontSizeMultiplier={FONT_CAP}
              style={[
                styles.count,
                ff,
                { fontSize: size.font - 1.5, color: p.interpolate({ ...range, outputRange: [colors.mutedForeground, l.fg[1]] }) },
              ]}
            >
              {option.count}
            </Animated.Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  checkWrap: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 6 },
  label: { fontWeight: '400', letterSpacing: -0.1, includeFontPadding: false, textAlignVertical: 'center' },
  count: { marginLeft: 6, fontWeight: '400', fontVariant: ['tabular-nums'], opacity: 0.85, includeFontPadding: false, textAlignVertical: 'center' },
});
