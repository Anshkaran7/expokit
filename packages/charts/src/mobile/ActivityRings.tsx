// Apple-style activity rings: Move / Exercise / Stand (or any daily goals), with a legend.
import React, { useState } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { AnimatedCircle, TouchLayer, clamp, compactNumber, useAnimatedValues, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Empty, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface ActivityRing {
  label: string;
  value: number;
  max: number;
  color?: string;
  /** Unit after the numbers in the legend ("kcal", "min"). */
  unit?: string;
}

export interface ActivityRingsProps {
  rings: ActivityRing[];
  /** Diameter. Defaults to the parent width, up to 220 (with legend beside it on wide layouts). */
  size?: number;
  /** Ring thickness. Defaults to fit. */
  thickness?: number;
  gap?: number;
  /** "right" puts the legend beside the rings, "bottom" under them, "none" hides it. */
  legend?: "right" | "bottom" | "none";
  /** Rendered in the middle. */
  children?: React.ReactNode;
  formatValue?: (value: number, ring: ActivityRing) => string;
  onSelect?: (index: number | null, ring: ActivityRing | null) => void;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ActivityRings({
  rings = [],
  size,
  thickness,
  gap = 4,
  legend = "right",
  children,
  formatValue = (v) => compactNumber(v),
  onSelect,
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: ActivityRingsProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const n = rings.length;
  const beside = legend === "right" && width >= 300;
  const D = Math.max(80, Math.min(size ?? 220, beside ? width * 0.5 : width || 220));
  const t = thickness ?? clamp((D / 2 - 18) / Math.max(n, 1) - gap, 8, 26);
  const fracs = rings.map((r) => (num(r.max) > 0 ? clamp(num(r.value) / num(r.max), 0, 1) : 0));
  const values = useAnimatedValues(fracs, { animate, duration: 1200, delay: (i) => i * 120 });
  const colorOf = (i: number) => rings[i].color ?? theme.palette[i % theme.palette.length];

  if (!n) return <Empty height={160} text={emptyText} />;
  const font = { fontFamily: theme.fontFamily };
  const text = (r: ActivityRing) => `${formatValue(num(r.value), r)} / ${formatValue(num(r.max), r)}${r.unit ? ` ${r.unit}` : ""}`;
  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    setActive(next);
    onSelect?.(next, next === null ? null : rings[next]);
    if (next !== null) theme.haptics?.();
  };

  const ringsView = (
    <View style={{ width: D, height: D }}>
      <Svg width={D} height={D} style={{ transform: [{ rotate: "-90deg" }] }}>
        {rings.map((ring, i) => {
          const rad = D / 2 - t / 2 - i * (t + gap);
          if (rad <= t / 2) return null;
          const c = 2 * Math.PI * rad;
          const col = colorOf(i);
          return (
            <G key={`${ring.label}-${i}`} opacity={active === null || active === i ? 1 : 0.35}>
              <Circle cx={D / 2} cy={D / 2} r={rad} stroke={mixColor(col, theme.card, theme.dark ? 0.72 : 0.82)} strokeWidth={t} fill="none" />
              <AnimatedCircle
                cx={D / 2}
                cy={D / 2}
                r={rad}
                stroke={col}
                strokeWidth={t}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={[c, c]}
                strokeDashoffset={values[i].interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
              />
            </G>
          );
        })}
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
      <TouchLayer
        onTap={(x, y) => {
          const d = Math.hypot(x - D / 2, y - D / 2);
          const i = rings.findIndex((_, k) => Math.abs(d - (D / 2 - t / 2 - k * (t + gap))) <= t / 2 + gap / 2);
          choose(i === -1 ? null : i);
        }}
      />
    </View>
  );

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel ?? `Activity rings. ${rings.map((r, i) => `${r.label}: ${text(r)}, ${Math.round(fracs[i] * 100)}%`).join(". ")}`}
    >
      {width > 0 ? (
        <View style={beside ? styles.side : styles.stack}>
          {ringsView}
          {legend !== "none" ? (
            <View style={beside ? styles.legendSide : styles.legendBottom}>
              {rings.map((r, i) => (
                <Text
                  key={`${r.label}-${i}`}
                  onPress={() => choose(i)}
                  suppressHighlighting
                  maxFontSizeMultiplier={TEXT_SCALE}
                  style={{ opacity: active === null || active === i ? 1 : 0.45 }}
                >
                  <Text style={[styles.legendLabel, font, { color: theme.mutedForeground }]}>{`${r.label}\n`}</Text>
                  <Text style={[styles.legendValue, font, { color: colorOf(i) }]}>{text(r)}</Text>
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height: Math.min(size ?? 220, 220) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  side: { flexDirection: "row", alignItems: "center", gap: 20 },
  stack: { alignItems: "center", gap: 14 },
  legendSide: { flex: 1, gap: 12 },
  legendBottom: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 20, rowGap: 8 },
  legendLabel: { fontSize: 12 },
  legendValue: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
