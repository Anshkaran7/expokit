// Ranked rows with a soft capsule bar: top countries, spending by category, most-used apps.
import React, { useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Empty, adjustable, mixColor, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface BarListDatum {
  label: string;
  value: number;
  color?: string;
  /** Emoji or icon shown before the label. */
  icon?: React.ReactNode;
}

export interface BarListProps {
  data: BarListDatum[];
  /** Value of a full bar. Defaults to the largest value. */
  max?: number;
  /** "desc" (default) puts the biggest first; "none" keeps your order. */
  sort?: "desc" | "asc" | "none";
  /** Bar colour. Defaults to a soft tint of the theme's first colour. */
  color?: string;
  /** "fill": bar behind the label (default). "track": thin bar under the label. */
  variant?: "fill" | "track";
  /** Row height for "fill", bar thickness for "track". */
  barHeight?: number;
  /** Space between rows. */
  gap?: number;
  /** 1, 2, 3… before each label. */
  showRank?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: BarListDatum | null) => void;
  formatValue?: (value: number, datum: BarListDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function BarList({
  data = [],
  max,
  sort = "desc",
  color,
  variant = "fill",
  barHeight,
  gap = 8,
  showRank = false,
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: BarListProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const rows = sort === "none" ? data : [...data].sort((a, b) => (sort === "asc" ? num(a.value) - num(b.value) : num(b.value) - num(a.value)));
  const n = rows.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const peak = max ?? Math.max(1e-9, ...rows.map((d) => Math.max(0, num(d.value))));
  const fill = variant === "fill";
  const rowH = fill ? barHeight ?? 36 : 34 + (barHeight ?? 6);
  const thick = fill ? rowH : barHeight ?? 6;
  const base = color ?? theme.palette[0];
  const soft = color ?? mixColor(base, theme.card, theme.dark ? 0.55 : 0.72);
  const fracs = rows.map((d) => clamp(Math.max(0, num(d.value)) / peak, 0, 1));
  // Bars slide in from the left inside a clipping track: no width animation, corners stay round.
  const progress = useNativeValues(fracs, { animate, from: 0, stagger: 45, duration: 750 });
  const dims = useNativeValues(rows.map((_, i) => (active === null || active === i ? 1 : 0.4)), { animate, duration: 200 });

  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    if (selectedIndex === undefined) setOwn(next);
    onSelect?.(next, next === null ? null : rows[next]);
    if (next !== null) theme.haptics?.();
  };
  if (!n) return <Empty height={120} text={emptyText} />;

  const text = (d: BarListDatum) => `${d.label} ${formatValue(num(d.value), d)}`;
  const a11y = adjustable(accessibilityLabel ?? `Ranked list. ${rows.slice(0, 10).map(text).join(". ")}`, active === null ? undefined : text(rows[active]), n, active, (i) => choose(i));
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style} onLayout={onLayout} {...a11y}>
      {rows.map((d, i) => {
        const label = (
          <View style={styles.labelRow}>
            {showRank ? <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.rank, font, { color: theme.mutedForeground }]}>{i + 1}</Text> : null}
            {d.icon ? <View style={styles.icon}>{typeof d.icon === "string" ? <Text maxFontSizeMultiplier={TEXT_SCALE}>{d.icon}</Text> : d.icon}</View> : null}
            <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.label, font, { color: theme.foreground }]}>
              {d.label}
            </Text>
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.value, font, { color: theme.foreground }]}>
              {formatValue(num(d.value), d)}
            </Text>
          </View>
        );
        const bar = (
          <View style={{ height: thick, borderRadius: Math.min(thick / 2, 10), overflow: "hidden", backgroundColor: fill ? "transparent" : theme.muted }}>
            {width > 0 ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: Math.min(thick / 2, 10), backgroundColor: d.color ? (fill ? mixColor(d.color, theme.card, 0.6) : d.color) : fill ? soft : base, transform: [{ translateX: progress[i].interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] },
                ]}
              />
            ) : null}
          </View>
        );
        return (
          <Animated.View key={`${d.label}-${i}`} style={{ marginTop: i ? gap : 0, opacity: dims[i] }}>
            {fill ? (
              <View style={{ height: rowH, justifyContent: "center" }}>
                <View style={StyleSheet.absoluteFill}>{bar}</View>
                <View style={{ paddingHorizontal: 12 }}>{label}</View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {label}
                {bar}
              </View>
            )}
          </Animated.View>
        );
      })}
      <View style={StyleSheet.absoluteFill}>
        <TouchLayer onTap={(_, y) => choose(clamp(Math.floor((y + gap / 2) / (rowH + gap)), 0, n - 1))} onHover={() => {}} onHoverEnd={() => {}} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rank: { fontSize: 12, width: 16, fontVariant: ["tabular-nums"] },
  icon: { width: 20, alignItems: "center" },
  label: { flex: 1, fontSize: 14 },
  value: { fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
