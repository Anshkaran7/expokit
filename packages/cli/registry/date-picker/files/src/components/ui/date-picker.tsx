import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  Calendar,
  addDays,
  isSameDay,
  startOfDay,
  type CalendarMarks,
  type CalendarProps,
  type DateRange,
} from '@/components/ui/calendar';
import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type { DateRange } from '@/components/ui/calendar';
export type DatePickerSize = 'sm' | 'md' | 'lg';
export type DatePickerPresentation = 'auto' | 'sheet' | 'dialog' | 'popover';

/** A one-tap shortcut. `value` may be a function so relative presets are computed when tapped. */
export interface DatePickerPreset<V> {
  label: string;
  value: V | (() => V);
}

export interface DatePickerBaseProps {
  /** Rests inside the field, floats onto the border once open or filled. */
  label: string;
  /** `false` puts the label above the field as static text (no notch) and shows `placeholder` inside. */
  floatingLabel?: boolean;
  /** Shown in the field while nothing is picked (only while open when the label floats). */
  placeholder?: string;
  /** Sheet heading (default: label). */
  title?: string;
  /** 'auto' = sheet on phones, dialog on wide screens · 'sheet' always slides up (drag to dismiss) · 'dialog' always a centred modal · 'popover' drops under the field. */
  presentation?: DatePickerPresentation;
  size?: DatePickerSize;
  /** Custom formatter for each date in the field. */
  format?: (date: Date) => string;
  /** Intl options for the field text (default `{ day: 'numeric', month: 'short', year: 'numeric' }`). */
  formatOptions?: Intl.DateTimeFormatOptions;
  /** BCP 47 locale for the field and the calendar. */
  locale?: string;
  /** Stage the choice and show Clear / Done; otherwise picking closes the picker. */
  confirm?: boolean;
  /** Show an × in the field that clears the value. */
  clearable?: boolean;
  minDate?: Date;
  maxDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
  markedDates?: CalendarMarks;
  weekStartsOn?: 0 | 1;
  showOutsideDays?: boolean;
  /** Error message: red border, icon message and a single shake. */
  error?: string;
  /** Valid state: success border and a check. A string is shown under the field. */
  success?: boolean | string;
  helper?: string;
  disabled?: boolean;
  /** Focus, selection and halo colour (default: theme accent). */
  accent?: string;
  /** Background behind the field — the floating label cuts its notch with this colour. */
  surface?: string;
  onOpenChange?: (open: boolean) => void;
  /** Root wrapper (the one that shakes) — margins, width, flex. */
  style?: StyleProp<ViewStyle>;
  /**
   * The trigger box: background, border width / colour, radius, height, padding. Applied after the
   * computed style, so it wins. A `borderColor` replaces the resting border only — open (accent),
   * error and success colours still take over. A numeric `height` / `borderRadius` also re-centres
   * the label and resizes the focus halo.
   */
  fieldStyle?: StyleProp<ViewStyle>;
  /** The formatted date text in the trigger. */
  inputStyle?: StyleProp<TextStyle>;
  /**
   * The label, floating or above the field. Its `color` is the resting colour; open (accent), error
   * and success colours still take over. A `fontSize` sets the resting size and the label floats at
   * the same ratio; the notch follows the rendered label width.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Helper / error / success text under the field. `color` applies to the helper; error and success keep their tone colour. */
  messageStyle?: StyleProp<TextStyle>;
  /** Colour of the placeholder in the trigger (default: theme mutedForeground). */
  placeholderTextColor?: string;
  /** Calendar icon and clear ✕ colour at rest (the calendar turns accent while open). */
  iconColor?: string;
  /** The sheet / dialog / popover panel — background, border, radius, padding, shadow. Don't pass `transform` or `opacity`: they animate. */
  menuStyle?: StyleProp<ViewStyle>;
}

export interface DatePickerSingleProps {
  mode?: 'single';
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  /** `true` for Today / Tomorrow / Next Monday / In a week / In a month, or your own list. */
  presets?: boolean | DatePickerPreset<Date>[];
}

