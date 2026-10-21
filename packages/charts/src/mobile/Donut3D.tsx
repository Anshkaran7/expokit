// Extruded 3D donut (tilted ring with depth and shaded walls). Tap a slice to lift it out.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { TouchLayer, clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { EASE, Empty, adjustable, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface Donut3DDatum {
  label: string;
  value: number;
  color?: string;
}

export interface Donut3DProps {
  data: Donut3DDatum[];
  /** Width of the ring's ellipse. Defaults to the parent width, up to 300. */
  size?: number;
  /** Hole size as a fraction of the radius (0 = pie). */
  innerRadius?: number;
  /** Vertical squash of the ellipse (1 = flat circle, 0.5 = strong tilt). */
  tilt?: number;
  /** Wall height in points. */
  depth?: number;
  /** How far a selected slice lifts out. */
  pop?: number;
  showLegend?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: Donut3DDatum | null) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TAU = Math.PI * 2;
const f = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

export function Donut3D({
  data = [],
  size,
  innerRadius = 0.55,
  tilt = 0.55,
  depth = 22,
  pop = 10,
  showLegend = true,
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  style,
}: Donut3DProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const n = data.length;
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const values = data.map((d) => Math.max(0, num(d.value)));
  const total = values.reduce((s, v) => s + v, 0);
  const W = Math.min(size ?? 300, width || 0);
  const rx = W / 2 - pop - 2;
  const k = clamp(tilt, 0.3, 1);
  const ry = rx * k;
  const irx = rx * clamp(innerRadius, 0, 0.9);
  const iry = irx * k;
  const cx = W / 2;
  const cy = ry + pop + 2;
  const H = cy + ry + depth + pop + 4;
  const colorOf = (i: number) => data[i].color ?? theme.palette[i % theme.palette.length];

  // Entrance: the whole donut drops in and fades up (native thread).
  const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    const a = Animated.timing(enter, { toValue: 1, duration: 800, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [animate, total]);

  const choose = (i: number | null) => {
    const next = i === active ? null : i;
    if (selectedIndex === undefined) setOwn(next);
    onSelect?.(next, next === null ? null : data[next]);
    if (next !== null) theme.haptics?.();
  };
  if (!n || !total) return <Empty height={200} text={emptyText} />;

  // Angles: 0 = 3 o'clock, clockwise (y grows downward). Start at 12 o'clock.
  const start = -Math.PI / 2;
  let acc = start;
  const slices = values.map((v, i) => {
    const a0 = acc;
    const a1 = acc + (v / total) * TAU;
    acc = a1;
    const mid = (a0 + a1) / 2;
    const lift = i === active ? pop : 0;
    return { i, a0, a1, mid, dx: Math.cos(mid) * lift, dy: Math.sin(mid) * lift * k };
  });
  const pt = (a: number, ex: number, ey: number, dy = 0) => `${f(cx + ex * Math.cos(a))} ${f(cy + ey * Math.sin(a) + dy)}`;
  const top = (a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const inner = irx > 0.5;
    return [
      `M ${pt(a0, rx, ry)}`,
      `A ${f(rx)} ${f(ry)} 0 ${large} 1 ${pt(a1, rx, ry)}`,
      inner ? `L ${pt(a1, irx, iry)}` : `L ${f(cx)} ${f(cy)}`,
      inner ? `A ${f(irx)} ${f(iry)} 0 ${large} 0 ${pt(a0, irx, iry)}` : "",
      "Z",
    ].join(" ");
  };
  // Side wall between angles on an ellipse, extruded down by `depth`.
  const wall = (a0: number, a1: number, ex: number, ey: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${pt(a0, ex, ey)} A ${f(ex)} ${f(ey)} 0 ${large} 1 ${pt(a1, ex, ey)} L ${pt(a1, ex, ey, depth)} A ${f(ex)} ${f(ey)} 0 ${large} 0 ${pt(a0, ex, ey, depth)} Z`;
  };
  // Radial face where a slice is cut (inner rim → outer rim, extruded down).
  const cut = (a: number) =>
    irx > 0.5
      ? `M ${pt(a, irx, iry)} L ${pt(a, rx, ry)} L ${pt(a, rx, ry, depth)} L ${pt(a, irx, iry, depth)} Z`
      : `M ${f(cx)} ${f(cy)} L ${pt(a, rx, ry)} L ${pt(a, rx, ry, depth)} L ${f(cx)} ${f(cy + depth)} Z`;
  // Clip an angle range to the part of the ellipse facing the viewer (front: sin > 0 → 0..π; back: π..2π).
  const clipTo = (a0: number, a1: number, lo: number, hi: number) => {
    const out: [number, number][] = [];
    for (let s = -2; s <= 2; s++) {
      const b0 = Math.max(a0, lo + s * TAU);
      const b1 = Math.min(a1, hi + s * TAU);
      if (b1 > b0 + 1e-4) out.push([b0, b1]);
    }
    return out;
  };

  const font = { fontFamily: theme.fontFamily };
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const describe = (i: number) => `${data[i].label} ${formatValue(values[i])}, ${pct(values[i])}`;
  const a11y = adjustable(accessibilityLabel ?? `3D donut. ${data.map((_, i) => describe(i)).join(". ")}`, active === null ? undefined : describe(active), n, active, (i) => choose(i));

  // Paint order: inner back walls, outer front walls, then the tops (selected slice last).
  const order = [...slices].sort((a, b) => (a.i === active ? 1 : b.i === active ? -1 : Math.sin(a.mid) - Math.sin(b.mid)));
  const shade = (c: string, amt: number) => mixColor(c, theme.dark ? "#000000" : "#1F2937", amt);

  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ alignItems: "center" }} {...a11y}>
        {W > 0 ? (
          <Animated.View style={{ width: W, height: H, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }}>
            <Svg width={W} height={H}>
              {order.map((s) => {
                const c = colorOf(s.i);
                return (
                  <G key={s.i} x={s.dx} y={s.dy} opacity={active === null || active === s.i ? 1 : 0.7}>
                    {irx > 0.5 ? clipTo(s.a0, s.a1, Math.PI, TAU).map(([a, b], j) => <Path key={`in${j}`} d={wall(a, b, irx, iry)} fill={shade(c, 0.45)} />) : null}
                    {clipTo(s.a0, s.a1, 0, Math.PI).map(([a, b], j) => (
                      <Path key={`out${j}`} d={wall(a, b, rx, ry)} fill={shade(c, 0.28)} />
                    ))}
                    {/* A lifted slice shows its two cut faces. */}
                    {s.i === active ? [s.a0, s.a1].map((a, j) => <Path key={`cut${j}`} d={cut(a)} fill={shade(c, 0.38)} />) : null}
                    <Path d={top(s.a0, s.a1)} fill={c} stroke={mixColor(c, "#FFFFFF", 0.25)} strokeWidth={0.75} />
                  </G>
                );
              })}
            </Svg>
            {irx > 20 ? (
              <View pointerEvents="none" style={[styles.center, { left: cx - irx, top: cy - iry, width: irx * 2, height: iry * 2 }]}>
                <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit style={[styles.big, font, { color: theme.foreground, fontSize: clamp(iry * 0.55, 13, 26) }]}>
                  {active === null ? formatValue(total) : pct(values[active])}
                </Text>
                {iry > 26 ? (
                  <Text maxFontSizeMultiplier={TEXT_SCALE} numberOfLines={1} style={[styles.small, font, { color: theme.mutedForeground }]}>
                    {active === null ? "Total" : data[active].label}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <TouchLayer
              onTap={(x, y) => {
                const ux = (x - cx) / rx;
                const uy = (y - cy) / ry;
                const d = Math.hypot(ux, uy);
                if (d > 1.15 || d < (irx / rx) * 0.8) return choose(null);
                let a = Math.atan2(uy, ux);
                while (a < start) a += TAU;
                const hit = slices.find((s) => a >= s.a0 && a < s.a1);
                choose(hit ? hit.i : null);
              }}
            />
          </Animated.View>
        ) : (
          <View style={{ height: Math.min(size ?? 300, 300) * 0.7 }} />
        )}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          {data.map((d, i) => (
            <Text
              key={`${d.label}-${i}`}
              onPress={() => choose(i)}
              suppressHighlighting
              maxFontSizeMultiplier={TEXT_SCALE}
              style={[styles.item, font, { color: theme.mutedForeground, opacity: active === null || active === i ? 1 : 0.45 }]}
            >
              <Text style={{ color: colorOf(i) }}>● </Text>
              {d.label}
              <Text style={{ color: theme.foreground, fontWeight: "600" }}>{`  ${pct(values[i])}`}</Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  big: { fontWeight: "700", letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  small: { fontSize: 11 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 6, marginTop: 12 },
  item: { fontSize: 12 },
});
