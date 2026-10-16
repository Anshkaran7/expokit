import React from "react";
import { StyleSheet, Text, View } from "react-native";
import PieChart from "./PieChart";
import type { DonutChartProps } from "./types";

const DonutChart: React.FC<DonutChartProps> = ({
  centerValue,
  centerLabel,
  centerTextColor = "#0F172A",
  centerLabelColor = "#64748B",
  donutRadius = 62,
  height = 300,
  width = 300,
  ...pieProps
}) => {
  return (
    <View style={[styles.container, { width }]}>
      <PieChart
        {...pieProps}
        donutRadius={donutRadius}
        height={height}
        showLabels={pieProps.showLabels ?? false}
        width={width}
      />
      <View pointerEvents="none" style={[styles.center, { height, width }]}>
        {centerValue !== undefined ? (
          <Text style={[styles.centerValue, { color: centerTextColor }]}>
            {centerValue}
          </Text>
        ) : null}
        {centerLabel ? (
          <Text style={[styles.centerLabel, { color: centerLabelColor }]}>
            {centerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
  },
  centerLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },
  centerValue: {
    fontSize: 28,
    fontWeight: "500",
  },
  container: {
    alignItems: "center",
  },
});

export default DonutChart;
