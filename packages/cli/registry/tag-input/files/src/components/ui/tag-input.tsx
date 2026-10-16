import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

export type TagInputVariant = 'outlined' | 'filled';
export type TagChipVariant = 'soft' | 'solid' | 'outline';

export interface TagInputProps
  extends Omit<TextInputProps, 'style' | 'value' | 'defaultValue' | 'onChange' | 'onChangeText' | 'multiline'> {
  value?: string[];
  defaultValue?: string[];
  onChange?: (tags: string[]) => void;
  /** Field style. */
  variant?: TagInputVariant;
  /** Chip style. */
  chipVariant?: TagChipVariant;
  /** Tint each chip with a colour picked from a hash of its label. */
  colorize?: boolean;
  /** Text drawn before every chip label, e.g. '#'. Typed copies of it are stripped. */
  prefix?: string;
  /** Normalise a tag before it is validated and added (e.g. lowercase, strip spaces). */
  transform?: (tag: string) => string;
  /** Stop accepting tags after this many (a "3/5" counter appears under the field). */
  maxTags?: number;
  /** Tappable suggestions: a row of pills while the field is empty, a list with highlighted matches while typing. */
  suggestions?: string[];
  /** Characters that commit the typed text as a tag (Enter always does). Default [',']. */
  separators?: string[];
  /** Return false (or an error message) to reject a tag — the field shakes. */
  validate?: (tag: string, tags: string[]) => boolean | string;
  /** Hint under the field (hidden while an error is shown). */
  helper?: string;
  error?: string;
  /** Focus and chip colour (default: theme accent). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
const hashColor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.toLowerCase().charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};
/**
 * The order chips are drawn in: the current tags, plus tags that were just removed (and are still
 * shrinking out) slotted back in after the chip they used to follow.
 */
const mergeOrder = (prev: string[], tags: string[]) => {
  const out = [...tags];
  prev.forEach((t, i) => {
    if (out.includes(t)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(prev[j]);
      if (k !== -1) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, t);
  });
  return out;
};
const webInput = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

/**
 * Type and press Enter (or a comma) to turn text into chips. Chips pop in with a spring and
 * shrink out when removed; backspace on an empty field first highlights the last chip, a
 * second press removes it. Duplicates bump the existing chip, invalid tags shake the field,
 * and suggestions appear as pills or as a filtered list with the typed text highlighted.
 */
export const TagInput = forwardRef<TextInput, TagInputProps>(function TagInput(
  {
    value,
    defaultValue,
    onChange,
    variant = 'outlined',
    chipVariant = 'soft',
    colorize,
    prefix,
    transform,
    maxTags,
    suggestions,
    separators = [','],
    validate,
    helper,
    error,
    accent,
    style,
    placeholder = 'Add a tag…',
    editable = true,
    onFocus,
    onBlur,
    onKeyPress,
    onSubmitEditing,
    ...props
  },
  ref
) {
  const { colors, radius } = useKit();
  const tint = accent ?? colors.accent;
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);

  const [inner, setInner] = useState<string[]>(defaultValue ?? []);
  const tags = value ?? inner;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // Removed tags stay in `order` until their chip has shrunk out, whether they were removed with
  // the ✕, backspace, or by the parent changing `value`. Leaving = in `order` but not in `tags`.
  const [order, setOrder] = useState<string[]>(tags);
  const [synced, setSynced] = useState(tags);
  let display = order;
  if (synced !== tags && (synced.length !== tags.length || synced.some((t, i) => t !== tags[i]))) {
    display = mergeOrder(order, tags);
    setSynced(tags);
    setOrder(display);
  }
  const leaving = display.filter((t) => !tags.includes(t));
  const mounted = useRef(true);
  const [bumps, setBumps] = useState<Record<string, number>>({});
  const [armed, setArmed] = useState<string | null>(null); // last chip highlighted by the first backspace
  const [rejected, setRejected] = useState<string>(); // message returned by validate
  const full = maxTags !== undefined && tags.length >= maxTags;
  const shownError = error ?? rejected;

  const focus = useRef(new Animated.Value(0)).current; // JS: border colour
  const halo = useRef(new Animated.Value(0)).current; // native: focus halo
  const shake = useRef(new Animated.Value(0)).current; // native
  useEffect(() => {
    Animated.timing(focus, { toValue: focused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    Animated.spring(halo, { toValue: focused ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [focused, focus, halo]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      focus.stopAnimation();
      halo.stopAnimation();
      shake.stopAnimation();
    };
  }, [focus, halo, shake]);

  const nudge = () => {
    shake.setValue(0);
    Animated.sequence(
      [8, -6, 4, -2, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true }))
    ).start();
  };
  useEffect(() => {
    if (error) nudge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const commit = (next: string[]) => {
    tagsRef.current = next;
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  const clean = (raw: string) => {
    let tag = raw.trim();
    if (prefix) while (tag.startsWith(prefix)) tag = tag.slice(prefix.length);
    return transform ? transform(tag).trim() : tag;
  };

  /** Adds each candidate; returns true if anything was added. */
  const add = (candidates: string[]) => {
    let next = [...tagsRef.current];
    let added = false;
    setArmed(null);
    for (const raw of candidates) {
      const tag = clean(raw);
      if (!tag) continue;
      const exiting = leaving.find((t) => same(t, tag) && !next.includes(t));
      if (exiting && (maxTags === undefined || next.length < maxTags)) {
        // Re-added while shrinking out: put it back where it was so the chip grows back in place.
        const before = display.slice(0, display.indexOf(exiting)).filter((t) => next.includes(t)).length;
        next = [...next.slice(0, before), exiting, ...next.slice(before)];
        added = true;
        continue;
      }
      const existing = next.find((t) => same(t, tag));
      if (existing) {
        setBumps((b) => ({ ...b, [existing]: (b[existing] ?? 0) + 1 }));
        continue;
      }
      if (maxTags !== undefined && next.length >= maxTags) {
        nudge();
        break;
      }
      const verdict = validate ? validate(tag, next) : true;
      if (verdict !== true) {
        if (typeof verdict === 'string') setRejected(verdict);
        nudge();
        continue;
      }
      setRejected(undefined);
      next = [...next, tag];
      added = true;
    }
    if (added) commit(next);
    return added;
  };

  // The tag leaves `value` at once; its chip keeps rendering (see `order`) until it has shrunk out.
  const remove = (tag: string) => {
    setArmed(null);
    if (tagsRef.current.includes(tag)) commit(tagsRef.current.filter((t) => t !== tag));
  };
  const exited = (tag: string) => {
    if (!mounted.current) return;
    setOrder((o) => o.filter((t) => t !== tag || tagsRef.current.includes(t)));
  };

  const onText = (next: string) => {
    setArmed(null);
    if (rejected) setRejected(undefined);
    const sep = separators.find((s) => next.includes(s));
    if (!sep) return setText(next);
    const parts = next.split(new RegExp(`[${separators.map((s) => s.replace(/[\\\]^-]/g, '\\$&')).join('')}]`));
    const rest = parts.pop() ?? '';
    add(parts);
    setText(rest);
  };

  const visible = tags;
  const query = clean(text).toLowerCase();
  const filtered = (suggestions ?? [])
    .filter((s) => !visible.some((t) => same(t, s)))
    .filter((s) => !query || s.toLowerCase().includes(query));
  const typing = !!query && focused;
  const exact = filtered.some((s) => same(s, clean(text)));

  const active = shownError ? colors.danger : tint;
  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [shownError ? colors.danger : variant === 'filled' ? alpha(colors.input, 0) : colors.input, active],
  });
  const message = shownError ?? helper;

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, style]}>
      <Pressable onPress={() => inputRef.current?.focus()} disabled={!editable} accessible={false} style={{ opacity: editable ? 1 : 0.5 }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderRadius: radius.md + 4,
              borderColor: alpha(active, 0.2),
              opacity: halo,
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.field,
            { borderColor, borderRadius: radius.md, backgroundColor: variant === 'filled' ? colors.muted : colors.background },
          ]}
        >
          {display.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              prefix={prefix}
              variant={chipVariant}
              tint={colorize ? hashColor(tag) : tint}
              leaving={leaving.includes(tag)}
              armed={armed === tag}
              bump={bumps[tag] ?? 0}
              disabled={!editable}
              onRemove={() => remove(tag)}
              onExited={() => exited(tag)}
            />
          ))}
          <TextInput
            ref={inputRef}
            accessibilityLabel={props.accessibilityLabel ?? placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            {...props}
            value={text}
            editable={editable && !full}
            onChangeText={onText}
            placeholder={full ? `Limit of ${maxTags} reached` : visible.length ? '' : placeholder}
            placeholderTextColor={colors.mutedForeground}
            selectionColor={tint}
            cursorColor={tint}
            submitBehavior="submit"
            returnKeyType="done"
            onSubmitEditing={(e) => {
              add([text]);
              setText('');
              onSubmitEditing?.(e);
            }}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Backspace' && !text && visible.length) {
                const last = visible[visible.length - 1];
                // First press highlights the last chip, the second removes it.
                if (armed === last) remove(last);
                else setArmed(last);
              }
              onKeyPress?.(e);
            }}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              setArmed(null);
              if (text.trim()) {
                add([text]);
                setText('');
              }
              onBlur?.(e);
            }}
            style={[styles.input, { color: colors.foreground }, full && styles.inputFull, webInput]}
          />
        </Animated.View>
      </Pressable>

      {typing && !full && (filtered.length || !exact) && suggestions?.length ? (
        <Appear key="list" style={[styles.list, { backgroundColor: colors.popover, borderColor: colors.border, borderRadius: radius.md }]}>
          {filtered.slice(0, 5).map((s) => {
            const i = s.toLowerCase().indexOf(query);
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s}`}
                onPress={() => {
                  add([s]);
                  setText('');
                }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.listRow,
                  { borderRadius: radius.md - 4, backgroundColor: pressed || hovered ? colors.muted : 'transparent' },
                ]}
              >
                <Glyph name="plus" size={16} color={tint} />
                <Text numberOfLines={1} style={[styles.listText, { color: colors.foreground }]}>
                  {prefix}
                  {s.slice(0, i)}
                  <Text style={[styles.match, { color: tint }]}>{s.slice(i, i + query.length)}</Text>
                  {s.slice(i + query.length)}
                </Text>
              </Pressable>
            );
          })}
          {!exact ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                add([text]);
                setText('');
              }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.listRow,
                { borderRadius: radius.md - 4, backgroundColor: pressed || hovered ? colors.muted : 'transparent' },
              ]}
            >
              <Glyph name="enter" size={16} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={[styles.listText, { color: colors.mutedForeground }]}>
                Add “{prefix}
                {clean(text)}”
              </Text>
            </Pressable>
          ) : null}
        </Appear>
      ) : null}

      {!typing && filtered.length && !full ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.suggestions}
          contentContainerStyle={styles.suggestionsRow}
        >
          {filtered.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Add ${s}`}
              onPress={() => {
                add([s]);
                setText('');
              }}
              style={({ pressed }) => [
                styles.suggestion,
                { borderRadius: radius.capsule(34), borderColor: colors.border, backgroundColor: pressed ? colors.muted : 'transparent', transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <Glyph name="plus" size={14} color={colorize ? hashColor(s) : tint} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]}>
                {prefix}
                {s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {message || maxTags !== undefined ? (
        <View style={styles.footer}>
          {message ? (
            <Appear key={`${shownError ? 'e' : 'h'}${message}`} style={styles.message} live={!!shownError}>
              {shownError ? <Glyph name="alert" size={14} color={colors.danger} /> : null}
              <Text style={[styles.helper, { color: shownError ? colors.danger : colors.mutedForeground }]}>{message}</Text>
            </Appear>
          ) : (
            <View style={styles.flex} />
          )}
          {maxTags !== undefined ? <Counter count={visible.length} max={maxTags} tint={tint} /> : null}
        </View>
      ) : null}
    </Animated.View>
  );
});

const GAP = 6;

/** Fades and slides its children in once on mount. */
function Appear({ children, style, live }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; live?: boolean }) {
  const enter = useRef(new Animated.Value(0)).current; // native
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
    return () => enter.stopAnimation();
  }, [enter]);
  return (
    <Animated.View
      accessibilityLiveRegion={live ? 'polite' : undefined}
      style={[style, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** "3/5" with a small ring that fills as tags are added. */
function Counter({ count, max, tint }: { count: number; max: number; tint: string }) {
  const { colors } = useKit();
  const full = count >= max;
  const color = full ? colors.warning : tint;
  const r = 6;
  const c = 2 * Math.PI * r;
  const pop = useRef(new Animated.Value(1)).current; // native
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pop.setValue(1.25);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [count, pop]);
  useEffect(() => () => pop.stopAnimation(), [pop]);
  return (
    <Animated.View style={[styles.counter, { transform: [{ scale: pop }] }]} accessibilityLabel={`${count} of ${max} tags`}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Circle cx={8} cy={8} r={r} stroke={alpha(colors.mutedForeground, 0.25)} strokeWidth={2} fill="none" />
        <Circle
          cx={8}
          cy={8}
          r={r}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - Math.min(1, count / max))}
          transform="rotate(-90 8 8)"
        />
      </Svg>
      <Text style={[styles.count, { color: full ? colors.warning : colors.mutedForeground }]}>
        {count}/{max}
      </Text>
    </Animated.View>
  );
}

