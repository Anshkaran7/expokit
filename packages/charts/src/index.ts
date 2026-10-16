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
  Datum,
} from "./CartesianCharts";
export { PieSeriesChart, RadialSeriesChart } from "./CircularCharts";
export type { PieSeriesChartProps, RadialSeriesChartProps } from "./CircularCharts";
export { readableTextColor } from "./kit";

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
