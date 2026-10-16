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

export type SpinnerVariant = 'ring' | 'dots';
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
  /** Faint full circle behind the ring. */
  track?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<SpinnerSize, number> = { sm: 16, md: 24, lg: 36, xl: 52 };
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
 * Loading indicator — a comet arc whose tail fades out and breathes as it spins, or a soft wave of
 * dots. Optionally shows a label with an animated ellipsis. Rotation runs on the native driver.
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

  if (labelPosition === 'none' || !label) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={[styles.root, { width: px, height: px }, style]}
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
      <View style={[styles.root, { width: px, height: px }]}>{body}</View>
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
        const range = {
          inputRange: [0, s, s + 0.22, s + 0.44, 1],
          easing: sine,
        };
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
                : t.interpolate({
                    ...range,
                    outputRange: [0.35, 0.35, 1, 0.35, 0.35],
                  }),
              transform: reduce
                ? []
                : [
                    {
                      translateY: t.interpolate({
                        ...range,
                        outputRange: [0, 0, -size / 9, 0, 0],
                      }),
                    },
                    {
                      scale: t.interpolate({
                        ...range,
                        outputRange: [0.65, 0.65, 1.1, 0.65, 0.65],
                      }),
                    },
                  ],
            }}
          />
        );
      })}
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
  const t = useLoop(1400 / speed, linear, true, !reduce);
  const base = text.replace(/(…|\.{1,3})\s*$/, '');
  return (
    <View style={styles.ellipsis}>
      <Text style={[styles.label, { color, fontSize }]}>{base}</Text>
      {[0, 1, 2].map((i) => (
        <Animated.Text
          key={i}
          style={{
            color,
            fontSize,
            fontWeight: '400',
            opacity: reduce
              ? 1
              : t.interpolate({
                  inputRange: [0, 0.15 + i * 0.18, 0.3 + i * 0.18, 0.85, 1],
                  outputRange: [0, 0, 1, 1, 0],
                }),
          }}
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
};

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  column: { flexDirection: 'column', alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  ellipsis: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
  label: { fontWeight: '400', flexShrink: 1 },
});
