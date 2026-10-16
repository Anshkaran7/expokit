import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { useChartTheme } from "./theme";

export const AnimatedRect = Animated.createAnimatedComponent(Rect);
export const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const AnimatedPath = Animated.createAnimatedComponent(Path);

export const DEFAULT_PALETTE = [
  "#2563EB",
  "#7C3AED",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#84CC16",
];

export const DEFAULT_THEME = {
  labelColor: "#64748B",
  gridColor: "#E2E8F0",
  tooltipBackground: "#0F172A",
  tooltipTextColor: "#FFFFFF",
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const format = (n: number, suffix: string) =>
    `${sign}${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10}${suffix}`;
  if (abs >= 1e9) return format(abs / 1e9, "B");
  if (abs >= 1e6) return format(abs / 1e6, "M");
  if (abs >= 1e3) return format(abs / 1e3, "k");
  return format(abs, "");
}

/** Rounded axis ticks ("nice numbers") covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4) {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    min = min === 0 ? 0 : min * 0.9;
    max = max === 0 ? 1 : max * 1.1;
  }
  const rawStep = (max - min) / Math.max(count, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
  const normalized = rawStep / magnitude;
  const step =
    (normalized >= 5 ? 10 : normalized >= 2.5 ? 5 : normalized >= 1.2 ? 2.5 : 1) *
    magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) {
    ticks.push(Math.round(t / step) * step);
  }
  return { min: lo, max: hi, ticks };
}

/** Rough text width for SVG layout (no native text measuring in SVG). */
export const estimateTextWidth = (text: string, fontSize: number) =>
  text.length * fontSize * 0.62;

/** How many x labels fit: returns the step so labels never collide. */
export const labelStep = (count: number, plotWidth: number, minGap = 44) =>
  Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / minGap))));

/**
 * Per-point tangents for monotone cubic interpolation (Steffen 1990, same as
 * d3.curveMonotoneX): smooth at any density, never overshoots the data.
 */
export function monotoneTangents(p: { x: number; y: number }[]): number[] {
  const n = p.length;
  const t = new Array<number>(n).fill(0);
  if (n < 2) return t;
  const slope = (a: { x: number; y: number }, b: { x: number; y: number }) => (b.x - a.x === 0 ? 0 : (b.y - a.y) / (b.x - a.x));
  for (let i = 1; i < n - 1; i++) {
    const h0 = p[i].x - p[i - 1].x;
    const h1 = p[i + 1].x - p[i].x;
    const s0 = slope(p[i - 1], p[i]);
    const s1 = slope(p[i], p[i + 1]);
    const mid = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(mid)) || 0;
  }
  // Endpoints: one-sided three-point estimate, as in d3.
  const end = (a: { x: number; y: number }, b: { x: number; y: number }, inner: number) => {
    const h = b.x - a.x;
    return h ? (3 * (b.y - a.y) / h - inner) / 2 : inner;
  };
  if (n === 2) {
    t[0] = t[1] = slope(p[0], p[1]);
  } else {
    t[0] = end(p[0], p[1], t[1]);
    t[n - 1] = end(p[n - 2], p[n - 1], t[n - 2]);
  }
  return t;
}

const fin = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

