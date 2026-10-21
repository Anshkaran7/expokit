// Stock / crypto / net-worth price chart: big value + change that follow your finger, time-range tabs,
// green or red by trend. Built on AreaSeriesChart, so scrubbing, haptics and VoiceOver come for free.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { AreaSeriesChart } from "../CartesianCharts";
import { useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { EASE, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface PricePoint {
  /** Shown under the value while scrubbing ("Oct 21, 3:30 PM"). */
  label: string;
  value: number;
}

export interface PriceChartProps {
  /** Points, oldest first. Ignored when `ranges` is given. */
  data?: PricePoint[];
  /** Time-range tabs: { "1D": points, "1W": points, … } in display order. */
  ranges?: Record<string, PricePoint[]>;
  /** Tab shown first. Defaults to the first key of `ranges`. */
  defaultRange?: string;
  onRangeChange?: (range: string) => void;
  /** Small title above the value ("Bitcoin", "Net worth"). */
  title?: string;
  height?: number;
  /** Overrides the green / red trend colour. */
  color?: string;
  /** Dashed line at the first value of the range (previous close). */
  showBaseline?: boolean;
  /** Big value text. */
  formatValue?: (value: number) => string;
  /** Change text, e.g. "+$1,240.50". Percent is added automatically. */
  formatChange?: (change: number) => string;
  /** Fired with the point under the finger (null when released). */
  onScrub?: (point: PricePoint | null, index: number | null) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PriceChart({
  data,
  ranges,
  defaultRange,
  onRangeChange,
  title,
  height = 200,
  color,
  showBaseline = true,
  formatValue = money,
  formatChange = (c) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`,
  onScrub,
  onScrubStart,
  onScrubEnd,
  animate: animateProp = true,
  style,
}: PriceChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const keys = ranges ? Object.keys(ranges) : [];
  const [range, setRange] = useState(defaultRange ?? keys[0] ?? "");
  const points = (ranges ? ranges[range] ?? ranges[keys[0]] : data) ?? [];
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover !== null && hover < points.length ? hover : null;
  const first = num(points[0]?.value);
  const last = num(points[points.length - 1]?.value);
  const shown = idx === null ? last : num(points[idx].value);
  const change = shown - first;
  const pct = first ? (change / Math.abs(first)) * 100 : 0;
  const up = (idx === null ? last - first : change) >= 0;
  const tint = color ?? (up ? theme.positive : theme.negative);
  const font = { fontFamily: theme.fontFamily };

  // Range tabs: the highlight pill slides under the chosen tab (native thread).
  const [tabsW, onTabsLayout] = useWidth();
  const pill = useRef(new Animated.Value(0)).current;
  const tabW = keys.length && tabsW ? (tabsW - 6) / keys.length : 0; // minus the 3pt padding each side
  const at = Math.max(0, keys.indexOf(range));
  useEffect(() => {
    if (!tabW) return;
    if (!animate) pill.setValue(at * tabW);
    else Animated.timing(pill, { toValue: at * tabW, duration: 260, easing: EASE, useNativeDriver: true }).start();
  }, [at, tabW, animate]);

  return (
    <View style={style}>
      {title ? (
        <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.title, font, { color: theme.mutedForeground }]}>
          {title}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={[styles.value, font, { color: theme.foreground }]}>
        {formatValue(shown)}
      </Text>
      <View style={styles.changeRow}>
        <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.change, font, { color: tint }]}>
          {`${formatChange(change)} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`}
        </Text>
        <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.when, font, { color: theme.mutedForeground }]}>
          {idx === null ? (range ? ` ${rangeWord(range)}` : "") : ` ${points[idx].label}`}
        </Text>
      </View>
      <AreaSeriesChart
        data={points}
        config={{ value: { label: title ?? "Price", color: tint } }}
        xKey="label"
        height={height}
        yDomain={["auto", "auto"]}
        showGrid={false}
        showXAxis={false}
        showTooltip={false}
        showDots={false}
        strokeWidth={2}
        fillVariant="gradient"
        animationType="left-to-right"
        animate={animate}
        referenceLines={showBaseline && points.length > 1 ? [{ value: first, color: theme.mutedForeground }] : []}
        formatValue={formatValue}
        accessibilityLabel={`${title ?? "Price"} ${formatValue(last)}, ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}%${range ? ` ${rangeWord(range)}` : ""}`}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onSelect={(i) => {
          setHover(i);
          onScrub?.(i === null ? null : points[i] ?? null, i);
        }}
        style={{ marginTop: 12 }}
      />
      {keys.length > 1 ? (
        <View onLayout={onTabsLayout} style={[styles.tabs, { backgroundColor: theme.muted }]}>
          {tabW ? <Animated.View style={[styles.pill, { width: tabW, backgroundColor: theme.card, transform: [{ translateX: pill }] }]} /> : null}
          {keys.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: k === range }}
              onPress={() => {
                if (k === range) return;
                setRange(k);
                setHover(null);
                onRangeChange?.(k);
                theme.haptics?.();
              }}
              style={styles.tab}
            >
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tabText, font, { color: k === range ? theme.foreground : theme.mutedForeground, fontWeight: k === range ? "600" : "500" }]}>
                {k}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** "1W" → "past week" (anything else is shown as is). */
function rangeWord(r: string) {
  const map: Record<string, string> = { "1D": "today", "1W": "past week", "1M": "past month", "3M": "past 3 months", "6M": "past 6 months", "1Y": "past year", YTD: "year to date", ALL: "all time" };
  return map[r.toUpperCase()] ?? r;
}

const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  value: { fontSize: 34, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  changeRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  change: { fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  when: { fontSize: 13, flexShrink: 1 },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 3, marginTop: 12 },
  pill: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: 9 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 7 },
  tabText: { fontSize: 13 },
});
