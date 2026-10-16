import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import type { PieChartProps } from "./types";

const PieChart: React.FC<PieChartProps> = ({
  data = [],
  width = 300,
  height = 300,
  colors = ["#2563EB", "#7C3AED", "#10B981", "#F59E0B", "#EF4444"],
  strokeWidth = 2,
  animate = true,
  showLabels = true,
  showLegend = true,
  showPercentages = true,
  donutRadius = 0,
  selectedOffset = 12,
  labelColor = "#FFFFFF",
  legendTextColor = "#334155",
  onSegmentPress = () => {},
  style = {},
}) => {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const radius = Math.min(width, height) / 2 - 34;
  const centerX = width / 2;
  const centerY = height / 2;
  const innerRadius = donutRadius > 0 ? radius * (donutRadius / 100) : 0;

  useEffect(() => {
    if (!animate) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [animate, data, fadeAnim]);

  const arcPath = (
    startAngle: number,
    endAngle: number,
    offset: number
  ) => {
    const midAngle = startAngle + (endAngle - startAngle) / 2;
    const offsetX = Math.cos(midAngle) * offset;
    const offsetY = Math.sin(midAngle) * offset;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const outerStartX = centerX + offsetX + radius * Math.cos(startAngle);
    const outerStartY = centerY + offsetY + radius * Math.sin(startAngle);
    const outerEndX = centerX + offsetX + radius * Math.cos(endAngle);
    const outerEndY = centerY + offsetY + radius * Math.sin(endAngle);

    if (innerRadius > 0) {
      const innerEndX = centerX + offsetX + innerRadius * Math.cos(endAngle);
      const innerEndY = centerY + offsetY + innerRadius * Math.sin(endAngle);
      const innerStartX = centerX + offsetX + innerRadius * Math.cos(startAngle);
      const innerStartY = centerY + offsetY + innerRadius * Math.sin(startAngle);

      return `M ${outerStartX} ${outerStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`;
    }

    return `M ${centerX + offsetX} ${centerY + offsetY} L ${outerStartX} ${outerStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY} Z`;
  };

  const arcs = useMemo(() => {
    let startAngle = -Math.PI / 2;
    return data.map((item, index) => {
      const percentage = total ? (item.value / total) * 100 : 0;
      const angle = total ? (item.value / total) * Math.PI * 2 : 0;
      const endAngle = startAngle + angle;
      const midAngle = startAngle + angle / 2;
      const labelRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.66;
      const labelX = centerX + labelRadius * Math.cos(midAngle);
      const labelY = centerY + labelRadius * Math.sin(midAngle);
      const arc = {
        color: item.color ?? colors[index % colors.length],
        endAngle,
        labelX,
        labelY,
        percentage,
        startAngle,
        ...item,
      };
      startAngle = endAngle;
      return arc;
    });
  }, [colors, data, innerRadius, radius, total]);

  const selectSegment = (index: number) => {
    setSelectedSegment(selectedSegment === index ? null : index);
    onSegmentPress(data[index], index);
  };

  if (!data.length || total <= 0) return <Text style={styles.noData}>No data available</Text>;

  return (
    <Animated.View style={[styles.container, style, { opacity: fadeAnim }]}>
      <Svg width={width} height={height}>
        <G>
          {arcs.map((arc, index) => (
            <G key={`segment-${index}`}>
              <Path
                d={arcPath(
                  arc.startAngle,
                  arc.endAngle,
                  selectedSegment === index ? selectedOffset : 0
                )}
                fill={arc.color}
                stroke="#FFFFFF"
                strokeWidth={strokeWidth}
                onPress={() => selectSegment(index)}
              />
              {showLabels && arc.percentage >= 5 ? (
                <SvgText
                  x={arc.labelX}
                  y={arc.labelY + 4}
                  fill={labelColor}
                  fontSize={11}
                  fontWeight="500"
                  textAnchor="middle"
                >
                  {showPercentages ? `${arc.percentage.toFixed(0)}%` : arc.label}
                </SvgText>
              ) : null}
            </G>
          ))}
        </G>
      </Svg>
      {showLegend ? (
        <View style={styles.legend}>
          {arcs.map((arc, index) => (
            <TouchableOpacity
              key={`legend-${index}`}
              style={[
                styles.legendItem,
                selectedSegment === index && styles.legendItemSelected,
              ]}
              onPress={() => selectSegment(index)}
            >
              <View style={[styles.swatch, { backgroundColor: arc.color }]} />
              <Text style={[styles.legendText, { color: legendTextColor }]}>
                {showPercentages
                  ? `${arc.label} (${arc.percentage.toFixed(1)}%)`
                  : arc.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
  },
  legendItem: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  legendItemSelected: {
    backgroundColor: "rgba(148, 163, 184, 0.18)",
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  noData: {
    color: "#64748B",
    marginVertical: 20,
    textAlign: "center",
  },
  swatch: {
    borderRadius: 5,
    height: 10,
    marginRight: 6,
    width: 10,
  },
});

export default PieChart;
