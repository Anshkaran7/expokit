import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { motion, useKit, usePanResponder } from '@/lib/kit';

/** A wall-clock time, 24-hour: `{ hours: 0–23, minutes: 0–59 }`. */
export interface TimeValue {
  hours: number;
  minutes: number;
}
/** A calendar day without a time: `{ y, m: 0–11, d: 1–31 }`. */
export interface Day {
  y: number;
  m: number;
  d: number;
}
export type RulerTimePickerSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  /** Small line above the value, e.g. 'Reminder time:'. */
  label?: string;
  /** Time: 40 · 52 · 64pt. Date: 34 · 44 · 54pt (default 'md'). */
  size?: RulerTimePickerSize;
  /** Centre needle colour (default theme accent). */
  accent?: string;
  /** A light tap on every step, and a firmer one on each whole hour / new month (default true). */
  haptics?: boolean;
  /** A soft mechanical tick on every step, like a watch crown (default true; plays alongside other audio). */
  sound?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** The big value text (colour, weight, font family). */
  textStyle?: StyleProp<TextStyle>;
}

export interface RulerTimeProps extends CommonProps {
  /** 'time' (default): one tick per `step` minutes. */
  mode?: 'time';
  /** Controlled 24-hour time. */
  value?: TimeValue;
  /** Initial time when uncontrolled (default 09:00). */
  defaultValue?: TimeValue;
  /** Called on every step the ruler passes, while you drag. */
  onChange?: (time: TimeValue) => void;
  /** Minutes per tick (default 5). */
  step?: number;
  /** 12-hour clock with a rolling am / pm (default true). */
  hour12?: boolean;
}

export interface RulerDateProps extends CommonProps {
  /** 'date': one tick per day, with the 1st of each month marked. */
  mode: 'date';
  /** Controlled date (its time of day is kept on every change). */
  value?: Date;
  /** Initial date when uncontrolled (default today). */
  defaultValue?: Date;
  /** Called on every day the ruler passes, while you drag. */
  onChange?: (date: Date) => void;
  /** Earliest pickable day; the ruler resists past it. */
  minDate?: Date;
  /** Latest pickable day; the ruler resists past it. */
  maxDate?: Date;
  /** 'auto' shows the year only when it isn't this year (default). */
  showYear?: 'auto' | 'always' | 'never';
  /** BCP 47 tag for weekday and month names (default: device). */
  locale?: string;
}

export type RulerTimePickerProps = RulerTimeProps | RulerDateProps;

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape.
const FONT_CAP = 1.35;
const DAY = 24 * 60;
const MS_DAY = 86400000;
const TIME_SIZES: Record<RulerTimePickerSize, number> = { sm: 40, md: 52, lg: 64 };
const DATE_SIZES: Record<RulerTimePickerSize, number> = { sm: 34, md: 44, lg: 54 };
// Ruler geometry: tick pitch (a time step / a day), tallest tick, the needle, the month label row.
// Wide enough that each 5-minute step takes a deliberate bit of finger travel.
const TIME_GAP = 16;
const DATE_GAP = 12;
const TICK_W = 1.5;
const TICK_H = 26;
const NEEDLE_H = 32;
const RULER_H = 44;
const LABEL_H = 18;
// Past a limit the ruler follows the finger at this fraction of the distance.
const RUBBER = 0.3;
const ROLL = { duration: 420, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true };

const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pad2 = (n: number) => String(n).padStart(2, '0');
const toMinutes = (t: TimeValue) => mod(Math.round(t.hours) * 60 + Math.round(t.minutes), DAY);
const fromMinutes = (m: number): TimeValue => ({ hours: Math.floor(mod(m, DAY) / 60), minutes: mod(m, DAY) % 60 });

/** The time `ticks` steps of `step` minutes away from `base` (minutes after midnight), wrapping round the day. */
export function stepTime(base: number, ticks: number, step: number) {
  return mod(base + ticks * step, DAY);
}

