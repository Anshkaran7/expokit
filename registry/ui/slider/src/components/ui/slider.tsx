import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

/**
 * - `default` — thin track with a round thumb (iOS / Material).
 * - `bar` — a tall rounded bar with a flat fill and no thumb, like the iOS Control Center volume
 *   bar. Put an `icon` (and the value, with `showValue="always"`) inside it.
 * - `stepped` — a slightly thicker track with a dot at every step; the thumb snaps between them.
 */
export type SliderVariant = 'default' | 'bar' | 'stepped';
export type SliderSize = 'sm' | 'md' | 'lg';
export type SliderValue = number | [number, number];
export type SliderMark = number | { value: number; label?: string };
/** Built-in icons for `leftIcon` / `rightIcon` / `icon`. */
export type SliderIconName = 'volume-low' | 'volume-high' | 'volume-off' | 'sun-low' | 'sun-high' | 'minus' | 'plus';
/** A built-in icon name, any node, or a function that receives the colour to draw in. */
export type SliderIconProp = SliderIconName | React.ReactNode | ((color: string) => React.ReactNode);

interface SliderBaseProps {
  min?: number;
  max?: number;
  /** Snap interval. 0 makes the slider continuous. */
  step?: number;
  /** See `SliderVariant`. */
  variant?: SliderVariant;
  size?: SliderSize;
  /** `true` draws a dot at every step (default for `stepped`); or pass values with optional labels. */
  marks?: boolean | SliderMark[];
  /**
   * Value tooltip above the thumb: only while dragging, always, or never.
   * Default `drag`, or `never` for the `bar` variant — where `always` shows the value inside the bar.
   */
  showValue?: 'drag' | 'always' | 'never';
  formatValue?: (value: number) => string;
  /** Shows the formatted min and max under the track. */
  showMinMax?: boolean;
  /** Custom text under the start of the track (implies `showMinMax`). */
  minLabel?: string;
  /** Custom text under the end of the track (implies `showMinMax`). */
  maxLabel?: string;
  /** Icon before the track. Built-in names step the value down when tapped. */
  leftIcon?: SliderIconProp;
  /** Icon after the track. Built-in names step the value up when tapped. */
  rightIcon?: SliderIconProp;
  /** `bar` only: an icon inside the start of the bar. It changes colour as the fill passes over it. */
  icon?: SliderIconProp;
  /** Draws the active fill thicker than the track (`default` variant). */
  thickFill?: boolean;
  /** Bar heights drawn above the track (e.g. price distribution). Bars inside the selection use the accent. */
  histogram?: number[];
  /** Height of the histogram in points. */
  histogramHeight?: number;
  disabled?: boolean;
  /** Fill colour (default: theme accent). */
  accent?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** The inactive track. */
  trackStyle?: StyleProp<ViewStyle>;
  /** The active fill (e.g. `{ backgroundColor }`). */
  fillStyle?: StyleProp<ViewStyle>;
  /** The round thumb (`default` / `stepped`). */
  thumbStyle?: StyleProp<ViewStyle>;
  /** The value text: tooltip, in-bar value and min / max labels. */
  labelStyle?: StyleProp<TextStyle>;
}

/** One thumb: `value` is a number. */
export interface SliderSingleProps extends SliderBaseProps {
  range?: false;
  value?: number;
  defaultValue?: number;
  /** Fires whenever the (stepped) value changes while dragging, tapping or via accessibility actions. */
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
}

/** Two thumbs selecting a span: `value` is `[from, to]`. */
export interface SliderRangeProps extends SliderBaseProps {
  range: true;
  value?: [number, number];
  defaultValue?: [number, number];
  onValueChange?: (value: [number, number]) => void;
  onSlidingStart?: (value: [number, number]) => void;
  onSlidingComplete?: (value: [number, number]) => void;
}

export type SliderProps = SliderSingleProps | SliderRangeProps;

type Callback = ((value: SliderValue) => void) | undefined;

