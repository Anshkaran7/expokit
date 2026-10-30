import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type SkeletonVariant = 'shimmer' | 'wave' | 'pulse' | 'static';

export interface SkeletonProps {
  width?: DimensionValue | undefined;

  height?: DimensionValue | undefined;

  /**
   * Corner radius: a theme step, 'capsule' for bars that follow the kit radius (a pill at the
   * default radius), 'full' for true pills / circles, or points.
   */
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'capsule' | 'full' | number | undefined;

  /**
   * 'shimmer' sweeps one angled light band across every block on screen, 'wave' brightens blocks
   * one after another from top to bottom, 'pulse' breathes, 'static' does nothing.
   */
  variant?: SkeletonVariant | undefined;

  /** Base colour of the block (default: a faint tint of the foreground). */
  color?: string | undefined;

  /** Centred overlay, e.g. a faint glyph (see `Skeleton.Media`). */
  children?: React.ReactNode | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/* ------------------------------------------------------------------------------------------------
 * One shared clock for every skeleton on screen. It runs 0 → 1 linearly on the native driver;
 * each variant maps it through its own (sampled) curve, so all blocks stay in lock-step.
 * --------------------------------------------------------------------------------------------- */

const CYCLE = 2100;
/** Share of the cycle the shimmer band spends travelling; the rest is a calm pause. */
const SWEEP = 0.7;
const ANGLE = (20 * Math.PI) / 180;
const TAN = Math.tan(ANGLE);
const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);

const clock = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function useClock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    users += 1;
    if (users === 1) {
      clock.setValue(0);
      loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    }
    return () => {
      users -= 1;
      if (users === 0) {
        loop?.stop();
        loop = null;
      }
    };
  }, [active]);
  return clock;
}

// Reduce motion, read once and shared by every block (one OS listener, not one per bar).
let reduceMotion = false;
const reduceSubs = new Set<(v: boolean) => void>();
let reduceSub: { remove: () => void } | null = null;

function useReduceMotion() {
  const [reduce, setReduce] = useState(reduceMotion);
  useEffect(() => {
    reduceSubs.add(setReduce);
    if (!reduceSub) {
      const publish = (v: boolean) => {
        reduceMotion = v;
        reduceSubs.forEach((fn) => fn(v));
      };
      AccessibilityInfo.isReduceMotionEnabled().then(publish).catch(() => {});
      reduceSub = AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
    }
    return () => {
      reduceSubs.delete(setReduce);
      if (reduceSubs.size === 0) {
        reduceSub?.remove();
        reduceSub = null;
      }
    };
  }, []);
  return reduce;
}

/** Samples `f` on [from, to] so a curve can run on the native driver (which has no `easing`). */
function sample(f: (x: number) => number, from: number, to: number, n: number) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    inputRange.push(x);
    outputRange.push(f(x));
  }
  return { inputRange, outputRange };
}

const easeSweep = Easing.inOut(Easing.sin);
const easeRise = Easing.out(Easing.cubic);

/* ------------------------------------------------------------------------------------------------
 * Group: the frame one wave travels across. Without a group it is the window, which on a phone is
 * the screen. Nested groups defer to the outermost one so a whole screen stays one wave.
 * --------------------------------------------------------------------------------------------- */

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GroupContext = createContext<{ frame: Frame | null } | null>(null);

function measure(node: ComponentRef<typeof View> | null, e: LayoutChangeEvent, done: (f: Frame) => void) {
  const { x, y, width, height } = e.nativeEvent.layout;
  const fallback = () => done({ x, y, w: width, h: height });
  if (!node || typeof node.measureInWindow !== 'function') return fallback();
  node.measureInWindow((wx, wy) => {
    if (Number.isFinite(wx) && Number.isFinite(wy)) done({ x: wx, y: wy, w: width, h: height });
    else fallback();
  });
}

