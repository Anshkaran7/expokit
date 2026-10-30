import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type ConfettiOrigin = 'top' | 'center' | 'bottom';

export interface ConfettiBurst {
  /** Where it comes from (default: the `origin` prop). */
  origin?: ConfettiOrigin | undefined;
  /** For `center`: the burst point in the overlay, in points (default: the middle). */
  x?: number | undefined;
  y?: number | undefined;
  /** Pieces in this burst (default: the `count` prop). */
  count?: number | undefined;
  colors?: readonly string[] | undefined;
}

export interface ConfettiHandle {
  /** Fire a burst; bursts can overlap. */
  burst: (options?: ConfettiBurst) => void;
}

export interface ConfettiProps {
  /** Pieces per burst (default 80, max 160). */
  count?: number | undefined;
  colors?: readonly string[] | undefined;
  /** `top` rains down, `center` pops outward, `bottom` fires two cannons from the corners (default "bottom"). */
  origin?: ConfettiOrigin | undefined;
  /** How long a burst lasts in ms (default 2600). */
  duration?: number | undefined;
  /** Fire a burst whenever this value changes (not on mount) — no ref needed. */
  trigger?: unknown | undefined;
  /** Fire once on mount. */
  autoplay?: boolean | undefined;
  /** Called when a burst has finished. */
  onDone?: (() => void) | undefined;
  /** The overlay fills its parent by default; it never takes touches. */
  style?: StyleProp<ViewStyle> | undefined;
}

const PALETTE = ['#ff3d77', '#ffb000', '#3ddcff', '#7cff6b', '#a855ff', '#ffffff', '#ff7a1a'];
const SAMPLES = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

interface Piece {
  key: number;
  color: string;
  w: number;
  h: number;
  round: boolean;
  xs: number[];
  ys: number[];
  spin: [string, string];
  flip: [string, string];
}

interface Burst {
  id: number;
  t: Animated.Value;
  pieces: Piece[];
}

let nextId = 1;

/**
 * Confetti for the moments that deserve it — a coupon applied, a reward revealed, an order placed.
 * Every piece flies on a real arc (launch, gravity, drag) and flutters as it falls; one native-driven
 * animation moves them all. Respects Reduce Motion.
 */
export const Confetti = forwardRef<ConfettiHandle, ConfettiProps>(function Confetti(
  { count = 80, colors = PALETTE, origin = 'bottom', duration = 2600, trigger, autoplay = false, onDone, style },
  ref
) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [bursts, setBursts] = useState<Burst[]>([]);
  const reduce = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const latest = useRef({ count, colors, origin, duration, onDone });
  latest.current = { count, colors, origin, duration, onDone };
  const pending = useRef<ConfettiBurst[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => (reduce.current = r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => (reduce.current = r));
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, []);

  const fire = (opts: ConfettiBurst = {}) => {
    const { w, h } = sizeRef.current;
    // Not measured yet (fired on mount): keep it until the first layout.
    if (!w || !h) {
      pending.current.push(opts);
      return;
    }
    const cfg = latest.current;
    const from = opts.origin ?? cfg.origin;
    const palette = opts.colors ?? cfg.colors;
    const n = Math.min(160, Math.max(1, Math.round((opts.count ?? cfg.count) * (reduce.current ? 0.25 : 1))));
    const D = cfg.duration / 1000;
    const g = h * 1.25; // gravity, points / s²
    const pieces: Piece[] = [];
    for (let i = 0; i < n; i++) {
      let x0: number, y0: number, vx: number, vy: number;
      if (from === 'top') {
        x0 = Math.random() * w;
        y0 = -20 - Math.random() * h * 0.25;
        vx = (Math.random() - 0.5) * w * 0.25;
        vy = Math.random() * h * 0.1;
      } else if (from === 'center') {
        x0 = opts.x ?? w / 2;
        y0 = opts.y ?? h / 2;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
        const v = (0.45 + Math.random() * 0.75) * Math.max(w, h) * 0.9;
        vx = Math.cos(a) * v;
        vy = Math.sin(a) * v;
      } else {
        const leftSide = i % 2 === 0;
        x0 = leftSide ? -6 : w + 6;
        y0 = h + 6;
        const a = -Math.PI / 2 + (leftSide ? 1 : -1) * (0.25 + Math.random() * 0.45);
        const v = (0.75 + Math.random() * 0.55) * h * 1.15;
        vx = Math.cos(a) * v;
        vy = Math.sin(a) * v;
      }
      // Air drag eases the launch; sideways sway makes paper fall like paper.
      const drag = 1.6 + Math.random();
      const sway = (Math.random() - 0.5) * 40;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const p of SAMPLES) {
        const t = p * D;
        const k = (1 - Math.exp(-drag * t)) / drag;
        xs.push(x0 + vx * k + sway * Math.sin(t * 6 + i));
        ys.push(y0 + vy * k + 0.5 * g * t * t * 0.55);
      }
      const round = Math.random() < 0.3;
      const strip = !round && Math.random() < 0.35;
      const s0 = Math.round(Math.random() * 360);
      const turns = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2.5);
      pieces.push({
        key: i,
        // An empty `colors` list falls back to white rather than an invisible piece.
        color: palette[Math.floor(Math.random() * palette.length)] ?? '#ffffff',
        w: round ? 7 : strip ? 4 : 7,
        h: round ? 7 : strip ? 16 : 11,
        round,
        xs,
        ys,
        spin: [`${s0}deg`, `${s0 + turns * 360}deg`],
        flip: ['0deg', `${(2 + Math.random() * 4) * 360}deg`],
      });
    }
    const burst: Burst = { id: nextId++, t: new Animated.Value(0), pieces };
    setBursts((b) => [...b, burst]);
    Animated.timing(burst.t, { toValue: 1, duration: cfg.duration, easing: Easing.linear, useNativeDriver: true }).start(() => {
      if (!mounted.current) return;
      setBursts((b) => b.filter((x) => x.id !== burst.id));
      latest.current.onDone?.();
    });
  };
  const fireRef = useRef(fire);
  fireRef.current = fire;

  useImperativeHandle(ref, () => ({ burst: (o) => fireRef.current(o) }), []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (autoplay) fireRef.current();
      return;
    }
    fireRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width === size.w && height === size.h) return;
        sizeRef.current = { w: width, h: height };
        setSize({ w: width, h: height });
        const queued = pending.current.splice(0);
        queued.forEach((o) => fireRef.current(o));
      }}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}
    >
      {bursts.map((b) =>
        b.pieces.map((p) => (
          <Animated.View
            key={`${b.id}-${p.key}`}
            style={{
              position: 'absolute',
              left: -p.w / 2,
              top: -p.h / 2,
              width: p.w,
              height: p.h,
              borderRadius: p.round ? p.w / 2 : 1.5,
              backgroundColor: p.color,
              opacity: b.t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: b.t.interpolate({ inputRange: SAMPLES, outputRange: p.xs }) },
                { translateY: b.t.interpolate({ inputRange: SAMPLES, outputRange: p.ys }) },
                { rotate: b.t.interpolate({ inputRange: [0, 1], outputRange: p.spin }) },
                { rotateX: b.t.interpolate({ inputRange: [0, 1], outputRange: p.flip }) },
              ],
            }}
          />
        ))
      )}
    </View>
  );
});
