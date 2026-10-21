import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import {
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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type TextareaVariant = 'outlined' | 'filled';

export interface TextareaProps extends Omit<TextInputProps, 'style' | 'multiline'> {
  /** Optional label that rests on the first line and floats up on focus (FloatingInput feel). */
  label?: string;
  /** `false` puts the label above the field as static text (no notch); `placeholder` shows inside. */
  floatingLabel?: boolean;
  variant?: TextareaVariant;
  /** 'sm' 14px · 'md' 16px · 'lg' 18px — line height, padding and the floated label scale too. */
  size?: 'sm' | 'md' | 'lg';
  /** Rows shown when empty (default 3). */
  minRows?: number;
  /** The field grows line by line up to this many rows, then scrolls (default 8). */
  maxRows?: number;
  /** Character counter under the field. Defaults to on when `maxLength` is set. */
  showCount?: boolean;
  /** When false, `maxLength` is a soft limit: typing past it is allowed and the counter goes negative in red. */
  enforceMaxLength?: boolean;
  /** Error message. Turns the field red, shows it with an icon and shakes the field once when it appears. */
  error?: string;
  /** Valid state: success border and an animated check. A string is shown as the message under the field. */
  success?: boolean | string;
  /** Hint under the field (replaced by the error / success message while one is shown). */
  helper?: string;
  /** Focus colour (default: theme accent). */
  accent?: string;
  /** Background behind the field — the floating label cuts its notch with this colour. */
  surface?: string;
  /** Rendered inside the bottom edge of the field — attach / emoji buttons, a send button. */
  toolbar?: React.ReactNode;
  /** Root wrapper (the one that shakes) — margins, width, flex. */
  style?: StyleProp<ViewStyle>;
  /**
   * The bordered box: background, border width / colour, radius. Applied after the computed style,
   * so it wins. A `borderColor` replaces the resting border only — focus (accent), error and
   * success colours still take over. `height` is ignored: the box grows with `minRows` / `maxRows`.
   */
  fieldStyle?: StyleProp<ViewStyle>;
  /**
   * The typed text — fontSize, lineHeight, fontWeight, color, letterSpacing, fontFamily… Row height
   * follows `lineHeight` (or scales with `fontSize` when only that is given).
   */
  inputStyle?: StyleProp<TextStyle>;
  /**
   * The label, floating or above the field. Its `color` is the resting colour; focus (accent),
   * error (danger) and success colours still take over. A `fontSize` sets the resting size and the
   * label floats at the same ratio as the default; the notch follows the rendered label width.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Helper / error / success text under the field. `color` applies to the helper; error and success keep their tone colour. */
  messageStyle?: StyleProp<TextStyle>;
  /** The character counter (`42/280` and the characters-left number). Warning / danger colours still win near the limit. */
  counterStyle?: StyleProp<TextStyle>;
}

/** Everything that scales with `size`. */
export const TEXTAREA_SIZES = {
  sm: { font: 14, line: 20, floated: 11, padX: 12, padY: 10 },
  md: { font: 16, line: 22, floated: 12.5, padX: 16, padY: 14 },
  lg: { font: 18, line: 26, floated: 13.5, padX: 18, padY: 16 },
};

const BORDER = 1.5;
const HALO = 4;
/** Font size of the static label used when `floatingLabel` is false. */
const LABEL_ABOVE_FONT = { sm: 13, md: 14, lg: 14.5 };
const RING = 20;
const RING_STROKE = 2.5;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
/** react-native-web draws its own focus rectangle; our border + halo is the focus indicator. */
const NO_WEB_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Multiline field that glides taller line by line between `minRows` and `maxRows`, with an
 * optional floating label, a focus halo, a counter that morphs into a progress ring near
 * `maxLength`, and a `toolbar` slot for chat composers.
 */
export const Textarea = forwardRef<ComponentRef<typeof TextInput>, TextareaProps>(function Textarea(
  {
    label,
    floatingLabel = true,
    variant = 'outlined',
    size = 'md',
    minRows = 3,
    maxRows = 8,
    maxLength,
    showCount,
    enforceMaxLength = true,
    error,
    success,
    helper,
    accent,
    surface,
    toolbar,
    style,
    fieldStyle,
    inputStyle,
    labelStyle,
    messageStyle,
    counterStyle,
    placeholderTextColor,
    value,
    defaultValue,
    onChangeText,
    onFocus,
    onBlur,
    placeholder,
    editable = true,
    ...props
  },
  ref
) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const S = TEXTAREA_SIZES[size];
  // Height is driven by rows, so the user's `height` is dropped; their border colour replaces the resting one.
  const { borderColor: userBorder, height: _h, ...userField } = StyleSheet.flatten(fieldStyle) ?? {};
  const userInput = StyleSheet.flatten(inputStyle) ?? {};
  const userLabelColor = StyleSheet.flatten(labelStyle)?.color as string | undefined;
  const FONT = typeof userInput.fontSize === 'number' ? userInput.fontSize : S.font;
  const LINE = typeof userInput.lineHeight === 'number' ? userInput.lineHeight : Math.round((FONT * S.line) / S.font);
  const corner = typeof userField.borderRadius === 'number' ? userField.borderRadius : radius.md;
  // The hidden mirror must measure text exactly like the input does.
  const metrics: TextStyle = {
    ...ff,
    ...(userInput.fontFamily !== undefined ? { fontFamily: userInput.fontFamily } : null),
    ...(userInput.fontWeight !== undefined ? { fontWeight: userInput.fontWeight } : null),
    ...(userInput.fontStyle !== undefined ? { fontStyle: userInput.fontStyle } : null),
    ...(userInput.letterSpacing !== undefined ? { letterSpacing: userInput.letterSpacing } : null),
  };
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  const filled = variant === 'filled';
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => inputRef.current as ComponentRef<typeof TextInput>);

  const [focused, setFocused] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? '');
  const text = value ?? inner;
  const floating = focused || text.length > 0;
  /** Label rendered inside the field (and floated); otherwise it sits above as static text. */
  const inLabel = label && floatingLabel ? label : undefined;
  const topLabel = label && !floatingLabel ? label : undefined;
  const isFocused = focused && editable;
  const over = maxLength !== undefined && text.length > maxLength;
  const ok = !error && !over && !!success;
  const successText = typeof success === 'string' && ok ? success : undefined;

  const [contentH, setContentH] = useState<number | null>(null);
  const [toolbarH, setToolbarH] = useState<number | null>(toolbar ? null : 0);

  const lo = Math.max(1, minRows);
  const hi = Math.max(lo, maxRows);
  const lines = Math.round((contentH ?? LINE) / LINE);
  const rows = Math.min(hi, Math.max(lo, lines));
  const padTop = filled && inLabel ? S.padY + 14 : S.padY;
  const padBottom = toolbar ? 4 : filled ? S.padY - 2 : S.padY;
  const height = padTop + rows * LINE + padBottom + (toolbar ? toolbarH ?? 0 : 0) + BORDER * 2;

  const grow = useRef(new Animated.Value(height)).current; // JS: height
  const focus = useRef(new Animated.Value(0)).current; // JS: colours
  const glow = useRef(new Animated.Value(0)).current; // native: halo
  const float = useRef(new Animated.Value(floating ? 1 : 0)).current; // native: label
  const shake = useRef(new Animated.Value(0)).current; // native
  const check = useRef(new Animated.Value(ok ? 1 : 0)).current; // native
  const settled = useRef(false);

  useEffect(() => {
    // Snap to the first measured size; glide on every change after that.
    if (!settled.current) {
      grow.setValue(height);
      if (contentH !== null && toolbarH !== null) settled.current = true;
      return;
    }
    Animated.timing(grow, { toValue: height, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [height, grow, contentH, toolbarH]);

  useEffect(() => {
    Animated.spring(float, { toValue: floating ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [floating, float]);

  useEffect(() => {
    Animated.timing(focus, { toValue: isFocused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    Animated.spring(glow, { toValue: isFocused ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [isFocused, focus, glow]);

  useEffect(() => {
    Animated.spring(check, { toValue: ok ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [ok, check]);

  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -8, 6, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))
    ).start();
  }, [error, shake]);

  const setText = (next: string) => {
    if (value === undefined) setInner(next);
    onChangeText?.(next);
  };

  const bad = !!error || over;
  const active = bad ? colors.danger : tint;
  const rest = bad ? colors.danger : ok ? colors.success : ((userBorder as string | undefined) ?? (filled ? alpha(colors.input, 0) : colors.input));
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [rest, active] });
  const labelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [bad ? colors.danger : ok ? colors.success : (userLabelColor ?? colors.mutedForeground), active],
  });
  const topLabelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [bad ? colors.danger : (userLabelColor ?? colors.foreground), active],
  });

  // Label rests on the first line; floats onto the border (outlined) or into the top padding (filled).
  const restCenter = padTop + LINE / 2;
  const floatY = filled ? S.padY + 1 - restCenter : -restCenter - BORDER / 2;
  const floatX = filled ? 0 : 12 - S.padX;
  const floatScale = S.floated / S.font;
  const checkSize = 20;

  const counting = (showCount ?? maxLength !== undefined) && maxLength !== undefined;
  const message = error ?? successText ?? helper;
  const tone: MessageTone = error ? 'error' : successText ? 'success' : 'helper';
  const toneColor = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.mutedForeground;

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, style]}>
      {topLabel ? (
        <Animated.Text
          numberOfLines={1}
          onPress={editable ? () => inputRef.current?.focus() : undefined}
          // The input already carries the label for screen readers.
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[styles.topLabel, ff, { fontSize: LABEL_ABOVE_FONT[size] }, labelStyle, { color: topLabelColor }, !editable && styles.disabled]}
        >
          {topLabel}
        </Animated.Text>
      ) : null}
      <View style={!editable && styles.disabled}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderRadius: corner + HALO,
              backgroundColor: active,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18], extrapolate: 'clamp' }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
            },
          ]}
        />
        <Pressable onPress={() => inputRef.current?.focus()} disabled={!editable} accessible={false}>
          <Animated.View
            style={[
              styles.field,
              {
                height: grow,
                borderRadius: radius.md,
                backgroundColor: filled ? colors.muted : bg,
              },
              userField,
              { borderColor },
            ]}
          >
            {/* Invisible mirror of the text: its height tells us how many lines to show, on every platform. */}
            <View pointerEvents="none" style={[styles.mirrorBox, { left: S.padX - BORDER, right: S.padX - BORDER + (ok ? 28 : 0) }]}>
              <Text
                onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
                style={[styles.mirror, metrics, { fontSize: FONT, lineHeight: LINE }]}
              >
                {text.endsWith('\n') || !text ? text + ' ' : text}
              </Text>
            </View>
            <TextInput
              ref={inputRef}
              accessibilityLabel={label ?? placeholder}
              {...props}
              multiline
              maxLength={enforceMaxLength ? maxLength : undefined}
              editable={editable}
              value={text}
              onChangeText={setText}
              onFocus={(e) => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={(e) => {
                setFocused(false);
                onBlur?.(e);
              }}
              placeholder={!inLabel || floating ? placeholder : undefined}
              placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
              selectionColor={active}
              cursorColor={active}
              scrollEnabled={lines > hi}
              textAlignVertical="top"
              style={[
                styles.input,
                ff,
                { color: colors.foreground, fontSize: S.font },
                inputStyle,
                {
                  lineHeight: LINE,
                  paddingTop: padTop,
                  paddingBottom: padBottom,
                  paddingLeft: S.padX - BORDER,
                  paddingRight: S.padX - BORDER + (ok ? 28 : 0),
                },
                NO_WEB_OUTLINE,
              ]}
            />
            {toolbar ? (
              <View onLayout={(e) => setToolbarH(e.nativeEvent.layout.height)} style={styles.toolbar}>
                {toolbar}
              </View>
            ) : null}
            {inLabel ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.labelWrap,
                  {
                    top: padTop,
                    left: S.padX - BORDER,
                    right: S.padX,
                    height: LINE,
                    transform: [
                      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, floatY] }) },
                      { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [0, floatX] }) },
                      { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, floatScale] }) },
                    ],
                  },
                ]}
              >
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    ff,
                    {
                      fontSize: S.font,
                      // The notch: the label paints the surface over the border, so it matches the rendered width.
                      backgroundColor: filled ? 'transparent' : bg,
                      paddingHorizontal: filled ? 0 : 5,
                      marginLeft: filled ? 0 : -5,
                    },
                    labelStyle,
                    { color: labelColor },
                  ]}
                >
                  {inLabel}
                </Animated.Text>
              </Animated.View>
            ) : null}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.check,
                {
                  top: padTop - BORDER + (LINE - checkSize) / 2,
                  right: S.padX - BORDER - 4,
                  opacity: check.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    { scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    { rotate: check.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
                  ],
                },
              ]}
            >
              <Svg width={checkSize} height={checkSize} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={11} fill={alpha(colors.success, 0.16)} />
                <Path d="M7.5 12.5l3 3 6-6.5" stroke={colors.success} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
      {message || counting ? (
        <View style={styles.footer}>
          <View style={styles.messageSlot}>
            {message ? <FieldMessage key={tone + message} text={message} tone={tone} color={toneColor} style={messageStyle} /> : null}
          </View>
          {counting ? <Counter length={text.length} max={maxLength} tint={tint} style={counterStyle} /> : null}
        </View>
      ) : null}
    </Animated.View>
  );
});

