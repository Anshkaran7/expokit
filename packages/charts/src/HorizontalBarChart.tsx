import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import {
  AnimatedRect,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  responsive,
  useAnimatedValues,
} from "./internal";
import type { HorizontalBarChartProps } from "./types";

type Props = HorizontalBarChartProps & { width: number };

const HorizontalBarChartInner = ({
  data = [],
  palette = DEFAULT_PALETTE,
  colors = palette,
  sort = true,
  rowHeight = 36,
  maxValue,
  width,
  animate = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  onSelect,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo(() => {
    const withColor = data.map((item, index) => ({
      ...item,
      color: item.color ?? colors[index % colors.length],
      originalIndex: index,
    }));
    return sort ? withColor.slice().sort((a, b) => b.value - a.value) : withColor;
  }, [data, colors, sort]);

  const peak = maxValue ?? Math.max(1, ...rows.map((row) => row.value));
  const labelWidth = Math.min(
    width * 0.36,
    Math.max(0, ...rows.map((row) => estimateTextWidth(row.label, 12))) + 16
  );
  const valueWidth =
    Math.max(0, ...rows.map((row) => estimateTextWidth(formatValue(row.value), 12))) + 12;
  const barLeft = labelWidth;
  const barWidth = Math.max(width - labelWidth - valueWidth, 20);
  const barHeight = Math.min(rowHeight * 0.5, 16);
  const height = rows.length * rowHeight;

  const fractions = useAnimatedValues(
    rows.map((row) => clamp(row.value / peak, 0, 1)),
    { animate, duration: 800, delay: (index) => index * 70 }
  );

  if (!rows.length) return <Text style={{ color: labelColor, textAlign: "center" }}>No data</Text>;

  const select = (y: number, hover = false) => {
    const index = clamp(Math.floor(y / rowHeight), 0, rows.length - 1);
    const next = !hover && index === selected ? null : index;
    setSelected(next);
    onSelect?.(next === null ? null : data[rows[next].originalIndex], next === null ? null : rows[next].originalIndex);
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {rows.map((row, index) => {
          const centerY = index * rowHeight + rowHeight / 2;
          const dimmed = selected !== null && selected !== index;
          return (
            <G key={`${row.label}-${row.originalIndex}`} opacity={dimmed ? 0.35 : 1}>
              <SvgText
                x={labelWidth - 10}
                y={centerY + 4}
                fontSize={12}
                fontWeight={selected === index ? "500" : "400"}
                fill={labelColor}
                textAnchor="end"
              >
                {row.label}
              </SvgText>
              <Rect
                x={barLeft}
                y={centerY - barHeight / 2}
                width={barWidth}
                height={barHeight}
                rx={barHeight / 2}
                fill={gridColor}
                opacity={0.6}
              />
              <AnimatedRect
                x={barLeft}
                y={centerY - barHeight / 2}
                width={fractions[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, barWidth],
                })}
                height={barHeight}
                rx={barHeight / 2}
                fill={row.color}
              />
              <SvgText
                x={width - 2}
                y={centerY + 4}
                fontSize={12}
                fontWeight="500"
                fill={selected === index ? row.color : labelColor}
                textAnchor="end"
              >
                {formatValue(row.value)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <TouchLayer onTap={(_, y) => select(y)} onHover={(_, y) => select(y, true)} onHoverEnd={() => setSelected(null)} />
    </View>
  );
};

const HorizontalBarChart = responsive<HorizontalBarChartProps>(
  HorizontalBarChartInner,
  (props) => (props.data?.length ?? 0) * (props.rowHeight ?? 36)
);

export default HorizontalBarChart;
