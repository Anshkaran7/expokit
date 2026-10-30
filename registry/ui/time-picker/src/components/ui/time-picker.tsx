import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit, useLayout, usePanResponder } from '@/lib/kit';

/** A wall-clock time, 24-hour: `{ hours: 0–23, minutes: 0–59 }`. */
export interface TimeValue {
  hours: number;
  minutes: number;
}
/** A TimeValue or a `'HH:mm'` string such as `'09:30'` or `'17:00'`. */
export type TimeInput = TimeValue | string;
export type TimePickerVariant = 'wheel' | 'chips' | 'clock';
export type TimePickerPresentation = 'inline' | 'sheet';
export type TimePickerSize = 'sm' | 'md' | 'lg';

export interface TimePickerProps {
  value?: TimeValue | null;
  defaultValue?: TimeValue | null;
  onChange?: (time: TimeValue) => void;
  /** 'wheel' — iOS-style 3D drums · 'chips' — a grid of bookable slots · 'clock' — a Material 3-style analog dial. */
  variant?: TimePickerVariant;
  /** 'inline' renders the picker in place · 'sheet' renders a field that opens it in a bottom sheet. */
  presentation?: TimePickerPresentation;
  /** 12-hour clock with an AM / PM column (default: from the locale). */
  hour12?: boolean;
  /** Minute step: wheel / clock default 1, chips default 30. The clock labels every 5 minutes and snaps to this step. */
  minuteInterval?: number;
  /** Locale used to pick the default clock (12h / 24h). */
  locale?: string;
  /** Chips: first slot (default '09:00'). */
  startTime?: TimeInput;
  /** Chips: closing time — the last slot starts one interval before it (default '17:00'). */
  endTime?: TimeInput;
  /** Chips: explicit slot list (overrides start / end / interval). */
  slots?: TimeInput[];
  /** Chips: slots that are taken — struck through and not selectable. */
  bookedTimes?: TimeInput[];
  /** Chips: slots that are unavailable for any other reason. */
  disabledTimes?: TimeInput[];
  /** Chips: columns in the grid. */
  columns?: number;
  /** Chips: split slots under Morning / Afternoon / Evening headings. */
  groupByPeriod?: boolean;
  /** Sheet: field label (floats onto the border once filled). */
  label?: string;
  /** Sheet: `false` puts the label above the field as static text (no notch) and shows `placeholder` inside. */
  floatingLabel?: boolean;
  /** Sheet: heading (default: label). */
  title?: string;
  placeholder?: string;
  /** Sheet: field height and type size. */
  size?: TimePickerSize;
  /** Sheet: stage the choice behind Cancel / Set (default: true for wheel and clock, false for chips). */
  confirm?: boolean;
  error?: string;
  success?: boolean | string;
  helper?: string;
  disabled?: boolean;
  /** Selection, focus and halo colour (default: theme accent). */
  accent?: string;
  /** Background behind the field — the floating label cuts its notch with this colour. */
  surface?: string;
  /** Root: the wheel / chip grid inline, or the field wrapper (the one that shakes) as a sheet. */
  style?: StyleProp<ViewStyle>;
  /**
   * Sheet: the trigger box — background, border width / colour, radius, height, padding. Applied
   * after the computed style, so it wins. A `borderColor` replaces the resting border only — open
   * (accent), error and success colours still take over. A numeric `height` / `borderRadius` also
   * re-centres the label and resizes the focus halo.
   */
  fieldStyle?: StyleProp<ViewStyle>;
  /** Sheet: the formatted time text in the trigger. */
  inputStyle?: StyleProp<TextStyle>;
  /**
   * Sheet: the label, floating or above the field. Its `color` is the resting colour; open (accent),
   * error and success colours still take over. A `fontSize` sets the resting size and the label
   * floats at the same ratio; the notch follows the rendered label width.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Sheet: helper / error / success text. `color` applies to the helper; error and success keep their tone colour. */
  messageStyle?: StyleProp<TextStyle>;
  /** Sheet: colour of the placeholder in the trigger (default: theme mutedForeground). */
  placeholderTextColor?: string;
  /** Sheet: clock icon colour at rest (it turns accent while open). */
  iconColor?: string;
  /** Sheet: the sheet / dialog panel — background, border, radius, padding, shadow. Don't pass `transform` or `opacity`: they animate. */
  menuStyle?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const ITEM = 44;
const VISIBLE = 5;
const PAD = ITEM * Math.floor(VISIBLE / 2);
const SIZES: Record<TimePickerSize, { h: number; font: number; pad: number; icon: number }> = {
  sm: { h: 46, font: 15, pad: 12, icon: 17 },
  md: { h: 56, font: 16, pad: 16, icon: 19 },
  lg: { h: 66, font: 17.5, pad: 18, icon: 21 },
};
const FLOAT_SCALE = 0.78;
/** Font size of the static label used when `floatingLabel` is false. */
const LABEL_ABOVE_FONT: Record<TimePickerSize, number> = { sm: 13, md: 14, lg: 14.5 };

/* ───────────────────────────── helpers ───────────────────────────── */

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

/** Parses `'9:30'`, `'09:30'` or a TimeValue. */
export function parseTime(t: TimeInput): TimeValue {
  if (typeof t !== 'string') return t;
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return { hours: (h || 0) % 24, minutes: (m || 0) % 60 };
}
const toMin = (t: TimeValue) => t.hours * 60 + t.minutes;
const fromMin = (n: number): TimeValue => ({ hours: Math.floor(n / 60) % 24, minutes: n % 60 });

/** True when the locale writes times with AM / PM. */
export function uses12Hour(locale?: string) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 ?? true;
  } catch {
    return true;
  }
}