export interface DatePickerRangeProps {
  mode: 'range';
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (range: DateRange | null) => void;
  /** `true` for Today / Next 7 days / Next weekend / This month / Last 7 days / Last 30 days, or your own list. */
  presets?: boolean | DatePickerPreset<DateRange>[];
}

export type DatePickerProps = DatePickerBaseProps & (DatePickerSingleProps | DatePickerRangeProps);

type Picked = Date | DateRange | null;
type FlatProps = DatePickerBaseProps & {
  mode?: 'single' | 'range';
  value?: Picked;
  defaultValue?: Picked;
  onChange?: (value: Picked) => void;
  presets?: boolean | DatePickerPreset<Picked>[];
};

const SIZES: Record<DatePickerSize, { h: number; font: number; pad: number; icon: number }> = {
  sm: { h: 46, font: 15, pad: 12, icon: 17 },
  md: { h: 56, font: 16, pad: 16, icon: 19 },
  lg: { h: 66, font: 17.5, pad: 18, icon: 21 },
};
const FLOAT_SCALE = 0.78;
/** Font size of the static label used when `floatingLabel` is false. */
const LABEL_ABOVE_FONT: Record<DatePickerSize, number> = { sm: 13, md: 14, lg: 14.5 };
const EMPTY_RANGE: DateRange = { start: null, end: null };

const isRange = (v: Picked): v is DateRange => !!v && !(v instanceof Date);

/** Built-in single-date shortcuts, computed relative to now. */
export function singleDatePresets(): DatePickerPreset<Date>[] {
  const today = () => startOfDay(new Date());
  return [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: () => addDays(today(), 1) },
    { label: 'Next Monday', value: () => addDays(today(), ((8 - today().getDay()) % 7) || 7) },
    { label: 'In a week', value: () => addDays(today(), 7) },
    { label: 'In a month', value: () => new Date(today().getFullYear(), today().getMonth() + 1, today().getDate()) },
  ];
}

/** Built-in range shortcuts, computed relative to now. */
export function rangeDatePresets(): DatePickerPreset<DateRange>[] {
  const today = () => startOfDay(new Date());
  return [
    { label: 'Today', value: () => ({ start: today(), end: today() }) },
    { label: 'Next 7 days', value: () => ({ start: today(), end: addDays(today(), 6) }) },
    {
      label: 'Next weekend',
      value: () => {
        const sat = addDays(today(), ((6 - today().getDay() + 7) % 7) || 7);
        return { start: sat, end: addDays(sat, 1) };
      },
    },
    {
      label: 'This month',
      value: () => {
        const t = today();
        return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: new Date(t.getFullYear(), t.getMonth() + 1, 0) };
      },
    },
    { label: 'Last 7 days', value: () => ({ start: addDays(today(), -6), end: today() }) },
    { label: 'Last 30 days', value: () => ({ start: addDays(today(), -29), end: today() }) },
  ];
}

/**
 * Date field with a floating label and focus halo that opens the Calendar in a spring sheet
 * (drag the grabber to dismiss, a dialog on wide screens) or an anchored popover. Single or
 * range mode, one-tap presets, optional Clear / Done confirmation, Intl formatting, error
 * shake and success check.
 */
