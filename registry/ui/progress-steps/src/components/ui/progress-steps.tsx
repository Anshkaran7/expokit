import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type ProgressStepsVariant = 'horizontal' | 'vertical' | 'bar';

export interface ProgressStep {
  label: string;
  /** Muted line under the label (two lines max in the horizontal variant). */
  description?: string;
}

export interface ProgressStepsProps {
  /** Step labels, or objects with a description. */
  steps: (string | ProgressStep)[];
  /** Index of the active step. Steps before it are complete; `steps.length` marks everything done. */
  current: number;
  /** Index of a step that failed (drawn red with "!"). */
  errorStep?: number;
  /** 'horizontal' nodes with labels · 'vertical' list with descriptions · 'bar' compact "Step 2 of 4" with a segmented bar. */
  variant?: ProgressStepsVariant;
  /** Lets people tap a step, e.g. to go back to a completed one. */
  onStepPress?: (index: number) => void;
  /** Which steps `onStepPress` makes tappable: 'all' (default) or only 'completed' ones. */
  pressableSteps?: 'all' | 'completed';
  /** Selection tick whenever `current` changes (default true). */
  haptics?: boolean;
  /** Colour of completed steps, connectors and the current ring (default: theme accent). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;
const NODE = 28;
const GAP = 6;
const LINE = 3;
const H_PAD = 6;
const CHECK = 'M7 12.4l3.4 3.4L17.2 9';
const CHECK_LEN = 16;

/**
 * Multi-step progress for checkout and onboarding flows. Completed steps fill and draw their
 * check, the current step glows with a pulsing ring, upcoming steps stay hollow. When `current`
 * changes the finished node pops, the connector pours the accent into the next step and the new
 * step lights up, with a selection tick. Horizontal, vertical (with descriptions) and a compact bar.
 */
export function ProgressSteps({
  steps,
  current,
  errorStep,
  variant = 'horizontal',
  onStepPress,
  pressableSteps = 'all',
  haptics = true,
  accent,
  style,
}: ProgressStepsProps) {
  const { colors, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const items = steps.map((s) => (typeof s === 'string' ? { label: s } : s));
  const n = items.length;
  const target = Math.max(0, Math.min(n, current));
  const track = alpha(colors.foreground, dark ? 0.12 : 0.08);

  // Same motion on two drivers: native for transforms / opacity, JS for the SVG check stroke.
  const pNative = useRef(new Animated.Value(target)).current;
  const pJs = useRef(new Animated.Value(target)).current;
  const labelIn = useRef(new Animated.Value(1)).current;
  const prev = useRef(target);
  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (reduce) {
      const cfg = { toValue: target, duration: 160 };
      Animated.parallel([
        Animated.timing(pNative, { ...cfg, useNativeDriver: true }),
        Animated.timing(pJs, { ...cfg, useNativeDriver: false }),
      ]).start();
      labelIn.setValue(1);
      return;
    }
    const cfg = { toValue: target, ...motion.gentle, overshootClamping: true };
    Animated.parallel([
      Animated.spring(pNative, { ...cfg, useNativeDriver: true }),
      Animated.spring(pJs, { ...cfg, useNativeDriver: false }),
    ]).start();
    labelIn.setValue(0);
    Animated.spring(labelIn, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [target, haptics, reduce, pNative, pJs, labelIn]);

  // One shared heartbeat for the current step's ring.
  const pulse = useRef(new Animated.Value(0)).current;
  const pulsing = !reduce && target < n && target !== errorStep && variant !== 'bar';
  useEffect(() => {
    if (!pulsing) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(250),
      ]),
      { iterations: -1, resetBeforeIteration: true }
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, pulse]);

  const [width, setWidth] = useState(0);

  const stateOf = (i: number): NodeState =>
    i === errorStep ? 'error' : i < target ? 'done' : i === target ? 'active' : 'upcoming';

