import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { motion, usePanResponder } from '@/lib/kit';

/** `holo` adds a rainbow foil sheen that shifts as the card tilts (always faintly visible). */
export type TiltCardGlare = 'soft' | 'sharp' | 'holo' | 'none';

/** A rectangle in card points. */
export interface TiltRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TiltCardProps {
  children?: React.ReactNode | undefined;
  /** Photo that fills the card behind the content (`require()` or `{ uri }`). */
  image?: ImageSourcePropType | undefined;
  /** Darkens the bottom of `image` so white text on it stays readable: 0 off … 1 strong (default 0.6). */
  shade?: number | undefined;
  /** Maximum tilt in degrees at the card's edge (default 12). */
  maxTilt?: number | undefined;
  /** Scale while touched (default 1.03). */
  pressScale?: number | undefined;
  /** Light reflection that slides across the card as it tilts. */
  glare?: TiltCardGlare | undefined;
  /**
   * Where the reflection may fall, in card points — for cards with cut-outs (ticket notches,
   * perforated edges), so light never shows over a hole. Default: the whole card.
   */
  glareClip?: TiltRect[] | undefined;
  /** Depth of the 3D effect — smaller is more dramatic (default 800). */
  perspective?: number | undefined;
  /** Slowly sway on its own while untouched, so the card reads as 3D at rest. */
  idle?: boolean | undefined;
  /** Corner radius (default 20). */
  radius?: number | undefined;
  /** Soft shadow under the card that shifts as it tilts (default true). */
  shadow?: boolean | undefined;
  /**
   * The part of the card that casts the shadow, in card points — e.g. leave out a ticket stub that's
   * being torn off, so the plate never shows where it was. Default: the whole card.
   */
  shadowRect?: TiltRect | undefined;
  /**
   * Narrows the shadow sideways (1 = full width, 0 = none) — for content that turns edge-on inside
   * the card, like a FlipCard mid-flip, so the shadow plate never shows past it.
   */
  shadowScaleX?: Animated.Value | Animated.AnimatedInterpolation<number> | undefined;
  /** Turn touch tilting off (the card still renders, e.g. while a parent list scrolls). */
  disabled?: boolean | undefined;
  /** Called with a light tap (not after a drag). */
  onPress?: (() => void) | undefined;
  accessibilityLabel?: string | undefined;
  /** Width, height, margins — applied to the card's outer box. */
  style?: StyleProp<ViewStyle> | undefined;
}

export interface TiltLayerProps {
  children?: React.ReactNode | undefined;
  /**
   * How far above the card this layer floats: 0 sits on the card, 1 floats well above it
   * and slides furthest as the card tilts (default 0.5). Negative sinks below the surface.
   */
  depth?: number | undefined;
  /** Layers fill the card by default; position content inside, or override here. */
  style?: StyleProp<ViewStyle> | undefined;
}

export interface TiltState {
  /** -1 … 1 across the card (left → right). */
  tx: Animated.Value;
  /** -1 … 1 down the card (top → bottom). */
  ty: Animated.Value;
  /** 0 at rest … 1 while touched. */
  press: Animated.Value;
  width: number;
  height: number;
}

// `reduce` (Reduce Motion) rides along privately so layers stay flat too; useTilt still returns a TiltState.
const Ctx = createContext<(TiltState & { reduce: boolean }) | null>(null);

/** The surrounding TiltCard's live tilt (null outside one) — for your own layers and effects. */
export function useTilt() {
  return useContext(Ctx);
}

// Gradients are drawn small and scaled up: a smooth gradient looks the same at any size, and a
// card-sized (or larger) SVG would cost megabytes of texture per card in a list.
const PAINT = 96;

// Six colour cycles across the paint, so a couple of bands cross the card like real foil. Cool
// pinks, violets and cyans stay clean when blended over dark cards (yellow and green turn olive).
const SMOOTH = Easing.bezier(0.32, 0.72, 0, 1);

