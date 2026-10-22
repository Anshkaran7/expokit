import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type SelectPresentation = 'dropdown' | 'sheet';
/** @deprecated Use `SelectPresentation`. */
export type SelectVariant = SelectPresentation;
export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption<T extends string | number = string> {
  label: string;
  value: T;
  /** Second line under the label. */
  description?: string;
  /** Icon, flag or avatar shown before the label. */
  icon?: React.ReactNode;
  /** Options sharing a group are listed together under a small heading. */
  group?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number = string> {
  /** Plain strings or `{ label, value, description?, icon?, group?, disabled? }`. */
  options: (T | SelectOption<T>)[];
  value?: T | null;
  defaultValue?: T | null;
  onValueChange?: (value: T, option: SelectOption<T>) => void;
  /** Pick several options with checkboxes. Use `values` / `defaultValues` / `onValuesChange`. */
  multiple?: boolean;
  /** Controlled selection in `multiple` mode. */
  values?: T[];
  defaultValues?: T[];
  onValuesChange?: (values: T[], options: SelectOption<T>[]) => void;
  /** In `multiple` mode, up to this many selections show as chips; the rest collapse into a "+N" chip (0: one "N selected" chip). */
  maxChips?: number;
  /** Rests inside the field like a placeholder, floats onto the border once open or filled. */
  label: string;
  /** `false` puts the label above the field as static text (no notch) and shows `placeholder` inside. */
  floatingLabel?: boolean;
  /** Shown in the field while nothing is selected yet (only while open when the label floats). */
  placeholder?: string;
  /**
   * 'dropdown' (default) anchors a menu right under the field (above it when there's no room) ·
   * 'sheet' slides up from the bottom (a centred dialog on wide screens).
   */
  presentation?: SelectPresentation;
  /** @deprecated Use `presentation`. */
  variant?: SelectVariant;
  /** Trigger height, text and icon size. */
  size?: SelectSize;
  /** Adds a filter field above the options; matches are highlighted. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Hint under "No results" when the search matches nothing. */
  emptyText?: string;
  /** Sheet heading (default: label). */
  title?: string;
  error?: string;
  helper?: string;
  disabled?: boolean;
  /** Focus, label and check colour (default: theme accent). */
  accent?: string;
  /** Background behind the field — the floating label cuts its notch with this colour. */
  surface?: string;
  /** Minimum dropdown width; the menu otherwise matches the field. */
  minMenuWidth?: number;
  /** Maximum dropdown height before it scrolls (it also shrinks to the room on screen). */
  maxMenuHeight?: number;
  /** In `multiple` mode, show a small ✕ on each chip in the field to remove it. */
  removableChips?: boolean;
  /** Root wrapper (the one that shakes) — margins, width, flex. */
  style?: StyleProp<ViewStyle>;
  /**
   * The trigger box: background, border width / colour, radius, height, padding. Applied after the
   * computed style, so it wins. A `borderColor` replaces the resting border only — the open
   * (accent) and error colours still take over. A numeric `height` / `borderRadius` also
   * re-centres the label and resizes the focus halo.
   */
  fieldStyle?: StyleProp<ViewStyle>;
  /** The selected value / placeholder text in the trigger. */
  inputStyle?: StyleProp<TextStyle>;
  /**
   * The label, floating or above the field. Its `color` is the resting colour; open (accent) and
   * error (danger) colours still take over. A `fontSize` sets the resting size and the label floats
   * at the same ratio; the notch follows the rendered label width.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Helper / error text under the field. `color` applies to the helper; errors stay danger. */
  messageStyle?: StyleProp<TextStyle>;
  /** Colour of the placeholder in the trigger (default: theme mutedForeground). */
  placeholderTextColor?: string;
  /** Chevron colour at rest (it turns accent while open). */
  iconColor?: string;
  /** The dropdown / sheet panel — background, border, radius, padding, shadow. Don't pass `transform` or `opacity`: they animate. */
  menuStyle?: StyleProp<ViewStyle>;
  /** Each option row — padding, minHeight, radius, background (press / keyboard highlight still show). */
  optionStyle?: StyleProp<ViewStyle>;
  /** Each option's label text — fontSize, fontWeight, color… */
  optionTextStyle?: StyleProp<TextStyle>;
}

/** Heights and corners match FloatingInput so forms line up. */
const SIZES: Record<SelectSize, { h: number; font: number; pad: number; icon: number; chip: number; chipFont: number; corner: number }> = {
  sm: { h: 44, font: 15, pad: 12, icon: 16, chip: 24, chipFont: 12.5, corner: -2 },
  md: { h: 54, font: 16, pad: 16, icon: 18, chip: 28, chipFont: 13.5, corner: 0 },
  lg: { h: 64, font: 17.5, pad: 18, icon: 20, chip: 32, chipFont: 15, corner: 4 },
};
const FLOAT_SCALE = 0.78;
/** Font size of the static label used when `floatingLabel` is false. */
const LABEL_ABOVE_FONT: Record<SelectSize, number> = { sm: 13, md: 14, lg: 14.5 };
const ICON_GAP = 32;
const GAP = 8; // space between field and dropdown
const EDGE = 12; // keep the dropdown this far from the window edges
const PANEL_PAD = 6;
const SEARCH_H = 46;
const FOOT_H = 48;
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const normalize = <T extends string | number>(o: T | SelectOption<T>): SelectOption<T> =>
  typeof o === 'object' ? o : { label: String(o), value: o };
const webInput = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;
const isWeb = Platform.OS === 'web';

/**
 * A form field that opens a list of options. By default it's a dropdown anchored right under
 * the field (flipping above when there's no room, scrolling inside when long) that fades and
 * scales out of the field's edge; `presentation="sheet"` slides up a drag-to-dismiss sheet
 * (a centred dialog on wide screens). The label floats like FloatingInput, a focus halo glows
 * while open and the chevron turns. Rows take icons, descriptions, groups and disabled states;
 * `searchable` filters with highlighted matches, `multiple` switches to checkboxes with chips in
 * the field. On web: arrow keys move the highlight, Enter picks, Escape closes.
 */
export function Select<T extends string | number = string>({
  options,
  value,
  defaultValue = null,
  onValueChange,
  multiple,
  values,
  defaultValues,
  onValuesChange,
  maxChips = 2,
  label,
  floatingLabel = true,
  placeholder = 'Select…',
  presentation,
  variant,
  size = 'md',
  searchable,
  searchPlaceholder = 'Search',
  emptyText,
  title,
  error,
  helper,
  disabled,
  accent,
  surface,
  minMenuWidth = 200,
  maxMenuHeight = 320,
  removableChips = true,
  style,
  fieldStyle,
  inputStyle,
  labelStyle,
  messageStyle,
  placeholderTextColor,
  iconColor,
  menuStyle,
  optionStyle,
  optionTextStyle,
}: SelectProps<T>) {
  const { colors, radius, dark, font } = useKit();
  const reduce = useReduceMotion();
  const ff = font.family ? { fontFamily: font.family } : null;
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  const sz = SIZES[size];
  // The user's border colour only replaces the resting one; numeric height / radius drive the layout maths.
  const { borderColor: userBorder, ...userField } = StyleSheet.flatten(fieldStyle) ?? {};
  const userLabelColor = StyleSheet.flatten(labelStyle)?.color as string | undefined;
  const HEIGHT = typeof userField.height === 'number' ? userField.height : sz.h;
  const fieldRadius = typeof userField.borderRadius === 'number' ? userField.borderRadius : radius.scale(12 + sz.corner);
  const panelRadius = Math.max(fieldRadius, radius.scale(14));
  const { width: winW, height: winH } = useWindowDimensions();
  const items = useMemo(() => options.map(normalize), [options]);
  const asSheet = (presentation ?? variant ?? 'dropdown') === 'sheet';
  const wide = winW >= 640;

  const [inner, setInner] = useState<T | null>(defaultValue);
  const [innerMany, setInnerMany] = useState<T[]>(defaultValues ?? []);
  const selected = value !== undefined ? value : inner;
  const many = values ?? innerMany;
  const current = multiple ? undefined : items.find((o) => o.value === selected);
  const picked = multiple ? items.filter((o) => many.includes(o.value)) : current ? [current] : [];
  const isSelected = (o: SelectOption<T>) => (multiple ? many.includes(o.value) : o.value === selected);

  const [open, setOpen] = useState(false); // target state
  const [mounted, setMounted] = useState(false); // Modal visible (stays true while closing)
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [hi, setHi] = useState(-1); // highlighted row (keyboard / hover, web)
  const [kb, setKb] = useState(0); // on-screen keyboard height while the dropdown is open
  const fieldRef = useRef<ComponentRef<typeof View>>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const rowBox = useRef<Record<string, { y: number; h: number }>>({});
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  // Read by the sheet's pan responder, which is created once.
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;

  const floating = open || picked.length > 0;
  const float = useRef(new Animated.Value(floating ? 1 : 0)).current; // native
  const focus = useRef(new Animated.Value(0)).current; // JS: colours
  const halo = useRef(new Animated.Value(0)).current; // native: focus halo
  const show = useRef(new Animated.Value(0)).current; // native: backdrop + sheet/dropdown
  const drag = useRef(new Animated.Value(0)).current; // native: sheet drag offset
  const shake = useRef(new Animated.Value(0)).current; // native

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (reduce) float.setValue(floating ? 1 : 0);
    else Animated.spring(float, { toValue: floating ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [floating, float, reduce]);

  useEffect(() => {
    Animated.timing(focus, { toValue: open ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    // Reduce Motion: the halo only fades (its scale is pinned below).
    if (reduce) Animated.timing(halo, { toValue: open ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(halo, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [open, focus, halo, reduce]);

  useEffect(() => {
    if (!error || reduce) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -8, 6, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))
    ).start();
  }, [error, shake, reduce]);

  useEffect(() => {
    if (open) {
      drag.setValue(0);
      // Reduce Motion: the panel's slide / scale is pinned below, so `show` only fades it in place.
      if (reduce) Animated.timing(show, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      else if (asSheet) Animated.spring(show, { toValue: 1, useNativeDriver: true, ...motion.gentle }).start();
      else Animated.timing(show, { toValue: 1, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      const duration = asSheet ? (reduce ? 150 : motion.fast + 40) : 120;
      Animated.timing(show, { toValue: 0, duration, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Track the on-screen keyboard so a dropdown with a search field shrinks instead of hiding behind it.
  useEffect(() => {
    if (!open || asSheet || isWeb) return;
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      a.remove();
      b.remove();
      setKb(0);
    };
  }, [open, asSheet]);

  // Where the field sits on screen. Only commits a change, so re-measuring is cheap.
  const measure = useCallback((then?: () => void) => {
    const node = fieldRef.current;
    if (!node) return then?.();
    node.measureInWindow((x, y, w, h) => {
      if (!alive.current) return;
      setAnchor((a) => (a.x === x && a.y === y && a.w === w && a.h === h ? a : { x, y, w, h }));
      then?.();
    });
  }, []);

  // Keep following the field while open: rotation, browser / iframe resize (a docs preview grows
  // after the menu appears), the keyboard, and a couple of late passes for layout that settles
  // after the first frame. The side and max height are derived from the anchor on every render.
  useEffect(() => {
    if (!open || asSheet) return;
    measure();
    const t1 = setTimeout(() => measure(), 150);
    const t2 = setTimeout(() => measure(), 400);
    const sub = Dimensions.addEventListener('change', () => measure());
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      sub.remove();
    };
  }, [open, asSheet, winW, winH, kb, measure]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q)) : items),
    [items, q]
  );
  const sections = useMemo(() => sectionsOf(filtered), [filtered]);
  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  // Estimated natural height of the dropdown, used to decide whether it fits below.
  const estimate = (list: SelectOption<T>[], groups: number) =>
    Math.min(
      maxMenuHeight,
      PANEL_PAD * 2 +
        (searchable ? SEARCH_H : 0) +
        (multiple ? FOOT_H : 0) +
        groups * 30 +
        (list.length ? list.reduce((n, o) => n + (o.description ? 56 : 44), 0) : 96)
    );

  const firstEnabled = (list: SelectOption<T>[]) => list.findIndex((o) => !o.disabled);

  const openMenu = () => {
    if (disabled) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setQuery('');
    rowBox.current = {};
    scrollY.current = 0;
    const all = sectionsOf(items).flatMap((s) => s.rows);
    const sel = multiple ? -1 : all.findIndex((o) => o.value === selected);
    setHi(isWeb ? sel : -1);
    const go = () => {
      setMounted(true);
      setOpen(true);
    };
    if (asSheet) return go();
    measure(go);
  };
  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
  };

  const setMany = (next: T[]) => {
    if (values === undefined) setInnerMany(next);
    onValuesChange?.(next, items.filter((o) => next.includes(o.value)));
  };

  const choose = (o: SelectOption<T>) => {
    if (o.disabled) return;
    if (multiple) {
      setMany(many.includes(o.value) ? many.filter((v) => v !== o.value) : [...many, o.value]);
      return;
    }
    if (value === undefined) setInner(o.value);
    onValueChange?.(o.value, o);
    // Let the check pop before the menu leaves.
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), asSheet ? 160 : 90);
  };

  const reveal = (i: number) => {
    const o = flat[i];
    const box = o && rowBox.current[String(o.value)];
    if (!box || !viewH.current) return;
    if (box.y < scrollY.current) scrollRef.current?.scrollTo({ y: Math.max(0, box.y - PANEL_PAD), animated: false });
    else if (box.y + box.h > scrollY.current + viewH.current)
      scrollRef.current?.scrollTo({ y: box.y + box.h - viewH.current + PANEL_PAD, animated: false });
  };

  // Scroll the highlighted (selected) row into view once rows have laid out.
  useEffect(() => {
    if (!open || hi < 0) return;
    const t = setTimeout(() => reveal(hi), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Typing in the search keeps the first match highlighted (web) so Enter picks it.
  const onSearch = (text: string) => {
    setQuery(text);
    if (!isWeb) return;
    const t = text.trim().toLowerCase();
    const next = t ? items.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(t)) : items;
    setHi(t ? firstEnabled(sectionsOf(next).flatMap((x) => x.rows)) : -1);
  };

  const step = (dir: 1 | -1, from = hi) => {
    const n = flat.length;
    if (!n) return;
    let i = from < 0 ? (dir > 0 ? -1 : n) : from;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!flat[i].disabled) {
        setHi(i);
        reveal(i);
        return;
      }
    }
  };

  // Web keyboard: ↑/↓ move, Home/End jump, Enter picks, Escape/Tab close.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        step(e.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Home':
      case 'End':
        if (searchable && query) return; // let the caret move in the search field
        e.preventDefault();
        step(e.key === 'Home' ? 1 : -1, e.key === 'Home' ? -1 : flat.length);
        break;
      case 'Enter':
        if (hi >= 0 && flat[hi]) {
          e.preventDefault();
          choose(flat[hi]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };
  useEffect(() => {
    if (!open || !isWeb || typeof document === 'undefined') return;
    const handler = (e: KeyboardEvent) => onKey.current(e);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Drag the sheet's grabber down to dismiss.
  const pan = useMemo(() => {
    const back = () =>
      reduceRef.current
        ? Animated.timing(drag, { toValue: 0, duration: 150, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start()
        : Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.snappy }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 1.1) setOpen(false);
        else back();
      },
      onPanResponderTerminate: back,
    });
  }, [drag]);

  const active = error ? colors.danger : tint;
  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : ((userBorder as string | undefined) ?? colors.input), active],
  });
  const labelColor = focus.interpolate({ inputRange: [0, 1], outputRange: [error ? colors.danger : (userLabelColor ?? colors.mutedForeground), active] });
  const topLabelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : (userLabelColor ?? colors.mutedForeground), active],
  });
  const dense = !asSheet;
  const rowRadius = Math.max(0, panelRadius - PANEL_PAD - 1);

  const searchField = searchable ? (
    <View
      style={
        dense
          ? [styles.searchDense, { borderBottomColor: colors.border }]
          : [styles.search, { backgroundColor: colors.muted, borderRadius: radius.md }]
      }
    >
      <Icon name="search" size={dense ? 16 : 17} color={colors.mutedForeground} />
      <TextInput
        value={query}
        onChangeText={onSearch}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={tint}
        cursorColor={tint}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={isWeb}
        returnKeyType="done"
        accessibilityLabel={searchPlaceholder}
        maxFontSizeMultiplier={FONT_CAP}
        style={[styles.searchInput, ff, { color: colors.foreground, fontSize: dense ? 15 : 16 }, webInput]}
      />
      {query ? (
        <Pressable
          onPress={() => onSearch('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={[styles.clear, { backgroundColor: alpha(colors.mutedForeground, 0.22) }]}
        >
          <Icon name="x" size={11} color={colors.foreground} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  ) : null;

  let rowIndex = -1;
  const body = (
    <>
      {searchField}
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        style={styles.scroll}
        contentContainerStyle={dense ? styles.listDense : styles.listContent}
        scrollEventThrottle={32}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
        accessibilityRole="list"
      >
        {flat.length ? (
          sections.map((sec, si) => (
            <React.Fragment key={sec.title ?? `s${si}`}>
              {sec.title ? (
                <>
                  {si > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                  <Text style={[styles.groupTitle, dense ? styles.groupDense : null, ff, { color: colors.mutedForeground }]}>{sec.title}</Text>
                </>
              ) : null}
              {sec.rows.map((o) => {
                rowIndex += 1;
                const i = rowIndex;
                return (
                  <OptionRow
                    key={String(o.value)}
                    option={o}
                    selected={isSelected(o)}
                    highlighted={isWeb && i === hi}
                    multiple={!!multiple}
                    dense={dense}
                    rowRadius={rowRadius}
                    query={q}
                    tint={tint}
                    reduce={reduce}
                    rowStyle={optionStyle}
                    textStyle={optionTextStyle}
                    onPress={() => choose(o)}
                    onHover={() => !o.disabled && setHi(i)}
                    onLayout={(y, h) => (rowBox.current[String(o.value)] = { y, h })}
                  />
                );
              })}
            </React.Fragment>
          ))
        ) : (
          <View style={dense ? styles.emptyDense : styles.empty}>
            <View style={[styles.emptyIcon, dense && styles.emptyIconDense, { backgroundColor: colors.muted }]}>
              <Icon name="search" size={dense ? 16 : 20} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, ff, { color: colors.foreground, fontSize: dense ? 14 : 15 }]}>
              {q ? 'No results' : 'No options'}
            </Text>
            {q ? (
              <Text style={[styles.emptyText, ff, { color: colors.mutedForeground }]}>
                {emptyText ?? `Nothing matches “${query.trim()}”.`}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      {multiple ? (
        dense ? (
          <View style={[styles.footDense, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => setMany([])}
              disabled={!many.length}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.footGhost,
                { borderRadius: radius.capsule(32), opacity: many.length ? 1 : 0.4, backgroundColor: pressed ? colors.muted : 'transparent' },
              ]}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footDenseText, ff, { color: colors.mutedForeground }]}>
                Clear
              </Text>
            </Pressable>
            <View style={styles.footMid}>
              <CountBadge count={many.length} tint={tint} reduce={reduce} />
            </View>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footSolid, { backgroundColor: tint, borderRadius: radius.capsule(32), opacity: pressed ? 0.85 : 1 }]}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footDenseText, styles.footStrong, ff, { color: readableOn(tint) }]}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => setMany([])}
              disabled={!many.length}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footBtn, { borderRadius: radius.md, opacity: many.length ? (pressed ? 0.6 : 1) : 0.4 }]}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footText, ff, { color: colors.foreground }]}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [styles.footBtn, styles.footMain, { backgroundColor: tint, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.footText, styles.footStrong, styles.tabular, ff, { color: readableOn(tint) }]}>
                {many.length ? `Done · ${many.length}` : 'Done'}
              </Text>
            </Pressable>
          </View>
        )
      ) : null}
    </>
  );

  // Dropdown geometry: match the field, never narrower than minMenuWidth, clamped to the window.
  const popW = Math.max(0, Math.min(winW - EDGE * 2, Math.max(anchor.w, minMenuWidth)));
  const popLeft = Math.max(EDGE, Math.min(anchor.x, winW - popW - EDGE));
  const roomBelow = winH - kb - (anchor.y + anchor.h + GAP) - EDGE;
  const roomAbove = anchor.y - GAP - EDGE;
  // Sized from all options (not the filtered ones) so typing a search never flips the menu.
  const need = estimate(items, new Set(items.map((o) => o.group).filter(Boolean)).size);
  // Prefer below — the list scrolls inside maxHeight. Only flip above when below can't fit a
  // usable strip (~120pt) and above clearly has more room (e.g. field near the screen bottom).
  const minUsable = Math.min(120, Math.max(72, Math.floor(need * 0.35)));
  const below = roomBelow >= minUsable || roomBelow + 32 >= roomAbove;
  const popMaxH = Math.max(96, Math.min(maxMenuHeight, below ? Math.max(0, roomBelow) : Math.max(0, roomAbove)));

  const hasIcon = !multiple && !!current?.icon;
  const textLeft = hasIcon ? sz.pad + ICON_GAP : sz.pad;
  const message = error ?? helper;
  const remove = (v: T) => setMany(many.filter((x) => x !== v));
  // Multiple mode: the first `maxChips` picks as chips, the rest as a "+N" chip. Removed chips stay
  // rendered (collapsing) until their exit animation finishes.
  const chipItems: { key: string; item: { option?: SelectOption<T>; more: number } }[] = [];
  if (multiple) {
    picked.slice(0, maxChips).forEach((o) => chipItems.push({ key: `o:${String(o.value)}`, item: { option: o, more: 0 } }));
    if (picked.length > maxChips) chipItems.push({ key: 'more', item: { more: picked.length - maxChips } });
  }
  const [chips, chipGone] = usePresence(chipItems);
  const showChips = chips.length > 0;
  const chipBg = alpha(tint, dark ? 0.2 : 0.12);

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, style]}>
      {floatingLabel ? null : (
        <Animated.Text
          numberOfLines={1}
          // The trigger already carries the label for screen readers.
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
        onPress={() => (open ? close() : openMenu())}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityValue={{ text: picked.length ? picked.map((o) => o.label).join(', ') : 'None selected' }}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
          <>
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
            <Animated.View
              style={[
                styles.field,
                { minHeight: HEIGHT, borderRadius: fieldRadius, backgroundColor: bg },
                userField,
                { borderColor: hovered && !open && !error ? colors.mutedForeground : borderColor },
              ]}
            >
              {hasIcon ? <View style={[styles.icon, { left: sz.pad - 2 }]}>{current!.icon}</View> : null}
              {showChips ? (
                <View style={[styles.chips, { paddingLeft: sz.pad - 6, paddingRight: sz.pad + sz.icon + 8 }]}>
                  {chips.map(({ key, item, leaving, appear }) => (
                    <AnimatedChip key={key} leaving={leaving} appear={appear} gap={6} shrink={!!item.option} reduce={reduce} onGone={() => chipGone(key)}>
                      {item.option ? (
                        <View
                          style={[
                            styles.chip,
                            {
                              minHeight: sz.chip,
                              paddingLeft: item.option.icon ? 3 : 10,
                              paddingRight: removableChips && !disabled ? 4 : 10,
                              backgroundColor: chipBg,
                              borderRadius: radius.capsule(sz.chip),
                            },
                          ]}
                        >
                          {item.option.icon ? (
                            <View style={[styles.chipIcon, { width: sz.chip - 6, height: sz.chip - 6, borderRadius: radius.capsule(sz.chip - 6) }]}>
                              {item.option.icon}
                            </View>
                          ) : null}
                          <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.chipText, ff, { color: tint, fontSize: sz.chipFont }]}>
                            {item.option.label}
                          </Text>
                          {removableChips && !disabled ? (
                            <Pressable
                              onPress={() => item.option && remove(item.option.value)}
                              hitSlop={12}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${item.option.label}`}
                              style={({ pressed }) => [
                                styles.chipX,
                                {
                                  width: sz.chip - 8,
                                  height: sz.chip - 8,
                                  borderRadius: radius.capsule(sz.chip - 8),
                                  backgroundColor: pressed ? alpha(tint, 0.2) : 'transparent',
                                },
                              ]}
                            >
                              <Icon name="x" size={Math.round(sz.chip * 0.45)} color={tint} strokeWidth={2.2} />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : (
                        <View
                          accessible
                          accessibilityLabel={maxChips > 0 ? `${item.more} more` : `${item.more} selected`}
                          style={[styles.chip, styles.more, { minHeight: sz.chip, backgroundColor: chipBg, borderRadius: radius.capsule(sz.chip) }]}
                        >
                          {maxChips > 0 ? (
                            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.chipText, styles.tabular, ff, { color: tint, fontSize: sz.chipFont }]}>
                              +
                            </Text>
                          ) : null}
                          <RollingNumber value={item.more} distance={sz.chipFont} reduce={reduce} style={[styles.chipText, ff, { color: tint, fontSize: sz.chipFont }]} />
                          {maxChips > 0 ? null : (
                            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.chipText, ff, { color: tint, fontSize: sz.chipFont, marginLeft: 3 }]}>
                              selected
                            </Text>
                          )}
                        </View>
                      )}
                    </AnimatedChip>
                  ))}
                </View>
              ) : (
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={FONT_CAP}
                  style={[
                    ff,
                    {
                      fontSize: sz.font,
                      fontWeight: '400',
                      color: current ? colors.foreground : colors.mutedForeground,
                      paddingLeft: textLeft,
                      paddingRight: sz.pad + sz.icon + 8,
                    },
                    inputStyle,
                    !current && { color: placeholderTextColor ?? colors.mutedForeground },
                  ]}
                >
                  {current ? current.label : open || !floatingLabel ? placeholder : ''}
                </Text>
              )}
              {floatingLabel ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.labelWrap,
                    {
                      left: textLeft,
                      right: sz.pad + sz.icon + 8,
                      height: HEIGHT - 3,
                      transform: [
                        { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -HEIGHT / 2] }) },
                        { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [0, -(textLeft - sz.pad) - 4] }) },
                        { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, FLOAT_SCALE] }) },
                      ],
                    },
                  ]}
                >
                  {/* The notch: the label paints the surface over the border, so it matches the rendered width. */}
                  <Animated.Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={FONT_CAP}
                    style={[styles.label, ff, { fontSize: sz.font, backgroundColor: bg }, labelStyle, { color: labelColor }]}
                  >
                    {label}
                  </Animated.Text>
                </Animated.View>
              ) : null}
              <Chevron open={open} reduce={reduce} size={sz.icon} right={sz.pad - 4} color={open ? active : (iconColor ?? colors.mutedForeground)} />
            </Animated.View>
          </>
        )}
      </Pressable>
      {message ? <FieldMessage text={message} error={!!error} reduce={reduce} style={messageStyle} /> : null}

      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: asSheet ? colors.overlay : 'transparent', opacity: show }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        {asSheet ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.sheetHost, wide && styles.centered]}
            pointerEvents="box-none"
          >
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.sheet,
                { backgroundColor: colors.popover, maxHeight: winH * (wide ? 0.7 : 0.78), borderColor: colors.border },
                wide
                  ? { width: Math.min(460, winW - 48), borderRadius: radius.xl, paddingBottom: 8 }
                  : { alignSelf: 'stretch', borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, paddingBottom: 28 },
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
                      transform: [{ translateY: Animated.add(show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : winH * 0.8, 0] }), drag) }],
                    },
              ]}
            >
              <View {...pan.panHandlers} style={styles.sheetHeader}>
                {!wide ? <View style={[styles.grabber, { backgroundColor: colors.border }]} /> : null}
                <Text style={[styles.title, ff, { color: colors.foreground }]}>{title ?? label}</Text>
                {multiple ? (
                  <View style={styles.subtitleRow}>
                    {many.length ? (
                      <CountBadge count={many.length} tint={tint} reduce={reduce} />
                    ) : (
                      <Text style={[styles.subtitle, ff, { color: colors.mutedForeground }]}>Choose one or more</Text>
                    )}
                  </View>
                ) : null}
              </View>
              {body}
            </Animated.View>
          </KeyboardAvoidingView>
        ) : (
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.dropdown,
              {
                left: popLeft,
                width: popW,
                maxHeight: popMaxH,
                backgroundColor: colors.popover,
                borderColor: colors.border,
                borderRadius: panelRadius,
                shadowOpacity: dark ? 0.5 : 0.12,
                transformOrigin: below ? 'top' : 'bottom',
              },
              menuStyle,
              {
                opacity: show,
                transform: [
                  { translateY: show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : below ? -6 : 6, 0] }) },
                  { scale: show.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.97, 1] }) },
                ],
              },
              below ? { top: anchor.y + anchor.h + GAP } : { bottom: Math.max(EDGE, winH - anchor.y + GAP) },
            ]}
          >
            {body}
          </Animated.View>
        )}
      </Modal>
    </Animated.View>
  );
}

/** Groups options by `group` (first-appearance order); a single untitled section when none are grouped. */
function sectionsOf<T extends string | number>(list: SelectOption<T>[]): { title?: string; rows: SelectOption<T>[] }[] {
  if (!list.some((o) => o.group)) return [{ rows: list }];
  const map = new Map<string, SelectOption<T>[]>();
  list.forEach((o) => map.set(o.group ?? '', [...(map.get(o.group ?? '') ?? []), o]));
  return [...map].map(([title, rows]) => ({ title: title || undefined, rows }));
}

function OptionRow<T extends string | number>({
  option,
  selected,
  highlighted,
  multiple,
  dense,
  rowRadius,
  query,
  tint,
  reduce,
  rowStyle,
  textStyle,
  onPress,
  onHover,
  onLayout,
}: {
  option: SelectOption<T>;
  selected: boolean;
  highlighted: boolean;
  multiple: boolean;
  dense: boolean;
  rowRadius: number;
  query: string;
  tint: string;
  reduce: boolean;
  rowStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onPress: () => void;
  onHover: () => void;
  onLayout: (y: number, h: number) => void;
}) {
  const { colors, radius, font, dark } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current; // native: scale + opacity
  useEffect(() => {
    // Reduce Motion: the check only fades (no pop / twist).
    if (reduce) Animated.timing(check, { toValue: selected ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(check, { toValue: selected ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [selected, check, reduce]);
  const on = readableOn(tint);
  const box = dense ? 18 : 22;
  const hoverBg = alpha(colors.foreground, 0.06);
  const pressBg = alpha(colors.foreground, 0.1);
  const selectedBg = alpha(tint, dark ? 0.14 : 0.08);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHover}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      disabled={option.disabled}
      accessibilityRole={multiple ? 'checkbox' : 'menuitem'}
      accessibilityState={multiple ? { checked: selected, disabled: !!option.disabled } : { selected, disabled: !!option.disabled }}
      style={({ pressed }) => [
        dense ? styles.rowDense : styles.row,
        {
          borderRadius: dense ? rowRadius : radius.scale(10),
          backgroundColor: pressed ? pressBg : highlighted ? hoverBg : selected ? selectedBg : 'transparent',
          opacity: option.disabled ? 0.4 : 1,
        },
        rowStyle,
        // Press and keyboard highlight still show over a custom row background.
        (pressed || highlighted) && { backgroundColor: pressed ? pressBg : hoverBg },
      ]}
    >
      {multiple ? (
        <View style={[styles.box, { width: box, height: box, borderColor: selected ? tint : colors.input, borderRadius: radius.scale(5) }]}>
          <Animated.View style={[styles.boxFill, { backgroundColor: tint, borderRadius: radius.scale(5), opacity: check, transform: [{ scale: reduce ? 1 : check }] }]}>
            <Icon name="check" size={dense ? 12 : 14} color={on} strokeWidth={2.8} />
          </Animated.View>
        </View>
      ) : null}
      {option.icon ? <View style={styles.rowIcon}>{option.icon}</View> : null}
      <View style={styles.rowText}>
        <Highlight
          text={option.label}
          query={query}
          tint={tint}
          style={[styles.rowLabel, ff, { color: colors.foreground, fontSize: dense ? 15 : 16 }, selected && styles.rowLabelOn, textStyle]}
        />
        {option.description ? (
          <Highlight
            text={option.description}
            query={query}
            tint={tint}
            style={[styles.rowDesc, ff, { color: colors.mutedForeground, fontSize: dense ? 12.5 : 13 }]}
          />
        ) : null}
      </View>
      {!multiple ? (
        <Animated.View
          style={[
            styles.checkWrap,
            {
              opacity: check,
              transform: reduce
                ? []
                : [{ scale: check }, { rotate: check.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }],
            },
          ]}
        >
          <Icon name="check" size={dense ? 17 : 18} color={tint} strokeWidth={2.4} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

type Present<V> = { key: string; item: V; leaving: boolean; appear: boolean };

/**
 * Keeps entries that drop out of `items` rendered in their old place, flagged `leaving`, until
 * `done(key)` says their exit animation finished. Entries present on the first render don't animate in.
 */
function usePresence<V>(items: { key: string; item: V }[]) {
  const prev = useRef<Present<V>[]>([]);
  const finished = useRef(new Set<string>());
  const ready = useRef(false);
  const alive = useRef(true);
  const [, rerender] = useState(0);
  useEffect(() => {
    ready.current = true;
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const live = new Set(items.map((e) => e.key));
  live.forEach((k) => finished.current.delete(k));
  const out: Present<V>[] = [];
  let next = 0;
  const emitUpTo = (end: number) => {
    for (; next <= end; next++) out.push({ ...items[next], leaving: false, appear: ready.current });
  };
  for (const e of prev.current) {
    if (live.has(e.key)) emitUpTo(items.findIndex((x) => x.key === e.key));
    else if (!finished.current.has(e.key)) out.push({ ...e, leaving: true });
  }
  emitUpTo(items.length - 1);
  prev.current = out;

  const done = useCallback((key: string) => {
    finished.current.add(key);
    if (alive.current) rerender((n) => n + 1);
  }, []);
  return [out, done] as const;
}

/**
 * A chip that pops in (native scale + opacity spring) and, when `leaving`, fades and shrinks while
 * an outer view collapses its width and margin on the JS driver so neighbours slide over smoothly.
 */
function AnimatedChip({
  leaving,
  appear,
  gap,
  shrink,
  reduce,
  onGone,
  children,
}: {
  leaving: boolean;
  appear: boolean;
  gap: number;
  /** Whether the slot may shrink when the row is tight (chips yes, the "+N" counter no). */
  shrink: boolean;
  /** Reduce Motion: fade only — no pop, and neighbours close the gap at once. */
  reduce: boolean;
  onGone: () => void;
  children: React.ReactNode;
}) {
  const pop = useRef(new Animated.Value(appear ? 0 : 1)).current; // native: scale + opacity
  const size = useRef(new Animated.Value(1)).current; // JS: width + margin of the outer slot
  const [w, setW] = useState(0);
  const gone = useRef(onGone);
  gone.current = onGone;

  useEffect(() => {
    let alive = true;
    let anims: Animated.CompositeAnimation[];
    if (leaving) {
      anims = [Animated.timing(pop, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true })];
      if (!reduce) anims.push(Animated.timing(size, { toValue: 0, duration: 230, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }));
      let left = anims.length;
      const end = ({ finished }: { finished: boolean }) => {
        if (finished && alive && --left === 0) gone.current();
      };
      anims.forEach((a) => a.start(end));
    } else {
      size.setValue(1);
      anims = [
        reduce
          ? Animated.timing(pop, { toValue: 1, duration: 150, useNativeDriver: true })
          : Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.snappy }),
      ];
      anims.forEach((a) => a.start());
    }
    return () => {
      alive = false;
      anims.forEach((a) => a.stop());
    };
  }, [leaving, pop, size, reduce]);

  const collapsing = leaving && w > 0;
  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[
        styles.chipSlot,
        !shrink && { flexShrink: 0 },
        collapsing
          ? {
              overflow: 'hidden',
              width: size.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
              marginRight: size.interpolate({ inputRange: [0, 1], outputRange: [0, gap] }),
            }
          : { marginRight: gap },
      ]}
    >
      <Animated.View
        onLayout={leaving ? undefined : (e) => setW(e.nativeEvent.layout.width)}
        style={[
          styles.chipPop,
          collapsing && { width: w, flexShrink: 0 },
          {
            opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.85, 1] }) }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** A number that rolls (native translateY + opacity) up when it grows and down when it shrinks. Reduce Motion shows the new value at once. */
function RollingNumber({ value, style, distance = 10, reduce }: { value: number; style?: StyleProp<TextStyle>; distance?: number; reduce: boolean }) {
  const [state, setState] = useState({ cur: value, prev: value, dir: 1 });
  if (state.cur !== value) setState({ cur: value, prev: state.cur, dir: value > state.cur ? 1 : -1 });
  // A fresh value per change starts at 0 in the same render, so there's no one-frame flash.
  const roll = useMemo(() => new Animated.Value(state.cur !== state.prev && !reduce ? 0 : 1), [state, reduce]);
  const moving = state.cur !== state.prev && !reduce;
  useEffect(() => {
    if (!moving) return;
    const a = Animated.spring(roll, { toValue: 1, useNativeDriver: true, ...motion.snappy });
    a.start();
    return () => a.stop();
  }, [roll, moving]);
  return (
    <View style={styles.roll}>
      {moving ? (
        <Animated.Text
          accessible={false}
          importantForAccessibility="no"
          maxFontSizeMultiplier={FONT_CAP}
          style={[
            style,
            styles.tabular,
            styles.rollPrev,
            {
              opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }),
              transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -state.dir * distance] }) }],
            },
          ]}
        >
          {state.prev}
        </Animated.Text>
      ) : null}
      <Animated.Text
        maxFontSizeMultiplier={FONT_CAP}
        style={[
          style,
          styles.tabular,
          {
            opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [state.dir * distance, 0] }) }],
          },
        ]}
      >
        {state.cur}
      </Animated.Text>
    </View>
  );
}

/** "N selected" pill whose number rolls; it pops out when the count drops to 0. */
function CountBadge({ count, tint, reduce }: { count: number; tint: string; reduce: boolean }) {
  const { radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const on = count > 0;
  const vis = useRef(new Animated.Value(on ? 1 : 0)).current; // native
  const last = useRef(count);
  if (on) last.current = count;
  useEffect(() => {
    const a = reduce
      ? Animated.timing(vis, { toValue: on ? 1 : 0, duration: 150, useNativeDriver: true })
      : Animated.spring(vis, { toValue: on ? 1 : 0, useNativeDriver: true, ...motion.snappy });
    a.start();
    return () => a.stop();
  }, [on, vis, reduce]);
  const text = [styles.badgeText, ff, { color: tint }];
  return (
    <Animated.View
      accessible
      accessibilityLabel={`${last.current} selected`}
      accessibilityLiveRegion="polite"
      style={[
        styles.badge,
        {
          backgroundColor: alpha(tint, 0.12),
          borderRadius: radius.capsule(24),
          opacity: vis.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ scale: vis.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.85, 1] }) }],
        },
      ]}
    >
      <RollingNumber value={last.current} distance={9} reduce={reduce} style={text} />
      <Text maxFontSizeMultiplier={FONT_CAP} style={[text, styles.badgeSuffix]}>
        selected
      </Text>
    </Animated.View>
  );
}

/** Renders `text` with the first match of `query` highlighted. */
function Highlight({ text, query, tint, style }: { text: string; query: string; tint: string; style: StyleProp<TextStyle> }) {
  const i = query ? text.toLowerCase().indexOf(query) : -1;
  if (i < 0) {
    return (
      <Text numberOfLines={1} style={style}>
        {text}
      </Text>
    );
  }
  return (
    <Text numberOfLines={1} style={style}>
      {text.slice(0, i)}
      <Text style={[styles.match, { color: tint, backgroundColor: alpha(tint, 0.14) }]}>{text.slice(i, i + query.length)}</Text>
      {text.slice(i + query.length)}
    </Text>
  );
}

/** Helper / error line that fades and slides in; errors get an icon and are announced. */
function FieldMessage({ text, error, reduce, style }: { text: string; error: boolean; reduce: boolean; style?: StyleProp<TextStyle> }) {
  const { colors, font } = useKit();
  const enter = useRef(new Animated.Value(0)).current; // native
  useEffect(() => {
    enter.setValue(0);
    if (reduce) Animated.timing(enter, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [text, error, enter, reduce]);
  const color = error ? colors.danger : colors.mutedForeground;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 4, 0] }) }] },
      ]}
    >
      {error ? <Icon name="alert" size={14} color={color} /> : null}
      <Text style={[styles.helper, font.family ? { fontFamily: font.family } : null, { color }, style, error && { color }]}>{text}</Text>
    </Animated.View>
  );
}

function Chevron({ open, reduce, color, size, right }: { open: boolean; reduce: boolean; color: string; size: number; right: number }) {
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) turn.setValue(open ? 1 : 0);
    else Animated.spring(turn, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [open, turn, reduce]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.chevronWrap,
        { right, width: size + 4, height: size + 4, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] },
      ]}
    >
      <Icon name="chevron" size={size} color={color} />
    </Animated.View>
  );
}

function Icon({ name, size, color, strokeWidth = 1.8 }: { name: 'chevron' | 'check' | 'search' | 'x' | 'alert'; size: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chevron' ? <Path d="m6 9 6 6 6-6" {...p} /> : null}
      {name === 'check' ? <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} /> : null}
      {name === 'x' ? <Path d="M6 6l12 12M18 6 6 18" {...p} /> : null}
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={6.5} {...p} />
          <Path d="m20 20-4.2-4.2" {...p} />
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
  field: { borderWidth: 1.5, justifyContent: 'center' },
  halo: { position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderWidth: 3.5 },
  icon: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  chipSlot: { flexDirection: 'row', flexShrink: 1, minWidth: 0 },
  chipPop: { flexDirection: 'row', flexShrink: 1, minWidth: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150, flexShrink: 1 },
  more: { gap: 0, paddingHorizontal: 9, flexShrink: 0 },
  chipIcon: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontWeight: '400', flexShrink: 1 },
  tabular: { fontVariant: ['tabular-nums'], fontWeight: '400' },
  roll: { overflow: 'hidden' },
  rollPrev: { position: 'absolute', left: 0, top: 0 },
  badge: { flexDirection: 'row', alignItems: 'center', minHeight: 24, paddingHorizontal: 9 },
  badgeText: { fontSize: 12.5, fontWeight: '400' },
  badgeSuffix: { marginLeft: 3 },
  chipX: { alignItems: 'center', justifyContent: 'center' },
  labelWrap: { position: 'absolute', top: 0, justifyContent: 'center', alignItems: 'flex-start', transformOrigin: 'left center' },
  label: { fontWeight: '400', paddingHorizontal: 5, marginLeft: -5 },
  topLabel: { fontWeight: '400', marginBottom: 7, marginHorizontal: 1, letterSpacing: 0.01 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 7, marginLeft: 2 },
  helper: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  chevronWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  sheet: {
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  sheetHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '400', letterSpacing: -0.2, marginTop: 4 },
  subtitleRow: { minHeight: 26, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 13 },
  search: { minHeight: 44, marginBottom: 8, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 10, gap: 8 },
  searchDense: {
    minHeight: SEARCH_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 13,
    paddingRight: 11,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, minHeight: 44, paddingVertical: 0 },
  clear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  listContent: { paddingBottom: 6 },
  listDense: { padding: PANEL_PAD },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4, marginHorizontal: -PANEL_PAD },
  groupTitle: { fontSize: 12, fontWeight: '400', letterSpacing: 0.2, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  groupDense: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  emptyDense: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyIconDense: { width: 34, height: 34, borderRadius: 17, marginBottom: 8 },
  emptyTitle: { fontWeight: '400', textAlign: 'center' },
  emptyText: { fontSize: 13, marginTop: 3, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 10, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  footMain: { flex: 1 },
  footText: { fontSize: 15, fontWeight: '400' },
  footStrong: { fontWeight: '400' },
  footDense: {
    minHeight: FOOT_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footGhost: { minHeight: 32, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  footSolid: { minHeight: 32, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  footMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footDenseText: { fontSize: 14, fontWeight: '400' },
  dropdown: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: 'hidden',
  },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  rowDense: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10 },
  rowIcon: { minWidth: 24, alignItems: 'center' },
  rowText: { flex: 1, paddingVertical: 8 },
  rowLabel: { fontWeight: '400' },
  rowLabelOn: { fontWeight: '400' },
  rowDesc: { marginTop: 1, fontWeight: '400' },
  match: { fontWeight: '400' },
  checkWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  box: { borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  boxFill: { position: 'absolute', top: -1.6, left: -1.6, right: -1.6, bottom: -1.6, alignItems: 'center', justifyContent: 'center' },
});