/**
 * `'02:15 am'` / `'14:15'` split into the glyphs the picker rolls. `period` is the key ('am' / 'pm');
 * the spoken label names it with `periods` (default English, pass `useKit().labels` to localise).
 */
export function timeGlyphs(minutes: number, hour12: boolean, periods: { am: string; pm: string } = { am: 'AM', pm: 'PM' }) {
  const { hours, minutes: m } = fromMinutes(minutes);
  const h = hour12 ? hours % 12 || 12 : hours;
  const digits = pad2(h) + pad2(m);
  return {
    digits: digits.split(''),
    period: hour12 ? (hours < 12 ? ('am' as const) : ('pm' as const)) : null,
    label: `${pad2(h)}:${pad2(m)}${hour12 ? ` ${hours < 12 ? periods.am : periods.pm}` : ''}`,
  };
}

export const dayOf = (date: Date): Day => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
const utc = (t: Day) => Date.UTC(t.y, t.m, t.d);

/** The day `n` days after `base` (negative for before); month and year lengths are handled. */
export function addDays(base: Day, n: number): Day {
  const t = new Date(utc(base) + n * MS_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

/** Whole days from `a` to `b` (negative when `b` is earlier), immune to daylight-saving shifts. */
export function daysBetween(a: Day, b: Day) {
  return Math.round((utc(b) - utc(a)) / MS_DAY);
}

/** Offsets from `base`, within [from, to], that land on the 1st of a month. */
export function monthStarts(base: Day, from: number, to: number) {
  const out: number[] = [];
  let i = from - (addDays(base, from).d - 1);
  while (i <= to) {
    if (i >= from) out.push(i);
    const t = addDays(base, i);
    i += daysBetween(t, { y: t.m === 11 ? t.y + 1 : t.y, m: (t.m + 1) % 12, d: 1 });
  }
  return out;
}

const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type Names = { days: string[]; daysLong: string[]; months: string[]; monthsLong: string[] };
const nameCache = new Map<string, Names>();

/** Weekday and month names for a locale, falling back to English where Intl isn't available. */
function namesFor(locale?: string): Names {
  const key = locale ?? '';
  const hit = nameCache.get(key);
  if (hit) return hit;
  let names: Names = { days: EN_DAYS, daysLong: EN_DAYS_LONG, months: EN_MONTHS, monthsLong: EN_MONTHS_LONG };
  try {
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
    const [wd, wdl, mo, mol] = [fmt({ weekday: 'short' }), fmt({ weekday: 'long' }), fmt({ month: 'short' }), fmt({ month: 'long' })];
    // 2023-01-01 was a Sunday.
    const day = (i: number) => new Date(Date.UTC(2023, 0, 1 + i));
    const month = (i: number) => new Date(Date.UTC(2023, i, 15));
    names = {
      days: EN_DAYS.map((_, i) => wd.format(day(i)).replace(/\.$/, '')),
      daysLong: EN_DAYS.map((_, i) => wdl.format(day(i))),
      months: EN_MONTHS.map((_, i) => mo.format(month(i)).replace(/\.$/, '')),
      monthsLong: EN_MONTHS.map((_, i) => mol.format(month(i))),
    };
  } catch {
    // Keep the English names.
  }
  nameCache.set(key, names);
  return names;
}

/** `Thu, 29 Oct` (+ year) split into the pieces the picker rolls, plus a spoken label. */
export function dateParts(t: Day, showYear: 'auto' | 'always' | 'never' = 'auto', locale?: string, thisYear = new Date().getFullYear()) {
  const n = namesFor(locale);
  const wd = new Date(utc(t)).getUTCDay();
  const year = showYear === 'always' || (showYear === 'auto' && t.y !== thisYear) ? String(t.y) : null;
  return {
    weekday: n.days[wd] ?? '',
    day: String(t.d).split(''),
    month: n.months[t.m] ?? '',
    year,
    label: `${n.daysLong[wd]}, ${t.d} ${n.monthsLong[t.m]} ${t.y}`,
  };
}

/**
 * A time or date picker you scrub: drag (or fling) the tick ruler and every piece of the big value
 * rolls to its next one with a motion blur. Ticks swell in a bell around the needle, the bump trails
 * the drag, and it snaps to a step when you let go. `mode="date"` makes each tick a day, marks the
 * 1st of every month and honours min / max dates with a rubber band.
 */
export function RulerTimePicker(props: RulerTimePickerProps) {
  return props.mode === 'date' ? <DateRuler {...props} /> : <TimeRuler {...props} />;
}

function TimeRuler({ value, defaultValue, onChange, label, step: rawStep = 5, hour12 = true, size = 'md', accent, haptics = true, sound = true, accessibilityLabel, style, textStyle }: RulerTimeProps) {
  const { labels } = useKit();
  const step = Math.max(1, Math.min(60, Math.round(rawStep) || 5));
  const initial = toMinutes(value ?? defaultValue ?? { hours: 9, minutes: 0 });
  // Minutes shown, and which way the last change went (rolls go up for later, down for earlier).
  const [shown, setShown] = useState({ minutes: initial, dir: 1 as 1 | -1 });
  const base = useRef(initial);
  const live = useRef({ onChange, step, shown: initial });
  useLayoutEffect(() => {
    live.current = { onChange, step, shown: shown.minutes };
  });

  const ruler = useRuler({
    gap: TIME_GAP,
    haptics,
    sound,
    firm: (i) => stepTime(base.current, i, live.current.step) % 60 === 0,
    onStep: (i, dir) => {
      const minutes = stepTime(base.current, i, live.current.step);
      live.current.shown = minutes;
      setShown({ minutes, dir });
      live.current.onChange?.(fromMinutes(minutes));
    },
  });

  // A controlled value that isn't our own echo re-bases the ruler under the needle.
  const external = value !== undefined ? toMinutes(value) : null;
  useEffect(() => {
    if (external === null || external === live.current.shown) return;
    const forward = mod(external - live.current.shown, DAY) <= DAY / 2;
    base.current = external;
    live.current.shown = external;
    ruler.reset();
    setShown({ minutes: external, dir: forward ? 1 : -1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);

  const fontSize = TIME_SIZES[size];
  const { box, glyph } = useGlyph(fontSize, textStyle);
  const t = timeGlyphs(shown.minutes, hour12, labels);
  const [h1 = '', h2 = '', m1 = '', m2 = ''] = t.digits;
  const roll = { dir: shown.dir, height: box, style: glyph, reduce: ruler.reduce };

  return (
    <Frame ruler={ruler} label={label} name={accessibilityLabel ?? label?.replace(/:\s*$/, '') ?? labels.time} spoken={t.label} accent={accent} rulerWidth={fontSize * 5.6} style={style}>
      <View style={[styles.row, { height: box }]}>
        <Roll text={h1} {...roll} />
        <Roll text={h2} {...roll} />
        <Text maxFontSizeMultiplier={FONT_CAP} style={glyph}>:</Text>
        <Roll text={m1} {...roll} />
        <Roll text={m2} {...roll} />
        {t.period ? (
          <View style={{ marginLeft: fontSize * 0.24 }}>
            {/* Shown lowercase, as the design has it ('am' / 'pm'); the text comes from the kit labels. */}
            <Roll text={labels[t.period].toLowerCase()} {...roll} />
          </View>
        ) : null}
      </View>
    </Frame>
  );
}

function DateRuler({ value, defaultValue, onChange, label, minDate, maxDate, showYear = 'auto', locale, size = 'md', accent, haptics = true, sound = true, accessibilityLabel, style, textStyle }: RulerDateProps) {
  const [start] = useState(() => value ?? defaultValue ?? new Date());
  // Time of day handed back with every change, so picking a date never moves a set time.
  const clock = useRef({ h: start.getHours(), min: start.getMinutes() });
  const [shown, setShown] = useState({ day: dayOf(start), index: 0, dir: 1 as 1 | -1 });
  // The day at tick 0; a controlled value from outside re-bases the ruler on it.
  const [base, setBase] = useState(() => dayOf(start));
  const live = useRef({ onChange, key: utc(shown.day) });
  useLayoutEffect(() => {
    live.current = { onChange, key: utc(shown.day) };
  });

  // Limits as offsets from the base day.
  const lo = minDate ? daysBetween(base, dayOf(minDate)) : -Infinity;
  const hi = maxDate ? Math.max(lo, daysBetween(base, dayOf(maxDate))) : Infinity;

  const ruler = useRuler({
    gap: DATE_GAP,
    haptics,
    lo,
    hi,
    sound,
    firm: (i) => addDays(base, i).d === 1,
    onStep: (i, dir) => {
      const day = addDays(base, i);
      live.current.key = utc(day);
      setShown({ day, index: i, dir });
      live.current.onChange?.(new Date(day.y, day.m, day.d, clock.current.h, clock.current.min));
    },
  });

  // A controlled value that isn't our own echo re-bases the ruler under the needle.
  const external = value ? utc(dayOf(value)) : null;
  useEffect(() => {
    if (external === null || external === live.current.key || !value) return;
    const day = dayOf(value);
    clock.current = { h: value.getHours(), min: value.getMinutes() };
    const dir = external > live.current.key ? 1 : -1;
    setBase(day);
    live.current.key = external;
    ruler.reset();
    setShown({ day, index: 0, dir });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);

  const { colors, font, labels } = useKit();
  const fontSize = DATE_SIZES[size];
  const { box, glyph } = useGlyph(fontSize, textStyle);
  const gap = fontSize * 0.24;
  const p = dateParts(shown.day, showYear, locale);
  const names = namesFor(locale);
  const roll = { dir: shown.dir, height: box, style: glyph, reduce: ruler.reduce };

  // Month starts near the needle, as offsets from the base day; they slide with `pos` natively.
  const reach = ruler.width ? Math.ceil(ruler.width / 2 / DATE_GAP) + 45 : 0;
  const months = useMemo(() => {
    if (!reach) return [];
    return monthStarts(base, shown.index - reach, shown.index + reach).map((i) => {
      const t = addDays(base, i);
      return { i, name: t.m === 0 ? `${names.months[0] ?? ''} ${String(t.y).slice(2)}` : (names.months[t.m] ?? '') };
    });
  }, [shown.index, reach, names, base]);

  return (
    <Frame
      ruler={ruler}
      label={label}
      name={accessibilityLabel ?? label?.replace(/:\s*$/, '') ?? labels.date}
      spoken={p.label}
      accent={accent}
      rulerWidth={fontSize * 7}
      extra={LABEL_H}
      marks={<MonthMarks width={ruler.width} pos={ruler.pos} months={months} tick={colors.foreground} text={colors.mutedForeground} family={font.family} />}
      style={style}
    >
      <View style={[styles.row, { height: box }]}>
        <Roll text={p.weekday} {...roll} />
        <Text maxFontSizeMultiplier={FONT_CAP} style={glyph}>,</Text>
        <View style={[styles.row, { marginLeft: gap }]}>
          {p.day.map((c, i) => (
            // Keyed from the right so the units digit stays put when the day gains a digit.
            <Roll key={p.day.length - i} text={c} {...roll} />
          ))}
        </View>
        <View style={{ marginLeft: gap }}>
          <Roll text={p.month} {...roll} />
        </View>
        {p.year ? (
          <View style={{ marginLeft: gap }}>
            <Roll text={p.year} {...roll} />
          </View>
        ) : null}
      </View>
    </Frame>
  );
}

type Ruler = ReturnType<typeof useRuler>;

interface RulerOptions {
  /** Points per tick. */
  gap: number;
  haptics: boolean;
  sound: boolean;
  /** Lowest / highest tick (default unbounded). */
  lo?: number;
  hi?: number;
  /** Ticks that get a firmer haptic (a whole hour, the 1st of a month). */
  firm?: (i: number) => boolean;
  /** The tick under the needle changed; `dir` is 1 for later, -1 for earlier. */
  onStep: (i: number, dir: 1 | -1) => void;
}

/**
 * The ruler engine: an unbounded tick position driven by drag, fling and snap, with a trailing
 * "lag" for the bell bump, rubber-banding past optional limits and a haptic on every tick.
 */
function useRuler({ gap, haptics, sound, lo = -Infinity, hi = Infinity, firm, onStep }: RulerOptions) {
  const reduce = useReduceMotion();
  const tick = useTickSound(sound);
  const [pos] = useState(() => new Animated.Value(0));
  const [lag] = useState(() => new Animated.Value(0));
  const index = useRef(0);
  const posNow = useRef(0);
  const moving = useRef(false);
  const flinging = useRef(false);
  const live = useRef({ gap, haptics, lo, hi, firm, onStep, tick });
  useLayoutEffect(() => {
    live.current = { gap, haptics, lo, hi, firm, onStep, tick };
  });
  const lagMax = gap * 2.5;

  const snap = (to: number) => {
    moving.current = true;
    Animated.spring(pos, { toValue: to, useNativeDriver: true, ...motion.gentle }).start(({ finished }) => {
      if (finished) moving.current = false;
    });
  };
  const snapRef = useRef(snap);
  useLayoutEffect(() => {
    snapRef.current = snap;
  });
  const settle = (v: number) => clamp(Math.round(v), live.current.lo, live.current.hi);

  useEffect(() => {
    const id = pos.addListener(({ value: v }) => {
      posNow.current = v;
      const { lo: min, hi: max } = live.current;
      // A fling that runs past a limit is caught and settled on it.
      if (flinging.current && (v < min - 0.5 || v > max + 0.5)) {
        flinging.current = false;
        pos.stopAnimation();
        snapRef.current(clamp(Math.round(v), min, max));
      }
      const i = clamp(Math.round(v), min, max);
      if (i === index.current) return;
      const dir = i > index.current ? 1 : -1;
      index.current = i;
      const firmTick = live.current.firm?.(i) ?? false;
      if (live.current.haptics) {
        Haptics.impactAsync(firmTick ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      live.current.tick(firmTick);
      live.current.onStep(i, dir);
    });
    return () => pos.removeListener(id);
  }, [pos]);

  // Where the ruler was when the finger came down (g.dx counts from the touch, so the ruler stays
  // under the finger even though a sideways drag is claimed a few points in).
  const drag = useRef(0);
  const unlag = () => Animated.spring(lag, { toValue: 0, useNativeDriver: true, ...motion.gentle }).start();
  const pan = usePanResponder({
    // A touch only claims the ruler straight away to catch a fling; otherwise a sideways drag does.
    onStartShouldSetPanResponder: () => moving.current,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (_, g) => {
      flinging.current = false;
      pos.stopAnimation((v) => (posNow.current = v));
      lag.stopAnimation();
      moving.current = true;
      drag.current = posNow.current + g.dx / live.current.gap;
    },
    onPanResponderMove: (_, g) => {
      const { lo: min, hi: max, gap: px } = live.current;
      const raw = drag.current - g.dx / px;
      pos.setValue(raw < min ? min - (min - raw) * RUBBER : raw > max ? max + (raw - max) * RUBBER : raw);
      lag.setValue(clamp(-g.vx * 14, -lagMax, lagMax));
    },
    onPanResponderRelease: (_, g) => {
      unlag();
      const { lo: min, hi: max, gap: px } = live.current;
      const velocity = -g.vx / px; // ticks per ms
      const outside = posNow.current < min || posNow.current > max;
      if (outside || Math.abs(velocity) < 0.03) return snapRef.current(settle(posNow.current));
      flinging.current = true;
      Animated.decay(pos, { velocity, deceleration: 0.993, useNativeDriver: true }).start(({ finished }) => {
        if (!finished || !flinging.current) return;
        flinging.current = false;
        pos.stopAnimation((v) => snapRef.current(settle(v)));
      });
    },
    onPanResponderTerminate: () => {
      unlag();
      snapRef.current(settle(posNow.current));
    },
  });

  const [width, setWidth] = useState(0);
  return {
    pos,
    lag,
    pan,
    reduce,
    width,
    gap,
    onLayout: (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)),
    /** One step for screen-reader increment / decrement, within the limits. */
    nudge: (dir: 1 | -1) => {
      flinging.current = false;
      pos.stopAnimation((v) => snapRef.current(settle(Math.round(v) + dir)));
    },
    /** Puts tick 0 back under the needle without reporting a step (after a re-base). */
    reset: () => {
      pos.stopAnimation();
      moving.current = false;
      flinging.current = false;
      index.current = 0;
      posNow.current = 0;
      pos.setValue(0);
    },
  };
}

/** Big-value text metrics; the style is stable so memoised rolls only re-render on their own change. */
function useGlyph(fontSize: number, textStyle?: StyleProp<TextStyle>) {
  const { colors, font } = useKit();
  // Text scales with the user's size (capped), so the roll window does too.
  const { fontScale } = useWindowDimensions();
  const lineHeight = Math.round(fontSize * 1.17);
  const box = lineHeight * Math.min(fontScale, FONT_CAP);
  const glyph = useMemo<StyleProp<TextStyle>>(
    () => [
      styles.glyph,
      { fontSize, lineHeight, height: box, color: colors.foreground, fontFamily: font.family, letterSpacing: -fontSize * 0.02 },
      textStyle,
    ],
    [fontSize, lineHeight, box, colors.foreground, font.family, textStyle],
  );
  return { box, glyph };
}

interface FrameProps {
  ruler: Ruler;
  label?: string | undefined;
  name: string;
  spoken: string;
  accent?: string | undefined;
  rulerWidth: number;
  /** Extra height under the ticks (month labels). */
  extra?: number | undefined;
  marks?: React.ReactNode;
  style?: StyleProp<ViewStyle> | undefined;
  children: React.ReactNode;
}

/** Label, the rolling value, and the ruler with its needle; the whole frame takes the drag. */
function Frame({ ruler, label, name, spoken, accent, rulerWidth, extra = 0, marks, style, children }: FrameProps) {
  const { colors, radius, font } = useKit();
  const { width } = ruler;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={name}
      accessibilityValue={{ text: spoken }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => ruler.nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.root, styles.grab, style]}
      {...ruler.pan}
    >
      {label ? <Text style={[styles.label, { color: colors.foreground, fontFamily: font.family }]}>{label}</Text> : null}
      {children}
      <View style={[styles.ruler, { maxWidth: rulerWidth, height: RULER_H + extra }]} onLayout={ruler.onLayout}>
        {width > 0 ? (
          <>
            <Ticks width={width} gap={ruler.gap} pos={ruler.pos} lag={ruler.lag} color={colors.mutedForeground} />
            {marks}
          </>
        ) : null}
        <View
          pointerEvents="none"
          style={[styles.needle, { backgroundColor: accent ?? colors.accent, borderRadius: radius.capsule(3), left: width / 2 - 1.5 }]}
        />
      </View>
    </View>
  );
}

/** Ticks fade out toward both ends of the ruler. */
// ReturnType keeps this compiling on React Native 0.86 (generic AnimatedMultiplication) and 0.88+ (not generic).
function fade(x: Animated.AnimatedInterpolation<number> | ReturnType<typeof Animated.multiply>, half: number, gap: number) {
  return x.interpolate({
    inputRange: [-half, -half * 0.55, -gap * 2, 0, gap * 2, half * 0.55, half],
    outputRange: [0, 0.35, 0.85, 1, 0.85, 0.35, 0],
    extrapolate: 'clamp',
  });
}

interface TicksProps {
  width: number;
  gap: number;
  pos: Animated.Value;
  lag: Animated.Value;
  color: string;
}

/**
 * A fixed pool of ticks that slide by the fractional ruler position and wrap — so the ruler is
 * endless without ever re-rendering. Height swells in a bell round the (lagging) needle; ticks
 * fade out toward both ends. Everything runs on the native driver.
 */
const Ticks = React.memo(function Ticks({ width, gap, pos, lag, color }: TicksProps) {
  const half = width / 2;
  const slots = Math.ceil(half / gap) + 1;
  const ticks = useMemo(() => {
    const frac = Animated.modulo(pos, 1);
    return Array.from({ length: slots * 2 + 1 }, (_, n) => {
      const k = n - slots;
      const x = Animated.subtract(k, frac).interpolate({ inputRange: [-1, 1], outputRange: [-gap, gap], extrapolate: 'extend' });
      const fromBump = Animated.subtract(x, lag);
      return {
        k,
        x,
        scaleY: fromBump.interpolate({
          inputRange: [-gap * 6, -gap * 3, -gap * 1.5, 0, gap * 1.5, gap * 3, gap * 6],
          outputRange: [0.34, 0.46, 0.78, 1, 0.78, 0.46, 0.34],
          extrapolate: 'clamp',
        }),
        opacity: fade(x, half, gap),
      };
    });
  }, [pos, lag, slots, half, gap]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ticks.map(({ k, x, scaleY, opacity }) => (
        <Animated.View
          key={k}
          style={[styles.tick, { left: half - TICK_W / 2, backgroundColor: color, opacity, transform: [{ translateX: x }, { scaleY }] }]}
        />
      ))}
    </View>
  );
});

interface MonthMarksProps {
  width: number;
  pos: Animated.Value;
  months: { i: number; name: string }[];
  tick: string;
  text: string;
  family?: string | undefined;
}

/** A taller tick and the month's name under the 1st of each month, riding the ruler natively. */
const MonthMarks = React.memo(function MonthMarks({ width, pos, months, tick, text, family }: MonthMarksProps) {
  const half = width / 2;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {months.map(({ i, name }) => {
        const x = Animated.multiply(Animated.subtract(i, pos), DATE_GAP);
        return (
          <Animated.View key={i} style={[styles.mark, { left: half - 30, opacity: fade(x, half, DATE_GAP), transform: [{ translateX: x }] }]}>
            <View style={[styles.markTick, { backgroundColor: tick }]} />
            <Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={1} style={[styles.markText, { color: text, fontFamily: family }]}>
              {name}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
});

interface RollProps {
  text: string;
  dir: 1 | -1;
  height: number;
  style: StyleProp<TextStyle>;
  reduce: boolean;
}

// Ghost copies stacked above and below a glyph fake a vertical motion blur while it rolls: many
// close, faint copies (a few pt apart) blend into a soft smear instead of visible stripes.
const GHOSTS: [number, number][] = Array.from({ length: 7 }, (_, i) => {
  const d = (i + 1) * 0.045;
  const a = 0.13 * (1 - i / 7);
  return [
    [-d, a],
    [d, a],
  ] as [number, number][];
}).flat();

/**
 * One piece of the value that rolls to its next one: the old one slides out, the new one in from
 * the other side, both smeared by ghost copies that fade as the roll settles.
 */
const Roll = React.memo(function Roll({ text, dir, height, style, reduce }: RollProps) {
  const [t] = useState(() => new Animated.Value(1));
  const last = useRef(text);
  const [pair, setPair] = useState({ prev: text, cur: text, dir });

  useEffect(() => {
    if (text === last.current) return;
    setPair({ prev: last.current, cur: text, dir });
    last.current = text;
    t.stopAnimation();
    if (reduce) return t.setValue(1);
    t.setValue(0);
    Animated.timing(t, { toValue: 1, ...ROLL }).start();
  }, [text, dir, reduce, t]);

  const blur = t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.8, 0] });
  const sharp = t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.08, 0.3, 1] });
  const layer = (s: string, y: Animated.AnimatedInterpolation<number>, outgoing: boolean) => (
    <Animated.View style={[outgoing && styles.out, { transform: [{ translateY: y }] }]}>
      {GHOSTS.map(([dy, a], i) => (
        <Animated.Text
          key={i}
          maxFontSizeMultiplier={FONT_CAP}
          numberOfLines={1}
          style={[style, styles.ghost, { opacity: Animated.multiply(blur, a), transform: [{ translateY: dy * height }] }]}
        >
          {s}
        </Animated.Text>
      ))}
      <Animated.Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={1} style={[style, { opacity: sharp }]}>
        {s}
      </Animated.Text>
    </Animated.View>
  );

  return (
    <View style={{ height, overflow: 'hidden', alignItems: 'center' }}>
      {layer(pair.cur, t.interpolate({ inputRange: [0, 1], outputRange: [pair.dir * height * 0.9, 0] }), false)}
      {pair.prev !== pair.cur
        ? layer(pair.prev, t.interpolate({ inputRange: [0, 1], outputRange: [0, -pair.dir * height * 0.9] }), true)
        : null}
    </View>
  );
});

// A ~20 ms tick synthesised once into the cache as a WAV (a decaying 2.6 kHz ping with a little
// noise), so the component ships no audio file. A few players take turns so fast scrubs overlap.
const TICK_RATE = 22050;
let tickUri: string | null = null;

function tickWav() {
  const n = Math.round(TICK_RATE * 0.02);
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, TICK_RATE, true);
  v.setUint32(28, TICK_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    const t = i / TICK_RATE;
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647) * 2 - 1;
    const sample = (Math.sin(2 * Math.PI * 2600 * t) * 0.7 + noise * 0.3) * Math.exp(-t * 320);
    v.setInt16(44 + i * 2, Math.round(sample * 0.55 * 32767), true);
  }
  return bytes;
}

