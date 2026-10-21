// Mobile-dashboard charts built from plain Views (capsule bars, tick bars, fan gauge, mini rings).
// Bars move with transforms and fade with opacity on the NATIVE thread (useNativeDriver), so they
// stay at 60/120 fps on iOS and Android even while the JS thread is busy (data fetches, lists).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { AnimatedCircle, TouchLayer, clamp, compactNumber, useAnimatedValues, useReducedMotion } from "./internal";
import { TEXT_SCALE } from "./kit";
import { EASE, Empty, MAX_BAR, adjustable, mixColor, num, useNativeValues, useWidth } from "./native-kit";
import { useChartTheme } from "./theme";

export { mixColor };

// ---------------------------------------------------------------------------
// Pill bars: capsule bars with a highlighted bar, tooltip bubble, badges and tracks.
// Steps / weekly activity / energy usage / sleep cards.
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
  /** Small bubble at the top of the bar ("+12%"). */
  badge?: string;
  /** Per-bar colour. */
  color?: string;
}

export interface PillBarChartProps {
  data: BarDatum[];
  /** Height of the bar area (labels and tooltip add to it). */
  height?: number;
  /** Value of a full-height bar. Defaults to the largest value. */
  max?: number;
  /** Bar colour. Defaults to the theme's first series colour. */
  color?: string;
  /** Colour of the selected bar. Defaults to `color` at full strength. */
  activeColor?: string;
  /** Vertical gradient for the selected bar, [top, bottom]. Overrides activeColor. */
  activeGradient?: [string, string];
  /** Full-height capsule behind every bar (progress against a goal). */
  track?: boolean;
  trackColor?: string;
  /** Opacity of the other bars while one is selected. */
  inactiveOpacity?: number;
  /** Bars after this index are faded (days still to come). */
  dimAfter?: number;
  /** Space between bars. */
  gap?: number;
  /** Bar width. Defaults to the column, up to 44. */
  barWidth?: number;
  /** Corner radius. Defaults to a full capsule. */
  radius?: number;
  showLabels?: boolean;
  /** Value bubble above the selected bar. */
  showTooltip?: boolean;
  /** Dot at the top of the selected bar. */
  activeDot?: boolean;
  /** Controlled selection. */
  selectedIndex?: number | null;
  /** Initial selection when uncontrolled. */
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: BarDatum | null) => void;
  formatValue?: (value: number, datum: BarDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  /** Fired when a horizontal drag starts; pause a parent ScrollView here. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function PillBarChart({
  data = [],
  height = 180,
  max,
  color: colorProp,
  activeColor,
  activeGradient,
  track = false,
  trackColor,
  inactiveOpacity = 0.32,
  dimAfter,
  gap = 8,
  barWidth,
  radius,
  showLabels = true,
  showTooltip = true,
  activeDot = false,
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  onScrubStart,
  onScrubEnd,
  style,
}: PillBarChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const color = colorProp ?? theme.palette[0];
  const peak = max ?? Math.max(1e-9, ...data.map((d) => Math.max(0, num(d.value))));
  const colW = n && width ? (width - gap * (n - 1)) / n : 0;
  // Default: the column, capped so wide screens keep slim capsules (not lens shapes).
  const bw = Math.max(2, Math.min(barWidth ?? Math.min(colW, MAX_BAR), colW));
  const r = radius ?? bw / 2;
  const heights = data.map((d) => {
    const v = Math.max(0, num(d.value));
    // A capsule never gets shorter than its own width, so it stays round.
    return v <= 0 ? 0 : clamp((v / peak) * height, Math.min(r * 2, height), height);
  });
  const tipRoom = showTooltip ? 40 : 0;

  // Bars slide up from below (translateY), selection fades (opacity): both native-driven.
  const offsets = useNativeValues(heights.map((h) => height - h), { animate, from: height, stagger: 40, duration: 700 });
  const sel = useNativeValues(data.map((_, i) => (i === active ? 1 : 0)), { animate, duration: 220 });
  const [any] = useNativeValues([active === null ? 0 : 1], { animate, duration: 220 });
  const othersOpacity = useMemo(() => any.interpolate({ inputRange: [0, 1], outputRange: [1, inactiveOpacity] }), [any, inactiveOpacity]);

  // Tooltip bubble glides between bars.
  const [tipW, setTipW] = useState(0);
  const tipX = useRef(new Animated.Value(0)).current;
  const tipY = useRef(new Animated.Value(0)).current;
  const tipO = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const center = active === null ? 0 : active * (colW + gap) + colW / 2;
  const tipLeft = clamp(center - tipW / 2, 0, Math.max(0, width - tipW));
  const tipTop = active === null ? 0 : tipRoom + height - heights[active] - 36;
  useEffect(() => {
    if (!showTooltip || !tipW || !width) return;
    if (active === null) {
      shown.current = false;
      Animated.timing(tipO, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    if (!shown.current || !animate) {
      tipX.setValue(tipLeft);
      tipY.setValue(tipTop);
    } else {
      Animated.parallel([
        Animated.timing(tipX, { toValue: tipLeft, duration: 240, easing: EASE, useNativeDriver: true }),
        Animated.timing(tipY, { toValue: tipTop, duration: 240, easing: EASE, useNativeDriver: true }),
      ]).start();
    }
    shown.current = true;
    Animated.timing(tipO, { toValue: 1, duration: animate ? 160 : 0, useNativeDriver: true }).start();
  }, [active, tipLeft, tipTop, tipW, width, showTooltip, animate]);

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  const indexAt = (x: number) => clamp(Math.floor((x + gap / 2) / Math.max(colW + gap, 1)), 0, n - 1);

  if (!n) return <Empty height={height + (showLabels ? 24 : 0)} text={emptyText} />;

  const valueText = (i: number) => `${data[i].label}: ${formatValue(num(data[i].value), data[i])}`;
  const a11y = adjustable(
    accessibilityLabel ?? `Bar chart, ${n} bars. ${data.slice(0, 12).map((_, i) => valueText(i)).join(". ")}`,
    active === null ? undefined : valueText(active),
    n,
    active,
    choose
  );
  const fill = StyleSheet.absoluteFill;
  const gradId = `pill-${(activeGradient ?? []).join("").replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={style} onLayout={onLayout} {...a11y}>
      {width > 0 ? (
        <>
          <View style={{ height: tipRoom + height, flexDirection: "row", alignItems: "flex-end", gap }}>
            {data.map((d, i) => {
              const base = d.color ?? color;
              const future = dimAfter !== undefined && i > dimAfter;
              return (
                <View key={i} style={{ width: colW, alignItems: "center" }}>
                  {/* The column clips the bar: its rounded corners shape the bar's bottom. */}
                  <View
                    style={{
                      width: bw,
                      height,
                      borderRadius: r,
                      overflow: "hidden",
                      backgroundColor: track ? trackColor ?? theme.muted : "transparent",
                    }}
                  >
                    <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, height, transform: [{ translateY: offsets[i] }] }}>
                      <Animated.View style={[fill, { backgroundColor: base, borderRadius: r, opacity: future ? inactiveOpacity * 0.45 : othersOpacity }]} />
                      <Animated.View style={[fill, { borderRadius: r, overflow: "hidden", opacity: sel[i] }]}>
                        {activeGradient ? (
                          <Svg width={bw} height={height}>
                            <Defs>
                              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2={heights[i] || 1} gradientUnits="userSpaceOnUse">
                                <Stop offset="0" stopColor={activeGradient[0]} />
                                <Stop offset="1" stopColor={activeGradient[1]} />
                              </LinearGradient>
                            </Defs>
                            <Rect x={0} y={0} width={bw} height={height} fill={`url(#${gradId})`} />
                          </Svg>
                        ) : (
                          <View style={[fill, { backgroundColor: activeColor ?? base }]} />
                        )}
                      </Animated.View>
                      {d.badge ? (
                        <View
                          style={[
                            styles.badge,
                            { width: Math.max(bw - 4, 26), height: Math.max(bw - 4, 26), borderRadius: Math.max(bw - 4, 26) / 2, marginTop: 2 },
                          ]}
                        >
                          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit style={[styles.badgeText, { color: theme.foreground, fontFamily: theme.fontFamily }]}>
                            {d.badge}
                          </Text>
                        </View>
                      ) : null}
                      {activeDot ? (
                        <Animated.View
                          style={[
                            styles.dot,
                            { opacity: sel[i], width: Math.min(bw * 0.42, 14), height: Math.min(bw * 0.42, 14), marginTop: Math.min(bw * 0.18, 6), borderColor: theme.card },
                          ]}
                        />
                      ) : null}
                    </Animated.View>
                  </View>
                </View>
              );
            })}
          </View>
          {showLabels ? (
            <View style={{ flexDirection: "row", gap, marginTop: 8 }}>
              {data.map((d, i) => {
                const on = i === active;
                const future = dimAfter !== undefined && i > dimAfter;
                return (
                  <Text
                    key={i}
                    maxFontSizeMultiplier={TEXT_SCALE}
                    numberOfLines={1}
                    style={{
                      width: colW,
                      textAlign: "center",
                      fontSize: 12,
                      fontFamily: theme.fontFamily,
                      fontWeight: on ? "600" : "400",
                      color: on ? theme.foreground : theme.mutedForeground,
                      opacity: future ? 0.55 : 1,
                    }}
                  >
                    {d.label}
                  </Text>
                );
              })}
            </View>
          ) : null}

          {showTooltip ? (
            <Animated.View
              pointerEvents="none"
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (Math.abs(w - tipW) > 0.5) setTipW(w);
              }}
              style={[styles.tip, { backgroundColor: theme.foreground, opacity: tipO, transform: [{ translateX: tipX }, { translateY: tipY }] }]}
            >
              <Text maxFontSizeMultiplier={1.2} style={[styles.tipText, { color: theme.background, fontFamily: theme.fontFamily }]}>
                {active === null ? " " : formatValue(num(data[active].value), data[active])}
              </Text>
              <View style={[styles.caret, { backgroundColor: theme.foreground, left: clamp(center - tipLeft - 4, 8, Math.max(8, tipW - 16)) }]} />
            </Animated.View>
          ) : null}

          <View style={[StyleSheet.absoluteFill, { bottom: showLabels ? 0 : 0 }]}>
            <TouchLayer
              scrub
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onMove={(x) => choose(indexAt(x))}
              onTap={(x) => choose(indexAt(x))}
              onHover={(x) => choose(indexAt(x))}
              onHoverEnd={() => {}}
            />
          </View>
        </>
      ) : (
        <View style={{ height: tipRoom + height + (showLabels ? 24 : 0) }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tick bar: one row of thin ticks split by category share (orders: done / pending / cancelled).
// ---------------------------------------------------------------------------

export interface TickBarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  tickWidth?: number;
  gap?: number;
  radius?: number;
  showLegend?: boolean;
  /** Show each category's value in the legend. */
  legendValues?: boolean;
  /** Controlled highlighted category. */
  selectedIndex?: number | null;
  onSelect?: (index: number | null, datum: { label: string; value: number } | null) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function TickBarChart({
  data = [],
  height = 44,
  tickWidth = 4,
  gap = 3,
  radius = 2,
  showLegend = true,
  legendValues = false,
  selectedIndex,
  onSelect,
  formatValue = compactNumber,
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: TickBarChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [own, setOwn] = useState<number | null>(null);
  const active = selectedIndex !== undefined ? selectedIndex : own;
  const total = data.reduce((s, d) => s + Math.max(0, num(d.value)), 0);
  const count = width ? Math.max(1, Math.floor((width + gap) / (tickWidth + gap))) : 0;
  const tw = count ? (width - gap * (count - 1)) / count : tickWidth;

  // Largest remainder: tick counts add up exactly, and every non-zero category gets at least one tick.
  const ticks = useMemo(() => {
    if (!count || !total) return data.map(() => 0);
    const exact = data.map((d) => (Math.max(0, num(d.value)) / total) * count);
    const out = exact.map((e, i) => (num(data[i].value) > 0 ? Math.max(1, Math.floor(e)) : 0));
    let left = count - out.reduce((s, v) => s + v, 0);
    const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
    for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
      if (num(data[order[k][1]].value) > 0) {
        out[order[k][1]]++;
        left--;
      }
    }
    while (left < 0) {
      const i = out.indexOf(Math.max(...out));
      out[i]--;
      left++;
    }
    return out;
  }, [count, total, data.map((d) => d.value).join("|")]);

  // One native progress value wipes the ticks in left → right.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!count) return;
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 900, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [count > 0, animate, total]);
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : 0.25)), { animate, duration: 200 });

  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    if (selectedIndex === undefined) setOwn(next);
    onSelect?.(next, next === null ? null : data[next]);
    if (next !== null) theme.haptics?.();
  };
  const colorOf = (i: number) => data[i].color ?? theme.palette[i % theme.palette.length];

  if (!data.length || !total) return <Empty height={height} text={emptyText} />;

  const pct = (v: number) => `${Math.round((Math.max(0, v) / total) * 100)}%`;
  const a11y = adjustable(
    accessibilityLabel ?? `Share bar. ${data.map((d) => `${d.label} ${formatValue(num(d.value))}, ${pct(num(d.value))}`).join(". ")}`,
    active === null ? undefined : `${data[active].label} ${formatValue(num(data[active].value))}, ${pct(num(data[active].value))}`,
    data.length,
    active,
    (i) => choose(i)
  );

  let at = 0;
  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ height, flexDirection: "row", gap }} {...a11y}>
        {count
          ? data.map((d, i) => {
              const start = at;
              at += ticks[i];
              if (!ticks[i]) return null;
              return (
                <Animated.View key={i} style={{ flexDirection: "row", gap, opacity: dims[i] }}>
                  {Array.from({ length: ticks[i] }, (_, k) => {
                    const t = (start + k) / count;
                    const reveal = progress.interpolate({ inputRange: [t * 0.75, t * 0.75 + 0.25], outputRange: [0, 1], extrapolate: "clamp" });
                    return (
                      <Animated.View
                        key={k}
                        style={{
                          width: tw,
                          height,
                          borderRadius: radius,
                          backgroundColor: colorOf(i),
                          opacity: reveal,
                          transform: [{ scaleY: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
                        }}
                      />
                    );
                  })}
                </Animated.View>
              );
            })
          : null}
        {count ? (
          <View style={StyleSheet.absoluteFill}>
            <TouchLayer
              onTap={(x) => {
                const tick = clamp(Math.floor(x / (tw + gap)), 0, count - 1);
                let sum = 0;
                const i = ticks.findIndex((c) => (sum += c) > tick);
                choose(i === -1 ? null : i);
              }}
            />
          </View>
        ) : null}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          {data.map((d, i) => (
            <Text
              key={i}
              onPress={() => choose(i)}
              suppressHighlighting
              maxFontSizeMultiplier={TEXT_SCALE}
              style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: theme.fontFamily, opacity: active === null || active === i ? 1 : 0.45 }}
            >
              <Text style={{ color: colorOf(i) }}>● </Text>
              {d.label}
              {legendValues ? <Text style={{ color: theme.foreground, fontWeight: "600" }}>{`  ${formatValue(num(d.value))}`}</Text> : null}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fan gauge: a half circle of radiating bars that light up to the value (sales goal, score).
// ---------------------------------------------------------------------------

export interface FanGaugeProps {
  value: number;
  max?: number;
  /** Number of bars in the fan. */
  bars?: number;
  /** Lit bars blend from the first colour (left) to the second (right). */
  colors?: [string, string];
  trackColor?: string;
  /** Diameter. Defaults to the parent width (up to 340). */
  size?: number;
  /** Bar thickness. Defaults to fit the fan. */
  thickness?: number;
  /** Empty middle, as a fraction of the radius. */
  innerRadius?: number;
  label?: string;
  /** Centre text. Defaults to the percentage. */
  formatValue?: (value: number, max: number) => string;
  /** Drag across the fan to set the value. */
  onChange?: (value: number) => void;
  /** Rounding while dragging. */
  step?: number;
  /** Drag started / ended: pause a parent ScrollView here. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function FanGauge({
  value,
  max = 100,
  bars = 28,
  colors,
  trackColor,
  size,
  thickness,
  innerRadius = 0.5,
  label,
  formatValue = (v, m) => `${Math.round((v / (m || 1)) * 100)}%`,
  onChange,
  step = 1,
  onScrubStart,
  onScrubEnd,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: FanGaugeProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const count = Math.max(3, Math.round(bars));
  const from = colors?.[0] ?? theme.palette[0];
  const to = colors?.[1] ?? mixColor(from, theme.card, 0.6);
  const W = Math.min(size ?? 340, width || 0);
  const outer = W / 2 - 4;
  const inner = outer * clamp(innerRadius, 0.1, 0.9);
  const len = outer - inner;
  const cx = width / 2;
  const cy = outer + 4;
  const bw = thickness ?? clamp(((Math.PI * (inner + len / 2)) / count) * 0.62, 3, 16);
  const frac = clamp(num(value) / (max || 1), 0, 1);

  // `lit` counts bars (fractional: the last bar fades in partway), on the native thread.
  const lit = useRef(new Animated.Value(animate ? 0 : frac * count)).current;
  const [shown, setShown] = useState(animate ? 0 : num(value));
  const dragging = useRef(false);
  useEffect(() => {
    const id = lit.addListener(({ value: v }) => {
      const next = Math.round(((v / count) * max) / step) * step;
      setShown((p) => (p === next ? p : next));
    });
    return () => lit.removeListener(id);
  }, [count, max, step]);
  useEffect(() => {
    if (dragging.current) return;
    if (!animate) {
      lit.setValue(frac * count);
      return;
    }
    const a = Animated.timing(lit, { toValue: frac * count, duration: 1100, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [frac, count, animate]);

  const lastBar = useRef(-1);
  const setFrom = (x: number, y: number) => {
    let a = Math.atan2(x - cx, cy - y); // 0 = up, -π/2 = left, π/2 = right
    if (y > cy) a = x < cx ? -Math.PI / 2 : Math.PI / 2;
    const f = clamp((a + Math.PI / 2) / Math.PI, 0, 1);
    const v = clamp(Math.round((f * max) / step) * step, 0, max);
    lit.setValue((v / (max || 1)) * count);
    const bar = Math.round((v / (max || 1)) * count);
    if (bar !== lastBar.current) {
      lastBar.current = bar;
      theme.haptics?.();
    }
    onChange?.(v);
  };

  const H = outer + 10;
  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityRole={onChange ? "adjustable" : "image"}
      accessibilityLabel={accessibilityLabel ?? `${label ?? "Gauge"}: ${formatValue(num(value), max)}`}
      accessibilityActions={onChange ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={(e) => onChange?.(clamp(num(value) + (e.nativeEvent.actionName === "increment" ? 1 : -1) * Math.max(step, max / 20), 0, max))}
    >
      {width > 0 ? (
        <View style={{ height: H }}>
          {Array.from({ length: count }, (_, k) => {
            const angle = -90 + (k * 180) / (count - 1);
            const color = mixColor(from, to, k / (count - 1));
            return (
              <View
                key={k}
                pointerEvents="none"
                style={{ position: "absolute", left: cx - bw / 2, top: cy - outer, width: bw, height: outer * 2, transform: [{ rotate: `${angle}deg` }] }}
              >
                <View style={{ height: len, borderRadius: bw / 2, backgroundColor: trackColor ?? theme.muted, overflow: "hidden" }}>
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: color, opacity: lit.interpolate({ inputRange: [k, k + 1], outputRange: [0, 1], extrapolate: "clamp" }) },
                    ]}
                  />
                </View>
              </View>
            );
          })}
          <View pointerEvents="none" style={[styles.fanCenter, { top: cy - inner * 0.75, height: inner * 0.75 }]}>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: theme.foreground, fontSize: clamp(inner * 0.42, 18, 40), fontWeight: "600", letterSpacing: -0.5, fontVariant: ["tabular-nums"], fontFamily: theme.fontFamily }}
            >
              {formatValue(shown, max)}
            </Text>
            {label ? (
              <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={{ color: theme.mutedForeground, fontSize: 12, fontFamily: theme.fontFamily }}>
                {label}
              </Text>
            ) : null}
          </View>
          {onChange ? (
            <TouchLayer
              lockOnGrant={(x, y) => {
                const d = Math.hypot(x - cx, y - cy);
                return d >= inner * 0.6 && d <= outer + 20 && y <= cy + 16;
              }}
              onScrubStart={() => {
                dragging.current = true;
                onScrubStart?.();
              }}
              onScrubEnd={() => {
                dragging.current = false;
                onScrubEnd?.();
              }}
              onMove={setFrom}
              onTap={setFrom}
              onRelease={() => {
                dragging.current = false;
              }}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ height: Math.min(size ?? 340, 340) / 2 + 6 }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Mini ring: small progress ring for stat cards (calories, water, goals).
// ---------------------------------------------------------------------------

export interface MiniRingProps {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  /** Rendered in the middle (an icon or a number). */
  children?: React.ReactNode;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function MiniRing({
  value,
  max = 100,
  size = 56,
  thickness = 7,
  color,
  trackColor,
  children,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: MiniRingProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const tint = color ?? theme.palette[0];
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const [f] = useAnimatedValues([clamp(num(value) / (max || 1), 0, 1)], { animate: animateProp && !calm, duration: 1000 });
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now: num(value) }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? mixColor(tint, theme.card, 0.78)} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[c, c]}
          strokeDashoffset={f.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
        />
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.5)",
  },
  badgeText: { fontSize: 11, fontWeight: "600", paddingHorizontal: 2 },
  dot: { alignSelf: "center", borderRadius: 99, backgroundColor: "#FFFFFF", borderWidth: 2 },
  tip: { position: "absolute", left: 0, top: 0, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tipText: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  caret: { position: "absolute", bottom: -3, width: 8, height: 8, transform: [{ rotate: "45deg" }], borderRadius: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 12 },
  fanCenter: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "flex-end" },
  ringCenter: { alignItems: "center", justifyContent: "center" },
});