/** Smooth path through points (monotone cubic: never overshoots the data). */
export function smoothPath(points: { x: number; y: number }[], curved = true) {
  const t = curved ? monotoneTangents(points) : null;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${fin(point.x)} ${fin(point.y)}`;
    if (!t) return `${path} L ${fin(point.x)} ${fin(point.y)}`;
    const previous = points[index - 1];
    const dx = (point.x - previous.x) / 3;
    return `${path} C ${fin(previous.x + dx)} ${fin(previous.y + dx * t[index - 1])}, ${fin(point.x - dx)} ${fin(point.y - dx * t[index])}, ${fin(point.x)} ${fin(point.y)}`;
  }, "");
}

export const approxPathLength = (points: { x: number; y: number }[]) =>
  points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    const previous = points[index - 1];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0) *
    1.2 +
  10;

/** Single 0→1 progress value that replays whenever `replayKey` changes. */
export function useEntrance(
  animate: boolean,
  replayKey: string,
  duration = 800,
  useNativeDriver = false
) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, replayKey]);
  return progress;
}

interface AnimatedValuesOptions {
  animate?: boolean;
  duration?: number;
  delay?: (index: number) => number;
  /** Starting value for freshly created values. Defaults to 0; "target" starts at the target. */
  from?: number | "target";
  easing?: (value: number) => number;
}

/**
 * One Animated.Value per target. When targets change, every value morphs from
 * where it currently is to its new target, so data updates glide instead of jump.
 */
export function useAnimatedValues(
  targets: number[],
  {
    animate = true,
    duration = 650,
    delay,
    from = 0,
    easing = Easing.out(Easing.cubic),
  }: AnimatedValuesOptions = {}
) {
  const values = useRef<Animated.Value[]>([]);
  if (values.current.length !== targets.length) {
    values.current = targets.map(
      (target, index) =>
        values.current[index] ??
        new Animated.Value(!animate || from === "target" ? target : from)
    );
  }
  const key = targets.join("|");
  useEffect(() => {
    if (!animate) {
      values.current.forEach((value, index) => value.setValue(targets[index]));
      return;
    }
    const animation = Animated.parallel(
      values.current.map((value, index) =>
        Animated.timing(value, {
          toValue: targets[index],
          duration,
          delay: delay ? delay(index) : 0,
          easing,
          useNativeDriver: false,
        })
      )
    );
    animation.start();
    return () => animation.stop();
  }, [key, animate]);
  return values.current;
}

interface TouchLayerProps {
  /** Finger down / dragging. Coordinates are relative to the chart. */
  onMove?: (x: number, y: number) => void;
  onTap?: (x: number, y: number) => void;
  onRelease?: (wasTap: boolean) => void;
  /** Horizontal scrubbing claims the gesture so a parent ScrollView can't steal it. */
  scrub?: boolean;
  /**
   * Claim the gesture on touch-down in any direction (dials, knobs). Pass a hit-test to
   * claim only touches on the control; other touches pass through to the page scroll.
   */
  lockOnGrant?: boolean | ((x: number, y: number) => boolean);
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /**
   * Web: mouse hover without pressing. Defaults to `onMove` so scrubbing charts
   * follow the cursor; tap-only charts pass a non-toggling selector here.
   */
  onHover?: (x: number, y: number) => void;
  /** Web: cursor left the chart. Defaults to `onRelease(false)`. */
  onHoverEnd?: () => void;
}

// Android: a JS responder blocks the native ScrollView from intercepting, so
// claiming on touch-down would freeze page scrolling whenever a swipe starts on
// a chart. There we claim only once a horizontal scrub (or a dial) starts, and
// handle taps / touch-down previews with raw touch events instead.
const DEFER_CLAIM = Platform.OS === "android";

/**
 * Transparent overlay that turns touches into chart coordinates. Using a plain
 * View (instead of SVG onPress) keeps coordinates reliable on old and new arch.
 */
export function TouchLayer(props: TouchLayerProps) {
  const latest = useRef(props);
  latest.current = props;
  const gesture = useRef({ x: 0, y: 0, time: 0, moved: false, scrubbing: false });
  // Android raw-touch state for gestures the responder never claimed.
  const raw = useRef({ x: 0, y: 0, time: 0, moved: false, claimed: false });
  const preview = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A hit-test lock: touches outside the control pass straight through (to the page scroll).
  const ignored = useRef(false);
  const lockAt = (x: number, y: number) => {
    const lock = latest.current.lockOnGrant;
    ignored.current = typeof lock === "function" && !lock(x, y);
    return !!lock && !ignored.current;
  };
  const stopPreview = () => {
    if (preview.current) clearTimeout(preview.current);
    preview.current = null;
  };
  useEffect(() => stopPreview, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          const locked = lockAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
          return !ignored.current && (!DEFER_CLAIM || locked);
        },
        onMoveShouldSetPanResponder: (_, state) =>
          ignored.current ? false :
          !DEFER_CLAIM ||
          (!!latest.current.scrub && Math.abs(state.dx) > 4 && Math.abs(state.dx) > Math.abs(state.dy)),
        onPanResponderTerminationRequest: () => !gesture.current.scrubbing,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          gesture.current = {
            x: locationX,
            y: locationY,
            time: Date.now(),
            moved: false,
            scrubbing: false,
          };
          raw.current.claimed = true;
          stopPreview();
          // A deferred claim only happens once a horizontal drag is under way.
          const locked = !!latest.current.lockOnGrant && !ignored.current;
          if (locked || (DEFER_CLAIM && latest.current.scrub)) {
            gesture.current.moved = !locked;
            gesture.current.scrubbing = true;
            latest.current.onScrubStart?.();
          }
          latest.current.onMove?.(locationX, locationY);
        },
        onPanResponderMove: (_, state) => {
          const current = gesture.current;
          if (Math.abs(state.dx) > 6 || Math.abs(state.dy) > 6) current.moved = true;
          if (
            latest.current.scrub &&
            !current.scrubbing &&
            Math.abs(state.dx) > 4 &&
            Math.abs(state.dx) > Math.abs(state.dy)
          ) {
            current.scrubbing = true;
            latest.current.onScrubStart?.();
          }
          latest.current.onMove?.(current.x + state.dx, current.y + state.dy);
        },
        onPanResponderRelease: () => {
          const current = gesture.current;
          const wasTap = !current.moved && Date.now() - current.time < 400;
          if (wasTap) latest.current.onTap?.(current.x, current.y);
          if (current.scrubbing) latest.current.onScrubEnd?.();
          latest.current.onRelease?.(wasTap);
        },
        onPanResponderTerminate: () => {
          if (gesture.current.scrubbing) latest.current.onScrubEnd?.();
          latest.current.onRelease?.(false);
        },
      }),
    []
  );

  const hovering = useRef(false);
  const hover =
    Platform.OS === "web"
      ? {
          onPointerMove: (event: any) => {
            const e = event.nativeEvent ?? event;
            // Mouse/pen hover only; touches and drags go through the responder.
            if (e.pointerType === "touch" || e.buttons) return;
            const handler = latest.current.onHover ?? latest.current.onMove;
            if (!handler) return;
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            hovering.current = true;
            handler(e.clientX - rect.left, e.clientY - rect.top);
          },
          onPointerLeave: () => {
            if (!hovering.current) return;
            hovering.current = false;
            if (latest.current.onHoverEnd) latest.current.onHoverEnd();
            else latest.current.onRelease?.(false);
          },
        }
      : null;

  const touches = DEFER_CLAIM
    ? {
        onTouchStart: (event: any) => {
          const { locationX, locationY } = event.nativeEvent;
          const locked = lockAt(locationX, locationY);
          raw.current = { x: locationX, y: locationY, time: Date.now(), moved: false, claimed: locked || ignored.current };
          // Preview only once the finger rests (Android's tap timeout), so a swipe that
          // turns into page scrolling never selects anything on its way past.
          stopPreview();
          if (!raw.current.claimed) {
            preview.current = setTimeout(() => {
              preview.current = null;
              const r = raw.current;
              if (!r.moved && !r.claimed) latest.current.onMove?.(r.x, r.y);
            }, 100);
          }
        },
        onTouchMove: (event: any) => {
          const { locationX, locationY } = event.nativeEvent;
          const r = raw.current;
          if (Math.abs(locationX - r.x) > 6 || Math.abs(locationY - r.y) > 6) {
            r.moved = true;
            stopPreview();
          }
        },
        onTouchEnd: () => {
          stopPreview();
          const r = raw.current;
          if (r.claimed) return; // the responder's release handles it
          const wasTap = !r.moved && Date.now() - r.time < 400;
          if (wasTap) latest.current.onTap?.(r.x, r.y);
          latest.current.onRelease?.(wasTap);
        },
        // The ScrollView took over (vertical swipe).
        onTouchCancel: () => {
          stopPreview();
          if (!raw.current.claimed) latest.current.onRelease?.(false);
        },
      }
    : null;

  return (
    <View
      style={[StyleSheet.absoluteFill, Platform.OS === "web" ? ({ cursor: "crosshair" } as any) : null]}
      {...responder.panHandlers}
      {...touches}
      {...hover}
    />
  );
}

interface SvgTooltipProps {
  x: number;
  y: number;
  lines: string[];
  boundsWidth: number;
  boundsHeight: number;
  background: string;
  color: string;
  fontSize?: number;
}

/** Rounded tooltip that flips below the anchor and stays inside the chart. */
export function SvgTooltip({
  x,
  y,
  lines,
  boundsWidth,
  boundsHeight,
  background,
  color,
  fontSize = 11,
}: SvgTooltipProps) {
  const lineHeight = fontSize + 5;
  const width =
    Math.max(...lines.map((line) => estimateTextWidth(line, fontSize))) + 18;
  const height = lines.length * lineHeight + 8;
  let left = clamp(x - width / 2, 2, Math.max(2, boundsWidth - width - 2));
  let top = y - height - 10;
  if (top < 2) {
    // No room above: sit beside the anchor so the selected mark stays visible.
    const right = x + 14;
    const leftSide = x - 14 - width;
    if (right + width <= boundsWidth - 2) left = right;
    else if (leftSide >= 2) left = leftSide;
    top = left === right || left === leftSide ? y : y + 12;
  }
  top = clamp(top, 2, Math.max(2, boundsHeight - height - 2));

  return (
    <G>
      <Rect x={left} y={top} width={width} height={height} rx={8} fill={background} />
      {lines.map((line, index) => (
        <SvgText
          key={`${line}-${index}`}
          x={left + width / 2}
          y={top + 4 + index * lineHeight + fontSize}
          fill={color}
          fontSize={fontSize}
          fontWeight={index === 0 ? "500" : "400"}
          textAnchor="middle"
        >
          {line}
        </SvgText>
      ))}
    </G>
  );
}

/**
 * Wraps a chart so it fills its parent's width when no `width` prop is given,
 * and re-lays out on rotation / split screen / tablets.
 */
export function responsive<P extends { width?: number; style?: StyleProp<ViewStyle> }>(
  Inner: React.ComponentType<P & { width: number }>,
  placeholderHeight: (props: P) => number
) {
  const Responsive = (rawProps: P) => {
    const [measured, setMeasured] = useState(0);
    const theme = useChartTheme();
    // Theme supplies colours unless the caller passed their own.
    const props = { ...rawProps } as any;
    const themed: Record<string, unknown> = {
      labelColor: theme.mutedForeground,
      gridColor: theme.border,
      tooltipBackground: theme.foreground,
      tooltipTextColor: theme.background,
      palette: theme.palette,
    };
    Object.keys(themed).forEach((key) => {
      if (props[key] === undefined) props[key] = themed[key];
    });
    const width = rawProps.width ?? measured;

    return (
      <View style={props.style}>
        <View
          onLayout={
            props.width === undefined
              ? (event) => {
                  const next = Math.floor(event.nativeEvent.layout.width);
                  setMeasured((previous) => (previous === next ? previous : next));
                }
              : undefined
          }
        >
          {width > 0 ? (
            <Inner {...props} width={width} />
          ) : (
            <View style={{ height: placeholderHeight(props) }} />
          )}
        </View>
      </View>
    );
  };
  Responsive.displayName = `Responsive(${Inner.displayName ?? Inner.name ?? "Chart"})`;
  return Responsive;
}
