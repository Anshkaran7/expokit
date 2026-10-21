// A circle or capsule filled with gently waving liquid: water intake, battery, savings goal.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { clamp, useReducedMotion } from "../internal";
import { TEXT_SCALE, readableTextColor } from "../kit";
import { EASE, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface LiquidGaugeProps {
  value: number;
  max?: number;
  /** "circle" (default) or a vertical "pill" (bottle / battery). */
  shape?: "circle" | "pill";
  /** Circle diameter or pill height. Defaults to the parent width, up to 200. */
  size?: number;
  color?: string;
  trackColor?: string;
  /** Wave height in points (0 = flat). */
  waveHeight?: number;
  /** Centre text. Defaults to the percentage. */
  formatValue?: (value: number, max: number) => string;
  label?: string;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Sine wave across `w` points with whole periods, so sliding it by w/2 loops seamlessly. */
function wavePath(w: number, amp: number, periods: number) {
  let d = `M 0 ${amp}`;
  for (let x = 0; x <= w; x += 4) d += ` L ${x} ${(amp + amp * Math.sin((x / w) * periods * 2 * Math.PI)).toFixed(2)}`;
  return `${d} L ${w} ${amp * 2 + 2} L 0 ${amp * 2 + 2} Z`;
}

export function LiquidGauge({
  value,
  max = 100,
  shape = "circle",
  size,
  color,
  trackColor,
  waveHeight = 6,
  formatValue = (v, m) => `${Math.round((v / (m || 1)) * 100)}%`,
  label,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: LiquidGaugeProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const pill = shape === "pill";
  // A given size wins; otherwise fill the measured width (up to 200).
  const H = size ?? (pill ? 200 : Math.min(200, width || 0));
  const W = pill ? H * 0.48 : H;
  const amp = Math.max(0, waveHeight);
  const frac = clamp(num(value) / (max || 1), 0, 1);
  const tint = color ?? theme.palette[0];
  const level = H - frac * H; // y of the liquid surface

  // Surface height and wave drift both run on the native thread.
  const surface = useRef(new Animated.Value(animate ? H : level)).current;
  const sized = useRef(0);
  useEffect(() => {
    if (!H) return;
    if (!animate) {
      surface.setValue(level);
      return;
    }
    // First real size: start empty (at the bottom), then fill up.
    if (sized.current !== H) {
      if (!sized.current) surface.setValue(H);
      sized.current = H;
    }
    const a = Animated.timing(surface, { toValue: level, duration: 1400, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [level, H, animate]);
  const drift = useRef(new Animated.Value(0)).current;
  const drift2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (calm || !amp || !W) return;
    const loop = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    const a = loop(drift, 2600);
    const b = loop(drift2, 3900);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [calm, amp, W]);

  const lift = useMemo(() => Animated.add(surface, -amp), [surface, amp]);
  // Contrast text lives inside the liquid; shift it back so it lines up with the outer text.
  const textShift = useMemo(() => Animated.multiply(lift, -1), [lift]);
  const radius = pill ? W / 2 : H / 2;
  const front = wavePath(W * 2, amp, 4);
  const back = wavePath(W * 2, amp * 0.8, 3);
  const font = { fontFamily: theme.fontFamily };
  const text = (c: string) => (
    <View style={[styles.center, { width: W, height: H }]}>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={[font, styles.value, { color: c, fontSize: clamp(Math.min(W, H) * 0.17, 15, 36) }]}>
        {formatValue(num(value), max)}
      </Text>
      {label ? (
        <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[font, styles.label, { color: c }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[{ alignItems: "center" }, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${label ?? "Level"}: ${formatValue(num(value), max)}`}
      accessibilityValue={{ min: 0, max, now: num(value) }}
    >
      {H > 0 && W > 0 ? (
        <View style={{ width: W, height: H, borderRadius: radius, overflow: "hidden", backgroundColor: trackColor ?? mixColor(tint, theme.card, theme.dark ? 0.82 : 0.88) }}>
          {/* Text over the empty part… */}
          {text(theme.foreground)}
          {/* …and the liquid, which carries its own copy of the text in a contrasting colour. */}
          <Animated.View style={{ position: "absolute", left: 0, top: 0, width: W, height: H + amp * 2, overflow: "hidden", transform: [{ translateY: lift }] }}>
            <Animated.View style={{ position: "absolute", left: 0, top: 0, opacity: 0.45, transform: [{ translateX: drift2.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] }) }] }}>
              <Svg width={W * 2} height={amp * 2 + 2}>
                <Path d={back} fill={tint} />
              </Svg>
            </Animated.View>
            <Animated.View style={{ position: "absolute", left: 0, top: 0, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -W] }) }] }}>
              <Svg width={W * 2} height={amp * 2 + 2}>
                <Path d={front} fill={tint} />
              </Svg>
            </Animated.View>
            <View style={{ position: "absolute", left: 0, right: 0, top: amp * 2, bottom: 0, backgroundColor: tint }} />
            {/* The liquid clips this contrasting copy of the text, counter-shifted so it lines up with the outer one. */}
            <Animated.View style={{ position: "absolute", left: 0, top: 0, transform: [{ translateY: textShift }] }}>{text(readableTextColor(tint))}</Animated.View>
          </Animated.View>
        </View>
      ) : (
        <View style={{ height: Math.min(size ?? 200, 200) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  value: { fontWeight: "700", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  label: { fontSize: 12, marginTop: 2, opacity: 0.85 },
});
