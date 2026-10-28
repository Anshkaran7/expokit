import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { motion } from '@/lib/kit';

export type FlipDirection = 'horizontal' | 'vertical';
export type FlipTrigger = 'press' | 'none';

export interface FlipCardProps {
  /** Shown first. Sets the card's size — the back fills the same box. */
  front: React.ReactNode;
  back: React.ReactNode;
  /** Controlled side: `true` shows the back. */
  flipped?: boolean;
  /** Uncontrolled initial side (default false). */
  defaultFlipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Spin around the vertical axis (left/right) or the horizontal one (top/bottom). */
  direction?: FlipDirection;
  /** `press` flips on tap; `none` leaves it to `flipped` (e.g. a button elsewhere). */
  trigger?: FlipTrigger;
  /** Depth of the 3D effect — smaller is more dramatic (default 1000). */
  perspective?: number;
  /** Corner radius of both faces (default 20). */
  radius?: number;
  /** Soft shadow that narrows as the card turns edge-on (default true). */
  shadow?: boolean;
  /**
   * Drive the turn from outside (0 = front, 1 = back) — from `useFlipProgress`, when something else
   * must follow the flip, like a TiltCard's shadow. `flipped` still sets the side for accessibility.
   */
  progress?: Animated.Value;
  /** Accessibility label; the hint says which side is showing. */
  accessibilityLabel?: string;
  /** Screen-reader hints (defaults in English). */
  labels?: { toBack?: string; toFront?: string };
  style?: StyleProp<ViewStyle>;
}

// How wide the shadow under a flipping card is through the turn: roughly cos θ, always a little
// narrower than the card so a flat shadow plate never shows past it, and none at all edge-on.
const SQUEEZE = {
  inputRange: [0, 0.25, 0.45, 0.5, 0.55, 0.75, 1],
  outputRange: [1, 0.6, 0.12, 0, 0.12, 0.6, 1],
};

/**
 * The flip as an animated 0 → 1 value, springing like FlipCard's own, plus `shadowScaleX` — pass
 * `progress` to the FlipCard and `shadowScaleX` to a TiltCard wrapped round it, so the tilt
 * shadow narrows as the card turns edge-on instead of showing as a dark box behind it.
 * With Reduce Motion on, the card turns over at once (no 3D turn).
 */
export function useFlipProgress(flipped: boolean) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) progress.setValue(flipped ? 1 : 0);
    else Animated.spring(progress, { toValue: flipped ? 1 : 0, ...motion.gentle, useNativeDriver: true }).start();
  }, [flipped, progress, reduce]);
  const shadowScaleX = useMemo(() => progress.interpolate(SQUEEZE), [progress]);
  return { progress, shadowScaleX };
}

/**
 * A card with two faces that flips in 3D on tap — it lifts toward you half-way through and its
 * shadow narrows as it turns edge-on, like a real card turning over. Controlled or uncontrolled.
 */
export function FlipCard({
  front,
  back,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlip,
  direction = 'horizontal',
  trigger = 'press',
  perspective = 1000,
  radius = 20,
  shadow = true,
  progress,
  accessibilityLabel,
  labels,
  style,
}: FlipCardProps) {
  const controlled = flippedProp !== undefined;
  const [own, setOwn] = useState(defaultFlipped);
  const flipped = controlled ? flippedProp : own;

  const turn = useFlipProgress(flipped).progress;
  const p = progress ?? turn;

  const toggle = () => {
    const next = !flipped;
    if (!controlled) setOwn(next);
    onFlip?.(next);
  };

  const horizontal = direction === 'horizontal';
  const axis = horizontal ? 'rotateY' : 'rotateX';
  const frontTurn = p.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backTurn = p.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  // Lift toward the viewer half-way through the turn.
  const lift = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.05, 1],
  });
  // Swap faces exactly at 90° — backfaceVisibility alone flickers on some Android versions.
  const frontOpacity = p.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = p.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  const face = (turn: Animated.AnimatedInterpolation<string>, opacity: Animated.AnimatedInterpolation<number>) =>
    ({
      borderRadius: radius,
      opacity,
      transform: [{ perspective }, { [axis]: turn } as never, { scale: lift }],
    }) as Animated.WithAnimatedValue<ViewStyle>;

  // The shadow squeezes along the turning axis as the card goes edge-on (see SQUEEZE) and fades a little.
  const squeeze = p.interpolate(SQUEEZE);

  const body = (
    <View>
      {shadow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.plate,
            {
              borderRadius: radius,
              opacity: p.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.4, 1],
              }),
              transform: [{ scale: 0.9 }, horizontal ? { scaleX: squeeze } : { scaleY: squeeze }],
            },
          ]}
        />
      ) : null}
      {/* Faces live in their own (non-collapsing) layer: iOS intersects sibling layers in 3D, so a
          turning face next to the flat shadow plate would be sliced by it. */}
      <View collapsable={false}>
        {/* The hidden face stays mounted (for the turn) but is hidden from screen readers. */}
        <Animated.View
          style={[styles.face, face(frontTurn, frontOpacity)]}
          pointerEvents={flipped ? 'none' : 'auto'}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        >
          {front}
        </Animated.View>
        <Animated.View
          style={[styles.face, styles.back, face(backTurn, backOpacity)]}
          pointerEvents={flipped ? 'auto' : 'none'}
          accessibilityElementsHidden={!flipped}
          importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
        >
          {back}
        </Animated.View>
      </View>
    </View>
  );

  if (trigger === 'none') return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={flipped ? (labels?.toFront ?? 'Showing the back. Tap to flip to the front.') : (labels?.toBack ?? 'Tap to flip to the back.')}
      accessibilityState={{ expanded: flipped }}
      style={style}
    >
      {body}
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
  face: { overflow: 'hidden', backfaceVisibility: 'hidden' },
  back: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  plate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    // boxShadow, not shadow* / elevation: the same soft shadow on iOS, Android and web.
    boxShadow: '0px 14px 40px rgba(0,0,0,0.4)',
  },
});
