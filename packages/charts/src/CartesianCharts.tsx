import React, { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Defs, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import {
  AnimatedPath,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  labelStep,
  niceTicks,
  responsive,
} from "./internal";
import {
  ChartConfig,
  ChartLegend,
  ChartTooltip,
  CurveType,
  TEXT_SCALE,
  TooltipIndicator,
  buildArea,
  buildPath,
  roundedRect,
  useMorphPaths,
  useSeries,
} from "./kit";
import {
  AnimationType,
  BackgroundPattern,
  BackgroundVariant,
  ChartDot,
  ChartSkeleton,
  DotVariant,
  FillVariant,
  GlowFilter,
  LegendVariant,
  Reveal,
  SeriesFill,
  StrokeVariant,
  TooltipRoundness,
  TooltipVariant,
  fillUrl,
  glowUrl,
  solidOpacity,
  useDashLoop,
} from "./styles";
import { useChartTheme } from "./theme";

const AnimatedG = Animated.createAnimatedComponent(G);

export type Datum = Record<string, any>;
export type SeriesType = "bar" | "line" | "area";

export interface CartesianBaseProps {
  /** Rows of data, e.g. [{ month: "Jan", desktop: 186, mobile: 80 }]. */
  data: Datum[];
  /** Series to plot: { desktop: { label: "Desktop", color: "#2563eb" } }. */
  config: ChartConfig;
  /** Key of the category / x value in each row. */
  xKey: string;
  /** Subset/order of config keys to draw. Defaults to all config keys. */
  keys?: string[];
  width?: number;
  height?: number;

  // Grid & axes
  showGrid?: boolean;
  gridStyle?: "solid" | "dashed";
  /** Vertical grid lines at every category. */
  gridVertical?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  yAxisPosition?: "left" | "right";
  yTickCount?: number;
  /**
   * Value range of the y axis. Each end is a number or "auto" (fit the data). Omit to start at zero.
   * Prices, heart rate, weight…: `yDomain={["auto", "auto"]}` so small moves aren't flattened.
   */
  yDomain?: [number | "auto", number | "auto"];
  /** Horizontal lines for goals, limits or averages: [{ value: 200, label: "Goal" }]. */
  referenceLines?: ReferenceLine[];
  /** Missing values (null / undefined / NaN) break lines into gaps. True draws straight across them. */
  connectNulls?: boolean;
  /** Texture behind the plot: dots, grid, hatch… */
  backgroundVariant?: BackgroundVariant;

  // Legend
  showLegend?: boolean;
  legendVariant?: LegendVariant;
  legendAlign?: "left" | "center" | "right";
  legendPosition?: "top" | "bottom";
  /** "toggle" hides/shows a series, "select" highlights it and dims the rest. */
  legendMode?: "toggle" | "select" | "none";
  /** @deprecated use legendMode="none" */
  legendToggle?: boolean;
  defaultSelectedKey?: string | null;
  onSeriesSelect?: (key: string | null) => void;

  // Tooltip
  showTooltip?: boolean;
  tooltipIndicator?: TooltipIndicator;
  tooltipVariant?: TooltipVariant;
  tooltipRoundness?: TooltipRoundness;
  hideTooltipIndicator?: boolean;
  hideTooltipLabel?: boolean;
  showTooltipTotal?: boolean;

  // Look & motion
  /** Value labels on bars / points. */
  showLabels?: boolean;
  animate?: boolean;
  /** Entrance: rise from baseline, or wipe in from a side. */
  animationType?: AnimationType;
  /** Shimmering skeleton instead of the chart. */
  isLoading?: boolean;
  /** Range selector under the chart for long series. */
  showBrush?: boolean;
  brushHeight?: number;

  formatValue?: (value: number, key?: string) => string;
  formatLabel?: (value: any, index: number) => string;
  onSelect?: (index: number | null, datum: Datum | null) => void;
  /**
   * Controlled selection: this point shows its tooltip while the finger is up (e.g. the latest
   * value, or the point picked on a second, synced chart). Scrubbing still takes over.
   */
  activeIndex?: number | null;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** Shown when `data` is empty. */
  emptyText?: string;
  /** Screen-reader summary. Defaults to a generated one ("Line chart, 6 points. Desktop: 186 to 214…"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export interface ReferenceLine {
  value: number;
  label?: string;
  /** Defaults to the muted foreground colour. */
  color?: string;
  /** Default true. */
  dashed?: boolean;
}

interface LineLook {
  curve?: CurveType;
  strokeWidth?: number;
  strokeVariant?: StrokeVariant;
  glow?: boolean;
  showDots?: boolean;
  dotRadius?: number;
  dotVariant?: DotVariant;
  activeDotVariant?: DotVariant;
  /** Draw the last segment dashed (projection / incomplete period). */
  bufferLast?: boolean;
}

export interface AreaChartProps extends CartesianBaseProps, LineLook {
  stacked?: boolean;
  /** "expand" = 100% stacked, "silhouette" = centred streamgraph. */
  stackOffset?: "none" | "expand" | "silhouette";
  fillVariant?: FillVariant;
  /** @deprecated use fillVariant */
  gradient?: boolean;
  fillOpacity?: number;
}

export interface LineChartProps extends CartesianBaseProps, LineLook {
  /** Keys drawn with a dashed stroke (targets, forecasts…). */
  dashedKeys?: string[];
}

export interface BarChartProps extends CartesianBaseProps {
  stacked?: boolean;
  /** "expand" = 100% stacked bars. */
  stackOffset?: "none" | "expand";
  /** "horizontal" draws bars left→right with categories down the side. */
  layout?: "vertical" | "horizontal";
  radius?: number;
  barGap?: number;
  /** Fraction (0–0.9) of each category slot left empty. */
  categoryGap?: number;
  maxBarSize?: number;
  fillVariant?: FillVariant;
  glow?: boolean;
  /** "lollipop" draws a thin stem with a round head. */
  barShape?: "bar" | "lollipop";
  /** Hatch the last bar (incomplete period). */
  bufferLast?: boolean;
  /** Colour for negative values. */
  negativeColor?: string;
  getColor?: (value: number, index: number, key: string) => string | undefined;
  /** Horizontal layout: draw the category label inside the bar. */
  labelInside?: boolean;
}

export interface ComboChartProps extends CartesianBaseProps, LineLook {
  /** Per key: "bar" (default), "line" or "area". */
  types: Record<string, SeriesType>;
  radius?: number;
  fillVariant?: FillVariant;
}

type EngineProps = CartesianBaseProps &
  Partial<Omit<AreaChartProps, "stackOffset"> & LineChartProps & Omit<BarChartProps, "stackOffset">> & {
    stackOffset?: "none" | "expand" | "silhouette";
    kind: SeriesType | "combo";
    types?: Record<string, SeriesType>;
    width: number;
    revealKey?: string;
  };

interface Shape {
  id: string;
  key: string;
  type: SeriesType | "area-line" | "tail";
  d: string;
  collapsed: string;
  color: string;
  fill?: string;
  index?: number;
  bx?: number;
  bw?: number;
  /** Zero-size bar with the same path structure (for merged bar groups). */
  empty?: string;
}

const num = (value: unknown) => {
  const n = Number(value);
  return isFinite(n) ? n : 0;
};
/** null / undefined / "" / NaN: no reading for this point (drawn as a gap). */
const missing = (value: unknown) =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value));

