import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { alpha, useKit } from '@/lib/kit';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type SpinnerVariant =
  | 'ring'
  | 'dots'
  | 'bars'
  | 'pulse'
  | 'orbit'
  | 'bounce'
  | 'wave'
  | 'grid'
  | 'typing'
  | 'arc'
  | 'square'
  | 'line';
export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerLabelPosition = 'none' | 'right' | 'bottom';

export interface SpinnerProps {
  variant?: SpinnerVariant;
  /** 'sm' 16 · 'md' 24 · 'lg' 36 · 'xl' 52 — or any number of points. */
  size?: SpinnerSize | number;
  /** Indicator colour (default: theme accent). */
  color?: string;
  /** Speed multiplier: 2 is twice as fast. */
  speed?: number;
  /** Read by screen readers, and shown when `labelPosition` is set. */
  label?: string;
  /** Show `label` beside or under the spinner with an animated ellipsis (default 'none': screen readers only). */
  labelPosition?: SpinnerLabelPosition;
  /** Faint guide behind the motion: the full circle (ring, orbit, arc), the rail (line) or ghost bars (bars). */
  track?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<SpinnerSize, number> = { sm: 16, md: 24, lg: 36, xl: 52 };

/** The indicator's box: a `size` square, except the line — a thin bar `size * 4` wide. */
function boxOf(variant: SpinnerVariant, px: number) {
  return variant === 'line' ? { width: px * 4, height: lineThickness(px) } : { width: px, height: px };
}

function lineThickness(px: number) {
  return Math.max(2, Math.round(px / 8));
}
/** Arcs stacked from the head backwards: the shortest is solid, the rest faint, so the tail fades out. */
const TAIL = 7;

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

/** Looping value 0 → 1. Each spinner part interpolates it. */
function useLoop(duration: number, easing: (t: number) => number, native: boolean, running = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    if (!running) return;
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration,
        easing,
        useNativeDriver: native,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration, easing, native, running]);
  return v;
}

const linear = Easing.linear;
const sine = Easing.inOut(Easing.sin);

/**
 * Pre-samples an eased piecewise curve (each segment eased like `interpolate({ easing })`) so it can
 * run on the native driver, which doesn't support `easing` on interpolations.
 */
function eased(points: number[], values: number[], ease: (t: number) => number, steps = 12) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      inputRange.push(points[i] + (points[i + 1] - points[i]) * t);
      outputRange.push(values[i] + (values[i + 1] - values[i]) * ease(t));
    }
  }
  inputRange.push(points[points.length - 1]);
  outputRange.push(values[values.length - 1]);
  return { inputRange, outputRange };
}

/**
 * Samples a periodic curve `f(t)`, t ∈ [0, 1], into an interpolation a native-driver loop can play.
 * Each part passes its own phase into `f`, so one loop drives a whole staggered pattern.
 */
function curve(f: (t: number) => number, steps = 24) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k <= steps; k++) {
    inputRange.push(k / steps);
    outputRange.push(f(k / steps));
  }
  return { inputRange, outputRange };
}

/** Same as `curve`, for rotations. */
function curveDeg(f: (t: number) => number, steps = 24) {
  const r = curve(f, steps);
  return { inputRange: r.inputRange, outputRange: r.outputRange.map((d) => `${d}deg`) };
}

/** Wraps any number into [0, 1) — `wrap(t - phase)` delays a part by `phase` of a cycle. */
const wrap = (t: number) => t - Math.floor(t);
/** 0 → 1 → 0 hump over the first `width` of a cycle, flat afterwards. */
const hump = (u: number, width: number) => (u < width ? Math.sin((Math.PI * u) / width) : 0);
const cubic = Easing.inOut(Easing.cubic);
const outCubic = Easing.out(Easing.cubic);

/**
 * Loading indicator — a comet arc whose tail fades out and breathes as it spins, a soft wave of dots,
 * or one of ten more loaders (bars, pulse, orbit, bounce, wave, grid, typing, arc, square, line).
 * Optionally shows a label with an animated ellipsis. Motion runs on the native driver.
 */