type MessageTone = 'error' | 'success' | 'helper';

/** Helper / error / success line. Error and success slide up and fade in. */
function FieldMessage({ text, tone, color, style }: { text: string; tone: MessageTone; color: string; style?: StyleProp<TextStyle> }) {
  const { font } = useKit();
  const enter = useRef(new Animated.Value(tone === 'helper' ? 1 : 0)).current; // native
  useEffect(() => {
    if (tone !== 'helper') Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
  }, [tone, enter]);

  return (
    <Animated.View
      style={[
        styles.message,
        {
          opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
        },
      ]}
    >
      {tone === 'helper' ? null : (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={styles.messageIcon}>
          <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={1.8} />
          {tone === 'error' ? (
            <>
              <Path d="M12 7.5v5.25" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={16.3} r={1.1} fill={color} />
            </>
          ) : (
            <Path d="M8 12.3l2.7 2.7 5.3-5.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
      )}
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.helper, font.family ? { fontFamily: font.family } : null, { color }, style, tone !== 'helper' && { color }]}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

/** "42/280", turning into a filling ring with the characters left once you get close. */
function Counter({ length, max, tint, style }: { length: number; max: number; tint: string; style?: StyleProp<TextStyle> }) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const remaining = max - length;
  const ratio = length / max;
  const near = remaining <= Math.max(10, Math.round(max * 0.2));
  const color = ratio >= 1 ? colors.danger : ratio >= 0.9 ? colors.warning : tint;

  const mode = useRef(new Animated.Value(near ? 1 : 0)).current; // native
  const pulse = useRef(new Animated.Value(1)).current; // native
  const progress = useRef(new Animated.Value(Math.min(1, ratio))).current; // JS (SVG prop)

  useEffect(() => {
    Animated.spring(mode, { toValue: near ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [near, mode]);

  useEffect(() => {
    Animated.spring(progress, { toValue: Math.min(1, ratio), useNativeDriver: false, ...motion.snappy }).start();
  }, [ratio, progress]);

  const limitHit = remaining <= 0;
  useEffect(() => {
    if (!limitHit) return;
    pulse.setValue(1.35);
    Animated.spring(pulse, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [limitHit, pulse]);

  return (
    <View
      style={styles.counter}
      accessible
      accessibilityRole="text"
      accessibilityLabel={remaining >= 0 ? `${remaining} of ${max} characters left` : `${-remaining} characters over the ${max} limit`}
    >
      <Animated.Text
        style={[
          styles.count,
          ff,
          { color: colors.mutedForeground },
          style,
          { opacity: mode.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
        ]}
      >
        {length}/{max}
      </Animated.Text>
      <Animated.View
        style={[
          styles.ringRow,
          { opacity: mode, transform: [{ scale: mode.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
        ]}
      >
        <Text style={[styles.count, ff, { color: colors.mutedForeground }, style, ratio >= 0.9 && { color }]}>{remaining}</Text>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.border} strokeWidth={RING_STROKE} fill="none" />
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={RING_R}
              stroke={color}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_C} ${RING_C}`}
              strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] })}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  halo: { position: 'absolute', top: -HALO, left: -HALO, right: -HALO, bottom: -HALO },
  field: { borderWidth: BORDER },
  input: { flex: 1 },
  mirrorBox: { position: 'absolute', top: 0, height: 0, overflow: 'hidden' },
  mirror: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, gap: 4 },
  labelWrap: { position: 'absolute', justifyContent: 'center', alignItems: 'flex-start', transformOrigin: 'left center' },
  label: { fontWeight: '400' },
  topLabel: { fontWeight: '400', marginBottom: 6, marginHorizontal: 2 },
  check: { position: 'absolute' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12, minHeight: RING, marginHorizontal: 4 },
  messageSlot: { flex: 1 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  messageIcon: { marginTop: 1.5 },
  helper: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
  counter: { minWidth: 56, height: RING, alignItems: 'flex-end', justifyContent: 'center' },
  count: { fontSize: 12.5, fontVariant: ['tabular-nums'], fontWeight: '400' },
  ringRow: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