function tickSource() {
  if (tickUri) return tickUri;
  const file = new File(Paths.cache, 'expokit-ruler-tick.wav');
  if (!file.exists) file.writeSync(tickWav());
  tickUri = file.uri;
  return tickUri;
}

/** Returns `tick(firm)`: plays the tick (louder when firm), at most one every 25 ms. No-op on web or when off. */
function useTickSound(enabled: boolean) {
  const pool = useRef<AudioPlayer[]>([]);
  const state = useRef({ next: 0, last: 0 });
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    try {
      const uri = tickSource();
      pool.current = [0, 1, 2].map(() => createAudioPlayer(uri));
    } catch {
      pool.current = [];
    }
    return () => {
      pool.current.forEach((p) => p.remove());
      pool.current = [];
    };
  }, [enabled]);
  return (firm: boolean) => {
    const now = Date.now();
    if (!pool.current.length || now - state.current.last < 25) return;
    state.current.last = now;
    const player = pool.current[state.current.next++ % pool.current.length];
    if (!player) return;
    player.volume = firm ? 0.9 : 0.5;
    player.seekTo(0).catch(() => {});
    player.play();
  };
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'stretch', paddingVertical: 8 },
  grab: Platform.OS === 'web' ? ({ userSelect: 'none', cursor: 'grab', touchAction: 'pan-y' } as object) : {},
  label: { fontSize: 15, lineHeight: 20, fontWeight: '500', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  glyph: { fontWeight: '600', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
  ghost: { position: 'absolute', left: 0, right: 0, top: 0 },
  // The outgoing piece may be wider than the incoming one (Wed → Fri): centred, it spills evenly.
  out: { position: 'absolute', top: 0, left: -200, right: -200, alignItems: 'center' },
  ruler: { width: '100%', marginTop: 14, overflow: 'hidden' },
  tick: { position: 'absolute', top: (RULER_H - TICK_H) / 2, width: TICK_W, height: TICK_H, borderRadius: TICK_W / 2 },
  needle: { position: 'absolute', top: (RULER_H - NEEDLE_H) / 2, width: 3, height: NEEDLE_H },
  mark: { position: 'absolute', top: (RULER_H - TICK_H) / 2 - 2, width: 60, alignItems: 'center' },
  markTick: { width: 2, height: TICK_H + 4, borderRadius: 1, opacity: 0.55 },
  markText: { fontSize: 11, lineHeight: 14, fontWeight: '600', marginTop: (RULER_H - TICK_H) / 2, letterSpacing: 0.2 },
});
