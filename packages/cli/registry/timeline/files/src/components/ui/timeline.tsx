import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Avatar } from '@/components/ui/avatar';
import { alpha, isTextNode, motion, readableOn, useKit } from '@/lib/kit';

export type TimelineStatus = 'done' | 'current' | 'upcoming' | 'error';
export type TimelineVariant = 'default' | 'compact' | 'card' | 'scroll';

export type TimelineIconName =
  | 'cart'
  | 'package'
  | 'truck'
  | 'home'
  | 'rocket'
  | 'bug'
  | 'star'
  | 'chat'
  | 'tag'
  | 'user';

export interface TimelineIconProps {
  color: string;
  size: number;
}

export type TimelineImageSource = string | { uri: string; aspectRatio?: number };

export interface TimelineLink {
  label: string;
  onPress: () => void;
}

export interface TimelineItem {
  key?: string;
  title: string;
  description?: string;
  /** Timestamp or meta, e.g. "Oct 12 · 2:14 PM" or "2h". */
  time?: string;
  /** Default 'done'. */
  status?: TimelineStatus;
  /** Icon inside a larger dot. */
  icon?: TimelineIconName | ((props: TimelineIconProps) => React.ReactNode);
  /** Photo (initials fallback) instead of a dot. */
  avatar?: { src?: string; name: string };
  /** A photo under the text — a URL, or `{ uri, aspectRatio }` (default 16:9). */
  image?: TimelineImageSource;
  /** Several photos in a 1-, 2- or 3-up grid (more than three show a "+N" tile). Combined with `image`. */
  images?: TimelineImageSource[];
  /** Small accent chips under the text. */
  tags?: string[];
  /** Tappable accent links under the text. */
  links?: TimelineLink[];
  /** Anything under the description: a card, a quote, tags, buttons. */
  content?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  /**
   * 'default' roomy rows · 'compact' small dots, one-line rows · 'card' each event on a card ·
   * 'scroll' renders its own scroll view and fills the connector as you scroll (give it a height).
   */
  variant?: TimelineVariant;
  /** Colour of done / current dots and the filled line (default: theme accent). */
  accent?: string;
  /** Draw a check in done dots (default true). */
  checks?: boolean;
  /** Entrance + connector fill, or the scroll-driven fill for 'scroll' (default true; off with reduce motion). */
  animated?: boolean;
  /** Colour behind the rail — fills hollow dots and the mini status badges (default: theme background). */
  surface?: string;
  /** 'scroll' only: rendered above the timeline inside the scroll view. */
  header?: React.ReactNode;
  /** 'scroll' only: rendered below the timeline inside the scroll view. */
  footer?: React.ReactNode;
  /** 'scroll' only: style for the scroll view's content container (default `{ paddingVertical: 12 }`). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Root style. For 'scroll' this is the scroll view, so set a `height` (or `flex: 1` on a screen). */
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const ENTER_STAGGER = 70;
const FILL_START = 160;
/** Where the fill point sits in the viewport at the top of the scroll (it slides to the bottom by the end). */
const SCROLL_ANCHOR = 0.55;
/** The next node starts pulsing when the fill point is this fraction of the viewport away. */
const NEAR = 0.3;

/**
 * Vertical timeline for order tracking, activity feeds and release history. Items rise in one
 * by one, then the connector fills down through every reached step: done dots draw their check
 * as the line arrives, the current dot starts to pulse, upcoming dots stay hollow on a dotted
 * track, and failed steps draw a cross. `variant="scroll"` renders its own scroll view and ties
 * the fill to the scroll position instead.
 */
export function Timeline(props: TimelineProps) {
  return props.variant === 'scroll' ? <ScrollTimeline {...props} /> : <StaticTimeline {...props} />;
}

function StaticTimeline({
  items,
  variant = 'default',
  accent,
  checks = true,
  animated = true,
  surface,
  style,
}: TimelineProps) {
  const { colors } = useKit();
  const reduceMotion = useReduceMotion();
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  const still = !animated || reduceMotion;
  const segs = Math.max(1, items.length - 1);
  const fillMs = Math.round(Math.min(280, 1400 / segs));

  return (
    <View accessibilityRole="list" style={style}>
      {items.map((item, i) => {
        const next = items[i + 1];
        const status = item.status ?? 'done';
        return (
          <Row
            key={item.key ?? `${item.title}-${i}`}
            item={item}
            status={status}
            next={next ? (next.status ?? 'done') : null}
            last={!next}
            tint={tint}
            surface={bg}
            variant={variant}
            checks={checks}
            still={still}
            enterDelay={i * ENTER_STAGGER}
            arriveDelay={FILL_START + i * fillMs}
            fillMs={fillMs}
          />
        );
      })}
    </View>
  );
}

/**
 * Scroll-driven timeline. One continuous rail sits behind the rows; its accent fill is a native
 * scaleY driven by `scrollY`, interpolated against the node centres measured with onLayout.
 * The fill point starts at 55% of the viewport and slides to the bottom edge as the scroll
 * reaches its end, so the last node is always reachable without padding. Nodes light up (and
 * draw their check) when the fill reaches them; the next one pulses as the fill gets close.
 * The fill runs top-down through the leading steps that are not 'upcoming'.
 */
function ScrollTimeline({
  items,
  accent,
  checks = true,
  animated = true,
  surface,
  header,
  footer,
  contentContainerStyle,
  style,
}: TimelineProps) {
  const { colors, dark } = useKit();
  const reduceMotion = useReduceMotion();
  const tint = accent ?? colors.accent;
  const bg = surface ?? colors.background;
  const still = !animated || reduceMotion;
  const n = items.length;
  const rail = 34;

  const scrollY = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [listY, setListY] = useState(0);
  const [nodes, setNodes] = useState<number[]>([]);

  const onNode = useCallback((i: number, y: number) => {
    setNodes((prev) => {
      if (Math.abs((prev[i] ?? -1) - y) < 0.5) return prev;
      const nextNodes = prev.slice();
      nextNodes[i] = y;
      return nextNodes;
    });
  }, []);

  // Fill runs through the leading steps that have been reached.
  let reach = items.findIndex((it) => (it.status ?? 'done') === 'upcoming') - 1;
  if (reach < -1) reach = n - 1;

  const measured = n > 0 && viewH > 0 && contentH > 0 && items.every((_, i) => nodes[i] != null);
  const maxScroll = contentH - viewH;
  const scrolls = measured && maxScroll > 1;
  const frozen = still || (measured && !scrolls);

  // Scroll offset at which the fill point (s·k + anchor) reaches each node.
  const triggers = useMemo(() => {
    if (!scrolls) return [] as number[];
    const anchor = viewH * SCROLL_ANCHOR;
    const k = 1 + (viewH - anchor) / maxScroll;
    return items.map((_, i) => (listY + nodes[i] - anchor) / k);
  }, [scrolls, viewH, maxScroll, listY, nodes, items]);

  // progress = lit * 2 + (near ? 1 : 0), one number so React can skip identical updates.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (frozen || !triggers.length) return;
    const update = (y: number) => {
      lastY.current = y;
      let lit = 0;
      while (lit <= reach && triggers[lit] <= y) lit++;
      const near = lit <= reach && y >= triggers[lit] - viewH * NEAR;
      setProgress(lit * 2 + (near ? 1 : 0));
    };
    update(lastY.current);
    const id = scrollY.addListener(({ value }) => update(value));
    return () => scrollY.removeListener(id);
  }, [frozen, triggers, reach, viewH, scrollY]);

  const lit = frozen ? n : measured ? progress >> 1 : 0;
  const near = !frozen && (progress & 1) === 1;

  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  const top = nodes[0] ?? 0;
  const fillH = reach > 0 && measured ? nodes[reach] - top : 0;
  const dottedFrom = Math.max(0, reach);
  const dottedH = measured && reach < n - 1 ? nodes[n - 1] - nodes[dottedFrom] : 0;

  let fillStyle: Animated.WithAnimatedValue<ViewStyle> | null = null;
  if (fillH > 0) {
    if (frozen) {
      fillStyle = {};
    } else if (triggers.length) {
      const t0 = triggers[0];
      const t1 = Math.max(triggers[reach], t0 + 1);
      const p = scrollY.interpolate({ inputRange: [t0, t1], outputRange: [0.0001, 1], extrapolate: 'clamp' });
      fillStyle = {
        transform: [
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-fillH / 2, 0] }) },
          { scaleY: p },
        ],
      };
    }
  }

  return (
    <Animated.ScrollView
      style={style}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      scrollEventThrottle={16}
      onScroll={onScroll}
      nestedScrollEnabled
      onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentH(h)}
    >
      {header}
      <View accessibilityRole="list" onLayout={(e) => setListY(e.nativeEvent.layout.y)}>
        {fillH > 0 ? (
          <View
            pointerEvents="none"
            style={[styles.track, { left: rail / 2 - 1, top, height: fillH, backgroundColor: alpha(colors.foreground, dark ? 0.1 : 0.07) }]}
          />
        ) : null}
        {dottedH > 0 ? (
          <Svg
            width={2}
            height={dottedH}
            pointerEvents="none"
            style={[styles.track, { left: rail / 2 - 1, top: nodes[dottedFrom] }]}
          >
            <Line
              x1={1}
              y1={1}
              x2={1}
              y2={dottedH - 1}
              stroke={alpha(colors.foreground, dark ? 0.28 : 0.22)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={[0.1, 6]}
            />
          </Svg>
        ) : null}
        {fillStyle ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.track, { left: rail / 2 - 1, top, height: fillH, backgroundColor: tint }, fillStyle]}
          />
        ) : null}
        {items.map((item, i) => {
          const status = item.status ?? 'done';
          const reachable = i <= reach;
          const isLit = !reachable || i < lit;
          const dotStatus: TimelineStatus = isLit ? status : i === lit && near ? 'current' : 'upcoming';
          return (
            <Row
              key={item.key ?? `${item.title}-${i}`}
              item={item}
              status={status}
              dotStatus={dotStatus}
              lit={reachable && isLit}
              next={null}
              last={i === n - 1}
              tint={tint}
              surface={bg}
              variant="scroll"
              checks={checks}
              still={still}
              enterDelay={0}
              arriveDelay={0}
              fillMs={0}
              onNode={(y) => onNode(i, y)}
            />
          );
        })}
      </View>
      {footer}
    </Animated.ScrollView>
  );
}

