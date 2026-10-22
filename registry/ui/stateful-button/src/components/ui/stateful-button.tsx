import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M6 12.5l4 4L18.5 8';
const CHECK_LEN = 18;
const CROSS = 'M7.5 7.5l9 9M16.5 7.5l-9 9';
const CROSS_LEN = 26;

export type StatefulButtonState = 'idle' | 'loading' | 'success' | 'error';
export type StatefulButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type StatefulButtonSize = 'sm' | 'md' | 'lg';

export interface StatefulButtonProps {
  /** Label while idle. */
  children: string;
  /** Controlled state. Leave it out and return a Promise from `onPress` to let the button drive itself. */
  state?: StatefulButtonState;
  /** If it returns a Promise and `state` is not set: loading → success / error → idle. */
  onPress?: () => void | Promise<unknown>;
  /** Label while loading (default: the idle label). */
  loadingText?: string;
  /** Label after success (default 'Done'). */
  successText?: string;
  /** Label after an error (default 'Failed'). */
  errorText?: string;
  variant?: StatefulButtonVariant;
  size?: StatefulButtonSize;
  /** Tint for the idle look (default: theme primary / foreground). */
  color?: string;
  /** Uncontrolled only: how long success / error shows before returning to idle, in ms. */
  resetAfter?: number;
  /** Uncontrolled only: minimum spinner time, so fast requests still read as "work happened". */
  minLoading?: number;
  /** Called on every state change (both modes). */
  onStateChange?: (state: StatefulButtonState) => void;
  /** Fully rounded ends. */
  pill?: boolean;
  /** Stretch to the parent's width (no width animation). */
  block?: boolean;
  disabled?: boolean;
  /** Tap on press, success and error buzzes (expo-haptics). Default true. */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const SIZES: Record<StatefulButtonSize, { h: number; px: number; font: number; icon: number; gap: number }> = {
  sm: { h: 36, px: 14, font: 14, icon: 16, gap: 6 },
  md: { h: 46, px: 18, font: 15.5, icon: 18, gap: 8 },
  lg: { h: 54, px: 22, font: 17, icon: 20, gap: 9 },
};
const STAGGER = 22;
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;
const END = 1e6;
// Connected scripts (Arabic, Indic, Thai…) roll as one piece instead of letter by letter.
const CONNECTED = /[֐-ࣿऀ-෿฀-໿ༀ-࿿က-႟ក-៿יִ-﷿ﹰ-﻿]/;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** A firm spring (~4% overshoot), sampled so it runs on the native driver. */
const settle = (t: number) => 1 - Math.exp(-7 * t) * Math.cos(7 * t);

/** Maps a ms clock onto `from → to` over [start, start + dur] through `ease` (pre-sampled for the native driver). */
function track(clock: Animated.Value, start: number, dur: number, from: number, to: number, ease: (t: number) => number, steps = 14) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    inputRange.push(start + dur * t);
    outputRange.push(k === steps ? to : from + (to - from) * ease(t));
  }
  return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
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

const split = (text: string) => (CONNECTED.test(text) ? [text] : Array.from(text));

type Anim = { opacity: Animated.AnimatedInterpolation<number>; translateY: Animated.AnimatedInterpolation<number> | number };

interface LettersProps {
  text: string;
  style: StyleProp<TextStyle>;
  lh: number;
  space: number;
  anims?: Anim[];
  onLayout?: (e: LayoutChangeEvent) => void;
}

/** A row of letters, each clipped to one line so it can roll in and out. */
function Letters({ text, style, lh, space, anims, onLayout }: LettersProps) {
  return (
    <View style={styles.letters} onLayout={onLayout}>
      {split(text).map((ch, i) =>
        ch === ' ' ? (
          <View key={i} style={{ width: space, height: lh }} />
        ) : (
          <View key={i} style={{ height: lh, overflow: 'hidden' }}>
            <Animated.Text
              numberOfLines={1}
              maxFontSizeMultiplier={FONT_CAP}
              style={[style, anims?.[i] && { opacity: anims[i].opacity, transform: [{ translateY: anims[i].translateY }] }]}
            >
              {ch}
            </Animated.Text>
          </View>
        ),
      )}
    </View>
  );
}

