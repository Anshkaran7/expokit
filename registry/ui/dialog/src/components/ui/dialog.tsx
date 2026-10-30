import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

/**
 * `default` — a centred alert dialog.
 * `destructive` — danger-coloured confirm, a warning icon and a warning haptic on open.
 * @deprecated `sheet` — removed; renders as `default`. Use ActionSheet for bottom actions.
 */
export type DialogVariant = 'default' | 'destructive' | 'sheet';
/** Living icon shown in a halo above the title. */
export type DialogTone = 'info' | 'success' | 'warning' | 'danger';
/** `modern` — pill buttons (default). `ios` — full-width text buttons split by hairlines. */
export type DialogAppearance = 'modern' | 'ios';

export interface DialogAction {
  label: string;
  /**
   * Receives the prompt's text (if any). Return a promise to show a spinner on the button until
   * it settles. Return `false` (or resolve to it) to keep the dialog open and shake it as invalid.
   */
  onPress?: ((value: string) => void | boolean | Promise<void | boolean>) | undefined;
  /** 'primary' is the main call to action; 'destructive' uses the danger colour; 'cancel' is the quiet one. */
  role?: 'primary' | 'default' | 'destructive' | 'cancel' | undefined;
  disabled?: boolean | undefined;
}

/** A single-line text field inside the dialog (a prompt). */
export interface DialogPrompt {
  defaultValue?: string | undefined;
  /** Controlled text. */
  value?: string | undefined;
  onChangeText?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  /** Accessibility label of the field (default: the placeholder or title). */
  label?: string | undefined;
  secureTextEntry?: boolean | undefined;
  keyboardType?: KeyboardTypeOptions | undefined;
  autoCapitalize?: TextInputProps['autoCapitalize'] | undefined;
  maxLength?: number | undefined;
  /** Select the text when the dialog opens (default true). */
  selectTextOnFocus?: boolean | undefined;
}

export interface DialogProps {
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** `sheet` is deprecated and renders as `default`. */
  variant?: DialogVariant | undefined;
  /** Living icon in a halo above the title, plus a soft glow of its colour. Destructive defaults to a warning icon. */
  tone?: DialogTone | undefined;
  /** `modern` pill buttons (default) or `ios` hairline-separated text buttons. */
  appearance?: DialogAppearance | undefined;
  title?: string | undefined;
  description?: string | undefined;
  /** Custom content between the description and the actions. */
  children?: React.ReactNode | undefined;
  /** Turns the dialog into a prompt with a text field; the text is passed to `onConfirm` / `onPress`. */
  prompt?: DialogPrompt | undefined;
  /** Error text under the description / field, in the danger colour. */
  error?: string | undefined;
  /** Buttons. Defaults to Cancel + Confirm built from the labels below. */
  actions?: DialogAction[] | undefined;
  confirmLabel?: string | undefined;
  /** Label of the default cancel button; `null` leaves only the confirm button. */
  cancelLabel?: string | null | undefined;
  onConfirm?: DialogAction['onPress'] | undefined;
  /** Called when the default cancel button, the scrim, back or Escape closes the dialog. */
  onCancel?: (() => void) | undefined;
  /** Spinner on the confirm button and every other button disabled (controlled busy state). */
  loading?: boolean | undefined;
  /** `auto` puts two short buttons side by side and stacks the rest. */
  actionsLayout?: 'auto' | 'row' | 'stack' | undefined;
  /** Custom icon inside the halo, or `false` to hide the tone icon. */
  icon?: React.ReactNode | false | undefined;
  /** Close when the scrim is tapped, on back and on Escape (default true). */
  dismissible?: boolean | undefined;
  /** Notification haptic on open (warning for destructive, success for success) and error on shake (default true). */
  haptics?: boolean | undefined;
  /** Colour of the primary action (default: theme primary; accent in `ios`). */
  accent?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const SHAKE = [10, -9, 7, -5, 3, 0];
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

/**
 * A centred alert dialog. The scrim fades in while the card springs from 0.92 to full size; an
 * optional tone icon draws itself inside a halo with a soft glow. Modern pill buttons or iOS
 * hairline buttons, side by side or stacked. Destructive confirms are danger-coloured and buzz a
 * warning on open; async confirms show a spinner; returning `false` shakes the card as invalid.
 * Add `prompt` for a text field. For bottom actions use ActionSheet.
 */
export function Dialog({
  open,
  defaultOpen = false,
  onOpenChange,
  variant = 'default',
  tone,
  appearance = 'modern',
  title,
  description,
  children,
  prompt,
  error,
  actions,
  confirmLabel,
  cancelLabel: cancelLabelProp,
  onConfirm,
  onCancel,
  loading = false,
  actionsLayout = 'auto',
  icon,
  dismissible = true,
  haptics = true,
  accent,
  style,
}: DialogProps) {
  const { colors, radius, dark, font, labels } = useKit();
  const cancelLabel = cancelLabelProp === undefined ? labels.cancel : cancelLabelProp; // null hides it
  const ff = font.family ? { fontFamily: font.family } : null;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduceMotion = useReduceMotion();
  const destructive = variant === 'destructive';
  const ios = appearance === 'ios';
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  // Stays mounted while the exit animation runs; cleared in its completion callback.
  const [keep, setKeep] = useState(isOpen);
  if (isOpen && !keep) setKeep(true);
  const mounted = isOpen || keep;
  const [busy, setBusy] = useState<number | null>(null);
  // null = untouched since opening, so the field shows `prompt.defaultValue`.
  const [text, setText] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const value = prompt?.value ?? text ?? prompt?.defaultValue ?? '';

  // Native: card life (opacity + scale), scrim, shake, icon glyph pop, halo ripple. JS: icon outline draw.
  const [t] = useState(() => new Animated.Value(0));
  const [scrim] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(0));
  const [glyph] = useState(() => new Animated.Value(0));
  const [ripple] = useState(() => new Animated.Value(0));

