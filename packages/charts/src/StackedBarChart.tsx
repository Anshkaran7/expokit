import React, { useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Text as SvgText } from "react-native-svg";
import {
  AnimatedRect,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  SvgTooltip,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  labelStep,
  niceTicks,
  responsive,
  useAnimatedValues,
} from "./internal";
import type { StackedBarChartProps } from "./types";

type Props = StackedBarChartProps & { width: number };

const StackedBarChartInner = ({
  data = [],
  keys = [],
  mode = "stacked",
  width,
  height = 240,
  animate = true,
  showLegend = true,
  yTickCount = 4,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  tooltipBackground = DEFAULT_THEME.tooltipBackground,
  tooltipTextColor = DEFAULT_THEME.tooltipTextColor,
  onSelect,
  palette = DEFAULT_PALETTE,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const colors = keys.map(
    (key, index) => key.color ?? palette[index % palette.length]
  );

  const layout = useMemo(() => {
    const totals = data.map((datum) => datum.values.reduce((sum, v) => sum + v, 0));
    const peak =
      mode === "stacked"
        ? Math.max(0, ...totals)
        : Math.max(0, ...data.map((datum) => Math.max(0, ...datum.values)));
    const scale = niceTicks(0, peak || 1, yTickCount);
    const left =
      Math.max(...scale.ticks.map((tick) => estimateTextWidth(formatValue(tick), 10))) + 10;
    const padding = { top: 12, right: 8, bottom: 24, left };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const slot = plotWidth / Math.max(data.length, 1);
    const barWidth = Math.min(slot * 0.62, 42);
    const groupWidth = Math.min(slot * 0.8, 18 * keys.length + 12);

    // Flattened per segment: x, width (px) and bottom, height (fraction of scale).
    const box: number[] = [];
    const frac: number[] = [];
    data.forEach((datum, i) => {
      let cumulative = 0;
      keys.forEach((_, k) => {
        const value = Math.max(0, datum.values[k] ?? 0);
        if (mode === "stacked") {
          box.push(padding.left + i * slot + (slot - barWidth) / 2, barWidth);
          frac.push(cumulative / scale.max, value / scale.max);
        } else {
          const each = groupWidth / keys.length;
          box.push(
            padding.left + i * slot + (slot - groupWidth) / 2 + k * each + 1,
            Math.max(each - 2, 2)
          );
          frac.push(0, value / scale.max);
        }
        cumulative += value;
      });
    });
    return { totals, scale, padding, plotWidth, plotHeight, slot, box, frac };
  }, [data, keys, mode, width, height, yTickCount, formatValue]);

  const box = useAnimatedValues(layout.box, { animate, from: "target", duration: 450 });
  const frac = useAnimatedValues(layout.frac, {
    animate,
    duration: 700,
    delay: (index) => Math.floor(index / (2 * Math.max(keys.length, 1))) * 45,
  });

  if (!data.length || !keys.length) {
    return <Text style={[styles.empty, { color: labelColor }]}>No data</Text>;
  }

  const { totals, scale, padding, plotWidth, plotHeight, slot } = layout;
  const baseline = padding.top + plotHeight;
  const toY = (value: number) => baseline - (value / scale.max) * plotHeight;
  const xEvery = labelStep(data.length, plotWidth, 36);

  const select = (x: number, hover = false) => {
    const index = clamp(Math.floor((x - padding.left) / slot), 0, data.length - 1);
    const next = !hover && index === selected ? null : index;
    setSelected(next);
    onSelect?.(next);
  };

  return (
    <View>
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          {scale.ticks.map((tick) => (
            <G key={`tick-${tick}`}>
              <Line
                x1={padding.left}
                x2={width - padding.right}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke={gridColor}
                strokeDasharray={tick === 0 ? undefined : "3 5"}
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

          {data.map((datum, i) => (
            <G key={`${datum.label}-${i}`} opacity={selected === null || selected === i ? 1 : 0.35}>
              {keys.map((_, k) => {
                const s = i * keys.length + k;
                const bottom = frac[s * 2];
                const size = frac[s * 2 + 1];
                return (
                  <AnimatedRect
                    key={k}
                    x={box[s * 2]}
                    width={box[s * 2 + 1]}
                    y={Animated.add(bottom, size).interpolate({
                      inputRange: [0, 1],
                      outputRange: [baseline, padding.top],
                    })}
                    height={size.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, plotHeight],
                    })}
                    rx={mode === "stacked" ? 2 : 3}
                    fill={colors[k]}
                  />
                );
              })}
              {i % xEvery === 0 ? (
                <SvgText
                  x={padding.left + i * slot + slot / 2}
                  y={height - 6}
                  fontSize={10}
                  fill={labelColor}
                  textAnchor="middle"
                >
                  {datum.label}
                </SvgText>
              ) : null}
            </G>
          ))}

          {selected !== null ? (
            <SvgTooltip
              x={padding.left + selected * slot + slot / 2}
              y={toY(
                mode === "stacked"
                  ? totals[selected]
                  : Math.max(0, ...data[selected].values)
              )}
              boundsWidth={width}
              boundsHeight={height}
              background={tooltipBackground}
              color={tooltipTextColor}
              lines={[
                `${data[selected].label} · ${formatValue(totals[selected])}`,
                ...keys.map(
                  (key, k) => `${key.name}: ${formatValue(data[selected].values[k] ?? 0)}`
                ),
              ]}
            />
          ) : null}
        </Svg>
        <TouchLayer onTap={(x) => select(x)} onHover={(x) => select(x, true)} onHoverEnd={() => setSelected(null)} />
      </View>

      {showLegend ? (
        <View style={styles.legend}>
          {keys.map((key, k) => (
            <View key={key.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colors[k] }]} />
              <Text style={[styles.legendText, { color: labelColor }]}>{key.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: "500" },
  empty: { textAlign: "center", marginVertical: 20 },
});

const StackedBarChart = responsive<StackedBarChartProps>(
  StackedBarChartInner,
  (props) => (props.height ?? 240) + 30
);

export default StackedBarChart;
