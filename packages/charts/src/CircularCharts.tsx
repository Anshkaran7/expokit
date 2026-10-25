import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { G, Line, Path, Text as SvgText } from "react-native-svg";
import {
  AnimatedPath,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  responsive,
  useAnimatedValues,
} from "./internal";
import { ChartConfig, ChartLegend, ChartTooltip, TEXT_SCALE, TooltipIndicator, arc, sector, useMorphPaths } from "./kit";
import { seriesColor, useChartTheme } from "./theme";
import { ChartSkeleton, GlowFilter, LegendVariant, TooltipVariant, glowUrl } from "./styles";
import { Defs } from "react-native-svg";
import { EmptyState, type Datum } from "./CartesianCharts";
import { onRing } from "./ring-hit";

const AnimatedG = Animated.createAnimatedComponent(G);
const TAU = Math.PI * 2;
const num = (value: unknown) => {
  const n = Number(value);
  return isFinite(n) ? n : 0;
};

interface CircularBaseProps {
  /** Rows like [{ browser: "chrome", visitors: 275 }]. */
  data: Datum[];
  /** Optional labels/colours keyed by each row's name. */
  config?: ChartConfig;
  nameKey?: string;
  valueKey?: string;
  width?: number;
  /** Diameter of the chart. Defaults to min(width, 260). */
  size?: number;
  showLegend?: boolean;
  legendVariant?: LegendVariant;
  legendAlign?: "left" | "center" | "right";
  animate?: boolean;
  /** Pulsing skeleton instead of the chart. */
  isLoading?: boolean;
  /** Glow every segment (true) or only the named ones. */
  glow?: boolean | string[];
  tooltipVariant?: TooltipVariant;
  formatValue?: (value: number) => string;
  onSelect?: (index: number | null, datum: Datum | null) => void;
  /** Shown when `data` is empty or every value is 0. */
  emptyText?: string;
  /** Screen-reader summary. Defaults to one built from the slices ("Chrome 275, 42%…"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * VoiceOver / TalkBack: the chart is one adjustable element. Its label lists every slice; swiping
 * up / down selects the next one (same as a tap, so the tooltip and centre follow).
 */
function circleA11y(
  kind: string,
  slices: { label: string; value: number }[],
  active: number | null,
  formatValue: (v: number) => string,
  label: string | undefined,
  select: (index: number) => void
) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const part = (s: { label: string; value: number }) => `${s.label} ${formatValue(s.value)}, ${Math.round((s.value / total) * 100)}%`;
  return {
    accessible: true,
    accessibilityRole: "adjustable" as const,
    accessibilityLabel: label ?? `${kind}, ${slices.length} parts. ${slices.slice(0, 8).map(part).join(". ")}`,
    accessibilityHint: "Swipe up or down to select each part.",
    accessibilityValue: active !== null && slices[active] ? { text: part(slices[active]) } : undefined,
    accessibilityActions: [{ name: "increment" as const }, { name: "decrement" as const }],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (!slices.length) return;
      const delta = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const next = active === null ? (delta > 0 ? 0 : slices.length - 1) : clamp(active + delta, 0, slices.length - 1);
      if (next !== active) select(next);
    },
  };
}

function useSlices(data: Datum[], config: ChartConfig | undefined, nameKey: string, valueKey: string) {
  const theme = useChartTheme();
  return data.map((d, i) => {
    const name = String(d[nameKey] ?? i);
    return {
      key: name,
      label: config?.[name]?.label ?? name,
      color: config?.[name]?.color ?? d.fill ?? d.color ?? seriesColor(theme, i),
      value: Math.max(0, num(d[valueKey])),
    };
  });
}

const angleAt = (x: number, y: number, cx: number, cy: number) => {
  let a = Math.atan2(x - cx, cy - y); // 0 at 12 o'clock, clockwise
  if (a < 0) a += TAU;
  return a;
};

// ---------------------------------------------------------------------------
// Pie / Donut
// ---------------------------------------------------------------------------