export function Spinner({
  variant = 'ring',
  size = 'md',
  color,
  speed = 1,
  label = 'Loading',
  labelPosition = 'none',
  track = false,
  style,
}: SpinnerProps) {
  const { colors } = useKit();
  const reduce = useReduceMotion();
  const px = typeof size === 'number' ? size : SIZES[size];
  const tint = color ?? colors.accent;
  const Body = BODIES[variant] ?? Ring;
  const s = Math.max(0.1, speed);
  const body = <Body size={px} color={tint} speed={s} track={track} reduce={reduce} />;
  const box = boxOf(BODIES[variant] ? variant : 'ring', px);

  if (labelPosition === 'none' || !label) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={[styles.root, box, style]}
      >
        {body}
      </View>
    );
  }

  const bottom = labelPosition === 'bottom';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[bottom ? styles.column : styles.inline, { gap: bottom ? 10 : 8 }, style]}
    >
      <View style={[styles.root, box]}>{body}</View>
      <Ellipsis
        text={label}
        speed={s}
        reduce={reduce}
        color={colors.mutedForeground}
        fontSize={bottom ? 14 : Math.max(13, Math.min(15, px * 0.62))}
      />
    </View>
  );
}

interface BodyProps {
  size: number;
  color: string;
  speed: number;
  track: boolean;
  reduce: boolean;
}

