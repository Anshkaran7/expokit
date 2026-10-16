// Visual system shared by every v2 chart: fills, patterns, glow, dots,
// background textures, reveal animations and loading skeletons.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
} from "react-native-svg";
import { useChartTheme } from "./theme";

export type FillVariant =
  | "gradient"
  | "gradient-reverse"
  | "solid"
  | "dotted"
  | "lines"
  | "hatched"
  | "striped"
  | "duotone"
  | "duotone-reverse";
export type StrokeVariant = "solid" | "dashed" | "animated-dashed";
export type DotVariant = "default" | "border" | "colored-border" | "none";
export type BackgroundVariant =
  | "none"
  | "dots"
  | "grid"
  | "cross-hatch"
  | "diagonal-lines"
  | "plus"
  | "tiny-checkers"
  | "wiggle-lines"
  | "bubbles";
export type LegendVariant =
  | "square"
  | "circle"
  | "circle-outline"
  | "rounded-square"
  | "rounded-square-outline"
  | "vertical-bar"
  | "horizontal-bar";
export type TooltipVariant = "default" | "frosted-glass";
export type TooltipRoundness = "sm" | "md" | "lg" | "xl";
/** "rise" grows shapes from the baseline; the rest wipe the chart in. */
export type AnimationType = "rise" | "left-to-right" | "right-to-left" | "center-out" | "edges-in" | "none";

export const FILL_VARIANTS: FillVariant[] = ["gradient", "gradient-reverse", "solid", "dotted", "lines", "hatched", "striped", "duotone", "duotone-reverse"];
export const BACKGROUND_VARIANTS: BackgroundVariant[] = ["none", "dots", "grid", "cross-hatch", "diagonal-lines", "plus", "tiny-checkers", "wiggle-lines", "bubbles"];
export const LEGEND_VARIANTS: LegendVariant[] = ["square", "circle", "circle-outline", "rounded-square", "rounded-square-outline", "vertical-bar", "horizontal-bar"];
export const ANIMATION_TYPES: AnimationType[] = ["rise", "left-to-right", "right-to-left", "center-out", "edges-in", "none"];

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * Gradient / pattern definitions for one series. Use `fillUrl(id, variant)`
 * as the shape's fill. `kind` tunes opacities for areas vs bars.
 */
