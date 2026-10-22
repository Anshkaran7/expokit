import React, { forwardRef, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { FloatingInput, type FloatingInputProps } from '@/components/ui/floating-input';
import { alpha, motion, useKit } from '@/lib/kit';

export interface PasswordRequirement {
  /** Shown in the checklist, e.g. 'At least 8 characters'. */
  label: string;
  test: (password: string) => boolean;
}

/** A sensible default checklist: length, mixed case, a number, a symbol. */
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: '8+ characters', test: (v) => v.length >= 8 },
  { label: 'Upper & lower case', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /\d/.test(v) },
  { label: 'A symbol', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
];

export interface PasswordInputProps extends Omit<FloatingInputProps, 'secureTextEntry' | 'right'> {
  /** Show the 4-segment strength meter under the field. */
  strength?: boolean;
  /** Replace the built-in scorer (return 0–4). */
  score?: (password: string) => number;
  /** Checklist under the field; each row ticks itself off when met. `true` uses DEFAULT_PASSWORD_REQUIREMENTS. */
  requirements?: PasswordRequirement[] | boolean;
  /** Makes this a "confirm password" field: shows a match / mismatch message once the user types. */
  confirmOf?: string;
  /** Message when `confirmOf` matches (default 'Passwords match'). */
  matchMessage?: string;
  /** Message when `confirmOf` doesn't match (default "Passwords don't match"). */
  mismatchMessage?: string;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const LEVEL_LABELS = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'];
const ICON = { sm: 18, md: 22, lg: 24 };

export function scorePassword(pw: string) {
  if (pw.length < 6) return 0;
  let s = 1;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

/**
 * Floating-label password field with an eye / eye-off toggle that cross-fades, a spring-filled
 * strength meter, an optional requirements checklist and a confirm-password mode.
 */
export const PasswordInput = forwardRef<ComponentRef<typeof TextInput>, PasswordInputProps>(function PasswordInput(
  {
    strength = true,
    score = scorePassword,
    requirements,
    confirmOf,
    matchMessage = 'Passwords match',
    mismatchMessage = "Passwords don't match",
    value,
    defaultValue,
    onChangeText,
    error,
    success,
    size = 'md',
    iconColor: iconColorProp,
    ...props
  },
  ref
) {
  const { colors } = useKit();
  const reduce = useReduceMotion();
  const [hidden, setHidden] = useState(true);
  const [inner, setInner] = useState(defaultValue ?? '');
  const text = value ?? inner;
  const confirming = confirmOf !== undefined;
  const level = useMemo(() => score(text), [score, text]);
  const rules = requirements === true ? DEFAULT_PASSWORD_REQUIREMENTS : requirements || undefined;

  // Confirm mode: complain as soon as the typed prefix diverges, or once it's long enough to compare.
  const matches = confirming && text.length > 0 && text === confirmOf;
  const mismatch =
    confirming && text.length > 0 && !matches && (text.length >= confirmOf.length || !confirmOf.startsWith(text));

  const eye = useRef(new Animated.Value(hidden ? 0 : 1)).current; // native: 1 = visible
  useEffect(() => {
    if (reduce) Animated.timing(eye, { toValue: hidden ? 0 : 1, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(eye, { toValue: hidden ? 0 : 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [hidden, eye, reduce]);

  const iconColor = iconColorProp ?? colors.mutedForeground;
  const iconSize = ICON[size];
  const fade = (on: 0 | 1) => ({
    opacity: eye.interpolate({ inputRange: [0, 1], outputRange: on ? [0, 1] : [1, 0], extrapolate: 'clamp' }),
    // Reduce Motion: a plain cross-fade, no spin or scale.
    transform: reduce
      ? []
      : [
          { scale: eye.interpolate({ inputRange: [0, 1], outputRange: on ? [0.6, 1] : [1, 0.6] }) },
          { rotate: eye.interpolate({ inputRange: [0, 1], outputRange: on ? ['-45deg', '0deg'] : ['0deg', '45deg'] }) },
        ],
  });

  return (
    <View>
      <FloatingInput
        ref={ref}
        {...props}
        size={size}
        iconColor={iconColorProp}
        value={text}
        onChangeText={(next) => {
          if (value === undefined) setInner(next);
          onChangeText?.(next);
        }}
        error={error ?? (mismatch ? mismatchMessage : undefined)}
        success={success ?? (matches ? matchMessage : undefined)}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        right={
          <Pressable
            hitSlop={(44 - iconSize) / 2}
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            accessibilityState={{ checked: !hidden }}
            style={{ width: iconSize, height: iconSize }}
          >
            <Animated.View style={[StyleSheet.absoluteFill, fade(1)]}>
              <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                <Path d={EYE} stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={12} cy={12} r={3} stroke={iconColor} strokeWidth={1.8} />
              </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, fade(0)]}>
              <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                <Path d={EYE_OFF} stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>
          </Pressable>
        }
      />
      {strength && !confirming && text.length > 0 ? <Meter level={level} reduce={reduce} /> : null}
      {rules && !confirming ? <Checklist rules={rules} value={text} reduce={reduce} /> : null}
    </View>
  );
});

const EYE = 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0';
const EYE_OFF =
  'M10.73 5.08A10.43 10.43 0 0 1 12 5c4.65 0 8.6 2.95 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49' +
  'M14.08 14.16a3 3 0 0 1-4.24-4.24' +
  'M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14' +
  'M2 2l20 20';

/** Four segments that spring-fill left to right; the colour slides with the score. */
function Meter({ level, reduce }: { level: number; reduce: boolean }) {
  const { colors, dark, font } = useKit();
  const palette = [colors.mutedForeground, colors.danger, colors.warning, colors.success, colors.success];
  const fills = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current; // native: scaleX
  const tone = useRef(new Animated.Value(level)).current; // JS: colour
  const enter = useRef(new Animated.Value(0)).current; // native

  useEffect(() => {
    if (reduce) enter.setValue(1);
    else Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);

  useEffect(() => {
    if (reduce) {
      // Segments appear filled at once; the colour still fades.
      fills.forEach((a, i) => a.setValue(i < level ? 1 : 0));
      Animated.timing(tone, { toValue: level, duration: 150, useNativeDriver: false }).start();
      return;
    }
    Animated.stagger(
      50,
      fills.map((a, i) => Animated.spring(a, { toValue: i < level ? 1 : 0, useNativeDriver: true, ...motion.snappy }))
    ).start();
    Animated.timing(tone, { toValue: level, duration: 220, useNativeDriver: false }).start();
  }, [level, fills, tone, reduce]);

  const color = tone.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: palette });
  const track = dark ? colors.muted : colors.border;

  return (
    <Animated.View
      style={[
        styles.meter,
        {
          opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
        },
      ]}
      accessible
      accessibilityLabel={`Password strength: ${LEVEL_LABELS[level]}`}
    >
      <View style={styles.bars}>
        {fills.map((a, i) => (
          <View key={i} style={[styles.track, { backgroundColor: track }]}>
            <Animated.View
              style={[
                styles.fill,
                { transform: [{ scaleX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }] },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
            </Animated.View>
          </View>
        ))}
      </View>
      <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.level, font.family ? { fontFamily: font.family } : null, { color: palette[level] }]}>{LEVEL_LABELS[level]}</Text>
    </Animated.View>
  );
}

function Checklist({ rules, value, reduce }: { rules: PasswordRequirement[]; value: string; reduce: boolean }) {
  return (
    <View style={styles.checklist} accessibilityRole="list">
      {rules.map((r) => (
        <Requirement key={r.label} label={r.label} met={r.test(value)} reduce={reduce} />
      ))}
    </View>
  );
}

function Requirement({ label, met, reduce }: { label: string; met: boolean; reduce: boolean }) {
  const { colors, dark, font } = useKit();
  const tick = useRef(new Animated.Value(met ? 1 : 0)).current; // native
  useEffect(() => {
    if (reduce) Animated.timing(tick, { toValue: met ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(tick, { toValue: met ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [met, tick, reduce]);

  return (
    <View
      style={styles.rule}
      accessible
      accessibilityLabel={`${label}: ${met ? 'done' : 'not yet'}`}
      accessibilityState={{ checked: met }}
    >
      <View style={styles.ruleIcon}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9.5} stroke={alpha(colors.mutedForeground, 0.5)} strokeWidth={1.8} />
        </Svg>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: tick.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              transform: reduce ? [] : [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
            },
          ]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={11} fill={colors.success} />
            <Path
              d="M7.5 12.5l3 3 6-6.5"
              stroke={dark ? '#0b0b12' : '#ffffff'}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </View>
      <Text style={[styles.ruleText, font.family ? { fontFamily: font.family } : null, { color: met ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
    </View>
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
  meter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginHorizontal: 4 },
  bars: { flex: 1, flexDirection: 'row', gap: 6 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, overflow: 'hidden', transformOrigin: 'left center' },
  level: { fontSize: 12.5, fontWeight: '400', minWidth: 72, textAlign: 'right' },
  checklist: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 12, marginHorizontal: 4 },
  rule: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 6 },
  ruleIcon: { width: 16, height: 16 },
  ruleText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
});
