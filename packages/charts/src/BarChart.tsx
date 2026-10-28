import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Line,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { fillWidth } from "./internal";
import type { BarChartProps } from "./types";

const BarChart: React.FC<BarChartProps> = ({
  data = [],
  width = 0,
  height = 220,
  primaryColor = "#2563EB",
  secondaryColor = "#7C3AED",
  labelColor = "#334155",
  axisColor = "#E2E8F0",
  backgroundColor = "#FFFFFF",
  title = "",
  animate = true,
  showGrid = true,
  gridCount = 4,
  formatValue = (value) => value.toString(),
  formatLabel = (index) => (index + 1).toString(),
  getBarColor,
  onBarPress = () => {},
  showXAxisLabels = true,
  showYAxisLabels = true,
  style = {},

  selectedIndex: controlledSelectedIndex,
}) => {
  const [selectedBar, setSelectedBar] = useState<number | null>(
    controlledSelectedIndex ?? null,
  );
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [animate, data, fadeAnim]);

  useEffect(() => {
    if (controlledSelectedIndex !== undefined) {
      setSelectedBar(controlledSelectedIndex);
    }
  }, [controlledSelectedIndex]);

  if (!data.length) return <Text style={styles.noData}>No data available</Text>;

  const maxValue = Math.max(1, ...data.map((v) => (v > 0 ? v : 0)));
  const padding = { top: 24, right: 18, bottom: 34, left: 46 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = chartWidth / data.length;
  const barWidth = Math.max(16, slotWidth * 0.58);
  const gradientId = `barGradient-${primaryColor.replace(/[^a-zA-Z0-9]/g, "")}`;

  const selectBar = (value: number, index: number) => {
    setSelectedBar(selectedBar === index ? null : index);
    onBarPress(value, index);
  };

  const a11yLabel = title || "Bar chart";

  return (
    <View
      style={[styles.container, { backgroundColor }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      {title ? (
        <Text style={[styles.title, { color: labelColor }]}>{title}</Text>
      ) : null}
      <Animated.View style={{ opacity: fadeAnim }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primaryColor} stopOpacity="1" />
              <Stop offset="1" stopColor={secondaryColor} stopOpacity="0.62" />
            </LinearGradient>
          </Defs>
          {showGrid &&
            Array.from({ length: gridCount + 1 }).map((_, index) => {
              const y = padding.top + (index / gridCount) * chartHeight;
              const value = maxValue - (index / gridCount) * maxValue;

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
                      x={padding.left - 8}
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
          {data.map((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x =
              padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = padding.top + chartHeight - barHeight;
            const isSelected = selectedBar === index;
            const color = getBarColor?.(value, index) ?? `url(#${gradientId})`;

            return (
              <G key={`bar-${index}`}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={7}
                  fill={color}
                  opacity={selectedBar === null || isSelected ? 1 : 0.42}
                  onPress={() => selectBar(value, index)}
                />
                <Rect
                  x={padding.left + index * slotWidth}
                  y={padding.top}
                  width={slotWidth}
                  height={chartHeight}
                  fill="transparent"
                  onPress={() => selectBar(value, index)}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 8}
                  fill={labelColor}
                  fontSize={10}
                  fontWeight="500"
                  textAnchor="middle"
                  opacity={selectedBar === null || isSelected ? 1 : 0.45}
                >
                  {formatValue(value)}
                </SvgText>
                {showXAxisLabels ? (
                  <SvgText
                    x={x + barWidth / 2}
                    y={height - 12}
                    fill={labelColor}
                    fontSize={11}
                    textAnchor="middle"
                  >
                    {formatLabel(index)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 12,
  },
  noData: {
    color: "#64748B",
    marginVertical: 20,
    textAlign: "center",
  },
});

// Without a `width`, fills its container (rotation, foldables and tablets included).
export default fillWidth(BarChart, 220);
