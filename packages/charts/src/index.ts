export { default as BarChart } from "./BarChart";
export { default as LineChart } from "./LineChart";
export { default as PieChart } from "./PieChart";
export { default as DonutChart } from "./DonutChart";
export { default as AreaChart } from "./AreaChart";
export * from "./types";
export { default as MultiLineChart } from "./MultiLineChart";
export { default as StackedBarChart } from "./StackedBarChart";
export { default as HorizontalBarChart } from "./HorizontalBarChart";
export { default as RadarChart } from "./RadarChart";
export { default as ProgressRings } from "./ProgressRings";
export { default as GaugeChart } from "./GaugeChart";
export { default as CandlestickChart } from "./CandlestickChart";
export { default as HeatmapChart } from "./HeatmapChart";
export { default as FunnelChart } from "./FunnelChart";
export { default as Sparkline } from "./Sparkline";

// v1.2 — shadcn-style charts: `data` rows + `config` describing the series.
export * from "./theme";
export {
  ChartCard,
  ChartLegend,
  ChartTooltip,
  TrendIcon,
  buildPath,
  roundedRect,
  sector,
} from "./kit";
export type { ChartConfig, CurveType, TooltipIndicator, TooltipItem, ChartCardProps } from "./kit";
export { AreaSeriesChart, LineSeriesChart, BarSeriesChart, ComboChart } from "./CartesianCharts";
export type {
  AreaChartProps as AreaSeriesChartProps,
  LineChartProps as LineSeriesChartProps,
  BarChartProps as BarSeriesChartProps,
  ComboChartProps,
  CartesianBaseProps,
  ReferenceLine,
  Datum,
} from "./CartesianCharts";
export { PieSeriesChart, RadialSeriesChart } from "./CircularCharts";
export type { PieSeriesChartProps, RadialSeriesChartProps } from "./CircularCharts";
export { readableTextColor } from "./kit";

// Mobile dashboard charts: native-thread animation (capsule bars, tick bars, fan gauge, mini rings).
export { PillBarChart, TickBarChart, FanGauge, MiniRing, mixColor } from "./NativeCharts";
export type { BarDatum, PillBarChartProps, TickBarChartProps, FanGaugeProps, MiniRingProps } from "./NativeCharts";
export * from "./mobile/BarList";
export * from "./mobile/SegmentedBar";
export * from "./mobile/RangeBarChart";
export * from "./mobile/WaffleChart";
export * from "./mobile/CalendarHeatmap";
export * from "./mobile/DivergingBarChart";
export * from "./mobile/TickRing";
export * from "./mobile/LiquidGauge";
export * from "./mobile/StackedPillChart";
export * from "./mobile/StatCard";
export * from "./mobile/PriceChart";
export * from "./mobile/GoalBars";
export * from "./mobile/ActivityRings";
export * from "./mobile/BeadChart";
export * from "./mobile/ScoreGauge";
export * from "./mobile/Donut3D";
export * from "./mobile/CylinderBarChart";

export * from "./styles";

// Building blocks for registry charts (Pro charts installed with the CLI: polar-area, isometric-bar,
// pixel-bar, treemap, waterfall, bullet, timeline). Their source is copied into the app and builds
// on these, so the charts look and behave exactly like the built-in ones.
export {
  AnimatedPath,
  AnimatedRect,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  labelStep,
  niceTicks,
  responsive,
  useAnimatedValues,
  useReducedMotion,
} from "./internal";
export { useMorphPaths } from "./kit";
export type { Corners } from "./kit";

import { AreaSeriesChart, BarSeriesChart, ComboChart, LineSeriesChart } from "./CartesianCharts";
import { PieSeriesChart, RadialSeriesChart } from "./CircularCharts";
import RadarChart from "./RadarChart";
import { ChartCard, ChartLegend, ChartTooltip } from "./kit";

/** Namespace for the shadcn-style API: <Chart.Area data config xKey />. */
export const Chart = {
  Area: AreaSeriesChart,
  Line: LineSeriesChart,
  Bar: BarSeriesChart,
  Combo: ComboChart,
  Pie: PieSeriesChart,
  Radial: RadialSeriesChart,
  Radar: RadarChart,
  Card: ChartCard,
  Legend: ChartLegend,
  Tooltip: ChartTooltip,
};
