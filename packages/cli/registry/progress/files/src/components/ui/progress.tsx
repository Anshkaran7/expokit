import React, { useEffect, useId, useRef, useState } from 'react';
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
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type ProgressVariant = 'linear' | 'circular' | 'steps';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps {
  variant?: ProgressVariant | undefined;
  /** Current value, 0 → `max`. For `steps`, the number of completed steps. Omit for indeterminate. */
  value?: number | undefined;
  /** Upper bound (default 100, or `steps` for the steps variant). */
  max?: number | undefined;
  /** Sweeping / spinning animation when progress is unknown. Also implied by an undefined `value`. */
  indeterminate?: boolean | undefined;
  /** Number of segments for the `steps` variant (default 4). */
  steps?: number | undefined;
  size?: ProgressSize | undefined;
  /** Fill colour (default: theme accent). Fills are solid; tracks and glows are tints of it. */
  color?: string | undefined;
  trackColor?: string | undefined;
  /** Caption above a linear / steps bar, or under the ring. */
  label?: string | undefined;
  /** Show the percentage (linear: right of the label, circular: in the middle). */
  showValue?: boolean | undefined;
  /** Custom text in place of the percentage. */
  formatValue?: ((value: number, max: number) => string) | undefined;
  /** Reaching `max` flashes the fill and turns the value into a drawn check (default true). */
  celebrate?: boolean | undefined;
  /** Animated diagonal stripes on the linear fill, for "processing" states. */
  striped?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const BAR = { sm: 4, md: 8, lg: 12 };
const RING = {
  sm: { d: 44, w: 4, font: 11 },
  md: { d: 72, w: 6, font: 16 },
  lg: { d: 112, w: 9, font: 24 },
};
const WHITE = '#ffffff';
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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

/** True only on the render where `on` flips from false to true. */
function useBecameTrue(on: boolean) {
  const [prev, setPrev] = useState(on);
  const [fired, setFired] = useState(0);
  if (on !== prev) {
    setPrev(on);
    if (on) setFired((n) => n + 1);
  }
  return fired;
}

/**
 * Progress in three shapes — a solid bar with a soft glowing head (determinate, indeterminate or
 * striped), an SVG ring whose percentage counts up and morphs into a check, and segmented steps that pop
 * as they fill. Reaching `max` plays a short success moment. Transforms run on the native driver.
 */
export function Progress({
  variant = 'linear',
  value,
  max,
  indeterminate,
  steps = 4,
  size = 'md',
  color,
  trackColor,
  label,
  showValue,
  formatValue,
  celebrate = true,
  striped = false,
  style,
}: ProgressProps) {
  const { colors, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const top = max ?? (variant === 'steps' ? steps : 100);
  const unknown = indeterminate || value === undefined;
  const v = clamp(value ?? 0, 0, top);
  const ratio = top > 0 ? v / top : 0;
  const complete = !unknown && top > 0 && v >= top;
  const done = complete && celebrate;
  const tint = color ?? colors.accent;
  const track = trackColor ?? alpha(colors.foreground, dark ? 0.12 : 0.08);
  const text = formatValue ? formatValue(v, top) : `${Math.round(ratio * 100)}%`;
  const a11y = {
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: label,
    accessibilityState: { busy: unknown },
    accessibilityValue: unknown ? undefined : { min: 0, max: top, now: v, text },
  };

  if (variant === 'circular') {
    return (
      <View {...a11y} style={[styles.ringRoot, style]}>
        <Ring
          ratio={ratio}
          unknown={unknown}
          size={size}
          tint={tint}
          track={track}
          showValue={showValue ?? !unknown}
          format={formatValue ? () => text : undefined}
          fg={colors.foreground}
          done={done}
          reduce={reduce}
        />
        {label ? <Text style={[styles.ringLabel, ff, { color: colors.mutedForeground }]}>{label}</Text> : null}
      </View>
    );
  }

  const valueShown = showValue && !unknown;
  const checkShown = done && (!!label || !!showValue);
  const header =
    label || valueShown ? (
      <View style={styles.header}>
        <Text numberOfLines={1} style={[styles.label, ff, { color: colors.foreground }]}>
          {label}
        </Text>
        {checkShown ? (
          <DrawnCheck color={tint} size={18} />
        ) : valueShown ? (
          <Text style={[styles.value, ff, { color: colors.mutedForeground }]}>{text}</Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View {...a11y} style={style}>
      {header}
      {variant === 'steps' ? (
        <Steps
          count={Math.max(1, Math.round(steps))}
          done={unknown ? 0 : ratio * Math.max(1, Math.round(steps))}
          height={BAR[size]}
          tint={tint}
          track={track}
          finished={complete}
          reduce={reduce}
        />
      ) : (
        <Bar
          ratio={ratio}
          unknown={unknown}
          height={BAR[size]}
          tint={tint}
          track={track}
          striped={striped}
          done={done}
          reduce={reduce}
        />
      )}
    </View>
  );
}

/** Soft radial light in the fill colour, fading to transparent. */
function Glow({ size, color, id }: { size: number; color: string; id: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.6} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Circle + tick that draw themselves (stroke offset, JS driver) inside a springy wrapper (native). */
function DrawnCheck({ color, size, ring = true }: { color: string; size: number; ring?: boolean }) {
  const [draw] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.timing(draw, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      ...motion.bouncy,
    }).start();
  }, [draw, pop]);
  const circle = draw.interpolate({
    inputRange: [0, 0.6],
    outputRange: [57, 0],
    extrapolate: 'clamp',
  });
  const tick = draw.interpolate({
    inputRange: [ring ? 0.45 : 0, 1],
    outputRange: [13, 0],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {ring ? (
          <>
            <Circle cx={12} cy={12} r={9} fill={alpha(color, 0.14)} />
            <AnimatedCircle
              cx={12}
              cy={12}
              r={9}
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeDasharray="57 57"
              strokeDashoffset={circle}
              transform="rotate(-90 12 12)"
              fill="none"
            />
          </>
        ) : null}
        <AnimatedPath
          d={ring ? 'M8 12.4l2.7 2.7L16.2 9.4' : 'M5.5 12.6l4.3 4.3L18.5 7.6'}
          stroke={color}
          strokeWidth={ring ? 2.2 : 2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={ring ? '13 13' : '20 20'}
          strokeDashoffset={ring ? tick : draw.interpolate({ inputRange: [0, 1], outputRange: [20, 0] })}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function Bar({
  ratio,
  unknown,
  height,
  tint,
  track,
  striped,
  done,
  reduce,
}: {
  ratio: number;
  unknown: boolean;
  height: number;
  tint: string;
  track: string;
  striped: boolean;
  done: boolean;
  reduce: boolean;
}) {
  const { radius } = useKit();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  // All native-driven: they only feed transform / opacity.
  const [fill] = useState(() => new Animated.Value(ratio));
  const [sweep] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  const [stripe] = useState(() => new Animated.Value(0));
  const celebrated = useBecameTrue(done);

  useEffect(() => {
    Animated.spring(fill, {
      toValue: ratio,
      useNativeDriver: true,
      ...motion.gentle,
    }).start();
  }, [ratio, fill]);

  useEffect(() => {
    if (!unknown) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [unknown, sweep]);

  useEffect(() => {
    if (!celebrated || reduce) return;
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(flash, {
        toValue: 0,
        duration: 620,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [celebrated, reduce, flash]);

  const stripesOn = striped && !unknown;
  useEffect(() => {
    stripe.setValue(0);
    if (!stripesOn || reduce) return;
    const loop = Animated.loop(
      Animated.timing(stripe, {
        toValue: 1,
        duration: 700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [stripesOn, reduce, stripe]);

  const corner = radius.capsule(height);
  const glow = Math.max(18, height * 3.4);
  const comet = width * 0.42;
  const period = Math.max(10, height * 2.2);

  // The fill is full width and slides in from the left, so its rounded end never distorts.
  const translateX = unknown
    ? sweep.interpolate({ inputRange: [0, 1], outputRange: [-comet, width] })
    : fill.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  const glowX = unknown
    ? sweep.interpolate({
        inputRange: [0, 1],
        outputRange: [-height / 2 - glow / 2, width + comet - height / 2 - glow / 2],
      })
    : fill.interpolate({
        inputRange: [0, 1],
        outputRange: [-height / 2 - glow / 2, width - height / 2 - glow / 2],
      });
  const glowOpacity = unknown
    ? sweep.interpolate({
        inputRange: [0, 0.15, 0.8, 1],
        outputRange: [0, 1, 1, 0],
      })
    : fill.interpolate({
        inputRange: [0, 0.03, 1],
        outputRange: [0, 1, 1],
        extrapolate: 'clamp',
      });

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.barWrap}>
      <View style={[styles.track, { height, borderRadius: corner, backgroundColor: track }]}>
        {width > 0 ? (
          <Animated.View
            style={[
              styles.fill,
              {
                width: unknown ? comet : width,
                height,
                borderRadius: corner,
                transform: [{ translateX }],
              },
            ]}
          >
            {unknown ? (
              // The sweeping comet's tail fades out in the same colour (alpha only, no second hue).
              <Svg width={comet} height={height} style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={`${id}fill`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={tint} stopOpacity={0} />
                    <Stop offset="0.6" stopColor={tint} stopOpacity={0.85} />
                    <Stop offset="1" stopColor={tint} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${id}fill)`} />
              </Svg>
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
            )}
            {stripesOn ? (
              <Animated.View
                style={[
                  styles.stripes,
                  {
                    left: -period,
                    width: width + period * 2,
                    transform: [
                      {
                        translateX: stripe.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, period],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Svg width={width + period * 2} height={height}>
                  {Array.from({ length: Math.ceil(width / period) + 3 }, (_, i) => {
                    const x = i * period - height;
                    return (
                      <Polygon
                        key={i}
                        points={`${x},${height} ${x + height},0 ${x + height + period / 2},0 ${x + period / 2},${height}`}
                        fill={alpha(readableOn(tint), 0.2)}
                      />
                    );
                  })}
                </Svg>
              </Animated.View>
            ) : null}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: WHITE,
                  opacity: flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.45],
                  }),
                },
              ]}
            />
          </Animated.View>
        ) : null}
      </View>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              top: (height - glow) / 2,
              opacity: glowOpacity,
              transform: [
                { translateX: glowX },
                {
                  scale: flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.7],
                  }),
                },
              ],
            },
          ]}
        >
          <Glow size={glow} color={tint} id={`${id}glow`} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Steps({
  count,
  done,
  height,
  tint,
  track,
  finished,
  reduce,
}: {
  count: number;
  done: number;
  height: number;
  tint: string;
  track: string;
  finished: boolean;
  reduce: boolean;
}) {
  // Remember where the last change started so the segments that change fill one after another.
  const [prev, setPrev] = useState(done);
  const [from, setFrom] = useState(done);
  if (done !== prev) {
    setFrom(prev);
    setPrev(done);
  }
  const current = finished || done >= count ? -1 : Math.floor(done);
  return (
    <View style={[styles.steps, { gap: Math.max(4, height * 0.75) }]}>
      {Array.from({ length: count }, (_, i) => {
        const delay =
          done >= from ? Math.max(0, i - Math.floor(from)) * 110 : Math.max(0, Math.ceil(from) - 1 - i) * 70;
        return (
          <Segment
            key={i}
            fill={clamp(done - i, 0, 1)}
            delay={delay}
            height={height}
            tint={tint}
            track={track}
            pulse={i === current && !reduce}
            reduce={reduce}
          />
        );
      })}
    </View>
  );
}

function Segment({
  fill,
  delay,
  height,
  tint,
  track,
  pulse,
  reduce,
}: {
  fill: number;
  delay: number;
  height: number;
  tint: string;
  track: string;
  pulse: boolean;
  reduce: boolean;
}) {
  const { radius } = useKit();
  const [v] = useState(() => new Animated.Value(fill));
  const [pop] = useState(() => new Animated.Value(1));
  const [glow] = useState(() => new Animated.Value(0));
  const prevFill = useRef(fill);

  useEffect(() => {
    // A segment that just became full gets a little pop as its fill lands.
    const popping = fill >= 1 && prevFill.current < 1 && !reduce;
    prevFill.current = fill;
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(v, {
          toValue: fill,
          useNativeDriver: true,
          ...motion.snappy,
        }),
        popping
          ? Animated.sequence([
              Animated.delay(120),
              Animated.timing(pop, {
                toValue: 1.18,
                duration: 110,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.spring(pop, {
                toValue: 1,
                useNativeDriver: true,
                ...motion.bouncy,
              }),
            ])
          : Animated.delay(0),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [fill, delay, reduce, v, pop]);

  useEffect(() => {
    glow.setValue(0);
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, glow]);

  return (
    <Animated.View
      style={[
        styles.segment,
        {
          height,
          borderRadius: radius.capsule(height),
          backgroundColor: track,
          transform: [
            { scaleY: pop },
            {
              scaleX: pop.interpolate({
                inputRange: [1, 1.18],
                outputRange: [1, 1.04],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: tint,
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.3],
            }),
          },
        ]}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.segmentFill, { backgroundColor: tint, transform: [{ scaleX: v }] }]}
      />
    </Animated.View>
  );
}

/** The ring's live percentage. Owns the per-frame listener so only this text re-renders, not the SVG. */
function RingPercent({ fill, initial }: { fill: Animated.Value; initial: number }) {
  const [shown, setShown] = useState(Math.round(initial * 100));
  useEffect(() => {
    const listener = fill.addListener(({ value }) => setShown(Math.round(clamp(value, 0, 1) * 100)));
    return () => fill.removeListener(listener);
  }, [fill]);
  return <>{shown}</>;
}

function Ring({
  ratio,
  unknown,
  size,
  tint,
  track,
  showValue,
  format,
  fg,
  done,
  reduce,
}: {
  ratio: number;
  unknown: boolean;
  size: ProgressSize;
  tint: string;
  track: string;
  showValue: boolean;
  format?: (() => string) | undefined;
  fg: string;
  done: boolean;
  reduce: boolean;
}) {
  const { d, w, font } = RING[size];
  const kit = useKit();
  const ff = kit.font.family ? { fontFamily: kit.font.family } : null;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = (d - w) / 2;
  const c = 2 * Math.PI * r;
  const glow = Math.max(14, w * 3.4);
  const target = unknown ? 0.25 : ratio;
  // `fill` drives the SVG stroke (JS driver). `turn` mirrors it on the native driver to carry the
  // glowing dot, and `spin` / `morph` / `flash` are native too — each on its own view.
  const [fill] = useState(() => new Animated.Value(target));
  const [turn] = useState(() => new Animated.Value(target));
  const [spin] = useState(() => new Animated.Value(0));
  const [morph] = useState(() => new Animated.Value(done ? 1 : 0));
  const [flash] = useState(() => new Animated.Value(0));
  const celebrated = useBecameTrue(done);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fill, {
        toValue: target,
        useNativeDriver: false,
        ...motion.gentle,
      }),
      Animated.spring(turn, {
        toValue: target,
        useNativeDriver: true,
        ...motion.gentle,
      }),
    ]).start();
  }, [target, fill, turn]);

  useEffect(() => {
    Animated.spring(morph, {
      toValue: done ? 1 : 0,
      useNativeDriver: true,
      ...motion.snappy,
    }).start();
  }, [done, morph]);

  useEffect(() => {
    if (!celebrated || reduce) return;
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(flash, {
        toValue: 0,
        duration: 620,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [celebrated, reduce, flash]);

  useEffect(() => {
    spin.setValue(0);
    if (!unknown) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [unknown, spin]);

  const offset = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [c, 0],
    extrapolate: 'clamp',
  });
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const dotTurn = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ width: d, height: d }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        {/* Rotated -90° so the stroke starts at 12 o'clock. */}
        <View style={styles.startAtTop}>
          <Svg width={d} height={d}>
            <Circle cx={d / 2} cy={d / 2} r={r} stroke={track} strokeWidth={w} fill="none" />
            <AnimatedCircle
              cx={d / 2}
              cy={d / 2}
              r={r}
              stroke={tint}
              strokeWidth={w}
              strokeLinecap="round"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={offset}
              fill="none"
            />
          </Svg>
        </View>
        {/* The glowing dot rides the end of the arc. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: dotTurn }] }]}>
          <Animated.View
            style={[
              styles.ringDot,
              {
                left: d / 2 - glow / 2,
                top: w / 2 - glow / 2,
                opacity: turn.interpolate({
                  inputRange: [0, 0.02, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: flash.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.8],
                    }),
                  },
                ],
              },
            ]}
          >
            <Glow size={glow} color={tint} id={`${id}dot`} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {showValue && !unknown ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Animated.View
            style={{
              opacity: morph.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
              transform: [
                {
                  scale: morph.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.5],
                  }),
                },
              ],
            }}
          >
            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.ringValue, ff, { color: fg, fontSize: font }]}>
              {format ? format() : <RingPercent fill={fill} initial={ratio} />}
              {format ? null : (
                <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: font * 0.6, color: alpha(fg, 0.55) }}>
                  %
                </Text>
              )}
            </Text>
          </Animated.View>
          {done ? (
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: morph }]}>
              <DrawnCheck color={tint} size={Math.round(font * 1.7)} ring={false} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    minHeight: 18,
  },
  label: { flexShrink: 1, fontSize: 14, fontWeight: '400' },
  value: { fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  barWrap: { alignSelf: 'stretch' },
  track: { overflow: 'hidden', alignSelf: 'stretch' },
  fill: { overflow: 'hidden' },
  stripes: { position: 'absolute', top: 0, bottom: 0 },
  glow: { position: 'absolute', left: 0 },
  steps: { flexDirection: 'row', alignSelf: 'stretch' },
  segment: { flex: 1, overflow: 'hidden' },
  segmentFill: { transformOrigin: 'left center' },
  ringRoot: { alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  ringLabel: { fontSize: 13, fontWeight: '400' },
  ringDot: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  startAtTop: { transform: [{ rotate: '-90deg' }] },
  ringValue: {
    fontWeight: '400',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
