import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit, usePanResponder } from '@/lib/kit';

export type SwitchVariant = 'ios' | 'material' | 'icon';
export type SwitchSize = 'sm' | 'md' | 'lg';

export interface SwitchProps {
  /** Controlled state. */
  value?: boolean;
  /** Initial state when uncontrolled. */
  defaultValue?: boolean;
  onValueChange?: (value: boolean) => void;
  variant?: SwitchVariant;
  size?: SwitchSize;
  /** Icons drawn inside the thumb for `variant="icon"`: sun / moon or check / ✕. */
  icon?: 'theme' | 'check';
  /** Turns the switch into a settings row: label (and description) on the left, switch on the right. */
  label?: string;
  description?: string;
  /** Track colour when on (default: theme accent). */
  accent?: string;
  disabled?: boolean;
  /** Light tap when it flips (default true). */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<SwitchSize, { w: number; h: number }> = {
  sm: { w: 40, h: 24 },
  md: { w: 51, h: 31 },
  lg: { w: 62, h: 38 },
};

const SUN_RAYS = 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4';
const MOON = 'M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z';
const CHECK = 'M5.5 12.5l4 4L18.5 7.5';
const CROSS = 'M7 7l10 10M17 7L7 17';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Toggle switch with a spring thumb that stretches toward its destination while pressed
 * (squash & stretch), can be dragged across, and throws a soft halo when it flips.
 * The track cross-fades. iOS, Material 3 and icon looks.
 */
export function Switch({
  value,
  defaultValue = false,
  onValueChange,
  variant = 'ios',
  size = 'md',
  icon = 'theme',
  label,
  description,
  accent,
  disabled,
  haptics = true,
  accessibilityLabel,
  style,
}: SwitchProps) {
  const { colors, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const gid = 'sw' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const [inner, setInner] = useState(defaultValue);
  const on = value ?? inner;

  const s = SIZES[size];
  const material = variant === 'material';
  const W = s.w;
  const H = s.h;
  const border = material ? 2 : 0;
  const innerW = W - border * 2;
  const innerH = H - border * 2;
  const pad = 2;
  const dOn = innerH - pad * 2; // thumb diameter when on (and always, except Material)
  const dOff = material ? Math.round(innerH * 0.5) : dOn;
  const stretchW = material ? 6 : Math.round(dOn * 0.32);
  const growH = material ? 4 : 0;

  // pos + stretch drive layout and colours (JS driver). glyph drives the icons, halo the glow (native driver).
  const [pos] = useState(() => new Animated.Value(on ? 1 : 0));
  const [stretch] = useState(() => new Animated.Value(0));
  const [glyph] = useState(() => new Animated.Value(on ? 1 : 0));
  const [halo] = useState(() => new Animated.Value(0));
  // Reduce Motion: the thumb jumps, so the colours follow this instead and still fade (JS driver).
  const [tone] = useState(() => new Animated.Value(on ? 1 : 0));

  useEffect(() => {
    const to = on ? 1 : 0;
    if (reduce) {
      pos.setValue(to);
      glyph.setValue(to);
      Animated.timing(tone, { toValue: to, duration: 150, useNativeDriver: false }).start();
      return;
    }
    tone.setValue(to);
    Animated.spring(pos, { toValue: to, useNativeDriver: false, ...motion.snappy }).start();
    Animated.spring(glyph, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();
  }, [on, reduce, pos, glyph, tone]);

  const toggle = () => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (value === undefined) setInner(!on);
    onValueChange?.(!on);
  };

  // Thumb geometry. Left edge is anchored while off (grows right), right edge while on (grows left).
  const c0 = pad + dOn / 2;
  const c1 = innerW - pad - dOn / 2;

  // Drag the thumb across: pos follows the finger, release settles on the nearer side.
  // A touch that never moves is a tap and just toggles. On web the wrapping Pressable also
  // gets a click after the gesture, so it ignores presses right after one (`endedAt`).
  const live = useRef({ on, toggle, travel: c1 - c0, reduce });
  useLayoutEffect(() => {
    live.current = { on, toggle, travel: c1 - c0, reduce };
  });

  // Halo: 0 hidden · 1 held (glow around the thumb) · 2 released (expands and fades out).
  // Reduce Motion: no squash & stretch, and the halo only fades (its scale is pinned below).
  const press = (to: number) => {
    const still = live.current.reduce;
    if (!still) Animated.spring(stretch, { toValue: to, useNativeDriver: false, ...(to ? motion.snappy : motion.bouncy) }).start();
    if (to) Animated.spring(halo, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
    else
      Animated.timing(halo, { toValue: 2, duration: still ? 150 : 420, useNativeDriver: true }).start(
        ({ finished }) => finished && halo.setValue(0)
      );
  };
  const settle = (to: number) => {
    if (live.current.reduce) pos.setValue(to);
    else Animated.spring(pos, { toValue: to, useNativeDriver: false, ...motion.snappy }).start();
  };
  const drag = useRef({ from: 0, moved: false, endedAt: 0 });
  const responder = usePanResponder({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => !drag.current.moved,
    onPanResponderGrant: () => {
      pos.stopAnimation();
      drag.current = { from: live.current.on ? 1 : 0, moved: false, endedAt: 0 };
      press(1);
    },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > 3) drag.current.moved = true;
      if (drag.current.moved) pos.setValue(clamp01(drag.current.from + g.dx / live.current.travel));
    },
    onPanResponderRelease: (_, g) => {
      const { on: now, toggle: flip } = live.current;
      drag.current.endedAt = Date.now();
      press(0);
      if (!drag.current.moved) return flip();
      const next = clamp01(drag.current.from + g.dx / live.current.travel) > 0.5;
      settle(next ? 1 : 0);
      if (next !== now) flip();
    },
    onPanResponderTerminate: () => {
      press(0);
      settle(live.current.on ? 1 : 0);
    },
  });
  const base = pos.interpolate({ inputRange: [0, 1], outputRange: [dOff, dOn], extrapolate: 'clamp' });
  const thumbW = Animated.add(base, Animated.multiply(stretch, stretchW));
  const thumbH = Animated.add(base, Animated.multiply(stretch, growH));
  const left = Animated.subtract(
    pos.interpolate({ inputRange: [0, 1], outputRange: [c0 - dOff / 2, c1 - dOn / 2], extrapolate: 'clamp' }),
    Animated.multiply(
      pos.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      Animated.multiply(stretch, stretchW)
    )
  );
  const top = Animated.subtract(
    pos.interpolate({ inputRange: [0, 1], outputRange: [(innerH - dOff) / 2, (innerH - dOn) / 2], extrapolate: 'clamp' }),
    Animated.multiply(stretch, growH / 2)
  );

  const paint = reduce ? tone : pos;
  const offTrack = material ? alpha(colors.mutedForeground, 0.12) : alpha(colors.foreground, dark ? 0.16 : 0.1);
  const trackBg = paint.interpolate({ inputRange: [0, 1], outputRange: [offTrack, tint], extrapolate: 'clamp' });
  const trackBorder = paint.interpolate({ inputRange: [0, 1], outputRange: [colors.mutedForeground, tint], extrapolate: 'clamp' });
  const onFg = readableOn(tint);
  const thumbBg = material
    ? paint.interpolate({ inputRange: [0, 1], outputRange: [colors.mutedForeground, onFg], extrapolate: 'clamp' })
    : '#ffffff';

  const iconSize = dOn * 0.62;
  const sunColor = colors.warning;
  const offIcon = icon === 'theme' ? sunColor : colors.mutedForeground;

  const haloSize = Math.round(dOn * 1.75);

  const control = (
    <Animated.View
      {...(disabled ? null : responder)}
      style={[
        styles.track,
        { width: W, height: H, borderRadius: H / 2, backgroundColor: trackBg },
        material && { borderWidth: border, borderColor: trackBorder },
      ]}
    >
      {material ? null : (
        // Depth: a soft sheen over the top half, a touch of shade at the bottom, and a hairline edge.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={W} height={H}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={dark ? 0.12 : 0.24} />
                <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.07} />
              </LinearGradient>
            </Defs>
            <Rect width={W} height={H} rx={H / 2} fill={`url(#${gid})`} />
            <Rect
              x={0.5}
              y={0.5}
              width={W - 1}
              height={H - 1}
              rx={(H - 1) / 2}
              fill="none"
              stroke={colors.foreground}
              strokeOpacity={dark ? 0.08 : 0.06}
            />
          </Svg>
        </View>
      )}
      <Animated.View pointerEvents="none" style={[styles.thumb, { width: thumbW, height: thumbH, left, top }]}>
        <Animated.View
          style={[
            styles.halo,
            {
              width: haloSize,
              height: haloSize,
              borderRadius: haloSize / 2,
              backgroundColor: alpha(on ? tint : colors.mutedForeground, 0.2),
              opacity: halo.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1, 2], outputRange: reduce ? [1, 1, 1] : [0.5, 1, 1.45] }) }],
            },
          ]}
        />
        <Animated.View style={[StyleSheet.absoluteFill, !material && styles.shadow, { borderRadius: H, backgroundColor: thumbBg }]} />
        {material ? (
          <Animated.View
            style={[
              styles.glyph,
              {
                opacity: glyph.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
                transform: [{ scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
              },
            ]}
          >
            <Svg width={dOn * 0.6} height={dOn * 0.6} viewBox="0 0 24 24" fill="none">
              <Path d={CHECK} stroke={tint} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        ) : null}
        {variant === 'icon' ? (
          <>
            <Animated.View
              style={[
                styles.glyph,
                {
                  opacity: glyph.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }),
                  transform: [
                    { rotate: glyph.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-120deg'] }) },
                    { scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
                  ],
                },
              ]}
            >
              <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                {icon === 'theme' ? (
                  <>
                    <Circle cx={12} cy={12} r={4.2} fill={offIcon} />
                    <Path d={SUN_RAYS} stroke={offIcon} strokeWidth={2.2} strokeLinecap="round" />
                  </>
                ) : (
                  <Path d={CROSS} stroke={offIcon} strokeWidth={2.8} strokeLinecap="round" />
                )}
              </Svg>
            </Animated.View>
            <Animated.View
              style={[
                styles.glyph,
                {
                  opacity: glyph.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
                  transform: [
                    { rotate: glyph.interpolate({ inputRange: [0, 1], outputRange: ['120deg', '0deg'] }) },
                    { scale: glyph.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                },
              ]}
            >
              <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
                {icon === 'theme' ? (
                  <Path d={MOON} fill={tint} />
                ) : (
                  <Path d={CHECK} stroke={tint} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
                )}
              </Svg>
            </Animated.View>
          </>
        ) : null}
      </Animated.View>
    </Animated.View>
  );

  const a11y = {
    accessibilityRole: 'switch' as const,
    accessibilityState: { checked: on, disabled: !!disabled },
    accessibilityLabel: accessibilityLabel ?? label,
    disabled,
    onPress: () => {
      if (Date.now() - drag.current.endedAt > 400) toggle();
    },
    onPressIn: () => press(1),
    onPressOut: () => press(0),
  };

  if (!label) {
    return (
      <Pressable {...a11y} hitSlop={Math.max(0, (44 - H) / 2)} style={[{ alignSelf: 'flex-start', opacity: disabled ? 0.45 : 1 }, style]}>
        {control}
      </Pressable>
    );
  }

  return (
    <Pressable {...a11y} style={[styles.row, { opacity: disabled ? 0.45 : 1 }, style]}>
      <View style={styles.text}>
        <Text style={[styles.label, ff, { color: colors.foreground }]}>{label}</Text>
        {description ? <Text style={[styles.description, ff, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      {control}
    </Pressable>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 44 },
  text: { flex: 1 },
  label: { fontSize: 15.5, fontWeight: '400' },
  description: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  track: { justifyContent: 'center' },
  thumb: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  shadow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    // boxShadow: the same soft thumb shadow on iOS and Android.
    boxShadow: '0px 2px 8px rgba(0,0,0,0.22)',
  },
  glyph: { position: 'absolute' },
});
