// Columns of dots, one dot per unit: glasses of water, workouts, mood check-ins, 1k steps…
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Bubble, EASE, Empty, adjustable, columnAt, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface BeadDatum {
  label: string;
  value: number;
  color?: string;
}

export interface BeadChartProps {
  data: BeadDatum[];
  /** Value of one dot (1 glass, 1000 steps). */
  unit?: number;
  /** Dots per column (the goal). Columns past it keep stacking up to this many. */
  maxDots?: number;
  /** Dot diameter. Defaults to fit the column. */
  dotSize?: number;
  /** Space between dots. */
  dotGap?: number;
  gap?: number;
  color?: string;
  /** Empty dot colour (pass "transparent" to hide). */
  trackColor?: string;
  inactiveOpacity?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: BeadDatum | null) => void;
  formatValue?: (value: number, datum: BeadDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function BeadChart({
  data = [],
  unit = 1,
  maxDots,
  dotSize,
  dotGap = 4,
  gap = 8,
  color,
  trackColor,
  inactiveOpacity = 0.35,
  showLabels = true,
  showTooltip = true,
  selectedIndex,
  defaultIndex = null,
  onSelect,
  formatValue = (v) => compactNumber(v),
  animate: animateProp = true,
  emptyText = "No data",
  accessibilityLabel,
  onScrubStart,
  onScrubEnd,
  style,
}: BeadChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const u = Math.max(1e-9, unit);
  const counts = data.map((d) => Math.max(0, Math.round(num(d.value) / u)));
  const rows = Math.max(1, maxDots ?? Math.max(...counts, 1));
  const colW = n && width ? (width - gap * (n - 1)) / n : 0;
  const dot = dotSize ?? clamp(Math.min(colW * 0.7, 18), 6, 18);
  const plotH = rows * dot + (rows - 1) * dotGap;
  const tipRoom = showTooltip ? 44 : 4;
  const base = color ?? theme.palette[0];

  // One native value per column grows its dots bottom-up; the selection fades the others.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 1000, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [animate, counts.join("|")]);
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : inactiveOpacity)), { animate, duration: 200 });
  const reveal = useMemo(
    () =>
      Array.from({ length: rows }, (_, r) => {
        const t = r / rows;
        return progress.interpolate({ inputRange: [t * 0.75, t * 0.75 + 0.25], outputRange: [0, 1], extrapolate: "clamp" });
      }),
    [rows, progress]
  );

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  if (!n) return <Empty height={120} text={emptyText} />;

  const describe = (i: number) => `${data[i].label}: ${formatValue(num(data[i].value), data[i])}`;
  const a11y = adjustable(accessibilityLabel ?? `Dot chart, ${n} items. ${data.slice(0, 12).map((_, i) => describe(i)).join(". ")}`, active === null ? undefined : describe(active), n, active, choose);
  const xOf = (i: number) => i * (colW + gap) + colW / 2;
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style} onLayout={onLayout} {...a11y}>
      {width > 0 ? (
        <>
          <View style={{ height: tipRoom + plotH }}>
            {data.map((d, i) => (
              <Animated.View key={`${d.label}-${i}`} style={{ position: "absolute", left: xOf(i) - dot / 2, top: tipRoom, width: dot, height: plotH, opacity: dims[i] }}>
                {Array.from({ length: rows }, (_, r) => {
                  const lit = r < counts[i];
                  return (
                    <View
                      key={r}
                      style={{ position: "absolute", left: 0, bottom: r * (dot + dotGap), width: dot, height: dot, borderRadius: dot / 2, backgroundColor: trackColor ?? theme.muted }}
                    >
                      {lit ? <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: dot / 2, backgroundColor: d.color ?? base, opacity: reveal[r], transform: [{ scale: reveal[r] }] }]} /> : null}
                    </View>
                  );
                })}
              </Animated.View>
            ))}
          </View>
          {showLabels ? (
            <View style={{ flexDirection: "row", gap, marginTop: 8 }}>
              {data.map((d, i) => (
                <Text
                  key={`${d.label}-${i}`}
                  maxFontSizeMultiplier={TEXT_SCALE}
                  numberOfLines={1}
                  style={[styles.label, font, { width: colW, color: i === active ? theme.foreground : theme.mutedForeground, fontWeight: i === active ? "600" : "400" }]}
                >
                  {d.label}
                </Text>
              ))}
            </View>
          ) : null}
          {showTooltip ? (
            <Bubble
              visible={active !== null}
              x={active === null ? 0 : xOf(active)}
              y={active === null ? 0 : tipRoom + plotH - Math.min(counts[active], rows) * (dot + dotGap) + dotGap}
              width={width}
              lines={active === null ? [" "] : [formatValue(num(data[active].value), data[active])]}
              animate={animate}
            />
          ) : null}
          <View style={StyleSheet.absoluteFill}>
            <TouchLayer
              scrub
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onMove={(x) => choose(columnAt(x, n, colW, gap))}
              onTap={(x) => choose(columnAt(x, n, colW, gap))}
              onHover={(x) => choose(columnAt(x, n, colW, gap))}
              onHoverEnd={() => {}}
            />
          </View>
        </>
      ) : (
        <View style={{ height: tipRoom + 120 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { textAlign: "center", fontSize: 12 },
});
