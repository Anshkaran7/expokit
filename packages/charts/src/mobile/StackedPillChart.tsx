// Capsule bars made of stacked parts: sleep stages per night, macros per meal, traffic sources per day.
import React, { useMemo, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Bubble, Empty, MAX_BAR, adjustable, columnAt, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface StackSeries {
  /** Key of the number in each data row. */
  key: string;
  label: string;
  color?: string;
}

/** One bar: { label: "Mon", deep: 1.6, light: 4.1, rem: 1.4 }. */
export type StackedDatum = { label: string } & Record<string, string | number>;

export interface StackedPillChartProps {
  data: StackedDatum[];
  /** Parts of each bar, bottom → top. */
  series: StackSeries[];
  /** Plot height (labels and bubble add to it). */
  height?: number;
  /** Value of a full-height bar. Defaults to the tallest stack. */
  max?: number;
  /** Space between parts inside a bar. */
  segmentGap?: number;
  gap?: number;
  barWidth?: number;
  inactiveOpacity?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** Adds a total line to the bubble. */
  showTotal?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: StackedDatum | null) => void;
  formatValue?: (value: number, key?: string) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StackedPillChart({
  data = [],
  series = [],
  height = 180,
  max,
  segmentGap = 2,
  gap = 10,
  barWidth,
  inactiveOpacity = 0.35,
  showLabels = true,
  showLegend = true,
  showTooltip = true,
  showTotal = true,
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
}: StackedPillChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const colorOf = (k: number) => series[k].color ?? theme.palette[k % theme.palette.length];
  const parts = data.map((d) => series.map((s) => Math.max(0, num(d[s.key]))));
  const totals = parts.map((p) => p.reduce((a, b) => a + b, 0));
  const peak = max ?? Math.max(1e-9, ...totals);

  const tipRoom = showTooltip ? 30 + 16 * (series.length + (showTotal ? 1 : 0)) : 4;
  const colW = n && width ? (width - gap * (n - 1)) / n : 0;
  const bw = Math.max(4, Math.min(barWidth ?? Math.min(colW, MAX_BAR * 0.8), colW));
  const r = bw / 2;
  const stackH = totals.map((t) => (t > 0 ? Math.min(height, Math.max(r * 2, (t / peak) * height)) : 0));
  const ys = useNativeValues(stackH.map((h) => height - h), { animate, from: height, stagger: 45, duration: 750 });
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : inactiveOpacity)), { animate, duration: 200 });

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  const lines = useMemo(
    () => (i: number) => [
      ...(showTotal ? [`${data[i].label} · ${formatValue(totals[i])}`] : [String(data[i].label)]),
      ...series.map((s, k) => `${s.label} ${formatValue(parts[i][k], s.key)}`),
    ],
    [data, series, showTotal, formatValue]
  );
  if (!n || !series.length) return <Empty height={tipRoom + height} text={emptyText} />;

  const describe = (i: number) => lines(i).join(", ");
  const a11y = adjustable(accessibilityLabel ?? `Stacked bars, ${n} items: ${series.map((s) => s.label).join(", ")}`, active === null ? undefined : describe(active), n, active, choose);
  const xOf = (i: number) => i * (colW + gap) + colW / 2;
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style}>
      <View onLayout={onLayout} {...a11y}>
        {width > 0 ? (
          <>
            <View style={{ height: tipRoom + height }}>
              {data.map((d, i) => {
                // Parts from the bottom; each part's share of the visible stack height.
                const h = stackH[i];
                let y = h;
                const pieces = parts[i].map((v, k) => {
                  const ph = totals[i] ? (v / totals[i]) * h : 0;
                  y -= ph;
                  return { k, top: y, h: ph };
                });
                return (
                  <Animated.View
                    key={`${d.label}-${i}`}
                    style={{ position: "absolute", left: xOf(i) - bw / 2, top: tipRoom, width: bw, height, borderRadius: r, overflow: "hidden", opacity: dims[i] }}
                  >
                    <Animated.View style={{ height, borderRadius: r, overflow: "hidden", transform: [{ translateY: ys[i] }] }}>
                      {pieces.map((p) =>
                        p.h > 0 ? (
                          <View
                            key={p.k}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: p.top + (p.top > 0.5 ? segmentGap / 2 : 0),
                              height: Math.max(0, p.h - (p.top > 0.5 ? segmentGap / 2 : 0) - (p.top + p.h < h - 0.5 ? segmentGap / 2 : 0)),
                              backgroundColor: colorOf(p.k),
                            }}
                          />
                        ) : null
                      )}
                    </Animated.View>
                  </Animated.View>
                );
              })}
            </View>
            {showLabels ? (
              <View style={{ flexDirection: "row", gap, marginTop: 8 }}>
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
              <Bubble visible={active !== null} x={active === null ? 0 : xOf(active)} y={active === null ? 0 : tipRoom + height - stackH[active]} width={width} lines={active === null ? [" "] : lines(active)} animate={animate} />
            ) : null}
            <View style={StyleSheet.absoluteFill}>
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
      {showLegend ? (
        <View style={styles.legend}>
          {series.map((s, k) => (
            <Text key={s.key} maxFontSizeMultiplier={TEXT_SCALE} style={[styles.item, font, { color: theme.mutedForeground }]}>
              <Text style={{ color: colorOf(k) }}>● </Text>
              {s.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { textAlign: "center", fontSize: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 6, marginTop: 12 },
  item: { fontSize: 12 },
});
