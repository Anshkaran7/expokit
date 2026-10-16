import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import {
  AnimatedPath,
  DEFAULT_PALETTE,
  approxPathLength,
  responsive,
  smoothPath,
  useEntrance,
} from "./internal";
import type { SparklineProps } from "./types";

type Props = SparklineProps & { width: number };

let gradientCounter = 0;

const SparklineInner = ({
  data = [],
  width,
  height = 40,
  palette = DEFAULT_PALETTE,
  color = palette[0],
  strokeWidth = 2,
  showArea = true,
  showLastDot = true,
  animate = true,
}: Props) => {
  const gradientId = useRef(`spark-${gradientCounter++}`).current;
  const progress = useEntrance(animate, data.join(","), 900);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showLastDot) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [showLastDot]);

  if (data.length < 2) return <View style={{ width, height }} />;

  const pad = showLastDot ? 5 : strokeWidth;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const points = data.map((value, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (hi === lo ? 0.5 : (value - lo) / (hi - lo))) * (height - pad * 2),
  }));
  const path = smoothPath(points);
  const length = approxPathLength(points);
  const last = points[points.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {showArea ? (
          <AnimatedPath
            d={`${path} L ${last.x} ${height} L ${points[0].x} ${height} Z`}
            fill={`url(#${gradientId})`}
            opacity={progress}
          />
        ) : null}
        <AnimatedPath
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={[length, length]}
          strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
        />
        {showLastDot ? <Circle cx={last.x} cy={last.y} r={3} fill={color} /> : null}
      </Svg>
      {showLastDot ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: last.x - 8,
            top: last.y - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }],
          }}
        />
      ) : null}
    </View>
  );
};

const Sparkline = responsive<SparklineProps>(SparklineInner, (props) => props.height ?? 40);

export default Sparkline;