export interface SkeletonGroupProps {
  children?: React.ReactNode | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/**
 * Optional frame for the shimmer / wave: every block inside lines up as one wave across this
 * view instead of across the whole window. Useful for a card or a preview that is narrower than
 * the window (tablets, web). `Skeleton.Nav` and `Skeleton.Reveal` set one up for you.
 */
export function SkeletonGroup({ children, style }: SkeletonGroupProps) {
  const parent = useContext(GroupContext);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const value = useMemo(() => ({ frame }), [frame]);
  if (parent) return <View style={style}>{children}</View>;
  return (
    <View ref={ref} style={style} onLayout={(e) => measure(ref.current, e, setFrame)}>
      <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Block
 * --------------------------------------------------------------------------------------------- */

/**
 * Placeholder block for loading content. An angled, soft-edged light band sweeps across every
 * block on screen as one wave (or blocks brighten one after another, or gently pulse), all from
 * one shared native-driver clock. Static when the OS "reduce motion" setting is on.
 * Compose with `Skeleton.Text`, `.Avatar`, `.Media`, `.List`, `.Card`, `.Nav` and `.Reveal`.
 */
export function Skeleton({ width = '100%', height = 14, radius = 'sm', variant = 'shimmer', color, children, style }: SkeletonProps) {
  const { colors, radius: r, dark } = useKit();
  const reduce = useReduceMotion();
  const mode: SkeletonVariant = reduce ? 'static' : variant;
  const moving = mode !== 'static';
  const t = useClock(moving);
  const group = useContext(GroupContext);
  const win = useWindowDimensions();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [box, setBox] = useState<Frame | null>(null);
  const gid = 'sk' + useId().replace(/[^a-zA-Z0-9]/g, '');

  const base = color ?? alpha(colors.foreground, dark ? 0.11 : 0.09);
  // Light mode: a whisper of white over a pale block. Dark mode: a touch more lift so it reads.
  const shine = dark ? colors.foreground : '#ffffff';
  const peak = dark ? (mode === 'wave' ? 0.07 : 0.11) : mode === 'wave' ? 0.5 : 0.62;
  const borderRadius =
    typeof radius === 'number'
      ? radius
      : radius === 'capsule'
        ? r.capsule(typeof height === 'number' ? height : 14)
        : r[radius];

  // Where this block sits inside the wave's frame.
  const fx = group?.frame?.x ?? 0;
  const fy = group?.frame?.y ?? 0;
  const W = group?.frame?.w || win.width;
  const H = Math.min(group?.frame?.h || win.height, 900);
  const dx = box ? box.x - fx : 0;
  const dy = box ? Math.max(0, Math.min(H, box.y - fy + box.h / 2)) : 0;
  const bh = box?.h ?? 0;
  const B = Math.max(160, Math.min(320, W * 0.55));
  const bw = B + bh * TAN;

  const shimmerX = useMemo(() => {
    if (mode !== 'shimmer') return null;
    // Global position of the band's centre line at the top of the frame, then this block's slice.
    const start = -B;
    const end = W + H * TAN + B;
    const local = (x: number) => start + (end - start) * easeSweep(x / SWEEP) - dy * TAN - dx - bw / 2;
    const s = sample(local, 0, SWEEP, 24);
    s.inputRange.push(1);
    s.outputRange.push(s.outputRange[s.outputRange.length - 1] ?? 0);
    return t.interpolate(s);
  }, [mode, B, W, H, dx, dy, bw, t]);

  const waveOpacity = useMemo(() => {
    if (mode !== 'wave') return null;
    const phase = (dy / Math.max(1, H)) * 0.55;
    const half = 0.24;
    return t.interpolate(
      sample(
        (x) => {
          const d = Math.abs(x - phase);
          const dist = Math.min(d, 1 - d);
          return dist < half ? peak * (0.5 + 0.5 * Math.cos((Math.PI * dist) / half)) : 0;
        },
        0,
        1,
        36,
      ),
    );
  }, [mode, dy, H, peak, t]);

  const pulse = useMemo(
    () =>
      mode === 'pulse'
        ? { opacity: t.interpolate(sample((x) => 1 - 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * x)), 0, 1, 24)) }
        : null,
    [mode, t],
  );

  const L = (B / 2) * COS;
  const cx = bw / 2;
  const cy = bh / 2;

  return (
    <Animated.View
      ref={ref}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={mode === 'shimmer' || mode === 'wave' ? (e) => measure(ref.current, e, setBox) : undefined}
      style={[styles.block, { width, height, borderRadius, backgroundColor: base }, pulse, style]}
    >
      {shimmerX && box && bh > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: bw, transform: [{ translateX: shimmerX }] }]}>
          <Svg width={bw} height={bh}>
            <Defs>
              <LinearGradient
                id={gid}
                gradientUnits="userSpaceOnUse"
                x1={cx - L * COS}
                y1={cy - L * SIN}
                x2={cx + L * COS}
                y2={cy + L * SIN}
              >
                <Stop offset="0" stopColor={shine} stopOpacity={0} />
                <Stop offset="0.22" stopColor={shine} stopOpacity={peak * 0.12} />
                <Stop offset="0.4" stopColor={shine} stopOpacity={peak * 0.62} />
                <Stop offset="0.5" stopColor={shine} stopOpacity={peak} />
                <Stop offset="0.6" stopColor={shine} stopOpacity={peak * 0.62} />
                <Stop offset="0.78" stopColor={shine} stopOpacity={peak * 0.12} />
                <Stop offset="1" stopColor={shine} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={bw} height={bh} fill={`url(#${gid})`} />
          </Svg>
        </Animated.View>
      ) : null}
      {waveOpacity ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: shine, opacity: waveOpacity }]} />
      ) : null}
      {children != null ? (
        <View pointerEvents="none" style={styles.center}>
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Composites
 * --------------------------------------------------------------------------------------------- */

export interface SkeletonTextProps {
  /** Number of lines (default 3). */
  lines?: number | undefined;

  /** Line height in points (default 12). */
  lineHeight?: number | undefined;

  gap?: number | undefined;

  /** Width of the last line, so it reads like a paragraph (default '60%'). */
  lastLineWidth?: DimensionValue | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

const RAGGED: DimensionValue[] = ['100%', '94%', '97%', '90%'];

/** Paragraph placeholder: `lines` bars with a slightly ragged right edge and a shorter last line. */
export function SkeletonText({ lines = 3, lineHeight = 12, gap = 10, lastLineWidth = '60%', variant, style }: SkeletonTextProps) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant={variant}
          height={lineHeight}
          radius="capsule"
          width={i === lines - 1 && lines > 1 ? lastLineWidth : RAGGED[i % RAGGED.length]}
        />
      ))}
    </View>
  );
}

