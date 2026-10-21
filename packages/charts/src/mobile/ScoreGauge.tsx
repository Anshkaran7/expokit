// Half-donut score gauge with coloured bands and a marker: credit score, health score, NPS, AQI.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { clamp, useReducedMotion } from "../internal";
import { TEXT_SCALE, arc } from "../kit";
import { EASE, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface ScoreBand {
  /** Upper bound of the band (the last band should end at `max`). */
  to: number;
  label?: string;
  color?: string;
}

export interface ScoreGaugeProps {
  value: number;
  min?: number;
  max?: number;
  /** Coloured ranges. Defaults to four bands red → green. */
  bands?: ScoreBand[];
  /** Diameter. Defaults to the parent width, up to 300. */
  size?: number;
  thickness?: number;
  /** Degrees between bands. */
  bandGap?: number;
  /** Text under the score. Defaults to the current band's label. */
  label?: string;
  /** Small text at the two ends ("300" / "850"). */
  showRange?: boolean;
  formatValue?: (value: number) => string;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ScoreGauge({
  value,
  min = 0,
  max = 100,
  bands,
  size,
  thickness,
  bandGap = 3,
  label,
  showRange = true,
  formatValue = (v) => String(Math.round(v)),
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: ScoreGaugeProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const span = max - min || 1;
  const list: ScoreBand[] = bands?.length
    ? bands
    : [
        { to: min + span * 0.4, label: "Poor", color: theme.negative },
        { to: min + span * 0.6, label: "Fair", color: "#F59E0B" },
        { to: min + span * 0.8, label: "Good", color: "#84CC16" },
        { to: max, label: "Excellent", color: theme.positive },
      ];
  const D = Math.min(size ?? 300, width || 0);
  const t = thickness ?? clamp(D * 0.075, 10, 26);
  const r = D / 2 - t / 2 - 2;
  const cx = D / 2;
  const cy = D / 2;
  const v = clamp(num(value), min, max);
  const frac = (v - min) / span;
  const band = list.find((b) => v <= b.to) ?? list[list.length - 1];
  const angle = (x: number) => -Math.PI / 2 + ((x - min) / span) * Math.PI; // 0 rad = 12 o'clock
  const g = (bandGap * Math.PI) / 180;

  // The marker rides the arc: a full-size View rotated about the centre (native thread).
  const turn = useRef(new Animated.Value(animate ? 0 : frac)).current;
  const [shown, setShown] = useState(animate ? min : v);
  useEffect(() => {
    const id = turn.addListener(({ value: f }) => {
      const next = Math.round(min + f * span);
      setShown((p) => (p === next ? p : next));
    });
    return () => turn.removeListener(id);
  }, [min, span]);
  useEffect(() => {
    if (!animate) {
      turn.setValue(frac);
      setShown(v);
      return;
    }
    const a = Animated.timing(turn, { toValue: frac, duration: 1200, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [frac, animate]);

  const font = { fontFamily: theme.fontFamily };
  const H = D / 2 + t / 2 + 6;
  const mark = t + 8;

  return (
    <View
      style={[{ alignItems: "center" }, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Score ${formatValue(v)} of ${formatValue(max)}${band?.label ? `, ${band.label}` : ""}`}
      accessibilityValue={{ min, max, now: v }}
    >
      {D > 0 ? (
        <View style={{ width: D, height: H + (showRange ? 18 : 0) }}>
          <Svg width={D} height={H}>
            {list.map((b, i) => {
              const from = i === 0 ? min : list[i - 1].to;
              const a0 = angle(from) + (i === 0 ? 0 : g / 2);
              const a1 = angle(Math.min(b.to, max)) - (i === list.length - 1 ? 0 : g / 2);
              if (a1 <= a0) return null;
              const c = b.color ?? theme.palette[i % theme.palette.length];
              const cap = (a: number) => <Circle cx={cx + r * Math.sin(a)} cy={cy - r * Math.cos(a)} r={t / 2} fill={c} />;
              // Flat joins between bands; the two outer ends get round caps. Opacity on the group, so the cap
              // and the arc blend as one shape (no darker overlap).
              return (
                <G key={i} opacity={b === band ? 1 : 0.35}>
                  <Path d={arc(cx, cy, r, a0, a1)} stroke={c} strokeWidth={t} strokeLinecap="butt" fill="none" />
                  {i === 0 ? cap(a0) : null}
                  {i === list.length - 1 ? cap(a1) : null}
                </G>
              );
            })}
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: cx - mark / 2,
              top: cy - r - mark / 2,
              width: mark,
              height: mark,
              transform: [
                // Rotate about the gauge centre: move the pivot there, rotate, move back.
                { translateY: r },
                { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "90deg"] }) },
                { translateY: -r },
              ],
            }}
          >
            <View style={[styles.marker, { width: mark, height: mark, borderRadius: mark / 2, borderColor: band?.color ?? theme.foreground, backgroundColor: theme.card }]} />
          </Animated.View>
          <View pointerEvents="none" style={[styles.center, { top: cy - D * 0.26, height: D * 0.26 }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.score, font, { color: theme.foreground, fontSize: clamp(D * 0.17, 22, 52) }]}>
              {formatValue(shown)}
            </Text>
            {label ?? band?.label ? (
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.label, font, { color: band?.color ?? theme.mutedForeground }]}>
                {label ?? band?.label}
              </Text>
            ) : null}
          </View>
          {showRange ? (
            <View style={[styles.range, { top: H - 2 }]}>
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.end, font, { color: theme.mutedForeground }]}>{formatValue(min)}</Text>
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.end, font, { color: theme.mutedForeground }]}>{formatValue(max)}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height: Math.min(size ?? 300, 300) / 2 + 30 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { borderWidth: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  center: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "flex-end" },
  score: { fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  label: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  range: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  end: { fontSize: 11, fontVariant: ["tabular-nums"] },
});
