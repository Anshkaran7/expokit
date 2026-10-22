import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

/**
 * 'outline' two round outlined buttons with the number between (Airbnb guests) ·
 * 'filled' one tinted capsule holding −, value and + (iOS / segmented) ·
 * 'cart' a single + (or "+ Add") at 0 that springs open into − 1 +, with a trash icon at 1 ·
 * 'compact' small tinted buttons for dense rows.
 */
export type StepperVariant = 'outline' | 'filled' | 'cart' | 'compact';
/** Older names, still accepted: default → outline, pill / segmented → filled, vertical → filled + vertical. */
export type StepperLegacyVariant = 'default' | 'pill' | 'segmented' | 'vertical';
export type StepperSize = 'sm' | 'md' | 'lg';

export interface StepperProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  variant?: StepperVariant | StepperLegacyVariant;
  /** 'sm' 32 · 'md' 36 · 'lg' 44pt buttons (touch area is always ≥ 44pt); the number and icons scale too. */
  size?: StepperSize;
  /** Stack the buttons above and below the number (outline, filled, compact). */
  orientation?: 'horizontal' | 'vertical';
  /** Formats the number (e.g. `(n) => '₹' + n`). Every changed character rolls. */
  format?: (value: number) => string;
  /** Static muted text after the number: `'kg'` or `(n) => (n === 1 ? 'night' : 'nights')`. */
  suffix?: string | ((value: number) => string);
  /** Hold a button to keep stepping, accelerating the longer you hold (default true). */
  repeat?: boolean;
  disabled?: boolean;
  /** Highlight colour: icons (filled, compact), press tint (outline), fill (cart). Default theme accent. */
  accent?: string;
  /** Overrides the −/+ icon colour. */
  iconColor?: string;
  /** cart: text next to the + while collapsed at 0, e.g. "Add". */
  addLabel?: string;
  /** Title shown to the left of the control (the control moves to the right edge). */
  label?: string;
  /** Muted line under `label`. */
  description?: string;
  /** Read by screen readers, e.g. "Guests" (defaults to `label`). */
  accessibilityLabel?: string;
  /** The control, or the whole row when `label` / `description` is set. */
  style?: StyleProp<ViewStyle>;
  /** Applied to each −/+ button. */
  buttonStyle?: StyleProp<ViewStyle>;
  /** Applied to the number (fontSize, colour, weight…). */
  valueStyle?: StyleProp<TextStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

/** Every dimension in one table so the sizes read clearly different. */
const SIZES: Record<StepperSize | 'xs', { btn: number; font: number; icon: number; num: number }> = {
  xs: { btn: 28, font: 15, icon: 12, num: 26 },
  sm: { btn: 32, font: 15, icon: 13, num: 30 },
  md: { btn: 36, font: 17, icon: 15, num: 36 },
  lg: { btn: 44, font: 20, icon: 17, num: 44 },
};

const LEGACY: Record<StepperLegacyVariant, StepperVariant> = {
  default: 'outline',
  pill: 'filled',
  segmented: 'filled',
  vertical: 'filled',
};

const ICON = {
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  trash: 'M4.5 7h15M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7M6.5 7l.8 11.6c.07 1.05.95 1.9 2 1.9h5.4c1.05 0 1.93-.85 2-1.9L17.5 7M10.2 11v5.5M13.8 11v5.5',
};

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
const hitFor = (size: number) => Math.max(0, Math.ceil((44 - size) / 2));

/**
 * Quantity control whose number rolls — each changed digit slides out as the new one slides in,
 * up or down with the change. Buttons spring on press, hold to repeat (it speeds up), and a press
 * past `min` / `max` gives a small bump. The `cart` variant grows from a single + into − 1 +.
 */
