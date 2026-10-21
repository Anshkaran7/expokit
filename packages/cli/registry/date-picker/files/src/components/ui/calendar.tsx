import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type CalendarMode = 'single' | 'range' | 'multiple';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type CalendarValue = Date | DateRange | Date[] | null;

/** `{ 'YYYY-MM-DD': colour | colour[] }` — up to three dots under a date. Build keys with `toDateKey`. */
export type CalendarMarks = Record<string, string | string[]>;

export interface CalendarBaseProps {
  /** Controlled visible month (any date inside it). */
  month?: Date;
  /** Month shown first (default: the selected date, else today). */
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1;
  /** BCP 47 locale for month and weekday names (default: device locale). */
  locale?: string;
  /** Earliest selectable day. */
  minDate?: Date;
  /** Latest selectable day. */
  maxDate?: Date;
  /** Return true to disable a day (booked, holidays…). */
  isDateDisabled?: (date: Date) => boolean;
  /** Coloured dots under dates: `{ [toDateKey(date)]: '#22c55e' | ['#22c55e', '#f59e0b'] }`. */
  markedDates?: CalendarMarks;
  /** Fill whole days with a colour (birthdays, shifts, people…): `{ [toDateKey(date)]: '#f472b6' }`. */
  highlightedDates?: Record<string, string>;
  /** `tiles` puts every day on a soft tile; `minimal` shows bare numbers. */
  variant?: 'tiles' | 'minimal';
  /** Weekday header: `narrow` (M T W) or `short` (Mon Tue Wed). */
  weekdayFormat?: 'narrow' | 'short';
  /** Show a "Today" pill in the header while another month is on screen. */
  showTodayButton?: boolean;
  /** Show the faded trailing / leading days of the neighbouring months. */
  showOutsideDays?: boolean;
  /** Ring and tint today's date. */
  showToday?: boolean;
  /** Always render six week rows so the height never changes between months. */
  fixedWeeks?: boolean;
  /** Tap the month title to jump through a month / year grid. */
  monthPicker?: boolean;
  /** Most dates selectable in `multiple` mode. */
  max?: number;
  /** Selection and today colour (default: theme accent). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

export interface CalendarSingleProps {
  mode?: 'single';
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date) => void;
}

export interface CalendarRangeProps {
  mode: 'range';
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  /** Fires on every tap: first with `{ start, end: null }`, then with both ends. */
  onChange?: (range: DateRange) => void;
}

export interface CalendarMultipleProps {
  mode: 'multiple';
  value?: Date[];
  defaultValue?: Date[];
  onChange?: (dates: Date[]) => void;
}

export type CalendarProps = CalendarBaseProps & (CalendarSingleProps | CalendarRangeProps | CalendarMultipleProps);

type FlatProps = CalendarBaseProps & {
  mode?: CalendarMode;
  value?: CalendarValue;
  defaultValue?: CalendarValue;
  onChange?: (value: CalendarValue) => void;
};

const CELL_H = 48;
const CIRCLE = 38;
const CIRCLE_TOP = 2;
/** Day tile corner from the kit radius: square at 0, a full circle from radius 16 up. */
const tileRadius = (md: number) => Math.min(CIRCLE / 2, Math.round(md * 1.25));
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ───────────────────────── date helpers (plain Date, local time) ───────────────────────── */

/** Local `YYYY-MM-DD` key for `markedDates`. */
export function toDateKey(date: Date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${date.getFullYear()}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}
/** Midnight of the same local day. */
export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
/** Same local calendar day. */
export function isSameDay(a?: Date | null, b?: Date | null) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** `date` moved by `n` days (DST-safe). */
export function addDays(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

function buildWeeks(month: Date, weekStartsOn: number, fixed: boolean) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const offset = (new Date(y, m, 1).getDay() - weekStartsOn + 7) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const rows = fixed ? 6 : Math.ceil((offset + days) / 7);
  const weeks: Date[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 7; c++) row.push(new Date(y, m, 1 - offset + r * 7 + c));
    weeks.push(row);
  }
  return weeks;
}