  if (variant === 'bar') {
    const shown = Math.min(target, n - 1);
    const done = target >= n;
    const failed = errorStep === shown;
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={done ? 'All steps complete' : `Step ${shown + 1} of ${n}, ${items[shown]!.label}`}
        accessibilityValue={{ min: 0, max: n, now: target }}
        style={[styles.bar, style]}
      >
        <View style={styles.barHead}>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.barLabel,
              ff,
              { color: failed ? colors.danger : colors.foreground },
              {
                opacity: labelIn,
                transform: [{ translateY: labelIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
              },
            ]}
          >
            {done ? 'All done' : items[shown]!.label}
          </Animated.Text>
          <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.barStep, ff, { color: colors.mutedForeground }]}>
            {done ? `${n} of ${n}` : `Step ${shown + 1} of ${n}`}
          </Text>
        </View>
        <View style={styles.barRow}>
          {items.map((_, i) => (
            <Fill
              key={i}
              axis="x"
              progress={pNative}
              range={[i, i + 1]}
              color={i === errorStep ? colors.danger : tint}
              track={i === shown && !done ? alpha(i === errorStep ? colors.danger : tint, dark ? 0.26 : 0.2) : track}
              thickness={6}
              style={styles.flex}
            />
          ))}
        </View>
      </View>
    );
  }

  const vertical = variant === 'vertical';
  const colW = width / Math.max(1, n);
  const segW = colW - NODE - GAP * 2;
  return (
    <View
      onLayout={vertical ? undefined : (e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[vertical ? styles.vertical : styles.horizontal, style]}
    >
      {/* Horizontal connectors sit between the columns' nodes, measured from the row width. */}
      {!vertical && width > 0 && segW > 0
        ? items.slice(0, -1).map((_, i) => (
            <Fill
              key={i}
              axis="x"
              progress={pNative}
              range={[i + 0.2, i + 0.8]}
              color={tint}
              track={track}
              thickness={LINE}
              style={[styles.hLine, { left: (i + 0.5) * colW + NODE / 2 + GAP, width: segW }]}
            />
          ))
        : null}
      {items.map((step, i) => (
        <Step
          key={i}
          index={i}
          count={n}
          step={step}
          state={stateOf(i)}
          vertical={vertical}
          pNative={pNative}
          pJs={pJs}
          pulse={pulse}
          color={i === errorStep ? colors.danger : tint}
          lineColor={tint}
          track={track}
          reduce={reduce}
          onPress={
            onStepPress && (pressableSteps === 'all' || i < target) && i !== target ? () => onStepPress(i) : undefined
          }
        />
      ))}
    </View>
  );
}

type NodeState = 'done' | 'active' | 'upcoming' | 'error';

function Step({
  index: i,
  count: n,
  step,
  state,
  vertical,
  pNative,
  pJs,
  pulse,
  color,
  lineColor,
  track,
  reduce,
  onPress,
}: {
  index: number;
  count: number;
  step: ProgressStep;
  state: NodeState;
  vertical: boolean;
  pNative: Animated.Value;
  pJs: Animated.Value;
  pulse: Animated.Value;
  color: string;
  lineColor: string;
  track: string;
  reduce: boolean;
  onPress?: () => void;
}) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const press = useRef(new Animated.Value(0)).current;
  const pressTo = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, ...(v ? motion.snappy : motion.bouncy) }).start();

  const last = i === n - 1;
  const labelColor =
    state === 'error' ? colors.danger : state === 'upcoming' ? colors.mutedForeground : colors.foreground;
  const status =
    state === 'active' ? 'current' : state === 'done' ? 'completed' : state === 'error' ? 'needs attention' : 'not started';

  const node = (
    <Animated.View style={{ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) }] }}>
      <Node index={i} state={state} pNative={pNative} pJs={pJs} pulse={pulse} color={color} reduce={reduce} />
    </Animated.View>
  );

  const line = (style: StyleProp<ViewStyle>) => (
    <Fill
      axis="y"
      progress={pNative}
      range={[i + 0.2, i + 0.8]}
      color={lineColor}
      track={track}
      thickness={LINE}
      style={style}
    />
  );

  const a11y = {
    accessibilityRole: onPress ? ('button' as const) : ('text' as const),
    accessibilityLabel: `Step ${i + 1} of ${n}, ${step.label}, ${status}`,
    accessibilityHint: onPress ? 'Goes back to this step' : undefined,
    accessibilityState: { selected: state === 'active' },
  };
  const Wrapper = onPress ? Pressable : View;
  const pressProps = onPress ? { onPress, onPressIn: () => pressTo(1), onPressOut: () => pressTo(0) } : {};

  if (vertical) {
    return (
      <Wrapper {...a11y} {...pressProps} style={styles.vRow}>
        <View style={styles.vRail}>
          {node}
          {!last ? line(styles.vLine) : null}
        </View>
        <View style={[styles.vBody, !last && styles.vBodyGap]}>
          <Text style={[styles.vLabel, ff, { color: labelColor }]}>{step.label}</Text>
          {step.description ? (
            <Text style={[styles.vDesc, ff, { color: state === 'error' ? colors.danger : colors.mutedForeground }]}>
              {step.description}
            </Text>
          ) : null}
        </View>
      </Wrapper>
    );
  }

  return (
    <Wrapper {...a11y} {...pressProps} style={styles.hCol}>
      <View style={styles.hTop}>{node}</View>
      <Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={2} style={[styles.hLabel, ff, { color: labelColor }]}>
        {step.label}
      </Text>
      {step.description ? (
        <Text numberOfLines={2} style={[styles.hDesc, ff, { color: colors.mutedForeground }]}>
          {step.description}
        </Text>
      ) : null}
    </Wrapper>
  );
}

