import React, { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { useMorphPaths } from "./kit";
import { ChartDot, GlowFilter, glowUrl } from "./styles";
import { useChartTheme } from "./theme";
import { AnimatedPath, DEFAULT_PALETTE, DEFAULT_THEME, TouchLayer, compactNumber, responsive } from "./internal";

const AnimatedG = Animated.createAnimatedComponent(G);
import type { RadarChartProps } from "./types";

type Props = RadarChartProps & { width: number };

const RadarChartInner = ({
  axes = [],
  series = [],
  maxValue,
  levels = 4,
  width,
  height,
  animate = true,
  showLegend = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  onSelect,
  palette = DEFAULT_PALETTE,
  gridType = "polygon",
  fillOpacity = 0.25,
  strokeWidth = 2,
  showDots = true,
  showGrid = true,
  glow = false,
  dotVariant = "default",
}: Props) => {
  const theme = useChartTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const chartHeight = height ?? Math.min(width * 0.9, 340);
  const cx = width / 2;
  const cy = chartHeight / 2;
  const radius = Math.max(Math.min(width, chartHeight) / 2 - 34, 30);
  const peak = maxValue ?? Math.max(1, ...series.map((s) => Math.max(...s.data)));
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(axes.length, 1);
  const point = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const colors = series.map((s, i) => s.color ?? palette[i % palette.length]);
  const valueAt = (s: (typeof series)[number], i: number) => point(i, (Math.max(0, s.data[i] ?? 0) / peak) * radius);
  const polygon = (at: (i: number) => { x: number; y: number }) =>
    axes.length ? `M ${axes.map((_, i) => `${at(i).x.toFixed(2)} ${at(i).y.toFixed(2)}`).join(" L ")} Z` : "";
  const center = polygon(() => ({ x: cx, y: cy }));
  // Polygons grow from the centre on mount, morph on data changes and collapse when hidden.
  const { paths, alt, progress } = useMorphPaths(
    series.map((s) => (hidden[s.name] ? center : polygon((i) => valueAt(s, i)))),
    series.map(() => center),
    { animate }
  );
  // Dots would run ahead of a morphing polygon: fade them in as it lands.
  const dotsOpacity = progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0, 0, 1] });

  if (axes.length < 3) {
    return <Text style={{ color: labelColor, textAlign: "center" }}>Radar needs 3+ axes</Text>;
  }

  const select = (x: number, y: number, hover = false) => {
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < radius * 0.15) {
      setSelected(null);
      onSelect?.(null);
      return;
    }
    let theta = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    if (theta < 0) theta += Math.PI * 2;
    const index = Math.round(theta / ((Math.PI * 2) / axes.length)) % axes.length;
    const next = !hover && index === selected ? null : index;
    setSelected(next);
    onSelect?.(next);
  };

  return (
    <View>
      <View style={{ width, height: chartHeight }}>
        <Svg width={width} height={chartHeight}>
          {Array.from({ length: showGrid ? levels : 0 }).map((_, level) => {
            const r = (radius * (level + 1)) / levels;
            if (gridType === "circle") {
              return <Circle key={`level-${level}`} cx={cx} cy={cy} r={r} fill="none" stroke={gridColor} strokeWidth={1} />;
            }
            return (
              <Polygon
                key={`level-${level}`}
                points={axes.map((__, i) => `${point(i, r).x},${point(i, r).y}`).join(" ")}
                fill="none"
                stroke={gridColor}
                strokeWidth={1}
              />
            );
          })}
          {axes.map((axis, i) => {
            const end = point(i, radius);
            const label = point(i, radius + 16);
            const cos = Math.cos(angle(i));
            return (
              <G key={`axis-${axis}`}>
                <Line
                  x1={cx}
                  y1={cy}
                  x2={end.x}
                  y2={end.y}
                  stroke={selected === i ? labelColor : gridColor}
                  strokeWidth={selected === i ? 1.5 : 1}
                />
                <SvgText
                  x={label.x}
                  y={label.y + 4}
                  fontSize={11}
                  fontWeight={selected === i ? "500" : "400"}
                  fill={labelColor}
                  textAnchor={cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle"}
                  fontFamily={theme.fontFamily}
                >
                  {axis}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={width} height={chartHeight}>
            <Defs>{glow ? series.map((s) => <GlowFilter key={s.name} id={`radar-${s.name}`} blur={5} />) : null}</Defs>
            {series.map((s, si) => (
              <G key={s.name}>
                {glow ? (
                  <AnimatedPath
                    d={alt[si] as any}
                    fill="none"
                    stroke={colors[si]}
                    strokeWidth={strokeWidth + 4}
                    opacity={0.6}
                    filter={glowUrl(`radar-${s.name}`)}
                  />
                ) : null}
                <AnimatedPath
                  d={paths[si] as any}
                  fill={colors[si]}
                  fillOpacity={fillOpacity}
                  stroke={colors[si]}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
                {/* Hidden series keep their dots mounted (just transparent): adding or removing SVG
                    children makes react-native-svg on Android blank the whole canvas for a frame or two. */}
                <AnimatedG opacity={hidden[s.name] ? 0 : dotsOpacity}>
                  {s.data.map((_, i) => {
                    const p = valueAt(s, i);
                    if (!showDots && selected !== i) return null;
                    return (
                      <ChartDot
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={selected === i ? 5 : 3}
                        color={colors[si]}
                        variant={dotVariant === "none" && selected === i ? "default" : dotVariant}
                        surface={theme.card}
                      />
                    );
                  })}
                </AnimatedG>
              </G>
            ))}
          </Svg>
        </View>
        <TouchLayer onTap={select} onHover={(x, y) => select(x, y, true)} onHoverEnd={() => setSelected(null)} />
      </View>

      {selected !== null ? (
        <View style={styles.detail}>
          <Text style={[styles.detailTitle, { color: labelColor }]}>{axes[selected]}</Text>
          {series
            .filter((s) => !hidden[s.name])
            .map((s) => (
              <Text key={s.name} style={[styles.detailValue, { color: colors[series.indexOf(s)] }]}>
                {s.name} {formatValue(s.data[selected] ?? 0)}
              </Text>
            ))}
        </View>
      ) : null}

      {showLegend && series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s, si) => (
            <Pressable
              key={s.name}
              hitSlop={6}
              onPress={() => setHidden((prev) => ({ ...prev, [s.name]: !prev[s.name] }))}
              style={[styles.legendItem, { opacity: hidden[s.name] ? 0.35 : 1 }]}
            >
              <View style={[styles.dot, { backgroundColor: colors[si] }]} />
              <Text style={[styles.legendText, { color: labelColor }]}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  detail: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  detailTitle: { fontSize: 13, fontWeight: "500" },
  detailValue: { fontSize: 13, fontWeight: "500" },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: "500" },
});

const RadarChart = responsive<RadarChartProps>(
  RadarChartInner,
  (props) => (props.height ?? 300) + 40
);

export default RadarChart;
