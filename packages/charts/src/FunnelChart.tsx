import React, { useState } from "react";
import { Text, View } from "react-native";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import {
  AnimatedPath,
  AnimatedRect,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  responsive,
  useAnimatedValues,
  useEntrance,
} from "./internal";
import type { FunnelChartProps } from "./types";

type Props = FunnelChartProps & { width: number };

const CONNECTOR = 16;

const FunnelChartInner = ({
  data = [],
  palette = DEFAULT_PALETTE,
  colors = palette,
  stageHeight = 42,
  showConversion = true,
  width,
  animate = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  onSelect,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const top = Math.max(1, data[0]?.value ?? 1);
  const conversionWidth = showConversion ? 46 : 0;
  const maxWidth = width - conversionWidth * 2;
  const cx = width / 2;
  const widths = data.map((item) => Math.max(maxWidth * clamp(item.value / top, 0, 1), maxWidth * 0.14));
  const grow = useAnimatedValues(
    data.map(() => 1),
    { animate, duration: 700, delay: (i) => i * 110 }
  );
  const fade = useEntrance(animate, data.map((item) => item.value).join(","), 900 + data.length * 110);
  const height = data.length * stageHeight + Math.max(data.length - 1, 0) * CONNECTOR;
  const yOf = (i: number) => i * (stageHeight + CONNECTOR);

  if (!data.length) return <Text style={{ color: labelColor, textAlign: "center" }}>No data</Text>;

  const select = (y: number, hover = false) => {
    const index = clamp(Math.floor(y / (stageHeight + CONNECTOR)), 0, data.length - 1);
    const next = !hover && index === selected ? null : index;
    setSelected(next);
    onSelect?.(next === null ? null : data[next], next);
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {data.map((item, i) => {
          const color = item.color ?? colors[i % colors.length];
          const w = widths[i];
          const y = yOf(i);
          const dim = selected !== null && selected !== i ? 0.35 : 1;
          const text = `${item.label} · ${formatValue(item.value)}`;
          const fits = estimateTextWidth(text, 12) + 16 < w;
          const next = widths[i + 1];
          return (
            <G key={`${item.label}-${i}`} opacity={dim}>
              {next !== undefined ? (
                <AnimatedPath
                  d={`M ${cx - w / 2 + 6} ${y + stageHeight} L ${cx + w / 2 - 6} ${y + stageHeight} L ${cx + next / 2 - 6} ${y + stageHeight + CONNECTOR} L ${cx - next / 2 + 6} ${y + stageHeight + CONNECTOR} Z`}
                  fill={color}
                  opacity={fade.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 0.2] })}
                />
              ) : null}
              <AnimatedRect
                x={grow[i].interpolate({ inputRange: [0, 1], outputRange: [cx, cx - w / 2] })}
                width={grow[i].interpolate({ inputRange: [0, 1], outputRange: [0, w] })}
                y={y}
                height={stageHeight}
                rx={10}
                fill={color}
              />
              <SvgText
                x={fits ? cx : cx + w / 2 + 6}
                y={y + stageHeight / 2 + 4}
                fontSize={12}
                fontWeight="500"
                fill={fits ? "#FFFFFF" : labelColor}
                textAnchor={fits ? "middle" : "start"}
              >
                {text}
              </SvgText>
              {showConversion && i > 0 ? (
                <SvgText x={width - 2} y={y - CONNECTOR / 2 + 4} fontSize={11} fontWeight="500" fill={labelColor} textAnchor="end">
                  {`↓ ${Math.round((item.value / Math.max(data[i - 1].value, 1)) * 100)}%`}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {showConversion ? (
          <SvgText x={2} y={height - stageHeight / 2 + 4} fontSize={11} fontWeight="500" fill={labelColor}>
            {`${Math.round((data[data.length - 1].value / top) * 100)}%`}
          </SvgText>
        ) : null}
      </Svg>
      <TouchLayer onTap={(_, y) => select(y)} onHover={(_, y) => select(y, true)} onHoverEnd={() => setSelected(null)} />
    </View>
  );
};

const FunnelChart = responsive<FunnelChartProps>(
  FunnelChartInner,
  (props) => (props.data?.length ?? 0) * ((props.stageHeight ?? 42) + CONNECTOR)
);

export default FunnelChart;