  const tones: Record<DialogTone, string> = {
    info: dark ? '#60a5fa' : '#2563eb',
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
  const glyphKind: DialogTone | null = tone ?? (destructive ? 'warning' : null);
  const toneColor = tone ? tones[tone] : destructive ? colors.danger : null;
  const showHalo = icon !== false && (icon != null || glyphKind !== null);
  const haloColor = toneColor ?? accent ?? colors.accent;

  const list: DialogAction[] = actions ?? [
    ...(cancelLabel !== null ? [{ label: cancelLabel, role: 'cancel' as const, onPress: () => onCancel?.() }] : []),
    {
      label: confirmLabel ?? (destructive ? labels.delete : labels.continue),
      role: destructive ? ('destructive' as const) : ('primary' as const),
      onPress: onConfirm,
    },
  ];
  const confirmIndex = (() => {
    const i = list.findIndex((a) => a.role === 'primary' || a.role === 'destructive');
    return i === -1 ? list.length - 1 : i;
  })();
  const spinning = loading ? confirmIndex : busy;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  const requestClose = () => {
    if (!dismissible || spinning !== null) return;
    if (!actions) onCancel?.();
    setOpen(false);
  };
  const live = useRef({ requestClose });
  useLayoutEffect(() => {
    live.current = { requestClose };
  });

  const playIcon = () => {
    if (reduceMotion) {
      draw.setValue(1);
      glyph.setValue(1);
      ripple.setValue(1);
      return;
    }
    draw.setValue(0);
    glyph.setValue(0);
    ripple.setValue(0);
    Animated.timing(draw, { toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.sequence([Animated.delay(400), Animated.spring(glyph, { toValue: 1, useNativeDriver: true, ...motion.bouncy })]).start();
    Animated.timing(ripple, { toValue: 1, duration: 700, delay: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (isOpen) {
      shake.setValue(0);
      if (haptics) {
        const type =
          destructive || tone === 'warning' || tone === 'danger' || list.some((a) => a.role === 'destructive')
            ? Haptics.NotificationFeedbackType.Warning
            : tone === 'success'
              ? Haptics.NotificationFeedbackType.Success
              : null;
        if (type !== null) Haptics.notificationAsync(type).catch(() => {});
      }
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        reduceMotion
          ? Animated.timing(t, { toValue: 1, duration: 180, useNativeDriver: true })
          : Animated.spring(t, { toValue: 1, useNativeDriver: true, ...motion.snappy }),
      ]).start();
      playIcon();
    } else {
      Animated.parallel([
        Animated.timing(t, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setKeep(false);
        setText(null);
        setBusy(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Escape closes on web.
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && live.current.requestClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const reject = () => {
    if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    if (reduceMotion) return;
    shake.setValue(0);
    Animated.sequence(
      SHAKE.map((x) => Animated.timing(shake, { toValue: x, duration: 48, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ).start();
  };

  const run = async (a: DialogAction, i: number) => {
    if (spinning !== null || a.disabled) return;
    const result = a.onPress?.(value);
    if (result instanceof Promise) {
      setBusy(i);
      let ok = true;
      try {
        ok = (await result) !== false;
      } catch {
        ok = false;
      }
      setBusy(null);
      if (!ok) return reject();
    } else if (result === false) return reject();
    setOpen(false);
  };

  const onText = (next: string) => {
    if (prompt?.value === undefined) setText(next);
    prompt?.onChangeText?.(next);
  };

  // Layout of the buttons. Stacked lists put Cancel last, like iOS.
  const stacked =
    actionsLayout === 'stack' ||
    (actionsLayout === 'auto' && (list.length > 2 || list.some((a) => a.label.length > (ios ? 13 : 15))));
  const order = list.map((a, i) => ({ a, i }));
  if (stacked) order.sort((x, y) => Number(x.a.role === 'cancel') - Number(y.a.role === 'cancel'));

  const centred = ios || showHalo;
  const edge = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const separator = alpha(colors.foreground, dark ? 0.12 : 0.1);
  const primary = accent ?? (ios ? colors.accent : colors.primary);
  const corner = ios ? radius.scale(16) : radius.xl;
  const haloSize = ios ? 44 : 52;

  const halo = showHalo ? (
    <View style={[styles.haloWrap, ios && styles.haloWrapIos]}>
      <Halo size={haloSize} corner={radius.capsule} disc={alpha(haloColor, dark ? 0.2 : 0.13)} ring={alpha(haloColor, 0.07)} ripple={ripple}>
        {icon ?? <LivingIcon kind={glyphKind ?? 'info'} color={haloColor} size={ios ? 22 : 26} draw={draw} glyph={glyph} />}
      </Halo>
    </View>
  ) : null;

  const field = prompt ? (
    <TextInput
      value={value}
      onChangeText={onText}
      placeholder={prompt.placeholder}
      placeholderTextColor={colors.mutedForeground}
      accessibilityLabel={prompt.label ?? prompt.placeholder ?? title}
      secureTextEntry={prompt.secureTextEntry}
      keyboardType={prompt.keyboardType}
      autoCapitalize={prompt.autoCapitalize}
      maxLength={prompt.maxLength}
      selectTextOnFocus={prompt.selectTextOnFocus ?? true}
      autoFocus
      maxFontSizeMultiplier={FONT_CAP}
      returnKeyType="done"
      onSubmitEditing={() => {
        const confirm = list[confirmIndex];
        if (confirm) run(confirm, confirmIndex);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      selectionColor={accent ?? colors.accent}
      style={[
        ios ? styles.inputIos : styles.input,
        ff,
        {
          color: colors.foreground,
          backgroundColor: alpha(colors.foreground, dark ? 0.07 : 0.04),
          borderRadius: ios ? radius.scale(9) : radius.scale(14),
          borderColor: error
            ? colors.danger
            : focused && !ios
              ? (accent ?? colors.accent)
              : alpha(colors.foreground, dark ? 0.14 : 0.12),
        },
      ]}
    />
  ) : null;

  const content = (
    <View style={ios ? styles.contentIos : styles.content}>
      {halo}
      {title ? (
        <Text
          accessibilityRole="header"
          style={[ios ? styles.titleIos : styles.title, ff, { color: colors.foreground }, centred && styles.textCenter]}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text style={[ios ? styles.descIos : styles.desc, ff, { color: colors.mutedForeground }, centred && styles.textCenter]}>
          {description}
        </Text>
      ) : null}
      {field ? <View style={ios ? styles.fieldIos : styles.field}>{field}</View> : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, ff, { color: colors.danger }, centred && styles.textCenter]}>
          {error}
        </Text>
      ) : null}
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );

  const buttons = ios ? (
    <View style={[styles.iosActions, !stacked && styles.row, { borderTopColor: separator }]}>
      {order.map(({ a, i }, k) => {
        const color = a.role === 'destructive' ? colors.danger : primary;
        return (
          <IosButton
            key={a.label}
            label={a.label}
            color={color}
            highlight={alpha(colors.foreground, dark ? 0.1 : 0.07)}
            loading={spinning === i}
            disabled={a.disabled || (spinning !== null && spinning !== i)}
            onPress={() => run(a, i)}
            style={[
              stacked ? null : styles.flex,
              k > 0 && (stacked ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator } : { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: separator }),
            ]}
          />
        );
      })}
    </View>
  ) : (
    <View style={[styles.actions, !stacked && styles.row]}>
      {order.map(({ a, i }) => {
        const colorsFor =
          a.role === 'destructive'
            ? { bg: colors.danger, fg: colors.dangerForeground }
            : a.role === 'primary'
              ? { bg: primary, fg: readableOn(primary) }
              : a.role === 'cancel'
                ? { bg: alpha(colors.foreground, dark ? 0.1 : 0.06), fg: colors.foreground }
                : { bg: alpha(accent ?? colors.accent, dark ? 0.2 : 0.12), fg: accent ?? colors.accent };
        return (
          <PillButton
            key={a.label}
            label={a.label}
            {...colorsFor}
            corner={radius.capsule(48)}
            loading={spinning === i}
            disabled={a.disabled || (spinning !== null && spinning !== i)}
            onPress={() => run(a, i)}
            style={stacked ? null : styles.flex}
          />
        );
      })}
    </View>
  );

  const glowR = Math.max(140, box.w * 0.62);
  const glowY = (ios ? 20 : 24) + haloSize / 2;
  const svg =
    box.w > 0 && (toneColor || dark) ? (
      <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient
            id={`glow${uid}`}
            cx={box.w / 2}
            cy={showHalo ? glowY : 0}
            fx={box.w / 2}
            fy={showHalo ? glowY : 0}
            r={glowR}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={toneColor ?? colors.foreground} stopOpacity={toneColor ? (dark ? 0.2 : 0.13) : 0.05} />
            <Stop offset="0.4" stopColor={toneColor ?? colors.foreground} stopOpacity={toneColor ? (dark ? 0.07 : 0.045) : 0.015} />
            <Stop offset="1" stopColor={toneColor ?? colors.foreground} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={box.w} height={box.h} fill={`url(#glow${uid})`} />
      </Svg>
    ) : null;

  const lifted = {
    opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [
      { translateX: shake },
      { scale: t.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [1, 1] : [0.92, 1] }) },
    ],
  };

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessible={false} importantForAccessibility="no" />
      </Animated.View>
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          {...(destructive || tone === 'danger' || tone === 'warning' ? { accessibilityRole: 'alert' as const } : null)}
          style={[
            styles.ambient,
            {
              maxWidth: ios ? 300 : 340,
              borderRadius: corner,
              backgroundColor: colors.popover,
              boxShadow: `0px 16px 64px rgba(0,0,0,${dark ? 0.55 : 0.18})`,
            },
            lifted,
            style,
          ]}
        >
          <View style={{ borderRadius: corner, backgroundColor: colors.popover, boxShadow: `0px 1px 6px rgba(0,0,0,${dark ? 0.3 : 0.06})` }}>
            <View
              onLayout={(e) => {
                const { width: w, height: h } = e.nativeEvent.layout;
                if (Math.round(w) !== box.w || Math.round(h) !== box.h) setBox({ w: Math.round(w), h: Math.round(h) });
              }}
              style={[styles.clip, { borderRadius: corner, borderColor: edge }]}
            >
              {svg}
              {content}
              {buttons}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PillButton({
  label,
  bg,
  fg,
  corner,
  loading,
  disabled,
  onPress,
  style,
}: {
  label: string;
  bg: string;
  fg: string;
  corner: number;
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [press] = useState(() => new Animated.Value(0));
  const to = (v: number) => Animated.spring(press, { toValue: v, useNativeDriver: true, ...motion.snappy }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: loading }}
      style={style}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            borderRadius: corner,
            backgroundColor: bg,
            opacity: disabled ? 0.45 : press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }),
            transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
          },
        ]}
      >
        <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.pillText, ff, { color: fg, opacity: loading ? 0 : 1 }]}>
          {label}
        </Text>
        {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={fg} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Full-width text button whose highlight appears on touch and fades out on release. */
function IosButton({
  label,
  color,
  highlight,
  loading,
  disabled,
  onPress,
  style,
}: {
  label: string;
  color: string;
  highlight: string;
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [hl] = useState(() => new Animated.Value(0));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        hl.stopAnimation();
        hl.setValue(1);
      }}
      onPressOut={() => Animated.timing(hl, { toValue: 0, duration: 260, useNativeDriver: true }).start()}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: loading }}
      style={[styles.iosButton, style]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: highlight, opacity: hl }]} />
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.iosText, ff, { color, opacity: loading ? 0 : disabled ? 0.4 : 1 }]}>
        {label}
      </Text>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={color} /> : null}
    </Pressable>
  );
}

