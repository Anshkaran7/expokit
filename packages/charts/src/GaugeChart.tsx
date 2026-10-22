import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { AnimatedPath, DEFAULT_PALETTE, DEFAULT_THEME, TouchLayer, clamp, compactNumber, responsive } from "./internal";
import type { GaugeChartProps } from "./types";

type Props = GaugeChartProps & { width: number };

const START = 150; // degrees, SVG convention (0 = right, clockwise)
const SWEEP = 240;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Live number that follows the animated value without re-rendering the gauge. */
const AnimatedNumber = ({
  value,
  min,
  max,
  format,
  style,
  initialFraction = 0,
}: {
  value: Animated.Value;
  min: number;
  max: number;
  format: (value: number) => string;
  style: object;
  /** Starting fraction (0–1); avoids Animated.Value private `__getValue`. */
  initialFraction?: number;
}) => {
  const [display, setDisplay] = useState(() => format(min + initialFraction * (max - min)));
  useEffect(() => {
    const id = value.addListener(({ value: fraction }) =>
      setDisplay(format(min + fraction * (max - min)))
    );
    return () => value.removeListener(id);
  }, [value, min, max, format]);
  return <Text style={style}>{display}</Text>;
};

const GaugeChartInner = ({
  value,
  min = 0,
  max = 100,
  label,
  palette = DEFAULT_PALETTE,
  color = palette[0],
  segments,
  thickness = 18,
  showNeedle = true,
  interactive = false,
  step = 1,
  width,
  animate = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  onChange,
  onScrubStart,
  onScrubEnd,
}: Props) => {
  const fractionOf = (v: number) => clamp((v - min) / (max - min || 1), 0, 1);
  const [current, setCurrent] = useState(value);
  // Two drivers: the arc must animate on JS, the needle rotates on the native thread.
  const arc = useRef(new Animated.Value(animate ? 0 : fractionOf(value))).current;
  const needle = useRef(new Animated.Value(animate ? 0 : fractionOf(value))).current;
  const dragging = useRef(false);

  useEffect(() => {
    setCurrent(value);
    if (dragging.current || !animate) {
      arc.setValue(fractionOf(value));
      needle.setValue(fractionOf(value));
      return;
    }
    const config = { toValue: fractionOf(value), duration: 1000, easing: Easing.bezier(0.32, 0.72, 0, 1) };
    const animation = Animated.parallel([
      Animated.timing(arc, { ...config, useNativeDriver: false }),
      Animated.timing(needle, { ...config, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [value, min, max, animate]);

  const radius = Math.max(Math.min(width / 2 - thickness, 150), 40);
  const cx = width / 2;
  const cy = thickness / 2 + radius + 6;
  const height = cy + radius * Math.sin(rad(30)) + thickness / 2 + 22;
  const arcLength = rad(SWEEP) * radius;
  const pointAt = (deg: number, r = radius) => ({
    x: cx + r * Math.cos(rad(deg)),
    y: cy + r * Math.sin(rad(deg)),
  });
  const arcPath = (fromDeg: number, toDeg: number) => {
    const a = pointAt(fromDeg);
    const b = pointAt(toDeg);
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const activeColor =
    segments?.find((segment) => current <= segment.to)?.color ??
    segments?.[segments.length - 1]?.color ??
    color;

  const setFromTouch = (x: number, y: number) => {
    let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    let relative = (deg - START + 360) % 360;
    if (relative > SWEEP) relative = relative > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    const raw = min + (relative / SWEEP) * (max - min);
    const next = clamp(Math.round(raw / step) * step, min, max);
    arc.setValue(fractionOf(next));
    needle.setValue(fractionOf(next));
    if (next !== current) {
      setCurrent(next);
      onChange?.(next);
    }
  };

  const needleLength = radius - thickness - 6;
  const ticks = Array.from({ length: 11 }).map((_, i) => START + (SWEEP * i) / 10);
  const minLabel = pointAt(START, radius);
  const maxLabel = pointAt(START + SWEEP, radius);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {segments?.length ? (
          segments.map((segment, i) => {
            const from = i === 0 ? min : segments[i - 1].to;
            return (
              <Path
                key={`seg-${i}`}
                d={arcPath(START + fractionOf(from) * SWEEP, START + fractionOf(segment.to) * SWEEP)}
                stroke={segment.color}
                strokeOpacity={0.2}
                strokeWidth={thickness}
                fill="none"
              />
            );
          })
        ) : (
          <Path d={arcPath(START, START + SWEEP)} stroke={gridColor} strokeWidth={thickness} strokeLinecap="round" fill="none" />
        )}
        <AnimatedPath
          d={arcPath(START, START + SWEEP)}
          stroke={activeColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[arcLength, arcLength]}
          strokeDashoffset={arc.interpolate({ inputRange: [0, 1], outputRange: [arcLength, 0] })}
        />
        {ticks.map((deg, i) => {
          const a = pointAt(deg, radius - thickness / 2 - 4);
          const b = pointAt(deg, radius - thickness / 2 - (i % 5 === 0 ? 12 : 8));
          return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={labelColor} strokeOpacity={0.5} strokeWidth={i % 5 === 0 ? 2 : 1} />;
        })}
        <SvgText x={minLabel.x} y={minLabel.y + thickness / 2 + 14} fontSize={11} fill={labelColor} textAnchor="middle">
          {formatValue(min)}
        </SvgText>
        <SvgText x={maxLabel.x} y={maxLabel.y + thickness / 2 + 14} fontSize={11} fill={labelColor} textAnchor="middle">
          {formatValue(max)}
        </SvgText>
      </Svg>

      {showNeedle ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: cx - needleLength,
            top: cy - needleLength,
            width: needleLength * 2,
            height: needleLength * 2,
            transform: [
              {
                rotate: needle.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${START}deg`, `${START + SWEEP}deg`],
                }),
              },
            ],
          }}
        >
          <Svg width={needleLength * 2} height={needleLength * 2}>
            <Path
              d={`M ${needleLength} ${needleLength - 3.5} L ${needleLength * 2} ${needleLength} L ${needleLength} ${needleLength + 3.5} Z`}
              fill={activeColor}
            />
            <Circle cx={needleLength} cy={needleLength} r={8} fill={activeColor} />
            <Circle cx={needleLength} cy={needleLength} r={3.5} fill="#FFFFFF" />
          </Svg>
        </Animated.View>
      ) : null}

      <View pointerEvents="none" style={[styles.readout, { top: cy + (showNeedle ? 16 : -24) }]}>
        <AnimatedNumber
          value={arc}
          min={min}
          max={max}
          format={formatValue}
          initialFraction={fractionOf(current)}
          style={[styles.value, { color: activeColor }]}
        />
        {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      </View>

      {interactive ? (
        <TouchLayer
          // Grab the dial on its ring (where the needle tip rides) or its hub; a swipe that
          // lands elsewhere on the card scrolls the page instead of yanking the needle.
          lockOnGrant={(x, y) => {
            const dist = Math.hypot(x - cx, y - cy);
            return dist < 32 || Math.abs(dist - (radius - thickness / 2)) < thickness / 2 + 30;
          }}
          onScrubStart={() => {
            dragging.current = true;
            onScrubStart?.();
          }}
          onScrubEnd={() => {
            dragging.current = false;
            onScrubEnd?.();
          }}
          onMove={setFromTouch}
          // Hover must not move the needle; only a press-and-drag does.
          onHover={() => {}}
          onHoverEnd={() => {}}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  readout: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  value: { fontSize: 28, fontWeight: "500", fontVariant: ["tabular-nums"] },
  label: { fontSize: 12, fontWeight: "500", marginTop: 0 },
});

const GaugeChart = responsive<GaugeChartProps>(GaugeChartInner, () => 220);

export default GaugeChart;
