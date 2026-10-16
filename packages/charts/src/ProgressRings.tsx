import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import {
  AnimatedCircle,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  TouchLayer,
  clamp,
  compactNumber,
  responsive,
  useAnimatedValues,
} from "./internal";
import type { ProgressRingsProps } from "./types";

type Props = ProgressRingsProps & { width: number };

const ProgressRingsInner = ({
  rings = [],
  size,
  strokeWidth = 16,
  gap = 5,
  width,
  animate = true,
  centerTitle,
  centerSubtitle,
  showLegend = true,
  formatValue = compactNumber,
  labelColor = DEFAULT_THEME.labelColor,
  gridColor = DEFAULT_THEME.gridColor,
  onSelect,
  palette = DEFAULT_PALETTE,
}: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const diameter = Math.min(size ?? 220, width);
  const center = diameter / 2;
  const items = rings.map((ring, index) => {
    const radius = center - strokeWidth / 2 - index * (strokeWidth + gap);
    return {
      ...ring,
      max: ring.max ?? 100,
      color: ring.color ?? palette[index % palette.length],
      radius,
      circumference: 2 * Math.PI * Math.max(radius, 0),
    };
  });
  const fractions = useAnimatedValues(
    items.map((item) => clamp(item.value / (item.max || 1), 0, 1)),
    { animate, duration: 1100, delay: (index) => index * 120 }
  );

  const select = (x: number, y: number, hover = false) => {
    const distance = Math.hypot(x - (width - diameter) / 2 - center, y - center);
    const index = items.findIndex(
      (item) => Math.abs(distance - item.radius) <= strokeWidth / 2 + gap / 2
    );
    const next = index === -1 || (!hover && index === selected) ? null : index;
    setSelected(next);
    onSelect?.(next === null ? null : rings[next], next);
  };

  const active = selected !== null ? items[selected] : null;
  const percent = (item: (typeof items)[number]) =>
    `${Math.round((item.value / (item.max || 1)) * 100)}%`;

  return (
    <View>
      <View style={{ width, height: diameter, alignItems: "center" }}>
        <Svg width={diameter} height={diameter}>
          {items.map((item, index) =>
            item.radius <= 0 ? null : (
              <G key={item.label} opacity={selected === null || selected === index ? 1 : 0.3}>
                <Circle
                  cx={center}
                  cy={center}
                  r={item.radius}
                  stroke={item.color}
                  strokeOpacity={0.16}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                <AnimatedCircle
                  cx={center}
                  cy={center}
                  r={item.radius}
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={[item.circumference, item.circumference]}
                  strokeDashoffset={fractions[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [item.circumference, 0],
                  })}
                  transform={`rotate(-90 ${center} ${center})`}
                />
              </G>
            )
          )}
        </Svg>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            style={[styles.centerTitle, { color: active ? active.color : labelColor }]}
            numberOfLines={1}
          >
            {active ? percent(active) : centerTitle ?? ""}
          </Text>
          <Text style={[styles.centerSubtitle, { color: labelColor }]} numberOfLines={1}>
            {active ? active.label : centerSubtitle ?? ""}
          </Text>
        </View>
        <TouchLayer onTap={select} onHover={(x, y) => select(x, y, true)} onHoverEnd={() => setSelected(null)} />
      </View>

      {showLegend ? (
        <View style={styles.legend}>
          {items.map((item, index) => (
            <View
              key={item.label}
              style={[styles.legendRow, { borderColor: gridColor, opacity: selected === null || selected === index ? 1 : 0.4 }]}
            >
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[styles.legendLabel, { color: labelColor }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.legendValue, { color: labelColor }]}>
                {formatValue(item.value)} / {formatValue(item.max)}
              </Text>
              <Text style={[styles.legendPercent, { color: item.color }]}>{percent(item)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  centerTitle: { fontSize: 22, fontWeight: "500", fontVariant: ["tabular-nums"] },
  centerSubtitle: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  legend: { marginTop: 14, gap: 2 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, fontWeight: "500" },
  legendValue: { fontSize: 12, fontVariant: ["tabular-nums"] },
  legendPercent: { width: 44, textAlign: "right", fontSize: 13, fontWeight: "500" },
});

const ProgressRings = responsive<ProgressRingsProps>(
  ProgressRingsInner,
  (props) => Math.min(props.size ?? 220, 220) + (props.rings?.length ?? 0) * 34
);

export default ProgressRings;