/** Tinted disc with a faint outer ring; the ring ripples out once when `ripple` runs 0 → 1. */
function Halo({
  size,
  corner,
  disc,
  ring,
  ripple,
  children,
}: {
  size: number;
  corner: (h: number) => number;
  disc: string;
  ring: string;
  ripple: Animated.Value;
  children: React.ReactNode;
}) {
  const outer = size + 10;
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: outer, height: outer, borderRadius: corner(outer), backgroundColor: ring }} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: corner(size),
          borderWidth: 1.5,
          borderColor: disc,
          opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: corner(size),
          backgroundColor: disc,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const OUTLINE_LEN = 64;

function iconPaths(kind: DialogTone) {
  const outline =
    kind === 'warning'
      ? 'M10.3 4.2a2 2 0 0 1 3.4 0l7.1 12.6a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3z'
      : // Circle r=9 drawn from 12 o'clock so it sweeps in clockwise.
        'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18';
  const mark =
    kind === 'success'
      ? 'M8 12.4l2.7 2.7L16.2 9.4'
      : kind === 'danger'
        ? 'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6'
        : kind === 'warning'
          ? 'M12 9.5v4'
          : 'M12 11v5';
  const dot = kind === 'warning' ? { cx: 12, cy: 16.6 } : kind === 'info' ? { cx: 12, cy: 7.9 } : null;
  return { outline, mark, dot };
}

