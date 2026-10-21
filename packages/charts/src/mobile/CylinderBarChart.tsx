// 3D cylinder columns: shaded round bodies with a lit top, rising from a floor. Sales, energy, scores.
import React, { useMemo, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Rect, Stop } from "react-native-svg";
import { TouchLayer, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE } from "../kit";
import { Bubble, Empty, adjustable, columnAt, mixColor, num, useNativeValues, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface CylinderDatum {
  label: string;
  value: number;
  color?: string;
}

export interface CylinderBarChartProps {
  data: CylinderDatum[];
  /** Plot height (labels and bubble add to it). */
  height?: number;
  max?: number;
  color?: string;
  /** Selected column colour. Defaults to `color`. */
  activeColor?: string;
  inactiveOpacity?: number;
  gap?: number;
  barWidth?: number;
  /** Faint empty glass cylinder behind each column (progress to max). */
  showTrack?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  selectedIndex?: number | null;
  defaultIndex?: number | null;
  onSelect?: (index: number | null, datum: CylinderDatum | null) => void;
  formatValue?: (value: number, datum: CylinderDatum) => string;
  animate?: boolean;
  emptyText?: string;
  accessibilityLabel?: string;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CylinderBarChart({
  data = [],
  height = 200,
  max,
  color,
  activeColor,
  inactiveOpacity = 0.45,
  gap = 14,
  barWidth,
  showTrack = true,
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
}: CylinderBarChartProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const n = data.length;
  const [own, setOwn] = useState<number | null>(defaultIndex);
  const raw = selectedIndex !== undefined ? selectedIndex : own;
  const active = raw !== null && raw >= 0 && raw < n ? raw : null;
  const base = color ?? theme.palette[0];
  const peak = max ?? Math.max(1e-9, ...data.map((d) => Math.max(0, num(d.value))));
  const colW = n && width ? (width - gap * (n - 1)) / n : 0;
  const bw = Math.max(8, Math.min(barWidth ?? Math.min(colW, 48), colW));
  const cap = bw * 0.28; // ellipse height of the top / bottom faces
  const tipRoom = showTooltip ? 44 : 6;
  const body = height - cap; // tallest body
  const hs = data.map((d) => Math.min(body, (Math.max(0, num(d.value)) / peak) * body));

  // Each column (body + lit top) slides up inside a clip box (native thread); its floor ellipse stays put.
  const ys = useNativeValues(hs.map((h) => body - h), { animate, from: body + cap, stagger: 55, duration: 800 });
  const dims = useNativeValues(data.map((_, i) => (active === null || active === i ? 1 : inactiveOpacity)), { animate, duration: 200 });
  const shades = useMemo(() => {
    const mk = (c: string) => ({
      dark: mixColor(c, "#000000", 0.32),
      mid: c,
      light: mixColor(c, "#FFFFFF", 0.35),
      top: mixColor(c, "#FFFFFF", 0.45),
    });
    return data.map((d, i) => mk(i === active && activeColor ? activeColor : d.color ?? base));
  }, [data, active, activeColor, base]);

  const choose = (i: number | null) => {
    if (i === active) return;
    if (selectedIndex === undefined) setOwn(i);
    onSelect?.(i, i === null ? null : data[i]);
    if (i !== null) theme.haptics?.();
  };
  if (!n) return <Empty height={tipRoom + height} text={emptyText} />;

  const describe = (i: number) => `${data[i].label}: ${formatValue(num(data[i].value), data[i])}`;
  const a11y = adjustable(accessibilityLabel ?? `3D column chart, ${n} columns. ${data.slice(0, 12).map((_, i) => describe(i)).join(". ")}`, active === null ? undefined : describe(active), n, active, choose);
  const xOf = (i: number) => i * (colW + gap) + colW / 2;
  const font = { fontFamily: theme.fontFamily };

  return (
    <View style={style} onLayout={onLayout} {...a11y}>
      {width > 0 ? (
        <>
          <View style={{ height: tipRoom + height + cap / 2 }}>
            {data.map((d, i) => {
              const s = shades[i];
              const id = `cyl-${s.mid.replace(/[^a-zA-Z0-9]/g, "")}-${Math.round(bw)}`;
              return (
                <Animated.View key={`${d.label}-${i}`} style={{ position: "absolute", left: xOf(i) - bw / 2, top: tipRoom, width: bw, height: height + cap / 2, opacity: dims[i] }}>
                  {/* Empty glass track + floor shadow. */}
                  <Svg width={bw} height={height + cap / 2} style={StyleSheet.absoluteFill}>
                    {showTrack ? (
                      <>
                        <Rect x={0} y={cap / 2} width={bw} height={body} fill={theme.muted} opacity={0.6} />
                        <Ellipse cx={bw / 2} cy={cap / 2} rx={bw / 2} ry={cap / 2} fill={theme.muted} />
                      </>
                    ) : null}
                    <Ellipse cx={bw / 2} cy={body + cap / 2} rx={bw / 2} ry={cap / 2} fill={s.dark} />
                  </Svg>
                  {/* The column: clipped at the floor so it rises out of it. */}
                  <View style={{ position: "absolute", left: 0, top: 0, width: bw, height: body + cap / 2, overflow: "hidden" }}>
                    <Animated.View style={{ width: bw, height: body + cap, transform: [{ translateY: ys[i] }] }}>
                      <Svg width={bw} height={body + cap}>
                        <Defs>
                          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor={s.dark} />
                            <Stop offset="0.35" stopColor={s.light} />
                            <Stop offset="0.6" stopColor={s.mid} />
                            <Stop offset="1" stopColor={s.dark} />
                          </LinearGradient>
                        </Defs>
                        <Rect x={0} y={cap / 2} width={bw} height={body + cap / 2} fill={`url(#${id})`} />
                        <Ellipse cx={bw / 2} cy={cap / 2} rx={bw / 2} ry={cap / 2} fill={s.top} />
                      </Svg>
                    </Animated.View>
                  </View>
                  {/* Rounded floor edge over the clipped bottom. */}
                  <Svg width={bw} height={cap} style={{ position: "absolute", left: 0, top: body }}>
                    <Ellipse cx={bw / 2} cy={cap / 2} rx={bw / 2} ry={cap / 2} fill={hs[i] > 0 ? `url(#${id}-f)` : "transparent"} />
                    <Defs>
                      <LinearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={s.dark} />
                        <Stop offset="0.35" stopColor={s.light} />
                        <Stop offset="0.6" stopColor={s.mid} />
                        <Stop offset="1" stopColor={s.dark} />
                      </LinearGradient>
                    </Defs>
                  </Svg>
                </Animated.View>
              );
            })}
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
              y={active === null ? 0 : tipRoom + body - hs[active]}
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
        <View style={{ height: tipRoom + height + (showLabels ? 24 : 0) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { textAlign: "center", fontSize: 12 },
});
