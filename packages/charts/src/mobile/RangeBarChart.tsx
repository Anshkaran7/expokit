// Floating capsules from low to high: heart-rate range per day, temperature min/max, sleep window.
import React, { useMemo, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, compactNumber, estimateTextWidth, niceTicks, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Bubble, Empty, MAX_BAR, adjustable, columnAt, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface RangeDatum {
  label: string;
  low: number;
  high: number;
  /** Optional marker inside the capsule (average, resting, current). */
  value?: number;
  color?: string;
}

export interface RangeBarChartProps {
  data: RangeDatum[];
  /** Height of the plot (labels and bubble add to it). */
  height?: number;
  /** Axis bounds. Default: fit the data with a little room. */
  min?: number;
  max?: number;
  color?: string;
  /** Selected capsule colour. Defaults to `color` at full strength. */
  activeColor?: string;
  /** Opacity of the other capsules while one is selected. */
  inactiveOpacity?: number;
  gap?: number;
  barWidth?: number;
  /** Faint grid lines with values on the left. */
  showAxis?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: RangeDatum | null) => void;
  formatValue?: (value: number) => string;
  /** Bubble text. Default "low–high". */
  formatRange?: (low: number, high: number, datum: RangeDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function RangeBarChart({
  data = [],
  height = 180,
  min,
  max,
  color,
  activeColor,
  inactiveOpacity = 0.35,
  gap = 10,
  barWidth,
  showAxis = false,
  showLabels = true,
  showTooltip = true,
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  formatRange,
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  onScrubStart,
  onScrubEnd,
  style,
}: RangeBarChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const base = color ?? theme.palette[0];
  const rows = data.map((d) => {
    const a = num(d.low);
    const b = num(d.high);
    return { lo: Math.min(a, b), hi: Math.max(a, b), v: d.value === undefined ? null : num(d.value) };
  });

  const scale = useMemo(() => {
    const lo = min ?? Math.min(...rows.map((r) => r.lo), Infinity);
    const hi = max ?? Math.max(...rows.map((r) => r.hi), -Infinity);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 1] };
    const t = niceTicks(lo, hi, 4);
    return min !== undefined || max !== undefined ? { min: min ?? t.min, max: max ?? t.max, ticks: t.ticks.filter((x) => x >= (min ?? -Infinity) && x <= (max ?? Infinity)) } : t;
  }, [rows.map((r) => `${r.lo},${r.hi}`).join("|"), min, max]);

  const tipRoom = showTooltip ? 44 : 6;
  const axisW = showAxis ? Math.max(...scale.ticks.map((t) => estimateTextWidth(formatValue(t), 11))) + 10 : 0;
  const plotW = Math.max(0, width - axisW);
  const colW = n && plotW ? (plotW - gap * (n - 1)) / n : 0;
  const bw = Math.max(4, Math.min(barWidth ?? Math.min(colW, MAX_BAR * 0.6), colW));
  const span = scale.max - scale.min || 1;
  const yOf = (v: number) => height - ((v - scale.min) / span) * height;
  const tops = rows.map((r) => yOf(Math.min(r.hi, scale.max)));
  const lens = rows.map((r, i) => Math.max(bw, yOf(Math.max(r.lo, scale.min)) - tops[i]));

  // Capsules glide to their new top (translateY, native). Entrance: rise from the bottom.
  const ys = useNativeValues(tops, { animate, from: height, stagger: 40, duration: 700 });
  const sel = useNativeValues(data.map((_, i) => (i === active ? 1 : 0)), { animate, duration: 200 });
  const [any] = useNativeValues([active === null ? 0 : 1], { animate, duration: 200 });
  const others = useMemo(() => any.interpolate({ inputRange: [0, 1], outputRange: [1, inactiveOpacity] }), [any, inactiveOpacity]);

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  if (!n) return <Empty height={tipRoom + height + (showLabels ? 24 : 0)} text={emptyText} />;

  const range = (i: number) => (formatRange ? formatRange(rows[i].lo, rows[i].hi, data[i]) : `${formatValue(rows[i].lo)}–${formatValue(rows[i].hi)}`);
  const describe = (i: number) => `${data[i].label}: ${range(i)}${rows[i].v !== null ? `, average ${formatValue(rows[i].v!)}` : ""}`;
  const a11y = adjustable(accessibilityLabel ?? `Range chart, ${n} items. ${data.slice(0, 12).map((_, i) => describe(i)).join(". ")}`, active === null ? undefined : describe(active), n, active, choose);
  const font = { fontFamily: theme.fontFamily };
  const xOf = (i: number) => axisW + i * (colW + gap) + colW / 2;

  return (
    <View style={style} onLayout={onLayout} {...a11y}>
      {width > 0 ? (
        <>
          <View style={{ height: tipRoom + height }}>
            {showAxis
              ? scale.ticks.map((t) => (
                  <View key={t} style={[styles.grid, { top: tipRoom + yOf(t), left: axisW, borderColor: theme.border }]}>
                    <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tick, font, { color: theme.mutedForeground, width: axisW - 8, left: -axisW }]}>
                      {formatValue(t)}
                    </Text>
                  </View>
                ))
              : null}
            {data.map((d, i) => {
              const c = d.color ?? base;
              const marker = rows[i].v;
              return (
                <Animated.View
                  key={`${d.label}-${i}`}
                  style={{ position: "absolute", left: xOf(i) - bw / 2, top: tipRoom, width: bw, height: lens[i], borderRadius: bw / 2, overflow: "hidden", transform: [{ translateY: ys[i] }] }}
                >
                  <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c, opacity: Animated.multiply(others, 0.55) }]} />
                  <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: activeColor ?? c, opacity: sel[i] }]} />
                  {marker !== null && marker >= rows[i].lo && marker <= rows[i].hi ? (
                    <View
                      style={{
                        position: "absolute",
                        left: bw / 2 - Math.min(bw * 0.32, 6),
                        top: Math.min(Math.max(yOf(marker) - tops[i] - Math.min(bw * 0.32, 6), 1), lens[i] - Math.min(bw * 0.64, 12) - 1),
                        width: Math.min(bw * 0.64, 12),
                        height: Math.min(bw * 0.64, 12),
                        borderRadius: 99,
                        backgroundColor: theme.card,
                      }}
                    />
                  ) : null}
                </Animated.View>
              );
            })}
          </View>
          {showLabels ? (
            <View style={{ flexDirection: "row", gap, marginTop: 8, marginLeft: axisW }}>
              {data.map((d, i) => (
                <Text
                  key={`${d.label}-${i}`}
                  maxFontSizeMultiplier={TEXT_SCALE}
                  numberOfLines={1}
                  style={[styles.label, font, { width: colW, color: i === active ? theme.foreground : theme.mutedForeground, fontWeight: i === active ? "600" : "400" }]}
                >
                  {d.label}
                </Text>
              ))}
            </View>
          ) : null}
          {showTooltip ? (
            <Bubble visible={active !== null} x={active === null ? 0 : xOf(active)} y={active === null ? 0 : tipRoom + tops[active]} width={width} lines={active === null ? [" "] : [range(active)]} animate={animate} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { left: axisW }]}>
            <TouchLayer
              scrub
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onMove={(x) => choose(columnAt(x, n, colW, gap))}
              onTap={(x) => choose(columnAt(x, n, colW, gap))}
              onHover={(x) => choose(columnAt(x, n, colW, gap))}
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

const styles = StyleSheet.create({
  grid: { position: "absolute", right: 0, height: 0, borderTopWidth: StyleSheet.hairlineWidth },
  tick: { position: "absolute", top: -7, fontSize: 11, textAlign: "right", fontVariant: ["tabular-nums"] },
  label: { textAlign: "center", fontSize: 12 },
});