const SIZES: Record<SliderSize, { track: number; stepped: number; thumb: number; bar: number; icon: number; font: number; hit: number }> = {
  sm: { track: 3, stepped: 6, thumb: 20, bar: 36, icon: 16, font: 12, hit: 44 },
  md: { track: 4, stepped: 8, thumb: 26, bar: 46, icon: 20, font: 13, hit: 44 },
  lg: { track: 6, stepped: 10, thumb: 30, bar: 58, icon: 24, font: 15, hit: 52 },
};
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;
const BUBBLE_H = 28;
const BUBBLE_GAP = 10;
const BUBBLE_W = 120;
/** Below this many points per step the thumb follows the finger and snaps on release. */
const SNAP_PX = 14;
const SMOOTH = Easing.bezier(0.32, 0.72, 0, 1);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Native-driven move to `toValue`: a snappy spring, or a short ease when Reduce Motion is on. */
const glide = (v: Animated.Value, toValue: number, reduce: boolean) =>
  reduce
    ? Animated.timing(v, { toValue, duration: 150, easing: SMOOTH, useNativeDriver: true })
    : Animated.spring(v, { toValue, useNativeDriver: true, ...motion.snappy });
const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;

/**
 * A slider that feels native: the thumb and fill move on the native driver (no re-render per
 * frame), the thumb swells under your finger, tap anywhere on the track to seek, and values snap
 * to `step` with a spring. Variants: a thin iOS track, a Control-Center style `bar`, and a
 * `stepped` track with ticks; `range` adds a second thumb. Optional value tooltip, min / max
 * labels, icons and a histogram for filters.
 */
