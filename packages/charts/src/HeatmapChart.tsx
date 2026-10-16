import React, { useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import {
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  SvgTooltip,
  TouchLayer,
  compactNumber,
  estimateTextWidth,
  responsive,
  useEntrance,
} from "./internal";
import type { HeatmapChartProps } from "./types";

type Props = HeatmapChartProps & { width: number };

const HeatmapChartInner = ({
  data = [],
  rowLabels,
  colLabels,
  palette = DEFAULT_PALETTE,
  color = palette[0],
  gap = 3,
  maxCellSize = 30,
  showScale = true,
  width,
  animate = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  tooltipBackground = DEFAULT_THEME.tooltipBackground,
  tooltipTextColor = DEFAULT_THEME.tooltipTextColor,
  onSelect,
}: Props) => {
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const rows = data.length;
  const cols = Math.max(0, ...data.map((row) => row.length));
  const progress = useEntrance(animate, data.map((row) => row.join(",")).join("|"), 700, true);

  const labelWidth = rowLabels
    ? Math.max(...rowLabels.map((label) => estimateTextWidth(label, 10))) + 10
    : 0;
  const top = colLabels ? 16 : 0;
  const cell = Math.max(
    4,
    Math.min(maxCellSize, (width - labelWidth - gap * (cols - 1)) / Math.max(cols, 1))
  );
  const gridWidth = cols * cell + (cols - 1) * gap;
  const left = labelWidth + Math.max(0, (width - labelWidth - gridWidth) / 2);
  const height = top + rows * cell + (rows - 1) * gap;
  const values = data.reduce<number[]>((acc, row) => acc.concat(row), []);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const intensity = (v: number) => (hi === lo ? 1 : (v - lo) / (hi - lo));
  const colEvery = Math.max(1, Math.ceil(28 / (cell + gap)));

  // Static grid, rebuilt only when data/size/colours change — taps just redraw the overlay.
  const grid = useMemo(
    () => (
      <Svg width={width} height={height}>
        {colLabels?.map((label, col) =>
          col % colEvery === 0 ? (
            <SvgText key={`c-${col}`} x={left + col * (cell + gap)} y={10} fontSize={10} fill={labelColor}>
              {label}
            </SvgText>
          ) : null
        )}
        {rowLabels?.map((label, row) => (
          <SvgText key={`r-${row}`} x={left - 6} y={top + row * (cell + gap) + cell / 2 + 3.5} fontSize={10} fill={labelColor} textAnchor="end">
            {label}
          </SvgText>
        ))}
        {data.map((row, r) =>
          row.map((value, c) => (
            <Rect
              key={`${r}-${c}`}
              x={left + c * (cell + gap)}
              y={top + r * (cell + gap)}
              width={cell}
              height={cell}
              rx={Math.min(4, cell / 4)}
              fill={value <= 0 ? gridColor : color}
              fillOpacity={value <= 0 ? 1 : 0.18 + 0.82 * intensity(value)}
            />
          ))
        )}
      </Svg>
    ),
    [data, width, height, cell, gap, left, top, color, gridColor, labelColor, colEvery, rowLabels?.join(), colLabels?.join()]
  );

  if (!rows || !cols) return <Text style={{ color: labelColor, textAlign: "center" }}>No data</Text>;

  const select = (x: number, y: number, hover = false) => {
    const col = Math.floor((x - left) / (cell + gap));
    const row = Math.floor((y - top) / (cell + gap));
    if (row < 0 || col < 0 || row >= rows || col >= (data[row]?.length ?? 0)) {
      setSelected(null);
      onSelect?.(null);
      return;
    }
    const same = !hover && selected?.row === row && selected?.col === col;
    setSelected(same ? null : { row, col });
    onSelect?.(same ? null : { row, col, value: data[row][col] });
  };

  return (
    <View>
      <View style={{ width, height }}>
        <Animated.View
          pointerEvents="none"
          style={{
            opacity: progress,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          }}
        >
          {grid}
        </Animated.View>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {selected ? (
            <>
              <Rect
                x={left + selected.col * (cell + gap) - 1.5}
                y={top + selected.row * (cell + gap) - 1.5}
                width={cell + 3}
                height={cell + 3}
                rx={Math.min(5, cell / 3)}
                fill="none"
                stroke={labelColor}
                strokeWidth={2}
              />
              <SvgTooltip
                x={left + selected.col * (cell + gap) + cell / 2}
                y={top + selected.row * (cell + gap)}
                boundsWidth={width}
                boundsHeight={height}
                background={tooltipBackground}
                color={tooltipTextColor}
                lines={[
                  formatValue(data[selected.row][selected.col]),
                  [rowLabels?.[selected.row], colLabels?.[selected.col]].filter(Boolean).join(" · ") ||
                    `${selected.row + 1}, ${selected.col + 1}`,
                ]}
              />
            </>
          ) : null}
        </Svg>
        <TouchLayer onTap={select} onHover={(x, y) => select(x, y, true)} onHoverEnd={() => setSelected(null)} />
      </View>

      {showScale ? (
        <View style={styles.scale}>
          <Text style={[styles.scaleText, { color: labelColor }]}>Less</Text>
          {[0.18, 0.4, 0.6, 0.8, 1].map((opacity) => (
            <View key={opacity} style={[styles.scaleCell, { backgroundColor: color, opacity }]} />
          ))}
          <Text style={[styles.scaleText, { color: labelColor }]}>More</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  scale: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 10 },
  scaleCell: { width: 12, height: 12, borderRadius: 3 },
  scaleText: { fontSize: 11, marginHorizontal: 2 },
});

const HeatmapChart = responsive<HeatmapChartProps>(
  HeatmapChartInner,
  (props) => (props.data?.length ?? 7) * 20
);

export default HeatmapChart;