function useFormatters(locale?: string) {
  return useMemo(() => {
    const make = (o: Intl.DateTimeFormatOptions, fallback: (d: Date) => string) => {
      try {
        const f = new Intl.DateTimeFormat(locale, o);
        return (d: Date) => f.format(d);
      } catch {
        return fallback;
      }
    };
    return {
      title: make({ month: 'long', year: 'numeric' }, (d) => `${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`),
      month: make({ month: 'short' }, (d) => EN_MONTHS[d.getMonth()].slice(0, 3)),
      weekday: make({ weekday: 'short' }, (d) => EN_DAYS[d.getDay()]),
      weekdayNarrow: make({ weekday: 'narrow' }, (d) => EN_DAYS[d.getDay()][0]),
      weekdayLong: make({ weekday: 'long' }, (d) => EN_DAYS[d.getDay()]),
      full: make({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, (d) => d.toDateString()),
    };
  }, [locale]);
}

/* ───────────────────────────────────── Calendar ───────────────────────────────────── */

/**
 * Month calendar with single, range and multi-date selection. Months slide in from the
 * direction you travel (tap the chevrons or swipe the grid), the title opens a month / year
 * grid, selections pop with a spring and ranges draw one continuous band with rounded ends.
 * Supports min / max / custom disabled days, a today ring and coloured event dots.
 */
export function Calendar(props: CalendarProps) {
  const {
    mode = 'single',
    value,
    defaultValue,
    onChange,
    month,
    defaultMonth,
    onMonthChange,
    weekStartsOn = 0,
    locale,
    minDate,
    maxDate,
    isDateDisabled,
    markedDates,
    highlightedDates,
    variant = 'tiles',
    weekdayFormat = 'narrow',
    showTodayButton = true,
    showOutsideDays = false,
    showToday = true,
    fixedWeeks = false,
    monthPicker = true,
    max,
    accent,
    style,
  } = props as unknown as FlatProps;
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const tint = accent ?? colors.accent;
  const fmt = useFormatters(locale);

  const [inner, setInner] = useState<CalendarValue>(defaultValue ?? null);
  const current = value !== undefined ? value : inner;
  const single = mode === 'single' && current instanceof Date ? current : null;
  const range = mode === 'range' && current && !(current instanceof Date) && !Array.isArray(current) ? current : null;
  const many = mode === 'multiple' && Array.isArray(current) ? current : null;

  const [innerMonth, setInnerMonth] = useState(() => {
    const today = new Date();
    const fallback = minDate && minDate > today ? minDate : maxDate && maxDate < today ? maxDate : today;
    return startOfMonth(defaultMonth ?? single ?? range?.start ?? many?.[0] ?? fallback);
  });
  const controlledKey = month ? monthIndex(month) : null;
  const visible = useMemo(
    () => (controlledKey !== null ? new Date(Math.floor(controlledKey / 12), controlledKey % 12, 1) : innerMonth),
    [controlledKey, innerMonth]
  );

  const minM = minDate ? monthIndex(minDate) : -Infinity;
  const maxM = maxDate ? monthIndex(maxDate) : Infinity;
  const goTo = useCallback(
    (m: Date) => {
      const next = startOfMonth(m);
      const idx = monthIndex(next);
      if (idx < minM || idx > maxM) return;
      if (month === undefined) setInnerMonth(next);
      onMonthChange?.(next);
    },
    [month, onMonthChange, minM, maxM]
  );

  /* month slide transition */
  const [width, setWidth] = useState(0);
  const slide = useRef(new Animated.Value(1)).current; // native
  const [leaving, setLeaving] = useState<{ month: Date; dir: number } | null>(null);
  const dirRef = useRef(1);
  const shownRef = useRef(visible);
  const visibleKey = monthIndex(visible);
  useLayoutEffect(() => {
    const prev = shownRef.current;
    if (monthIndex(prev) === visibleKey) return;
    shownRef.current = visible;
    const dir = visibleKey > monthIndex(prev) ? 1 : -1;
    dirRef.current = dir;
    setLeaving({ month: prev, dir });
    slide.stopAnimation();
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, ...motion.gentle }).start(({ finished }) => {
      if (finished) setLeaving(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  /* days / months / years view */
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [pickYear, setPickYear] = useState(visible.getFullYear());
  const viewAnim = useRef(new Animated.Value(1)).current; // native
  const [gridH, setGridH] = useState(0);
  const switchView = (next: 'days' | 'months' | 'years') => {
    if (next !== 'days' && view === 'days') setPickYear(visible.getFullYear());
    setView(next);
    viewAnim.setValue(0);
    Animated.spring(viewAnim, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  };

  /* selection */
  const stateRef = useRef({ mode, current, value, onChange, max, visible, goTo });
  stateRef.current = { mode, current, value, onChange, max, visible, goTo };
  const onDayPress = useCallback((d: Date) => {
    const s = stateRef.current;
    let next: CalendarValue;
    if (s.mode === 'range') {
      const r = s.current && !(s.current instanceof Date) && !Array.isArray(s.current) ? s.current : null;
      if (!r?.start || r.end || d < r.start) next = { start: d, end: null };
      else next = { start: r.start, end: d };
    } else if (s.mode === 'multiple') {
      const list = Array.isArray(s.current) ? s.current : [];
      const has = list.some((x) => isSameDay(x, d));
      if (has) next = list.filter((x) => !isSameDay(x, d));
      else if (s.max !== undefined && list.length >= s.max) return;
      else next = [...list, d].sort((a, b) => a.getTime() - b.getTime());
    } else {
      next = d;
    }
    if (s.value === undefined) setInner(next);
    s.onChange?.(next);
    if (monthIndex(d) !== monthIndex(s.visible)) s.goTo(d);
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderRelease: (_, g) => {
          const s = stateRef.current;
          if (g.dx < -40 || g.vx < -0.5) s.goTo(addMonths(s.visible, 1));
          else if (g.dx > 40 || g.vx > 0.5) s.goTo(addMonths(s.visible, -1));
        },
      }),
    []
  );

  const weekdays = useMemo(() => {
    const base = new Date(2023, 0, 1); // a Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, (i + weekStartsOn) % 7);
      return { short: weekdayFormat === 'narrow' ? fmt.weekdayNarrow(d) : fmt.weekday(d), long: fmt.weekdayLong(d) };
    });
  }, [fmt, weekStartsOn, weekdayFormat]);

  const gridProps: Omit<MonthGridProps, 'month'> = {
    weekStartsOn,
    fixedWeeks,
    showOutsideDays,
    showToday,
    minDate,
    maxDate,
    isDateDisabled,
    markedDates,
    highlightedDates,
    tiles: variant === 'tiles',
    singleKey: single ? toDateKey(single) : undefined,
    rangeStart: range?.start ? startOfDay(range.start).getTime() : undefined,
    rangeEnd: range?.end ? startOfDay(range.end).getTime() : undefined,
    manyKeys: many ? many.map(toDateKey).join('|') : undefined,
    tint,
    fullLabel: fmt.full,
    onDayPress,
  };

  const W = width || 320;
  const dir = dirRef.current;
  const prevDisabled = view === 'days' ? monthIndex(visible) - 1 < minM : view === 'months' ? pickYear * 12 - 1 < minM : false;
  const nextDisabled = view === 'days' ? monthIndex(visible) + 1 > maxM : view === 'months' ? (pickYear + 1) * 12 > maxM : false;
  const decadeStart = Math.floor(pickYear / 12) * 12;

  const step = (n: number) => {
    if (view === 'days') goTo(addMonths(visible, n));
    else if (view === 'months') setPickYear((y) => y + n);
    else setPickYear((y) => y + n * 12);
  };

  const title =
    view === 'days' ? fmt.title(visible) : view === 'months' ? String(pickYear) : `${decadeStart} – ${decadeStart + 11}`;
  const today = new Date();
  const todayM = monthIndex(today);
  const showJump = showTodayButton && view === 'days' && monthIndex(visible) !== todayM && todayM >= minM && todayM <= maxM;
  const tileR = tileRadius(radius.md);

  return (
    <View style={[styles.root, style]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <Pressable
          onPress={monthPicker ? () => switchView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days') : undefined}
          disabled={!monthPicker}
          accessibilityRole={monthPicker ? 'button' : 'header'}
          accessibilityLabel={monthPicker ? `${title}, ${view === 'days' ? 'choose month' : view === 'months' ? 'choose year' : 'back to days'}` : title}
          hitSlop={6}
          style={({ pressed }) => [styles.titleBtn, { borderRadius: radius.sm, backgroundColor: pressed ? colors.muted : 'transparent' }]}
        >
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.title,
              ff,
              { color: view === 'days' ? colors.foreground : tint },
              view === 'days'
                ? {
                    opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1], extrapolate: 'clamp' }),
                    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [dir * 14, 0] }) }],
                  }
                : null,
            ]}
          >
            {title}
          </Animated.Text>
          {monthPicker ? <Chevron turned={view !== 'days'} color={view === 'days' ? colors.mutedForeground : tint} /> : null}
        </Pressable>
        <View style={styles.navs}>
          {showJump ? (
            <Pressable
              onPress={() => goTo(today)}
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              hitSlop={4}
              style={({ pressed }) => [styles.todayBtn, { borderRadius: radius.capsule(32), backgroundColor: pressed ? colors.secondary : colors.muted }]}
            >
              <Text style={[styles.todayText, ff, { color: tint }]}>Today</Text>
            </Pressable>
          ) : null}
          <NavButton dir={-1} disabled={prevDisabled} onPress={() => step(-1)} />
          <NavButton dir={1} disabled={nextDisabled} onPress={() => step(1)} />
        </View>
      </View>

      {view === 'days' ? (
        <Animated.View
          style={{
            opacity: viewAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: viewAnim.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }],
          }}
        >
          <View style={styles.weekRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {weekdays.map((w) => (
              <Text key={w.long} numberOfLines={1} style={[styles.weekday, ff, { color: colors.mutedForeground }]}>
                {w.short}
              </Text>
            ))}
          </View>
          <View {...pan.panHandlers} style={styles.gridClip} onLayout={(e) => setGridH(e.nativeEvent.layout.height)}>
            {leaving ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.leaving,
                  {
                    opacity: slide.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: 'clamp' }),
                    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, -leaving.dir * W * 0.6] }) }],
                  },
                ]}
              >
                <MonthGrid month={leaving.month} {...gridProps} />
              </Animated.View>
            ) : null}
            <Animated.View
              style={{
                opacity: slide.interpolate({ inputRange: [0.15, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [dir * W * 0.6, 0] }) }],
              }}
            >
              <MonthGrid month={visible} {...gridProps} />
            </Animated.View>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            styles.pickGrid,
            { minHeight: gridH ? gridH + 28 : undefined },
            {
              opacity: viewAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              transform: [{ scale: viewAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          {Array.from({ length: 12 }, (_, i) => {
            const isMonths = view === 'months';
            const idx = isMonths ? pickYear * 12 + i : 0;
            const year = decadeStart + i;
            const label = isMonths ? fmt.month(new Date(pickYear, i, 1)) : String(year);
            const selected = isMonths ? idx === monthIndex(visible) : year === visible.getFullYear();
            const isNow = isMonths ? idx === monthIndex(today) : year === today.getFullYear();
            const disabled = isMonths ? idx < minM || idx > maxM : year * 12 + 11 < minM || year * 12 > maxM;
            return (
              <Pressable
                key={label + i}
                disabled={disabled}
                onPress={() => {
                  if (isMonths) {
                    goTo(new Date(pickYear, i, 1));
                    switchView('days');
                  } else {
                    setPickYear(year);
                    switchView('months');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={isMonths ? fmt.title(new Date(pickYear, i, 1)) : label}
                accessibilityState={{ selected, disabled }}
                style={styles.pickCell}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.pickInner,
                      {
                        borderRadius: Math.min(20, tileR),
                        backgroundColor: selected ? tint : pressed ? colors.secondary : variant === 'tiles' ? colors.muted : 'transparent',
                        borderColor: isNow && !selected ? alpha(tint, 0.45) : 'transparent',
                        opacity: disabled ? 0.35 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.pickText, ff, { color: selected ? readableOn(tint) : isNow ? tint : colors.foreground }]}>{label}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

/* ───────────────────────────────────── grid ───────────────────────────────────── */

interface MonthGridProps {
  month: Date;
  weekStartsOn: number;
  fixedWeeks: boolean;
  showOutsideDays: boolean;
  showToday: boolean;
  minDate?: Date;
  maxDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
  markedDates?: CalendarMarks;
  highlightedDates?: Record<string, string>;
  tiles: boolean;
  singleKey?: string;
  rangeStart?: number;
  rangeEnd?: number;
  manyKeys?: string;
  tint: string;
  fullLabel: (d: Date) => string;
  onDayPress: (d: Date) => void;
}

const MonthGrid = memo(function MonthGrid({
  month,
  weekStartsOn,
  fixedWeeks,
  showOutsideDays,
  showToday,
  minDate,
  maxDate,
  isDateDisabled,
  markedDates,
  highlightedDates,
  tiles,
  singleKey,
  rangeStart,
  rangeEnd,
  manyKeys,
  tint,
  fullLabel,
  onDayPress,
}: MonthGridProps) {
  const weeks = useMemo(() => buildWeeks(month, weekStartsOn, fixedWeeks), [month, weekStartsOn, fixedWeeks]);
  const many = useMemo(() => (manyKeys ? new Set(manyKeys.split('|')) : null), [manyKeys]);
  const todayKey = toDateKey(new Date());
  const min = minDate ? startOfDay(minDate).getTime() : -Infinity;
  const max = maxDate ? startOfDay(maxDate).getTime() : Infinity;
  const m = month.getMonth();
  const hasEnd = rangeStart !== undefined && rangeEnd !== undefined && rangeEnd > rangeStart;

  return (
    <View>
      {weeks.map((week, r) => (
        <View key={r} style={styles.week}>
          {week.map((d, c) => {
            const inMonth = d.getMonth() === m;
            if (!inMonth && !showOutsideDays) return <View key={c} style={styles.cell} />;
            const key = toDateKey(d);
            const t = d.getTime();
            const disabled = t < min || t > max || !!isDateDisabled?.(d);
            const isStart = rangeStart === t;
            const isEnd = rangeEnd === t;
            const selected = key === singleKey || isStart || isEnd || !!many?.has(key);
            const inBand = hasEnd && t >= rangeStart! && t <= rangeEnd!;
            // A band edge is rounded at the start / end of a week row, or where hidden outside days begin.
            const firstVisible = c === 0 || (!showOutsideDays && d.getDate() === 1);
            const lastVisible = c === 6 || (!showOutsideDays && addDays(d, 1).getMonth() !== m);
            return (
              <DayCell
                key={c}
                date={d}
                label={String(d.getDate())}
                a11y={`${fullLabel(d)}${key === todayKey ? ', today' : ''}${markedDates?.[key] ? ', has events' : ''}`}
                outside={!inMonth}
                disabled={disabled}
                selected={selected}
                today={showToday && key === todayKey}
                band={
                  // No half-band off the edge of a row: a start in the last column, an end in the first
                  // column or a one-day range has nothing to connect to.
                  !inBand || (isStart && isEnd) || (isStart && lastVisible) || (isEnd && firstVisible)
                    ? 'none'
                    : isStart
                      ? 'start'
                      : isEnd
                        ? 'end'
                        : 'mid'
                }
                roundLeft={firstVisible}
                roundRight={lastVisible}
                marks={markedDates?.[key]}
                highlight={highlightedDates?.[key]}
                tile={tiles && inMonth && !inBand}
                tint={tint}
                onPress={onDayPress}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
});

interface DayCellProps {
  date: Date;
  label: string;
  a11y: string;
  outside: boolean;
  disabled: boolean;
  selected: boolean;
  today: boolean;
  band: 'none' | 'start' | 'mid' | 'end';
  roundLeft: boolean;
  roundRight: boolean;
  marks?: string | string[];
  highlight?: string;
  tile: boolean;
  tint: string;
  onPress: (d: Date) => void;
}

const DayCell = memo(function DayCell({
  date,
  label,
  a11y,
  outside,
  disabled,
  selected,
  today,
  band,
  roundLeft,
  roundRight,
  marks,
  highlight,
  tile,
  tint,
  onPress,
}: DayCellProps) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const r = tileRadius(radius.md);
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current; // native: circle scale + opacity
  const bandIn = useRef(new Animated.Value(band === 'none' ? 0 : 1)).current; // native: band opacity
  useEffect(() => {
    Animated.spring(pop, { toValue: selected ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [selected, pop]);
  useEffect(() => {
    Animated.timing(bandIn, { toValue: band === 'none' ? 0 : 1, duration: motion.normal, useNativeDriver: true }).start();
  }, [band, bandIn]);

  const on = readableOn(tint);
  const dots = marks ? (Array.isArray(marks) ? marks : [marks]).slice(0, 3) : null;
  const textColor = selected ? on : highlight ? readableOn(highlight) : disabled ? colors.mutedForeground : today ? tint : colors.foreground;
  const bandRound = r;

  return (
    <Pressable
      onPress={() => onPress(date)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled }}
      style={styles.cell}
    >
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <>
          {band !== 'none' ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.band,
                {
                  backgroundColor: alpha(tint, 0.14),
                  opacity: bandIn,
                  left: band === 'start' ? '50%' : 0,
                  right: band === 'end' ? '50%' : 0,
                  borderTopLeftRadius: band === 'mid' && roundLeft ? bandRound : 0,
                  borderBottomLeftRadius: band === 'mid' && roundLeft ? bandRound : 0,
                  borderTopRightRadius: band === 'mid' && roundRight ? bandRound : 0,
                  borderBottomRightRadius: band === 'mid' && roundRight ? bandRound : 0,
                },
              ]}
            />
          ) : null}
          <View
            pointerEvents="none"
            style={[
              styles.circle,
              {
                borderRadius: r,
                backgroundColor:
                  !selected && !disabled && (pressed || hovered)
                    ? highlight
                      ? alpha(highlight, 0.8)
                      : tile
                        ? colors.secondary
                        : colors.muted
                    : highlight ?? (tile ? colors.muted : 'transparent'),
                borderColor: today && !selected ? tint : 'transparent',
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.circle,
              styles.fill,
              {
                borderRadius: r,
                backgroundColor: tint,
                opacity: pop.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
              },
            ]}
          />
          <View pointerEvents="none" style={styles.label}>
            <Text
              style={[
                styles.day,
                ff,
                { color: textColor },
                (today || selected) && styles.dayStrong,
                outside && !selected && styles.outside,
                disabled && styles.disabledText,
              ]}
            >
              {label}
            </Text>
          </View>
          {dots ? (
            <View pointerEvents="none" style={styles.dots}>
              {dots.map((color, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
});

/* ───────────────────────────────────── bits ───────────────────────────────────── */

function NavButton({ dir, disabled, onPress }: { dir: 1 | -1; disabled: boolean; onPress: () => void }) {
  const { colors } = useKit();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? 'Previous' : 'Next'}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.nav, { backgroundColor: pressed ? colors.secondary : colors.muted, opacity: disabled ? 0.3 : 1 }]}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d={dir < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'}
          stroke={colors.foreground}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

function Chevron({ turned, color }: { turned: boolean; color: string }) {
  const turn = useRef(new Animated.Value(turned ? 1 : 0)).current; // native
  useEffect(() => {
    Animated.spring(turn, { toValue: turned ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [turned, turn]);
  return (
    <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path d="m6 9 6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 40 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 6, marginLeft: -6, flexShrink: 1 },
  title: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3, flexShrink: 1 },
  navs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nav: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 32, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: 13, fontWeight: '400' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '400', letterSpacing: 0.2 },
  gridClip: { overflow: 'hidden' },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  week: { flexDirection: 'row', marginVertical: 1 },
  cell: { flex: 1, height: CELL_H, alignItems: 'center' },
  label: { position: 'absolute', top: CIRCLE_TOP, height: CIRCLE, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: CIRCLE_TOP, height: CIRCLE },
  circle: {
    position: 'absolute',
    top: CIRCLE_TOP,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 1.5,
    alignSelf: 'center',
  },
  fill: { borderWidth: 0 },
  day: { fontSize: 15, fontWeight: '400', fontVariant: ['tabular-nums'] },
  dayStrong: { fontWeight: '400' },
  outside: { opacity: 0.4 },
  disabledText: { opacity: 0.35 },
  dots: { position: 'absolute', top: CIRCLE_TOP + CIRCLE + 3, flexDirection: 'row', gap: 2.5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', paddingTop: 4 },
  pickCell: { width: '33.333%', height: 56, alignItems: 'center', justifyContent: 'center' },
  pickInner: { minWidth: 76, height: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  pickText: { fontSize: 15, fontWeight: '400' },
});
