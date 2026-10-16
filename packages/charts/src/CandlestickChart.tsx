import React, { useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import {
  DEFAULT_THEME,
  TouchLayer,
  clamp,
  compactNumber,
  estimateTextWidth,
  labelStep,
  niceTicks,
  responsive,
  useEntrance,
} from "./internal";
import type { CandlestickChartProps } from "./types";

type Props = CandlestickChartProps & { width: number };

const CandlestickChartInner = ({
  data = [],
  width,
  height = 260,
  upColor = "#10B981",
  downColor = "#EF4444",
  showVolume = true,
  showHeader = true,
  animate = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  tooltipBackground = DEFAULT_THEME.tooltipBackground,
  tooltipTextColor = DEFAULT_THEME.tooltipTextColor,
  onSelect,
  onScrubStart,
  onScrubEnd,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const hasVolume = showVolume && data.some((candle) => candle.volume !== undefined);

  const layout = useMemo(() => {
    const scale = niceTicks(
      Math.min(...data.map((c) => c.low)),
      Math.max(...data.map((c) => c.high)),
      4
    );
    const right = Math.max(...scale.ticks.map((t) => estimateTextWidth(formatValue(t), 10))) + 10;
    const padding = { top: 8, right, bottom: 22, left: 4 };
    const plotWidth = width - padding.left - padding.right;
    const totalHeight = height - padding.top - padding.bottom;
    const volumeHeight = hasVolume ? totalHeight * 0.2 : 0;
    const priceHeight = totalHeight - volumeHeight - (hasVolume ? 8 : 0);
    const slot = plotWidth / Math.max(data.length, 1);
    const bodyWidth = clamp(slot * 0.62, 1.5, 18);
    const toY = (v: number) =>
      padding.top + priceHeight - ((v - scale.min) / (scale.max - scale.min)) * priceHeight;
    const maxVolume = Math.max(1, ...data.map((c) => c.volume ?? 0));
    return { scale, padding, plotWidth, priceHeight, volumeHeight, slot, bodyWidth, toY, maxVolume };
  }, [data, width, height, hasVolume]);

  // One native-driven reveal for the whole candle layer (no per-candle JS animation).
  const reveal = useEntrance(animate, data.map((c) => c.close).join(","), 650, true);

  // Static layer: rebuilt only when data/size/colours change, never while scrubbing.
  const base = useMemo(() => {
    if (!data.length) return null;
    const { scale, padding, plotWidth, volumeHeight, slot, bodyWidth, toY, maxVolume } = layout;
    const volumeBase = height - padding.bottom;
    const xOf = (i: number) => padding.left + i * slot + slot / 2;
    const xEvery = labelStep(data.length, plotWidth, 48);
    return {
      grid: (
        <Svg width={width} height={height}>
          {scale.ticks.map((tick) => (
            <G key={`tick-${tick}`}>
              <Line x1={padding.left} x2={padding.left + plotWidth} y1={toY(tick)} y2={toY(tick)} stroke={gridColor} strokeDasharray="3 5" />
              <SvgText x={width - 2} y={toY(tick) + 3.5} fontSize={10} fill={labelColor} textAnchor="end">
                {formatValue(tick)}
              </SvgText>
            </G>
          ))}
          {data.map((candle, i) =>
            i % xEvery === 0 && candle.label ? (
              <SvgText key={`x-${i}`} x={i === 0 ? xOf(i) - bodyWidth / 2 : xOf(i)} y={height - 6} fontSize={10} fill={labelColor} textAnchor={i === 0 ? "start" : "middle"}>
                {candle.label}
              </SvgText>
            ) : null
          )}
        </Svg>
      ),
      candles: (
        <Svg width={width} height={height}>
          {data.map((candle, i) => {
            const color = candle.close >= candle.open ? upColor : downColor;
            const top = toY(Math.max(candle.open, candle.close));
            const bottom = toY(Math.min(candle.open, candle.close));
            const x = xOf(i);
            const vh = ((candle.volume ?? 0) / maxVolume) * volumeHeight;
            return (
              <G key={i}>
                <Rect x={x - 0.6} width={1.2} y={toY(candle.high)} height={toY(candle.low) - toY(candle.high)} fill={color} />
                <Rect x={x - bodyWidth / 2} width={bodyWidth} y={top} height={Math.max(bottom - top, 1)} rx={Math.min(2, bodyWidth / 4)} fill={color} />
                {hasVolume && candle.volume !== undefined ? (
                  <Rect x={x - bodyWidth / 2} width={bodyWidth} y={volumeBase - vh} height={vh} fill={color} opacity={0.35} />
                ) : null}
              </G>
            );
          })}
        </Svg>
      ),
    };
  }, [layout, data, width, height, upColor, downColor, labelColor, gridColor, hasVolume]);

  if (!data.length || !base) return <Text style={{ color: labelColor, textAlign: "center" }}>No data</Text>;

  const { padding, plotWidth, slot, bodyWidth, toY } = layout;
  const volumeBase = height - padding.bottom;
  const xOf = (i: number) => padding.left + i * slot + slot / 2;
  const active = data[selected ?? data.length - 1];
  const previous = data[(selected ?? data.length - 1) - 1];
  const change = previous ? ((active.close - previous.close) / previous.close) * 100 : 0;

  const pick = (x: number) => {
    const index = clamp(Math.floor((x - padding.left) / slot), 0, data.length - 1);
    if (index !== selected) {
      setSelected(index);
      onSelect?.(index);
    }
  };

  return (
    <View>
      {showHeader ? (
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={[styles.price, { color: active.close >= active.open ? upColor : downColor }]}>
              {formatValue(active.close)}
            </Text>
            <Text style={[styles.change, { color: change >= 0 ? upColor : downColor }]}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
            </Text>
            <Text style={[styles.when, { color: labelColor }]}>
              {selected === null ? "Latest" : active.label ?? `#${selected + 1}`}
            </Text>
          </View>
          <Text style={[styles.ohlc, { color: labelColor }]}>
            O {formatValue(active.open)}  H {formatValue(active.high)}  L {formatValue(active.low)}  C{" "}
            {formatValue(active.close)}
          </Text>
        </View>
      ) : null}

      <View style={{ width, height }}>
        {base.grid}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: reveal,
              transform: [{ scaleY: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            },
          ]}
        >
          {base.candles}
        </Animated.View>
        {selected !== null ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Rect
              x={xOf(selected) - bodyWidth / 2 - 3}
              y={padding.top}
              width={bodyWidth + 6}
              height={volumeBase - padding.top}
              rx={4}
              fill={labelColor}
              opacity={0.12}
            />
            <Line x1={xOf(selected)} x2={xOf(selected)} y1={padding.top} y2={volumeBase} stroke={labelColor} strokeOpacity={0.6} strokeDasharray="4 4" />
            <Line x1={padding.left} x2={padding.left + plotWidth} y1={toY(data[selected].close)} y2={toY(data[selected].close)} stroke={labelColor} strokeOpacity={0.6} strokeDasharray="4 4" />
            <Rect x={padding.left + plotWidth + 1} y={toY(data[selected].close) - 9} width={padding.right - 1} height={18} rx={4} fill={tooltipBackground} />
            <SvgText x={width - 2} y={toY(data[selected].close) + 3.5} fontSize={10} fontWeight="500" fill={tooltipTextColor} textAnchor="end">
              {formatValue(data[selected].close)}
            </SvgText>
          </Svg>
        ) : null}
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
    </View>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: 8 },
  headerTop: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  price: { fontSize: 22, fontWeight: "500", fontVariant: ["tabular-nums"] },
  change: { fontSize: 13, fontWeight: "500" },
  when: { fontSize: 12, fontWeight: "500", marginLeft: "auto" },
  ohlc: { fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] },
});

const CandlestickChart = responsive<CandlestickChartProps>(
  CandlestickChartInner,
  (props) => (props.height ?? 260) + 50
);

export default CandlestickChart;