/** '9:30 AM' or '09:30'. `periods` names AM / PM (default English; pass `useKit().labels` to localise). */
export function formatTime(t: TimeValue, hour12 = true, periods: { am: string; pm: string } = { am: 'AM', pm: 'PM' }) {
  if (!hour12) return `${pad2(t.hours)}:${pad2(t.minutes)}`;
  const h = t.hours % 12 || 12;
  return `${h}:${pad2(t.minutes)} ${t.hours < 12 ? periods.am : periods.pm}`;
}

/* ───────────────────────────── TimePicker ───────────────────────────── */

/**
 * Time input in three styles: iOS-style wheel drums whose rows tilt, shrink and fade as they
 * roll past the selection band (scroll-driven, native), a grid of bookable time chips with
 * booked / disabled slots, or a Material 3-style clock face you drag the hand around
 * (`variant="clock"`). Render it inline or as a field that opens it in a drag-to-dismiss sheet.
 */
export function TimePicker({
  value,
  defaultValue = null,
  onChange,
  variant = 'wheel',
  presentation = 'inline',
  hour12,
  minuteInterval,
  locale,
  ...rest
}: TimePickerProps) {
  const [inner, setInner] = useState<TimeValue | null>(defaultValue);
  const reduce = useReduceMotion();
  const current = value !== undefined ? value : inner;
  const h12 = useMemo(() => hour12 ?? uses12Hour(locale), [hour12, locale]);
  const step = Math.max(1, Math.min(60, minuteInterval ?? (variant === 'chips' ? 30 : 1)));
  const commit = (t: TimeValue) => {
    if (value === undefined) setInner(t);
    onChange?.(t);
  };

  if (presentation === 'sheet') {
    return <TimeField {...rest} variant={variant} hour12={h12} step={step} current={current} commit={commit} reduce={reduce} />;
  }
  if (variant === 'chips') return <SlotGrid {...rest} hour12={h12} step={step} value={current} onPick={commit} reduce={reduce} />;
  if (variant === 'clock') return <Clock hour12={h12} step={step} value={current} onChange={commit} accent={rest.accent} style={rest.style} reduce={reduce} />;
  return <Wheel hour12={h12} step={step} value={current} onChange={commit} accent={rest.accent} style={rest.style} reduce={reduce} />;
}

/* ───────────────────────────── wheel ───────────────────────────── */

interface WheelProps {
  hour12: boolean;
  step: number;
  value: TimeValue | null;
  onChange: (t: TimeValue) => void;
  accent?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  reduce: boolean;
}

function Wheel({ hour12, step, value, onChange, accent, style, reduce }: WheelProps) {
  const { colors, radius, font, dark, labels } = useKit();
  const tint = accent ?? colors.accent;
  const t = value ?? { hours: 9, minutes: 0 };
  const hours = useMemo(() => (hour12 ? ['12', ...Array.from({ length: 11 }, (_, i) => String(i + 1))] : Array.from({ length: 24 }, (_, i) => pad2(i))), [hour12]);
  const minutes = useMemo(() => Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad2(i * step)), [step]);
  const periods = useMemo(() => [labels.am, labels.pm], [labels.am, labels.pm]);

  const hIdx = hour12 ? t.hours % 12 : t.hours;
  const mIdx = Math.min(minutes.length - 1, Math.round(t.minutes / step));
  const pIdx = t.hours >= 12 ? 1 : 0;

  // Keep the latest value for column callbacks that fire after a scroll settles.
  const latest = useRef(t);
  useLayoutEffect(() => {
    latest.current = t;
  });
  const set = (patch: Partial<{ h: number; m: number; p: number }>) => {
    const cur = latest.current;
    const curP = cur.hours >= 12 ? 1 : 0;
    const h = patch.h ?? (hour12 ? cur.hours % 12 : cur.hours);
    const p = patch.p ?? curP;
    const m = patch.m !== undefined ? patch.m * step : Math.min(minutes.length - 1, Math.round(cur.minutes / step)) * step;
    const next = { hours: hour12 ? h + p * 12 : h, minutes: m };
    latest.current = next;
    onChange(next);
  };

  return (
    <View style={[styles.wheel, { height: ITEM * VISIBLE }, style]}>
      {/* The selection band: an inset, softly tinted capsule behind the middle row. */}
      <View
        pointerEvents="none"
        style={[styles.band, { top: PAD, height: ITEM, borderRadius: radius.scale(12), backgroundColor: alpha(tint, dark ? 0.16 : 0.11) }]}
      />
      <View style={styles.wheelGroup}>
        <WheelColumn items={hours} index={hIdx} onIndexChange={(h) => set({ h })} label={labels.hour} width={64} align="right" reduce={reduce} />
        <View pointerEvents="none" style={styles.colon}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.colonText, font.family ? { fontFamily: font.family } : null, { color: colors.mutedForeground }]}>:</Text>
        </View>
        <WheelColumn items={minutes} index={mIdx} onIndexChange={(m) => set({ m })} label={labels.minute} width={64} align="left" reduce={reduce} />
        {hour12 ? (
          <WheelColumn
            items={periods}
            index={pIdx}
            onIndexChange={(p) => set({ p })}
            label={labels.amPm}
            width={60}
            align="center"
            small
            style={styles.periodCol}
            reduce={reduce}
          />
        ) : null}
      </View>
    </View>
  );
}

