import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { clamp, monotoneTangents } from "./internal";
import type { LegendVariant, TooltipRoundness, TooltipVariant } from "./styles";
import { seriesColor, useChartTheme } from "./theme";

// ---------------------------------------------------------------------------
// Config (shadcn-style): which keys of each datum to plot, their labels/colours
// ---------------------------------------------------------------------------

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
    /** Per-series overrides for the chart-level look. */
    variant?: import("./styles").FillVariant;
    strokeVariant?: import("./styles").StrokeVariant;
    glow?: boolean;
  }
>;
/** Text grows with Dynamic Type / font size, capped so tooltips and legends keep their layout. */
export const TEXT_SCALE = 1.4;

export type CurveType = "monotone" | "natural" | "linear" | "step";
export type TooltipIndicator = "dot" | "line" | "dashed";

export function useSeries(config: ChartConfig, keys?: string[]) {
  const theme = useChartTheme();
  const list = keys ?? Object.keys(config);
  return list.map((key, index) => ({
    key,
    label: config[key]?.label ?? key,
    color: config[key]?.color ?? seriesColor(theme, index),
  }));
}

// ---------------------------------------------------------------------------
// Path builders. Every builder emits the same command structure for the same
// number of points, which is what lets paths morph smoothly between datasets.
// ---------------------------------------------------------------------------

// A NaN / Infinity in a path makes iOS CoreGraphics drop the shape (and log); pin it to 0 instead.
const f = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);
type Point = { x: number; y: number };

export function buildPath(points: Point[], curve: CurveType = "monotone"): string {
  if (!points.length) return "";
  const p = points;
  const tangents = curve === "monotone" ? monotoneTangents(p) : null;
  let d = `M ${f(p[0].x)} ${f(p[0].y)}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    if (curve === "linear") {
      d += ` L ${f(b.x)} ${f(b.y)}`;
    } else if (curve === "step") {
      const mid = (a.x + b.x) / 2;
      d += ` L ${f(mid)} ${f(a.y)} L ${f(mid)} ${f(b.y)} L ${f(b.x)} ${f(b.y)}`;
    } else if (curve === "natural") {
      // Catmull-Rom → cubic bezier: rounder, may overshoot slightly.
      const prev = p[i - 2] ?? a;
      const next = p[i + 1] ?? b;
      const c1x = a.x + (b.x - prev.x) / 6;
      const c1y = a.y + (b.y - prev.y) / 6;
      const c2x = b.x - (next.x - a.x) / 6;
      const c2y = b.y - (next.y - a.y) / 6;
      d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(b.x)} ${f(b.y)}`;
    } else {
      const t = tangents!;
      const dx = (b.x - a.x) / 3;
      d += ` C ${f(a.x + dx)} ${f(a.y + dx * t[i - 1])} ${f(b.x - dx)} ${f(b.y - dx * t[i])} ${f(b.x)} ${f(b.y)}`;
    }
  }
  return d;
}

/** Closed area between a top line and a bottom line (both left→right). */
export function buildArea(top: Point[], bottom: Point[], curve: CurveType = "monotone") {
  if (!top.length) return "";
  const back = buildPath(bottom.slice().reverse(), curve).replace(/^M/, "L");
  return `${buildPath(top, curve)} ${back} Z`;
}

export interface Corners {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
}

/** Rectangle with per-corner radius; same structure for any size (even 0). */
export function roundedRect(x: number, y: number, w: number, h: number, r: Corners = {}) {
  const width = Math.max(w, 0);
  const height = Math.max(h, 0);
  const max = Math.min(width, height) / 2;
  const tl = clamp(r.tl ?? 0, 0, max);
  const tr = clamp(r.tr ?? 0, 0, max);
  const br = clamp(r.br ?? 0, 0, max);
  const bl = clamp(r.bl ?? 0, 0, max);
  return [
    `M ${f(x + tl)} ${f(y)}`,
    `L ${f(x + width - tr)} ${f(y)}`,
    `A ${f(tr)} ${f(tr)} 0 0 1 ${f(x + width)} ${f(y + tr)}`,
    `L ${f(x + width)} ${f(y + height - br)}`,
    `A ${f(br)} ${f(br)} 0 0 1 ${f(x + width - br)} ${f(y + height)}`,
    `L ${f(x + bl)} ${f(y + height)}`,
    `A ${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + height - bl)}`,
    `L ${f(x)} ${f(y + tl)}`,
    `A ${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}`,
    "Z",
  ].join(" ");
}

/**
 * Annular sector (donut slice). Angles in radians, 0 = 12 o'clock, clockwise.
 * Each arc is split in two halves so the large-arc flag is always 0, which
 * keeps the path morphable between any two angles.
 */