interface Roll {
  text: string;
  color: string;
  prev: { text: string; color: string; width: number } | null;
  id: number;
}

/** Label whose letters roll up and out while the next label rolls in from below (crossfade with reduced motion). */
function RollLabel({ text, color, style, lh, space, reduce }: { text: string; color: string; style: StyleProp<TextStyle>; lh: number; space: number; reduce: boolean }) {
  const width = useRef(0);
  const [roll, setRoll] = useState<Roll>({ text, color, prev: null, id: 0 });
  if (roll.text !== text) setRoll({ text, color, prev: { text: roll.text, color: roll.color, width: width.current }, id: roll.id + 1 });
  else if (roll.color !== color) setRoll({ ...roll, color });

  const clockRef = useRef<{ id: number; v: Animated.Value } | null>(null);
  if (!clockRef.current || clockRef.current.id !== roll.id) {
    clockRef.current = { id: roll.id, v: new Animated.Value(roll.id === 0 ? END : 0) };
  }
  const clock = clockRef.current.v;

  const live = useRef({ next: 0, prev: 0, reduce });
  live.current = { next: split(roll.text).length, prev: roll.prev ? split(roll.prev.text).length : 0, reduce };
  const id = roll.id;
  useEffect(() => {
    if (id === 0) return;
    const { next, prev, reduce: still } = live.current;
    const total = still ? 280 : Math.max(next, prev) * STAGGER + 60 + 520;
    const anim = Animated.timing(clock, { toValue: total, duration: total, easing: Easing.linear, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (!finished) return;
      clock.setValue(END);
      setRoll((r) => (r.id === id ? { ...r, prev: null } : r));
    });
    return () => anim.stop();
  }, [id, clock]);

  const n = live.current.next;
  const m = live.current.prev;
  const enter = useMemo<Anim[]>(
    () =>
      Array.from({ length: n }, (_, i) =>
        reduce
          ? { opacity: track(clock, 60, 220, 0, 1, easeOut), translateY: 0 }
          : { opacity: track(clock, i * STAGGER + 60, 200, 0, 1, easeOut), translateY: track(clock, i * STAGGER + 60, 520, lh, 0, settle, 18) },
      ),
    [n, clock, lh, reduce],
  );
  const exitStagger = Math.min(STAGGER, 120 / Math.max(m, 1));
  const exit = useMemo<Anim[]>(
    () =>
      Array.from({ length: m }, (_, i) =>
        reduce
          ? { opacity: track(clock, 0, 180, 1, 0, easeOut), translateY: 0 }
          : // The button narrows as soon as the label changes, so the old label clears out fast (≤ 120ms of
            // stagger whatever its length) instead of trailing letters past the shrinking edge.
            { opacity: track(clock, i * exitStagger, 110, 1, 0, easeOut), translateY: track(clock, i * exitStagger, 300, 0, -lh, easeInOut) },
      ),
    [m, clock, lh, reduce, exitStagger],
  );

  const pw = roll.prev?.width ?? 0;
  return (
    <View>
      <Letters
        text={roll.text}
        style={[style, { color: roll.color }]}
        lh={lh}
        space={space}
        anims={enter}
        onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      />
      {roll.prev ? (
        <View pointerEvents="none" style={[styles.prev, pw > 0 ? { left: '50%', marginLeft: -pw / 2, width: pw } : { left: 0 }]}>
          <Letters text={roll.prev.text} style={[style, { color: roll.prev.color }]} lh={lh} space={space} anims={exit} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Button that walks through idle → loading → success / error. The label rolls letter by letter to
 * the next text, the width springs to fit it, and a spinner, self-drawing check or shaking cross
 * grows in beside it. Controlled with `state`, or self-driving when `onPress` returns a Promise.
 */
export function StatefulButton({
  children,
  state,
  onPress,
  loadingText,
  successText = 'Done',
  errorText = 'Failed',
  variant = 'primary',
  size = 'md',
  color,
  resetAfter = 1600,
  minLoading = 500,
  onStateChange,
  pill,
  block,
  disabled,
  haptics = true,
  accessibilityLabel,
  style,
  textStyle,
}: StatefulButtonProps) {
  const { colors, radius, dark, font } = useKit();
  const reduce = useReduceMotion();
  const s = SIZES[size];
  const fontSize = StyleSheet.flatten(textStyle)?.fontSize ?? s.font;
  // Letter boxes clip to one line, so they grow with the (capped) text size; the Text's own lineHeight scales itself.
  const textScale = Math.min(Math.max(useWindowDimensions().fontScale || 1, 1), FONT_CAP);
  const lineHeight = Math.round(fontSize * 1.3);
  const lh = Math.ceil(lineHeight * textScale);
  const space = fontSize * 0.28 * textScale;

  const [inner, setInner] = useState<StatefulButtonState>('idle');
  const current = state ?? inner;
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const labels: Record<StatefulButtonState, string> = {
    idle: children,
    loading: loadingText ?? children,
    success: successText,
    error: errorText,
  };
  const label = labels[current];

  // Looks: idle (also used while loading), success and error. Transparent fills keep their hue so fades stay clean.
  const ok = colors.success;
  const bad = colors.danger;
  const soft = dark ? 0.2 : 0.14;
  const looks: Record<StatefulButtonVariant, [{ bg: string; fg: string; border: string }, { bg: string; fg: string; border: string }, { bg: string; fg: string; border: string }]> = {
    primary: [
      { bg: color ?? colors.primary, fg: color ? readableOn(color) : colors.primaryForeground, border: alpha(color ?? colors.primary, 0) },
      { bg: ok, fg: readableOn(ok), border: alpha(ok, 0) },
      { bg: bad, fg: colors.dangerForeground, border: alpha(bad, 0) },
    ],
    secondary: [
      { bg: color ? alpha(color, soft) : colors.secondary, fg: color ?? colors.secondaryForeground, border: alpha(colors.secondary, 0) },
      { bg: alpha(ok, soft), fg: ok, border: alpha(ok, 0) },
      { bg: alpha(bad, soft), fg: bad, border: alpha(bad, 0) },
    ],
    outline: [
      { bg: alpha(color ?? colors.foreground, 0), fg: color ?? colors.foreground, border: color ? alpha(color, 0.5) : colors.border },
      { bg: alpha(ok, 0), fg: ok, border: alpha(ok, 0.6) },
      { bg: alpha(bad, 0), fg: bad, border: alpha(bad, 0.6) },
    ],
    ghost: [
      { bg: alpha(color ?? colors.foreground, 0), fg: color ?? colors.foreground, border: alpha(color ?? colors.foreground, 0) },
      { bg: alpha(ok, 0), fg: ok, border: alpha(ok, 0) },
      { bg: alpha(bad, 0), fg: bad, border: alpha(bad, 0) },
    ],
  };
  const look = looks[variant];
  const toneIndex = current === 'success' ? 1 : current === 'error' ? 2 : 0;
  const fg = look[toneIndex].fg;
  const bw = variant === 'outline' ? StyleSheet.hairlineWidth * 2 : 0;

  // JS driver (layout + colour + SVG) — on the surface, the icon slot and the stroke.
  const tone = useRef(new Animated.Value(toneIndex)).current;
  const slot = useRef(new Animated.Value(current === 'idle' ? 0 : s.icon + s.gap)).current;
  const draw = useRef(new Animated.Value(1)).current;
  // Native driver — transforms and opacity on their own wrappers.
  const press = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(current === 'idle' ? 0 : 1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  // The icon keeps showing the last busy/result state while it shrinks away on the way back to idle.
  const lastIcon = useRef<StatefulButtonState>(current === 'idle' ? 'loading' : current);
  if (current !== 'idle') lastIcon.current = current;
  const icon = lastIcon.current;

  // Width: measured from hidden copies of every label, sprung on the JS driver.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const measured = widths[label];
  const target = measured === undefined ? undefined : Math.max(s.h, Math.ceil(measured) + s.px * 2 + bw * 2 + (current === 'idle' ? 0 : s.icon + s.gap));
  const widthRef = useRef<Animated.Value | null>(null);
  if (!widthRef.current && target !== undefined) widthRef.current = new Animated.Value(target);
  const width = widthRef.current;

  const live = useRef({ reduce, haptics, onStateChange, label, slotTo: 0 });
  live.current = { reduce, haptics, onStateChange, label, slotTo: current === 'idle' ? 0 : s.icon + s.gap };

  useEffect(() => {
    if (!width || target === undefined) return;
    if (live.current.reduce) width.setValue(target);
    else Animated.spring(width, { toValue: target, useNativeDriver: false, ...motion.snappy }).start();
  }, [width, target]);

  // Everything that happens on a state change.
  const seen = useRef(current);
  useEffect(() => {
    if (seen.current === current) return;
    seen.current = current;
    const { reduce: still, haptics: buzz, onStateChange: notify, slotTo } = live.current;
    notify?.(current);

    if (still) slot.setValue(slotTo);
    else Animated.spring(slot, { toValue: slotTo, useNativeDriver: false, ...motion.snappy }).start();
    Animated.timing(tone, { toValue: current === 'success' ? 1 : current === 'error' ? 2 : 0, duration: 220, useNativeDriver: false }).start();

    if (current === 'idle') {
      Animated.timing(pop, { toValue: 0, duration: 140, useNativeDriver: true }).start();
    } else {
      pop.setValue(still ? 1 : 0.2);
      if (!still) Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    }

    spinLoop.current?.stop();
    spinLoop.current = null;
    if (current === 'loading') {
      spin.setValue(0);
      spinLoop.current = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
      spinLoop.current.start();
    }

    if (current === 'success' || current === 'error') {
      draw.setValue(still ? 1 : 0);
      if (!still) Animated.timing(draw, { toValue: 1, duration: 380, delay: 90, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      if (buzz)
        Haptics.notificationAsync(
          current === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        ).catch(() => {});
    }
    if (current === 'error' && !still) {
      shake.setValue(0);
      Animated.sequence([10, -8, 6, -4, 2, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true }))).start();
    }
  }, [current, slot, tone, pop, spin, draw, shake]);

  useEffect(() => () => spinLoop.current?.stop(), []);

  // Screen readers hear every new label (Saving…, Saved, Following…), not just the first.
  const heard = useRef(label);
  useEffect(() => {
    if (heard.current === label) return;
    heard.current = label;
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);

  const isDisabled = !!disabled || current === 'loading';

  const run = () => {
    if (isDisabled || busy.current) return;
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const result: unknown = onPress?.();
    if (state !== undefined || !isThenable(result)) return;
    busy.current = true;
    setInner('loading');
    const started = Date.now();
    Promise.resolve(result)
      .then(
        () => false,
        () => true,
      )
      .then(async (failed) => {
        const remaining = minLoading - (Date.now() - started);
        if (remaining > 0) await wait(remaining);
        if (!mounted.current) return;
        setInner(failed ? 'error' : 'success');
        await wait(resetAfter);
        if (!mounted.current) return;
        setInner('idle');
        busy.current = false;
      });
  };

  const onMeasure = (text: string) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidths((prev) => (prev[text] === w ? prev : { ...prev, [text]: w }));
  };

  const textBase: StyleProp<TextStyle> = [styles.label, { fontSize: s.font, fontFamily: font.family }, textStyle, { lineHeight }];
  // Press feedback: a light wash on dark fills, a faint shade on light or transparent ones.
  const wash = variant === 'primary' && readableOn(look[0].bg) === '#ffffff' ? alpha('#ffffff', 0.14) : alpha(colors.foreground, 0.07);
  const corner = pill ? radius.capsule(s.h) : radius.md;
  const hit = Math.max(0, (44 - s.h) / 2);

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }, { scale: press }] }, block ? styles.block : styles.inline, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isDisabled, busy: current === 'loading' }}
        disabled={isDisabled}
        hitSlop={hit ? { top: hit, bottom: hit } : undefined}
        onPress={run}
        onPressIn={() => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, ...motion.bouncy }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start()}
      >
        {({ pressed }) => (
          <Animated.View
            style={[
              styles.surface,
              {
                minHeight: s.h,
                minWidth: s.h,
                paddingHorizontal: s.px,
                borderRadius: corner,
                borderWidth: bw,
                borderColor: tone.interpolate({ inputRange: [0, 1, 2], outputRange: [look[0].border, look[1].border, look[2].border] }),
                backgroundColor: tone.interpolate({ inputRange: [0, 1, 2], outputRange: [look[0].bg, look[1].bg, look[2].bg] }),
                opacity: disabled ? 0.5 : 1,
              },
              !block && width ? { width } : null,
            ]}
          >
            {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} /> : null}
            <Animated.View style={[styles.slot, { width: slot, height: s.icon }]}>
              <Animated.View
                style={[
                  styles.icon,
                  {
                    width: s.icon,
                    height: s.icon,
                    opacity: pop.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
                    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                  },
                ]}
              >
                {icon === 'loading' ? (
                  <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                    <Svg width={s.icon} height={s.icon} viewBox="0 0 24 24">
                      <Circle cx={12} cy={12} r={9} stroke={alpha(fg, 0.25)} strokeWidth={2.75} fill="none" />
                      <Circle cx={12} cy={12} r={9} stroke={fg} strokeWidth={2.75} strokeLinecap="round" strokeDasharray="15 60" fill="none" />
                    </Svg>
                  </Animated.View>
                ) : (
                  <Svg width={s.icon} height={s.icon} viewBox="0 0 24 24">
                    <AnimatedPath
                      d={icon === 'error' ? CROSS : CHECK}
                      stroke={fg}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      strokeDasharray={icon === 'error' ? CROSS_LEN : CHECK_LEN}
                      strokeDashoffset={
                        draw.interpolate({
                          inputRange: [0, 1],
                          outputRange: [icon === 'error' ? CROSS_LEN : CHECK_LEN, 0],
                          extrapolate: 'clamp',
                        }) as unknown as number
                      }
                    />
                  </Svg>
                )}
              </Animated.View>
            </Animated.View>
            <RollLabel text={label} color={fg} style={textBase} lh={lh} space={space} reduce={reduce} />
          </Animated.View>
        )}
      </Pressable>

      {/* Hidden copies of each label, laid out exactly like the visible one, to know every width up front. */}
      <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.measureRow}>
          {Array.from(new Set(Object.values(labels))).map((text) => (
            <View key={text} style={styles.measureItem}>
              <Letters text={text} style={textBase} lh={lh} space={space} onLayout={onMeasure(text)} />
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inline: { alignSelf: 'flex-start' },
  block: { alignSelf: 'stretch' },
  surface: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slot: { justifyContent: 'center' },
  icon: { position: 'absolute', left: 0 },
  letters: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { fontWeight: '400', letterSpacing: -0.1, includeFontPadding: false },
  prev: { position: 'absolute', top: 0 },
  measure: { position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 },
  measureRow: { width: 4000, flexDirection: 'column', alignItems: 'flex-start' },
  measureItem: { flexDirection: 'row' },
});