export function DatePicker(props: DatePickerProps) {
  const {
    mode = 'single',
    value,
    defaultValue = null,
    onChange,
    presets,
    label,
    floatingLabel = true,
    placeholder,
    title,
    presentation = 'auto',
    size = 'md',
    format,
    formatOptions,
    locale,
    confirm = false,
    clearable = false,
    minDate,
    maxDate,
    isDateDisabled,
    markedDates,
    weekStartsOn,
    showOutsideDays,
    error,
    success,
    helper,
    disabled,
    accent,
    surface,
    onOpenChange,
    style,
    fieldStyle,
    inputStyle,
    labelStyle,
    messageStyle,
    placeholderTextColor,
    iconColor,
    menuStyle,
  } = props as unknown as FlatProps;
  const { colors, radius, font } = useKit();
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
  const restIcon = iconColor ?? colors.mutedForeground;
  const { width: winW, height: winH } = useWindowDimensions();
  const ranged = mode === 'range';

  const [inner, setInner] = useState<Picked>(defaultValue);
  const current = value !== undefined ? value : inner;
  const hasValue = isRange(current) ? !!current.start : !!current;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Picked>(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const fieldRef = useRef<ComponentRef<typeof View>>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ok = !error && !!success;
  const floating = open || hasValue;
  const float = useRef(new Animated.Value(floating ? 1 : 0)).current; // native
  const focus = useRef(new Animated.Value(0)).current; // JS: border + label colour
  const halo = useRef(new Animated.Value(0)).current; // native
  const show = useRef(new Animated.Value(0)).current; // native: backdrop + sheet
  const drag = useRef(new Animated.Value(0)).current; // native
  const shake = useRef(new Animated.Value(0)).current; // native
  const check = useRef(new Animated.Value(ok ? 1 : 0)).current; // native

  const asSheet = presentation !== 'popover';
  // Centred dialog instead of a bottom sheet.
  const wide = presentation === 'dialog' || (presentation === 'auto' && winW >= 640);

  useEffect(() => {
    Animated.spring(float, { toValue: floating ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [floating, float]);
  useEffect(() => {
    Animated.timing(focus, { toValue: open ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    Animated.spring(halo, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [open, focus, halo]);
  useEffect(() => {
    Animated.spring(check, { toValue: ok ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [ok, check]);
  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence([10, -8, 6, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start();
  }, [error, shake]);
  useEffect(() => {
    if (open) {
      drag.setValue(0);
      Animated.spring(show, { toValue: 1, useNativeDriver: true, ...(asSheet ? motion.gentle : motion.snappy) }).start();
    } else if (mounted) {
      Animated.timing(show, { toValue: 0, duration: motion.fast + 40, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const setOpenState = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenState(false);
  };
  const closeSoon = (ms: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenState(false), ms);
  };

  const openPicker = () => {
    if (disabled) return;
    setDraft(current);
    setCalMonth((isRange(current) ? current.start : current) ?? (minDate && minDate > new Date() ? minDate : new Date()));
    const go = () => {
      setMounted(true);
      setOpenState(true);
    };
    if (asSheet) return go();
    fieldRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      go();
    });
  };

  const commit = (next: Picked) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  const pick = (next: Date | DateRange) => {
    setDraft(next);
    if (confirm) return;
    if (!isRange(next)) {
      commit(next);
      closeSoon(220);
    } else if (next.start && next.end) {
      commit(next);
      closeSoon(360);
    }
  };

  const done = () => {
    let next = draft;
    if (isRange(next)) next = next.start ? { start: next.start, end: next.end ?? next.start } : null;
    commit(next);
    close();
  };

  /* formatting */
  const fmt = useMemo(() => {
    const make = (o: Intl.DateTimeFormatOptions) => {
      try {
        const f = new Intl.DateTimeFormat(locale, o);
        return (d: Date) => f.format(d);
      } catch {
        return (d: Date) => d.toDateString();
      }
    };
    const opts = formatOptions ?? { day: 'numeric', month: 'short', year: 'numeric' };
    const noYear: Intl.DateTimeFormatOptions = { ...opts };
    delete noYear.year;
    return {
      full: format ?? make(opts),
      short: format ?? make(formatOptions ? opts : noYear),
      header: make({ weekday: 'short', day: 'numeric', month: 'short' }),
    };
  }, [format, formatOptions, locale]);

  const describe = (v: Picked, f: (d: Date) => string = fmt.full) => {
    if (!v) return '';
    if (!isRange(v)) return f(v);
    if (!v.start) return '';
    if (!v.end) return `${f(v.start)} – …`;
    if (isSameDay(v.start, v.end)) return f(v.start);
    const sameYear = v.start.getFullYear() === v.end.getFullYear();
    return `${(sameYear ? fmt.short : fmt.full)(v.start)} – ${fmt.full(v.end)}`;
  };

  const presetList = useMemo<DatePickerPreset<Picked>[]>(() => {
    if (!presets) return [];
    if (presets === true) return (ranged ? rangeDatePresets() : singleDatePresets()) as DatePickerPreset<Picked>[];
    return presets;
  }, [presets, ranged]);
  const resolve = (p: DatePickerPreset<Picked>) => (typeof p.value === 'function' ? p.value() : p.value);
  const presetOk = (v: Picked) => {
    const ds = isRange(v) ? [v.start, v.end] : [v];
    return ds.every(
      (d) => !d || ((!minDate || d >= startOfDay(minDate)) && (!maxDate || d <= startOfDay(maxDate)) && !isDateDisabled?.(d))
    );
  };
  const same = (a: Picked, b: Picked) =>
    isRange(a) && isRange(b) ? isSameDay(a.start, b.start) && isSameDay(a.end, b.end) : !isRange(a) && !isRange(b) && isSameDay(a, b);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 1.1) {
            setOpen(false);
            onOpenChange?.(false);
          } else Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.snappy }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.snappy }).start(),
      }),
    [drag, onOpenChange]
  );

  const active = error ? colors.danger : tint;
  const rest = error ? colors.danger : ok ? colors.success : ((userBorder as string | undefined) ?? colors.input);
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [rest, active] });
  const labelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : ok ? colors.success : (userLabelColor ?? colors.mutedForeground), active],
  });
  const topLabelColor = focus.interpolate({ inputRange: [0, 1], outputRange: [error ? colors.danger : (userLabelColor ?? colors.foreground), active] });

  const draftDays =
    isRange(draft) && draft.start && draft.end ? Math.round((draft.end.getTime() - draft.start.getTime()) / 86400000) + 1 : 0;
  const calendarProps = (
    ranged
      ? { mode: 'range', value: isRange(draft) ? draft : EMPTY_RANGE, onChange: pick }
      : { mode: 'single', value: isRange(draft) ? null : draft, onChange: pick }
  ) as CalendarProps;

  const subtitle = isRange(draft)
    ? draft.start
      ? `${fmt.header(draft.start)}  →  ${draft.end ? fmt.header(draft.end) : 'pick an end date'}`
      : 'Pick a start date'
    : draft
      ? fmt.header(draft)
      : placeholder ?? null;

  const body = (
    <>
      {presetList.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets} style={styles.presetScroll}>
          {presetList.map((p) => {
            const v = resolve(p);
            const allowed = presetOk(v);
            const on = same(v, draft);
            return (
              <Pressable
                key={p.label}
                disabled={!allowed}
                onPress={() => {
                  const d = isRange(v) ? v.start : v;
                  if (d) setCalMonth(d);
                  setDraft(v);
                  if (!confirm) {
                    commit(v);
                    closeSoon(260);
                  }
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !allowed }}
                style={({ pressed }) => [
                  styles.preset,
                  {
                    borderRadius: radius.capsule(34),
                    backgroundColor: on ? alpha(tint, 0.14) : pressed ? colors.muted : 'transparent',
                    borderColor: on ? alpha(tint, 0.5) : colors.border,
                    opacity: allowed ? 1 : 0.4,
                  },
                ]}
              >
                <Text style={[styles.presetText, ff, { color: on ? tint : colors.foreground }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <ScrollView style={styles.calendarScroll} contentContainerStyle={styles.calendar} showsVerticalScrollIndicator={false} bounces={false}>
        <Calendar
          {...calendarProps}
          month={calMonth}
          onMonthChange={setCalMonth}
          minDate={minDate}
          maxDate={maxDate}
          isDateDisabled={isDateDisabled}
          markedDates={markedDates}
          weekStartsOn={weekStartsOn}
          showOutsideDays={showOutsideDays}
          locale={locale}
          accent={tint}
        />
      </ScrollView>
      {confirm ? (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => setDraft(null)}
            disabled={!draft}
            accessibilityRole="button"
            style={({ pressed }) => [styles.footBtn, { borderRadius: radius.md, opacity: draft ? (pressed ? 0.6 : 1) : 0.4 }]}
          >
            <Text style={[styles.footText, ff, { color: colors.foreground }]}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={done}
            accessibilityRole="button"
            style={({ pressed }) => [styles.footBtn, styles.footMain, { backgroundColor: tint, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.footText, ff, { color: readableOn(tint) }]}>
              {draftDays > 1 ? `Done · ${draftDays} days` : 'Done'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  const message = error ?? (typeof success === 'string' && ok ? success : undefined) ?? helper;
  const tone = error ? 'error' : typeof success === 'string' && ok ? 'success' : 'helper';
  const text = describe(current);
  const popW = Math.min(winW - 24, Math.max(anchor.w, 328));
  const popLeft = Math.max(12, Math.min(anchor.x, winW - popW - 12));
  const popH = 400 + (presetList.length ? 52 : 0) + (confirm ? 64 : 0);
  const roomBelow = winH - (anchor.y + anchor.h + 6) - 12;
  const roomAbove = anchor.y - 6 - 12;
  const below = popH <= roomBelow || roomBelow >= roomAbove;
  const popMaxH = Math.max(220, below ? roomBelow : roomAbove);
  const rightIcons = (clearable && hasValue ? 30 : 0) + (ok ? 28 : 0);

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
        ref={fieldRef}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: text || 'Not set' }}
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
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            },
          ]}
        />
        <Animated.View style={[styles.field, { height: sz.h, borderRadius: fieldRadius, backgroundColor: bg }, userField, { borderColor }]}>
          <Text
            numberOfLines={1}
            style={[
              styles.value,
              ff,
              { fontSize: sz.font, color: text ? colors.foreground : colors.mutedForeground, paddingLeft: sz.pad, paddingRight: sz.icon + sz.pad + 8 + rightIcons },
              inputStyle,
              !text && { color: placeholderTextColor ?? colors.mutedForeground },
            ]}
          >
            {text || (open || !floatingLabel ? placeholder ?? (ranged ? 'Select dates' : 'Select a date') : '')}
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
              <Animated.Text numberOfLines={1} style={[styles.label, ff, { fontSize: sz.font, backgroundColor: bg }, labelStyle, { color: labelColor }]}>
                {label}
              </Animated.Text>
            </Animated.View>
          ) : null}
          <View style={[styles.adorn, { right: sz.pad - 2 }]} pointerEvents="box-none">
            <Animated.View
              pointerEvents="none"
              style={{
                display: ok ? 'flex' : 'none',
                opacity: check,
                transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
              }}
            >
              <Icon name="check" size={sz.icon} color={colors.success} />
            </Animated.View>
            {clearable && hasValue && !disabled ? (
              <Pressable
                onPress={() => commit(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${label}`}
                style={[styles.clear, { backgroundColor: alpha(restIcon, 0.22) }]}
              >
                <Icon name="x" size={11} color={iconColor ?? colors.foreground} strokeWidth={2.4} />
              </Pressable>
            ) : null}
            <Icon name="calendar" size={sz.icon} color={open ? active : restIcon} />
          </View>
        </Animated.View>
      </Pressable>
      {message ? <FieldMessage key={tone + message} text={message} tone={tone} style={messageStyle} /> : null}

      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: asSheet ? colors.overlay : 'transparent', opacity: show }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        {asSheet ? (
          <View style={[styles.sheetHost, wide && styles.centered]} pointerEvents="box-none">
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.sheet,
                { backgroundColor: colors.popover, borderColor: colors.border, maxHeight: winH * 0.92 },
                wide
                  ? { width: Math.min(420, winW - 48), borderRadius: radius.xl, paddingBottom: 14 }
                  : { alignSelf: 'stretch', borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, paddingBottom: 30 },
                menuStyle,
                wide
                  ? {
                      opacity: show,
                      transform: [
                        { scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                        { translateY: Animated.add(show.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }), drag) },
                      ],
                    }
                  : { transform: [{ translateY: Animated.add(show.interpolate({ inputRange: [0, 1], outputRange: [winH * 0.85, 0] }), drag) }] },
              ]}
            >
              <View {...pan.panHandlers} style={styles.sheetHeader}>
                {!wide ? <View style={[styles.grabber, { backgroundColor: colors.border }]} /> : null}
                <Text style={[styles.title, ff, { color: colors.foreground }]}>{title ?? label}</Text>
                {subtitle ? (
                  <Text numberOfLines={1} style={[styles.subtitle, ff, { color: draft ? tint : colors.mutedForeground }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {body}
            </Animated.View>
          </View>
        ) : (
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.popover,
              {
                left: popLeft,
                width: popW,
                maxHeight: popMaxH,
                backgroundColor: colors.popover,
                borderColor: colors.border,
                borderRadius: radius.xl,
                transformOrigin: below ? 'top' : 'bottom',
              },
              menuStyle,
              {
                opacity: show,
                transform: [
                  { translateY: show.interpolate({ inputRange: [0, 1], outputRange: [below ? -8 : 8, 0] }) },
                  { scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
              below ? { top: anchor.y + anchor.h + 6 } : { bottom: Math.max(12, winH - anchor.y + 6) },
            ]}
          >
            {body}
          </Animated.View>
        )}
      </Modal>
    </Animated.View>
  );
}

/** Helper / error / success line that slides in; error and success carry an icon. */
function FieldMessage({ text, tone, style }: { text: string; tone: 'error' | 'success' | 'helper'; style?: StyleProp<TextStyle> }) {
  const { colors, font } = useKit();
  const enter = useRef(new Animated.Value(tone === 'helper' ? 1 : 0)).current; // native
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [enter]);
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.mutedForeground;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.message, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}
    >
      {tone !== 'helper' ? <Icon name={tone === 'error' ? 'alert' : 'checkCircle'} size={14} color={color} /> : null}
      <Text style={[styles.helper, font.family ? { fontFamily: font.family } : null, { color }, style, tone !== 'helper' && { color }]}>{text}</Text>
    </Animated.View>
  );
}

type IconName = 'calendar' | 'check' | 'checkCircle' | 'x' | 'alert';

function Icon({ name, size, color, strokeWidth = 1.8 }: { name: IconName; size: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'calendar' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={3} {...p} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...p} />
          <Circle cx={8.5} cy={14.5} r={0.6} {...p} strokeWidth={2} />
          <Circle cx={12} cy={14.5} r={0.6} {...p} strokeWidth={2} />
        </>
      ) : null}
      {name === 'check' ? <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} strokeWidth={2.2} /> : null}
      {name === 'checkCircle' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="m8 12.3 2.7 2.7 5.3-5.6" {...p} />
        </>
      ) : null}
      {name === 'x' ? <Path d="M6 6l12 12M18 6 6 18" {...p} /> : null}
      {name === 'alert' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7.5v5.5M12 16.5v.01" {...p} strokeWidth={2.2} />
        </>
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1.5, justifyContent: 'center' },
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 4 },
  value: { fontVariant: ['tabular-nums'] },
  labelWrap: { position: 'absolute', top: 0, right: 44, justifyContent: 'center', alignItems: 'flex-start', transformOrigin: 'left center' },
  label: { fontWeight: '400', paddingHorizontal: 5, marginLeft: -5 },
  topLabel: { fontWeight: '400', marginBottom: 6, marginHorizontal: 2 },
  adorn: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  clear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 4 },
  helper: { flex: 1, fontSize: 12.5 },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  sheetHeader: { alignItems: 'center', flexShrink: 0, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 16 },
  grabber: { width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '400', letterSpacing: -0.2, marginTop: 4 },
  subtitle: { fontSize: 13.5, fontWeight: '400', marginTop: 3, fontVariant: ['tabular-nums'] },
  presetScroll: { flexGrow: 0, flexShrink: 0 },
  calendarScroll: { flexGrow: 0, flexShrink: 1 },
  presets: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  preset: { height: 34, paddingHorizontal: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 13.5, fontWeight: '400' },
  calendar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  footer: { flexDirection: 'row', flexShrink: 0, gap: 8, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { height: 46, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  footMain: { flex: 1 },
  footText: { fontSize: 15, fontWeight: '400' },
  popover: {
    position: 'absolute',
    paddingTop: 10,
    paddingBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
});