export function sector(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number
) {
  const sweep = Math.min(Math.max(end - start, 0), Math.PI * 2 - 0.0001);
  const e = start + sweep;
  const m = start + sweep / 2;
  const pt = (r: number, a: number) => `${f(cx + r * Math.sin(a))} ${f(cy - r * Math.cos(a))}`;
  const ir = Math.max(inner, 0.01);
  return [
    `M ${pt(outer, start)}`,
    `A ${f(outer)} ${f(outer)} 0 0 1 ${pt(outer, m)}`,
    `A ${f(outer)} ${f(outer)} 0 0 1 ${pt(outer, e)}`,
    `L ${pt(ir, e)}`,
    `A ${f(ir)} ${f(ir)} 0 0 0 ${pt(ir, m)}`,
    `A ${f(ir)} ${f(ir)} 0 0 0 ${pt(ir, start)}`,
    "Z",
  ].join(" ");
}

/** Open arc for stroked radial bars. Angles in radians, 0 = 12 o'clock. */
export function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const sweep = Math.min(Math.max(end - start, 0.0001), Math.PI * 2 - 0.0001);
  const e = start + sweep;
  const pt = (a: number) => `${f(cx + r * Math.sin(a))} ${f(cy - r * Math.cos(a))}`;
  return `M ${pt(start)} A ${f(r)} ${f(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${pt(e)}`;
}

// ---------------------------------------------------------------------------
// Morphing: animate every number inside an SVG path string from the previous
// path to the next one (Animated supports string interpolation of numbers).
// ---------------------------------------------------------------------------

const NUMBERS = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const skeleton = (d: string) => d.replace(NUMBERS, "#");
const compatible = (a: string | undefined, b: string) =>
  a !== undefined && a !== b && skeleton(a) === skeleton(b) && /\d/.test(b);

type Built = { start: string; target: string; node: string | Animated.AnimatedInterpolation<string> }[];

export function useMorphPaths(
  targets: string[],
  initial: string[],
  { animate = true, duration = 700 }: { animate?: boolean; duration?: number } = {}
) {
  const progressRef = useRef<Animated.Value | null>(null);
  if (!progressRef.current) progressRef.current = new Animated.Value(animate ? 0 : 1);
  const key = targets.join("|");
  const state = useRef<{ key: string; from: string[]; to: string[] } | null>(null);

  if (!state.current) {
    state.current = { key, from: animate ? initial : targets, to: targets };
  } else if (state.current.key !== key) {
    const previous = state.current.to;
    state.current = {
      key,
      to: targets,
      from: targets.map((target, i) =>
        // Unchanged shapes stay put; only changed ones animate. A shape grows
        // from its collapsed state only if it is new or changed structure.
        previous[i] === target
          ? target
          : compatible(previous[i], target)
          ? previous[i]
          : compatible(initial[i], target)
          ? initial[i]
          : target
      ),
    };
    // A fresh value per morph: rewinding the shared one would snap the still-mounted
    // previous nodes back to their old start shape for a frame or two before the new ones land.
    if (animate) progressRef.current = new Animated.Value(0);
  }
  const progress = progressRef.current;

  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [key, animate, progress]);

  // Each animated node may drive only one view on native, so glow copies get their own set.
  // A shape that keeps its path keeps its node too: swapping nodes re-attaches the prop,
  // which on Android can drop a frame or two of the shape.
  const made = useRef<{ paths: Built; alt: Built }>({ paths: [], alt: [] });
  const build = (previous: Built): Built => {
    const { from, to } = state.current!;
    // Always hand out an animated node, even for shapes that do not move:
    // swapping an animated prop for a plain string makes the new architecture
    // restore the stale animated value (the slice would vanish or jump).
    return to.map((target, i) => {
      const start = compatible(from[i], target) ? from[i] : target;
      // Static shapes keep their node (re-attaching a prop can drop a frame on Android).
      const kept = previous[i];
      if (kept && start === target && kept.start === start && kept.target === target) return kept;
      return {
        start,
        target,
        node: !/\d/.test(target) ? target : progress.interpolate({ inputRange: [0, 1], outputRange: [start, target] }),
      };
    });
  };
  const nodes = useMemo(() => {
    made.current = { paths: build(made.current.paths), alt: build(made.current.alt) };
    return { paths: made.current.paths.map((b) => b.node), alt: made.current.alt.map((b) => b.node) };
  }, [key]);
  const { paths, alt } = nodes;

  return { paths, alt, progress };
}