export function Stepper({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  variant: variantProp = 'outline',
  size = 'md',
  orientation,
  format,
  suffix,
  repeat = true,
  disabled,
  accent,
  iconColor,
  addLabel,
  label: title,
  description,
  accessibilityLabel,
  style,
  buttonStyle,
  valueStyle,
}: StepperProps) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduce = useReduceMotion();
  const variant: StepperVariant = variantProp in LEGACY ? LEGACY[variantProp as StepperLegacyVariant] : (variantProp as StepperVariant);
  const vertical = variant !== 'cart' && (orientation ? orientation === 'vertical' : variantProp === 'vertical');
  const tint = accent ?? colors.accent;
  const s = SIZES[variant === 'compact' ? 'xs' : size];

  const [inner, setInner] = useState(defaultValue ?? Math.max(min, 0));
  const current = value ?? inner;
  const valueRef = useRef(current);
  valueRef.current = current;

  // Direction of the last change, so digits roll the right way.
  const [track, setTrack] = useState({ v: current, dir: 1 });
  if (track.v !== current) setTrack({ v: current, dir: current > track.v ? 1 : -1 });

  // Press past a limit: the number nudges toward the wall and springs back (not with Reduce Motion;
  // the dimmed button already says it's the limit).
  const bump = useRef(new Animated.Value(0)).current;
  const nudge = (dir: 1 | -1) => {
    if (reduce) return;
    Animated.sequence([
      Animated.timing(bump, { toValue: dir * 4, duration: 60, useNativeDriver: true }),
      Animated.spring(bump, { toValue: 0, useNativeDriver: true, ...motion.bouncy }),
    ]).start();
  };

  const places = Math.max(decimals(step), decimals(min));
  const change = (dir: 1 | -1) => {
    const raw = valueRef.current + dir * step;
    const next = Math.min(max, Math.max(min, Number(raw.toFixed(places))));
    if (next === valueRef.current) return false;
    valueRef.current = next;
    if (value === undefined) setInner(next);
    onValueChange?.(next);
    return true;
  };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRepeat = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);
  useEffect(() => {
    if (disabled) stopRepeat();
  }, [disabled]);

  const startRepeat = (dir: 1 | -1) => {
    stopRepeat();
    if (!change(dir)) return nudge(dir);
    if (!repeat) return;
    let count = 0;
    const tick = () => {
      count += 1;
      if (!change(dir)) {
        nudge(dir);
        return stopRepeat();
      }
      timer.current = setTimeout(tick, count > 14 ? 40 : count > 6 ? 75 : 130);
    };
    timer.current = setTimeout(tick, 420);
  };

  const atMin = current <= min;
  const atMax = current >= max;
  const text = format ? format(current) : current.toFixed(places);
  const suffixText = typeof suffix === 'function' ? suffix(current) : suffix;

  // cart: collapses to a lone + at 0 (only when it can reach 0), and − becomes a trash can at 1.
  const isCart = variant === 'cart';
  const collapsible = isCart && min <= 0;
  const collapsed = collapsible && current <= 0;
  const removes = collapsible && current - step <= 0;

  const onCart = isCart ? (accent ? readableOn(tint) : colors.accentForeground) : colors.foreground;
  const fg = iconColor ?? (variant === 'outline' ? colors.foreground : isCart ? onCart : tint);
  const numColor = isCart ? onCart : colors.foreground;
  const flatValue = StyleSheet.flatten(valueStyle) ?? {};
  const fontSize = flatValue.fontSize ?? s.font;
  const numStyle: TextStyle = {
    fontSize,
    lineHeight: Math.round(fontSize * 1.3),
    color: numColor,
    ...ff,
    ...flatValue,
  };

  const capsule = radius.capsule(s.btn);
  const look: Record<StepperVariant, { box: ViewStyle; btn: Partial<ButtonLook> }> = {
    outline: {
      box: { gap: 2 },
      btn: { borderColor: colors.input, borderWidth: 1, pressBg: alpha(tint, 0.08), pressBorder: tint },
    },
    filled: {
      box: { backgroundColor: colors.muted, borderRadius: capsule },
      btn: { pressBg: alpha(tint, 0.14) },
    },
    compact: {
      box: { gap: 2 },
      btn: { bg: alpha(tint, 0.13), pressBg: alpha(tint, 0.22) },
    },
    cart: {
      box: {},
      btn: { pressBg: alpha(onCart, 0.16) },
    },
  };
  const btnW = variant === 'filled' && !vertical ? s.btn + 4 : s.btn;
  const btnH = variant === 'filled' && vertical ? s.btn + 2 : s.btn;

  const button = (dir: 1 | -1, glyph?: string, a11y?: string) => (
    <StepButton
      width={btnW}
      height={btnH}
      icon={s.icon}
      glyph={glyph ?? (dir === 1 ? ICON.plus : ICON.minus)}
      radius={capsule}
      fg={fg}
      look={look[variant].btn}
      limit={dir === 1 ? atMax : atMin}
      disabled={!!disabled}
      label={a11y ?? `${dir === 1 ? 'Increase' : 'Decrease'}${title ? ` ${title}` : ''}`}
      reduce={reduce}
      style={buttonStyle}
      onPressIn={() => startRepeat(dir)}
      onPressOut={stopRepeat}
    />
  );

  const number = (
    <View style={styles.roll}>
      <RollingText text={text} dir={track.dir} style={numStyle} reduce={reduce} />
      {suffixText ? (
        <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, styles.suffix, numStyle, { fontSize: fontSize * 0.82, color: isCart ? alpha(onCart, 0.8) : colors.mutedForeground }]}>
          {suffixText}
        </Text>
      ) : null}
    </View>
  );

  const a11y = {
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: accessibilityLabel ?? title,
    accessibilityValue: { min, max: Number.isFinite(max) ? max : undefined, now: current, text: suffixText ? `${text} ${suffixText}` : text },
    accessibilityState: { disabled: !!disabled },
    accessibilityActions: [
      { name: 'increment', label: 'Increase' },
      { name: 'decrement', label: 'Decrease' },
    ],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (disabled) return;
      if (e.nativeEvent.actionName === 'increment') change(1);
      if (e.nativeEvent.actionName === 'decrement') change(-1);
    },
  };

  const control = isCart ? (
    <CartControl
      {...a11y}
      s={s}
      radius={capsule}
      bg={tint}
      fg={fg}
      numStyle={numStyle}
      number={number}
      text={text}
      suffixText={suffixText}
      collapsed={collapsed}
      addLabel={addLabel}
      bump={bump}
      disabled={!!disabled}
      reduce={reduce}
      dec={button(-1, removes ? ICON.trash : ICON.minus, removes ? `Remove${title ? ` ${title}` : ''}` : undefined)}
      inc={button(1)}
      onAdd={() => startRepeat(1)}
      onAddEnd={stopRepeat}
    />
  ) : (
    <View {...a11y} style={[styles.control, vertical ? styles.column : styles.row, look[variant].box, disabled && styles.disabled]}>
      {button(vertical ? 1 : -1)}
      <Animated.View
        style={[
          styles.value,
          vertical
            ? { minHeight: s.num, minWidth: s.btn, paddingVertical: 2 }
            : { minWidth: s.num, minHeight: s.btn, paddingHorizontal: variant === 'outline' ? 8 : 4 },
          { transform: [vertical ? { translateY: Animated.multiply(bump, -1) } : { translateX: bump }] },
        ]}
      >
        {number}
      </Animated.View>
      {button(vertical ? -1 : 1)}
    </View>
  );

  if (!title && !description) return <View style={[styles.self, style]}>{control}</View>;
  return (
    <View style={[styles.labelled, style]}>
      <View style={styles.texts}>
        {title ? <Text style={[styles.label, ff, { color: colors.foreground }]}>{title}</Text> : null}
        {description ? <Text style={[styles.description, ff, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      {control}
    </View>
  );
}

/**
 * DoorDash-style control: an accent capsule whose width springs between a lone + (or "+ Add")
 * and − value +. The + stays anchored to the right edge; − and the number fade in beside it.
 * Width is JS-driven on the outer view; everything inside is native-driven on its own views.
 */
function CartControl({
  s,
  radius,
  bg,
  fg,
  numStyle,
  number,
  text,
  suffixText,
  collapsed,
  addLabel,
  bump,
  disabled,
  reduce,
  dec,
  inc,
  onAdd,
  onAddEnd,
  ...a11y
}: {
  s: { btn: number; font: number; icon: number; num: number };
  radius: number;
  bg: string;
  fg: string;
  numStyle: TextStyle;
  number: React.ReactNode;
  text: string;
  suffixText?: string;
  collapsed: boolean;
  addLabel?: string;
  bump: Animated.Value;
  disabled: boolean;
  reduce: boolean;
  dec: React.ReactNode;
  inc: React.ReactNode;
  onAdd: () => void;
  onAddEnd: () => void;
} & React.ComponentProps<typeof View>) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  // Natural widths, measured off-screen so the spring always lands on the real size.
  const [textW, setTextW] = useState(0);
  const [addW, setAddW] = useState(0);
  const estimate = Math.ceil([...text].length * s.font * 0.64 + (suffixText ? (suffixText.length + 1) * s.font * 0.5 : 0));
  const valueW = Math.max(s.num - 4, (textW || estimate) + 8);
  const openW = s.btn * 2 + valueW;
  const closedW = addLabel ? Math.max(s.btn, addW || s.btn * 2.2) : s.btn;
  const target = collapsed ? closedW : openW;

  const width = useRef(new Animated.Value(target)).current; // JS driver (layout)
  const open = useRef(new Animated.Value(collapsed ? 0 : 1)).current; // native driver
  const settled = useRef(false);

  const measured = textW > 0 && (!addLabel || addW > 0);
  useEffect(() => {
    // Snap until the rulers have reported; after that every change springs (or snaps, with Reduce Motion).
    if (!settled.current || reduce) {
      width.setValue(target);
      settled.current = measured;
      return;
    }
    Animated.spring(width, { toValue: target, useNativeDriver: false, ...motion.snappy }).start();
  }, [target, measured, width, reduce]);

  useEffect(() => {
    // Reduce Motion: − and the number only fade in (their slide is flattened below).
    if (reduce) Animated.timing(open, { toValue: collapsed ? 0 : 1, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(open, { toValue: collapsed ? 0 : 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [collapsed, open, reduce]);

  const measure = (set: (n: number) => void) => (e: LayoutChangeEvent) => set(Math.ceil(e.nativeEvent.layout.width));

  return (
    <Animated.View
      {...a11y}
      style={[
        styles.cart,
        { height: s.btn, width, borderRadius: radius, backgroundColor: bg },
        disabled && styles.disabled,
      ]}
    >
      {/* Off-screen rulers inside a wide box, so nothing squeezes them. */}
      <View pointerEvents="none" style={[styles.ruler, styles.hidden]}>
        <View onLayout={measure(setTextW)} style={styles.row}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, numStyle]}>{text}</Text>
          {suffixText ? <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, styles.suffix, numStyle, { fontSize: (numStyle.fontSize ?? s.font) * 0.82 }]}>{suffixText}</Text> : null}
        </View>
      </View>

      <View style={[styles.cartRow, { width: openW }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents={collapsed ? 'none' : 'auto'}
          style={[styles.row, { opacity: open, transform: [{ translateX: open.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : s.btn * 0.5, 0] }) }] }]}
        >
          {dec}
          <Animated.View style={[styles.value, { width: valueW, height: s.btn, transform: [{ translateX: bump }] }]}>{number}</Animated.View>
        </Animated.View>
        <Animated.View pointerEvents={addLabel && collapsed ? 'none' : 'auto'} style={addLabel ? { opacity: open } : null}>
          {inc}
        </Animated.View>
      </View>

      {addLabel ? (
        <View pointerEvents="box-none" style={styles.ruler}>
          <Animated.View
            onLayout={measure(setAddW)}
            pointerEvents={collapsed ? 'auto' : 'none'}
            style={{ opacity: open.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }) }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={addLabel}
              disabled={disabled}
              hitSlop={hitFor(s.btn)}
              onPressIn={onAdd}
              onPressOut={onAddEnd}
              style={({ pressed }) => [styles.add, { height: s.btn, paddingHorizontal: Math.round(s.btn * 0.36) }, pressed && { backgroundColor: alpha(fg, 0.16) }]}
            >
              <Glyph d={ICON.plus} size={s.icon} color={fg} reduce={reduce} />
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.addText, ff, { color: fg, fontSize: s.font - 2 }]}>{addLabel}</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  );
}