interface WheelColumnProps {
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
  label: string;
  width: number;
  align: 'left' | 'right' | 'center';
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Reduce Motion: programmatic scrolls jump; finger scrolling (and its row tilt) is unchanged. */
  reduce: boolean;
}

const WheelColumn = memo(function WheelColumn({ items, index, onIndexChange, label, width, align, small, style, reduce }: WheelColumnProps) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [scrollY] = useState(() => new Animated.Value(index * ITEM)); // native, driven by the scroll view
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const settled = useRef(index);
  const dragging = useRef(false);
  const lastY = useRef(index * ITEM);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onIndexChange);
  useLayoutEffect(() => {
    cb.current = onIndexChange;
  });
  // Read by settle(), which also runs from the scroll listener created once.
  const animated = useRef(!reduce);
  useLayoutEffect(() => {
    animated.current = !reduce;
  });

  useEffect(() => {
    if (index !== settled.current && !dragging.current) {
      settled.current = index;
      ref.current?.scrollTo({ y: index * ITEM, animated: animated.current });
    }
  }, [index]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settle = () => {
    const y = lastY.current;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    if (Math.abs(y - i * ITEM) > 0.5) ref.current?.scrollTo({ y: i * ITEM, animated: animated.current });
    if (i !== settled.current) {
      settled.current = i;
      cb.current(i);
    }
  };
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => !dragging.current && settle(), 130);
  };
  const goTo = (i: number) => {
    const n = Math.max(0, Math.min(items.length - 1, i));
    lastY.current = n * ITEM;
    ref.current?.scrollTo({ y: n * ITEM, animated: !reduce });
    schedule();
  };

  const onScroll = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the listener reads refs on scroll events, never during render
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          lastY.current = e.nativeEvent.contentOffset.y;
          schedule();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollY]
  );

  const size = small ? styles.itemSmall : null;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => goTo(settled.current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      style={[{ width, height: ITEM * VISIBLE }, style]}
    >
      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: index * ITEM }}
        onLayout={() => ref.current?.scrollTo({ y: settled.current * ITEM, animated: false })}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onScrollEndDrag={() => {
          dragging.current = false;
          schedule();
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {items.map((item, i) => {
          const c = i * ITEM;
          const input = [c - 3 * ITEM, c - 2 * ITEM, c - ITEM, c, c + ITEM, c + 2 * ITEM, c + 3 * ITEM];
          return (
            <Pressable key={item + i} onPress={() => goTo(i)} accessible={false}>
              <Animated.View
                style={[
                  styles.item,
                  {
                    opacity: scrollY.interpolate({ inputRange: input, outputRange: [0.14, 0.28, 0.55, 1, 0.55, 0.28, 0.14], extrapolate: 'clamp' }),
                    transform: [
                      { perspective: 700 },
                      {
                        rotateX: scrollY.interpolate({
                          inputRange: input,
                          outputRange: ['-62deg', '-42deg', '-21deg', '0deg', '21deg', '42deg', '62deg'],
                          extrapolate: 'clamp',
                        }),
                      },
                      // 22 → 20pt for neighbours, smaller still towards the rim.
                      { scale: scrollY.interpolate({ inputRange: input, outputRange: [0.8, 0.85, 0.91, 1, 0.91, 0.85, 0.8], extrapolate: 'clamp' }) },
                    ],
                  },
                ]}
              >
                <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.itemText, size, ff, { color: colors.foreground, textAlign: align }]}>
                  {item}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
});

/* ───────────────────────────── clock ───────────────────────────── */

type ClockMode = 'hour' | 'minute';

interface ClockProps {
  hour12: boolean;
  step: number;
  value: TimeValue | null;
  onChange: (t: TimeValue) => void;
  accent?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  reduce: boolean;
}

const DIAL_MAX = 280;
const KNOB = 22; // selector radius → a 44pt circle

const HOUR_OUTER = ['12', ...Array.from({ length: 11 }, (_, i) => String(i + 1))];
const HOUR_INNER = ['00', ...Array.from({ length: 11 }, (_, i) => String(i + 13))];
const MINUTE_LABELS = Array.from({ length: 12 }, (_, i) => pad2(i * 5));

/** Clockwise degrees from 12 o'clock for the hand in the given mode. */
const handAngle = (t: TimeValue, mode: ClockMode) => (mode === 'hour' ? (t.hours % 12) * 30 : t.minutes * 6);

/**
 * Material 3-style analog dial: a large hh : mm header whose segments switch the dial between
 * hours and minutes, an AM / PM toggle, and a face you drag anywhere on. The hand rotates on the
 * native driver and snaps to hours, then auto-advances to minutes when you let go.
 */
function Clock({ hour12, step, value, onChange, accent, style, reduce }: ClockProps) {
  const { colors, radius, font, dark, labels } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const tint = accent ?? colors.accent;
  const ink = readableOn(tint);
  const t = value ?? { hours: 9, minutes: 0 };
  const pm = t.hours >= 12;

  const [mode, setMode] = useState<ClockMode>('hour');
  const [width, setWidth] = useState(0);
  const size = Math.min(width || DIAL_MAX, DIAL_MAX);
  const narrow = width > 0 && width < 300;
  const c = size / 2;
  const outer = c - 28;
  const inner = outer - 40;
  const innerHour = !hour12 && (t.hours === 0 || t.hours > 12);
  const handR = mode === 'hour' && innerHour ? inner : outer;

  // Hand rotation in degrees (native). Kept continuous so 55 → 00 turns forward, not all the way back.
  const [rot] = useState(() => new Animated.Value(handAngle(t, 'hour')));
  const angle = useRef(handAngle(t, 'hour'));
  const [modeAnim] = useState(() => new Animated.Value(0)); // native: number crossfade
  useEffect(() => {
    const target = handAngle(t, mode);
    const d = ((((target - angle.current) % 360) + 540) % 360) - 180;
    angle.current += d;
    if (reduce) rot.setValue(angle.current);
    else Animated.spring(rot, { toValue: angle.current, useNativeDriver: true, ...motion.snappy }).start();
  }, [t.hours, t.minutes, mode, rot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Reduce Motion: the numbers crossfade without the zoom (scale pinned below).
    const duration = reduce ? 150 : motion.normal - 20;
    Animated.timing(modeAnim, { toValue: mode === 'minute' ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mode, modeAnim, reduce]);

  // Latest values for the pan responder, which is created once.
  const live = useRef({ t, mode, hour12, step, onChange, c, outer, inner, touched: value !== null });
  useLayoutEffect(() => {
    live.current = { t, mode, hour12, step, onChange, c, outer, inner, touched: value !== null };
  });
  const origin = useRef({ x: 0, y: 0 });

  const pick = (x: number, y: number) => {
    const L = live.current;
    const dx = x - L.c;
    const dy = y - L.c;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const cur = L.t;
    let next: TimeValue;
    if (L.mode === 'hour') {
      const i = Math.round(deg / 30) % 12;
      if (L.hour12) next = { hours: i + (cur.hours >= 12 ? 12 : 0), minutes: cur.minutes };
      else {
        const innerRing = Math.hypot(dx, dy) < (L.outer + L.inner) / 2;
        next = { hours: innerRing ? (i === 0 ? 0 : i + 12) : i === 0 ? 12 : i, minutes: cur.minutes };
      }
    } else {
      next = { hours: cur.hours, minutes: (Math.round(deg / 6 / L.step) * L.step) % 60 };
    }
    if (next.hours !== cur.hours || next.minutes !== cur.minutes || !L.touched) {
      L.t = next;
      L.touched = true;
      L.onChange(next);
    }
  };
  const pan = usePanResponder({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      origin.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      pick(origin.current.x, origin.current.y);
    },
    onPanResponderMove: (_, g) => pick(origin.current.x + g.dx, origin.current.y + g.dy),
    onPanResponderRelease: () => {
      if (live.current.mode === 'hour') setMode('minute');
    },
  });

  const adjust = (dir: 1 | -1) => {
    if (mode === 'hour') {
      const hours = hour12 ? ((((t.hours % 12) + dir) % 12) + 12) % 12 + (pm ? 12 : 0) : (t.hours + dir + 24) % 24;
      onChange({ hours, minutes: t.minutes });
    } else {
      onChange({ hours: t.hours, minutes: (((t.minutes + dir * step) % 60) + 60) % 60 });
    }
  };
  const setPeriod = (toPm: boolean) => {
    if (toPm !== pm || value === null) onChange({ hours: (t.hours % 12) + (toPm ? 12 : 0), minutes: t.minutes });
  };

  const hourText = pad2(hour12 ? t.hours % 12 || 12 : t.hours);
  const knobLabel =
    mode === 'hour' ? (hour12 ? String(t.hours % 12 || 12) : innerHour ? pad2(t.hours) : String(t.hours)) : t.minutes % 5 === 0 ? pad2(t.minutes) : '';
  const segW = narrow ? 76 : 92;
  const segH = narrow ? 64 : 76;
  const segFont = narrow ? 40 : 48;
  const rotate = rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  const counter = rot.interpolate({ inputRange: [-360, 360], outputRange: ['360deg', '-360deg'] });

  const ring = (labels: string[], r: number, small?: boolean) =>
    labels.map((l, i) => {
      const a = (i * Math.PI) / 6;
      return (
        <View key={l} style={[styles.num, { left: c + r * Math.sin(a) - KNOB, top: c - r * Math.cos(a) - KNOB }]}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.numText, small && styles.numSmall, ff, { color: small ? colors.mutedForeground : colors.foreground }]}>{l}</Text>
        </View>
      );
    });

  const segment = (m: ClockMode, text: string, label: string) => {
    const on = mode === m;
    return (
      <Pressable
        onPress={() => setMode(m)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${text}`}
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [
          styles.segment,
          { width: segW, height: segH, borderRadius: radius.scale(12), backgroundColor: on ? alpha(tint, dark ? 0.22 : 0.14) : colors.muted, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.segText, ff, { fontSize: segFont, color: on ? tint : colors.foreground }]}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.clock, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.clockHead}>
        {segment('hour', hourText, labels.hour)}
        <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.clockColon, ff, { fontSize: segFont, color: colors.mutedForeground }]}>:</Text>
        {segment('minute', pad2(t.minutes), labels.minute)}
        {hour12 ? (
          <View
            accessibilityRole="radiogroup"
            style={[styles.period, { height: segH, borderRadius: radius.scale(10), borderColor: colors.border }]}
          >
            {(['am', 'pm'] as const).map((p, i) => {
              const on = (p === 'pm') === pm;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p === 'pm')}
                  accessibilityRole="radio"
                  accessibilityLabel={labels[p]}
                  accessibilityState={{ checked: on }}
                  style={[
                    styles.periodBtn,
                    { backgroundColor: on ? alpha(tint, dark ? 0.22 : 0.14) : 'transparent' },
                    i === 1 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border },
                  ]}
                >
                  <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.periodText, ff, { color: on ? tint : colors.mutedForeground }]}>{labels[p]}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View
        {...pan}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={mode === 'hour' ? labels.hour : labels.minute}
        accessibilityHint={labels.timeDialHint}
        accessibilityValue={{ text: mode === 'hour' ? (hour12 ? `${knobLabel || hourText} ${pm ? labels.pm : labels.am}` : labels.hours(knobLabel || hourText)) : labels.minutes(t.minutes) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={[styles.face, { width: size, height: size }]}
      >
        {/* Children ignore touches so locationX / Y stay relative to the face. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={c} fill={colors.muted} />
          </Svg>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: modeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ scale: modeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 0.88] }) }],
              },
            ]}
          >
            {ring(HOUR_OUTER, outer)}
            {hour12 ? null : ring(HOUR_INNER, inner, true)}
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: modeAnim, transform: [{ scale: modeAnim.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 1.1, 1] }) }] }]}
          >
            {ring(MINUTE_LABELS, outer)}
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Svg width={size} height={size}>
              <Line x1={c} y1={c} x2={c} y2={c - handR} stroke={tint} strokeWidth={2} strokeLinecap="round" />
              <Circle cx={c} cy={c} r={4} fill={tint} />
              <Circle cx={c} cy={c - handR} r={KNOB} fill={tint} />
              {knobLabel ? null : <Circle cx={c} cy={c - handR} r={3} fill={ink} />}
            </Svg>
            <View style={[styles.num, { left: c - KNOB, top: c - handR - KNOB }]}>
              <Animated.Text
                maxFontSizeMultiplier={FONT_CAP}
                style={[styles.numText, mode === 'hour' && innerHour && styles.numSmall, ff, { color: ink, transform: [{ rotate: counter }] }]}
              >
                {knobLabel}
              </Animated.Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────────── chips ───────────────────────────── */

interface SlotGridProps extends Pick<TimePickerProps, 'startTime' | 'endTime' | 'slots' | 'bookedTimes' | 'disabledTimes' | 'columns' | 'groupByPeriod' | 'accent' | 'style'> {
  hour12: boolean;
  step: number;
  value: TimeValue | null;
  onPick: (t: TimeValue) => void;
  reduce: boolean;
}

function SlotGrid({
  startTime = '09:00',
  endTime = '17:00',
  slots,
  bookedTimes,
  disabledTimes,
  columns = 3,
  groupByPeriod = false,
  accent,
  style,
  hour12,
  step,
  value,
  onPick,
  reduce,
}: SlotGridProps) {
  const { colors, font, labels } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const tint = accent ?? colors.accent;
  const list = useMemo(() => {
    if (slots) return slots.map((s) => toMin(parseTime(s)));
    const out: number[] = [];
    for (let n = toMin(parseTime(startTime)); n < toMin(parseTime(endTime)); n += step) out.push(n);
    return out;
  }, [slots, startTime, endTime, step]);
  const booked = useMemo(() => new Set((bookedTimes ?? []).map((t) => toMin(parseTime(t)))), [bookedTimes]);
  const off = useMemo(() => new Set((disabledTimes ?? []).map((t) => toMin(parseTime(t)))), [disabledTimes]);
  const selected = value ? toMin(value) : -1;

  const groups = useMemo(() => {
    if (!groupByPeriod) return [{ title: '', items: list }];
    const g = [
      { title: labels.morning, items: list.filter((n) => n < 720) },
      { title: labels.afternoon, items: list.filter((n) => n >= 720 && n < 1020) },
      { title: labels.evening, items: list.filter((n) => n >= 1020) },
    ];
    return g.filter((x) => x.items.length);
  }, [list, groupByPeriod, labels]);

  return (
    <View style={[styles.slots, style]} accessibilityRole="radiogroup">
      {groups.map((g) => {
        const free = g.items.filter((n) => !booked.has(n) && !off.has(n)).length;
        return (
          <View key={g.title || 'all'} style={styles.slotGroup}>
            {g.title ? (
              <View style={styles.groupHead}>
                <Text style={[styles.groupTitle, ff, { color: colors.foreground }]}>{g.title}</Text>
                <Text style={[styles.groupCount, ff, { color: colors.mutedForeground }]}>{free ? labels.slotsOpen(free) : labels.full}</Text>
              </View>
            ) : null}
            <View style={styles.grid}>
              {g.items.map((n) => (
                <View key={n} style={[styles.chipCell, { width: `${100 / columns}%` }]}>
                  <Chip
                    minutes={n}
                    label={formatTime(fromMin(n), hour12, labels)}
                    selected={n === selected}
                    booked={booked.has(n)}
                    disabled={off.has(n)}
                    tint={tint}
                    reduce={reduce}
                    onPick={onPick}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface ChipProps {
  minutes: number;
  label: string;
  selected: boolean;
  booked: boolean;
  disabled: boolean;
  tint: string;
  /** Reduce Motion: no press shrink or select pop; the fill still fades. */
  reduce: boolean;
  onPick: (t: TimeValue) => void;
}

const Chip = memo(function Chip({ minutes, label, selected, booked, disabled, tint, reduce, onPick }: ChipProps) {
  const { colors, radius, font, labels } = useKit();
  const [pop] = useState(() => new Animated.Value(1)); // native: press + select spring
  const [on] = useState(() => new Animated.Value(selected ? 1 : 0)); // native: fill opacity
  useEffect(() => {
    Animated.timing(on, { toValue: selected ? 1 : 0, duration: motion.fast, useNativeDriver: true }).start();
    if (selected && !reduce) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    }
  }, [selected, on, pop, reduce]);
  const blocked = booked || disabled;

  return (
    <Pressable
      onPress={() => onPick(fromMin(minutes))}
      onPressIn={reduce ? undefined : () => Animated.spring(pop, { toValue: 0.95, useNativeDriver: true, ...motion.snappy }).start()}
      onPressOut={reduce ? undefined : () => Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start()}
      disabled={blocked}
      accessibilityRole="radio"
      accessibilityLabel={`${label}${booked ? `, ${labels.booked}` : disabled ? `, ${labels.unavailable}` : ''}`}
      accessibilityState={{ checked: selected, disabled: blocked }}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            borderRadius: radius.md,
            borderColor: blocked ? 'transparent' : colors.border,
            backgroundColor: blocked ? colors.muted : 'transparent',
            opacity: disabled ? 0.45 : 1,
            transform: [{ scale: pop }],
          },
        ]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, borderRadius: radius.md - 1, opacity: on }]} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={FONT_CAP}
          style={[
            styles.chipText,
            font.family ? { fontFamily: font.family } : null,
            { color: selected ? readableOn(tint) : blocked ? colors.mutedForeground : colors.foreground },
            booked && styles.struck,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/* ───────────────────────────── field + sheet ───────────────────────────── */

interface TimeFieldProps extends Omit<TimePickerProps, 'value' | 'defaultValue' | 'onChange' | 'presentation' | 'hour12' | 'minuteInterval' | 'locale'> {
  hour12: boolean;
  step: number;
  current: TimeValue | null;
  commit: (t: TimeValue) => void;
  reduce: boolean;
}

function TimeField({
  variant = 'wheel',
  hour12,
  step,
  current,
  commit,
  reduce,
  label: labelProp,
  floatingLabel = true,
  title,
  placeholder: placeholderProp,
  size = 'md',
  confirm,
  error,
  success,
  helper,
  disabled,
  accent,
  surface,
  style,
  fieldStyle,
  inputStyle,
  labelStyle,
  messageStyle,
  placeholderTextColor,
  iconColor,
  menuStyle,
  ...chipProps
}: TimeFieldProps) {
  const { colors, radius, font, dark, shadow, labels } = useKit();
  const label = labelProp ?? labels.time;
  const placeholder = placeholderProp ?? labels.selectTime;
  const ff = font.family ? { fontFamily: font.family } : null;
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  // The user's border colour only replaces the resting one; numeric height / radius drive the layout maths.
  const { borderColor: userBorder, ...userField } = StyleSheet.flatten(fieldStyle) ?? {};
  const userLabelColor = StyleSheet.flatten(labelStyle)?.color as string | undefined;
  const base = SIZES[size];
  const sz = typeof userField.height === 'number' ? { ...base, h: userField.height } : base;
  const fieldRadius =
    typeof userField.borderRadius === 'number' ? userField.borderRadius : size === 'sm' ? radius.md - 2 : size === 'lg' ? radius.lg : radius.md;
  const layout = useLayout();
  const { height: winH } = layout;
  // A centred card whenever the kit caps the sheet (foldables, tablets, landscape phones).
  const wide = layout.sheetWidth < layout.width;
  const staged = confirm ?? variant !== 'chips';

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<TimeValue | null>(current);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ok = !error && !!success;
  const floating = open || !!current;
  const [float] = useState(() => new Animated.Value(floating ? 1 : 0)); // native
  const [focus] = useState(() => new Animated.Value(0)); // JS: colours
  const [halo] = useState(() => new Animated.Value(0)); // native
  const [show] = useState(() => new Animated.Value(0)); // native
  const [drag] = useState(() => new Animated.Value(0)); // native
  const [shake] = useState(() => new Animated.Value(0)); // native
  const [check] = useState(() => new Animated.Value(ok ? 1 : 0)); // native

  useEffect(() => {
    if (reduce) float.setValue(floating ? 1 : 0);
    else Animated.spring(float, { toValue: floating ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [floating, float, reduce]);
  useEffect(() => {
    Animated.timing(focus, { toValue: open ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    // Reduce Motion: the halo only fades (its scale is pinned below).
    if (reduce) Animated.timing(halo, { toValue: open ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(halo, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [open, focus, halo, reduce]);
  useEffect(() => {
    if (reduce) Animated.timing(check, { toValue: ok ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(check, { toValue: ok ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [ok, check, reduce]);
  useEffect(() => {
    if (!error || reduce) return;
    shake.setValue(0);
    Animated.sequence([10, -8, 6, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start();
  }, [error, shake, reduce]);
  useEffect(() => {
    if (open) {
      drag.setValue(0);
      // Reduce Motion: the sheet's slide / scale is pinned below, so `show` only fades it in place.
      if (reduce) Animated.timing(show, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      else Animated.spring(show, { toValue: 1, useNativeDriver: true, ...motion.gentle }).start();
    } else if (mounted) {
      Animated.timing(show, { toValue: 0, duration: reduce ? 150 : motion.fast + 40, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openSheet = () => {
    if (disabled) return;
    setDraft(current ?? (variant === 'chips' ? null : { hours: 9, minutes: 0 }));
    setMounted(true);
    setOpen(true);
  };
  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
  };
  const pick = (t: TimeValue) => {
    setDraft(t);
    if (!staged) {
      commit(t);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setOpen(false), 240);
    }
  };

  const back = () =>
    reduce
      ? Animated.timing(drag, { toValue: 0, duration: 150, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start()
      : Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.snappy }).start();
  const pan = usePanResponder({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 110 || g.vy > 1.1) setOpen(false);
      else back();
    },
    onPanResponderTerminate: back,
  });

  const active = error ? colors.danger : tint;
  const rest = error ? colors.danger : ok ? colors.success : ((userBorder as string | undefined) ?? colors.input);
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [rest, active] });
  const labelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : ok ? colors.success : (userLabelColor ?? colors.mutedForeground), active],
  });
  const topLabelColor = focus.interpolate({ inputRange: [0, 1], outputRange: [error ? colors.danger : (userLabelColor ?? colors.foreground), active] });
  const text = current ? formatTime(current, hour12, labels) : '';
  const successText = typeof success === 'string' && ok ? success : undefined;
  const message = error ?? successText ?? helper;
  const tone = error ? 'error' : successText ? 'success' : 'helper';

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, style]}>
      {floatingLabel ? null : (
        <Animated.Text
          numberOfLines={1}
          // The field already carries the label for screen readers.
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[styles.topLabel, ff, { fontSize: LABEL_ABOVE_FONT[size] }, labelStyle, { color: topLabelColor, opacity: disabled ? 0.5 : 1 }]}
        >
          {label}
        </Animated.Text>
      )}
      <Pressable
        onPress={openSheet}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: text || labels.notSet }}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderRadius: fieldRadius + 4,
              borderColor: alpha(active, 0.2),
              opacity: halo,
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.97, 1] }) }],
            },
          ]}
        />
        <Animated.View style={[styles.field, { minHeight: sz.h, borderRadius: fieldRadius, backgroundColor: bg }, userField, { borderColor }]}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_CAP}
            style={[
              styles.value,
              ff,
              { fontSize: sz.font, color: text ? colors.foreground : colors.mutedForeground, paddingLeft: sz.pad, paddingRight: sz.pad + 64 },
              inputStyle,
              !text && { color: placeholderTextColor ?? colors.mutedForeground },
            ]}
          >
            {text || (open || !floatingLabel ? placeholder : '')}
          </Text>
          {floatingLabel ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.labelWrap,
                {
                  left: sz.pad,
                  height: sz.h - 3,
                  transform: [
                    { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -sz.h / 2] }) },
                    { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                    { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, FLOAT_SCALE] }) },
                  ],
                },
              ]}
            >
              {/* The notch: the label paints the surface over the border, so it matches the rendered width. */}
              <Animated.Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.label, ff, { fontSize: sz.font, backgroundColor: bg }, labelStyle, { color: labelColor }]}>
                {label}
              </Animated.Text>
            </Animated.View>
          ) : null}
          <View pointerEvents="none" style={[styles.adorn, { right: sz.pad - 2 }]}>
            <Animated.View
              style={{ display: ok ? 'flex' : 'none', opacity: check, transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.3, 1] }) }] }}
            >
              <Icon name="check" size={sz.icon} color={colors.success} />
            </Animated.View>
            <Icon name="clock" size={sz.icon} color={open ? active : (iconColor ?? colors.mutedForeground)} />
          </View>
        </Animated.View>
      </Pressable>
      {message ? <FieldMessage key={tone + message} text={message} tone={tone} reduce={reduce} style={messageStyle} /> : null}

      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: show }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={labels.close} accessibilityRole="button" />
        </Animated.View>
        <View style={[styles.sheetHost, wide && styles.centered]} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { backgroundColor: colors.popover, borderColor: colors.border, maxHeight: winH * 0.9 },
              wide
                ? { width: Math.min(420, layout.sheetWidth), borderRadius: radius.xl, paddingBottom: 14, ...shadow('xl') }
                : {
                    alignSelf: 'stretch',
                    borderTopLeftRadius: radius.xl + 4,
                    borderTopRightRadius: radius.xl + 4,
                    paddingBottom: 30,
                    boxShadow: `0px -4px 32px rgba(0,0,0,${dark ? 0.45 : 0.18})`,
                  },
              menuStyle,
              wide
                ? {
                    opacity: show,
                    transform: [
                      { scale: show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.94, 1] }) },
                      { translateY: Animated.add(show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 16, 0] }), drag) },
                    ],
                  }
                : {
                    // Reduce Motion: fade in place instead of sliding up.
                    opacity: reduce ? show : 1,
                    transform: [{ translateY: Animated.add(show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : winH * 0.7, 0] }), drag) }],
                  },
            ]}
          >
            <View {...pan} style={styles.sheetHeader}>
              {!wide ? <View style={[styles.grabber, { backgroundColor: colors.border }]} /> : null}
              <Text style={[styles.title, ff, { color: colors.foreground }]}>{title ?? label}</Text>
              {variant === 'clock' ? null : (
                <Text style={[styles.preview, ff, { color: draft ? tint : colors.mutedForeground }]}>{draft ? formatTime(draft, hour12, labels) : placeholder}</Text>
              )}
            </View>
            <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent} bounces={false} scrollEnabled={variant === 'chips'}>
              {variant === 'chips' ? (
                <SlotGrid {...chipProps} accent={tint} hour12={hour12} step={step} value={draft} onPick={pick} reduce={reduce} />
              ) : variant === 'clock' ? (
                <Clock hour12={hour12} step={step} value={draft} onChange={pick} accent={tint} reduce={reduce} />
              ) : (
                <Wheel hour12={hour12} step={step} value={draft} onChange={pick} accent={tint} reduce={reduce} />
              )}
            </ScrollView>
            {staged ? (
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.footBtn, { borderRadius: radius.md, opacity: pressed ? 0.6 : 1 }]}>
                  <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footText, ff, { color: colors.foreground }]}>{labels.cancel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (draft) commit(draft);
                    close();
                  }}
                  disabled={!draft}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.footBtn,
                    styles.footMain,
                    { backgroundColor: tint, borderRadius: radius.md, opacity: !draft ? 0.4 : pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footText, ff, { color: readableOn(tint) }]}>{draft ? labels.setTime(formatTime(draft, hour12, labels)) : labels.done}</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </Animated.View>
  );
}

/** Helper / error / success line that slides in; error and success carry an icon. */
function FieldMessage({
  text,
  tone,
  reduce,
  style,
}: {
  text: string;
  tone: 'error' | 'success' | 'helper';
  reduce: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, font } = useKit();
  const [enter] = useState(() => new Animated.Value(tone === 'helper' ? 1 : 0)); // native
  useEffect(() => {
    if (reduce) Animated.timing(enter, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [enter, reduce]);
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.mutedForeground;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.message, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 4, 0] }) }] }]}
    >
      {tone !== 'helper' ? <Icon name={tone === 'error' ? 'alert' : 'checkCircle'} size={14} color={color} /> : null}
      <Text style={[styles.helper, font.family ? { fontFamily: font.family } : null, { color }, style, tone !== 'helper' && { color }]}>{text}</Text>
    </Animated.View>
  );
}

function Icon({ name, size, color }: { name: 'clock' | 'check' | 'checkCircle' | 'alert'; size: number; color: string }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'clock' ? (
        <>
          <Circle cx={12} cy={12} r={8.75} {...p} />
          <Path d="M12 7.5V12l3 2" {...p} />
        </>
      ) : null}
      {name === 'check' ? <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} strokeWidth={2.2} /> : null}
      {name === 'checkCircle' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="m8 12.3 2.7 2.7 5.3-5.6" {...p} />
        </>
      ) : null}
      {name === 'alert' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7.5v5.5M12 16.5v.01" {...p} strokeWidth={2.2} />
        </>
      ) : null}
    </Svg>
  );
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
  wheel: { flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch', overflow: 'hidden' },
  band: { position: 'absolute', left: 8, right: 8 },
  wheelGroup: { flexDirection: 'row', alignItems: 'stretch' },
  colon: { width: 18, alignItems: 'center', justifyContent: 'center' },
  colonText: { fontSize: 22, fontWeight: '400', includeFontPadding: false, transform: [{ translateY: -1.5 }] },
  periodCol: { marginLeft: 10 },
  item: { height: ITEM, justifyContent: 'center', paddingHorizontal: 6 },
  itemText: { fontSize: 22, fontWeight: '400', fontVariant: ['tabular-nums'], letterSpacing: -0.2, includeFontPadding: false },
  itemSmall: { fontSize: 17, letterSpacing: 0.2 },
  clock: { alignSelf: 'stretch', alignItems: 'center', gap: 20 },
  clockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  segment: { alignItems: 'center', justifyContent: 'center' },
  segText: { fontWeight: '400', fontVariant: ['tabular-nums'], letterSpacing: -0.5, includeFontPadding: false },
  clockColon: { width: 22, textAlign: 'center', fontWeight: '400', includeFontPadding: false, transform: [{ translateY: -3 }] },
  period: { width: 52, marginLeft: 12, borderWidth: StyleSheet.hairlineWidth * 2, overflow: 'hidden' },
  periodBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  periodText: { fontSize: 14, fontWeight: '400', letterSpacing: 0.3, includeFontPadding: false, textAlignVertical: 'center' },
  face: { alignSelf: 'center' },
  num: { position: 'absolute', width: KNOB * 2, height: KNOB * 2, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 16, fontWeight: '400', fontVariant: ['tabular-nums'], includeFontPadding: false },
  numSmall: { fontSize: 13 },
  slots: { alignSelf: 'stretch', gap: 14 },
  slotGroup: { gap: 6 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 2 },
  groupTitle: { flexShrink: 1, fontSize: 13.5, fontWeight: '400' },
  groupCount: { fontSize: 12.5, fontWeight: '400' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chipCell: { padding: 4 },
  chip: { minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipText: { fontSize: 14.5, fontWeight: '400', fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' },
  struck: { textDecorationLine: 'line-through' },
  field: { borderWidth: 1.5, justifyContent: 'center' },
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 4 },
  value: { fontVariant: ['tabular-nums'] },
  labelWrap: { position: 'absolute', top: 0, right: 44, justifyContent: 'center', alignItems: 'flex-start', transformOrigin: 'left center' },
  label: { fontWeight: '400', paddingHorizontal: 5, marginLeft: -5 },
  topLabel: { fontWeight: '400', marginBottom: 6, marginHorizontal: 2 },
  adorn: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 4 },
  helper: { flex: 1, fontSize: 12.5 },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 16 },
  grabber: { width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '400', letterSpacing: -0.2, marginTop: 4 },
  preview: { fontSize: 28, fontWeight: '400', letterSpacing: -0.8, marginTop: 4, fontVariant: ['tabular-nums'] },
  sheetBody: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingHorizontal: 16, paddingBottom: 12 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { minHeight: 46, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  footMain: { flex: 1 },
  footText: { fontSize: 15, fontWeight: '400' },
});
