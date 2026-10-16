import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  AnimatedPath,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  TouchLayer,
  approxPathLength,
  clamp,
  compactNumber,
  estimateTextWidth,
  labelStep,
  niceTicks,
  responsive,
  smoothPath,
  useEntrance,
} from "./internal";
import type { MultiLineChartProps } from "./types";

type Props = MultiLineChartProps & { width: number };

const MultiLineChartInner = ({
  series = [],
  labels,
  width,
  height = 220,
  animate = true,
  curved = true,
  showArea = true,
  showLegend = true,
  showHeader = true,
  yTickCount = 4,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  onSelect,
  palette = DEFAULT_PALETTE,
  onScrubStart,
  onScrubEnd,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const count = Math.max(0, ...series.map((item) => item.data.length));
  const progress = useEntrance(
    animate,
    series.map((item) => item.data.join(",")).join("|"),
    900
  );

  const geometry = useMemo(() => {
    const all = series.reduce<number[]>((acc, item) => acc.concat(item.data), []);
    const scale = niceTicks(Math.min(...all), Math.max(...all), yTickCount);
    const left =
      Math.max(...scale.ticks.map((tick) => estimateTextWidth(formatValue(tick), 10))) + 10;
    const padding = { top: 12, right: 12, bottom: 24, left };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const step = plotWidth / Math.max(count - 1, 1);
    const toY = (value: number) =>
      padding.top + plotHeight - ((value - scale.min) / (scale.max - scale.min)) * plotHeight;
    const lines = series.map((item, index) => {
      const points = item.data.map((value, i) => ({
        x: padding.left + i * step,
        y: toY(value),
      }));
      const path = smoothPath(points, curved);
      const baseline = padding.top + plotHeight;
      const area = points.length
        ? `${path} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : "";
      return {
        ...item,
        color: item.color ?? palette[index % palette.length],
        points,
        path,
        area,
        length: approxPathLength(points),
      };
    });
    return { scale, padding, plotWidth, plotHeight, step, toY, lines };
  }, [series, width, height, curved, yTickCount, formatValue, count]);

  if (!count) return <Text style={[styles.empty, { color: labelColor }]}>No data</Text>;

  const { scale, padding, plotWidth, plotHeight, step, toY, lines } = geometry;
  const xEvery = labelStep(count, plotWidth);
  const activeIndex = selected ?? count - 1;

  const pick = (x: number) => {
    const index = clamp(Math.round((x - padding.left) / step), 0, count - 1);
    if (index !== selected) {
      setSelected(index);
      onSelect?.(index);
    }
  };

  return (
    <View>
      {showHeader ? (
        <View style={styles.header}>
          <Text style={[styles.headerLabel, { color: labelColor }]}>
            {selected === null ? "Latest" : labels?.[activeIndex] ?? `#${activeIndex + 1}`}
          </Text>
          <View style={styles.headerValues}>
            {lines
              .filter((line) => !hidden[line.name])
              .map((line) => (
                <View key={line.name} style={styles.headerItem}>
                  <View style={[styles.dot, { backgroundColor: line.color }]} />
                  <Text style={[styles.headerValue, { color: line.color }]}>
                    {line.data[activeIndex] !== undefined
                      ? formatValue(line.data[activeIndex])
                      : "–"}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      ) : null}

      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Defs>
            {lines.map((line, index) => (
              <LinearGradient key={line.name} id={`mlc-${index}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line.color} stopOpacity="0.22" />
                <Stop offset="1" stopColor={line.color} stopOpacity="0" />
              </LinearGradient>
            ))}
          </Defs>

          {scale.ticks.map((tick) => (
            <G key={`tick-${tick}`}>
              <Line
                x1={padding.left}
                x2={width - padding.right}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke={gridColor}
                strokeDasharray="3 5"
              />
              <SvgText
                x={padding.left - 8}
                y={toY(tick) + 3.5}
                fontSize={10}
                fill={labelColor}
                textAnchor="end"
              >
                {formatValue(tick)}
              </SvgText>
            </G>
          ))}

          {Array.from({ length: count }).map((_, index) =>
            index % xEvery === 0 ? (
              <SvgText
                key={`x-${index}`}
                x={padding.left + index * step}
                y={height - 6}
                fontSize={10}
                fill={labelColor}
                textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
              >
                {labels?.[index] ?? String(index + 1)}
              </SvgText>
            ) : null
          )}

          {lines.map((line, index) =>
            hidden[line.name] ? null : (
              <G key={line.name}>
                {showArea ? (
                  <AnimatedPath d={line.area} fill={`url(#mlc-${index})`} opacity={progress} />
                ) : null}
                <AnimatedPath
                  d={line.path}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={[line.length, line.length]}
                  strokeDashoffset={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [line.length, 0],
                  })}
                />
              </G>
            )
          )}

          {selected !== null ? (
            <G>
              <Line
                x1={padding.left + selected * step}
                x2={padding.left + selected * step}
                y1={padding.top}
                y2={padding.top + plotHeight}
                stroke={labelColor}
                strokeOpacity={0.5}
                strokeDasharray="4 4"
              />
              {lines.map((line) =>
                hidden[line.name] || line.points[selected] === undefined ? null : (
                  <Circle
                    key={line.name}
                    cx={line.points[selected].x}
                    cy={line.points[selected].y}
                    r={5}
                    fill={line.color}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                )
              )}
            </G>
          ) : null}
        </Svg>
        <TouchLayer
          scrub
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          onMove={(x) => pick(x)}
          onRelease={(wasTap) => {
            if (!wasTap) {
              setSelected(null);
              onSelect?.(null);
            }
          }}
        />
      </View>

      {showLegend && lines.length > 1 ? (
        <View style={styles.legend}>
          {lines.map((line) => (
            <Pressable
              key={line.name}
              hitSlop={6}
              onPress={() => setHidden((prev) => ({ ...prev, [line.name]: !prev[line.name] }))}
              style={[styles.legendItem, { opacity: hidden[line.name] ? 0.35 : 1 }]}
            >
              <View style={[styles.dot, { backgroundColor: line.color }]} />
              <Text style={[styles.legendText, { color: labelColor }]}>{line.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: 8, minHeight: 40 },
  headerLabel: { fontSize: 12, fontWeight: "500" },
  headerValues: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  headerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerValue: { fontSize: 18, fontWeight: "500", fontVariant: ["tabular-nums"] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 12, fontWeight: "500" },
  empty: { textAlign: "center", marginVertical: 20 },
});

const MultiLineChart = responsive<MultiLineChartProps>(
  MultiLineChartInner,
  (props) => (props.height ?? 220) + 80
);

export default MultiLineChart;
