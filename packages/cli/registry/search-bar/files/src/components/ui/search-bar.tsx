import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type SearchBarVariant = 'default' | 'filled' | 'minimal';
export type SearchBarSize = 'sm' | 'md' | 'lg';

export interface SearchSuggestion {
  key: string;
  label: string;
  /** Muted text on the right, e.g. a category or result count. */
  hint?: string;
  /** Leading icon (default 'search'). */
  icon?: 'recent' | 'trending' | 'search';
}

export interface SearchBarProps extends Omit<TextInputProps, 'style'> {
  /** 'default' outlined pill · 'filled' iOS-style grey field · 'minimal' icon that expands into a field. */
  variant?: SearchBarVariant;
  /** 'sm' 36pt · 'md' 44pt · 'lg' 52pt. */
  size?: SearchBarSize;
  /** Swaps the magnifier for a spinning arc (e.g. while results load). */
  loading?: boolean;
  /** Slide a Cancel button in from the right while searching (default: true, except 'minimal'). */
  showCancel?: boolean;
  cancelLabel?: string;
  /** Called after Cancel clears the query and dismisses the keyboard. */
  onCancel?: () => void;
  /** Called when the clear button empties the query. */
  onClear?: () => void;
  /** Focus colour (default: theme accent). */
  accent?: string;
  /** 'minimal' only: which side the collapsed icon rests on. */
  align?: 'left' | 'right';
  /** Shown in a dropdown panel under the bar while it is focused. */
  suggestions?: SearchSuggestion[];
  /** Called when a suggestion is picked (the query is set to its label first). */
  onSelectSuggestion?: (item: SearchSuggestion) => void;
  /** Filter suggestions by the query (default true). Turn off if you filter them yourself. */
  filterSuggestions?: boolean;
  /** Most suggestions to show (default 6). */
  maxSuggestions?: number;
  /** Rendered inside the field on the right, e.g. a mic or filter button. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

/** Every dimension comes from one table so the sizes read clearly different. */
const SIZES: Record<SearchBarSize, { h: number; font: number; icon: number; slot: number; r: number; clear: number; end: number }> = {
  sm: { h: 34, font: 14, icon: 14, slot: 30, r: 9, clear: 16, end: 6 },
  md: { h: 44, font: 16, icon: 18, slot: 40, r: 12, clear: 20, end: 8 },
  lg: { h: 56, font: 19, icon: 22, slot: 52, r: 16, clear: 24, end: 12 },
};

/** react-native-web draws the browser focus outline; our border + halo is the focus indicator. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

/**
 * Search field with a focus halo: the magnifier pops on focus, Cancel slides in as the field
 * springs narrower, a clear button scales in, a spinning arc shows loading and a suggestion
 * panel drops down while focused. The 'minimal' variant rests as a round icon and expands
 * into a full field when tapped.
 */
export const SearchBar = forwardRef<ComponentRef<typeof TextInput>, SearchBarProps>(function SearchBar(
  {
    variant = 'default',
    size = 'md',
    loading = false,
    showCancel,
    cancelLabel = 'Cancel',
    onCancel,
    onClear,
    accent,
    align = 'left',
    suggestions,
    onSelectSuggestion,
    filterSuggestions = true,
    maxSuggestions = 6,
    trailing,
    style,
    value,
    defaultValue,
    onChangeText,
    onFocus,
    onBlur,
    placeholder = 'Search',
    editable = true,
    autoFocus,
    ...props
  },
  ref
) {
  const { colors, radius, font } = useKit();
  const reduce = useReduceMotion();
  const ff = font.family ? { fontFamily: font.family } : null;
  const s = SIZES[size];
  const tint = accent ?? colors.accent;
  const minimal = variant === 'minimal';
  const cancelEnabled = !minimal && (showCancel ?? true);

  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => inputRef.current as ComponentRef<typeof TextInput>);

  const [focused, setFocused] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? '');
  const text = value ?? inner;
  const [expanded, setExpanded] = useState(!!text || !!autoFocus);
  const [rowW, setRowW] = useState(0);
  const [cancelW, setCancelW] = useState(0);

  const open = !minimal || expanded;
  const cancelShown = cancelEnabled && (focused || text.length > 0);

