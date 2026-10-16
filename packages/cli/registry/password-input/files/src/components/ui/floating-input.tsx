import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export type FloatingInputVariant = 'outlined' | 'filled' | 'underline';

export interface FloatingInputProps extends Omit<TextInputProps, 'style' | 'placeholder'> {
  /** Sits inside the field like a placeholder, then floats onto the border when focused or filled. */
  label: string;
  /** `false` puts the label above the field as static text (no notch) and shows `placeholder` inside. */
  floatingLabel?: boolean;
  /** Hint inside the empty field — only used when `floatingLabel` is false. */
  placeholder?: string;
  variant?: FloatingInputVariant;
  /** Error message. Turns the field red, shows it with an icon and shakes the field once when it appears. */
  error?: string;
  /** Valid state: success border and an animated check. A string is shown as the message under the field. */
  success?: boolean | string;
  /** Hint under the field (replaced by the error / success message while one is shown). */
  helper?: string;
  /** Colour of the focused border, halo and floating label (default: theme accent). */
  accent?: string;
  /** Background behind the field — the floating label cuts its notch with this colour. */
  surface?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Text before the value, shown once the label floats — '₹', '+91', 'https://'. */
  prefix?: string;
  /** Text after the value, shown once the label floats — 'INR', 'kg', '.com'. */
  suffix?: string;
  /** Show an animated clear button while there is text. */
  clearable?: boolean;
  /** Show `length/maxLength` under the field (needs `maxLength`). */
  counter?: boolean;
  /** 'sm' 44pt / 14px · 'md' 54pt / 16px · 'lg' 64pt / 18px — type, padding and icons scale too. */
  size?: 'sm' | 'md' | 'lg';
  /** Root wrapper (the one that shakes) — margins, width, flex. */
  style?: StyleProp<ViewStyle>;
  /**
   * The bordered box: background, border width / colour, radius, height, padding. Applied after
   * the computed style, so it wins. A `borderColor` replaces the resting border only — focus
   * (accent), error and success colours still take over in those states. A numeric `height` /
   * `borderRadius` also re-centres the label and resizes the focus halo.
   */
  fieldStyle?: StyleProp<ViewStyle>;
  /** The typed text — fontSize, fontWeight, color, letterSpacing, fontFamily… */
  inputStyle?: StyleProp<TextStyle>;
  /**
   * The label, floating or above the field. Its `color` is the resting colour; focus (accent),
   * error (danger) and success colours still take over in those states. With `fontSize` the
   * floating label rests at that size and floats at the same ratio as the default, and the notch
   * follows the rendered label width.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Helper / error / success text under the field. `color` applies to the helper; error and success keep their tone colour. */
  messageStyle?: StyleProp<TextStyle>;
  /** `prefix` text. */
  prefixStyle?: StyleProp<TextStyle>;
  /** `suffix` text. */
  suffixStyle?: StyleProp<TextStyle>;
  /** The `length/maxLength` counter. Turns danger at the limit regardless. */
  counterStyle?: StyleProp<TextStyle>;
  /** Built-in icons at rest — the clear button (default: theme mutedForeground). */
  iconColor?: string;
}

/** Everything that scales with `size`: height, type, padding, icons and the floated label. */
export const FLOATING_INPUT_SIZES = {
  sm: { height: 44, font: 14, floated: 11, padX: 12, icon: 16, radius: -2 },
  md: { height: 54, font: 16, floated: 12.5, padX: 16, icon: 18, radius: 0 },
  lg: { height: 64, font: 18, floated: 13.5, padX: 18, icon: 20, radius: 4 },
};
const HALO = 4;
/** Font size of the static label used when `floatingLabel` is false. */
const LABEL_ABOVE_FONT = { sm: 13, md: 14, lg: 14.5 };
/** react-native-web draws its own focus rectangle; our border + halo is the focus indicator. */
const NO_WEB_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;

/**
 * Web only: browser autofill paints its own (blue) background and fills the input without an
 * onChangeText, so the label would sit on top of the text. This stylesheet keeps the field's own
 * background and fires a 1ms animation we listen for to float the label.
 */