/** Outline draws itself (JS-driven dash offset), then the glyph springs in (native scale). */
function LivingIcon({
  kind,
  color,
  size,
  draw,
  glyph,
}: {
  kind: DialogTone;
  color: string;
  size: number;
  draw: Animated.Value;
  glyph: Animated.Value;
}) {
  const { outline, mark, dot } = iconPaths(kind);
  const s = { stroke: color, strokeWidth: 2.1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <AnimatedPath
          d={outline}
          {...s}
          strokeDasharray={[OUTLINE_LEN, OUTLINE_LEN]}
          strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [OUTLINE_LEN, 0] })}
        />
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: glyph.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
            transform: [
              { translateY: glyph.interpolate({ inputRange: [0, 1], outputRange: [-3, 0] }) },
              { scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={mark} {...s} />
          {dot ? <Circle cx={dot.cx} cy={dot.cy} r={1.25} fill={color} /> : null}
        </Svg>
      </Animated.View>
    </View>
  );
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Shadows are boxShadow (set inline): the same on iOS, Android and web.
  ambient: { width: '100%' },
  clip: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: 22, paddingTop: 24 },
  contentIos: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18 },
  haloWrap: { alignItems: 'center', marginBottom: 14, marginTop: -5 },
  haloWrapIos: { marginBottom: 10 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '400', letterSpacing: -0.3 },
  titleIos: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.3 },
  desc: { fontSize: 15, lineHeight: 21, fontWeight: '400', marginTop: 6 },
  descIos: { fontSize: 13.5, lineHeight: 18, fontWeight: '400', marginTop: 4 },
  textCenter: { textAlign: 'center' },
  field: { marginTop: 16 },
  fieldIos: { marginTop: 14 },
  input: { minHeight: 48, paddingHorizontal: 14, fontSize: 16, borderWidth: 1 },
  inputIos: { minHeight: 36, paddingHorizontal: 10, fontSize: 14, borderWidth: StyleSheet.hairlineWidth },
  error: { fontSize: 13, lineHeight: 18, fontWeight: '400', marginTop: 8 },
  children: { marginTop: 14 },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  actions: { gap: 10, padding: 22, paddingTop: 22 },
  pill: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  pillText: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.1, includeFontPadding: false, textAlignVertical: 'center' },
  iosActions: { borderTopWidth: StyleSheet.hairlineWidth },
  iosButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  iosText: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.3, includeFontPadding: false, textAlignVertical: 'center' },
});