  // JS driver: layout (widths) and colours.
  const focusJS = useRef(new Animated.Value(0)).current;
  const cancelJS = useRef(new Animated.Value(0)).current;
  const openJS = useRef(new Animated.Value(open ? 1 : 0)).current;
  // Native driver: opacity and transforms, on different views.
  const halo = useRef(new Animated.Value(0)).current;
  const cancelN = useRef(new Animated.Value(0)).current;
  const openN = useRef(new Animated.Value(open ? 1 : 0)).current;
  const icon = useRef(new Animated.Value(1)).current;
  const clear = useRef(new Animated.Value(text ? 1 : 0)).current;
  const busy = useRef(new Animated.Value(loading ? 1 : 0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = focused ? 1 : 0;
    Animated.timing(focusJS, { toValue: to, duration: motion.fast, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    // Reduce Motion: the halo only fades (its scale is pinned below) and the magnifier doesn't pop.
    if (reduce) {
      Animated.timing(halo, { toValue: to, duration: 150, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(halo, { toValue: to, useNativeDriver: true, ...motion.snappy }).start();
    if (focused) {
      icon.setValue(0.6);
      Animated.spring(icon, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    }
  }, [focused, focusJS, halo, icon, reduce]);

  useEffect(() => {
    const to = cancelShown ? 1 : 0;
    // Reduce Motion: the field narrows at once and Cancel fades in place.
    if (reduce) {
      cancelJS.setValue(to);
      Animated.timing(cancelN, { toValue: to, duration: 150, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(cancelJS, { toValue: to, useNativeDriver: false, ...motion.snappy }).start();
    Animated.spring(cancelN, { toValue: to, useNativeDriver: true, ...motion.snappy }).start();
  }, [cancelShown, cancelJS, cancelN, reduce]);

  useEffect(() => {
    const to = open ? 1 : 0;
    // Reduce Motion: 'minimal' snaps to its new width; the contents still fade.
    if (reduce) {
      openJS.setValue(to);
      Animated.timing(openN, { toValue: to, duration: 150, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(openJS, { toValue: to, useNativeDriver: false, ...motion.gentle }).start();
    Animated.timing(openN, { toValue: to, duration: open ? motion.normal : motion.fast, delay: open ? 80 : 0, useNativeDriver: true }).start();
  }, [open, openJS, openN, reduce]);

  useEffect(() => {
    const to = text && editable && open ? 1 : 0;
    if (reduce) Animated.timing(clear, { toValue: to, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(clear, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();
  }, [text, editable, open, clear, reduce]);

  useEffect(() => {
    Animated.timing(busy, { toValue: loading ? 1 : 0, duration: motion.fast, useNativeDriver: true }).start();
    if (!loading) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 750, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [loading, busy, spin]);

  // The panel closes a beat after blur so a tap on a suggestion still lands (web blurs on mousedown).
  const [panelOpen, setPanelOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (focused) setPanelOpen(true);
    else closeTimer.current = setTimeout(() => setPanelOpen(false), 160);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [focused]);

  const query = text.trim().toLowerCase();
  const visible = (suggestions ?? [])
    .filter((item) => !filterSuggestions || !query || item.label.toLowerCase().includes(query))
    .slice(0, maxSuggestions);

  const setText = (next: string) => {
    if (value === undefined) setInner(next);
    onChangeText?.(next);
  };

  const expand = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancel = () => {
    setText('');
    inputRef.current?.blur();
    if (minimal) setExpanded(false);
    onCancel?.();
  };

  const select = (item: SearchSuggestion) => {
    setText(item.label);
    setPanelOpen(false);
    inputRef.current?.blur();
    onSelectSuggestion?.(item);
  };

  const look: Record<SearchBarVariant, { bg: string; rest: string; r: number }> = {
    default: { bg: colors.card, rest: colors.input, r: radius.capsule(s.h) },
    filled: { bg: colors.muted, rest: alpha(colors.muted, 0), r: Math.round(s.r * (radius.md / 12)) },
    minimal: { bg: colors.muted, rest: alpha(colors.muted, 0), r: radius.capsule(s.h) },
  };
  const { bg, rest, r } = look[variant];
  const borderColor = focusJS.interpolate({ inputRange: [0, 1], outputRange: [rest, tint] });
  const fieldW = minimal ? openJS.interpolate({ inputRange: [0, 1], outputRange: [s.h, Math.max(s.h, rowW)] }) : undefined;
  const slot = minimal ? s.h : s.slot;
  const iconColor = focused ? tint : minimal && !open ? colors.foreground : colors.mutedForeground;

  return (
    <View style={[styles.root, !editable && styles.disabled, style]}>
      <View
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        style={[styles.row, minimal && { justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }]}
      >
        <Animated.View style={minimal ? { width: fieldW, minHeight: s.h } : [styles.flex, { minHeight: s.h }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                borderRadius: r + 4,
                backgroundColor: alpha(tint, 0.18),
                opacity: halo,
                transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.96, 1] }) }],
              },
            ]}
          />
          <Animated.View style={[styles.field, { borderRadius: r, backgroundColor: bg, borderColor }]}>
            <View style={[styles.slot, { width: slot }]}>
              <Animated.View
                style={{
                  opacity: busy.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [
                    { scale: icon },
                    { rotate: icon.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
                  ],
                }}
              >
                <Icon name="search" size={s.icon} color={iconColor} />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.center,
                  { opacity: busy, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
                ]}
              >
                <Svg width={s.icon} height={s.icon} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={8.5} stroke={alpha(tint, 0.2)} strokeWidth={2.2} />
                  <Path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke={tint} strokeWidth={2.2} strokeLinecap="round" />
                </Svg>
              </Animated.View>
            </View>
            <Animated.View style={[styles.flex, { opacity: openN }]} pointerEvents={open ? 'auto' : 'none'}>
              <TextInput
                ref={inputRef}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityRole="search"
                accessibilityLabel={props.accessibilityLabel ?? placeholder}
                maxFontSizeMultiplier={FONT_CAP}
                {...props}
                autoFocus={autoFocus}
                editable={editable}
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                selectionColor={tint}
                cursorColor={tint}
                onFocus={(e) => {
                  setFocused(true);
                  onFocus?.(e);
                }}
                onBlur={(e) => {
                  setFocused(false);
                  if (minimal && !text) setExpanded(false);
                  onBlur?.(e);
                }}
                style={[styles.input, ff, { color: colors.foreground, fontSize: s.font, minHeight: s.h - 3 }, webNoOutline]}
              />
            </Animated.View>
            <Animated.View
              pointerEvents={text && open ? 'auto' : 'none'}
              style={[styles.clear, { width: s.clear + 8, opacity: clear, transform: [{ scale: reduce ? 1 : clear }] }]}
            >
              <Pressable
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => {
                  setText('');
                  onClear?.();
                  inputRef.current?.focus();
                }}
                style={[
                  styles.clearDot,
                  { width: s.clear, height: s.clear, borderRadius: s.clear / 2, backgroundColor: alpha(colors.mutedForeground, 0.22) },
                ]}
              >
                <Svg width={s.clear / 2} height={s.clear / 2} viewBox="0 0 24 24" fill="none">
                  <Path d="M6 6l12 12M18 6L6 18" stroke={colors.foreground} strokeWidth={3} strokeLinecap="round" />
                </Svg>
              </Pressable>
            </Animated.View>
            {trailing ? (
              <Animated.View style={[styles.trailing, { paddingRight: s.end - 2, opacity: openN }]} pointerEvents={open ? 'auto' : 'none'}>
                {trailing}
              </Animated.View>
            ) : (
              <View style={{ width: s.end }} />
            )}
            {minimal && !open ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={placeholder}
                onPress={expand}
                disabled={!editable}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </Animated.View>
        </Animated.View>

        {cancelEnabled ? (
          <>
            <Text
              maxFontSizeMultiplier={FONT_CAP}
              pointerEvents="none"
              onLayout={(e) => setCancelW(Math.ceil(e.nativeEvent.layout.width) + 14)}
              style={[styles.cancelText, styles.measure, ff, { fontSize: s.font }]}
            >
              {cancelLabel}
            </Text>
            <Animated.View
              style={{ height: s.h, overflow: 'hidden', width: cancelJS.interpolate({ inputRange: [0, 1], outputRange: [0, cancelW] }) }}
            >
              <Animated.View
                style={[
                  styles.cancel,
                  {
                    width: cancelW,
                    opacity: cancelN,
                    transform: [{ translateX: cancelN.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 24, 0] }) }],
                  },
                ]}
              >
                <Pressable
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={cancelLabel}
                  onPress={cancel}
                >
                  <Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={1} style={[styles.cancelText, ff, { color: tint, fontSize: s.font }]}>
                    {cancelLabel}
                  </Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          </>
        ) : null}
      </View>

      {suggestions ? (
        <SuggestionPanel
          open={panelOpen && open && visible.length > 0}
          items={visible}
          query={query}
          tint={tint}
          reduce={reduce}
          onSelect={select}
        />
      ) : null}
    </View>
  );
});

/** Dropdown list under the bar: drops in (fades with Reduce Motion), rows show an icon, bolded match and a hint. */
function SuggestionPanel({
  open,
  items,
  query,
  tint,
  reduce,
  onSelect,
}: {
  open: boolean;
  items: SearchSuggestion[];
  query: string;
  tint: string;
  reduce: boolean;
  onSelect: (item: SearchSuggestion) => void;
}) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [mounted, setMounted] = useState(open);
  const enter = useRef(new Animated.Value(0)).current;
  const last = useRef(items);
  if (items.length) last.current = items;

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduce) Animated.timing(enter, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      else Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
    } else {
      Animated.timing(enter, { toValue: 0, duration: motion.fast, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, enter, reduce]);

  if (!mounted) return null;
  return (
    <Animated.View
      accessibilityRole="list"
      style={[
        styles.panel,
        {
          backgroundColor: colors.popover,
          borderColor: colors.border,
          borderRadius: radius.lg,
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : -6, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.98, 1] }) },
          ],
        },
      ]}
    >
      {last.current.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [styles.option, pressed && { backgroundColor: alpha(tint, 0.1) }]}
        >
          <View style={[styles.optionIcon, { backgroundColor: colors.muted }]}>
            <Icon name={item.icon ?? 'search'} size={15} color={item.icon === 'trending' ? tint : colors.mutedForeground} />
          </View>
          <Text numberOfLines={1} style={[styles.optionText, ff, { color: colors.mutedForeground }]}>
            <Highlight label={item.label} query={query} color={colors.foreground} />
          </Text>
          {item.hint ? (
            <Text numberOfLines={1} style={[styles.hint, ff, { color: colors.mutedForeground }]}>
              {item.hint}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** Bolds the part of `label` that matches the query (the whole label when there is no query). */
function Highlight({ label, query, color }: { label: string; query: string; color: string }) {
  const at = query ? label.toLowerCase().indexOf(query) : -1;
  if (!query) return <Text style={{ color, fontWeight: '400' }}>{label}</Text>;
  if (at < 0) return <Text>{label}</Text>;
  return (
    <>
      {label.slice(0, at)}
      <Text style={{ color, fontWeight: '400' }}>{label.slice(at, at + query.length)}</Text>
      {label.slice(at + query.length)}
    </>
  );
}

function Icon({ name, size, color }: { name: 'search' | 'recent' | 'trending'; size: number; color: string }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'search' ? (
        <>
          <Circle cx={10.8} cy={10.8} r={6.6} {...p} strokeWidth={2.1} />
          <Path d="M15.8 15.8 20 20" {...p} strokeWidth={2.1} />
        </>
      ) : name === 'recent' ? (
        <>
          <Path d="M4.6 12a7.6 7.6 0 1 0 2.2-5.4" {...p} />
          <Path d="M4.5 4.4v3.3h3.3" {...p} />
          <Path d="M12 8.2V12l2.6 1.7" {...p} />
        </>
      ) : (
        <>
          <Path d="M3.5 16.5 9.2 10.8l3.6 3.6L20.5 6.7" {...p} />
          <Path d="M15.3 6.7h5.2v5.2" {...p} />
        </>
      )}
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
  root: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, overflow: 'hidden' },
  slot: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  input: { paddingVertical: 0, paddingLeft: 0, paddingRight: 4 },
  clear: { alignItems: 'center', justifyContent: 'center' },
  clearDot: { alignItems: 'center', justifyContent: 'center' },
  trailing: { paddingLeft: 2, alignItems: 'center', justifyContent: 'center' },
  cancel: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', paddingLeft: 14 },
  cancelText: { fontWeight: '400' },
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  panel: {
    marginTop: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12 },
  optionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 15 },
  hint: { fontSize: 12.5, maxWidth: 110 },
});
