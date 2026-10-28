import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
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
import { SvgTooltip, TouchLayer, clamp, labelStep, fillWidth } from "./internal";
import type { LineChartProps } from "./types";

// Module-level defaults keep identities stable so the memoized layers below
// are not rebuilt on every selection change.
const EMPTY: number[] = [];
const defaultFormatValue = (value: number) => value.toString();
const defaultFormatLabel = (index: number) => (index + 1).toString();
const PADDING = { top: 24, right: 18, bottom: 34, left: 54 };

const LineChart: React.FC<LineChartProps> = ({
  data = EMPTY,
  width = 0,
  height = 250,
  lineColor = "#2563EB",
  accentColor = "#7C3AED",
  labelColor = "#334155",
  axisColor = "#E2E8F0",
  backgroundColor = "#FFFFFF",
  title = "",
  subtitle = "",
  animate = true,
  showGrid = true,
  gridCount = 4,
  showDots = true,
  showArea = true,
  formatValue = defaultFormatValue,
  formatLabel = defaultFormatLabel,
  onPointPress,
  style = {},
  showXAxisLabels = true,
  showYAxisLabels = true,
  tooltipBackgroundColor = accentColor,
  selectedIndex: controlledSelectedIndex,
}) => {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(
    controlledSelectedIndex ?? null
  );
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  // Whether onPointPress already fired during the current touch (tap re-fires it otherwise).
  const pressedInGesture = useRef(false);
  const padding = PADDING;
  const chartWidth = Math.max(width - padding.left - padding.right, 1);
  const chartHeight = Math.max(height - padding.top - padding.bottom, 1);
  const grid = Math.max(1, Math.round(gridCount) || 1);
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

  useEffect(() => {
    if (controlledSelectedIndex !== undefined) {
      setSelectedPoint(controlledSelectedIndex);
    }
  }, [controlledSelectedIndex]);

  const geometry = useMemo(() => {
    const hi = values.length ? Math.max(...values) : 1;
    const lo = values.length ? Math.min(...values) : 0;
    // 8% headroom away from the data on both sides, also for negative values.
    let maxValue = hi >= 0 ? hi * 1.08 : hi * 0.92;
    let minValue = lo >= 0 ? lo * 0.92 : lo * 1.08;
    if (maxValue === minValue) {
      maxValue += 1;
      minValue = Math.min(minValue, 0);
    }
    const range = maxValue - minValue;
    const step = chartWidth / Math.max(values.length - 1, 1);
    const points = values.map((value, index) => ({
      value,
      // A single point sits in the middle instead of hugging the y axis.
      x: padding.left + (values.length === 1 ? chartWidth / 2 : index * step),
      y: padding.top + chartHeight - ((value - minValue) / range) * chartHeight,
    }));
    const linePath = points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const controlX = previous.x + (point.x - previous.x) / 2;
      return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    }, "");
    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`
        : "";

    return { areaPath, linePath, maxValue, minValue, points, range, step };
  }, [chartHeight, chartWidth, values, height]);

  const gradientId = `lineAreaGradient-${lineColor.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Everything that does not depend on the selection, so scrubbing only redraws the overlay.
  const staticLayer = useMemo(() => {
    const xEvery = labelStep(geometry.points.length, chartWidth, 36);
    return (
      <>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.26" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {showGrid &&
          Array.from({ length: grid + 1 }).map((_, index) => {
            const y = padding.top + (index / grid) * chartHeight;
            const value = geometry.maxValue - (index / grid) * geometry.range;

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
        {showArea && geometry.areaPath ? (
          <Path d={geometry.areaPath} fill={`url(#${gradientId})`} />
        ) : null}
        {geometry.points.length > 1 ? (
          <Path
            d={geometry.linePath}
            fill="none"
            stroke={lineColor}
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
                stroke={lineColor}
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
    lineColor,
    showGrid,
    grid,
    chartHeight,
    chartWidth,
    width,
    height,
    axisColor,
    showYAxisLabels,
    labelColor,
    formatValue,
    formatLabel,
    showArea,
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
            <G>
              <Line
                x1={selected.x}
                x2={selected.x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={accentColor}
                strokeDasharray="4 5"
                strokeWidth={1.5}
              />
              <Circle
                cx={selected.x}
                cy={selected.y}
                r={6}
                fill={accentColor}
                stroke={lineColor}
                strokeWidth={3}
              />
              <SvgTooltip
                x={selected.x}
                y={selected.y - 6}
                lines={[formatValue(selected.value)]}
                boundsWidth={width}
                boundsHeight={height}
                background={tooltipBackgroundColor}
                color="#FFFFFF"
                fontSize={12}
              />
            </G>
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
  title: {
    fontSize: 18,
    fontWeight: "500",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.72,
  },
  noData: {
    color: "#64748B",
    marginVertical: 20,
    textAlign: "center",
  },
});

// Without a `width`, fills its container (rotation, foldables and tablets included).
export default fillWidth(LineChart, 250);