export function SeriesFill({
  id,
  color,
  variant,
  kind,
  opacity = 1,
}: {
  id: string;
  color: string;
  variant: FillVariant;
  kind: "area" | "bar";
  opacity?: number;
}) {
  const sid = safeId(id);
  const hi = (kind === "area" ? 0.75 : 1) * opacity;
  const lo = (kind === "area" ? 0.06 : 0.45) * opacity;
  const tint = (kind === "area" ? 0.12 : 0.22) * opacity;
  switch (variant) {
    case "gradient":
    case "gradient-reverse": {
      const rev = variant === "gradient-reverse";
      return (
        <LinearGradient id={`f-${sid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={rev ? lo : hi} />
          <Stop offset="1" stopColor={color} stopOpacity={rev ? hi : lo} />
        </LinearGradient>
      );
    }
    case "duotone":
    case "duotone-reverse": {
      const rev = variant === "duotone-reverse";
      return (
        <LinearGradient id={`f-${sid}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={rev ? 0.55 * opacity : opacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={rev ? 0.55 * opacity : opacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={rev ? opacity : 0.55 * opacity} />
          <Stop offset="1" stopColor={color} stopOpacity={rev ? opacity : 0.55 * opacity} />
        </LinearGradient>
      );
    }
    case "dotted":
      return (
        <Pattern id={`f-${sid}`} patternUnits="userSpaceOnUse" width={6} height={6}>
          <Rect width={6} height={6} fill={color} opacity={tint} />
          <Circle cx={3} cy={3} r={1.1} fill={color} opacity={opacity} />
        </Pattern>
      );
    case "lines":
      return (
        <Pattern id={`f-${sid}`} patternUnits="userSpaceOnUse" width={6} height={5}>
          <Rect width={6} height={5} fill={color} opacity={tint} />
          <Rect y={0} width={6} height={1.2} fill={color} opacity={opacity} />
        </Pattern>
      );
    case "hatched":
      return (
        <Pattern id={`f-${sid}`} patternUnits="userSpaceOnUse" width={6} height={6}>
          <Rect width={6} height={6} fill={color} opacity={tint} />
          <Path d="M -1 1 L 1 -1 M 0 6 L 6 0 M 5 7 L 7 5" stroke={color} strokeWidth={1.2} opacity={opacity} />
        </Pattern>
      );
    case "striped":
      return (
        <Pattern id={`f-${sid}`} patternUnits="userSpaceOnUse" width={10} height={10}>
          <Rect width={10} height={10} fill={color} opacity={0.55 * opacity} />
          <Path d="M -2 2 L 2 -2 M 0 10 L 10 0 M 8 12 L 12 8" stroke={color} strokeWidth={3.5} opacity={opacity} />
        </Pattern>
      );
    default:
      return null;
  }
}

export const fillUrl = (id: string, variant: FillVariant, color: string, kind: "area" | "bar") =>
  variant === "solid" ? color : `url(#f-${safeId(id)})`;
export const solidOpacity = (variant: FillVariant, kind: "area" | "bar") =>
  variant === "solid" ? (kind === "area" ? 0.35 : 1) : 1;

/** Soft outer glow; apply with filter="url(#glow-<id>)" on a copy of the shape. */
export function GlowFilter({ id, blur = 4 }: { id: string; blur?: number }) {
  return (
    <Filter id={`glow-${safeId(id)}`} x="-50%" y="-50%" width="200%" height="200%">
      <FeGaussianBlur stdDeviation={blur} />
    </Filter>
  );
}
export const glowUrl = (id: string) => `url(#glow-${safeId(id)})`;

/** Texture painted behind the plot area. */
export function BackgroundPattern({
  variant,
  x,
  y,
  width,
  height,
  color,
}: {
  variant: BackgroundVariant;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}) {
  if (variant === "none") return null;
  const o = 0.5;
  const tile: Record<Exclude<BackgroundVariant, "none">, { size: number; body: React.ReactNode }> = {
    dots: { size: 12, body: <Circle cx={6} cy={6} r={1} fill={color} opacity={o} /> },
    grid: { size: 16, body: <Path d="M 16 0 L 0 0 L 0 16" stroke={color} strokeWidth={0.6} fill="none" opacity={o} /> },
    "cross-hatch": { size: 10, body: <Path d="M 0 0 L 10 10 M 10 0 L 0 10" stroke={color} strokeWidth={0.5} opacity={o * 0.8} /> },
    "diagonal-lines": { size: 8, body: <Path d="M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6" stroke={color} strokeWidth={0.6} opacity={o} /> },
    plus: { size: 16, body: <Path d="M 8 5 L 8 11 M 5 8 L 11 8" stroke={color} strokeWidth={0.8} opacity={o} /> },
    "tiny-checkers": {
      size: 8,
      body: (
        <G opacity={o * 0.5}>
          <Rect width={4} height={4} fill={color} />
          <Rect x={4} y={4} width={4} height={4} fill={color} />
        </G>
      ),
    },
    "wiggle-lines": { size: 20, body: <Path d="M 0 10 Q 5 5 10 10 T 20 10" stroke={color} strokeWidth={0.7} fill="none" opacity={o} /> },
    bubbles: {
      size: 24,
      body: (
        <G fill="none" stroke={color} strokeWidth={0.6} opacity={o}>
          <Circle cx={6} cy={6} r={3} />
          <Circle cx={18} cy={16} r={5} />
          <Circle cx={8} cy={20} r={1.5} />
        </G>
      ),
    },
  };
  const t = tile[variant];
  return (
    <>
      <Defs>
        <Pattern id={`bg-${variant}`} patternUnits="userSpaceOnUse" width={t.size} height={t.size}>
          {t.body}
        </Pattern>
      </Defs>
      <Rect x={x} y={y} width={Math.max(width, 0)} height={Math.max(height, 0)} fill={`url(#bg-${variant})`} />
    </>
  );
}

/** Point marker in three looks. */
export function ChartDot({
  cx,
  cy,
  r,
  color,
  variant = "default",
  surface,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  variant?: DotVariant;
  surface: string;
}) {
  if (variant === "none") return null;
  if (variant === "border") return <Circle cx={cx} cy={cy} r={r} fill={surface} stroke={color} strokeWidth={2} />;
  if (variant === "colored-border")
    return (
      <G>
        <Circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.25} />
        <Circle cx={cx} cy={cy} r={r} fill={color} stroke={surface} strokeWidth={1.5} />
      </G>
    );
  return <Circle cx={cx} cy={cy} r={r} fill={color} stroke={surface} strokeWidth={1.5} />;
}

/** Looping value (0→1) for marching dashes. Native-free: only for strokeDashoffset. */
export function useDashLoop(enabled: boolean, period = 900) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.timing(value, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, period]);
  return value;
}