const AUTOFILL_CSS = `@keyframes ekAutofillOn{from{}to{}}@keyframes ekAutofillOff{from{}to{}}
input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{animation:ekAutofillOn 1ms;-webkit-text-fill-color:currentColor!important;caret-color:currentColor;transition:background-color 99999s 0s,color 99999s 0s!important}
input:not(:-webkit-autofill){animation:ekAutofillOff 1ms}`;
function useWebAutofill(inputRef: React.RefObject<TextInput | null>, onChange: (filled: boolean) => void) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!document.getElementById('expokit-autofill')) {
      const tag = document.createElement('style');
      tag.id = 'expokit-autofill';
      tag.textContent = AUTOFILL_CSS;
      document.head.appendChild(tag);
    }
    const node = inputRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onAnim = (e: Event) => {
      const name = (e as AnimationEvent).animationName;
      if (name === 'ekAutofillOn') onChange(true);
      else if (name === 'ekAutofillOff') onChange(false);
    };
    node.addEventListener('animationstart', onAnim);
    return () => node.removeEventListener('animationstart', onAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Text field whose label starts as the placeholder and glides up onto the border on focus,
 * cutting a notch in the outline (Material-style). Focus draws a soft halo, errors shake,
 * success pops a check — all spring-driven.
 */
export const FloatingInput = forwardRef<TextInput, FloatingInputProps>(function FloatingInput(
  {
    label,
    floatingLabel = true,
    placeholder,
    variant = 'outlined',
    error,
    success,
    helper,
    accent,
    surface,
    left,
    right,
    prefix,
    suffix,
    clearable,
    counter,
    size = 'md',
    style,
    fieldStyle,
    inputStyle,
    labelStyle: labelStyleProp,
    messageStyle,
    prefixStyle,
    suffixStyle,
    counterStyle,
    iconColor,
    placeholderTextColor,
    value,
    defaultValue,
    onChangeText,
    onFocus,
    onBlur,
    maxLength,
    editable = true,
    ...props
  },
  ref
) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const S = FLOATING_INPUT_SIZES[size];
  // The user's border colour only replaces the resting one; numeric height / radius drive the layout maths.
  const { borderColor: userBorder, ...userField } = StyleSheet.flatten(fieldStyle) ?? {};
  const userLabelColor = StyleSheet.flatten(labelStyleProp)?.color;
  const HEIGHT = typeof userField.height === 'number' ? userField.height : S.height;
  // Floated size stays relative to the resting size, so a bigger label floats bigger at the same ratio.
  const FLOAT_SCALE = S.floated / S.font;
  const corner = typeof userField.borderRadius === 'number' ? userField.borderRadius : radius.scale(12 + S.radius);
  const adorn = S.padX + S.icon + 10; // room for a left / right adornment
  const slot = S.icon + 10; // room for the clear button / check
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);

  const [focused, setFocused] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? '');
  const [autofilled, setAutofilled] = useState(false);
  useWebAutofill(inputRef, setAutofilled);
  const text = value ?? inner;
  const floating = focused || text.length > 0 || autofilled;
  const isFocused = focused && editable;
  const ok = !error && !!success;
  const successText = typeof success === 'string' && ok ? success : undefined;

  const float = useRef(new Animated.Value(floating ? 1 : 0)).current; // native: label + affixes
  const glow = useRef(new Animated.Value(0)).current; // native: halo + indicator bar
  const focus = useRef(new Animated.Value(0)).current; // JS: border / label colour
  const shake = useRef(new Animated.Value(0)).current; // native
  const clear = useRef(new Animated.Value(clearable && text ? 1 : 0)).current; // native
  const check = useRef(new Animated.Value(ok ? 1 : 0)).current; // native

  useEffect(() => {
    Animated.spring(float, { toValue: floating ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [floating, float]);

  useEffect(() => {
    Animated.timing(focus, { toValue: isFocused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    Animated.spring(glow, { toValue: isFocused ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [isFocused, focus, glow]);

  useEffect(() => {
    Animated.spring(clear, { toValue: clearable && text && editable ? 1 : 0, useNativeDriver: true, ...motion.bouncy }).start();
  }, [clearable, text, editable, clear]);

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

  const active = error ? colors.danger : tint;
  const rest = error ? colors.danger : ok ? colors.success : ((userBorder as string | undefined) ?? colors.input);
  const borderColor = focus.interpolate({ inputRange: [0, 1], outputRange: [rest, active] });
  const labelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : ok ? colors.success : ((userLabelColor as string | undefined) ?? colors.mutedForeground), active],
  });
  const glowClamped = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  const outlined = variant === 'outlined';
  const filled = variant === 'filled';
  const underline = variant === 'underline';
  const leftPad = underline ? (left ? S.icon + 14 : 2) : left ? adorn : S.padX;
  const edge = right ? adorn : underline ? 0 : S.padX - 4;
  const rightPad = (right ? adorn : underline ? 2 : S.padX) + (clearable ? slot : 0) + (ok ? slot : 0);
  // Filled / underline push the text down so the floated label has room above it.
  const contentTop = !floatingLabel ? 0 : filled ? HEIGHT / 3.2 : underline ? HEIGHT / 4.5 : 0;
  const restCenter = (HEIGHT + contentTop) / 2;
  const floatCenter = outlined ? 0 : filled ? HEIGHT * 0.26 : HEIGHT * 0.2;
  const floatY = floatCenter - restCenter;
  const floatX = outlined ? S.padX - 4 - leftPad : 0;

  const labelStyle = {
    transform: [
      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, floatY] }) },
      { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [0, floatX] }) },
      { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, FLOAT_SCALE] }) },
    ],
  };
  // With the label above the field there is nothing to make room for, so affixes always show.
  const affixOpacity = floatingLabel ? float.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }) : 1;
  const topLabelColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : ((userLabelColor as string | undefined) ?? colors.foreground), active],
  });

  const boxStyle: ViewStyle = outlined
    ? { borderWidth: 1.5, borderRadius: corner, backgroundColor: bg }
    : filled
      ? { borderRadius: corner, backgroundColor: colors.muted, overflow: 'hidden' }
      : { backgroundColor: 'transparent' };

  const message = error ?? successText ?? helper;
  const tone: MessageTone = error ? 'error' : successText ? 'success' : 'helper';
  const toneColor = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.mutedForeground;
  const restIcon = iconColor ?? colors.mutedForeground;
  const showCounter = counter && maxLength !== undefined;

  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, style]}>
      {floatingLabel ? null : (
        <Animated.Text
          numberOfLines={1}
          onPress={editable ? () => inputRef.current?.focus() : undefined}
          // The input already carries the label for screen readers.
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[
            styles.topLabel,
            ff,
            { fontSize: LABEL_ABOVE_FONT[size] },
            underline && styles.topLabelFlush,
            labelStyleProp,
            { color: topLabelColor },
            !editable && styles.disabled,
          ]}
        >
          {label}
        </Animated.Text>
      )}
      <View style={!editable && styles.disabled}>
        {underline ? null : (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                borderRadius: corner + HALO,
                backgroundColor: active,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18], extrapolate: 'clamp' }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
              },
            ]}
          />
        )}
        <Pressable onPress={() => inputRef.current?.focus()} disabled={!editable} accessible={false}>
          <Animated.View style={[styles.field, boxStyle, { height: HEIGHT }, userField, { borderColor }]}>
            {left ? <View style={[styles.left, { left: underline ? 2 : S.padX - 2 }, underline && { top: contentTop }]}>{left}</View> : null}
            <View style={[styles.row, { paddingLeft: leftPad, paddingRight: rightPad, paddingTop: contentTop }]}>
              {prefix ? (
                <Animated.Text style={[styles.affix, styles.prefix, ff, { fontSize: S.font }, { color: colors.mutedForeground }, prefixStyle, { opacity: affixOpacity }]}>
                  {prefix}
                </Animated.Text>
              ) : null}
              <TextInput
                ref={inputRef}
                accessibilityLabel={label}
                {...props}
                maxLength={maxLength}
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
                placeholder={floatingLabel ? undefined : placeholder}
                placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
                selectionColor={active}
                cursorColor={active}
                style={[styles.input, ff, { color: colors.foreground, fontSize: S.font }, inputStyle, NO_WEB_OUTLINE]}
              />
              {suffix ? (
                <Animated.Text style={[styles.affix, styles.suffix, ff, { fontSize: S.font }, { color: colors.mutedForeground }, suffixStyle, { opacity: affixOpacity }]}>
                  {suffix}
                </Animated.Text>
              ) : null}
            </View>
            {floatingLabel ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.labelWrap, { left: leftPad, right: right ? adorn : S.padX - 4, top: contentTop, height: HEIGHT - contentTop }, labelStyle]}
              >
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    ff,
                    {
                      fontSize: S.font,
                      // The notch: label paints the surface colour over the border line, so it is
                      // always exactly as wide as the rendered label.
                      backgroundColor: outlined ? bg : 'transparent',
                      paddingHorizontal: outlined ? 5 : 0,
                      marginLeft: outlined ? -5 : 0,
                    },
                    labelStyleProp,
                    { color: labelColor },
                  ]}
                >
                  {label}
                </Animated.Text>
              </Animated.View>
            ) : null}
            {clearable ? (
              <Animated.View
                style={[styles.slot, { right: edge, top: contentTop, opacity: clear, transform: [{ scale: clear }] }]}
                pointerEvents={text && editable ? 'box-none' : 'none'}
              >
                <Pressable
                  hitSlop={(44 - S.icon) / 2}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear ${label}`}
                  onPress={() => {
                    setText('');
                    inputRef.current?.focus();
                  }}
                >
                  <Svg width={S.icon} height={S.icon} viewBox="0 0 24 24">
                    <Circle cx={12} cy={12} r={11} fill={alpha(restIcon, 0.7)} />
                    <Path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke={bg} strokeWidth={2.4} strokeLinecap="round" />
                  </Svg>
                </Pressable>
              </Animated.View>
            ) : null}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.slot,
                {
                  right: edge + (clearable ? slot : 0),
                  top: contentTop,
                  opacity: check.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [
                    { scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    { rotate: check.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
                  ],
                },
              ]}
            >
              <Svg width={S.icon + 2} height={S.icon + 2} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={11} fill={alpha(colors.success, 0.16)} />
                <Path d="M7.5 12.5l3 3 6-6.5" stroke={colors.success} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>
            {right ? <View style={[styles.right, { right: underline ? 0 : S.padX - 4, top: contentTop }]}>{right}</View> : null}
            {outlined ? null : (
              <>
                <View pointerEvents="none" style={[styles.baseLine, { height: underline ? 1.5 : 1, backgroundColor: rest }]} />
                {/* Grows out from the centre on focus. */}
                <Animated.View
                  pointerEvents="none"
                  style={[styles.bar, { backgroundColor: active, transform: [{ scaleX: glowClamped }] }]}
                />
              </>
            )}
          </Animated.View>
        </Pressable>
      </View>
      {message || showCounter ? (
        <View style={[styles.footer, underline && styles.footerFlush]}>
          <View style={styles.messageSlot}>
            {message ? <FieldMessage key={tone + message} text={message} tone={tone} color={toneColor} style={messageStyle} /> : null}
          </View>
          {showCounter ? (
            <Text
              style={[
                styles.count,
                ff,
                { color: colors.mutedForeground },
                counterStyle,
                text.length >= maxLength! && { color: colors.danger },
              ]}
            >
              {text.length}/{maxLength}
            </Text>
          ) : null}
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

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  halo: { position: 'absolute', top: -HALO, left: -HALO, right: -HALO, bottom: -HALO },
  field: { justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', height: '100%' },
  input: { flex: 1, alignSelf: 'stretch', paddingVertical: 0, paddingHorizontal: 0 },
  affix: { fontWeight: '400' },
  prefix: { marginRight: 4 },
  suffix: { marginLeft: 6 },
  labelWrap: { position: 'absolute', justifyContent: 'center', alignItems: 'flex-start', transformOrigin: 'left center' },
  label: { fontWeight: '400' },
  topLabel: { fontWeight: '400', marginBottom: 6, marginHorizontal: 2 },
  topLabelFlush: { marginHorizontal: 0 },
  left: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' },
  right: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  slot: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  baseLine: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  footer: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 6, marginHorizontal: 4 },
  footerFlush: { marginHorizontal: 0 },
  messageSlot: { flex: 1 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  messageIcon: { marginTop: 1.5 },
  helper: { flexShrink: 1, fontSize: 12.5, lineHeight: 17 },
  count: { fontSize: 12.5, lineHeight: 17, fontWeight: '400', fontVariant: ['tabular-nums'] },
});