const HOLO_CYCLE = ['#ff6bd6', '#b38cff', '#6fb6ff', '#5ff0ff', '#a7ffe0', '#ffc2ef'];
const HOLO = Array.from({ length: 37 }, (_, i) => HOLO_CYCLE[i % HOLO_CYCLE.length] ?? '#ff6bd6');

function GlarePaint({ variant }: { variant: 'soft' | 'sharp' }) {
  const sharp = variant === 'sharp';
  return (
    <Svg width={PAINT} height={PAINT}>
      <Defs>
        <RadialGradient id={`tilt-glare-${variant}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={sharp ? 0.85 : 0.6} />
          <Stop offset={sharp ? '0.25' : '0.5'} stopColor="#ffffff" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={PAINT} height={PAINT} fill={`url(#tilt-glare-${variant})`} />
    </Svg>
  );
}

function HoloPaint({ strength = 0.6 }: { strength?: number }) {
  return (
    <Svg width={PAINT} height={PAINT}>
      <Defs>
        <LinearGradient id={`tilt-holo-${Math.round(strength * 100)}`} x1="0" y1="0" x2="1" y2="1">
          {HOLO.map((c, i) => (
            <Stop key={i} offset={String(i / (HOLO.length - 1))} stopColor={c} stopOpacity={strength} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width={PAINT} height={PAINT} fill={`url(#tilt-holo-${Math.round(strength * 100)})`} />
    </Svg>
  );
}

/** The reflection (and holo sheen) for a card of size w × h, in card coordinates. */
function Reflection({
  variant,
  w,
  h,
  tx,
  ty,
  press,
  idle,
}: {
  variant: Exclude<TiltCardGlare, 'none'>;
  w: number;
  h: number;
  tx: Animated.Value;
  ty: Animated.Value;
  press: Animated.Value;
  idle: boolean;
}) {
  const G = Math.max(w, h) * 1.7;
  const H = Math.max(w, h) * 2.6;
  const box = {
    position: 'absolute' as const,
    width: PAINT,
    height: PAINT,
    left: (w - PAINT) / 2,
    top: (h - PAINT) / 2,
  };
  const glareOpacity = press.interpolate({
    inputRange: [0, 1],
    outputRange: [idle ? 0.22 : 0, variant === 'sharp' ? 0.55 : 0.32],
  });
  return (
    <>
      {variant === 'holo' ? (
        <Animated.View
          pointerEvents="none"
          style={{
            ...box,
            // Overlay blending tints the card like foil instead of washing it out.
            mixBlendMode: 'overlay',
            opacity: press.interpolate({
              inputRange: [0, 1],
              outputRange: [idle ? 0.26 : 0, 0.5],
            }),
            transform: [
              // Travels further than the light, so the colours sweep as the card leans.
              {
                translateX: tx.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [w * 0.9, -w * 0.9],
                }),
              },
              {
                translateY: ty.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [h * 0.6, -h * 0.6],
                }),
              },
              { scale: H / PAINT },
            ],
          }}
        >
          <HoloPaint strength={0.85} />
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={{
          ...box,
          opacity: glareOpacity,
          transform: [
            // The highlight sits under the finger.
            {
              translateX: tx.interpolate({
                inputRange: [-1, 1],
                outputRange: [-w * 0.5, w * 0.5],
              }),
            },
            {
              translateY: ty.interpolate({
                inputRange: [-1, 1],
                outputRange: [-h * 0.5, h * 0.5],
              }),
            },
            { scale: G / PAINT },
          ],
        }}
      >
        <GlarePaint variant={variant === 'sharp' ? 'sharp' : 'soft'} />
      </Animated.View>
    </>
  );
}

/**
 * A card that tilts toward your finger in 3D: it lifts, its shadow slides away from the light,
 * and a reflection glides across it. Put content in `TiltLayer`s to make it float above the
 * surface. Native-driven transforms, no extra libraries.
 */
export function TiltCard({
  children,
  image,
  shade = 0.6,
  maxTilt = 12,
  pressScale = 1.03,
  glare = 'soft',
  glareClip,
  perspective = 800,
  idle = false,
  radius = 20,
  shadow = true,
  shadowRect,
  shadowScaleX,
  disabled = false,
  onPress,
  accessibilityLabel,
  style,
}: TiltCardProps) {
  const reduce = useReduceMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });

  // -1 … 1 across the card; the card leans toward the finger.
  const [tx] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(0));
  const touching = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const viewRef = useRef<ComponentRef<typeof View>>(null);

  // Idle sway: a slow figure-eight while nobody is touching.
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);
  const startIdle = () => {
    if (!idle || reduce) return;
    const ease = Easing.inOut(Easing.sin);
    const leg = (v: Animated.Value, to: number, ms: number) =>
      Animated.timing(v, {
        toValue: to,
        duration: ms,
        easing: ease,
        useNativeDriver: true,
      });
    idleLoop.current = Animated.loop(
      Animated.parallel([
        Animated.sequence([leg(tx, 0.5, 2400), leg(tx, -0.5, 4800), leg(tx, 0, 2400)]),
        Animated.sequence([leg(ty, -0.35, 1200), leg(ty, 0.35, 2400), leg(ty, -0.35, 2400), leg(ty, 0.35, 2400), leg(ty, 0, 1200)]),
      ])
    );
    idleLoop.current.start();
  };
  useEffect(() => {
    // Reduce Motion: no sway; settle where it stopped back at rest.
    if (reduce && !touching.current) {
      tx.setValue(0);
      ty.setValue(0);
    }
    startIdle();
    return () => idleLoop.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle, reduce]);

  const aim = (pageX: number, pageY: number) => {
    const { w, h } = size;
    if (!w || !h) return;
    tx.setValue(Math.max(-1, Math.min(1, ((pageX - origin.current.x) / w) * 2 - 1)));
    ty.setValue(Math.max(-1, Math.min(1, ((pageY - origin.current.y) / h) * 2 - 1)));
  };

  const release = (tapped: boolean) => {
    touching.current = false;
    if (tapped && !moved.current) onPress?.();
    if (reduce) {
      // The card never leaves flat, so only the light has to settle: a short ease, no spring.
      const settle = (v: Animated.Value) => Animated.timing(v, { toValue: 0, duration: 150, easing: SMOOTH, useNativeDriver: true });
      Animated.parallel([settle(tx), settle(ty), settle(press)]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(tx, {
        toValue: 0,
        ...motion.gentle,
        useNativeDriver: true,
      }),
      Animated.spring(ty, {
        toValue: 0,
        ...motion.gentle,
        useNativeDriver: true,
      }),
      Animated.spring(press, {
        toValue: 0,
        ...motion.gentle,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !touching.current) startIdle();
    });
  };
  // usePanResponder always calls the latest callbacks, so they read props and state directly and
  // the responder is never rebuilt mid-gesture.
  const pan = usePanResponder({
    onStartShouldSetPanResponder: () => !disabled,
    // Only a real drag takes the touch from a button inside the card — a tap's tiny jitter must not.
    onMoveShouldSetPanResponder: (_e, g) => !disabled && Math.abs(g.dx) + Math.abs(g.dy) > 6,
    // Let a parent ScrollView take over scrolls that start on the card (on Android the native
    // scroll view can only do that when the card doesn't block it).
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
    onPanResponderGrant: (e) => {
      touching.current = true;
      moved.current = false;
      idleLoop.current?.stop();
      const { pageX, pageY, locationX, locationY } = e.nativeEvent;
      // locationX is relative to the touched child, so measure the card itself and correct
      // once the measurement arrives.
      origin.current = { x: pageX - locationX, y: pageY - locationY };
      viewRef.current?.measure((_x, _y, _w, _h, px, py) => {
        if (typeof px === 'number' && typeof py === 'number') origin.current = { x: px, y: py };
      });
      aim(pageX, pageY);
      if (reduce) {
        Animated.timing(press, { toValue: 1, duration: 150, easing: SMOOTH, useNativeDriver: true }).start();
      } else {
        Animated.spring(press, {
          toValue: 1,
          ...motion.snappy,
          useNativeDriver: true,
        }).start();
      }
    },
    onPanResponderMove: (e, g) => {
      if (Math.abs(g.dx) + Math.abs(g.dy) > 6) moved.current = true;
      aim(e.nativeEvent.pageX, e.nativeEvent.pageY);
    },
    onPanResponderRelease: () => release(true),
    onPanResponderTerminate: () => release(false),
    // React Native grants before asking the current responder to let go; when a child keeps its
    // gesture (e.g. a ticket stub being torn), the grant is rejected and no release follows.
    onPanResponderReject: () => release(false),
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // Reduce Motion keeps the card flat and still: no tilt, lift or parallax. The reflection (light,
  // not movement of the content) still follows the finger.
  const tilt = reduce ? 0 : maxTilt;
  const rotateY = tx.interpolate({
    inputRange: [-1, 1],
    outputRange: [`${-tilt}deg`, `${tilt}deg`],
  });
  const rotateX = ty.interpolate({
    inputRange: [-1, 1],
    outputRange: [`${tilt}deg`, `${-tilt}deg`],
  });
  const scale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, reduce ? 1 : pressScale],
  });

  const ctx = useMemo(() => ({ tx, ty, press, width: size.w, height: size.h, reduce }), [tx, ty, press, size.w, size.h, reduce]);
  const drift = reduce ? 0 : Math.min(10, size.w * 0.03);
  // The plate sits well inside the outline — far enough that it never shows through a notch or a
  // see-through corner, even at full tilt; the shadow offset does the downward shift.
  const body = shadowRect ?? { x: 0, y: 0, width: size.w, height: size.h };
  const inset = {
    x: Math.max(18, body.width * 0.08),
    y: Math.max(20, body.height * 0.08),
  };

  const reflection = glare !== 'none' && size.w ? <Reflection variant={glare} w={size.w} h={size.h} tx={tx} ty={ty} press={press} idle={idle} /> : null;

  return (
    <View style={style} onLayout={onLayout}>
      {/* Shadow plate: hidden under the card, its soft shadow drifts away from the light as the
          card leans, and spreads when the card lifts. */}
      {shadow && size.w ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.plate,
            {
              ...(shadowRect
                ? { left: body.x + inset.x, top: body.y + inset.y, width: Math.max(0, body.width - 2 * inset.x), height: Math.max(0, body.height - 2 * inset.y) }
                : { left: inset.x, right: inset.x, top: inset.y, bottom: inset.y }),
              borderRadius: radius,
              opacity: press.interpolate({
                inputRange: [0, 1],
                outputRange: [0.75, 1],
              }),
              transform: [
                {
                  translateX: tx.interpolate({
                    inputRange: [-1, 1],
                    outputRange: [drift, -drift],
                  }),
                },
                {
                  scale: press.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, reduce ? 1 : 1.035],
                  }),
                },
                { scaleX: shadowScaleX ?? 1 },
              ],
            },
          ]}
        />
      ) : null}
      {/* The card sits in its own (non-collapsing) layer: iOS intersects sibling layers in 3D, so a
          tilted card next to the flat shadow plate would be sliced by it along a diagonal. */}
      {/* The plate's shadow is a boxShadow (no elevation), so on Android too the card simply paints above it. */}
      <View collapsable={false}>
        <Animated.View
          ref={viewRef}
          {...pan}
          accessible={!!onPress || !!accessibilityLabel}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={accessibilityLabel}
          // Screen readers activate the card through an action, not synthesized touches.
          accessibilityActions={onPress ? [{ name: 'activate' }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') onPress?.();
          }}
          style={{
            borderRadius: radius,
            transform: [{ perspective }, { rotateX }, { rotateY }, { scale }],
          }}
        >
          <View style={[styles.clip, { borderRadius: radius }]}>
            {image ? (
              <>
                <Image alt="" source={image} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                {shade > 0 ? (
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
                    <Defs>
                      <LinearGradient id={`tilt-shade-${Math.round(shade * 100)}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0.35" stopColor="#000" stopOpacity={0} />
                        <Stop offset="1" stopColor="#000" stopOpacity={shade} />
                      </LinearGradient>
                    </Defs>
                    <Rect width="1" height="1" fill={`url(#tilt-shade-${Math.round(shade * 100)})`} />
                  </Svg>
                ) : null}
              </>
            ) : null}
            <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
            {reflection && !glareClip ? reflection : null}
            {reflection && glareClip
              ? glareClip.map((r, i) => (
                  // One window per rect; each holds the full-card reflection shifted back into place.
                  <View key={i} pointerEvents="none" style={[styles.window, { left: r.x, top: r.y, width: r.width, height: r.height }]}>
                    <View
                      style={{
                        position: 'absolute',
                        left: -r.x,
                        top: -r.y,
                        width: size.w,
                        height: size.h,
                      }}
                    >
                      {reflection}
                    </View>
                  </View>
                ))
              : null}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Content that floats above (or sinks below) a `TiltCard`'s surface: as the card tilts, a layer
 * slides further the higher it floats, and lifts a little when the card is pressed.
 */
export function TiltLayer({ children, depth = 0.5, style }: TiltLayerProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('TiltLayer must be inside TiltCard');
  const d = ctx.reduce ? 0 : depth * 14;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            {
              translateX: ctx.tx.interpolate({
                inputRange: [-1, 1],
                outputRange: [-d, d],
              }),
            },
            {
              translateY: ctx.ty.interpolate({
                inputRange: [-1, 1],
                outputRange: [-d, d],
              }),
            },
            {
              scale: ctx.press.interpolate({
                inputRange: [0, 1],
                outputRange: [1, ctx.reduce ? 1 : 1 + Math.max(0, depth) * 0.035],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export interface TiltFoilProps {
  children?: React.ReactNode | undefined;
  /** Corner radius (default 8). */
  radius?: number | undefined;
  /** Base metal under the rainbow (default silver). */
  base?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A holographic foil patch — a seal, a sticker, a security strip — whose rainbow shifts as the
 * surrounding TiltCard leans. Outside a TiltCard it shows a still foil.
 */
export function TiltFoil({ children, radius = 8, base = '#d7dbe2', style }: TiltFoilProps) {
  const ctx = useContext(Ctx);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const S = Math.max(size.w, size.h) * 3.2;
  const travel = Math.max(size.w, size.h) * 0.9;
  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
      style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: base }, style]}
    >
      {size.w ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: PAINT,
            height: PAINT,
            left: (size.w - PAINT) / 2,
            top: (size.h - PAINT) / 2,
            transform: [
              {
                translateX: ctx
                  ? ctx.tx.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [travel, -travel],
                    })
                  : 0,
              },
              {
                translateY: ctx
                  ? ctx.ty.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [travel * 0.6, -travel * 0.6],
                    })
                  : 0,
              },
              { scale: S / PAINT },
            ],
          }}
        >
          <HoloPaint strength={0.85} />
        </Animated.View>
      ) : null}
      {children}
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
  plate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    // boxShadow draws the same soft shadow on iOS, Android and web.
    boxShadow: '0px 16px 48px rgba(0,0,0,0.45)',
  },
  clip: { overflow: 'hidden' },
  window: { position: 'absolute', overflow: 'hidden' },
});
