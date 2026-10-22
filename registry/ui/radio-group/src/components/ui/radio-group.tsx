import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const CHECK_LEN = 24;

export type RadioGroupVariant = 'default' | 'card' | 'segmented-list';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  /** Leading icon or emoji (card and segmented-list variants). */
  icon?: React.ReactNode;
  /** Trailing text, e.g. a price ("₹499/mo"). */
  hint?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: RadioGroupVariant;
  direction?: 'vertical' | 'horizontal';
  /** Selected colour (default: theme accent). */
  accent?: string;
  disabled?: boolean;
  /** Selection tick on change (default true). */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Single-choice list. The dot springs in with a ripple, cards light up their border and pop a
 * check badge that draws itself, and the grouped list draws a tick next to the chosen row.
 */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  variant = 'default',
  direction = 'vertical',
  accent,
  disabled,
  haptics = true,
  accessibilityLabel,
  style,
}: RadioGroupProps) {
  const { colors, radius } = useKit();
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const [inner, setInner] = useState(defaultValue);
  const selected = value ?? inner;
  const horizontal = direction === 'horizontal';

  const select = (next: string) => {
    if (next === selected) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const list = variant === 'segmented-list';

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        horizontal ? styles.horizontal : styles.vertical,
        variant === 'default' && { gap: horizontal ? 20 : 14 },
        variant === 'card' && { gap: 10 },
        list && [styles.list, { borderRadius: radius.lg, borderColor: colors.border, backgroundColor: colors.card }],
        style,
      ]}
    >
      {options.map((o, i) => (
        <RadioItem
          key={o.value}
          option={o}
          active={o.value === selected}
          onPress={() => select(o.value)}
          variant={variant}
          horizontal={horizontal}
          first={i === 0}
          tint={tint}
          disabled={disabled || o.disabled}
          reduce={reduce}
        />
      ))}
    </View>
  );
}

interface RadioItemProps {
  option: RadioOption;
  active: boolean;
  onPress: () => void;
  variant: RadioGroupVariant;
  horizontal: boolean;
  first: boolean;
  tint: string;
  disabled?: boolean;
  reduce: boolean;
}

