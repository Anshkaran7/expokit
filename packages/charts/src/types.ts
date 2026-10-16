import type { StyleProp, ViewStyle } from "react-native";

export interface ChartPoint {
  label: string;
  value: number;
  color?: string;
}

export interface CartesianChartProps {
  data: number[];
  width?: number;
  height?: number;
  labelColor?: string;
  axisColor?: string;
  backgroundColor?: string;
  title?: string;
  animate?: boolean;
  showGrid?: boolean;
  gridCount?: number;
  formatValue?: (value: number) => string;
  formatLabel?: (index: number) => string;
  showXAxisLabels?: boolean;
  showYAxisLabels?: boolean;
  style?: object;
}

export interface BarChartProps extends CartesianChartProps {
  primaryColor?: string;
  secondaryColor?: string;
  getBarColor?: (value: number, index: number) => string;
  onBarPress?: (value: number, index: number) => void;
  /**
   * Optional controlled highlight. When set, the chart syncs selection from this prop;
   * presses still toggle local state and call `onBarPress` — pair with state if you need
   * full control. Omit for uncontrolled-only selection.
   */
  selectedIndex?: number | null;
}

export interface LineChartProps extends CartesianChartProps {
  lineColor?: string;
  accentColor?: string;
  subtitle?: string;
  showDots?: boolean;
  showArea?: boolean;
  onPointPress?: (value: number, index: number) => void;
  selectedIndex?: number | null;
  tooltipBackgroundColor?: string;
}

export interface AreaChartProps extends CartesianChartProps {
  color?: string;
  accentColor?: string;
  subtitle?: string;
  showDots?: boolean;
  onPointPress?: (value: number, index: number) => void;
}

export interface PieChartProps {
  data: ChartPoint[];
  width?: number;
  height?: number;
  colors?: string[];
  strokeWidth?: number;
  animate?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  showPercentages?: boolean;
  donutRadius?: number;
  selectedOffset?: number;
  labelColor?: string;
  legendTextColor?: string;
  onSegmentPress?: (item: ChartPoint, index: number) => void;
  style?: object;
}

export interface DonutChartProps extends PieChartProps {
  centerValue?: string | number;
  centerLabel?: string;
  centerTextColor?: string;
  centerLabelColor?: string;
}

// ---------------------------------------------------------------------------
// v1.1 charts. All of these fill their parent's width when `width` is omitted.
// ---------------------------------------------------------------------------

export interface ChartTheme {
  /** Axis labels, legends and secondary text. */
  labelColor?: string;
  /** Grid lines, tracks and empty cells. */
  gridColor?: string;
  tooltipBackground?: string;
  tooltipTextColor?: string;
}

export interface BaseChartProps extends ChartTheme {
  /** Fixed width. Omit to fill the parent (recommended for responsive layouts). */
  width?: number;
  height?: number;
  animate?: boolean;
  formatValue?: (value: number) => string;
  style?: StyleProp<ViewStyle>;
  /** Series colours. Defaults to the ChartProvider palette. */
  palette?: string[];
}

export interface ScrubProps {
  /** Fired when a horizontal drag starts; disable the parent ScrollView here. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export interface LineSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface MultiLineChartProps extends BaseChartProps, ScrubProps {
  series: LineSeries[];
  labels?: string[];
  curved?: boolean;
  showArea?: boolean;
  showLegend?: boolean;
  /** Value header above the chart that follows your finger. */
  showHeader?: boolean;
  yTickCount?: number;
  onSelect?: (index: number | null) => void;
}

export interface StackedBarDatum {
  label: string;
  values: number[];
}

export interface StackedBarChartProps extends BaseChartProps {
  data: StackedBarDatum[];
  keys: { name: string; color?: string }[];
  mode?: "stacked" | "grouped";
  showLegend?: boolean;
  yTickCount?: number;
  onSelect?: (index: number | null) => void;
}

export interface HorizontalBarChartProps extends BaseChartProps {
  data: ChartPoint[];
  colors?: string[];
  sort?: boolean;
  rowHeight?: number;
  maxValue?: number;
  onSelect?: (item: ChartPoint | null, index: number | null) => void;
}

export interface RadarChartProps extends BaseChartProps {
  axes: string[];
  series: LineSeries[];
  maxValue?: number;
  levels?: number;
  showLegend?: boolean;
  gridType?: "polygon" | "circle";
  showGrid?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
  showDots?: boolean;
  glow?: boolean;
  dotVariant?: "default" | "border" | "colored-border" | "none";
  onSelect?: (axisIndex: number | null) => void;
}

export interface ProgressRing {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export interface ProgressRingsProps extends BaseChartProps {
  rings: ProgressRing[];
  /** Diameter of the rings. Defaults to min(width, 220). */
  size?: number;
  strokeWidth?: number;
  gap?: number;
  centerTitle?: string;
  centerSubtitle?: string;
  showLegend?: boolean;
  onSelect?: (ring: ProgressRing | null, index: number | null) => void;
}

export interface GaugeSegment {
  /** Upper bound of this band (inclusive). */
  to: number;
  color: string;
}

export interface GaugeChartProps extends BaseChartProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  color?: string;
  segments?: GaugeSegment[];
  thickness?: number;
  showNeedle?: boolean;
  /** Let the user drag the gauge to change the value. */
  interactive?: boolean;
  step?: number;
  onChange?: (value: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  label?: string;
}

export interface CandlestickChartProps extends BaseChartProps, ScrubProps {
  data: Candle[];
  upColor?: string;
  downColor?: string;
  showVolume?: boolean;
  showHeader?: boolean;
  onSelect?: (index: number | null) => void;
}

export interface HeatmapChartProps extends BaseChartProps {
  /** rows × columns */
  data: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  color?: string;
  gap?: number;
  maxCellSize?: number;
  showScale?: boolean;
  onSelect?: (cell: { row: number; col: number; value: number } | null) => void;
}

export interface FunnelChartProps extends BaseChartProps {
  data: ChartPoint[];
  colors?: string[];
  stageHeight?: number;
  showConversion?: boolean;
  onSelect?: (item: ChartPoint | null, index: number | null) => void;
}

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  showArea?: boolean;
  /** Pulsing dot on the latest value. */
  showLastDot?: boolean;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  palette?: string[];
}