function statusLabel(s: TimelineStatus) {
  return s === 'done' ? 'completed' : s === 'current' ? 'in progress' : s === 'error' ? 'failed' : 'upcoming';
}

interface RowProps {
  item: TimelineItem;
  status: TimelineStatus;
  next: TimelineStatus | null;
  last: boolean;
  tint: string;
  surface: string;
  variant: TimelineVariant;
  checks: boolean;
  still: boolean;
  enterDelay: number;
  /** When the connector reaches this row's dot. */
  arriveDelay: number;
  fillMs: number;
  /** 'scroll': what the dot shows right now (it lights up when the fill reaches it). */
  dotStatus?: TimelineStatus;
  /** 'scroll': the fill has reached this dot — pops it. */
  lit?: boolean;
  /** 'scroll': reports the dot centre's y inside the list. */
  onNode?: (y: number) => void;
}

function Row({
  item,
  status,
  next,
  last,
  tint,
  surface,
  variant,
  checks,
  still,
  enterDelay,
  arriveDelay,
  fillMs,
  dotStatus,
  lit,
  onNode,
}: RowProps) {
  const { colors, radius, dark, font, shadow } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const compact = variant === 'compact';
  const card = variant === 'card';
  const scroll = variant === 'scroll';
  const rich = !!(item.icon || item.avatar);
  const dot = compact ? (rich ? 24 : 16) : rich ? 34 : 24;
  const rail = compact ? 24 : 34;
  const titleSize = compact ? 14.5 : 15.5;
  const titleLine = compact ? 20 : 21;
  const cardPad = 14;
  const dotTop = Math.max(0, (card ? cardPad : 0) + (titleLine - dot) / 2);
  const textTop = card ? 0 : Math.max(0, (dot - titleLine) / 2);
  const gapBelow = compact ? 14 : card ? 12 : scroll ? 32 : 26;
  const entrance = !still && !scroll;

  const enter = useRef(new Animated.Value(entrance ? 0 : 1)).current;
  const fill = useRef(new Animated.Value(still ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const wasLit = useRef(!!lit);
  const [lineH, setLineH] = useState(0);

  // A segment is filled only when both ends have been reached (works for newest-first lists too).
  const reached = next !== null && next !== 'upcoming' && status !== 'upcoming';

  useEffect(() => {
    if (!entrance) {
      enter.setValue(1);
      fill.setValue(1);
      return;
    }
    enter.setValue(0);
    fill.setValue(0);
    const a = Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: enterDelay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const b = Animated.timing(fill, {
      toValue: 1,
      duration: fillMs,
      delay: arriveDelay + 40,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    a.start();
    if (reached) b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [entrance, enter, fill, enterDelay, arriveDelay, fillMs, reached]);

  // Scroll: a small pop when the fill reaches this dot.
  useEffect(() => {
    if (lit && !wasLit.current && !still) {
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, ...motion.bouncy, useNativeDriver: true }).start();
    }
    wasLit.current = !!lit;
  }, [lit, still, pop]);

  const muted = status === 'upcoming';
  const current = status === 'current';
  const titleColor = muted ? colors.mutedForeground : status === 'error' ? colors.danger : colors.foreground;
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const photos = [...(item.image ? [item.image] : []), ...(item.images ?? [])];
  const hasLinks = !!item.links?.length;

  const body = (
    <>
      <View style={[styles.titleRow, compact && styles.compactRow]}>
        <Text
          numberOfLines={compact ? 1 : 2}
          style={[styles.title, ff, { fontSize: titleSize, lineHeight: titleLine, color: titleColor }]}
        >
          {item.title}
        </Text>
        {item.time ? (
          <Text
            numberOfLines={1}
            style={[styles.time, ff, { lineHeight: titleLine, color: current ? tint : colors.mutedForeground }]}
          >
            {item.time}
          </Text>
        ) : null}
      </View>
      {item.description && !compact ? (
        <Text style={[styles.desc, ff, { color: colors.mutedForeground }]}>{item.description}</Text>
      ) : null}
      {photos.length ? <TimelineGallery images={photos} dim={muted} /> : null}
      {item.tags?.length || hasLinks ? (
        <View style={styles.chips}>
          {item.tags?.map((t) => (
            <View
              key={`t-${t}`}
              style={[styles.tag, { borderRadius: radius.capsule(22), backgroundColor: alpha(tint, dark ? 0.2 : 0.1) }]}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.tagText, ff, { color: tint }]}>{t}</Text>
            </View>
          ))}
          {item.links?.map((l) => (
            <Pressable
              key={`l-${l.label}`}
              accessibilityRole="link"
              accessibilityLabel={l.label}
              onPress={l.onPress}
              hitSlop={12}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Text style={[styles.linkText, ff, { color: tint }]}>{l.label} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {item.content ? (
        <View style={styles.content}>
          {isTextNode(item.content) ? <Text style={[ff, { color: colors.foreground }]}>{item.content}</Text> : item.content}
        </View>
      ) : null}
    </>
  );

  // boxShadow via the kit: the same soft card shadow on iOS, Android and web.
  const cardShadow: ViewStyle = shadow(current ? 'md' : 'sm');

  const dotWrap = scroll
    ? { transform: [{ scale: pop }] }
    : {
        opacity: enter,
        transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      };

  return (
    <View
      accessible={!hasLinks}
      accessibilityLabel={[item.title, item.time, item.description, statusLabel(status)].filter(Boolean).join(', ')}
      style={styles.row}
      onLayout={onNode ? (e: LayoutChangeEvent) => onNode(e.nativeEvent.layout.y + dotTop + dot / 2) : undefined}
    >
      <View style={[styles.rail, { width: rail }]}>
        <View style={{ height: dotTop }} />
        <Animated.View style={dotWrap}>
          <Dot
            item={item}
            status={dotStatus ?? status}
            size={dot}
            tint={tint}
            surface={surface}
            checks={checks}
            still={still}
            delay={arriveDelay}
          />
        </Animated.View>
        {next !== null ? (
          <View
            style={[styles.line, { marginTop: compact ? 3 : 5, marginBottom: (compact ? 3 : 5) - dotTop }]}
            onLayout={(e) => setLineH(Math.round(e.nativeEvent.layout.height))}
          >
            {lineH > 0 ? (
              <>
                <Svg width={2} height={lineH} style={StyleSheet.absoluteFill}>
                  {reached ? (
                    <Rect width={2} height={lineH} rx={1} fill={alpha(colors.foreground, dark ? 0.1 : 0.07)} />
                  ) : (
                    <Line
                      x1={1}
                      y1={1}
                      x2={1}
                      y2={lineH - 1}
                      stroke={alpha(colors.foreground, dark ? 0.28 : 0.22)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray={[0.1, 6]}
                    />
                  )}
                </Svg>
                {reached ? (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 2,
                      height: lineH,
                      borderRadius: 1,
                      backgroundColor: tint,
                      transform: [
                        { translateY: fill.interpolate({ inputRange: [0, 1], outputRange: [-lineH / 2, 0] }) },
                        { scaleY: fill.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) },
                      ],
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.bodyWrap,
          {
            paddingBottom: last ? 0 : gapBelow,
            paddingTop: textTop,
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        {card ? (
          <View
            style={[
              styles.card,
              cardShadow,
              {
                padding: cardPad,
                borderRadius: radius.lg,
                backgroundColor: colors.card,
                borderColor: current ? alpha(tint, dark ? 0.45 : 0.32) : status === 'error' ? alpha(colors.danger, 0.3) : hairline,
              },
            ]}
          >
            {current ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: radius.lg, backgroundColor: alpha(tint, dark ? 0.08 : 0.045) }]}
              />
            ) : null}
            {body}
          </View>
        ) : (
          body
        )}
      </Animated.View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M7.2 12.4l3.2 3.2 6.4-6.6';
const CHECK_LEN = 15;
const CROSS_A = 'M8.6 8.6l6.8 6.8';
const CROSS_B = 'M15.4 8.6l-6.8 6.8';
const CROSS_LEN = 10;

/** Check or cross that draws itself (JS-driven dash offset on its own Svg). */
function DrawnMark({ kind, color, size, draw }: { kind: 'check' | 'cross'; color: string; size: number; draw: Animated.Value }) {
  const s = { stroke: color, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'check' ? (
        <AnimatedPath
          d={CHECK}
          {...s}
          strokeDasharray={[CHECK_LEN, CHECK_LEN]}
          strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] })}
        />
      ) : (
        <>
          <AnimatedPath
            d={CROSS_A}
            {...s}
            strokeDasharray={[CROSS_LEN, CROSS_LEN]}
            strokeDashoffset={draw.interpolate({ inputRange: [0, 0.5], outputRange: [CROSS_LEN, 0], extrapolate: 'clamp' })}
          />
          <AnimatedPath
            d={CROSS_B}
            {...s}
            strokeDasharray={[CROSS_LEN, CROSS_LEN]}
            strokeDashoffset={draw.interpolate({ inputRange: [0.5, 1], outputRange: [CROSS_LEN, 0], extrapolate: 'clamp' })}
          />
        </>
      )}
    </Svg>
  );
}

function Dot({
  item,
  status,
  size,
  tint,
  surface,
  checks,
  still,
  delay,
}: {
  item: TimelineItem;
  status: TimelineStatus;
  size: number;
  tint: string;
  surface: string;
  checks: boolean;
  still: boolean;
  delay: number;
}) {
  const { colors, radius, dark } = useKit();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const draw = useRef(new Animated.Value(still ? 1 : 0)).current; // JS: dash offsets
  const pulse = useRef(new Animated.Value(0)).current; // native: halo
  const current = status === 'current';
  const marked = status === 'error' || (status === 'done' && checks);

  useEffect(() => {
    if (still || !marked) {
      draw.setValue(1);
      return;
    }
    draw.setValue(0);
    const a = Animated.timing(draw, {
      toValue: 1,
      duration: status === 'error' ? 420 : 340,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [still, marked, status, delay, draw]);

  useEffect(() => {
    if (!current || still) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [current, still, delay, pulse]);

  const tone = status === 'error' ? colors.danger : tint;
  const hollow = alpha(colors.foreground, dark ? 0.24 : 0.2);
  const hasIcon = !!item.icon && !item.avatar;
  const glyph = Math.round(size * 0.5);

  const halo = current ? (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius.full,
          backgroundColor: alpha(tint, 0.35),
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
        },
      ]}
    />
  ) : null;

  // Opaque disc so a rail running behind the dot never shows through tinted / dimmed fills.
  const base = <View style={[StyleSheet.absoluteFill, { borderRadius: radius.full, backgroundColor: surface }]} />;

  // Small check / cross badge on icon dots (avatars only flag failures — a feed is mostly 'done').
  const miniSize = Math.max(12, Math.round(size * 0.42));
  const mini =
    (hasIcon && marked) || (item.avatar && status === 'error') ? (
      <View
        style={[
          styles.mini,
          {
            width: miniSize + 4,
            height: miniSize + 4,
            right: -4,
            bottom: -4,
            borderRadius: radius.full,
            backgroundColor: surface,
          },
        ]}
      >
        <View
          style={{
            width: miniSize,
            height: miniSize,
            borderRadius: radius.full,
            backgroundColor: tone,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DrawnMark kind={status === 'error' ? 'cross' : 'check'} color={readableOn(tone)} size={miniSize} draw={draw} />
        </View>
      </View>
    ) : null;

  if (item.avatar) {
    return (
      <View style={{ width: size, height: size }}>
        {halo}
        {base}
        <View style={{ opacity: status === 'upcoming' ? 0.55 : 1 }}>
          <Avatar src={item.avatar.src} name={item.avatar.name} size={size} surface={surface} />
        </View>
        {mini}
      </View>
    );
  }

  if (hasIcon) {
    const solid = current;
    const fg = solid ? readableOn(tint) : status === 'upcoming' ? colors.mutedForeground : tone;
    const icon =
      typeof item.icon === 'function' ? item.icon({ color: fg, size: glyph }) : <TimelineIcon name={item.icon as TimelineIconName} color={fg} size={glyph} />;
    return (
      <View style={{ width: size, height: size }}>
        {halo}
        {base}
        <View
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: radius.full,
              backgroundColor: solid
                ? tint
                : status === 'upcoming'
                  ? surface
                  : alpha(tone, dark ? 0.2 : 0.12),
              borderWidth: status === 'upcoming' ? 1.5 : 0,
              borderColor: hollow,
            },
            solid ? glow(tint) : null,
          ]}
        >
          {solid ? <Sheen id={`sh${uid}`} size={size} /> : null}
          {icon}
        </View>
        {mini}
      </View>
    );
  }

  // Plain dots.
  const filled = status === 'done' || status === 'error';
  const small = size < 16;
  return (
    <View style={{ width: size, height: size }}>
      {halo}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
            backgroundColor: filled ? tone : surface,
            borderWidth: filled ? 0 : current ? 2 : 1.5,
            borderColor: current ? tint : hollow,
          },
          filled ? glow(tone) : null,
        ]}
      >
        {filled ? <Sheen id={`sh${uid}`} size={size} /> : null}
        {filled && marked && !small ? (
          <DrawnMark kind={status === 'error' ? 'cross' : 'check'} color={readableOn(tone)} size={Math.round(size * 0.8)} draw={draw} />
        ) : null}
        {current ? (
          <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: radius.full, backgroundColor: tint }} />
        ) : null}
      </View>
    </View>
  );
}

/** Very soft white top highlight on solid dots (neutral, ≤ 0.12). */
function Sheen({ id, size }: { id: string; size: number }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.12} />
          <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** A soft tinted glow as boxShadow, identical on iOS, Android and web. */
function glow(color: string): ViewStyle {
  return { boxShadow: `0px 2px 10px ${alpha(color, 0.3)}` };
}

function srcOf(image: TimelineImageSource) {
  return typeof image === 'string' ? { uri: image, ratio: 16 / 9 } : { uri: image.uri, ratio: image.aspectRatio ?? 16 / 9 };
}

/** One photo at its aspect ratio, two side by side, or one large + two stacked (+N on the last tile). */
function TimelineGallery({ images, dim }: { images: TimelineImageSource[]; dim: boolean }) {
  const { colors, radius, dark } = useKit();
  const shown = images.slice(0, 3).map(srcOf);
  const extra = images.length - shown.length;
  const frame = [
    styles.gallery,
    { borderRadius: radius.md, borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06), opacity: dim ? 0.6 : 1 },
  ];
  const tile = (i: number, flex: ViewStyle) => (
    <Photo key={i} uri={shown[i].uri} delay={i * 90} style={[flex, { borderRadius: radius.scale(4) }]} more={i === 2 && extra > 0 ? extra : 0} />
  );

  if (shown.length === 1) {
    return <View style={[frame, { aspectRatio: shown[0].ratio }]}>{tile(0, styles.fill)}</View>;
  }
  if (shown.length === 2) {
    return (
      <View style={[frame, styles.grid, { aspectRatio: 2 }]}>
        {tile(0, styles.flex)}
        {tile(1, styles.flex)}
      </View>
    );
  }
  return (
    <View style={[frame, styles.grid, { aspectRatio: 3 / 2 }]}>
      {tile(0, { flex: 2 })}
      <View style={[styles.flex, styles.stack]}>
        {tile(1, styles.flex)}
        {tile(2, styles.flex)}
      </View>
    </View>
  );
}

