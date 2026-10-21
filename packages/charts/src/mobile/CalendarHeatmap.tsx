// Habit / streak / activity calendar: a month grid, or the last N weeks (GitHub style).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchLayer, clamp, compactNumber, useReducedMotion } from "../internal";
import { TEXT_SCALE, readableTextColor } from "../kit";
import { Bubble, EASE, mixColor, num, useWidth } from "../native-kit";
import { useChartTheme } from "../theme";

export interface CalendarDatum {
  /** "YYYY-MM-DD" (read as a local date) or a Date. */
  date: string | Date;
  value: number;
}

export interface CalendarHeatmapProps {
  data: CalendarDatum[];
  /** "month": one month grid. "weeks": the last `weeks` weeks, one column per week. */
  mode?: "month" | "weeks";
  /** Month to show ("YYYY-MM" or a Date). Defaults to the latest date in data. */
  month?: string | Date;
  /** Weeks shown in "weeks" mode. */
  weeks?: number;
  /** Last day shown in "weeks" mode. Defaults to the latest date in data. */
  endDate?: string | Date;
  startOnMonday?: boolean;
  /** Strongest colour; lighter levels are blended toward the track. */
  color?: string;
  /** Explicit level colours, lightest → strongest (overrides color). */
  colors?: string[];
  trackColor?: string;
  /** Number of intensity steps. */
  levels?: number;
  /** Value of the strongest level. Defaults to the largest value. */
  max?: number;
  gap?: number;
  maxCellSize?: number;
  /** Day numbers inside month cells. */
  showDayNumbers?: boolean;
  showWeekdays?: boolean;
  showTooltip?: boolean;
  onSelect?: (date: string | null, value: number | null) => void;
  formatValue?: (value: number) => string;
  /** Bubble / screen-reader date text. */
  formatDate?: (date: Date) => string;
  animate?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "YYYY-MM-DD" → local midnight (Date("YYYY-MM-DD") would be UTC and shift a day west of Greenwich). */
function toDate(v: string | Date | undefined): Date | null {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = typeof v === "string" ? /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(v) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)) : null;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarHeatmap({
  data = [],
  mode = "month",
  month,
  weeks = 16,
  endDate,
  startOnMonday = false,
  color,
  colors,
  trackColor,
  levels = 5,
  max,
  gap = 4,
  maxCellSize = 40,
  showDayNumbers = mode === "month",
  showWeekdays = true,
  showTooltip = true,
  onSelect,
  formatValue = (v) => compactNumber(v),
  formatDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`,
  animate: animateProp = true,
  accessibilityLabel,
  style,
}: CalendarHeatmapProps) {
  const theme = useChartTheme();
  const calm = useReducedMotion();
  const animate = animateProp && !calm;
  const [width, onLayout] = useWidth();
  const [picked, setPicked] = useState<string | null>(null);

  const values = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => {
      const day = toDate(d.date);
      if (day) map.set(keyOf(day), (map.get(keyOf(day)) ?? 0) + num(d.value));
    });
    return map;
  }, [data]);
  const latest = useMemo(() => {
    let best: Date | null = null;
    data.forEach((d) => {
      const day = toDate(d.date);
      if (day && (!best || day > best)) best = day;
    });
    return best ?? new Date();
  }, [data]);

  // Cells: [column, row, date | null]. Rows are weekdays (0 = first day of the week).
  const shift = startOnMonday ? 1 : 0;
  const dow = (d: Date) => (d.getDay() + 7 - shift) % 7;
  const grid = useMemo(() => {
    const out: { col: number; row: number; date: Date }[] = [];
    if (mode === "weeks") {
      const end = toDate(endDate) ?? latest;
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - dow(end) - (Math.max(1, weeks) - 1) * 7);
      for (let i = 0; ; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (d > end) break;
        out.push({ col: Math.floor(i / 7), row: i % 7, date: d });
      }
      return { cells: out, cols: Math.max(1, weeks), rows: 7 };
    }
    const first = toDate(month) ?? new Date(latest.getFullYear(), latest.getMonth(), 1);
    const y = first.getFullYear();
    const m = first.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const lead = dow(new Date(y, m, 1));
    for (let d = 1; d <= days; d++) {
      const k = lead + d - 1;
      out.push({ col: k % 7, row: Math.floor(k / 7), date: new Date(y, m, d) });
    }
    return { cells: out, cols: 7, rows: Math.ceil((lead + days) / 7) };
  }, [mode, weeks, keyOf(latest), String(month), String(endDate), shift]);

  const strongest = color ?? theme.palette[0];
  const track = trackColor ?? theme.muted;
  const steps = Math.max(2, levels);
  const palette = colors?.length ? colors : Array.from({ length: steps }, (_, i) => mixColor(track, strongest, (i + 1) / steps));
  const peak = max ?? Math.max(1e-9, ...Array.from(values.values()));
  const levelOf = (v: number) => (v <= 0 ? -1 : clamp(Math.ceil((v / peak) * palette.length) - 1, 0, palette.length - 1));

  // "weeks" mode is wide: columns = weeks; "month" mode is 7 columns.
  const C = grid.cols;
  const R = grid.rows;
  const headH = showWeekdays && mode === "month" ? 20 : 0;
  const sideW = showWeekdays && mode === "weeks" ? 18 : 0;
  const tipRoom = showTooltip ? 50 : 0;
  const size = Math.max(6, Math.min(maxCellSize, width ? (width - sideW - gap * (C - 1)) / C : maxCellSize));
  const gridW = size * C + gap * (C - 1);
  const left = sideW + Math.max(0, (width - sideW - gridW) / 2);

  // One native value fades the cells in along the diagonal.
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const a = Animated.timing(progress, { toValue: 1, duration: 900, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [animate, grid.cells.length, values.size]);
  const fades = useMemo(
    () =>
      grid.cells.map((c) => {
        const t = (c.col + c.row) / Math.max(1, C + R - 2);
        return progress.interpolate({ inputRange: [t * 0.65, t * 0.65 + 0.35], outputRange: [0, 1], extrapolate: "clamp" });
      }),
    [grid, progress]
  );

  const at = (x: number, y: number) => {
    const c = Math.floor((x - left + gap / 2) / (size + gap));
    const r = Math.floor((y - tipRoom - headH + gap / 2) / (size + gap));
    return grid.cells.find((cell) => cell.col === c && cell.row === r) ?? null;
  };
  const choose = (cell: { date: Date } | null) => {
    const key = cell ? keyOf(cell.date) : null;
    const next = key === picked ? null : key;
    setPicked(next);
    onSelect?.(next, next === null ? null : values.get(next) ?? 0);
    if (next) theme.haptics?.();
  };
  const pickedCell = picked ? grid.cells.find((c) => keyOf(c.date) === picked) ?? null : null;
  const active = pickedCell ? grid.cells.indexOf(pickedCell) : null;
  const total = Array.from(values.values()).reduce((s, v) => s + v, 0);
  const activeDays = Array.from(values.values()).filter((v) => v > 0).length;
  const font = { fontFamily: theme.fontFamily };
  const dayNames = startOnMonday ? [...DAYS.slice(1), DAYS[0]] : DAYS;
  const height = tipRoom + headH + size * R + gap * (R - 1);

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? `Activity calendar, ${activeDays} active days, total ${formatValue(total)}`}
      accessibilityHint="Swipe up or down to read each day."
      accessibilityValue={pickedCell ? { text: `${formatDate(pickedCell.date)}: ${formatValue(values.get(picked!) ?? 0)}` } : undefined}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const d = e.nativeEvent.actionName === "increment" ? 1 : -1;
        const i = clamp(active === null ? (d > 0 ? 0 : grid.cells.length - 1) : active + d, 0, grid.cells.length - 1);
        if (grid.cells[i]) choose(grid.cells[i]);
      }}
    >
      {width > 0 ? (
        <View style={{ height }}>
          {headH
            ? dayNames.map((name, i) => (
                <Text key={i} maxFontSizeMultiplier={TEXT_SCALE} style={[styles.head, font, { left: left + i * (size + gap), width: size, top: tipRoom, color: theme.mutedForeground }]}>
                  {name}
                </Text>
              ))
            : null}
          {sideW
            ? [1, 3, 5].map((r) => (
                <Text key={r} maxFontSizeMultiplier={TEXT_SCALE} style={[styles.side, font, { top: tipRoom + r * (size + gap) + size / 2 - 7, color: theme.mutedForeground }]}>
                  {dayNames[r]}
                </Text>
              ))
            : null}
          {grid.cells.map((cell, i) => {
            const key = keyOf(cell.date);
            const v = values.get(key) ?? 0;
            const level = levelOf(v);
            const fill = level < 0 ? null : palette[level];
            const on = key === picked;
            return (
              <View
                key={key}
                style={{
                  position: "absolute",
                  left: left + cell.col * (size + gap),
                  top: tipRoom + headH + cell.row * (size + gap),
                  width: size,
                  height: size,
                  borderRadius: Math.max(2, size * 0.28),
                  backgroundColor: track,
                  borderWidth: on ? 2 : 0,
                  borderColor: theme.foreground,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {fill ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill, opacity: fades[i] }]} /> : null}
                {showDayNumbers && size >= 22 ? (
                  <Text maxFontSizeMultiplier={1.2} style={[styles.day, font, { color: fill && level >= palette.length / 2 ? readableTextColor(fill) : theme.mutedForeground }]}>
                    {cell.date.getDate()}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {showTooltip ? (
            <Bubble
              visible={!!pickedCell}
              x={pickedCell ? left + pickedCell.col * (size + gap) + size / 2 : 0}
              y={pickedCell ? tipRoom + headH + pickedCell.row * (size + gap) : 0}
              width={width}
              lines={pickedCell ? [formatValue(values.get(picked!) ?? 0), formatDate(pickedCell.date)] : [" "]}
              animate={animate}
            />
          ) : null}
          <TouchLayer onTap={(x, y) => choose(at(x, y))} />
        </View>
      ) : (
        <View style={{ height: tipRoom + headH + maxCellSize * Math.min(R, 6) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { position: "absolute", textAlign: "center", fontSize: 11 },
  side: { position: "absolute", left: 0, fontSize: 10 },
  day: { fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"] },
});
