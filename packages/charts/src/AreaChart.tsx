import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { TouchLayer, clamp, labelStep } from "./internal";
import type { AreaChartProps } from "./types";

// Module-level defaults keep identities stable for the memoized layers below.
const EMPTY: number[] = [];
const defaultFormatValue = (value: number) => value.toString();
const defaultFormatLabel = (index: number) => (index + 1).toString();
const PADDING = { top: 24, right: 18, bottom: 34, left: 54 };

const AreaChart: React.FC<AreaChartProps> = ({
  data = EMPTY,
  width = Dimensions.get("window").width - 40,
  height = 250,
  color = "#2563EB",
  accentColor = "#7C3AED",
  labelColor = "#334155",
  axisColor = "#E2E8F0",
  backgroundColor = "#FFFFFF",
  title = "",
  subtitle = "",
  animate = true,
  showGrid = true,
  showDots = true,
  formatValue = defaultFormatValue,
  formatLabel = defaultFormatLabel,
  onPointPress,
  style = {},
  showXAxisLabels = true,
  showYAxisLabels = true,
}) => {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const pressedInGesture = useRef(false);
  const padding = PADDING;
  const chartWidth = Math.max(width - padding.left - padding.right, 1);
  const chartHeight = Math.max(height - padding.top - padding.bottom, 1);
  const gradientId = `areaGradient-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  // Non-finite values would put NaN into SVG paths (CoreGraphics warnings on iOS).
  const values = useMemo(() => data.map((value) => (Number.isFinite(value) ? value : 0)), [data]);
  const dataKey = values.join(",");

  useEffect(() => {
    if (!animate) {
      fadeAnim.setValue(1);
      return;
    }
    fadeAnim.setValue(0);
    // Opacity of a plain View, so the native driver is safe here.
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, dataKey, fadeAnim]);

  const geometry = useMemo(() => {
    // The area fills down to zero, so the domain always includes it.
    const hi = Math.max(0, ...values);
    const lo = Math.min(0, ...values);
    let maxValue = hi * 1.08;
    const minValue = lo * 1.08;
    if (maxValue === minValue) maxValue = 1;
    const range = maxValue - minValue;
    const toY = (value: number) =>
      padding.top + chartHeight - ((value - minValue) / range) * chartHeight;
    const step = chartWidth / Math.max(values.length - 1, 1);
    const points = values.map((value, index) => ({
      value,
      x: padding.left + (values.length === 1 ? chartWidth / 2 : index * step),
      y: toY(value),
    }));
    const linePath = points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const controlX = previous.x + (point.x - previous.x) / 2;
      return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    }, "");
    const baseline = toY(0);
    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : "";

    return { areaPath, linePath, maxValue, range, points, step };
  }, [chartHeight, chartWidth, values]);

  // Selection-independent layers: only the highlighted dot re-renders while scrubbing.
  const staticLayer = useMemo(() => {
    const xEvery = labelStep(geometry.points.length, chartWidth, 36);
    return (
      <>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.38" />
            <Stop offset="1" stopColor={color} stopOpacity="0.04" />
          </LinearGradient>
        </Defs>
        {showGrid &&
          Array.from({ length: 5 }).map((_, index) => {
            const y = padding.top + (index / 4) * chartHeight;
            const value = geometry.maxValue - (index / 4) * geometry.range;

            return (
              <G key={`grid-${index}`}>
                <Line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke={axisColor}
                  strokeDasharray="4 6"
                  strokeWidth={1}
                />
                {showYAxisLabels ? (
                  <SvgText
                    x={padding.left - 10}
                    y={y + 4}
                    fill={labelColor}
                    fontSize={10}
                    textAnchor="end"
                  >
                    {formatValue(value)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        {geometry.areaPath ? <Path d={geometry.areaPath} fill={`url(#${gradientId})`} /> : null}
        {geometry.points.length > 1 ? (
          <Path
            d={geometry.linePath}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}
        {geometry.points.map((point, index) => (
          <G key={`point-${index}`}>
            {showDots || geometry.points.length === 1 ? (
              <Circle
                cx={point.x}
                cy={point.y}
                r={4}
                fill={backgroundColor}
                stroke={color}
                strokeWidth={3}
              />
            ) : null}
            {showXAxisLabels && index % xEvery === 0 ? (
              <SvgText
                x={point.x}
                y={height - 12}
                fill={labelColor}
                fontSize={11}
                textAnchor="middle"
              >
                {formatLabel(index)}
              </SvgText>
            ) : null}
          </G>
        ))}
      </>
    );
  }, [
    geometry,
    gradientId,
    color,
    showGrid,
    chartHeight,
    chartWidth,
    width,
    height,
    axisColor,
    showYAxisLabels,
    labelColor,
    formatValue,
    formatLabel,
    showDots,
    backgroundColor,
  ]);

  if (!values.length) return <Text style={styles.noData}>No data available</Text>;

  const pointAt = (x: number) =>
    values.length === 1 || !(geometry.step > 0)
      ? 0
      : clamp(Math.round((x - padding.left) / geometry.step), 0, values.length - 1);

  const selectPoint = (index: number, hover = false) => {
    // Scrubbing fires every frame: only re-render when the point actually changes.
    if (index === selectedPoint) return;
    setSelectedPoint(index);
    if (hover) return;
    pressedInGesture.current = true;
    onPointPress?.(values[index], index);
  };

  const selected =
    selectedPoint !== null && geometry.points[selectedPoint]
      ? geometry.points[selectedPoint]
      : null;

  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title ? <Text style={[styles.title, { color: labelColor }]}>{title}</Text> : null}
          {subtitle ? <Text style={[styles.subtitle, { color: labelColor }]}>{subtitle}</Text> : null}
        </View>
      )}
      <Animated.View style={{ opacity: fadeAnim, width, height }}>
        <Svg width={width} height={height}>
          {staticLayer}
          {selected ? (
            <Circle
              cx={selected.x}
              cy={selected.y}
              r={6}
              fill={accentColor}
              stroke={color}
              strokeWidth={3}
            />
          ) : null}
        </Svg>
        <TouchLayer
          scrub
          onMove={(x) => selectPoint(pointAt(x))}
          onTap={(x) => {
            // Tapping the already-selected point still reports the press.
            if (!pressedInGesture.current) {
              const index = pointAt(x);
              onPointPress?.(values[index], index);
            }
          }}
          onRelease={() => {
            pressedInGesture.current = false;
          }}
          onHover={(x) => selectPoint(pointAt(x), true)}
          onHoverEnd={() => {}}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 12,
  },
  header: {
    marginBottom: 12,
  },
  noData: {
    color: "#64748B",
    marginVertical: 20,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.72,
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
  },
});

export default AreaChart;
