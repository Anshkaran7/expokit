// Watch-dial ring of ticks that light up to a goal: steps, focus minutes, savings.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, clamp, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { EASE, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface TickRingProps {
  value: number;
  max?: number;
  /** Number of ticks around the ring. */
  ticks?: number;
  /** Lit ticks blend from the first colour to the second. */
  colors?: [string, string];
  trackColor?: string;
  /** Diameter. Defaults to the parent width, up to 240. */
  size?: number;
  /** Tick length as a fraction of the radius. */
  tickLength?: number;
  /** Tick thickness. */
  thickness?: number;
  /** Degrees of the ring (360 = full, 270 = open at the bottom). */
  sweep?: number;
  /** Centre text. Defaults to the value. */
  formatValue?: (value: number, max: number) => string;
  label?: string;
  /** Small line under the label ("of 10,000"). */
  sublabel?: string;
  /** Drag around the ring to set the value. */
  onChange?: (value: number) => void;
  step?: number;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function TickRing({
  value,
  max = 100,
  ticks = 60,
  colors,
  trackColor,
  size,
  tickLength = 0.2,
  thickness,
  sweep = 360,
  formatValue = (v) => Math.round(v).toLocaleString("en-US"),
  label,
  sublabel,
  onChange,
  step = 1,
  onScrubStart,
  onScrubEnd,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: TickRingProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const count = Math.max(8, Math.round(ticks));
  const arc = clamp(sweep, 30, 360);
  const full = arc >= 359.9;
  const start = full ? 0 : 180 - arc / 2 + 180; // open gap centred at the bottom
  const from = colors?.[0] ?? theme.palette[0];
  const to = colors?.[1] ?? mixColor(from, theme.palette[1 % theme.palette.length] ?? from, 0.85);
  const D = Math.min(size ?? 240, width || 0);
  const outer = D / 2 - 2;
  const len = Math.max(6, outer * clamp(tickLength, 0.05, 0.6));
  const bw = thickness ?? clamp(((2 * Math.PI * (outer - len / 2)) / count) * 0.45, 2, 8);
  const frac = clamp(num(value) / (max || 1), 0, 1);
  const angleOf = (k: number) => start + (full ? (k * 360) / count : (k * arc) / (count - 1));

  // Lit tick count on the native thread; the last lit tick fades in partway.
  const lit = useRef(new Animated.Value(animate ? 0 : frac * count)).current;
  const [shown, setShown] = useState(animate ? 0 : num(value));
  const dragging = useRef(false);
  useEffect(() => {
    const id = lit.addListener(({ value: v }) => {
      const next = Math.round(((v / count) * max) / step) * step;
      setShown((p) => (p === next ? p : next));
    });
    return () => lit.removeListener(id);
  }, [count, max, step]);
  useEffect(() => {
    if (dragging.current) return;
    if (!animate) {
      lit.setValue(frac * count);
      return;
    }
    const a = Animated.timing(lit, { toValue: frac * count, duration: 1100, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [frac, count, animate]);

  const tickOpacity = useMemo(
    () => Array.from({ length: count }, (_, k) => lit.interpolate({ inputRange: [k, k + 1], outputRange: [0, 1], extrapolate: "clamp" })),
    [count, lit]
  );

  const cx = width / 2;
  const cy = outer + 2;
  const lastTick = useRef(-1);
  const setFrom = (x: number, y: number) => {
    let a = (Math.atan2(x - cx, cy - y) * 180) / Math.PI; // 0 = up, clockwise
    if (a < 0) a += 360;
    let f = full ? a / 360 : ((a - start + 720) % 360) / arc;
    if (!full && f > 1) f = f - 1 > (360 - arc) / arc / 2 ? 0 : 1; // in the gap: snap to the nearer end
    const v = clamp(Math.round((clamp(f, 0, 1) * max) / step) * step, 0, max);
    lit.setValue((v / (max || 1)) * count);
    const t = Math.round((v / (max || 1)) * count);
    if (t !== lastTick.current) {
      lastTick.current = t;
      theme.haptics?.();
    }
    onChange?.(v);
  };
  const font = { fontFamily: theme.fontFamily };

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityRole={onChange ? "adjustable" : "progressbar"}
      accessibilityLabel={accessibilityLabel ?? `${label ?? "Progress"}: ${formatValue(num(value), max)}${sublabel ? ` ${sublabel}` : ""}`}
      accessibilityValue={{ min: 0, max, now: num(value) }}
      accessibilityActions={onChange ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={(e) => onChange?.(clamp(num(value) + (e.nativeEvent.actionName === "increment" ? 1 : -1) * Math.max(step, max / 20), 0, max))}
    >
      {width > 0 ? (
        <View style={{ height: D }}>
          {Array.from({ length: count }, (_, k) => (
            <View
              key={k}
              pointerEvents="none"
              style={{ position: "absolute", left: cx - bw / 2, top: cy - outer, width: bw, height: outer * 2, transform: [{ rotate: `${angleOf(k)}deg` }] }}
            >
              <View style={{ height: len, borderRadius: bw / 2, backgroundColor: trackColor ?? theme.muted, overflow: "hidden" }}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: mixColor(from, to, k / (count - 1)), opacity: tickOpacity[k] },
                  ]}
                />
              </View>
            </View>
          ))}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[font, { color: theme.foreground, fontSize: clamp(outer * 0.3, 18, 44), fontWeight: "700", letterSpacing: -0.8, fontVariant: ["tabular-nums"], maxWidth: (outer - len) * 1.6 }]}
            >
              {formatValue(shown, max)}
            </Text>
            {label ? (
              <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[font, styles.label, { color: theme.mutedForeground }]}>
                {label}
              </Text>
            ) : null}
            {sublabel ? (
              <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[font, styles.sub, { color: theme.mutedForeground }]}>
                {sublabel}
              </Text>
            ) : null}
          </View>
          {onChange ? (
            <TouchLayer
              lockOnGrant={(x, y) => {
                const d = Math.hypot(x - cx, y - cy);
                return d >= outer - len - 18 && d <= outer + 14;
              }}
              onScrubStart={() => {
                dragging.current = true;
                onScrubStart?.();
              }}
              onScrubEnd={() => {
                dragging.current = false;
                onScrubEnd?.();
              }}
              onMove={setFrom}
              onTap={setFrom}
              onRelease={() => {
                dragging.current = false;
              }}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ height: Math.min(size ?? 240, 240) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, marginTop: 2 },
  sub: { fontSize: 11, marginTop: 1 },
});