export interface PieSeriesChartProps extends CircularBaseProps {
  /** 0 = pie, 0.6 = donut. Fraction of the radius. */
  innerRadius?: number;
  /** Gap between slices, in degrees. */
  padAngle?: number;
  /** Separator stroke between slices (in the card colour). */
  strokeWidth?: number;
  /** How far the selected slice pops out. */
  activeOffset?: number;
  /** Rounded slice corners. */
  cornerRadius?: number;
  /** Degrees clockwise from 12 o'clock. -90/90 gives a semicircle gauge-pie. */
  startAngle?: number;
  endAngle?: number;
  defaultActiveIndex?: number | null;
  /** Controlled selection; the chart still reports taps through onSelect. */
  activeIndex?: number | null;
  labels?: "none" | "inside" | "outside" | "percent";
  /** Center text for donuts. Defaults to the total. Pass null to hide. */
  centerValue?: string | null;
  centerLabel?: string;
  showTooltip?: boolean;
  tooltipIndicator?: TooltipIndicator;
  /** Fired when a drag on the ring starts; disable the parent ScrollView here. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

function PieInner({
  data = [],
  config,
  nameKey = "name",
  valueKey = "value",
  width,
  size,
  innerRadius = 0.6,
  padAngle = 0,
  strokeWidth = 2,
  activeOffset = 8,
  cornerRadius = 0,
  startAngle = 0,
  endAngle = 360,
  legendVariant,
  legendAlign,
  isLoading = false,
  glow = false,
  tooltipVariant,
  defaultActiveIndex = null,
  activeIndex,
  labels = "none",
  centerValue,
  centerLabel = "Total",
  showLegend = false,
  showTooltip = false,
  tooltipIndicator = "dot",
  animate = true,
  formatValue = compactNumber,
  onSelect,
  onScrubStart,
  onScrubEnd,
  emptyText = "No data",
  accessibilityLabel,
}: PieSeriesChartProps & { width: number }) {
  const theme = useChartTheme();
  const slices = useSlices(data, config, nameKey, valueKey);
  const [active, setActive] = useState<number | null>(activeIndex ?? defaultActiveIndex);
  useEffect(() => {
    if (activeIndex !== undefined) setActive(activeIndex);
  }, [activeIndex]);
  const diameter = Math.min(size ?? 260, width);
  const outside = labels === "outside";
  // Outside labels need horizontal room on both sides of the pie.
  const labelRoom = outside
    ? Math.max(0, ...slices.map((sl) => estimateTextWidth(`${sl.label} ${formatValue(sl.value)}`, 11))) + 24
    : 0;
  const outer = outside
    ? Math.max(Math.min(diameter / 2 - 30, width / 2 - labelRoom), 40)
    : diameter / 2 - (activeOffset + 2);
  const inner = outer * clamp(innerRadius, 0, 0.95);
  const startRad = (startAngle * Math.PI) / 180;
  const sweepRad = (clamp(endAngle - startAngle, 1, 360) * Math.PI) / 180;
  // Semicircle (e.g. -90 → 90): only the top half is drawn, so crop the box.
  const semi = endAngle - startAngle <= 180 && Math.abs(startAngle + 90) < 1;
  const chartH = semi ? outer + activeOffset + 16 : outside ? Math.min(diameter, outer * 2 + 64) : diameter;
  const cx = width / 2;
  const cy = semi ? outer + activeOffset + 4 : chartH / 2;
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const pad = (clamp(padAngle, 0, 20) * Math.PI) / 180;
  const cr = clamp(cornerRadius, 0, Math.max((outer - inner) / 2 - 1, 0));
  const glowOn = (key: string) => (Array.isArray(glow) ? glow.includes(key) : glow);

  let cursor = startRad;
  const geo = slices.map((s, i) => {
    const a0 = cursor;
    const a1 = cursor + (s.value / total) * sweepRad;
    cursor = a1;
    const p = s.value > 0 && slices.length > 1 ? Math.min(pad, (a1 - a0) / 2) : 0;
    const r = active === i ? outer + activeOffset : outer;
    const ri = active === i ? Math.max(inner - 2, 0) : inner;
    // Rounded corners: shrink the slice by cr and stroke it with a round join.
    const io = cr ? ri + cr : ri;
    const oo = cr ? r - cr : r;
    const ai = cr ? cr / Math.max((io + oo) / 2, 1) : 0;
    const s0 = a0 + p / 2 + ai;
    const s1 = Math.max(a1 - p / 2 - ai, s0);
    return {
      ...s,
      a0,
      a1,
      mid: (a0 + a1) / 2,
      d: sector(cx, cy, io, oo, s0, s1),
      collapsed: sector(cx, cy, cr ? inner + cr : inner, cr ? outer - cr : outer, startRad, startRad),
    };
  });
  // Quick pop when only the selection changed; slower fan-out for new data.
  const dataKey = slices.map((sl) => sl.value).join(",");
  const lastDataKey = useRef("");
  const selectionOnly = lastDataKey.current === dataKey;
  lastDataKey.current = dataKey;
  const { paths, alt, progress } = useMorphPaths(geo.map((g) => g.d), geo.map((g) => g.collapsed), {
    animate,
    duration: selectionOnly ? 300 : 650,
  });

  // Slice picked by touch-down in the current gesture; a tap on it keeps it.
  const pickedThisGesture = useRef<number | null>(null);
  const choose = (x: number, y: number, allowClear: boolean) => {
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < inner * 0.7 || dist > outer + activeOffset + 24) {
      if (allowClear) {
        setActive(null);
        onSelect?.(null, null);
      }
      return;
    }
    let a = angleAt(x, y, cx, cy);
    while (a < startRad) a += TAU;
    while (a >= startRad + TAU) a -= TAU;
    const i = geo.findIndex((g) => a >= g.a0 && a < g.a1);
    if (i === -1) return;
    if (allowClear && i === active && pickedThisGesture.current !== i) {
      setActive(null);
      onSelect?.(null, null);
    } else if (i !== active) {
      if (!allowClear) pickedThisGesture.current = i;
      setActive(i);
      onSelect?.(i, data[i]);
      theme.haptics?.();
    }
  };

  const activeSlice = active !== null ? geo[active] : null;
  const showCenter = (inner > 24 || semi) && centerValue !== null;
  if (isLoading) return <ChartSkeleton height={chartH} kind="circle" />;
  if (!slices.some((sl) => sl.value > 0)) return <EmptyState height={chartH} text={emptyText} />;
  const pt = (r: number, a: number) => ({ x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) });
  const a11y = circleA11y(inner > 0 ? "Donut chart" : "Pie chart", slices, active, formatValue, accessibilityLabel, (i) => {
    setActive(i);
    onSelect?.(i, data[i]);
    theme.haptics?.();
  });

  return (
    <View>
      <View style={{ width, height: chartH }} {...a11y}>
        <Svg width={width} height={chartH}>
          <Defs>{geo.map((g) => (glowOn(g.key) ? <GlowFilter key={g.key} id={`pie-${g.key}`} blur={6} /> : null))}</Defs>
          {geo.map((g, i) =>
            glowOn(g.key) ? (
              <AnimatedPath key={`gl-${g.key}`} d={alt[i] as any} fill={g.color} stroke={g.color} strokeWidth={cr * 2} strokeLinejoin="round" opacity={0.6} filter={glowUrl(`pie-${g.key}`)} />
            ) : null
          )}
          {geo.map((g, i) => (
            <AnimatedPath
              key={g.key}
              d={paths[i] as any}
              fill={g.color}
              stroke={cr ? g.color : theme.card}
              strokeWidth={cr ? cr * 2 : strokeWidth}
              strokeLinejoin="round"
              opacity={active !== null && active !== i ? 0.55 : 1}
            />
          ))}
          {labels !== "none" ? (
            <AnimatedG opacity={progress}>
              {geo.map((g) => {
                if (g.value <= 0 || g.a1 - g.a0 < 0.18) return null;
                const pct = `${Math.round((g.value / total) * 100)}%`;
                if (outside) {
                  const a = pt(outer + 4, g.mid);
                  const b = pt(outer + 14, g.mid);
                  const right = Math.sin(g.mid) >= 0;
                  return (
                    <G key={g.key}>
                      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={g.color} strokeWidth={1.5} />
                      <SvgText x={b.x + (right ? 4 : -4)} y={b.y + 4} fontSize={11} fontWeight="500" fill={theme.foreground} textAnchor={right ? "start" : "end"} fontFamily={theme.fontFamily}>
                        {`${g.label} ${formatValue(g.value)}`}
                      </SvgText>
                    </G>
                  );
                }
                const c = pt(inner > 0 ? (inner + outer) / 2 : outer * 0.62, g.mid);
                return (
                  <SvgText key={g.key} x={c.x} y={c.y + 4} fontSize={11} fontWeight="500" fill="#FFFFFF" textAnchor="middle" fontFamily={theme.fontFamily}>
                    {labels === "percent" ? pct : formatValue(g.value)}
                  </SvgText>
                );
              })}
            </AnimatedG>
          ) : null}
        </Svg>
        {showCenter ? (
          <View
            pointerEvents="none"
            style={semi ? [styles.radialCenter, { top: cy - 54, height: 56 }] : [StyleSheet.absoluteFill, styles.center]}
          >
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.centerValue, { color: theme.foreground, fontFamily: theme.fontFamily, fontSize: clamp(inner / 2.6, 14, 30) }]} numberOfLines={1} adjustsFontSizeToFit>
              {activeSlice ? formatValue(activeSlice.value) : centerValue ?? formatValue(total)}
            </Text>
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.centerLabel, { color: theme.mutedForeground, fontFamily: theme.fontFamily }]} numberOfLines={1}>
              {activeSlice ? activeSlice.label : centerLabel}
            </Text>
          </View>
        ) : null}
        <TouchLayer
          // Grab touches on the ring in any direction, so dragging round it doesn't scroll the
          // page; a swipe that starts in the hole or on the card still scrolls.
          lockOnGrant={(x, y) =>
            onRing(x, y, { cx, cy, inner, outer, slack: activeOffset + 24, start: startRad, sweep: sweepRad })
          }
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          onMove={(x, y) => choose(x, y, false)}
          onTap={(x, y) => choose(x, y, true)}
          onRelease={() => {
            pickedThisGesture.current = null;
          }}
          onHoverEnd={() => {
            pickedThisGesture.current = null;
            if (activeIndex === undefined) {
              setActive(defaultActiveIndex);
              onSelect?.(defaultActiveIndex, defaultActiveIndex === null ? null : data[defaultActiveIndex] ?? null);
            }
          }}
        />
        {showTooltip ? (
          <ChartTooltip
            visible={activeSlice !== null}
            x={activeSlice ? pt(outer, activeSlice.mid).x : 0}
            y={activeSlice ? pt(outer, activeSlice.mid).y : 0}
            boundsWidth={width}
            boundsHeight={chartH}
            indicator={tooltipIndicator}
            variant={tooltipVariant}
            items={activeSlice ? [{ key: activeSlice.key, label: activeSlice.label, color: activeSlice.color, value: formatValue(activeSlice.value) }] : []}
          />
        ) : null}
      </View>
      {showLegend ? <ChartLegend items={slices} variant={legendVariant} align={legendAlign} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Radial bars (incl. semicircle + stacked)
// ---------------------------------------------------------------------------

export interface RadialSeriesChartProps extends CircularBaseProps {
  /** Degrees clockwise from 12 o'clock. */
  startAngle?: number;
  /** Degrees of the full track. 360 = ring, 180 = semicircle. */
  sweep?: number;
  /** Fraction of the radius left empty in the middle. */
  innerRadius?: number;
  gap?: number;
  maxValue?: number;
  /** Segments laid end-to-end on one track (e.g. desktop + mobile). */
  stacked?: boolean;
  rounded?: boolean;
  showBackground?: boolean;
  showLabels?: boolean;
  centerValue?: string | null;
  centerLabel?: string;
}