export function Slider(props: SliderProps) {
  const {
    min = 0,
    max = 100,
    step = 1,
    variant = 'default',
    size = 'md',
    marks,
    formatValue,
    showMinMax,
    minLabel,
    maxLabel,
    leftIcon,
    rightIcon,
    icon,
    thickFill,
    histogram,
    histogramHeight = 44,
    disabled,
    accent,
    accessibilityLabel,
    style,
    trackStyle,
    fillStyle,
    thumbStyle,
    labelStyle,
  } = props;
  const range = props.range === true;
  const isBar = variant === 'bar';
  const stepped = variant === 'stepped';
  const showValue = props.showValue ?? (isBar ? 'never' : 'drag');
  const onValueChange = props.onValueChange as Callback;
  const onSlidingStart = props.onSlidingStart as Callback;
  const onSlidingComplete = props.onSlidingComplete as Callback;

  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const onTint = accent ? readableOn(accent) : colors.accentForeground;
  const sz = SIZES[size];
  // Text scale the capped labels actually render at, for the label row's height.
  const fontScale = Math.min(useWindowDimensions().fontScale, FONT_CAP);

  const T = isBar ? 0 : sz.thumb; // thumb diameter
  const inset = T / 2; // thumb centre travels [inset, w - inset]
  const trackH = isBar ? sz.bar : stepped ? sz.stepped : sz.track;
  const fillH = !isBar && !stepped && thickFill ? trackH + 4 : trackH;
  const surfaceH = Math.max(sz.hit, isBar ? sz.bar : T);
  const slotW = Math.max(T, 2);
  const histH = histogram?.length ? histogramHeight + 8 : 0;
  const bubbleBottom = surfaceH / 2 + (isBar ? trackH / 2 : T / 2) + BUBBLE_GAP;
  const bubbleShown = showValue === 'always' && !isBar;
  // Only an always-visible tooltip needs room above the track; a drag tooltip floats over whatever is there.
  const reserve = bubbleShown ? Math.max(0, bubbleBottom + BUBBLE_H - surfaceH - histH) : 0;

  // ---- values ---------------------------------------------------------------------------------
  const toArr = (v: SliderValue | undefined): number[] => {
    if (Array.isArray(v)) return range ? [v[0], v[1]] : [v[0]];
    if (typeof v === 'number') return range ? [min, v] : [v];
    return range ? [min, max] : [min];
  };
  const controlled = props.value !== undefined;
  const [inner, setInner] = useState<number[]>(() => toArr(props.defaultValue));
  const vals = (controlled ? toArr(props.value) : inner).map((v) => clamp(v, min, max));
  if (range && vals[0] > vals[1]) vals.reverse();

  const span = max - min || 1;
  const ratioOf = (v: number) => clamp((v - min) / span, 0, 1);
  const snap = (v: number) => {
    if (!step) return clamp(v, min, max);
    const n = Math.round((v - min) / step) * step + min;
    return clamp(Number(n.toFixed(decimals(step))), min, max);
  };
  const fmt = (v: number) => (formatValue ? formatValue(v) : step ? v.toFixed(decimals(step)) : String(Math.round(v)));
  const out = (arr: number[]): SliderValue => (range ? [arr[0], arr[1]] : arr[0]);

  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // ---- animated values ------------------------------------------------------------------------
  // All native-driven: they only ever feed transform / opacity.
  const ratios = useRef([new Animated.Value(ratioOf(vals[0])), new Animated.Value(ratioOf(vals[1] ?? vals[0]))]).current;
  const press = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const bubble = useRef([new Animated.Value(bubbleShown ? 1 : 0), new Animated.Value(bubbleShown ? 1 : 0)]).current;
  const held = useRef(new Animated.Value(0)).current;

  // Everything the (once-created) PanResponder reads, kept fresh every render.
  const live = useRef({ vals, w, inset, step, span, min, range, isBar, T, disabled, controlled, reduce, snap, ratioOf, fmt, out, onValueChange, onSlidingStart, onSlidingComplete });
  live.current = { vals, w, inset, step, span, min, range, isBar, T, disabled, controlled, reduce, snap, ratioOf, fmt, out, onValueChange, onSlidingStart, onSlidingComplete };
  const drag = useRef({ dragging: false, thumb: 0, startX: 0, origin: 0, relative: false, moved: false, cur: [] as number[], target: [-1, -1] });

  // Follow value changes from outside (controlled updates, a11y, icon taps) when nobody is dragging.
  const key = vals.join(',');
  useEffect(() => {
    if (drag.current.dragging) return;
    vals.forEach((v, i) => glide(ratios[i], ratioOf(v), reduce).start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, min, max]);

  // With Reduce Motion these only fade (the scale / lift outputs below are flattened).
  useEffect(() => {
    press.forEach((p, i) => glide(p, active === i ? 1 : 0, reduce).start());
    bubble.forEach((b, i) => glide(b, bubbleShown || (showValue === 'drag' && active === i) ? 1 : 0, reduce).start());
    glide(held, active !== null ? 1 : 0, reduce).start();
  }, [active, bubbleShown, showValue, press, bubble, held, reduce]);

  const pan = useMemo(() => {
    const usableOf = () => Math.max(1, live.current.w - 2 * live.current.inset);
    const ratioAt = (x: number) => clamp((x - live.current.inset) / usableOf(), 0, 1);

    const moveTo = (x: number, animate: boolean) => {
      const L = live.current;
      const d = drag.current;
      const i = d.thumb;
      let v = L.min + ratioAt(x) * L.span;
      if (L.range) v = i === 0 ? Math.min(v, d.cur[1]) : Math.max(v, d.cur[0]);
      const snapped = L.snap(v);
      const coarse = !!L.step && (L.step / L.span) * usableOf() >= SNAP_PX;
      const target = coarse ? L.ratioOf(snapped) : L.ratioOf(v);
      if (animate || coarse) {
        if (target !== d.target[i]) glide(ratios[i], target, L.reduce).start();
      } else {
        ratios[i].setValue(target);
      }
      d.target[i] = target;
      if (snapped === d.cur[i]) return;
      const prev = d.cur[i];
      const next = [...d.cur];
      next[i] = snapped;
      d.cur = next;
      // Uncontrolled continuous sliders only re-render when the shown text changes.
      if (!L.controlled && (L.step || L.fmt(prev) !== L.fmt(snapped))) setInner(next);
      L.onValueChange?.(L.out(next));
    };

    const finish = (seek: boolean) => {
      const L = live.current;
      const d = drag.current;
      if (!d.dragging) return;
      if (seek) moveTo(d.startX, true);
      glide(ratios[d.thumb], L.ratioOf(d.cur[d.thumb]), L.reduce).start();
      d.dragging = false;
      d.target = [-1, -1];
      if (!L.controlled) setInner(d.cur);
      setActive(null);
      L.onSlidingComplete?.(L.out(d.cur));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const L = live.current;
        const x = e.nativeEvent.locationX;
        const cur = [...L.vals];
        const xs = cur.map((v) => L.inset + L.ratioOf(v) * usableOf());
        let thumb = 0;
        if (L.range) {
          const d0 = Math.abs(x - xs[0]);
          const d1 = Math.abs(x - xs[1]);
          thumb = d0 === d1 ? (x > xs[1] ? 1 : 0) : d1 < d0 ? 1 : 0;
        }
        // Grabbing the thumb (or anywhere on a bar) drags relative to it; elsewhere seeks first.
        const onThumb = !L.isBar && Math.abs(x - xs[thumb]) <= Math.max(L.T / 2 + 8, 22);
        const relative = L.isBar || onThumb;
        drag.current = { dragging: true, thumb, startX: x, origin: relative ? xs[thumb] : x, relative, moved: false, cur, target: [-1, -1] };
        setActive(thumb);
        L.onSlidingStart?.(L.out(cur));
        if (!relative) moveTo(x, true);
      },
      onPanResponderMove: (_, g) => {
        const d = drag.current;
        if (Math.abs(g.dx) >= 3) d.moved = true;
        if (!d.moved && live.current.isBar) return; // keep a tap on a bar a tap
        moveTo(d.origin + g.dx, false);
      },
      // A tap on a bar (no drag) still seeks.
      onPanResponderRelease: () => finish(drag.current.relative && live.current.isBar && !drag.current.moved),
      onPanResponderTerminate: () => finish(false),
    });
  }, [ratios]);

  const stepBy = (i: number, dir: 1 | -1, amount?: number) => {
    if (disabled) return;
    const inc = amount ?? (step || span / 100);
    const next = [...vals];
    next[i] = snap(next[i] + dir * inc);
    if (range) next[i] = i === 0 ? Math.min(next[i], vals[1]) : Math.max(next[i], vals[0]);
    if (next[i] === vals[i]) return;
    if (!controlled) setInner(next);
    onValueChange?.(out(next));
    onSlidingComplete?.(out(next));
  };
  // Tapping a built-in side icon moves by roughly a tenth of the range, rounded to the step.
  const iconStep = step ? Math.max(step, Math.round(span / 10 / step) * step) : span / 10;

  // ---- animated styles (memoised so re-renders don't rebuild native nodes) ---------------------
  const usable = Math.max(1, w - 2 * inset);
  const geo = useMemo(() => {
    if (!w) return null;
    const px = ratios.map((r) =>
      r.interpolate({ inputRange: [0, 1], outputRange: [inset, inset + usable], extrapolate: 'clamp' })
    );
    // Single: a full-width fill slid left so its edge sits at the thumb. Range: a full-width fill
    // scaled about its centre to span the two thumbs. Both are clipped by a rounded container.
    const shift = Animated.add(px[0], -w);
    const fill = range
      ? [
          { translateX: Animated.add(Animated.multiply(Animated.add(px[0], px[1]), 0.5), -w / 2) },
          { scaleX: Animated.multiply(Animated.subtract(px[1], px[0]), 1 / w) },
        ]
      : [{ translateX: shift }];
    return {
      fill,
      counter: [{ translateX: Animated.multiply(shift, -1) }], // keeps in-bar content still while the fill slides
      slot: px.map((p) => [{ translateX: Animated.add(p, -slotW / 2) }]),
    };
  }, [w, inset, usable, range, slotW, ratios]);

  // Reduce Motion: no swell, no pop-up — the halo and tooltip just fade.
  const anim = useMemo(
    () => ({
      thumb: press.map((p) => [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 1.14] }) }]),
      halo: press.map((p) => [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 1.75] }) }]),
      bubble: bubble.map((b) => [
        { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 6, 0] }) },
        { scale: b.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.6, 1] }) },
      ]),
      held: [{ scale: held.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 1.025] }) }],
    }),
    [press, bubble, held, reduce]
  );

  // ---- marks ----------------------------------------------------------------------------------
  const markList: { value: number; label?: string }[] = useMemo(() => {
    const m = marks ?? (stepped ? true : undefined);
    if (!m) return [];
    if (m === true) {
      if (!step || span / step > 40) return [];
      return Array.from({ length: Math.round(span / step) + 1 }, (_, i) => ({ value: Number((min + i * step).toFixed(decimals(step))) }));
    }
    return m.map((x) => (typeof x === 'number' ? { value: x } : x));
  }, [marks, stepped, step, span, min]);
  const hasMarkLabels = markList.some((m) => m.label);
  const minMax = showMinMax || minLabel !== undefined || maxLabel !== undefined;
  const inFill = (v: number) => (range ? v >= vals[0] && v <= vals[1] : v <= vals[0]);
  const dot = Math.max(2, Math.round(trackH * (isBar ? 0.12 : 0.4)));

  // ---- colours --------------------------------------------------------------------------------
  const trackColor = alpha(colors.mutedForeground, isBar ? (dark ? 0.24 : 0.14) : dark ? 0.3 : 0.2);
  const thumbColor = dark ? colors.foreground : colors.card;

  const drawIcon = (ic: SliderIconProp, color: string) => {
    if (typeof ic === 'function') return ic(color);
    if (typeof ic === 'string') return <SliderIcon name={ic as SliderIconName} size={isBar ? sz.icon + 2 : sz.icon} color={color} />;
    return ic;
  };

  const sideIcon = (ic: SliderIconProp | undefined, dir: 1 | -1) => {
    if (ic === undefined || ic === null || ic === false) return null;
    const node = drawIcon(ic, colors.mutedForeground);
    const box = [styles.iconSlot, { height: surfaceH, marginTop: histH }];
    if (typeof ic !== 'string') return <View style={box}>{node}</View>;
    return (
      <Pressable
        accessible={false}
        disabled={disabled}
        hitSlop={10}
        onPress={() => stepBy(dir === 1 ? vals.length - 1 : 0, dir, iconStep)}
        style={({ pressed }) => [box, { opacity: pressed ? 0.45 : 1 }]}
      >
        {node}
      </Pressable>
    );
  };

  // Content drawn inside a bar: icon at the start, value at the end. Rendered twice — once over
  // the track and once inside the fill in the "on accent" colour — so it inverts as the fill passes.
  const barInline = isBar && (icon !== undefined || showValue === 'always');
  const barContent = (iconColor: string, textColor: string) => (
    <View style={[styles.barContent, { width: w, height: trackH, paddingHorizontal: Math.round(trackH * 0.32) }]}>
      <View>{icon !== undefined ? drawIcon(icon, iconColor) : null}</View>
      {showValue === 'always' ? (
        <Text numberOfLines={1} selectable={false} maxFontSizeMultiplier={FONT_CAP} style={[styles.barValue, ff, { color: textColor, fontSize: sz.font + 1 }, labelStyle]}>
          {range ? `${fmt(vals[0])} – ${fmt(vals[1])}` : fmt(vals[0])}
        </Text>
      ) : null}
    </View>
  );

  const labelText = (key: string, text: string, lit: boolean, place: TextStyle) => (
    <Text
      key={key}
      numberOfLines={1}
      selectable={false}
      maxFontSizeMultiplier={FONT_CAP}
      style={[styles.markLabel, place, ff, { fontSize: sz.font - 1, color: lit ? colors.foreground : colors.mutedForeground }, labelStyle]}
    >
      {text}
    </Text>
  );

  return (
    <View
      style={[styles.root, { paddingTop: reserve, opacity: disabled ? 0.45 : 1 }, style]}
      accessible={!range}
      accessibilityRole={!range ? 'adjustable' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityValue={!range ? { min, max, now: vals[0], text: fmt(vals[0]) } : undefined}
      accessibilityActions={!range ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={(e: AccessibilityActionEvent) => stepBy(0, e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <View style={styles.row}>
        {sideIcon(leftIcon, -1)}
        <View style={styles.middle}>
          {histogram?.length ? (
            <View pointerEvents="none" style={[styles.histogram, { height: histogramHeight, paddingHorizontal: inset }]}>
              {histogram.map((h, i, all) => {
                const top = Math.max(...all, 1);
                const mid = min + ((i + 0.5) / histogram.length) * span;
                return (
                  <View
                    key={i}
                    style={[
                      styles.histBar,
                      {
                        height: Math.max(2, (h / top) * histogramHeight),
                        borderTopLeftRadius: radius.scale(3),
                        borderTopRightRadius: radius.scale(3),
                        backgroundColor: inFill(mid) ? alpha(tint, 0.8) : alpha(colors.mutedForeground, 0.2),
                      },
                    ]}
                  />
                );
              })}
            </View>
          ) : null}

          <View
            {...pan.panHandlers}
            onLayout={(e) => setW(e.nativeEvent.layout.width)}
            style={[styles.surface, { height: surfaceH }, !disabled && styles.pointer]}
          >
            <Animated.View pointerEvents="none" style={[styles.layer, isBar && { transform: anim.held }]}>
              {/* Inactive track */}
              <View
                style={[
                  styles.track,
                  { top: (surfaceH - trackH) / 2, height: trackH, borderRadius: radius.capsule(trackH), backgroundColor: trackColor },
                  trackStyle,
                ]}
              >
                {barInline && w ? barContent(colors.mutedForeground, colors.foreground) : null}
              </View>

              {/* Active fill, clipped to the track shape */}
              {geo ? (
                <View style={[styles.clip, { top: (surfaceH - fillH) / 2, width: w, height: fillH, borderRadius: radius.capsule(fillH) }]}>
                  <Animated.View style={[styles.fill, { width: w, backgroundColor: tint, transform: geo.fill }, fillStyle]}>
                    {barInline && !range ? (
                      <Animated.View style={[styles.counter, { transform: geo.counter }]}>{barContent(onTint, onTint)}</Animated.View>
                    ) : null}
                  </Animated.View>
                </View>
              ) : null}

              {/* Step ticks */}
              {w
                ? markList.map((m) => (
                    <View
                      key={m.value}
                      style={[
                        styles.tick,
                        {
                          width: dot,
                          height: dot,
                          borderRadius: dot,
                          left: inset + ratioOf(m.value) * usable - dot / 2,
                          top: (surfaceH - dot) / 2,
                          backgroundColor: inFill(m.value) ? alpha(onTint, 0.7) : alpha(colors.mutedForeground, dark ? 0.6 : 0.45),
                        },
                      ]}
                    />
                  ))
                : null}

              {/* Thumbs (and the value tooltip, which rides along with them) */}
              {geo
                ? vals.map((v, i) => (
                    <Animated.View
                      key={i}
                      accessible={range}
                      accessibilityRole={range ? 'adjustable' : undefined}
                      accessibilityLabel={range ? `${accessibilityLabel ?? 'Range'} ${i === 0 ? 'minimum' : 'maximum'}` : undefined}
                      accessibilityValue={range ? { min, max, now: v, text: fmt(v) } : undefined}
                      accessibilityActions={range ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
                      onAccessibilityAction={(e: AccessibilityActionEvent) => stepBy(i, e.nativeEvent.actionName === 'increment' ? 1 : -1)}
                      style={[styles.slot, { width: slotW, height: surfaceH, zIndex: active === i ? 2 : 1, transform: geo.slot[i] }]}
                    >
                      {!isBar ? (
                        <>
                          <Animated.View
                            style={[
                              styles.halo,
                              {
                                top: (surfaceH - T) / 2,
                                width: T,
                                height: T,
                                borderRadius: radius.capsule(T),
                                backgroundColor: alpha(tint, 0.16),
                                opacity: press[i],
                                transform: anim.halo[i],
                              },
                            ]}
                          />
                          <Animated.View
                            style={[
                              styles.thumb,
                              {
                                width: T,
                                height: T,
                                borderRadius: radius.capsule(T),
                                backgroundColor: thumbColor,
                                borderColor: dark ? 'transparent' : colors.border,
                                shadowOpacity: dark ? 0.5 : 0.2,
                                transform: anim.thumb[i],
                              },
                              thumbStyle,
                            ]}
                          />
                        </>
                      ) : null}
                      {showValue !== 'never' && !(isBar && showValue === 'always') ? (
                        <Animated.View
                          style={[
                            styles.bubbleWrap,
                            { bottom: bubbleBottom, left: slotW / 2 - BUBBLE_W / 2, opacity: bubble[i], transform: anim.bubble[i] },
                          ]}
                        >
                          <View style={[styles.bubble, { backgroundColor: colors.foreground, borderRadius: radius.capsule(BUBBLE_H) }]}>
                            <Text numberOfLines={1} selectable={false} maxFontSizeMultiplier={FONT_CAP} style={[styles.bubbleText, ff, { color: colors.background, fontSize: sz.font }, labelStyle]}>
                              {fmt(v)}
                            </Text>
                          </View>
                        </Animated.View>
                      ) : null}
                    </Animated.View>
                  ))
                : null}
            </Animated.View>
          </View>

          {hasMarkLabels || minMax ? (
            <View pointerEvents="none" style={[styles.labels, { height: Math.round(sz.font * fontScale) + 8 }]}>
              {hasMarkLabels
                ? markList.map((m) => {
                    if (!m.label || !w) return null;
                    const r = ratioOf(m.value);
                    const place: TextStyle =
                      r <= 0 ? { left: 0, textAlign: 'left' } : r >= 1 ? { right: 0, textAlign: 'right' } : { left: inset + r * usable - 40 };
                    return labelText(String(m.value), m.label, inFill(m.value), place);
                  })
                : [
                    labelText('min', minLabel ?? fmt(min), false, { left: 0, textAlign: 'left' }),
                    labelText('max', maxLabel ?? fmt(max), false, { right: 0, textAlign: 'right' }),
                  ]}
            </View>
          ) : null}
        </View>
        {sideIcon(rightIcon, 1)}
      </View>
    </View>
  );
}

/** Small stroke icons for `leftIcon` / `rightIcon` / `icon`. */
export function SliderIcon({ name, size = 20, color }: { name: SliderIconName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const speaker = <Path d="M11 5 6.5 9H3.5v6h3l4.5 4V5z" {...p} />;
  const rays = (r1: number, r2: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      return `M${(12 + c * r1).toFixed(2)} ${(12 + sn * r1).toFixed(2)}L${(12 + c * r2).toFixed(2)} ${(12 + sn * r2).toFixed(2)}`;
    }).join('');
  let body: React.ReactNode;
  switch (name) {
    case 'volume-off':
      body = (
        <>
          {speaker}
          <Path d="m16 9.5 5 5M21 9.5l-5 5" {...p} />
        </>
      );
      break;
    case 'volume-low':
      body = (
        <>
          {speaker}
          <Path d="M15.5 9a4.2 4.2 0 0 1 0 6" {...p} />
        </>
      );
      break;
    case 'volume-high':
      body = (
        <>
          {speaker}
          <Path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12" {...p} />
        </>
      );
      break;
    case 'sun-low':
      body = (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d={rays(5.6, 6.8)} {...p} />
        </>
      );
      break;
    case 'sun-high':
      body = (
        <>
          <Circle cx={12} cy={12} r={4} {...p} />
          <Path d={rays(6.8, 9.4)} {...p} />
        </>
      );
      break;
    case 'minus':
      body = <Path d="M6 12h12" {...p} />;
      break;
    case 'plus':
      body = <Path d="M12 6v12M6 12h12" {...p} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
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
  root: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  middle: { flex: 1 },
  iconSlot: { minWidth: 24, alignItems: 'center', justifyContent: 'center' },
  histogram: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 8 },
  histBar: { flex: 1 },
  surface: { justifyContent: 'center' },
  pointer: { cursor: 'pointer' },
  layer: { ...StyleSheet.absoluteFill },
  track: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  clip: { position: 'absolute', left: 0, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  counter: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barValue: { fontWeight: '400', fontVariant: ['tabular-nums'] },
  tick: { position: 'absolute' },
  slot: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: 0 },
  thumb: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleWrap: { position: 'absolute', width: BUBBLE_W, alignItems: 'center', transformOrigin: 'bottom' },
  bubble: {
    minHeight: BUBBLE_H,
    paddingHorizontal: 10,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  bubbleText: { fontWeight: '400', fontVariant: ['tabular-nums'] },
  labels: { marginTop: 2 },
  markLabel: { position: 'absolute', width: 80, textAlign: 'center', fontWeight: '400', fontVariant: ['tabular-nums'] },
});