// ---------------------------------------------------------------------------
// Tooltip (shadcn ChartTooltipContent look), positioned over the chart and
// gliding between positions on the native thread.
// ---------------------------------------------------------------------------

export interface TooltipItem {
  key: string;
  label: string;
  value: string;
  color: string;
}

export interface ChartTooltipProps {
  visible: boolean;
  /** Anchor in chart coordinates. The tooltip sits above it, clamped inside. */
  x: number;
  y: number;
  boundsWidth: number;
  boundsHeight: number;
  title?: string | undefined;
  items: TooltipItem[];
  indicator?: TooltipIndicator | undefined;
  footer?: { label: string; value: string } | undefined;
  variant?: TooltipVariant | undefined;
  roundness?: TooltipRoundness | undefined;
  hideIndicator?: boolean | undefined;
}

const ROUND = { sm: 4, md: 6, lg: 8, xl: 14 };

export function ChartTooltip({
  visible,
  x,
  y,
  boundsWidth,
  boundsHeight,
  title,
  items,
  indicator = "dot",
  footer,
  variant = "default",
  roundness = "lg",
  hideIndicator = false,
}: ChartTooltipProps) {
  const theme = useChartTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);
  const last = useRef({ title, items, footer });
  if (visible) last.current = { title, items, footer };
  const content = last.current;

  const left = clamp(x - size.w / 2, 0, Math.max(0, boundsWidth - size.w));
  let top = y - size.h - 18;
  if (top < -6) top = y + 22;
  top = clamp(top, -6, Math.max(-6, boundsHeight - size.h));

  useEffect(() => {
    if (!size.w) return;
    if (visible && !wasVisible.current) {
      tx.setValue(left);
      ty.setValue(top);
    } else if (visible) {
      Animated.parallel([
        Animated.spring(tx, { toValue: left, useNativeDriver: true, speed: 28, bounciness: 0 }),
        Animated.spring(ty, { toValue: top, useNativeDriver: true, speed: 28, bounciness: 0 }),
      ]).start();
    }
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 180,
      useNativeDriver: true,
    }).start();
    wasVisible.current = visible;
  }, [visible, left, top, size.w]);

  if (!content.items.length && !content.title) return null;

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (Math.abs(width - size.w) > 0.5 || Math.abs(height - size.h) > 0.5) {
          setSize({ w: width, h: height });
        }
      }}
      style={[
        styles.tooltip,
        {
          borderRadius: ROUND[roundness],
          backgroundColor:
            variant === "frosted-glass" ? (theme.dark ? "rgba(24,24,27,0.72)" : "rgba(255,255,255,0.72)") : theme.popover,
          borderColor: variant === "frosted-glass" ? (theme.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)") : theme.border,
          shadowOpacity: theme.dark ? 0.5 : 0.12,
          opacity: size.w ? opacity : 0,
          transform: [{ translateX: tx }, { translateY: ty }],
        },
      ]}
    >
      {content.title ? (
        <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tooltipTitle, { color: theme.popoverForeground, fontFamily: theme.fontFamily }]}>
          {content.title}
        </Text>
      ) : null}
      {content.items.map((item) => (
        <View key={item.key} style={styles.tooltipRow}>
          {hideIndicator ? null : <Indicator color={item.color} type={indicator} />}
          <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tooltipLabel, { color: theme.mutedForeground, fontFamily: theme.fontFamily }]} numberOfLines={1}>
            {item.label}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tooltipValue, { color: theme.popoverForeground, fontFamily: theme.fontFamily }]}>
            {item.value}
          </Text>
        </View>
      ))}
      {content.footer ? (
        <View style={[styles.tooltipFooter, { borderTopColor: theme.border }]}>
          <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tooltipLabel, { color: theme.popoverForeground, fontWeight: "500" }]}>
            {content.footer.label}
          </Text>
          <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.tooltipValue, { color: theme.popoverForeground }]}>{content.footer.value}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function Indicator({ color, type }: { color: string; type: TooltipIndicator }) {
  if (type === "line") return <View style={[styles.indicatorLine, { backgroundColor: color }]} />;
  if (type === "dashed") return <View style={[styles.indicatorDashed, { borderColor: color }]} />;
  return <View style={[styles.indicatorDot, { backgroundColor: color }]} />;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export interface ChartLegendProps {
  items: { key: string; label: string; color: string }[];
  hidden?: Record<string, boolean>;
  onToggle?: (key: string) => void;
  align?: "left" | "center" | "right";
  variant?: LegendVariant;
  /** Highlighted key in "select" mode; others are dimmed. */
  selected?: string | null;
  position?: "top" | "bottom";
}

function LegendMarker({ variant, color }: { variant: LegendVariant; color: string }) {
  switch (variant) {
    case "circle":
      return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
    case "circle-outline":
      return <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color }} />;
    case "rounded-square":
      return <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />;
    case "rounded-square-outline":
      return <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 2, borderColor: color }} />;
    case "vertical-bar":
      return <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: color }} />;
    case "horizontal-bar":
      return <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />;
    default:
      return <View style={{ width: 9, height: 9, borderRadius: 1, backgroundColor: color }} />;
  }
}