function RadialInner({
  data = [],
  config,
  nameKey = "name",
  valueKey = "value",
  width,
  size,
  startAngle = 0,
  sweep = 360,
  innerRadius = 0.35,
  gap = 4,
  maxValue,
  stacked = false,
  rounded = true,
  showBackground = true,
  showLabels = false,
  centerValue,
  centerLabel,
  showLegend = false,
  animate = true,
  formatValue = compactNumber,
  onSelect,
  emptyText = "No data",
  accessibilityLabel,
}: RadialSeriesChartProps & { width: number }) {
  const theme = useChartTheme();
  const slices = useSlices(data, config, nameKey, valueKey);
  const [active, setActive] = useState<number | null>(null);
  const diameter = Math.min(size ?? 250, width);
  const span = (clamp(sweep, 10, 360) * Math.PI) / 180;
  const a0 = (startAngle * Math.PI) / 180;
  const semi = sweep <= 180;
  const outer = diameter / 2 - 4;
  const height = semi ? outer + 28 : diameter;
  const cx = width / 2;
  const cy = semi ? outer + 4 : diameter / 2;
  const total = slices.reduce((s, x) => s + x.value, 0);
  const peak = maxValue ?? (stacked ? total : Math.max(1, ...slices.map((s) => s.value)));
  const n = Math.max(slices.length, 1);

  const rings = stacked
    ? (() => {
        const band = (outer - outer * innerRadius) * 0.55;
        const r = outer - band / 2;
        const capGap = rounded ? band / r : 0.02;
        let cum = 0;
        return slices.map((s) => {
          const from = a0 + (cum / (peak || 1)) * span;
          cum += s.value;
          const to = a0 + (cum / (peak || 1)) * span;
          const start = from + (from > a0 ? capGap / 2 : 0);
          const end = Math.max(start + 0.001, to - (to < a0 + span - 0.001 ? capGap / 2 : 0));
          return { ...s, r, band, start, end, len: r * (end - start), frac: 1 };
        });
      })()
    : (() => {
        const band = (outer - outer * innerRadius - gap * (n - 1)) / n;
        return slices.map((s, i) => {
          const r = outer - i * (band + gap) - band / 2;
          return { ...s, r, band, start: a0, end: a0 + span, len: r * span, frac: clamp(s.value / (peak || 1), 0, 1) };
        });
      })();

  const fractions = useAnimatedValues(
    rings.map((r) => r.frac),
    { animate, duration: 1000, delay: (i) => i * (stacked ? 260 : 110) }
  );

  const choose = (x: number, y: number, hover = false) => {
    const dist = Math.hypot(x - cx, y - cy);
    let i = -1;
    if (stacked) {
      let a = angleAt(x, y, cx, cy) - a0;
      while (a < 0) a += TAU;
      a += a0;
      i = Math.abs(dist - rings[0]?.r) <= (rings[0]?.band ?? 0) / 2 + 10 ? rings.findIndex((r) => a >= r.start - 0.05 && a <= r.end + 0.05) : -1;
    } else {
      i = rings.findIndex((r) => Math.abs(dist - r.r) <= r.band / 2 + gap / 2);
    }
    const next = i === -1 || (!hover && i === active) ? null : i;
    if (next !== null && next !== active && !hover) theme.haptics?.();
    setActive(next);
    onSelect?.(next, next === null ? null : data[next]);
  };

  const shown = active !== null ? rings[active] : null;
  const center =
    centerValue === null
      ? null
      : shown
      ? { value: formatValue(shown.value), label: shown.label }
      : { value: centerValue ?? formatValue(stacked ? total : rings[0]?.value ?? 0), label: centerLabel ?? (stacked ? "Total" : rings[0]?.label ?? "") };

  if (!slices.length) return <EmptyState height={height} text={emptyText} />;
  const a11y = circleA11y("Radial chart", slices, active, formatValue, accessibilityLabel, (i) => {
    setActive(i);
    onSelect?.(i, data[i]);
    theme.haptics?.();
  });

  return (
    <View>
      <View style={{ width, height }} {...a11y}>
        <Svg width={width} height={height}>
          {rings.map((r, i) => {
            const d = arc(cx, cy, r.r, r.start, r.end);
            const dim = active !== null && active !== i ? 0.4 : 1;
            return (
              <G key={r.key} opacity={dim}>
                {showBackground && (!stacked || i === 0) ? (
                  <Path d={arc(cx, cy, r.r, a0, a0 + span)} stroke={theme.muted} strokeWidth={r.band} strokeLinecap={rounded ? "round" : "butt"} fill="none" />
                ) : null}
                <AnimatedPath
                  d={d}
                  stroke={r.color}
                  strokeWidth={r.band}
                  strokeLinecap={rounded ? "round" : "butt"}
                  fill="none"
                  strokeDasharray={[r.len, r.len + 1]}
                  strokeDashoffset={fractions[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [r.len + 0.5, 0],
                  })}
                />
                {showLabels && !stacked ? (
                  <SvgText
                    x={cx + r.r * Math.sin(a0) - 8 * Math.cos(a0)}
                    y={cy - r.r * Math.cos(a0) + 4 - 8 * Math.sin(a0)}
                    fontSize={11}
                    fontWeight="500"
                    fill={theme.foreground}
                    textAnchor="end"
                    fontFamily={theme.fontFamily}
                  >
                    {r.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
        {center ? (
          <View pointerEvents="none" style={[styles.radialCenter, { top: semi ? cy - 52 : 0, bottom: semi ? undefined : 0, height: semi ? 56 : undefined }]}>
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.centerValue, { color: theme.foreground, fontFamily: theme.fontFamily, fontSize: semi ? 26 : clamp(outer * innerRadius * 0.55, 16, 30) }]} numberOfLines={1} adjustsFontSizeToFit>
              {center.value}
            </Text>
            <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.centerLabel, { color: theme.mutedForeground, fontFamily: theme.fontFamily }]} numberOfLines={1}>
              {center.label}
            </Text>
          </View>
        ) : null}
        <TouchLayer onTap={choose} onHover={(x, y) => choose(x, y, true)} onHoverEnd={() => setActive(null)} />
      </View>
      {showLegend ? <ChartLegend items={slices} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  radialCenter: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  centerValue: { fontWeight: "500", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  centerLabel: { fontSize: 12, marginTop: 2 },
});

export const PieSeriesChart = responsive<PieSeriesChartProps>(PieInner, (p) => Math.min(p.size ?? 260, 260) + (p.showLegend ? 32 : 0));
export const RadialSeriesChart = responsive<RadialSeriesChartProps>(RadialInner, (p) => ((p.sweep ?? 360) <= 180 ? 160 : Math.min(p.size ?? 250, 250)));
