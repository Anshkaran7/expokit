// Ready-made KPI tile: icon, title, big value, delta pill and a mini trend — one line in your screen.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { clamp, useReducedMotion } from "../internal";
import { TEXT_SCALE, buildPath } from "../kit";
import { EASE, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface StatCardProps {
  title: string;
  /** Big number or text ("$12.4k", 1284). Numbers get thousands separators. */
  value: string | number;
  /** Change in percent: 12.4 → "+12.4%" (green), -3 → "−3%" (red). */
  delta?: number;
  /** Down is good (costs, churn, resting heart rate): flips the delta colours. */
  invertDelta?: boolean;
  /** Small text after the delta ("vs last week") or under the value. */
  caption?: string;
  /** Emoji or icon, shown in a soft tinted circle. */
  icon?: React.ReactNode;
  /** Tint for the icon circle and the trend. Defaults to the theme's first colour. */
  color?: string;
  /** Mini chart values. */
  trend?: number[];
  trendType?: "line" | "bars" | "none";
  /** Custom chart instead of `trend` (a MiniRing, PillBarChart…). */
  children?: React.ReactNode;
  /** "card": bordered surface (default). "plain": no surface, for your own container. */
  variant?: "card" | "plain";
  size?: "sm" | "md";
  onPress?: () => void;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({
  title,
  value,
  delta,
  invertDelta = false,
  caption,
  icon,
  color,
  trend,
  trendType = "line",
  children,
  variant = "card",
  size = "md",
  onPress,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: StatCardProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const tint = color ?? theme.palette[0];
  const sm = size === "sm";
  const shown = typeof value === "number" ? value.toLocaleString("en-US") : value;
  const good = delta === undefined ? true : (delta >= 0) !== invertDelta;
  const deltaText = delta === undefined ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  const deltaColor = good ? theme.positive : theme.negative;
  const font = { fontFamily: theme.fontFamily };

  // Entrance: the tile's chart rises in (native thread).
  const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      enter.setValue(1);
      return;
    }
    const a = Animated.timing(enter, { toValue: 1, duration: 700, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [animate]);

  const chart = children ?? (trend && trend.length > 1 && trendType !== "none" ? <MiniTrend values={trend} type={trendType} color={tint} height={sm ? 34 : 44} /> : null);
  const body = (
    <>
      <View style={styles.head}>
        {icon ? (
          <View style={[styles.icon, sm && styles.iconSm, { backgroundColor: mixColor(tint, theme.card, theme.dark ? 0.72 : 0.86) }]}>
            {typeof icon === "string" ? <Text maxFontSizeMultiplier={1.2} style={{ fontSize: sm ? 13 : 15 }}>{icon}</Text> : icon}
          </View>
        ) : null}
        <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.title, font, sm && styles.titleSm, { color: theme.mutedForeground }]}>
          {title}
        </Text>
      </View>
      <View style={styles.row}>
        {/* The value wins the row; the mini chart takes what is left. */}
        <View style={{ flexShrink: 0, maxWidth: chart ? "68%" : "100%" }}>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={[styles.value, font, sm && styles.valueSm, { color: theme.foreground }]}>
            {shown}
          </Text>
          {deltaText || caption ? (
            <View style={styles.meta}>
              {deltaText ? (
                <View style={[styles.pill, { backgroundColor: mixColor(deltaColor, theme.card, theme.dark ? 0.75 : 0.86) }]}>
                  <Text maxFontSizeMultiplier={1.2} style={[styles.pillText, font, { color: deltaColor }]}>
                    {deltaText}
                  </Text>
                </View>
              ) : null}
              {caption ? (
                <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.caption, font, { color: theme.mutedForeground }]}>
                  {caption}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {chart ? (
          <Animated.View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 36, maxWidth: sm ? 96 : 140, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            {chart}
          </Animated.View>
        ) : null}
      </View>
    </>
  );
  const a11y = {
    accessible: true,
    accessibilityRole: onPress ? ("button" as const) : ("summary" as const),
    accessibilityLabel: accessibilityLabel ?? `${title}: ${shown}${deltaText ? `, ${deltaText}` : ""}${caption ? ` ${caption}` : ""}`,
  };
  const surface: StyleProp<ViewStyle> =
    variant === "card"
      ? [styles.card, sm && styles.cardSm, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius + 6 }]
      : null;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [surface, { opacity: pressed ? 0.7 : 1 }, style]} {...a11y}>
      {body}
    </Pressable>
  ) : (
    <View style={[surface, style]} {...a11y}>
      {body}
    </View>
  );
}

/** Static mini line (with soft area) or capsule bars; the last value is highlighted. */
function MiniTrend({ values, type, color, height }: { values: number[]; type: "line" | "bars"; color: string; height: number }) {
  const theme = useChartTheme();
  const [width, onLayout] = useWidth();
  const vals = values.map(num);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const id = useMemo(() => `stat-${color.replace(/[^a-zA-Z0-9]/g, "")}`, [color]);
  if (type === "bars") {
    const peak = Math.max(1e-9, ...vals.map((v) => Math.max(0, v)));
    return (
      <View onLayout={onLayout} style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        {vals.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              maxWidth: 8,
              height: clamp((Math.max(0, v) / peak) * height, 4, height),
              borderRadius: 4,
              backgroundColor: color,
              opacity: i === vals.length - 1 ? 1 : 0.32,
            }}
          />
        ))}
      </View>
    );
  }
  const pts = width ? vals.map((v, i) => ({ x: 2 + (i / (vals.length - 1)) * (width - 4), y: 3 + (1 - (v - lo) / span) * (height - 8) })) : [];
  const line = pts.length ? buildPath(pts, "monotone") : "";
  const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z` : "";
  const last = pts[pts.length - 1];
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={theme.dark ? 0.35 : 0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${id})`} />
          <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {last ? <Path d={`M ${last.x} ${last.y} m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`} fill={color} stroke={theme.card} strokeWidth={1.5} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  cardSm: { padding: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  iconSm: { width: 24, height: 24, borderRadius: 12 },
  title: { flex: 1, fontSize: 13, fontWeight: "500" },
  titleSm: { fontSize: 12 },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  value: { fontSize: 28, fontWeight: "700", letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  valueSm: { fontSize: 20 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  caption: { fontSize: 11, flexShrink: 1 },
});