export interface SkeletonAvatarProps {
  size?: number | undefined;

  shape?: 'circle' | 'rounded' | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/** Round (or rounded-square) avatar placeholder. */
export function SkeletonAvatar({ size = 40, shape = 'circle', variant, style }: SkeletonAvatarProps) {
  const { radius } = useKit();
  return (
    <Skeleton
      variant={variant}
      width={size}
      height={size}
      radius={shape === 'circle' ? 'full' : radius.scale(Math.round(size * 0.28))}
      style={style}
    />
  );
}

export interface SkeletonMediaProps {
  /** Width / height ratio (default 16 / 9). Ignored when `height` is set. */
  aspectRatio?: number | undefined;

  /** Fixed height in points. */
  height?: number | undefined;

  width?: DimensionValue | undefined;

  /** Draw a faint image glyph in the centre (default false). */
  glyph?: boolean | undefined;

  /** Glyph size in points (default 28). */
  glyphSize?: number | undefined;

  radius?: SkeletonProps['radius'] | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/** Image / video placeholder (optionally with a faint picture glyph in the middle). */
export function SkeletonMedia({
  aspectRatio = 16 / 9,
  height,
  width = '100%',
  glyph = false,
  glyphSize = 28,
  radius = 'md',
  variant,
  style,
}: SkeletonMediaProps) {
  const { colors, dark } = useKit();
  const ink = alpha(colors.foreground, dark ? 0.2 : 0.14);
  return (
    <Skeleton
      variant={variant}
      width={width}
      height={height ?? 'auto'}
      radius={radius}
      style={[height == null ? { aspectRatio } : null, style]}
    >
      {glyph ? (
        <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3.5 7A3.5 3.5 0 0 1 7 3.5h10A3.5 3.5 0 0 1 20.5 7v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17z"
            stroke={ink}
            strokeWidth={1.6}
          />
          <Circle cx={9} cy={9.2} r={1.7} fill={ink} />
          <Path d="M4 17.2l4.6-4.4a1.6 1.6 0 0 1 2.2 0l2.4 2.3 1.6-1.5a1.6 1.6 0 0 1 2.2 0l3.4 3.2" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </Skeleton>
  );
}

export interface SkeletonListProps {
  /** Number of rows (default 4). */
  rows?: number | undefined;

  /** Avatar size (default 44). 0 hides it. */
  avatarSize?: number | undefined;

  avatarShape?: 'circle' | 'rounded' | undefined;

  /** Trailing short bar, like a time stamp or price (default true). */
  trailing?: boolean | undefined;

  /** Hairline between rows (default false). */
  dividers?: boolean | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

const TITLE_W: DimensionValue[] = ['58%', '44%', '66%', '50%', '62%'];
const SUB_W: DimensionValue[] = ['86%', '74%', '80%', '68%', '90%'];

/** List rows: avatar, title + subtitle lines and a trailing pill. Widths vary so it reads as real data. */
export function SkeletonList({
  rows = 4,
  avatarSize = 44,
  avatarShape = 'circle',
  trailing = true,
  dividers = false,
  variant,
  style,
}: SkeletonListProps) {
  const { colors } = useKit();
  return (
    <View style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={[
            styles.listRow,
            dividers && i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
          ]}
        >
          {avatarSize > 0 ? <SkeletonAvatar variant={variant} size={avatarSize} shape={avatarShape} /> : null}
          <View style={styles.rowText}>
            <Skeleton variant={variant} width={TITLE_W[i % TITLE_W.length]} height={13} radius="capsule" />
            <Skeleton variant={variant} width={SUB_W[i % SUB_W.length]} height={11} radius="capsule" />
          </View>
          {trailing ? (
            <View style={styles.trailing}>
              <Skeleton variant={variant} width={i % 3 === 1 ? 30 : 40} height={11} radius="capsule" />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export interface SkeletonCardProps {
  /** Show the media block (default true). */
  media?: boolean | undefined;

  mediaHeight?: number | undefined;

  /** Show the author row: avatar, name, handle · time, overflow menu (default true). */
  header?: boolean | undefined;

  /** Body text lines (default 2). */
  lines?: number | undefined;

  /** Like / comment / share row along the bottom (default true). */
  actions?: boolean | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/** A feed post placeholder: author row, caption, media and an action bar — borderless, like the content it stands in for. */
export function SkeletonCard({
  media = true,
  mediaHeight = 168,
  header = true,
  lines = 2,
  actions = true,
  variant,
  style,
}: SkeletonCardProps) {
  return (
    <View style={[styles.card, style]}>
      {header ? (
        <View style={styles.row}>
          <SkeletonAvatar variant={variant} size={40} />
          <View style={styles.rowText}>
            <Skeleton variant={variant} width="46%" height={13} radius="capsule" />
            <Skeleton variant={variant} width="28%" height={11} radius="capsule" />
          </View>
        </View>
      ) : null}
      {lines > 0 ? <SkeletonText variant={variant} lines={lines} lineHeight={12} gap={9} lastLineWidth="72%" /> : null}
      {media ? <SkeletonMedia variant={variant} height={mediaHeight} radius="lg" /> : null}
      {actions ? (
        <View style={styles.actions}>
          {[24, 20, 0].map((label, i) => (
            <View key={i} style={styles.action}>
              <Skeleton variant={variant} width={22} height={22} radius="full" />
              {label ? <Skeleton variant={variant} width={label} height={10} radius="capsule" /> : null}
            </View>
          ))}
          <View style={styles.flex} />
          <Skeleton variant={variant} width={22} height={22} radius="full" />
        </View>
      ) : null}
    </View>
  );
}

export interface SkeletonNavProps {
  /** App bar: back + title + trailing actions (default true). */
  header?: boolean | undefined;

  /** Show a back chevron placeholder (default true when header is on). */
  back?: boolean | undefined;

  /** Trailing action pills in the header (default 2). */
  actions?: number | undefined;

  /** Bottom tab bar (default true). */
  tabs?: boolean | undefined;

  /** Number of bottom tabs (default 4). */
  tabCount?: number | undefined;

  /** Body: how many list rows to show while content loads (default 4). 0 = empty body. */
  rows?: number | undefined;

  /** Custom body instead of the default list rows. */
  children?: React.ReactNode | undefined;

  variant?: SkeletonVariant | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

/**
 * Full-screen loading chrome for mobile: app header + body placeholders + bottom tabs.
 * Keep the nav fixed while whatever the screen fetches paints in the middle.
 */
export function SkeletonNav({
  header = true,
  back = true,
  actions = 2,
  tabs = true,
  tabCount = 4,
  rows = 4,
  children,
  variant,
  style,
}: SkeletonNavProps) {
  const { colors } = useKit();
  return (
    <SkeletonGroup style={[styles.navScreen, { backgroundColor: colors.background }, style]}>
      {header ? (
        <View style={styles.navHeader}>
          {back ? <Skeleton variant={variant} width={32} height={32} radius="full" /> : <View style={{ width: 32 }} />}
          <View style={styles.flex}>
            <Skeleton variant={variant} width="45%" height={16} radius="capsule" />
          </View>
          <View style={styles.navActions}>
            {Array.from({ length: Math.max(0, actions) }, (_, i) => (
              <Skeleton key={i} variant={variant} width={32} height={32} radius="full" />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.navBody}>
        {children ?? (rows > 0 ? <SkeletonList variant={variant} rows={rows} avatarShape="rounded" avatarSize={40} /> : null)}
      </View>

      {tabs ? (
        <View style={[styles.navTabs, { borderTopColor: colors.border }]}>
          {Array.from({ length: Math.max(2, tabCount) }, (_, i) => (
            <View key={i} style={styles.navTab}>
              <Skeleton variant={variant} width={24} height={24} radius="full" />
              <Skeleton variant={variant} width={i === 0 ? 30 : 24} height={8} radius="capsule" />
            </View>
          ))}
        </View>
      ) : null}
    </SkeletonGroup>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Reveal: skeleton → content hand-off
 * --------------------------------------------------------------------------------------------- */

export interface SkeletonRevealProps {
  /** While true the skeleton shows; flip to false when the data arrives. */
  loading: boolean;
  /** Placeholder shown while loading (default: three text lines). */
  skeleton?: React.ReactNode | undefined;

  /** The real content. Top-level children rise in one after another. */
  children?: React.ReactNode | undefined;

  /** Delay between each top-level child rising in, in ms (default 70). 0 reveals it as one block. */
  stagger?: number | undefined;

  /** Glide the container height from the skeleton's height to the content's (default true). */
  animateHeight?: boolean | undefined;

  /** Screen reader label while loading (default: the kit's `labels.loading`). */
  loadingLabel?: string | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

type Layer = 'skeleton' | 'content';
const RISE = 380;
const RISE_Y = 10;
const FADE_OUT = 220;
const MAX_STAGGERED = 8;

/**
 * Swaps a skeleton for real content without a jump: the skeleton dissolves, the content rises
 * in child by child (cross-fade + translateY), and the container glides between the two heights.
 * Instant when the OS "reduce motion" setting is on.
 */
export function SkeletonReveal({
  loading,
  skeleton,
  children,
  stagger = 70,
  animateHeight = true,
  loadingLabel,
  style,
}: SkeletonRevealProps) {
  const { labels } = useKit();
  const reduce = useReduceMotion();
  const [mode, setMode] = useState<Layer>(loading ? 'skeleton' : 'content');
  const [leaving, setLeaving] = useState<Layer | null>(null);
  const [fixed, setFixed] = useState(false);
  const heights = useRef<Record<Layer, number>>({ skeleton: 0, content: 0 });
  const pending = useRef(false);
  const token = useRef(0);
  const [h] = useState(() => new Animated.Value(0)); // JS driver: container height
  const [skA] = useState(() => new Animated.Value(loading ? 1 : 0)); // native: skeleton layer
  const [ctA] = useState(() => new Animated.Value(loading ? 0 : 1)); // native: content layer

  const items = React.Children.toArray(children);
  const staggered = stagger > 0 && items.length > 1;
  const steps = Math.min(items.length, MAX_STAGGERED);
  const total = RISE + (staggered ? stagger * (steps - 1) : 0);
  const value = (l: Layer) => (l === 'skeleton' ? skA : ctA);

  const run = (next: Layer, prev: Layer) => {
    const id = ++token.current;
    const anims: Animated.CompositeAnimation[] = [
      Animated.timing(value(prev), { toValue: 0, duration: FADE_OUT, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(value(next), {
        toValue: 1,
        duration: next === 'content' ? total : FADE_OUT,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ];
    if (animateHeight) {
      anims.push(
        Animated.spring(h, { toValue: heights.current[next], ...motion.gentle, overshootClamping: true, useNativeDriver: false }),
      );
    }
    Animated.parallel(anims).start(({ finished }) => {
      if (!finished || id !== token.current) return;
      setFixed(false);
      setLeaving(null);
    });
  };

  // `loading` flipped: swap layers while rendering, then start the animation in a layout effect so the
  // held height and the new layer's starting opacity are set before that frame paints.
  const [loadingSeen, setLoadingSeen] = useState(loading);
  const [turn, setTurn] = useState<{ next: Layer; prev: Layer; holdHeight: boolean; ready: boolean } | null>(null);
  if (loading !== loadingSeen) {
    setLoadingSeen(loading);
    const next: Layer = loading ? 'skeleton' : 'content';
    if (next !== mode) {
      if (reduce) {
        setFixed(false);
        setLeaving(null);
      } else {
        if (animateHeight) setFixed(true);
        setLeaving(mode);
      }
      setTurn({ next, prev: mode, holdHeight: animateHeight && !fixed, ready: leaving === next });
      setMode(next);
    }
  }

  useLayoutEffect(() => {
    if (!turn) return;
    const { next, prev } = turn;
    if (reduce) {
      token.current += 1;
      value(prev).setValue(0);
      value(next).setValue(1);
      return;
    }
    if (animateHeight) {
      h.stopAnimation();
      if (turn.holdHeight) h.setValue(heights.current[prev]);
    }
    if (turn.ready && heights.current[next] > 0) {
      run(next, prev);
    } else {
      value(next).setValue(0);
      pending.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  const measure = (l: Layer, e: LayoutChangeEvent) => {
    heights.current[l] = e.nativeEvent.layout.height;
    if (l === mode && pending.current) {
      pending.current = false;
      run(mode, l === 'skeleton' ? 'content' : 'skeleton');
    }
  };

  const rise = (i: number) => {
    const k = Math.min(i, MAX_STAGGERED - 1);
    const a = (k * stagger) / total;
    const b = Math.min(1, (k * stagger + RISE) / total);
    const p = sample((x) => easeRise((x - a) / (b - a)), a, b, 10);
    if (a > 0) {
      p.inputRange.unshift(0);
      p.outputRange.unshift(0);
    }
    if (b < 1) {
      p.inputRange.push(1);
      p.outputRange.push(1);
    }
    const v = ctA.interpolate(p);
    return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [RISE_Y, 0] }) }] };
  };

  const layerStyle = (l: Layer) => (l === mode ? null : styles.leaving);
  const showSkeleton = mode === 'skeleton' || leaving === 'skeleton';
  const showContent = mode === 'content' || leaving === 'content';

  return (
    <Animated.View
      accessibilityState={{ busy: mode === 'skeleton' }}
      style={[fixed ? { height: h, overflow: 'hidden' } : null, style]}
    >
      {showSkeleton ? (
        <Animated.View
          accessible={mode === 'skeleton'}
          accessibilityRole="progressbar"
          accessibilityLabel={loadingLabel ?? labels.loading}
          pointerEvents="none"
          onLayout={(e) => measure('skeleton', e)}
          style={[layerStyle('skeleton'), { opacity: skA }]}
        >
          <SkeletonGroup>{skeleton ?? <SkeletonText lines={3} />}</SkeletonGroup>
        </Animated.View>
      ) : null}
      {showContent ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          pointerEvents={mode === 'content' ? 'auto' : 'none'}
          onLayout={(e) => measure('content', e)}
          style={[layerStyle('content'), staggered ? null : rise(0)]}
        >
          {staggered
            ? items.map((child, i) => (
                <Animated.View key={i} style={rise(i)}>
                  {child}
                </Animated.View>
              ))
            : children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

Skeleton.Text = SkeletonText;
Skeleton.Avatar = SkeletonAvatar;
Skeleton.Media = SkeletonMedia;
Skeleton.List = SkeletonList;
Skeleton.Card = SkeletonCard;
Skeleton.Nav = SkeletonNav;
Skeleton.Group = SkeletonGroup;
Skeleton.Reveal = SkeletonReveal;

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  card: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  trailing: { alignItems: 'flex-end', minWidth: 40 },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  navScreen: { flex: 1, alignSelf: 'stretch', minHeight: 320, overflow: 'hidden' },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBody: { flex: 1, paddingHorizontal: 16 },
  navTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navTab: { alignItems: 'center', gap: 6, minWidth: 44 },
});