function Ring({ size, color, speed, track, reduce }: BodyProps) {
  const stroke = Math.max(2, size / 9);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Native: a steady spin plus an eased surge on a nested view. JS: the arc length breathing on the SVG.
  const spin = useLoop(1100 / speed, linear, true);
  const lunge = useLoop(1500 / speed, linear, true, !reduce);
  const breath = useLoop(1500 / speed, linear, false, !reduce);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  // The head races ahead while the arc grows, then eases while the tail catches up.
  const surge = eased([0, 0.5, 1], [0, 290, 360], sine);
  const rotateSurge = lunge.interpolate({ inputRange: surge.inputRange, outputRange: surge.outputRange.map((d) => `${d}deg`) });
  // Arc length breathes 14% → 62% → 14% of the circle.
  const min = c * 0.14;
  const max = c * 0.62;
  const steady = c * 0.36;

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateSurge }] }]}>
        {/* Mirrored so the dash grows backwards from a fixed head at the path start. */}
        <View style={styles.mirror}>
          <Svg width={size} height={size}>
            {track ? (
              <Circle cx={size / 2} cy={size / 2} r={r} stroke={alpha(color, 0.14)} strokeWidth={stroke} fill="none" />
            ) : null}
            {Array.from({ length: TAIL }, (_, k) => {
              // k = 0 is the full tail (faintest layer), k = TAIL - 1 the solid head.
              const part = (TAIL - k) / TAIL;
              const headLayer = k === TAIL - 1;
              const longest = max * part;
              const offset = reduce
                ? longest - steady * part
                : breath.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [longest - min * part, 0, longest - min * part],
                    easing: sine,
                  });
              return (
                <AnimatedCircle
                  key={k}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={color}
                  strokeOpacity={headLayer ? 1 : 0.2}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${longest} ${c * 2}`}
                  strokeDashoffset={offset}
                  fill="none"
                />
              );
            })}
          </Svg>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Dots({ size, color, speed, reduce }: BodyProps) {
  const t = useLoop(1200 / speed, linear, true, !reduce);
  const dot = size / 4.2;
  return (
    <View style={[styles.row, { gap: dot / 2.2 }]}>
      {[0, 1, 2].map((i) => {
        // A smooth wave: each dot swells, brightens and lifts slightly during its slice of the cycle.
        const s = i * 0.16;
        // Pre-sampled with eased(): the native driver rejects `easing` on interpolations.
        const wave = (values: number[]) => eased([0, s, s + 0.22, s + 0.44, 1], values, sine);
        return (
          <Animated.View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color,
              opacity: reduce
                ? 0.4 + i * 0.3
                : t.interpolate(wave([0.35, 0.35, 1, 0.35, 0.35])),
              transform: reduce
                ? []
                : [
                    {
                      translateY: t.interpolate(wave([0, 0, -size / 9, 0, 0])),
                    },
                    {
                      scale: t.interpolate(wave([0.65, 0.65, 1.1, 0.65, 0.65])),
                    },
                  ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Equalizer: four rounded bars bouncing at different rates (native scaleY). */
function Bars({ size, color, speed, track, reduce }: BodyProps) {
  const { radius } = useKit();
  const t = useLoop(1300 / speed, linear, true, !reduce);
  const w = size / 6.4;
  const h = size * 0.78;
  const corner = radius.capsule(w);
  return (
    <View style={[styles.row, { gap: w * 0.6, height: h }]}>
      {BAR_RATE.map((rate, i) => {
        const scaleY = reduce
          ? BAR_REST[i]
          : t.interpolate(curve((u) => 0.28 + 0.72 * Math.abs(Math.sin(Math.PI * (rate * u + BAR_PHASE[i]))), 32));
        return (
          <View key={i} style={{ width: w, height: h }}>
            {track ? <View style={[StyleSheet.absoluteFill, { borderRadius: corner, backgroundColor: alpha(color, 0.14) }]} /> : null}
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: corner, backgroundColor: color, transform: [{ scaleY }] }]} />
          </View>
        );
      })}
    </View>
  );
}
const BAR_RATE = [1, 2, 1, 2];
const BAR_PHASE = [0, 0.2, 0.55, 0.35];
const BAR_REST = [0.5, 0.9, 0.35, 0.7];

/** Two rings ripple out of a breathing core and fade (native scale/opacity). */
function Pulse({ size, color, speed, track, reduce }: BodyProps) {
  const t = useLoop(1700 / speed, linear, true, !reduce);
  const stroke = Math.max(1.5, size / 14);
  const core = size * 0.34;
  const ring = { width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {track ? <View style={[styles.abs, ring, { borderColor: alpha(color, 0.14) }]} /> : null}
      {[0, 0.5].map((phase, i) => (
        <Animated.View
          key={phase}
          style={[
            styles.abs,
            ring,
            reduce
              ? { opacity: i ? 0.25 : 0.55, transform: [{ scale: i ? 1 : 0.68 }] }
              : {
                  opacity: t.interpolate(curve((u) => Math.pow(1 - wrap(u - phase), 1.6))),
                  transform: [{ scale: t.interpolate(curve((u) => 0.34 + 0.66 * outCubic(wrap(u - phase)))) }],
                },
          ]}
        />
      ))}
      <Animated.View
        style={{
          width: core,
          height: core,
          borderRadius: core / 2,
          backgroundColor: color,
          transform: [{ scale: reduce ? 1 : t.interpolate(curve((u) => 0.86 + 0.14 * Math.cos(2 * Math.PI * u))) }],
        }}
      />
    </View>
  );
}

/** A dot (with a fading tail) laps a faint circle, easing through the top (native rotation). */
function Orbit({ size, color, speed, track, reduce }: BodyProps) {
  const t = useLoop(1400 / speed, linear, true, !reduce);
  const dot = Math.max(4, size * 0.24);
  const stroke = Math.max(1.5, size / 14);
  // Unwrapped angle, so a lagging tail stays continuous across the loop's restart.
  const angle = (x: number) => 360 * Math.floor(x) + 360 * (0.55 * wrap(x) + 0.45 * sine(wrap(x)));
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: dot / 2,
          top: dot / 2,
          width: size - dot,
          height: size - dot,
          borderRadius: (size - dot) / 2,
          borderWidth: stroke,
          borderColor: alpha(color, track ? 0.28 : 0.16),
        }}
      />
      {[0.08, 0.04, 0].map((lag, i) => (
        <Animated.View
          key={lag}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: [0.2, 0.4, 1][i],
              transform: [
                { rotate: reduce ? `${45 - lag * 300}deg` : t.interpolate(curveDeg((u) => angle(u - lag), 36)) },
              ],
            },
          ]}
        >
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: (size - dot) / 2,
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color,
              transform: [{ scale: [0.6, 0.8, 1][i] }],
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/** Three dots bounce in turn, squashing as they land (native translate/scale). */
function Bounce({ size, color, speed, reduce }: BodyProps) {
  const t = useLoop(1100 / speed, linear, true, !reduce);
  const dot = size / 5;
  const lift = size * 0.38;
  // Gravity parabola, plus a short squash around each landing.
  const height = (u: number) => 4 * u * (1 - u);
  const squash = (u: number) => Math.max(0, 1 - Math.min(u, 1 - u) / 0.1);
  return (
    <View style={[styles.row, { width: size, height: size, gap: dot / 2, alignItems: 'flex-end', paddingBottom: size * 0.16 }]}>
      {[0, 1, 2].map((i) => {
        const at = (u: number) => wrap(u - i * 0.14);
        const sy = (u: number) => 1 - 0.32 * squash(at(u));
        return (
          <Animated.View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color,
              transform: reduce
                ? [{ translateY: -lift * [1, 0.55, 0.15][i] }]
                : [
                    // Shift down by the squash so the dot stays on the floor.
                    { translateY: t.interpolate(curve((u) => -lift * height(at(u)) + (dot * (1 - sy(u))) / 2, 40)) },
                    { scaleX: t.interpolate(curve((u) => 1 + 0.28 * squash(at(u)), 40)) },
                    { scaleY: t.interpolate(curve(sy, 40)) },
                  ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Five dots ride a travelling sine wave, brightest at the crest (native translate/opacity). */
function Wave({ size, color, speed, reduce }: BodyProps) {
  const t = useLoop(1200 / speed, linear, true, !reduce);
  const dot = size / 7;
  const amp = size * 0.2;
  return (
    <View style={[styles.row, { gap: dot / 2, height: size }]}>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = (u: number) => Math.sin(2 * Math.PI * (u - i * 0.2));
        return (
          <Animated.View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: color,
              opacity: reduce ? 0.45 + 0.55 * ((y(0) + 1) / 2) : t.interpolate(curve((u) => 0.4 + 0.6 * ((y(u) + 1) / 2))),
              transform: [{ translateY: reduce ? -amp * y(0) : t.interpolate(curve((u) => -amp * y(u))) }],
            }}
          />
        );
      })}
    </View>
  );
}

/** 3×3 tiles light up in a diagonal sweep (native scale/opacity). */
function Grid({ size, color, speed, reduce }: BodyProps) {
  const { radius } = useKit();
  const t = useLoop(1300 / speed, linear, true, !reduce);
  const cell = size * 0.27;
  const gap = (size - cell * 3) / 2;
  return (
    <View style={{ width: size, height: size, gap }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={[styles.row, { gap }]}>
          {[0, 1, 2].map((col) => {
            const d = row + col; // diagonal 0 – 4
            const lit = (u: number) => hump(wrap(u - d * 0.1), 0.5);
            return (
              <Animated.View
                key={col}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: radius.scale(cell * 0.28),
                  backgroundColor: color,
                  opacity: reduce ? 1 - d * 0.18 : t.interpolate(curve((u) => 0.22 + 0.78 * lit(u))),
                  transform: [{ scale: reduce ? 1 : t.interpolate(curve((u) => 0.62 + 0.38 * lit(u))) }],
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Chat "is typing" bubble: three dots hop in turn inside a tinted bubble (native translate/opacity). */
function Typing({ size, color, speed, reduce }: BodyProps) {
  const { radius } = useKit();
  const t = useLoop(1300 / speed, linear, true, !reduce);
  const bh = size * 0.62;
  const dot = Math.max(2, size * 0.12);
  const tail = size * 0.15;
  const top = (size - bh) / 2 - size * 0.04;
  const bg = alpha(color, 0.16);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: top + bh - tail * 0.25, width: tail, height: tail, borderRadius: tail / 2, backgroundColor: bg }} />
      <View
        style={[
          styles.row,
          { position: 'absolute', left: 0, right: 0, top, height: bh, gap: dot * 0.65, borderRadius: radius.capsule(bh), backgroundColor: bg },
        ]}
      >
        {[0, 1, 2].map((i) => {
          const hop = (u: number) => hump(wrap(u - i * 0.16), 0.5);
          return (
            <Animated.View
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: color,
                opacity: reduce ? 0.45 + i * 0.27 : t.interpolate(curve((u) => 0.4 + 0.6 * hop(u))),
                transform: [{ translateY: reduce ? 0 : t.interpolate(curve((u) => -bh * 0.13 * hop(u))) }],
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Two arcs on the outer ring spin one way while an inner arc spins the other (native rotation). */
function Arc({ size, color, speed, track, reduce }: BodyProps) {
  const outer = useLoop(1150 / speed, linear, true, !reduce);
  const inner = useLoop(850 / speed, linear, true, !reduce);
  const stroke = Math.max(2, size / 11);
  const r1 = (size - stroke) / 2;
  const r2 = Math.max(stroke, r1 - stroke * 1.9);
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  const ring = (r: number, dash: string | undefined, opacity = 1) => (
    <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={opacity} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={dash} fill="none" />
  );
  const spin = (v: Animated.Value, dir: 1 | -1) => v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] });
  return (
    <View style={{ width: size, height: size }}>
      {track ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {ring(r1, undefined, 0.14)}
          {ring(r2, undefined, 0.14)}
        </Svg>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: reduce ? '30deg' : spin(outer, 1) }] }]}>
        <Svg width={size} height={size}>{ring(r1, `${c1 * 0.22} ${c1 * 0.28}`)}</Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: reduce ? '-60deg' : spin(inner, -1) }] }]}>
        <Svg width={size} height={size}>{ring(r2, `${c2 * 0.4} ${c2}`, 0.7)}</Svg>
      </Animated.View>
    </View>
  );
}

/**
 * A square turns a quarter at a time and rounds into a circle mid-turn: the corners fade off a
 * circle underneath (native rotation/scale/opacity — no borderRadius animation).
 */
function Square({ size, color, speed, reduce }: BodyProps) {
  const { radius } = useKit();
  const t = useLoop(1700 / speed, linear, true, !reduce);
  const side = size * 0.6;
  // Progress through the current quarter turn (two per loop); 1 at the very end, so the last sample is 180°.
  const half = (u: number) => (u < 0.5 ? u * 2 : u * 2 - 1);
  const morph = (u: number) => Math.sin(Math.PI * half(u));
  const fill = { position: 'absolute' as const, width: side, height: side, backgroundColor: color };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: side,
          height: side,
          transform: reduce
            ? [{ rotate: '45deg' }]
            : [
                { rotate: t.interpolate(curveDeg((u) => (u < 0.5 ? 0 : 90) + 90 * cubic(half(u)), 40)) },
                { scale: t.interpolate(curve((u) => 1 - 0.16 * morph(u), 40)) },
              ],
        }}
      >
        <View style={[fill, { borderRadius: side / 2 }]} />
        <Animated.View
          style={[
            fill,
            {
              borderRadius: radius.scale(side * 0.16),
              opacity: reduce ? 0.55 : t.interpolate(curve((u) => 1 - morph(u), 40)),
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/** Indeterminate progress line: a long and a short segment sweep left → right (native translateX). */
function Line({ size, color, speed, track, reduce }: BodyProps) {
  const { radius } = useKit();
  const h = lineThickness(size);
  const [w, setW] = useState(size * 4);
  const t = useLoop(1600 / speed, linear, true, !reduce);
  const seg = (len: number, start: number) => {
    const span = 1 - start;
    return t.interpolate(
      curve((u) => (u < start ? -len * w : -len * w + (1 + len) * w * cubic((u - start) / span)), 48),
    );
  };
  const bar = { position: 'absolute' as const, left: 0, top: 0, height: h, borderRadius: radius.capsule(h), backgroundColor: color };
  return (
    <View
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (next > 0) setW(next);
      }}
      style={{
        width: '100%',
        height: h,
        overflow: 'hidden',
        borderRadius: radius.capsule(h),
        backgroundColor: track || reduce ? alpha(color, 0.16) : 'transparent',
      }}
    >
      {reduce ? (
        <View style={[bar, { left: w * 0.3, width: w * 0.4 }]} />
      ) : (
        <>
          <Animated.View style={[bar, { width: w * 0.5, transform: [{ translateX: seg(0.5, 0) }] }]} />
          <Animated.View style={[bar, { width: w * 0.22, transform: [{ translateX: seg(0.22, 0.42) }] }]} />
        </>
      )}
    </View>
  );
}

/** Label whose three trailing dots fade in one after another (native opacity). */
function Ellipsis({
  text,
  speed,
  reduce,
  color,
  fontSize,
}: {
  text: string;
  speed: number;
  reduce: boolean;
  color: string;
  fontSize: number;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const t = useLoop(1400 / speed, linear, true, !reduce);
  const base = text.replace(/(…|\.{1,3})\s*$/, '');
  return (
    <View style={styles.ellipsis}>
      <Text style={[styles.label, ff, { color, fontSize }]}>{base}</Text>
      {[0, 1, 2].map((i) => (
        <Animated.Text
          key={i}
          style={[
            ff,
            {
              color,
              fontSize,
              fontWeight: '400',
              opacity: reduce
                ? 1
                : t.interpolate({
                    inputRange: [0, 0.15 + i * 0.18, 0.3 + i * 0.18, 0.85, 1],
                    outputRange: [0, 0, 1, 1, 0],
                  }),
            },
          ]}
        >
          .
        </Animated.Text>
      ))}
    </View>
  );
}

const BODIES: Record<SpinnerVariant, (p: BodyProps) => React.JSX.Element> = {
  ring: Ring,
  dots: Dots,
  bars: Bars,
  pulse: Pulse,
  orbit: Orbit,
  bounce: Bounce,
  wave: Wave,
  grid: Grid,
  typing: Typing,
  arc: Arc,
  square: Square,
  line: Line,
};

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  column: { flexDirection: 'column', alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  ellipsis: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
  label: { fontWeight: '400', flexShrink: 1 },
});