function Chip({
  label,
  prefix,
  variant,
  tint,
  leaving,
  armed,
  bump,
  disabled,
  onRemove,
  onExited,
}: {
  label: string;
  prefix?: string;
  variant: TagChipVariant;
  tint: string;
  leaving: boolean;
  armed: boolean;
  bump: number;
  disabled: boolean;
  onRemove: () => void;
  onExited: () => void;
}) {
  const { colors, radius, dark } = useKit();
  // Inner chip (native driver): scale + fade. Outer wrapper (JS driver, separate view): width and
  // the trailing gap collapse so the neighbours and the text input slide over.
  const scale = useRef(new Animated.Value(0.85)).current; // native
  const fade = useRef(new Animated.Value(0)).current; // native
  const size = useRef(new Animated.Value(1)).current; // JS: 1 = full width, 0 = collapsed
  const width = useRef(0);
  const [frozen, setFrozen] = useState<number | null>(null); // measured width while collapsing

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.bouncy }),
      Animated.spring(fade, { toValue: 1, useNativeDriver: true, ...motion.snappy }),
    ]).start();
    return () => {
      scale.stopAnimation();
      fade.stopAnimation();
      size.stopAnimation();
    };
  }, [scale, fade, size]);

  useEffect(() => {
    if (!bump) return;
    scale.setValue(1.18);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [bump, scale]);

  useEffect(() => {
    if (!armed) return;
    scale.setValue(1.1);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [armed, scale]);

  const wasLeaving = useRef(false);
  useEffect(() => {
    if (!leaving) {
      if (!wasLeaving.current) return;
      wasLeaving.current = false;
      // Exit cancelled (tag re-added): grow back in place, then drop the fixed width.
      scale.stopAnimation();
      fade.stopAnimation();
      size.stopAnimation();
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.bouncy }),
        Animated.spring(fade, { toValue: 1, useNativeDriver: true, ...motion.snappy }),
      ]).start();
      Animated.spring(size, { toValue: 1, useNativeDriver: false, ...motion.snappy }).start(({ finished }) => {
        if (finished) setFrozen(null);
      });
      return;
    }
    wasLeaving.current = true;
    if (width.current > 0) setFrozen((f) => f ?? width.current);
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.8, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(size, { toValue: 0, duration: 240, delay: 40, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]).start(({ finished }) => {
      // `finished` is false when stopped (unmount, or the exit was cancelled).
      if (finished) onExited();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const look = armed
    ? { bg: colors.danger, fg: colors.dangerForeground, border: colors.danger, dot: false }
    : variant === 'solid'
      ? { bg: tint, fg: readableOn(tint), border: tint, dot: false }
      : variant === 'outline'
        ? { bg: colors.background, fg: colors.foreground, border: alpha(tint, 0.45), dot: true }
        : { bg: alpha(tint, dark ? 0.2 : 0.12), fg: tint, border: alpha(tint, dark ? 0.32 : 0.22), dot: false };

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      onLayout={(e) => {
        if (frozen === null) width.current = e.nativeEvent.layout.width;
      }}
      style={
        frozen !== null
          ? {
              overflow: 'hidden',
              width: size.interpolate({ inputRange: [0, 1], outputRange: [0, frozen], extrapolate: 'clamp' }),
              // Cancel the field's `gap` as the chip disappears so the next item lands flush.
              marginRight: size.interpolate({ inputRange: [0, 1], outputRange: [-GAP, 0], extrapolate: 'clamp' }),
            }
          : null
      }
    >
      <Animated.View
        accessibilityState={{ selected: armed }}
        style={[
          styles.chip,
          variant === 'solid' && !armed && styles.chipRaised,
          {
            backgroundColor: look.bg,
            borderColor: look.border,
            borderRadius: radius.capsule(30),
            shadowColor: tint,
            opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale }],
          },
        ]}
      >
        {look.dot ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
        <Text numberOfLines={1} style={[styles.chipText, { color: look.fg }]}>
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          {label}
        </Text>
        <Pressable
          hitSlop={{ top: 13, bottom: 13, left: 6, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          disabled={disabled || leaving}
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, { backgroundColor: alpha(look.fg === colors.foreground ? colors.mutedForeground : look.fg, pressed ? 0.3 : 0.16) }]}
        >
          <Glyph name="x" size={10} color={look.fg} strokeWidth={2.6} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function Glyph({ name, size, color, strokeWidth = 1.8 }: { name: 'x' | 'plus' | 'enter' | 'alert'; size: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'x' ? <Path d="M6 6l12 12M18 6 6 18" {...p} /> : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...p} strokeWidth={2.2} /> : null}
      {name === 'enter' ? <Path d="M19 6v5a3 3 0 0 1-3 3H6m0 0 4-4m-4 4 4 4" {...p} /> : null}
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
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 4 },
  field: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: GAP,
    borderWidth: 1.5,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  input: { flexGrow: 1, flexBasis: 90, minWidth: 90, height: 30, fontSize: 16, paddingVertical: 0, paddingHorizontal: 4 },
  inputFull: { flexBasis: 160 },
  chip: { flexDirection: 'row', alignItems: 'center', height: 30, paddingLeft: 12, paddingRight: 6, gap: 6, borderWidth: 1 },
  chipRaised: { shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: -2 },
  chipText: { fontSize: 14, fontWeight: '400', maxWidth: 200 },
  prefix: { opacity: 0.6 },
  remove: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  list: {
    marginTop: 8,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, gap: 10 },
  listText: { flex: 1, fontSize: 15 },
  match: { fontWeight: '400' },
  suggestions: { marginTop: 10, flexGrow: 0 },
  suggestionsRow: { gap: 8, paddingRight: 4 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 5,
  },
  suggestionText: { fontSize: 13.5, fontWeight: '400' },
  footer: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 12 },
  flex: { flex: 1 },
  message: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 4 },
  helper: { flex: 1, fontSize: 12.5 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  count: { fontSize: 12.5, fontWeight: '400', fontVariant: ['tabular-nums'] },
});
