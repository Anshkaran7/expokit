import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, useKit } from '@/lib/kit';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const CHECK_LEN = 22;

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  /** Strike through the label when checked (to-do list style). */
  strike?: boolean;
  size?: number;
  accent?: string;
  disabled?: boolean;
  /** 'square' (default) or 'circle'. */
  shape?: 'square' | 'circle';
  style?: StyleProp<ViewStyle>;
}

/** Checkbox whose tick draws itself in, with a squishy press and a burst ring. */
export function Checkbox({
  checked,
  defaultChecked = false,
  onChange,
  label,
  description,
  strike,
  size = 24,
  accent,
  disabled,
  shape = 'square',
  style,
}: CheckboxProps) {
  const { colors, radius } = useKit();
  const tint = accent ?? colors.accent;
  const corner = shape === 'circle' ? size / 2 : Math.min(size / 2, radius.sm + 1);
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;

  const progress = useRef(new Animated.Value(on ? 1 : 0)).current; // fill + tick (JS: drives svg + colour)
  const press = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, { toValue: on ? 1 : 0, useNativeDriver: false, speed: 14, bounciness: 6 }).start();
    if (on) {
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }
  }, [on, progress, burst]);

  const toggle = () => {
    if (checked === undefined) setInner(!on);
    onChange?.(!on);
  };

  const border = colors.input;
  const fg = colors.foreground;
  const muted = colors.mutedForeground;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={toggle}
      onPressIn={() => Animated.spring(press, { toValue: 0.82, useNativeDriver: true, speed: 50 }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 14 }).start()}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              width: size,
              height: size,
              borderRadius: corner,
              borderColor: tint,
              opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.6, 0] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.box,
            {
              width: size,
              height: size,
              borderRadius: corner,
              borderColor: progress.interpolate({ inputRange: [0, 1], outputRange: [border, tint] }),
              backgroundColor: progress.interpolate({ inputRange: [0, 1], outputRange: [alpha(tint, 0), tint] }),
            },
          ]}
        >
          <Svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24">
            <AnimatedPath
              d={CHECK}
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={CHECK_LEN}
              strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0], extrapolate: 'clamp' }) as unknown as number}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
      {label ? (
        <View style={styles.text}>
          <View style={styles.labelBox}>
            <Animated.Text style={[styles.label, { color: progress.interpolate({ inputRange: [0, 1], outputRange: [fg, strike ? muted : fg] }) }]}>
              {label}
            </Animated.Text>
            {strike ? (
              <Animated.View
                style={[
                  styles.strike,
                  { backgroundColor: muted, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) },
                ]}
              />
            ) : null}
          </View>
          {description ? <Text style={[styles.description, { color: muted }]}>{description}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', borderWidth: 2 },
  text: { flex: 1, paddingTop: 1 },
  labelBox: { alignSelf: 'flex-start' },
  label: { fontSize: 15.5, fontWeight: '400' },
  strike: { position: 'absolute', left: 0, top: '52%', height: 1.5, borderRadius: 1 },
  description: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
