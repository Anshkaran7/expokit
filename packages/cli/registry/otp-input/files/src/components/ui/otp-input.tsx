import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
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
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 16;

export type OtpInputVariant = 'box' | 'underline' | 'pill';

export interface OtpInputProps {
  /** Number of cells (default 6). */
  length?: number | undefined;

  value?: string | undefined;

  onChangeText?: ((code: string) => void) | undefined;

  /** Fires once every cell is filled (also after pasting a full code). */
  onComplete?: ((code: string) => void) | undefined;

  /** Shakes the row and turns it the danger colour. */
  error?: boolean | undefined;

  /** Message shown under the cells while `error` is set. */
  errorText?: string | undefined;

  /** Cells turn the success colour with a staggered pulse. */
  success?: boolean | undefined;

  /** Message shown under the cells while `success` is set. */
  successText?: string | undefined;

  /** Hint shown under the cells otherwise. */
  helperText?: string | undefined;

  /** Show dots instead of digits. */
  secure?: boolean | undefined;

  autoFocus?: boolean | undefined;

  disabled?: boolean | undefined;

  /** Active cell colour (default: theme accent). */
  accent?: string | undefined;

  /** 'box' cells, 'underline' bars, or round 'pill' cells. */
  variant?: OtpInputVariant | undefined;

  /** Draws a dash after this many cells, e.g. 3 → `123 – 456`. */
  separatorAfter?: number | undefined;

  /** Largest cell width in points; cells shrink below it to fit the row (default 52). */
  maxCellSize?: number | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

type CellState = 'idle' | 'error' | 'success';

const GAP = 8;
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way. A capped digit (1.35 × 0.46w, line 1.2×) still fits the shortest cell (pill, 1w).
const FONT_CAP = 1.35;
/** react-native-web draws the browser focus outline; our border + halo is the focus indicator. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : null;
const SEP = 22;

/**
 * One-time-code field. Cells size themselves to the available width, the active cell glows
 * with a focus halo and a blinking caret, digits pop in, a pasted code fills every cell,
 * errors shake the row and success pulses across the cells.
 */
export function OtpInput({
  length = 6,
  value,
  onChangeText,
  onComplete,
  error,
  errorText,
  success,
  successText,
  helperText,
  secure,
  autoFocus,
  disabled,
  accent,
  variant = 'box',
  separatorAfter,
  maxCellSize = 52,
  style,
}: OtpInputProps) {
  const { colors, labels } = useKit();
  const reduce = useReduceMotion();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [inner, setInner] = useState('');
  const [focused, setFocused] = useState(false);
  const [width, setWidth] = useState(0);
  const code = (value ?? inner).slice(0, length);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Reduce Motion: no shake; the cells still turn the danger colour.
    if (!error || reduce) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -9, 7, -5, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 45, useNativeDriver: true }))
    ).start();
  }, [error, shake, reduce]);

  const change = (raw: string) => {
    // No maxLength on the input, so pasting "123-456" or a longer SMS snippet still fills every cell.
    const next = raw.replace(/\D/g, '').slice(0, length);
    if (next === code) return;
    if (value === undefined) setInner(next);
    onChangeText?.(next);
    if (next.length === length && code.length !== length) onComplete?.(next);
  };

  const sep = separatorAfter && separatorAfter > 0 && separatorAfter < length ? separatorAfter : 0;
  // 4pt each side leaves room for the focus halo.
  const free = width - 8 - GAP * (length - 1) - (sep ? SEP : 0);
  const cell = width ? Math.max(24, Math.min(maxCellSize, Math.floor(free / length))) : maxCellSize;
  const cellH = variant === 'pill' ? cell : variant === 'underline' ? Math.round(cell * 1.04) : Math.round(cell * 1.16);

  const state: CellState = error ? 'error' : success ? 'success' : 'idle';
  const tone = error ? colors.danger : success ? colors.success : accent ?? colors.accent;
  const activeIndex = Math.min(code.length, length - 1);
  const a11yLabel = `One-time code, ${length} digits`;
  const message = error ? errorText : success ? successText : helperText;

  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={[styles.root, disabled && styles.disabled, style]}
    >
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityHint={labels.activateCodeField}
          accessibilityState={{ disabled: !!disabled }}
          disabled={disabled}
          onPress={() => input.current?.focus()}
          style={styles.row}
        >
          {Array.from({ length }, (_, i) => (
            <React.Fragment key={i}>
              {sep && i === sep ? (
                <View style={[styles.sep, { width: SEP - GAP, height: cellH }]}>
                  <View style={[styles.dash, { backgroundColor: colors.mutedForeground }]} />
                </View>
              ) : null}
              <Cell
                index={i}
                char={code[i]}
                secure={secure}
                active={focused && i === activeIndex}
                tone={tone}
                state={state}
                variant={variant}
                w={cell}
                h={cellH}
                reduce={reduce}
              />
            </React.Fragment>
          ))}
        </Pressable>
      </Animated.View>
      <TextInput
        ref={input}
        value={code}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel={a11yLabel}
        accessibilityHint={
          error ? `Invalid code. Enter your ${length}-digit verification code` : `Enter your ${length}-digit verification code`
        }
        importantForAccessibility="yes"
        style={[styles.hidden, webNoOutline]}
      />
      {message ? <Message text={message} kind={state} reduce={reduce} /> : null}
    </View>
  );
}

