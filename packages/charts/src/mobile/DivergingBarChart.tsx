// Income vs expense, gains vs losses: one bar up and one bar down from a shared zero line per category.
import React, { useMemo, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Bubble, Empty, MAX_BAR, adjustable, columnAt, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface DivergingDatum {
  label: string;
  /** Up bar (income, gains). */
  positive: number;
  /** Down bar (expense, losses). A positive amount or a negative number — both work. */
  negative: number;
}

export interface DivergingBarChartProps {
  data: DivergingDatum[];
  /** Plot height (labels and bubble add to it). */
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
  /** Names in the bubble, legend and screen reader. */
  positiveLabel?: string;
  negativeLabel?: string;
  /** Opacity of other columns while one is selected. */
  inactiveOpacity?: number;
  gap?: number;
  barWidth?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** Adds a "Net" line to the bubble. */
  showNet?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: DivergingDatum | null) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function DivergingBarChart({
  data = [],
  height = 200,
  positiveColor,
  negativeColor,
  positiveLabel = "Income",
  negativeLabel = "Expense",
  inactiveOpacity = 0.35,
  gap = 10,
  barWidth,
  showLabels = true,
  showLegend = true,
  showTooltip = true,
  showNet = true,
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
}: DivergingBarChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const up = data.map((d) => Math.max(0, num(d.positive)));
  const down = data.map((d) => Math.abs(num(d.negative)));
  const upMax = Math.max(0, ...up);
  const downMax = Math.max(0, ...down);
  const both = upMax + downMax || 1;
  const split = 4; // gap around the zero line
  const zero = upMax || !downMax ? height * (upMax / both) : 0;
  const upRoom = Math.max(0, zero - split / 2);
  const downRoom = Math.max(0, height - zero - split / 2);
  const pos = positiveColor ?? theme.positive;
  const neg = negativeColor ?? theme.negative;

  const tipRoom = showTooltip ? (showNet ? 70 : 56) : 4;
  const colW = n && width ? (width - gap * (n - 1)) / n : 0;
  const bw = Math.max(4, Math.min(barWidth ?? Math.min(colW, MAX_BAR * 0.7), colW));
  const r = bw / 2;
  const hUp = up.map((v) => (v > 0 ? Math.max(r * 2, (v / both) * height) : 0)).map((h) => Math.min(h, upRoom));
  const hDown = down.map((v) => (v > 0 ? Math.max(r * 2, (v / both) * height) : 0)).map((h) => Math.min(h, downRoom));

  // Each bar is full height inside a clip box and slides out from the zero line (translateY, native).
  const upY = useNativeValues(hUp.map((h) => upRoom - h), { animate, from: upRoom, stagger: 40, duration: 700 });
  const downY = useNativeValues(hDown.map((h) => -(downRoom - h)), { animate, from: -downRoom, stagger: 40, duration: 700 });
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : inactiveOpacity)), { animate, duration: 200 });

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  const lines = useMemo(
    () => (i: number) => [
      `${positiveLabel} ${formatValue(up[i])}`,
      `${negativeLabel} ${formatValue(down[i])}`,
      ...(showNet ? [`Net ${up[i] - down[i] >= 0 ? "+" : "−"}${formatValue(Math.abs(up[i] - down[i]))}`] : []),
    ],
    [up.join(), down.join(), positiveLabel, negativeLabel, showNet, formatValue]
  );
  if (!n) return <Empty height={tipRoom + height} text={emptyText} />;

  const describe = (i: number) => `${data[i].label}: ${lines(i).join(", ")}`;
  const a11y = adjustable(accessibilityLabel ?? `${positiveLabel} and ${negativeLabel} chart, ${n} items`, active === null ? undefined : describe(active), n, active, choose);
  const xOf = (i: number) => i * (colW + gap) + colW / 2;
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style}>
      <View onLayout={onLayout} {...a11y}>
        {width > 0 ? (
          <>
            <View style={{ height: tipRoom + height }}>
              <View style={[styles.zero, { top: tipRoom + zero, backgroundColor: theme.border }]} />
              {data.map((d, i) => (
                <Animated.View key={`${d.label}-${i}`} style={{ position: "absolute", left: xOf(i) - bw / 2, top: tipRoom, width: bw, height, opacity: dims[i] }}>
                  <View style={{ height: upRoom, overflow: "hidden" }}>
                    <Animated.View style={{ height: upRoom, borderRadius: r, backgroundColor: pos, transform: [{ translateY: upY[i] }] }} />
                  </View>
                  <View style={{ position: "absolute", top: zero + split / 2, height: downRoom, width: bw, overflow: "hidden" }}>
                    <Animated.View style={{ height: downRoom, borderRadius: r, backgroundColor: neg, transform: [{ translateY: downY[i] }] }} />
                  </View>
                </Animated.View>
              ))}
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
              <Bubble visible={active !== null} x={active === null ? 0 : xOf(active)} y={active === null ? 0 : tipRoom + zero - (hUp[active] || 0) - 2} width={width} lines={active === null ? [" "] : lines(active)} animate={animate} />
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
          {[
            [positiveLabel, pos],
            [negativeLabel, neg],
          ].map(([label, c]) => (
            <Text key={label} maxFontSizeMultiplier={TEXT_SCALE} style={[styles.item, font, { color: theme.mutedForeground }]}>
              <Text style={{ color: c }}>● </Text>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zero: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
  label: { textAlign: "center", fontSize: 12 },
  legend: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 12 },
  item: { fontSize: 12 },
});