function Photo({ uri, delay, style, more }: { uri: string; delay: number; style: StyleProp<ViewStyle>; more: number }) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const shown = useRef(new Animated.Value(0)).current;
  return (
    <View style={[styles.photo, { backgroundColor: colors.muted }, style]}>
      <Animated.Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        onLoad={() => Animated.timing(shown, { toValue: 1, duration: 320, delay, useNativeDriver: true }).start()}
        style={[StyleSheet.absoluteFill, { opacity: shown }]}
      />
      {more > 0 ? (
        <View style={[StyleSheet.absoluteFill, styles.more]}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.moreText, ff]}>+{more}</Text>
        </View>
      ) : null}
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

/** Built-in 24×24 line icons with a 1.8 stroke. */
export function TimelineIcon({ name, color, size = 18 }: { name: TimelineIconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const icons: Record<TimelineIconName, React.ReactNode> = {
    cart: (
      <>
        <Path d="M3 4h2.5l2.2 11h10.8l2-8H6.4" {...p} />
        <Circle cx={9.5} cy={19.5} r={1.4} {...p} />
        <Circle cx={17} cy={19.5} r={1.4} {...p} />
      </>
    ),
    package: (
      <>
        <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...p} />
        <Path d="M4 7.5l8 4.5 8-4.5M12 12v9M8 5.3l8 4.4" {...p} />
      </>
    ),
    truck: (
      <>
        <Path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" {...p} />
        <Circle cx={7} cy={17.5} r={1.8} {...p} />
        <Circle cx={17.5} cy={17.5} r={1.8} {...p} />
      </>
    ),
    home: (
      <>
        <Path d="M4 11l8-7 8 7v9H4z" {...p} />
        <Path d="M10 20v-5h4v5" {...p} />
      </>
    ),
    rocket: (
      <>
        <Path d="M14 4c3 0 6 3 6 6l-6.5 6.5-6-6z" {...p} />
        <Path d="M7.5 10.5L4 11l3-4h4M13.5 16.5L13 20l4-3v-4" {...p} />
        <Circle cx={15} cy={9} r={1.5} {...p} />
      </>
    ),
    bug: (
      <>
        <Rect x={7} y={8} width={10} height={12} rx={5} {...p} />
        <Path d="M9 8a3 3 0 0 1 6 0M12 12v8M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2" {...p} />
      </>
    ),
    star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" {...p} />,
    chat: <Path d="M4 5h16v11H9l-5 4z" {...p} />,
    tag: (
      <>
        <Path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" {...p} />
        <Circle cx={8} cy={8.5} r={1.3} {...p} />
      </>
    ),
    user: (
      <>
        <Circle cx={12} cy={8} r={4} {...p} />
        <Path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" {...p} />
      </>
    ),
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icons[name]}
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center' },
  line: { width: 2, flex: 1, minHeight: 8 },
  track: { position: 'absolute', width: 2, borderRadius: 1 },
  scrollContent: { paddingVertical: 12 },
  dot: { alignItems: 'center', justifyContent: 'center' },
  mini: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bodyWrap: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1 },
  // Wraps only when the time no longer fits beside the title (large text sizes): it drops below.
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  compactRow: { alignItems: 'center' },
  title: { flex: 1, fontWeight: '400', letterSpacing: -0.2 },
  time: { flexShrink: 1, fontSize: 12.5, fontWeight: '400', fontVariant: ['tabular-nums'] },
  desc: { fontSize: 14, fontWeight: '400', lineHeight: 20, marginTop: 3 },
  gallery: { marginTop: 12, width: '100%', overflow: 'hidden', borderWidth: 1 },
  grid: { flexDirection: 'row', gap: 3 },
  stack: { gap: 3 },
  flex: { flex: 1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photo: { overflow: 'hidden' },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)' },
  moreText: { color: '#ffffff', fontSize: 18, letterSpacing: -0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  tag: { paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 12 },
  link: { paddingVertical: 3, marginRight: 6 },
  linkText: { fontSize: 13.5 },
  content: { marginTop: 12 },
});