function Cell({
  index,
  char,
  secure,
  active,
  tone,
  state,
  variant,
  w,
  h,
  reduce,
}: {
  index: number;
  char?: string | undefined;

  secure?: boolean | undefined;

  active: boolean;
  tone: string;
  state: CellState;
  variant: OtpInputVariant;
  w: number;
  h: number;
  reduce: boolean;
}) {
  const { colors, radius, font: kitFont } = useKit();
  const ff = kitFont.family ? { fontFamily: kitFont.family } : null;
  const filled = !!char;
  // Native driver: digit pop, caret blink, halo, success pulse.
  const [pop] = useState(() => new Animated.Value(filled ? 1 : 0));
  const [caret] = useState(() => new Animated.Value(0));
  const [halo] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  // JS driver: border / fill colours.
  const [ring] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (char && reduce) {
      // Reduce Motion: the digit appears without the pop.
      pop.setValue(1);
    } else if (char) {
      pop.setValue(0.3);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    } else {
      Animated.timing(pop, { toValue: 0, duration: 110, useNativeDriver: true }).start();
    }
  }, [char, pop, reduce]);

  useEffect(() => {
    const to = active ? 1 : 0;
    // Reduce Motion: the halo only fades (its scale is pinned below). The caret keeps blinking.
    if (reduce) Animated.timing(halo, { toValue: to, duration: 150, useNativeDriver: true }).start();
    else Animated.spring(halo, { toValue: to, useNativeDriver: true, ...motion.snappy }).start();
    Animated.timing(ring, { toValue: to, duration: motion.fast, useNativeDriver: false }).start();
    if (!active) return;
    caret.setValue(1);
    const blink = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(caret, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.delay(300),
        Animated.timing(caret, { toValue: 1, duration: 140, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [active, halo, ring, caret, reduce]);

  useEffect(() => {
    if (state !== 'success' || reduce) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.delay(index * 55),
      Animated.timing(pulse, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, useNativeDriver: true, ...motion.bouncy }),
    ]).start();
  }, [state, index, pulse, reduce]);

  const underline = variant === 'underline';
  const pill = variant === 'pill';
  // Box cells follow KitProvider radius; pill stays round; underline has no corners.
  const r = pill ? h / 2 : underline ? 0 : radius.md;
  const rest = pill ? 'transparent' : filled ? alpha(colors.foreground, 0.32) : colors.input;
  const borderColor =
    state !== 'idle' ? tone : ring.interpolate({ inputRange: [0, 1], outputRange: [rest, tone] });
  const fill =
    state === 'success'
      ? alpha(colors.success, 0.12)
      : state === 'error'
        ? alpha(colors.danger, 0.08)
        : underline
          ? 'transparent'
          : pill
            ? colors.muted
            : colors.card;
  const fg = state === 'idle' ? colors.foreground : tone;
  const font = Math.round(w * 0.46);
  const dot = Math.max(8, Math.round(w * 0.22));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: w,
        height: h,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            borderRadius: underline ? 10 : r + 4,
            backgroundColor: alpha(tone, 0.18),
            opacity: halo,
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 1 : 0.86, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.cell,
          underline
            ? { borderBottomWidth: 2.5, borderColor, backgroundColor: fill }
            : { borderWidth: 1.5, borderRadius: r, borderColor, backgroundColor: fill },
        ]}
      >
        {filled ? (
          <Animated.View style={{ opacity: pop, transform: [{ scale: pop }] }}>
            {secure ? (
              <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: fg }} />
            ) : (
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.char, ff, { color: fg, fontSize: font, lineHeight: Math.round(font * 1.2) }]}>{char}</Text>
            )}
          </Animated.View>
        ) : active ? (
          <Animated.View style={[styles.caret, { height: Math.round(h * 0.42), backgroundColor: tone, opacity: caret }]} />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/** Helper / error / success line that fades and slides in whenever its text changes (only fades with Reduce Motion). */
function Message({ text, kind, reduce }: { text: string; kind: CellState; reduce: boolean }) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const [enter] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(0));

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: reduce ? 150 : motion.normal, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Reduce Motion: the tick is drawn at once.
    draw.setValue(reduce ? 1 : 0);
    if (kind === 'success' && !reduce) {
      Animated.timing(draw, { toValue: 1, duration: 360, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
  }, [text, kind, enter, draw, reduce]);

  const color = kind === 'error' ? colors.danger : kind === 'success' ? colors.success : colors.mutedForeground;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 4, 0] }) }] },
      ]}
    >
      {kind === 'error' ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
          <Path d="M12 7.6v5.2M12 16.3v.1" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      ) : kind === 'success' ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
          <AnimatedPath
            d="M8 12.3l2.7 2.7L16 9.6"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECK_LEN}
            strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] }) as unknown as number}
          />
        </Svg>
      ) : null}
      <Text style={[styles.messageText, ff, { color }]}>{text}</Text>
    </Animated.View>
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
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: 4, paddingVertical: 4, justifyContent: 'center', alignItems: 'center' },
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  char: { fontWeight: '400', fontVariant: ['tabular-nums'], textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' },
  caret: { width: 2, borderRadius: 1 },
  sep: { alignItems: 'center', justifyContent: 'center' },
  dash: { width: 10, height: 2, borderRadius: 1, opacity: 0.6 },
  message: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  messageText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '400' },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