/**
 * Wipe-in reveal: solid "curtains" in the card colour that shrink away on the
 * native thread. Costs nothing on the JS thread, works for any chart.
 */
export function Reveal({
  type,
  replayKey,
  color,
  duration = 900,
}: {
  type: AnimationType;
  replayKey: string;
  color: string;
  duration?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const curtain = type !== "rise" && type !== "none";
  useEffect(() => {
    if (!curtain) return;
    p.setValue(0);
    const anim = Animated.timing(p, {
      toValue: 1,
      duration,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [replayKey, type]);
  if (!curtain) return null;
  const shrink = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const piece = (origin: "left" | "right" | "center", style: object) => (
    <Animated.View
      key={origin + JSON.stringify(style)}
      pointerEvents="none"
      style={[
        { position: "absolute", top: -2, bottom: -2, backgroundColor: color, transformOrigin: origin },
        style,
        { transform: [{ scaleX: shrink }] },
      ]}
    />
  );
  return (
    <>
      {type === "left-to-right" && piece("right", { left: -2, right: -2 })}
      {type === "right-to-left" && piece("left", { left: -2, right: -2 })}
      {type === "edges-in" && piece("center", { left: -2, right: -2 })}
      {type === "center-out" && [piece("left", { left: -2, right: "50%" }), piece("right", { left: "50%", right: -2 })]}
    </>
  );
}

/** Pulsing placeholder shown while `isLoading`. */
export function ChartSkeleton({ height, kind = "area" }: { height: number; kind?: "area" | "bar" | "circle" }) {
  const theme = useChartTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bars = [0.45, 0.7, 0.55, 0.85, 0.6, 0.9, 0.5, 0.75, 0.65, 0.8];
  return (
    <View style={{ height, justifyContent: "flex-end" }}>
      <Animated.View style={{ opacity: pulse, flex: 1, justifyContent: "flex-end" }}>
        {kind === "circle" ? (
          <View style={{ alignSelf: "center", width: height * 0.8, height: height * 0.8, borderRadius: height, borderWidth: height * 0.12, borderColor: theme.muted, marginBottom: height * 0.1 }} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: "100%" }}>
            {bars.map((h, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: `${(kind === "area" ? 0.5 + 0.35 * Math.sin(i / 1.6) : h) * 100}%`,
                  backgroundColor: theme.muted,
                  borderRadius: kind === "bar" ? 6 : 3,
                }}
              />
            ))}
          </View>
        )}
      </Animated.View>
      <View style={[styles.badge, { backgroundColor: theme.popover, borderColor: theme.border }]}>
        <Text style={[styles.badgeText, { color: theme.mutedForeground }]}>Loading…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: "absolute", alignSelf: "center", top: "42%", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  badgeText: { fontSize: 11, fontWeight: "500" },
});