function RadioItem({ option, active, onPress, variant, horizontal, first, tint, disabled, reduce }: RadioItemProps) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  // p: colours + svg (JS driver). dot: scale/opacity pops (native). press: press feedback (native).
  // ripple: a ring that expands and fades when the item gets selected, 0 → 1 (native, rests at 1).
  const p = useRef(new Animated.Value(active ? 1 : 0)).current;
  const dot = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(1)).current;
  const was = useRef(active);

  useEffect(() => {
    const picked = active && !was.current;
    was.current = active;
    // Reduce Motion: colours and the check still fade in, the dot appears at once, no ripple.
    if (reduce) {
      Animated.timing(p, { toValue: active ? 1 : 0, duration: 150, useNativeDriver: false }).start();
      dot.setValue(active ? 1 : 0);
      return;
    }
    Animated.spring(p, { toValue: active ? 1 : 0, useNativeDriver: false, ...motion.snappy }).start();
    Animated.spring(dot, { toValue: active ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
    if (picked) {
      ripple.setValue(0);
      Animated.timing(ripple, { toValue: 1, duration: 560, useNativeDriver: true }).start();
    }
  }, [active, reduce, p, dot, ripple]);

  const rippleStyle = {
    backgroundColor: alpha(tint, 0.35),
    opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
  };

  const pressTo = (to: number) => {
    if (reduce) return press.setValue(1);
    Animated.spring(press, { toValue: to, useNativeDriver: true, ...(to < 1 ? motion.snappy : motion.bouncy) }).start();
  };

  const fg = colors.foreground;
  const muted = colors.mutedForeground;
  const a11y = {
    accessibilityRole: 'radio' as const,
    accessibilityState: { checked: active, disabled: !!disabled },
    accessibilityLabel: option.label,
    accessibilityHint: option.description,
    disabled,
    onPress,
  };

  const text = (
    <View style={styles.text}>
      <Text numberOfLines={2} style={[styles.label, ff, { color: fg }]}>
        {option.label}
      </Text>
      {option.description ? <Text style={[styles.description, ff, { color: muted }]}>{option.description}</Text> : null}
    </View>
  );

  if (variant === 'card') {
    const lit = (from: string, to: string) => p.interpolate({ inputRange: [0, 1], outputRange: [from, to], extrapolate: 'clamp' });
    const hint = option.hint ? (
      <Animated.Text style={[styles.hint, ff, horizontal && styles.hintColumn, { color: lit(fg, tint) }]}>{option.hint}</Animated.Text>
    ) : null;
    return (
      <Animated.View style={[horizontal && styles.flex, { opacity: disabled ? 0.5 : 1, transform: [{ scale: press }] }]}>
        <Pressable {...a11y} onPressIn={() => pressTo(0.97)} onPressOut={() => pressTo(1)} style={styles.flexGrow}>
          {/* Focus ring: a soft accent glow just outside the selected card. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.glow, { borderRadius: radius.lg + 4, borderColor: alpha(tint, 0.2), opacity: p }]}
          />
          <Animated.View
            style={[
              styles.card,
              horizontal && styles.cardColumn,
              {
                borderRadius: radius.lg,
                borderColor: lit(colors.border, tint),
                backgroundColor: lit(colors.card, alpha(tint, 0.08)),
              },
            ]}
          >
            {option.icon ? (
              <Animated.View style={[styles.cardIcon, { borderRadius: radius.md, backgroundColor: lit(colors.muted, alpha(tint, 0.16)) }]}>
                {option.icon}
              </Animated.View>
            ) : null}
            <View style={[styles.text, horizontal && styles.cardTextColumn]}>
              <Text numberOfLines={2} style={[styles.label, ff, { color: fg }]}>
                {option.label}
              </Text>
              {option.description ? <Text style={[styles.description, ff, { color: muted }]}>{option.description}</Text> : null}
              {horizontal ? hint : null}
            </View>
            {horizontal ? null : hint}
            <View style={[styles.badgeSlot, horizontal && styles.badgeCorner]}>
              <View style={[styles.badgeRing, { borderColor: colors.input }]} />
              <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]} />
              <Animated.View
                style={[styles.badge, { backgroundColor: tint, opacity: dot, transform: [{ scale: dot }] }]}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <AnimatedPath
                    d={CHECK}
                    stroke={readableOn(tint)}
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray={CHECK_LEN}
                    strokeDashoffset={p.interpolate({ inputRange: [0.3, 1], outputRange: [CHECK_LEN, 0], extrapolate: 'clamp' }) as unknown as number}
                  />
                </Svg>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === 'segmented-list') {
    return (
      <Pressable
        {...a11y}
        style={({ pressed }) => [
          styles.listRow,
          horizontal ? styles.flex : null,
          !first && (horizontal ? styles.dividerLeft : styles.dividerTop),
          !first && { borderColor: colors.border },
          { backgroundColor: pressed ? colors.muted : 'transparent', opacity: disabled ? 0.5 : 1 },
        ]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: alpha(tint, 0.08), opacity: p }]} />
        {option.icon ? <View style={styles.listIcon}>{option.icon}</View> : null}
        <View style={styles.text}>
          <Animated.Text
            numberOfLines={1}
            style={[styles.label, ff, { color: p.interpolate({ inputRange: [0, 1], outputRange: [fg, tint], extrapolate: 'clamp' }) }]}
          >
            {option.label}
          </Animated.Text>
          {option.description ? <Text style={[styles.description, ff, { color: muted }]}>{option.description}</Text> : null}
        </View>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <AnimatedPath
            d={CHECK}
            stroke={tint}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={CHECK_LEN}
            strokeDashoffset={p.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0], extrapolate: 'clamp' }) as unknown as number}
          />
        </Svg>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...a11y}
      hitSlop={8}
      onPressIn={() => pressTo(0.86)}
      onPressOut={() => pressTo(1)}
      style={[styles.row, horizontal && styles.rowCompact, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Animated.View style={[styles.ringSlot, { transform: [{ scale: press }] }]}>
        <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]} />
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: p.interpolate({ inputRange: [0, 1], outputRange: [colors.input, tint], extrapolate: 'clamp' }),
              backgroundColor: p.interpolate({ inputRange: [0, 1], outputRange: [colors.card, tint], extrapolate: 'clamp' }),
            },
          ]}
        >
          <Animated.View style={[styles.dot, { backgroundColor: readableOn(tint), opacity: dot, transform: [{ scale: dot }] }]} />
        </Animated.View>
      </Animated.View>
      {horizontal && !option.description ? (
        <Text style={[styles.label, styles.shrink, ff, { color: fg }]}>{option.label}</Text>
      ) : (
        text
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
  vertical: { flexDirection: 'column' },
  horizontal: { flexDirection: 'row', flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 0 },
  flexGrow: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // A long label wraps at a large text size instead of running past the edge.
  rowCompact: { alignItems: 'center', flexShrink: 1 },
  shrink: { flexShrink: 1 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ringSlot: { alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute', width: 22, height: 22, borderRadius: 11 },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 15.5, fontWeight: '400', lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  hint: { fontSize: 16, fontWeight: '400', fontVariant: ['tabular-nums'] },
  hintColumn: { marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, padding: 16, flexGrow: 1 },
  glow: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 3 },
  cardColumn: { flexDirection: 'column', alignItems: 'flex-start', gap: 10, paddingTop: 14 },
  cardTextColumn: { flex: 0, alignSelf: 'stretch', paddingRight: 18 },
  cardIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  badgeSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  badgeCorner: { position: 'absolute', top: 12, right: 12 },
  badgeRing: { position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  badge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 16, paddingVertical: 12 },
  listIcon: { width: 24, alignItems: 'center' },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth },
  dividerLeft: { borderLeftWidth: StyleSheet.hairlineWidth },
});