function Node({
  index: i,
  state,
  pNative,
  pJs,
  pulse,
  color,
  reduce,
}: {
  index: number;
  state: NodeState;
  pNative: Animated.Value;
  pJs: Animated.Value;
  pulse: Animated.Value;
  color: string;
  reduce: boolean;
}) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const clamp = 'clamp' as const;
  const round = { borderRadius: radius.capsule(NODE) };
  const activeIn = pNative.interpolate({ inputRange: [i - 0.3, i], outputRange: [0, 1], extrapolate: clamp });
  const doneIn = pNative.interpolate({ inputRange: [i, i + 0.3], outputRange: [0, 1], extrapolate: clamp });
  const draw = pJs.interpolate({ inputRange: [i + 0.1, i + 0.55], outputRange: [CHECK_LEN, 0], extrapolate: clamp });
  const ink = readableOn(color);

  if (state === 'error') {
    return (
      <View style={styles.nodeBox}>
        <View style={[styles.halo, { borderRadius: radius.capsule(NODE + 8), backgroundColor: alpha(color, 0.16) }]} />
        <Disc color={color} corner={radius.capsule(NODE)}>
          <Path d="M12 7v6" stroke={ink} strokeWidth={2.6} strokeLinecap="round" />
          <Rect x={10.6} y={15.6} width={2.8} height={2.8} rx={1.4} fill={ink} />
        </Disc>
      </View>
    );
  }

  return (
    <View style={styles.nodeBox}>
      {/* Upcoming: hollow ring, muted number. */}
      <View
        style={[styles.node, round, { borderWidth: 1.5, borderColor: alpha(colors.foreground, dark ? 0.22 : 0.16) }]}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, ff, { color: colors.mutedForeground }]}>
          {i + 1}
        </Text>
      </View>

      {/* Current: soft halo, a ring that breathes outwards, accent ring with a tinted core. */}
      <Animated.View
        style={[
          styles.halo,
          { borderRadius: radius.capsule(NODE + 8), backgroundColor: alpha(color, dark ? 0.2 : 0.14), opacity: activeIn },
        ]}
      />
      {state === 'active' && !reduce ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.node,
            styles.layer,
            round,
            {
              borderWidth: 1.5,
              borderColor: color,
              opacity: Animated.multiply(pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), activeIn),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.node,
          styles.layer,
          round,
          {
            borderWidth: 2,
            borderColor: color,
            backgroundColor: colors.background,
            opacity: activeIn,
            transform: [{ scale: activeIn.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        <View style={[StyleSheet.absoluteFill, round, { backgroundColor: alpha(color, 0.12) }]} />
        <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, ff, { color }]}>
          {i + 1}
        </Text>
      </Animated.View>

      {/* Done: solid disc that pops in, then the check draws itself. */}
      <Animated.View
        style={[
          styles.layer,
          {
            opacity: doneIn,
            transform: [
              {
                scale: doneIn.interpolate(
                  reduce
                    ? { inputRange: [0, 1], outputRange: [0.9, 1] }
                    : { inputRange: [0, 0.7, 1], outputRange: [0.55, 1.1, 1] }
                ),
              },
            ],
          },
        ]}
      >
        <Disc color={color} corner={radius.capsule(NODE)}>
          <AnimatedPath
            d={CHECK}
            stroke={ink}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
            strokeDashoffset={draw}
          />
        </Disc>
      </Animated.View>
    </View>
  );
}

