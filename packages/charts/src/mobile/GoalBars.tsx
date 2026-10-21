// Goal progress rows: "Monthly revenue  $73,000 / $100,000" with a gradient bar. Budgets, savings, OKRs.
import React from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Empty, mixColor, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface GoalDatum {
  label: string;
  value: number;
  target: number;
  /** Bar colour (the gradient runs from a lighter tint to this). */
  color?: string;
  /** Emoji or icon before the label. */
  icon?: React.ReactNode;
}

export interface GoalBarsProps {
  data: GoalDatum[];
  /** Bar thickness. */
  barHeight?: number;
  /** Space between rows. */
  gap?: number;
  /** Default bar colour. */
  color?: string;
  trackColor?: string;
  /** Right side: "value / target" (default), "percent" or "both". */
  show?: "fraction" | "percent" | "both";
  formatValue?: (value: number, datum: GoalDatum) => string;
  /** Text when a goal is reached. Pass null to keep the numbers. */
  doneLabel?: string | null;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function GoalBars({
  data = [],
  barHeight = 10,
  gap = 18,
  color,
  trackColor,
  show = "fraction",
  formatValue = (v) => compactNumber(v),
  doneLabel = "Done",
  animate: animateProp = true,
  emptyText = "No goals",
  accessibilityLabel,
  style,
}: GoalBarsProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const fracs = data.map((d) => (num(d.target) > 0 ? clamp(num(d.value) / num(d.target), 0, 1) : 0));
  // Each bar is full width in a clipping track and slides in from the left (native thread).
  const progress = useNativeValues(fracs, { animate, from: 0, stagger: 70, duration: 900 });
  if (!data.length) return <Empty height={80} text={emptyText} />;

  const font = { fontFamily: theme.fontFamily };
  const r = barHeight / 2;
  const right = (d: GoalDatum, f: number) => {
    const pct = `${Math.round((num(d.target) ? num(d.value) / num(d.target) : 0) * 100)}%`;
    if (f >= 1 && doneLabel) return `${doneLabel} · ${formatValue(num(d.value), d)}`;
    if (show === "percent") return pct;
    const frac = `${formatValue(num(d.value), d)} / ${formatValue(num(d.target), d)}`;
    return show === "both" ? `${frac} · ${pct}` : frac;
  };

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityLabel={accessibilityLabel ?? `Goals. ${data.map((d, i) => `${d.label}: ${right(d, fracs[i])}`).join(". ")}`}
    >
      {data.map((d, i) => {
        const c = d.color ?? color ?? theme.palette[i % theme.palette.length];
        const done = fracs[i] >= 1;
        const id = `goal-${i}-${c.replace(/[^a-zA-Z0-9]/g, "")}`;
        return (
          <View key={`${d.label}-${i}`} style={{ marginTop: i ? gap : 0 }}>
            <View style={styles.row}>
              {d.icon ? <View style={styles.icon}>{typeof d.icon === "string" ? <Text maxFontSizeMultiplier={1.2}>{d.icon}</Text> : d.icon}</View> : null}
              <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.label, font, { color: theme.foreground }]}>
                {d.label}
              </Text>
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.value, font, { color: done ? theme.positive : theme.mutedForeground }]}>
                {right(d, fracs[i])}
              </Text>
            </View>
            <View style={{ height: barHeight, borderRadius: r, overflow: "hidden", backgroundColor: trackColor ?? theme.muted, marginTop: 8 }}>
              {width > 0 ? (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: r, overflow: "hidden", transform: [{ translateX: progress[i].interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] },
                  ]}
                >
                  <Svg width={width} height={barHeight}>
                    <Defs>
                      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={mixColor(c, theme.card, 0.45)} />
                        <Stop offset="1" stopColor={c} />
                      </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={width} height={barHeight} rx={r} fill={`url(#${id})`} />
                  </Svg>
                </Animated.View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 20, alignItems: "center" },
  label: { flex: 1, fontSize: 14, fontWeight: "500" },
  value: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