interface ButtonLook {
  bg: string;
  borderColor: string;
  borderWidth: number;
  pressBg: string;
  pressBorder: string;
}

function StepButton({
  width,
  height,
  icon,
  glyph,
  radius,
  fg,
  look,
  limit,
  disabled,
  label,
  reduce,
  style,
  onPressIn,
  onPressOut,
}: {
  width: number;
  height: number;
  icon: number;
  glyph: string;
  radius: number;
  fg: string;
  look: Partial<ButtonLook>;
  /** At min / max: dimmed, but a press still gives the bump feedback. */
  limit: boolean;
  disabled: boolean;
  label: string;
  reduce: boolean;
  style?: StyleProp<ViewStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  // Scale and dim share one native-driven view; nothing JS-driven touches it.
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(limit ? 0.32 : 1)).current;
  // Reduce Motion: no press squeeze; the pressed background still shows the press.
  const spring = (to: number) => {
    if (reduce) scale.setValue(1);
    else Animated.spring(scale, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();
  };

  useEffect(() => {
    Animated.timing(dim, { toValue: limit ? 0.32 : 1, duration: motion.fast, useNativeDriver: true }).start();
    // A held button can hit the limit before onPressOut fires.
    if (limit) spring(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const hit = { top: hitFor(height), bottom: hitFor(height), left: hitFor(width), right: hitFor(width) };

  return (
    <Animated.View style={{ opacity: dim, transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || limit }}
        disabled={disabled}
        hitSlop={hit}
        onPressIn={() => {
          spring(limit ? 0.94 : 0.86);
          onPressIn();
        }}
        onPressOut={() => {
          spring(1);
          onPressOut();
        }}
        style={({ pressed }) => [
          styles.button,
          {
            width,
            height,
            borderRadius: radius,
            backgroundColor: look.bg ?? 'transparent',
            borderColor: look.borderColor,
            borderWidth: look.borderWidth ?? 0,
          },
          pressed && !limit && { backgroundColor: look.pressBg, borderColor: look.pressBorder ?? look.borderColor },
          style,
        ]}
      >
        <Glyph d={glyph} size={icon} color={fg} reduce={reduce} />
      </Pressable>
    </Animated.View>
  );
}

/** Stroked icon; pops in when its shape changes (− ↔ trash). */
function Glyph({ d, size, color, reduce }: { d: string; size: number; color: string; reduce: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(d);
  useEffect(() => {
    if (prev.current === d) return;
    prev.current = d;
    if (reduce) return;
    pop.setValue(0.55);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [d, pop, reduce]);
  const trash = d === ICON.trash;
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Svg width={trash ? size + 2 : size} height={trash ? size + 2 : size} viewBox="0 0 24 24" fill="none">
        <Path d={d} stroke={color} strokeWidth={trash ? 2 : 2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

/** Text where every changed character slides out and its replacement slides in (swaps at once with Reduce Motion). */
function RollingText({ text, dir, style, reduce }: { text: string; dir: number; style: TextStyle; reduce: boolean }) {
  const chars = [...text];
  return (
    <View style={styles.roll}>
      {chars.map((c, i) => (
        // Keyed from the right so the ones digit stays the ones digit when the number grows.
        <RollingChar key={chars.length - i} char={c} dir={dir} style={style} reduce={reduce} />
      ))}
    </View>
  );
}

function RollingChar({ char, dir, style, reduce }: { char: string; dir: number; style: TextStyle; reduce: boolean }) {
  const [pair, setPair] = useState<{ cur: string; prev: string | null; dir: number }>({ cur: char, prev: null, dir });
  if (pair.cur !== char) setPair({ cur: char, prev: pair.cur, dir });
  const t = useRef(new Animated.Value(1)).current;
  // The digit window follows the text's own (capped) Dynamic Type scale, so a scaled digit isn't cropped.
  const { fontScale } = useWindowDimensions();
  const h = ((style.lineHeight as number) ?? 24) * Math.min(fontScale, FONT_CAP);

  // Each change rolls once (a Reduce Motion toggle alone doesn't replay it).
  const played = useRef(pair);
  useLayoutEffect(() => {
    if (pair.prev === null || played.current === pair) return;
    played.current = pair;
    if (reduce) {
      // At 1 the old character is gone and the new one is in place: the final value, no roll.
      t.setValue(1);
      return;
    }
    t.setValue(0);
    Animated.spring(t, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [pair, t, reduce]);

  const d = pair.dir * h * 0.8;
  return (
    <View style={[styles.charBox, { height: h }]}>
      <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.num, style, styles.hidden]}>{pair.cur}</Text>
      {pair.prev !== null ? (
        <Animated.Text
          maxFontSizeMultiplier={FONT_CAP}
          style={[
            styles.num,
            styles.layer,
            style,
            {
              opacity: t.interpolate({ inputRange: [0, 0.55], outputRange: [1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -d] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
              ],
            },
          ]}
        >
          {pair.prev}
        </Animated.Text>
      ) : null}
      <Animated.Text
        maxFontSizeMultiplier={FONT_CAP}
        style={[
          styles.num,
          styles.layer,
          style,
          {
            opacity: pair.prev === null ? 1 : t.interpolate({ inputRange: [0.15, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [d, 0] }) }],
          },
        ]}
      >
        {pair.cur}
      </Animated.Text>
    </View>
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
  // Hugs its content in a column without hijacking the cross-axis alignment of a row.
  self: { alignItems: 'flex-start', justifyContent: 'center' },
  labelled: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, alignSelf: 'stretch' },
  texts: { flex: 1, gap: 2 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  description: { fontSize: 13, lineHeight: 18 },
  control: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { flexDirection: 'column' },
  disabled: { opacity: 0.45 },
  value: { alignItems: 'center', justifyContent: 'center' },
  button: { alignItems: 'center', justifyContent: 'center' },
  cart: { flexDirection: 'row', overflow: 'hidden' },
  cartRow: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  ruler: { position: 'absolute', top: 0, left: 0, width: 9999, flexDirection: 'row', alignItems: 'flex-start' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addText: { fontWeight: '400', letterSpacing: 0.1 },
  roll: { flexDirection: 'row', alignItems: 'center' },
  suffix: { fontWeight: '400', marginLeft: 4 },
  charBox: { overflow: 'hidden', justifyContent: 'center' },
  num: { fontWeight: '400', fontVariant: ['tabular-nums'], textAlign: 'center' },
  layer: { position: 'absolute', left: 0, right: 0 },
  hidden: { opacity: 0 },
});
