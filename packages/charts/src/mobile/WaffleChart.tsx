// Grid of squares or dots showing a share: 72% of goal, or parts of a whole (one colour per category).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { EASE, Empty, adjustable, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface WaffleDatum {
  label: string;
  value: number;
  color?: string;
}

export interface WaffleChartProps {
  /** One item = progress (value / max). Several = parts of a whole. */
  data: WaffleDatum[];
  /** Whole. Defaults to 100 for one item, the sum for several. */
  max?: number;
  rows?: number;
  columns?: number;
  gap?: number;
  shape?: "square" | "circle";
  /** Largest cell size (keeps the grid tidy on wide screens). */
  maxCellSize?: number;
  trackColor?: string;
  showLegend?: boolean;
  selectedIndex?: number | null;
  onSelect?: (index: number | null, datum: WaffleDatum | null) => void;
  formatValue?: (value: number, datum?: WaffleDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Whole cells per item, adding up exactly (largest remainder). */
function allocate(values: number[], whole: number, cells: number) {
  if (!whole) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / whole) * cells);
  const out = exact.map(Math.floor);
  let left = Math.min(cells, Math.round(exact.reduce((s, e) => s + e, 0))) - out.reduce((s, v) => s + v, 0);
  exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        out[i]++;
        left--;
      }
    });
  return out;
}

export function WaffleChart({
  data = [],
  max,
  rows = 10,
  columns = 10,
  gap = 4,
  shape = "square",
  maxCellSize = 28,
  trackColor,
  showLegend = true,
  selectedIndex,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: WaffleChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [own, setOwn] = useState<number | null>(null);
  const active = selectedIndex !== undefined ? selectedIndex : own;
  const R = Math.max(1, Math.round(rows));
  const C = Math.max(1, Math.round(columns));
  const cells = R * C;
  const values = data.map((d) => Math.max(0, num(d.value)));
  const sum = values.reduce((s, v) => s + v, 0);
  const whole = max ?? (data.length === 1 ? 100 : sum);
  const counts = useMemo(() => allocate(values, Math.max(whole, sum), cells), [values.join("|"), whole, cells]);
  const owner: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < c; k++) owner.push(i);
  });
  const size = Math.max(4, Math.min(maxCellSize, width ? (width - gap * (C - 1)) / C : maxCellSize));
  const gridW = size * C + gap * (C - 1);
  const colorOf = (i: number) => data[i].color ?? theme.palette[i % theme.palette.length];

  // One native value sweeps the cells in, row by row.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 1000, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [animate, counts.join("|")]);
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : 0.3)), { animate, duration: 200 });

  // Built once per layout, not per render: a tap only changes `dims`, never the native node graph.
  const ownerKey = owner.join(",");
  const cellOpacity = useMemo(
    () =>
      Array.from({ length: cells }, (_, k) => {
        const who = owner[k];
        if (who === undefined) return null;
        const t = k / cells;
        const reveal = progress.interpolate({ inputRange: [t * 0.7, t * 0.7 + 0.3], outputRange: [0, 1], extrapolate: "clamp" });
        return Animated.multiply(reveal, dims[who]);
      }),
    [cells, ownerKey, dims, progress]
  );

  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    if (selectedIndex === undefined) setOwn(next);
    onSelect?.(next, next === null ? null : data[next]);
    if (next !== null) theme.haptics?.();
  };
  if (!data.length || !whole) return <Empty height={160} text={emptyText} />;

  const pct = (v: number) => `${Math.round((v / Math.max(whole, sum)) * 100)}%`;
  const describe = (i: number) => `${data[i].label} ${formatValue(values[i], data[i])}, ${pct(values[i])}`;
  const a11y = adjustable(accessibilityLabel ?? `Waffle chart. ${data.map((_, i) => describe(i)).join(". ")}`, active === null ? undefined : describe(active), data.length, active, (i) => choose(i));
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ alignItems: "center" }} {...a11y}>
        {width > 0 ? (
          <View style={{ width: gridW, height: size * R + gap * (R - 1) }}>
            {Array.from({ length: cells }, (_, k) => {
              const r = Math.floor(k / C);
              const c = k % C;
              const who = owner[k];
              return (
                <View
                  key={k}
                  style={{
                    position: "absolute",
                    left: c * (size + gap),
                    top: r * (size + gap),
                    width: size,
                    height: size,
                    borderRadius: shape === "circle" ? size / 2 : Math.max(2, size * 0.22),
                    backgroundColor: trackColor ?? theme.muted,
                  }}
                >
                  {who !== undefined && cellOpacity[k] ? (
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        { borderRadius: shape === "circle" ? size / 2 : Math.max(2, size * 0.22), backgroundColor: colorOf(who), opacity: cellOpacity[k]! },
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
            <TouchLayer
              onTap={(x, y) => {
                const c = clamp(Math.floor(x / (size + gap)), 0, C - 1);
                const r = clamp(Math.floor(y / (size + gap)), 0, R - 1);
                const who = owner[r * C + c];
                choose(who === undefined ? null : who);
              }}
            />
          </View>
        ) : (
          <View style={{ height: maxCellSize * R }} />
        )}
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
              <Text style={[styles.value, { color: theme.foreground }]}>{`  ${data.length === 1 ? pct(values[i]) : formatValue(values[i], d)}`}</Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 6, marginTop: 14 },
  item: { fontSize: 12 },
  value: { fontWeight: "600", fontVariant: ["tabular-nums"] },
});
