// One capsule split into parts: phone storage, budget split, macros, traffic sources.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { EASE, Empty, adjustable, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface SegmentDatum {
  label: string;
  value: number;
  color?: string;
}

export interface SegmentedBarProps {
  data: SegmentDatum[];
  /** Whole capacity. When larger than the sum, the rest shows as a muted track. */
  total?: number;
  /** Legend label for the unused part ("Free"). */
  remainingLabel?: string;
  /** Bar thickness. */
  height?: number;
  /** Space between segments. */
  gap?: number;
  /** Round every segment, not just the two ends. */
  roundSegments?: boolean;
  trackColor?: string;
  showLegend?: boolean;
  /** Legend shows "value", "percent" or "both". */
  legendValue?: "value" | "percent" | "both" | "none";
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: SegmentDatum | null) => void;
  formatValue?: (value: number, datum?: SegmentDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedBar({
  data = [],
  total,
  remainingLabel = "Free",
  height = 14,
  gap = 3,
  roundSegments = false,
  trackColor,
  showLegend = true,
  legendValue = "value",
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: SegmentedBarProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const n = data.length;
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const sum = data.reduce((s, d) => s + Math.max(0, num(d.value)), 0);
  const whole = Math.max(sum, num(total));
  const colorOf = (i: number) => data[i].color ?? theme.palette[i % theme.palette.length];
  const r = height / 2;
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : 0.3)), { animate, duration: 200 });

  // Reveal: a card-coloured cover slides off to the right (native thread), uncovering the bar.
  const cover = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!width) return;
    if (!animate) {
      cover.setValue(1);
      return;
    }
    cover.setValue(0);
    const a = Animated.timing(cover, { toValue: 1, duration: 900, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [width > 0, animate, sum]);

  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    if (selectedIndex === undefined) setOwn(next);
    onSelect?.(next, next === null ? null : data[next]);
    if (next !== null) theme.haptics?.();
  };
  if (!n || !whole) return <Empty height={height + (showLegend ? 40 : 0)} text={emptyText} />;

  // Segment widths (gaps come out of the bar, so 100% always fits).
  const parts = data.map((d) => Math.max(0, num(d.value)));
  const rest = whole - sum;
  const pieces = rest > 0 ? [...parts, rest] : parts;
  const shown = pieces.filter((p) => p > 0).length;
  const usable = Math.max(0, width - gap * Math.max(0, shown - 1));
  let x = 0;
  const geo = pieces.map((p) => {
    const w = p > 0 ? (p / whole) * usable : 0;
    const g = { x, w };
    if (p > 0) x += w + gap;
    return g;
  });
  const pct = (v: number) => `${Math.round((v / whole) * 100)}%`;
  const legendText = (v: number, d?: SegmentDatum) =>
    legendValue === "percent" ? pct(v) : legendValue === "both" ? `${formatValue(v, d)} · ${pct(v)}` : legendValue === "value" ? formatValue(v, d) : "";
  const describe = (i: number) => `${data[i].label} ${formatValue(parts[i], data[i])}, ${pct(parts[i])}`;
  const a11y = adjustable(
    accessibilityLabel ?? `Split bar. ${data.map((_, i) => describe(i)).join(". ")}${rest > 0 ? `. ${remainingLabel} ${formatValue(rest)}` : ""}`,
    active === null ? undefined : describe(active),
    n,
    active,
    (i) => choose(i)
  );
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ height, borderRadius: r, overflow: "hidden" }} {...a11y}>
        {width > 0
          ? geo.map((g, i) => {
              if (g.w <= 0) return null;
              const isRest = i >= n;
              return (
                <Animated.View
                  key={i}
                  style={{
                    position: "absolute",
                    left: g.x,
                    top: 0,
                    width: g.w,
                    height,
                    borderRadius: roundSegments ? r : 0,
                    backgroundColor: isRest ? trackColor ?? theme.muted : colorOf(i),
                    opacity: isRest ? 1 : dims[i],
                  }}
                />
              );
            })
          : null}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.card, transform: [{ translateX: cover.interpolate({ inputRange: [0, 1], outputRange: [0, width + 2] }) }] }]}
          />
        ) : null}
        {width > 0 ? (
          <TouchLayer
            onTap={(tx) => {
              const i = geo.findIndex((g, k) => k < n && g.w > 0 && tx >= g.x - gap / 2 && tx <= g.x + g.w + gap / 2);
              choose(i === -1 ? null : i);
            }}
          />
        ) : null}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          {data.map((d, i) => (
            <Text
              key={`${d.label}-${i}`}
              onPress={() => choose(i)}
              suppressHighlighting
              maxFontSizeMultiplier={TEXT_SCALE}
              style={[styles.item, font, { color: theme.mutedForeground, opacity: active === null || active === i ? 1 : 0.45 }]}
            >
              <Text style={{ color: colorOf(i) }}>● </Text>
              {d.label}
              {legendValue !== "none" ? <Text style={[styles.value, { color: theme.foreground }]}>{`  ${legendText(parts[i], d)}`}</Text> : null}
            </Text>
          ))}
          {rest > 0 ? (
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.item, font, { color: theme.mutedForeground }]}>
              <Text style={{ color: trackColor ?? theme.muted }}>● </Text>
              {remainingLabel}
              {legendValue !== "none" ? <Text style={[styles.value, { color: theme.foreground }]}>{`  ${legendText(rest)}`}</Text> : null}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6, marginTop: 12 },
  item: { fontSize: 12 },
  value: { fontWeight: "600", fontVariant: ["tabular-nums"] },
});