/** Runs of consecutive present indices below `limit` (one run when connecting across gaps). */
function runsOf(present: boolean[], limit: number, connect: boolean) {
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < limit; i++) {
    if (present[i]) run.push(i);
    else if (!connect && run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

const KIND_NAME: Record<string, string> = { area: "Area chart", line: "Line chart", bar: "Bar chart", combo: "Chart" };

function CartesianEngine(props: EngineProps) {
  const theme = useChartTheme();
  const {
    kind,
    data = [],
    config,
    xKey,
    keys,
    width,
    height = 220,
    showGrid = true,
    gridStyle = "solid",
    gridVertical = false,
    showXAxis = true,
    showYAxis = false,
    yAxisPosition = "left",
    yTickCount = 4,
    yDomain,
    referenceLines = [],
    connectNulls = false,
    activeIndex,
    emptyText = "No data",
    accessibilityLabel,
    backgroundVariant = "none",
    showLegend = false,
    legendVariant = "rounded-square",
    legendAlign = "center",
    legendPosition = "bottom",
    legendToggle = true,
    legendMode = legendToggle ? "toggle" : "none",
    defaultSelectedKey = null,
    onSeriesSelect,
    showTooltip = true,
    tooltipIndicator = "dot",
    tooltipVariant = "default",
    tooltipRoundness = "lg",
    hideTooltipIndicator = false,
    hideTooltipLabel = false,
    showTooltipTotal = false,
    showLabels = false,
    animate = true,
    animationType = kind === "bar" ? "rise" : "left-to-right",
    revealKey = "",
    formatValue = (value: number) => compactNumber(value),
    formatLabel = (value: any) => String(value ?? ""),
    onSelect,
    onScrubStart,
    onScrubEnd,
    curve = "monotone",
    stacked = false,
    stackOffset = "none",
    gradient,
    fillVariant = gradient === false ? "solid" : kind === "bar" ? "solid" : "gradient",
    strokeWidth = 2,
    strokeVariant = "solid",
    glow = false,
    showDots,
    dotRadius = 3.5,
    dotVariant = "default",
    activeDotVariant = "default",
    bufferLast = false,
    dashedKeys = [],
    radius = 6,
    barGap = 4,
    categoryGap = 0.25,
    maxBarSize = 56,
    barShape = "bar",
    negativeColor,
    getColor,
    types = {},
  } = props;

  const series = useSeries(config, keys);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<string | null>(defaultSelectedKey);
  const [active, setActive] = useState<{ index: number; y: number; sticky: boolean } | null>(null);
  const dash = useDashLoop(strokeVariant === "animated-dashed");
  const typeOf = (key: string): SeriesType => (kind === "combo" ? types[key] ?? "bar" : kind);
  const banded = kind === "bar" || kind === "combo";
  const n = data.length;
  const fontFamily = theme.fontFamily;
  const variantOf = (key: string) => config[key]?.variant ?? fillVariant;
  const glowOf = (key: string) => config[key]?.glow ?? glow;
  const strokeOf = (key: string) => config[key]?.strokeVariant ?? (dashedKeys.includes(key) ? "dashed" : strokeVariant);

  const geo = useMemo(() => {
    const stack = stacked && (kind === "area" || kind === "bar");
    const expand = stack && stackOffset === "expand";
    const silhouette = stack && kind === "area" && stackOffset === "silhouette";
    const y0: Record<string, number[]> = {};
    const y1: Record<string, number[]> = {};
    // Gaps only for unstacked series: a stack treats a missing value as 0.
    const present: Record<string, boolean[]> = {};
    series.forEach((s) => {
      y0[s.key] = [];
      y1[s.key] = [];
      present[s.key] = data.map((d) => stack || !missing(d[s.key]));
    });
    for (let i = 0; i < n; i++) {
      const total = series.reduce((sum, s) => sum + (hidden[s.key] ? 0 : Math.max(0, num(data[i][s.key]))), 0);
      let pos = silhouette ? -total / 2 : 0;
      let neg = 0;
      series.forEach((s) => {
        // Hidden series collapse to zero so toggling them animates.
        let v = hidden[s.key] ? 0 : num(data[i][s.key]);
        if (expand) v = total ? Math.max(0, v) / total : 0;
        if (stack) {
          if (v >= 0 || silhouette) {
            y0[s.key][i] = pos;
            y1[s.key][i] = pos += Math.max(v, 0);
          } else {
            y0[s.key][i] = neg;
            y1[s.key][i] = neg += v;
          }
        } else {
          y0[s.key][i] = 0;
          y1[s.key][i] = v;
        }
      });
    }
    const visible = series.filter((s) => !hidden[s.key]);
    // Default: the axis starts at zero. A yDomain end of "auto" fits the data instead.
    const all: number[] = silhouette || yDomain ? [] : [0];
    visible.forEach((s) =>
      present[s.key].forEach((on, i) => {
        if (on) all.push(y0[s.key][i], y1[s.key][i]);
      })
    );
    // Lines (no fill) start at their own lowest point, not at the zero baseline under them.
    if (yDomain && !stack) {
      // Bars keep zero (a bar cut off above zero misreads); lines and areas fit their own values.
      const flatOnly = visible.every((s) => typeOf(s.key) !== "bar");
      if (flatOnly) all.splice(0, all.length, ...visible.flatMap((s) => y1[s.key].filter((_, i) => present[s.key][i])));
    }
    referenceLines.forEach((r) => Number.isFinite(r.value) && all.push(r.value));
    if (!all.length) all.push(0, 1);
    let scale = expand
      ? { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }
      : niceTicks(
          typeof yDomain?.[0] === "number" ? yDomain[0] : Math.min(...all),
          typeof yDomain?.[1] === "number" ? yDomain[1] : Math.max(...all, yDomain ? -Infinity : 1e-9),
          yTickCount
        );
    // A fixed end is exact (0–100 stays 0–100), not rounded out to the next nice tick.
    if (!expand && yDomain && (typeof yDomain[0] === "number" || typeof yDomain[1] === "number")) {
      const lo = typeof yDomain[0] === "number" ? yDomain[0] : scale.min;
      const hi = typeof yDomain[1] === "number" ? yDomain[1] : scale.max;
      if (hi > lo) scale = { min: lo, max: hi, ticks: scale.ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9) };
    }
    const tickLabel = (t: number) => (expand ? `${Math.round(t * 100)}%` : formatValue(t));
    const yAxisWidth = showYAxis ? Math.max(...scale.ticks.map((t) => estimateTextWidth(tickLabel(t), 11))) + 10 : 0;
    const edge = banded ? 0 : Math.max(dotRadius + 4, strokeWidth + 1);
    const pad = {
      top: showLabels ? 20 : 10,
      // Value labels hang below negative bars: keep them clear of the x axis.
      bottom: (showXAxis ? 26 : 6) + (showLabels && scale.min < 0 ? 16 : 0),
      left: (yAxisPosition === "left" ? yAxisWidth : 0) + edge,
      right: (yAxisPosition === "right" ? yAxisWidth : 0) + edge,
    };
    const plotW = Math.max(width - pad.left - pad.right, 10);
    const plotH = Math.max(height - pad.top - pad.bottom, 10);
    const toY = (v: number) => pad.top + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH;
    const baseline = silhouette ? pad.top + plotH / 2 : toY(clamp(0, scale.min, scale.max));
    const bandW = plotW / Math.max(n, 1);
    const xAt = (i: number) =>
      banded ? pad.left + (i + 0.5) * bandW : pad.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));

    const shapes: Shape[] = [];
    const barKeys = series.filter((s) => typeOf(s.key) === "bar");
    const visibleBars = barKeys.filter((s) => !hidden[s.key]);
    const groupW = Math.min(
      bandW * (1 - clamp(categoryGap, 0, 0.9)),
      maxBarSize * (stack ? 1 : Math.max(visibleBars.length, 1))
    );

    series.forEach((s) => {
      const t = typeOf(s.key);
      if (t === "bar") {
        const vIndex = visibleBars.indexOf(s);
        for (let i = 0; i < n; i++) {
          let x: number;
          let w: number;
          if (stack) {
            w = groupW;
            x = pad.left + i * bandW + (bandW - w) / 2;
          } else {
            const count = Math.max(visibleBars.length, 1);
            const each = (groupW - barGap * (count - 1)) / count;
            const start = pad.left + i * bandW + (bandW - groupW) / 2;
            if (vIndex === -1) {
              const old = barKeys.indexOf(s) / Math.max(barKeys.length, 1);
              x = start + old * groupW;
              w = 0;
            } else {
              x = start + vIndex * (each + barGap);
              w = Math.max(each, 0);
            }
          }
          const a = toY(clamp(y0[s.key][i], scale.min, scale.max));
          const b = toY(clamp(y1[s.key][i], scale.min, scale.max));
          const top = Math.min(a, b);
          const h = Math.abs(a - b);
          const value = num(data[i][s.key]);
          const positive = y1[s.key][i] >= y0[s.key][i];
          let corners = { tl: radius, tr: radius, br: radius, bl: radius };
          if (stack) {
            const outer = series
              .filter((o) => typeOf(o.key) === "bar" && !hidden[o.key])
              .filter((o) => (positive ? num(data[i][o.key]) >= 0 : num(data[i][o.key]) < 0))
              .pop();
            const isOuter = outer?.key === s.key;
            corners = positive
              ? { tl: isOuter ? radius : 0, tr: isOuter ? radius : 0, br: 0, bl: 0 }
              : { tl: 0, tr: 0, br: isOuter ? radius : 0, bl: isOuter ? radius : 0 };
          }
          let d: string;
          let collapsed: string;
          let empty: string;
          if (barShape === "lollipop") {
            // Thin stem + round head, as one path so it still morphs.
            const head = Math.min(Math.max(w, 6), 14);
            const cx = x + w / 2;
            const tipY = positive ? top : top + h;
            const full = { tl: head, tr: head, br: head, bl: head };
            d = `${roundedRect(cx - 1.25, top, 2.5, h, {})} ${roundedRect(cx - head / 2, tipY - head / 2, head, head, full)}`;
            collapsed = `${roundedRect(cx - 1.25, baseline, 2.5, 0, {})} ${roundedRect(cx - head / 2, baseline - head / 2, head, head, full)}`;
            empty = `${roundedRect(cx, baseline, 0, 0, {})} ${roundedRect(cx, baseline, 0, 0, full)}`;
          } else {
            d = roundedRect(x, top, w, h, corners);
            collapsed = roundedRect(x, baseline, w, 0, corners);
            empty = roundedRect(x + w / 2, baseline, 0, 0, corners);
          }
          const color = getColor?.(value, i, s.key) ?? (value < 0 && negativeColor ? negativeColor : s.color);
          const buffered = bufferLast && i === n - 1;
          shapes.push({
            id: `${s.key}-${i}`,
            key: s.key,
            type: "bar",
            index: i,
            d,
            collapsed,
            color,
            fill: buffered
              ? `url(#f-buf-${s.key.replace(/[^a-zA-Z0-9_-]/g, "_")})`
              : color !== s.color
              ? color
              : fillUrl(`${s.key}-bar`, variantOf(s.key), color, "bar"),
            bx: x,
            bw: w,
            empty,
          });
        }
      } else {
        if (t === "line" && hidden[s.key]) return;
        const topPts = data.map((_, i) => ({ x: xAt(i), y: toY(y1[s.key][i]) }));
        const flat = data.map((_, i) => ({ x: xAt(i), y: baseline }));
        const on = present[s.key];
        // Buffer: main line stops one point early; the last segment is drawn dashed.
        const split = bufferLast && n > 2 && on[n - 1] && on[n - 2];
        const runs = runsOf(on, split ? n - 1 : n, connectNulls);
        const pick = (pts: { x: number; y: number }[], run: number[]) => run.map((i) => pts[i]);
        const line = (pts: { x: number; y: number }[]) => runs.map((run) => buildPath(pick(pts, run), curve)).join(" ");
        if (t === "area") {
          // An "auto" y range can start above zero: the fill stops at the plot's floor.
          const bottomPts = data.map((_, i) => ({ x: xAt(i), y: toY(clamp(y0[s.key][i], scale.min, scale.max)) }));
          const areaRuns = runsOf(on, n, connectNulls);
          shapes.push({
            id: `${s.key}-area`,
            key: s.key,
            type: "area",
            d: areaRuns.map((run) => buildArea(pick(topPts, run), pick(bottomPts, run), curve)).join(" "),
            collapsed: areaRuns.map((run) => buildArea(pick(flat, run), pick(flat, run), curve)).join(" "),
            color: s.color,
            fill: fillUrl(`${s.key}-area`, variantOf(s.key), s.color, "area"),
          });
        }
        shapes.push({
          id: `${s.key}-${t === "area" ? "stroke" : "line"}`,
          key: s.key,
          type: t === "area" ? "area-line" : "line",
          d: line(topPts),
          collapsed: line(flat),
          color: s.color,
        });
        if (split) {
          shapes.push({
            id: `${s.key}-tail`,
            key: s.key,
            type: "tail",
            d: buildPath(topPts.slice(-2), curve),
            collapsed: buildPath(flat.slice(-2), curve),
            color: s.color,
          });
        }
      }
    });

    // Bars of one series that share a fill are drawn as ONE path, so a morph costs one animated
    // update per group rather than one per bar (on Android each update is a React commit, and
    // dozens per frame made bars crawl into place). Every group holds all n bars — the ones with
    // another fill are zero-size — so groups keep the same structure and still morph.
    const marks: Shape[] = [];
    series.forEach((s) => {
      const own = shapes.filter((sh) => sh.key === s.key);
      if (typeOf(s.key) !== "bar") {
        marks.push(...own);
        return;
      }
      const main = fillUrl(`${s.key}-bar`, variantOf(s.key), s.color, "bar");
      const fills = own.map((b) => b.fill!).filter((f, i, all) => all.indexOf(f) === i).sort((a, b) => (a === main ? -1 : b === main ? 1 : a < b ? -1 : 1));
      fills.forEach((fill, k) => {
        const first = own.find((b) => b.fill === fill)!;
        marks.push({
          id: `${s.key}-bars-${k}`,
          key: s.key,
          type: "bar",
          d: own.map((b) => (b.fill === fill ? b.d : b.empty)).join(" "),
          collapsed: own.map((b) => (b.fill === fill ? b.collapsed : b.empty)).join(" "),
          color: first.color,
          fill,
        });
      });
    });

    const labels = data.map((d, i) => formatLabel(d[xKey], i));
    const maxLabel = Math.max(0, ...labels.map((l) => estimateTextWidth(l, 11)));
    const every = labelStep(n, plotW, maxLabel + 14);
    return { scale, tickLabel, pad, plotW, plotH, toY, baseline, bandW, xAt, shapes, marks, labels, every, y1, yAxisWidth, present };
  }, [data, series.map((s) => s.key + s.color).join(), JSON.stringify(config), hidden, width, height, kind, stacked, stackOffset, curve, radius, barGap, categoryGap, maxBarSize, barShape, bufferLast, showXAxis, showYAxis, yAxisPosition, showLabels, yTickCount, dotRadius, strokeWidth, JSON.stringify(types), negativeColor, fillVariant, JSON.stringify(yDomain), JSON.stringify(referenceLines), connectNulls]);

  const rise = animationType === "rise";
  const { paths, alt, progress } = useMorphPaths(
    geo.marks.map((s) => s.d),
    geo.marks.map((s) => (rise ? s.collapsed : s.d)),
    { animate: animate && animationType !== "none" }
  );

  const { scale, tickLabel, pad, plotW, plotH, toY, baseline, bandW, xAt, shapes, marks: markShapes, labels, every, y1, present } = geo;
  // The data can shrink under an active selection (brush, live updates): drop it rather than read past the end.
  // With the finger up, a controlled `activeIndex` keeps its point selected.
  const controlled = activeIndex !== null && activeIndex !== undefined && activeIndex >= 0 && activeIndex < n ? activeIndex : null;
  const idx = active && active.index < n ? active.index : controlled;
  // Dense series (a year of days) skip point markers unless asked: they'd smear into a thick line.
  const dotsOn = showDots ?? (kind === "line" && (n < 2 || plotW / (n - 1) >= 12));

  const indexAt = (x: number) =>
    banded
      ? clamp(Math.floor((x - pad.left) / bandW), 0, n - 1)
      : clamp(Math.round(((x - pad.left) / Math.max(plotW, 1)) * (n - 1)), 0, n - 1);
  const pick = (x: number, y: number, sticky: boolean) => {
    const i = indexAt(x);
    // Scrubbing fires on every finger move; only a new index (or a tap pinning it) re-renders.
    if (active && active.index === i && active.sticky === sticky) return;
    if (i !== idx) {
      onSelect?.(i, data[i]);
      theme.haptics?.();
    }
    setActive({ index: i, y, sticky });
  };

  const onLegend = (key: string) => {
    if (legendMode === "toggle") setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
    if (legendMode === "select") {
      const next = picked === key ? null : key;
      setPicked(next);
      onSeriesSelect?.(next);
    }
  };
  const dimKey = (key: string) => (picked && picked !== key ? 0.22 : 1);
  const barLook = (s: Shape) => {
    const outlined = variantOf(s.key) !== "solid" && variantOf(s.key) !== "gradient";
    return {
      fill: s.fill,
      fillOpacity: solidOpacity(variantOf(s.key), "bar"),
      stroke: outlined ? s.color : undefined,
      strokeWidth: outlined ? 1 : 0,
    };
  };

  const visibleSeries = series.filter((s) => !hidden[s.key]);
  const tooltipItems =
    idx === null
      ? []
      : visibleSeries.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          value: present[s.key][idx] ? formatValue(num(data[idx][s.key]), s.key) : "—",
        }));
  const total = idx === null ? 0 : visibleSeries.reduce((sum, s) => sum + num(data[idx][s.key]), 0);
  const topOfActive =
    idx === null ? 0 : Math.min(...visibleSeries.map((s) => toY(Math.max(y1[s.key][idx], 0))), baseline);
  const dashArray = (key: string) => (strokeOf(key) === "solid" ? undefined : [5, 4]);
  const dashOffset = (key: string) =>
    strokeOf(key) === "animated-dashed" ? dash.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) : undefined;
  const legend = showLegend ? (
    <ChartLegend
      items={series}
      hidden={hidden}
      selected={picked}
      variant={legendVariant}
      align={legendAlign}
      position={legendPosition}
      onToggle={legendMode === "none" ? undefined : onLegend}
    />
  ) : null;


  // Touch only moves the cursor, active dots and tooltip: the heavy layers below re-render when the
  // props, data or legend state change — never per scrub frame. Bars dim around the active one, so
  // only banded charts include the index.
  const markIndex = banded ? idx : null;
  const backdrop = useMemo(
    () =>
      n ? (
        <>
          <Defs>
            {series.map((s) => (
              <React.Fragment key={s.key}>
                <SeriesFill id={`${s.key}-area`} color={s.color} variant={variantOf(s.key)} kind="area" />
                <SeriesFill id={`${s.key}-bar`} color={s.color} variant={variantOf(s.key)} kind="bar" />
                <SeriesFill id={`buf-${s.key}`} color={s.color} variant="hatched" kind="bar" opacity={0.9} />
                {glowOf(s.key) ? <GlowFilter id={s.key} blur={kind === "bar" ? 5 : 4} /> : null}
              </React.Fragment>
            ))}
          </Defs>

          <BackgroundPattern variant={backgroundVariant} x={pad.left} y={pad.top} width={plotW} height={plotH} color={theme.mutedForeground} />

          {showGrid
            ? scale.ticks.map((t) => (
                <Line
                  key={`g-${t}`}
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={toY(t)}
                  y2={toY(t)}
                  stroke={theme.border}
                  strokeWidth={1}
                  strokeDasharray={gridStyle === "dashed" ? "3 3" : undefined}
                />
              ))
            : null}
          {gridVertical
            ? data.map((_, i) =>
                i % every === 0 ? (
                  <Line key={`gv-${i}`} x1={xAt(i)} x2={xAt(i)} y1={pad.top} y2={pad.top + plotH} stroke={theme.border} strokeDasharray={gridStyle === "dashed" ? "3 3" : undefined} />
                ) : null
              )
            : null}
          {showYAxis
            ? scale.ticks.map((t) => (
                <SvgText
                  key={`y-${t}`}
                  x={yAxisPosition === "left" ? pad.left - 8 : width - pad.right + 8}
                  y={toY(t) + 4}
                  fontSize={11}
                  fill={theme.mutedForeground}
                  textAnchor={yAxisPosition === "left" ? "end" : "start"}
                  fontFamily={fontFamily}
                >
                  {tickLabel(t)}
                </SvgText>
              ))
            : null}
        </>
      ) : null,
    [props, geo, theme, hidden, picked]
  );
  const marks = useMemo(
    () =>
      n ? (
        <>
          {/* Glow layer (blurred copies) sits under the crisp shapes. */}
          {markShapes.map((s, i) =>
            glowOf(s.key) && !hidden[s.key] ? (
              s.type === "bar" ? (
                <AnimatedPath key={`gl-${s.id}`} d={alt[i] as any} fill={s.color} opacity={0.55 * dimKey(s.key)} filter={glowUrl(s.key)} />
              ) : s.type !== "area" ? (
                <AnimatedPath key={`gl-${s.id}`} d={alt[i] as any} fill="none" stroke={s.color} strokeWidth={strokeWidth + 4} opacity={0.6 * dimKey(s.key)} filter={glowUrl(s.key)} />
              ) : null
            ) : null
          )}

          {markShapes.map((s, i) => {
            if (s.type === "area") {
              return (
                <AnimatedPath key={s.id} d={paths[i] as any} fill={s.fill} fillOpacity={solidOpacity(variantOf(s.key), "area")} opacity={dimKey(s.key)} />
              );
            }
            if (s.type === "bar") {
              // A selection dims every bar; the selected ones are redrawn at full strength below.
              // Keyed by position, not series: swapping the plotted series keeps the same SVG
              // children (react-native-svg on Android blanks the canvas when children remount).
              return <AnimatedPath key={`bars-${i}`} d={paths[i] as any} {...barLook(s)} opacity={(markIndex !== null ? 0.45 : 1) * dimKey(s.key)} />;
            }
            const dashed = s.type === "tail" ? [4, 4] : dashArray(s.key);
            return (
              <AnimatedPath
                key={s.id}
                d={paths[i] as any}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashed}
                strokeDashoffset={s.type === "tail" ? undefined : (dashOffset(s.key) as any)}
                opacity={dimKey(s.key)}
              />
            );
          })}

          {markIndex !== null
            ? shapes.map((s) =>
                s.type === "bar" && s.index === markIndex && !hidden[s.key] ? (
                  <Path key={`on-${s.id}`} d={s.d} {...barLook(s)} opacity={dimKey(s.key)} />
                ) : null
              )
            : null}

          {(dotsOn || showLabels) && !banded ? (
            <AnimatedG opacity={rise ? progress : 1}>
              {visibleSeries
                .filter((s) => typeOf(s.key) !== "bar")
                .map((s) =>
                  data.map((d, i) => {
                    if (!present[s.key][i]) return null;
                    const cy = toY(y1[s.key][i]);
                    return (
                      <G key={`${s.key}-p-${i}`} opacity={dimKey(s.key)}>
                        {dotsOn ? <ChartDot cx={xAt(i)} cy={cy} r={dotRadius} color={s.color} variant={dotVariant} surface={theme.card} /> : null}
                        {showLabels && i % every === 0 ? (
                          <SvgText x={xAt(i)} y={cy - dotRadius - 6} fontSize={11} fontWeight="500" fill={theme.foreground} textAnchor="middle" fontFamily={fontFamily}>
                            {formatValue(num(d[s.key]), s.key)}
                          </SvgText>
                        ) : null}
                      </G>
                    );
                  })
                )}
            </AnimatedG>
          ) : null}

          {showLabels && banded ? (
            <AnimatedG opacity={progress}>
              {visibleSeries
                .filter((s) => typeOf(s.key) === "bar")
                .map((s) =>
                  data.map((d, i) => {
                    const shape = shapes.find((sh) => sh.id === `${s.key}-${i}`);
                    if (!shape || i % every !== 0 || !present[s.key][i]) return null;
                    const v = num(d[s.key]);
                    const yEnd = toY(y1[s.key][i]);
                    return (
                      <SvgText
                        key={`${s.key}-l-${i}`}
                        x={(shape.bx ?? xAt(i)) + (shape.bw ?? 0) / 2}
                        y={v >= 0 ? yEnd - (barShape === "lollipop" ? 12 : 6) : yEnd + 14}
                        fontSize={11}
                        fontWeight="500"
                        fill={theme.foreground}
                        textAnchor="middle"
                        fontFamily={fontFamily}
                      >
                        {formatValue(v, s.key)}
                      </SvgText>
                    );
                  })
                )}
            </AnimatedG>
          ) : null}
        </>
      ) : null,
    [props, geo, theme, hidden, picked, paths, alt, progress, dash, markIndex]
  );

  if (!n) return <EmptyState height={height} text={emptyText} />;

  // Screen readers: one adjustable element. Swipe up / down steps through the points, reading each
  // one's values (and moving the tooltip, so a sighted helper sees the same point).
  const describe = (i: number) =>
    `${labels[i] || String(data[i][xKey] ?? "")}: ${visibleSeries
      .map((s) => `${s.label} ${present[s.key][i] ? formatValue(num(data[i][s.key]), s.key) : "no data"}`)
      .join(", ")}`;
  const summary =
    accessibilityLabel ??
    `${KIND_NAME[kind] ?? "Chart"}, ${n} ${n === 1 ? "point" : "points"}. ${visibleSeries
      .slice(0, 4)
      .map((s) => {
        const vals = data.map((d) => d[s.key]).filter((v) => !missing(v)).map(Number);
        return vals.length ? `${s.label}: ${formatValue(vals[0], s.key)} to ${formatValue(vals[vals.length - 1], s.key)}` : `${s.label}: no data`;
      })
      .join(". ")}`;
  const step = (delta: number) => {
    const next = clamp((idx ?? (delta > 0 ? -1 : n)) + delta, 0, n - 1);
    if (next === idx) return;
    setActive({ index: next, y: 0, sticky: true });
    onSelect?.(next, data[next]);
    theme.haptics?.();
  };

  return (
    <View>
      {legendPosition === "top" ? legend : null}
      <View
        style={{ width, height }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={summary}
        accessibilityHint="Swipe up or down to read each point."
        accessibilityValue={idx === null ? undefined : { text: describe(idx) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => step(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        <Svg width={width} height={height}>
          {backdrop}

          {banded && idx !== null ? (
            <Rect x={idx * bandW + pad.left + 2} y={pad.top - 6} width={bandW - 4} height={plotH + 6} rx={6} fill={theme.muted} opacity={0.8} />
          ) : null}
          {!banded && idx !== null ? (
            <Line x1={xAt(idx)} x2={xAt(idx)} y1={pad.top} y2={pad.top + plotH} stroke={theme.mutedForeground} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" />
          ) : null}

          {marks}

          {referenceLines.map((r, k) => {
            if (!Number.isFinite(r.value) || r.value < scale.min || r.value > scale.max) return null;
            const y = toY(r.value);
            const color = r.color ?? theme.mutedForeground;
            const above = y - 6 > pad.top - 4;
            return (
              <G key={`ref-${k}`}>
                <Line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={color} strokeWidth={1.25} strokeDasharray={r.dashed === false ? undefined : "5 4"} />
                {r.label ? (
                  // Card-coloured chip so a series crossing the label never strikes through it.
                  <Rect
                    x={width - pad.right - estimateTextWidth(r.label, 10) - 6}
                    y={(above ? y - 6 : y + 14) - 11}
                    width={estimateTextWidth(r.label, 10) + 6}
                    height={14}
                    rx={4}
                    fill={theme.card}
                    opacity={0.9}
                  />
                ) : null}
                {r.label ? (
                  <SvgText x={width - pad.right - 2} y={above ? y - 6 : y + 14} fontSize={10} fontWeight="500" fill={color} textAnchor="end" fontFamily={fontFamily}>
                    {r.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}

          {idx !== null
            ? visibleSeries
                .filter((s) => typeOf(s.key) !== "bar" && present[s.key][idx])
                .map((s) => (
                  <ChartDot key={`a-${s.key}`} cx={xAt(idx)} cy={toY(y1[s.key][idx])} r={dotRadius + 2} color={s.color} variant={activeDotVariant === "none" ? "default" : activeDotVariant} surface={theme.card} />
                ))
            : null}

          {showXAxis
            ? labels.map((label, i) => {
                if (i % every !== 0) return null;
                const w = estimateTextWidth(label, 11) / 2;
                const x = xAt(i);
                const anchor = banded
                  ? x - w < 0
                    ? "start"
                    : x + w > width
                    ? "end"
                    : "middle"
                  : i === 0
                  ? "start"
                  : i === n - 1
                  ? "end"
                  : "middle";
                return (
                  <SvgText
                    key={`x-${i}`}
                    x={banded && x - w < 0 ? 0 : banded && x + w > width ? width : x}
                    y={height - 8}
                    fontSize={11}
                    fill={idx === i ? theme.foreground : theme.mutedForeground}
                    fontWeight={idx === i ? "500" : "400"}
                    textAnchor={anchor}
                    fontFamily={fontFamily}
                  >
                    {label}
                  </SvgText>
                );
              })
            : null}
        </Svg>

        {animate ? <Reveal type={animationType} replayKey={revealKey} color={theme.card} /> : null}

        <TouchLayer
          scrub
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          onMove={(x, y) => pick(x, y, false)}
          onTap={(x, y) => {
            const i = indexAt(x);
            if (active?.sticky && active.index === i) {
              setActive(null);
              onSelect?.(null, null);
            } else {
              pick(x, y, true);
            }
          }}
          onRelease={(wasTap) => {
            if (!wasTap) {
              setActive(null);
              onSelect?.(null, null);
            }
          }}
        />

        {showTooltip ? (
          <ChartTooltip
            visible={idx !== null}
            x={idx === null ? 0 : xAt(idx)}
            y={Math.min(topOfActive, active?.y ?? topOfActive)}
            boundsWidth={width}
            boundsHeight={height}
            title={hideTooltipLabel || idx === null ? undefined : labels[idx] || String(data[idx][xKey] ?? "")}
            items={tooltipItems}
            indicator={tooltipIndicator}
            variant={tooltipVariant}
            roundness={tooltipRoundness}
            hideIndicator={hideTooltipIndicator}
            footer={showTooltipTotal && idx !== null ? { label: "Total", value: formatValue(total) } : undefined}
          />
        ) : null}
      </View>
      {legendPosition === "bottom" ? legend : null}
    </View>
  );
}

/** Muted "No data" in the chart's footprint, so layouts don't jump while data loads or filters empty. */
export function EmptyState({ height, text }: { height: number; text: string }) {
  const theme = useChartTheme();
  return (
    <View style={{ height, alignItems: "center", justifyContent: "center" }} accessible accessibilityLabel={text}>
      <Text maxFontSizeMultiplier={TEXT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13, fontFamily: theme.fontFamily }}>
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Brush: a mini overview with a draggable window that picks the visible range.
// ---------------------------------------------------------------------------

function Brush({
  data,
  valueKey,
  width,
  height,
  range,
  onChange,
  formatLabel,
  xKey,
}: {
  data: Datum[];
  valueKey: string;
  width: number;
  height: number;
  range: [number, number];
  onChange: (range: [number, number]) => void;
  formatLabel: (value: any, index: number) => string;
  xKey: string;
}) {
  const theme = useChartTheme();
  const n = data.length;
  const step = width / Math.max(n - 1, 1);
  const xOf = (i: number) => i * step;
  const values = data.map((d) => num(d[valueKey]));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const line = buildPath(
    values.map((v, i) => ({ x: xOf(i), y: 4 + (1 - (v - lo) / (hi - lo || 1)) * (height - 8) })),
    "monotone"
  );
  const latest = useRef({ range, onChange, step, n });
  latest.current = { range, onChange, step, n };
  const drag = useRef<{ mode: "start" | "end" | "move"; x0: number; r0: [number, number] } | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { range: r, step: s } = latest.current;
          const x = e.nativeEvent.locationX;
          const a = r[0] * s;
          const b = r[1] * s;
          const mode = Math.abs(x - a) < 22 ? "start" : Math.abs(x - b) < 22 ? "end" : "move";
          drag.current = { mode, x0: x, r0: r };
        },
        onPanResponderMove: (_, g) => {
          const st = drag.current;
          if (!st) return;
          const { step: s, n: count, onChange: cb } = latest.current;
          const delta = Math.round(g.dx / s);
          let [a, b] = st.r0;
          if (st.mode === "start") a = clamp(st.r0[0] + delta, 0, b - 2);
          else if (st.mode === "end") b = clamp(st.r0[1] + delta, a + 2, count - 1);
          else {
            const span = b - a;
            a = clamp(st.r0[0] + delta, 0, count - 1 - span);
            b = a + span;
          }
          if (a !== latest.current.range[0] || b !== latest.current.range[1]) cb([a, b]);
        },
        onPanResponderRelease: () => {
          drag.current = null;
        },
      }),
    []
  );

  const a = xOf(range[0]);
  const b = xOf(range[1]);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ width, height }} {...responder.panHandlers}>
        <Svg width={width} height={height} pointerEvents="none">
          <Rect x={0} y={0} width={width} height={height} rx={6} fill={theme.muted} opacity={0.6} />
          <Path d={line} stroke={theme.mutedForeground} strokeWidth={1.2} fill="none" />
          <Rect x={0} y={0} width={a} height={height} fill={theme.background} opacity={0.55} />
          <Rect x={b} y={0} width={width - b} height={height} fill={theme.background} opacity={0.55} />
          <Rect x={a} y={0.5} width={b - a} height={height - 1} rx={6} fill="none" stroke={theme.foreground} strokeOpacity={0.5} />
          {[a, b].map((x, k) => (
            <Rect key={k} x={x - 3} y={height / 2 - 9} width={6} height={18} rx={3} fill={theme.background} stroke={theme.foreground} strokeOpacity={0.7} />
          ))}
        </Svg>
      </View>
      <View style={brushStyles.labels}>
        <SvgLabel text={formatLabel(data[range[0]]?.[xKey], range[0])} color={theme.mutedForeground} />
        <SvgLabel text={formatLabel(data[range[1]]?.[xKey], range[1])} color={theme.mutedForeground} />
      </View>
    </View>
  );
}

function SvgLabel({ text, color }: { text: string; color: string }) {
  return (
    <Svg width={estimateTextWidth(text, 11) + 4} height={14}>
      <SvgText x={0} y={11} fontSize={11} fill={color}>
        {text}
      </SvgText>
    </Svg>
  );
}

const brushStyles = StyleSheet.create({
  labels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});

/** Adds loading state + brush around the engine. */
function CartesianRoot(props: EngineProps) {
  const { data = [], showBrush = false, brushHeight = 36, isLoading = false, height = 220, xKey, config, keys, width } = props;
  const n = data.length;
  const [range, setRange] = useState<[number, number]>(() => [Math.max(0, n - Math.max(Math.ceil(n * 0.4), 3)), Math.max(n - 1, 0)]);
  const safeRange: [number, number] = [clamp(range[0], 0, Math.max(n - 1, 0)), clamp(range[1], 0, Math.max(n - 1, 0))];
  const revealKey = `${n}|${(keys ?? Object.keys(config)).join()}`;
  if (isLoading) return <ChartSkeleton height={height} kind={props.kind === "bar" ? "bar" : "area"} />;
  const shown = showBrush && n > 4 ? data.slice(safeRange[0], safeRange[1] + 1) : data;
  const firstKey = (keys ?? Object.keys(config))[0];
  return (
    <View>
      {props.layout === "horizontal" && props.kind === "bar" ? (
        <HorizontalBars {...props} data={shown} />
      ) : (
        <CartesianEngine {...props} data={shown} revealKey={revealKey} />
      )}
      {showBrush && n > 4 && firstKey ? (
        <Brush
          data={data}
          valueKey={firstKey}
          width={width}
          height={brushHeight}
          range={safeRange}
          onChange={setRange}
          xKey={xKey}
          formatLabel={props.formatLabel ?? ((v: any) => String(v ?? ""))}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars (categories down the side)
// ---------------------------------------------------------------------------

function HorizontalBars(props: EngineProps) {
  const theme = useChartTheme();
  const {
    data = [],
    config,
    xKey,
    keys,
    width,
    height,
    stacked = false,
    radius = 6,
    barGap = 4,
    categoryGap = 0.25,
    maxBarSize = 40,
    showGrid = false,
    showXAxis = true,
    showLabels = false,
    labelInside = false,
    showLegend = false,
    legendVariant = "rounded-square",
    legendAlign = "center",
    legendToggle = true,
    showTooltip = true,
    tooltipIndicator = "dot",
    tooltipVariant = "default",
    tooltipRoundness = "lg",
    hideTooltipLabel = false,
    showTooltipTotal = false,
    animate = true,
    fillVariant = "solid",
    glow = false,
    backgroundVariant = "none",
    negativeColor,
    getColor,
    formatValue = (value: number) => compactNumber(value),
    formatLabel = (value: any) => String(value ?? ""),
    onSelect,
  } = props;
  const series = useSeries(config, keys);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeRaw, setActive] = useState<number | null>(null);
  const active = activeRaw !== null && activeRaw < data.length ? activeRaw : null;
  const n = data.length;
  const visible = series.filter((s) => !hidden[s.key]);
  const labels = data.map((d, i) => formatLabel(d[xKey], i));
  const rowH = 34 + (stacked ? 0 : Math.max(visible.length - 1, 0) * 10);
  const chartH = height ?? Math.max(n * rowH, 80);
  const labelW = showXAxis && !labelInside ? Math.min(width * 0.32, Math.max(0, ...labels.map((l) => estimateTextWidth(l, 12))) + 12) : 0;
  const variantOf = (key: string) => config[key]?.variant ?? fillVariant;

  const totals = data.map((d) => visible.reduce((sum, s) => sum + Math.max(0, num(d[s.key])), 0));
  const peak = stacked ? Math.max(1, ...totals) : Math.max(1, ...data.map((d) => Math.max(0, ...visible.map((s) => num(d[s.key])))));
  const valueW = showLabels ? estimateTextWidth(formatValue(peak), 12) + 10 : 4;
  const plotW = Math.max(width - labelW - valueW, 10);
  const bandH = chartH / Math.max(n, 1);
  const groupH = Math.min(bandH * (1 - clamp(categoryGap, 0, 0.9)), maxBarSize * (stacked ? 1 : Math.max(visible.length, 1)));
  const xOf = (v: number) => labelW + (Math.max(v, 0) / peak) * plotW;

  const shapes: Shape[] = [];
  data.forEach((d, i) => {
    let cum = 0;
    series.forEach((s) => {
      const vi = visible.indexOf(s);
      const v = hidden[s.key] ? 0 : Math.max(0, num(d[s.key]));
      let y: number;
      let h: number;
      if (stacked) {
        h = groupH;
        y = i * bandH + (bandH - h) / 2;
      } else {
        const count = Math.max(visible.length, 1);
        const each = (groupH - barGap * (count - 1)) / count;
        const start = i * bandH + (bandH - groupH) / 2;
        y = vi === -1 ? start : start + vi * (each + barGap);
        h = vi === -1 ? 0 : each;
      }
      const x0 = xOf(cum);
      const x1 = xOf(cum + v);
      const outer = stacked ? visible[visible.length - 1]?.key === s.key : true;
      const corners = stacked
        ? { tl: 0, bl: 0, tr: outer ? radius : 0, br: outer ? radius : 0 }
        : { tl: radius, tr: radius, br: radius, bl: radius };
      const color = getColor?.(num(d[s.key]), i, s.key) ?? (num(d[s.key]) < 0 && negativeColor ? negativeColor : s.color);
      shapes.push({
        id: `${s.key}-${i}`,
        key: s.key,
        type: "bar",
        index: i,
        d: roundedRect(x0, y, x1 - x0, h, corners),
        collapsed: roundedRect(labelW, y, 0, h, corners),
        color,
        fill: color !== s.color ? color : fillUrl(`${s.key}-h`, variantOf(s.key), color, "bar"),
      });
      if (stacked) cum += v;
    });
  });

  const { paths, alt, progress } = useMorphPaths(shapes.map((s) => s.d), shapes.map((s) => s.collapsed), { animate });
  if (!n) return <EmptyState height={chartH} text={props.emptyText ?? "No data"} />;

  const select = (y: number, hover = false) => {
    const i = clamp(Math.floor(y / bandH), 0, n - 1);
    const next = !hover && active === i ? null : i;
    if (next !== active && next !== null && !hover) theme.haptics?.();
    setActive(next);
    onSelect?.(next, next === null ? null : data[next]);
  };

  return (
    <View>
      <View style={{ width, height: chartH }}>
        <Svg width={width} height={chartH}>
          <Defs>
            {series.map((s) => (
              <React.Fragment key={s.key}>
                <SeriesFill id={`${s.key}-h`} color={s.color} variant={variantOf(s.key)} kind="bar" />
                {glow ? <GlowFilter id={`${s.key}-h`} blur={5} /> : null}
              </React.Fragment>
            ))}
          </Defs>
          <BackgroundPattern variant={backgroundVariant} x={labelW} y={0} width={plotW} height={chartH} color={theme.mutedForeground} />
          {showGrid
            ? [0, 0.25, 0.5, 0.75, 1].map((t) => (
                <Line key={t} x1={labelW + t * plotW} x2={labelW + t * plotW} y1={0} y2={chartH} stroke={theme.border} />
              ))
            : null}
          {active !== null ? (
            <Rect x={0} y={active * bandH + 1} width={width} height={bandH - 2} rx={6} fill={theme.muted} opacity={0.8} />
          ) : null}
          {glow
            ? shapes.map((s, i) => (
                <AnimatedPath key={`gl-${s.id}`} d={alt[i] as any} fill={s.color} opacity={0.5} filter={glowUrl(`${s.key}-h`)} />
              ))
            : null}
          {shapes.map((s, i) => (
            <AnimatedPath
              key={s.id}
              d={paths[i] as any}
              fill={s.fill}
              fillOpacity={solidOpacity(variantOf(s.key), "bar")}
              opacity={active !== null && active !== s.index ? 0.45 : 1}
            />
          ))}
          {data.map((d, i) => {
            const cy = i * bandH + bandH / 2;
            return (
              <G key={`row-${i}`}>
                {labelW ? (
                  <SvgText x={labelW - 10} y={cy + 4} fontSize={12} fill={active === i ? theme.foreground : theme.mutedForeground} fontWeight={active === i ? "500" : "400"} textAnchor="end" fontFamily={theme.fontFamily}>
                    {labels[i]}
                  </SvgText>
                ) : null}
                {labelInside ? (
                  <SvgText x={labelW + 10} y={cy + 4} fontSize={12} fontWeight="500" fill={theme.dark ? "#09090B" : "#FFFFFF"} fontFamily={theme.fontFamily}>
                    {labels[i]}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
          {showLabels ? (
            <AnimatedG opacity={progress}>
              {data.map((d, i) => (
                <SvgText
                  key={`v-${i}`}
                  x={xOf(stacked ? totals[i] : Math.max(0, ...visible.map((s) => num(d[s.key])))) + 6}
                  y={i * bandH + bandH / 2 + 4}
                  fontSize={12}
                  fontWeight="500"
                  fill={theme.foreground}
                  fontFamily={theme.fontFamily}
                >
                  {formatValue(stacked ? totals[i] : Math.max(0, ...visible.map((s) => num(d[s.key]))))}
                </SvgText>
              ))}
            </AnimatedG>
          ) : null}
        </Svg>
        <TouchLayer onTap={(_, y) => select(y)} onHover={(_, y) => select(y, true)} onHoverEnd={() => setActive(null)} />
        {showTooltip ? (
          <ChartTooltip
            visible={active !== null}
            x={active === null ? 0 : xOf(stacked ? totals[active] : peak * 0.5)}
            y={active === null ? 0 : active * bandH + bandH / 2 - 6}
            boundsWidth={width}
            boundsHeight={chartH}
            title={hideTooltipLabel || active === null ? undefined : labels[active]}
            indicator={tooltipIndicator}
            variant={tooltipVariant}
            roundness={tooltipRoundness}
            items={active === null ? [] : visible.map((s) => ({ key: s.key, label: s.label, color: s.color, value: formatValue(num(data[active][s.key]), s.key) }))}
            footer={showTooltipTotal && active !== null ? { label: "Total", value: formatValue(totals[active]) } : undefined}
          />
        ) : null}
      </View>
      {showLegend ? (
        <ChartLegend items={series} hidden={hidden} variant={legendVariant} align={legendAlign} onToggle={legendToggle ? (k) => setHidden((p) => ({ ...p, [k]: !p[k] })) : undefined} />
      ) : null}
    </View>
  );
}

const placeholder = (p: { height?: number; showLegend?: boolean; showBrush?: boolean }) =>
  (p.height ?? 220) + (p.showLegend ? 32 : 0) + (p.showBrush ? 60 : 0);

export const AreaSeriesChart = responsive<AreaChartProps>((p) => <CartesianRoot {...p} kind="area" />, placeholder);
export const LineSeriesChart = responsive<LineChartProps>((p) => <CartesianRoot {...p} kind="line" />, placeholder);
export const BarSeriesChart = responsive<BarChartProps>((p) => <CartesianRoot {...p} kind="bar" />, placeholder);
export const ComboChart = responsive<ComboChartProps>((p) => <CartesianRoot {...p} kind="combo" />, placeholder);