export function ChartLegend({
  items,
  hidden = {},
  onToggle,
  align = "center",
  variant = "rounded-square",
  selected = null,
  position = "bottom",
}: ChartLegendProps) {
  const theme = useChartTheme();
  return (
    <View
      style={[
        styles.legend,
        position === "top" ? { marginTop: 0, marginBottom: 12 } : null,
        { justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" },
      ]}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          hitSlop={8}
          disabled={!onToggle}
          onPress={() => onToggle?.(item.key)}
          style={({ pressed }) => [
            styles.legendItem,
            { opacity: hidden[item.key] || (selected && selected !== item.key) ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <LegendMarker variant={variant} color={item.color} />
          <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.legendText, { color: theme.foreground, fontFamily: theme.fontFamily }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card (shadcn Card + CardHeader + CardFooter)
// ---------------------------------------------------------------------------

export function TrendIcon({ color, down = false, size = 16 }: { color: string; down?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={down ? { transform: [{ scaleY: -1 }] } : undefined}>
      <Path d="M22 7 L13.5 15.5 L8.5 10.5 L2 17" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 7 L22 7 L22 13" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export interface ChartCardProps {
  title?: string;
  description?: string;
  /** Rendered at the top-right of the header (a toggle, select, badge…). */
  action?: React.ReactNode;
  /** Trend line in the footer: "Trending up by 5.2% this month". */
  trend?: { value: number; label?: string };
  caption?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function ChartCard({
  title,
  description,
  action,
  trend,
  caption,
  footer,
  children,
  style,
  contentStyle,
}: ChartCardProps) {
  const theme = useChartTheme();
  const font = { fontFamily: theme.fontFamily };
  const up = (trend?.value ?? 0) >= 0;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius + 2 }, style]}>
      {title || description || action ? (
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            {title ? <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.cardTitle, font, { color: theme.foreground }]}>{title}</Text> : null}
            {description ? (
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.cardDescription, font, { color: theme.mutedForeground }]}>{description}</Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      <View style={[styles.cardContent, contentStyle]}>{children}</View>
      {trend || caption || footer ? (
        <View style={styles.cardFooter}>
          {trend ? (
            <View style={styles.trendRow}>
              <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.trendText, font, { color: theme.foreground }]}>
                {trend.label ?? `Trending ${up ? "up" : "down"} by ${Math.abs(trend.value).toFixed(1)}% this month`}
              </Text>
              <TrendIcon color={up ? theme.positive : theme.negative} down={!up} />
            </View>
          ) : null}
          {caption ? <Text maxFontSizeMultiplier={TEXT_SCALE} style={[styles.caption, font, { color: theme.mutedForeground }]}>{caption}</Text> : null}
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: "absolute",
    left: 0,
    top: 0,
    minWidth: 128,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
    shadowColor: "#000",
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tooltipTitle: { fontSize: 12, fontWeight: "500", marginBottom: 1 },
  tooltipRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  // Grow into spare width but keep the natural width: `flex: 1` collapsed labels to "C…" in a content-sized tooltip.
  tooltipLabel: { flexGrow: 1, flexShrink: 1, fontSize: 12 },
  tooltipValue: { fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"], marginLeft: 12 },
  tooltipFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
    marginTop: 1,
  },
  indicatorDot: { width: 10, height: 10, borderRadius: 2.5 },
  indicatorLine: { width: 4, height: 16, borderRadius: 2 },
  indicatorDashed: { width: 10, height: 10, borderRadius: 2.5, borderWidth: 1.5, borderStyle: "dashed" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 12, fontWeight: "500" },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: "visible" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingTop: 18 },
  cardTitle: { fontSize: 16, fontWeight: "500", letterSpacing: -0.2 },
  cardDescription: { fontSize: 13, marginTop: 4 },
  cardContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  cardFooter: { paddingHorizontal: 18, paddingBottom: 18, marginTop: -4, gap: 4 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  trendText: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 13 },
});

/** Dark or light text, whichever reads better on `hex`. */
export function readableTextColor(hex: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex);
  if (!m) return "#FFFFFF";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? "#09090B" : "#FFFFFF";
}