/** Solid filled node; children draw in a 24×24 box on top. */
function Disc({ color, corner, children }: { color: string; corner: number; children: React.ReactNode }) {
  const r = (corner / NODE) * 24;
  return (
    <Svg width={NODE} height={NODE} viewBox="0 0 24 24">
      <Rect width={24} height={24} rx={r} fill={color} />
      {children}
    </Svg>
  );
}

/** A track whose solid fill slides in (native driver) as `progress` moves through `range`. */
function Fill({
  axis,
  progress,
  range,
  color,
  track,
  thickness,
  style,
}: {
  axis: 'x' | 'y';
  progress: Animated.Value;
  range: [number, number];
  color: string;
  track: string;
  thickness: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { radius } = useKit();
  const [len, setLen] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const l = Math.round(axis === 'x' ? width : height);
    if (l !== len) setLen(l);
  };
  const x = axis === 'x';
  const corner = radius.capsule(thickness);
  const shift = progress.interpolate({ inputRange: range, outputRange: [-len, 0], extrapolate: 'clamp' });
  const w = x ? len : thickness;
  const h = x ? thickness : len;
  return (
    <View
      onLayout={onLayout}
      style={[
        x ? { height: thickness } : { width: thickness },
        { borderRadius: corner, backgroundColor: track, overflow: 'hidden' },
        style,
      ]}
    >
      {len ? (
        <Animated.View
          style={{
            width: w,
            height: h,
            borderRadius: corner,
            backgroundColor: color,
            transform: [x ? { translateX: shift } : { translateY: shift }],
          }}
        />
      ) : null}
    </View>
  );
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  horizontal: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch' },
  hCol: { flex: 1, alignItems: 'center', minHeight: 44, paddingTop: H_PAD },
  hTop: { marginBottom: 10 },
  hLine: { position: 'absolute', top: H_PAD + NODE / 2 - LINE / 2 },
  hLabel: { fontSize: 12.5, fontWeight: '400', textAlign: 'center', letterSpacing: -0.1, paddingHorizontal: 2 },
  hDesc: { fontSize: 11, lineHeight: 14, textAlign: 'center', marginTop: 2, paddingHorizontal: 2 },
  nodeBox: { width: NODE, height: NODE },
  node: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
  halo: { position: 'absolute', left: -4, top: -4, width: NODE + 8, height: NODE + 8 },
  num: { fontSize: 12.5, fontWeight: '400', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' },
  vertical: { alignSelf: 'stretch' },
  vRow: { flexDirection: 'row', gap: 14, minHeight: 44, paddingLeft: 4 },
  vRail: { alignItems: 'center', width: NODE, paddingTop: 2 },
  vLine: { flex: 1, minHeight: 16, marginTop: GAP + 2, marginBottom: GAP - 4 },
  vBody: { flex: 1, paddingTop: 5 },
  vBodyGap: { paddingBottom: 24 },
  vLabel: { fontSize: 15.5, fontWeight: '400', letterSpacing: -0.25 },
  vDesc: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  bar: { alignSelf: 'stretch', gap: 10 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  barStep: { fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  barLabel: { fontSize: 16, fontWeight: '400', letterSpacing: -0.25, flexShrink: 1 },
  barRow: { flexDirection: 'row', gap: 5 },
});
