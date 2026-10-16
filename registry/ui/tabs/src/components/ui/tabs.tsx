import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

/**
 * Tabs are underline tabs with content panes. `pill` and `soft` are @deprecated and render as
 * `underline` — use SegmentedControl for a pill switch.
 */
export type TabsVariant = 'underline' | 'pill' | 'soft';

export interface TabItem {
  value: string;
  label: string;
  /** Icon node, or a function that receives the current state and text colour. */
  icon?: React.ReactNode | ((state: { active: boolean; color: string }) => React.ReactNode);
  /** Count or short label shown in a small bubble beside the label. */
  badge?: number | string;
  /** What to show below the bar while this tab is active. */
  content?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** @deprecated Only `underline` remains; `pill` and `soft` render as `underline`. */
  variant?: TabsVariant;
  /** 'sm' 36pt · 'md' 44pt tall. */
  size?: 'sm' | 'md';
  /**
   * `true`: tabs size to their labels and scroll. `false`: equal widths, never scroll.
   * Default: fill the width while they fit, scroll once they overflow.
   */
  scrollable?: boolean;
  /** Drag the content sideways to move between tabs (default true). */
  swipeable?: boolean;
  /** How content changes on a tap: slide the panes, cross-fade, or swap instantly. */
  transition?: 'slide' | 'fade' | 'none';
  /** Selection tick on change (default true). */
  haptics?: boolean;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  /** Style of each content pane. */
  contentStyle?: StyleProp<ViewStyle>;
}

type Box = { x: number; w: number };

// Liquid move: the edge in the direction of travel leads, the other one trails behind.
const LEAD = motion.snappy;
const TRAIL = { damping: 20, stiffness: 150, mass: 0.9 };
const UNDERLINE = 3;

/**
 * Underline tabs with swipeable content panes. The underline is measured to each label and moves
 * like liquid — leading edge first, trailing edge catching up — and while you drag the panes it
 * follows your finger, stretching toward the next label. Count badges pop, the bar scrolls (and
 * keeps the active tab centred) once the tabs overflow, and every change ticks a haptic.
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  scrollable,
  swipeable = true,
  transition = 'slide',
  haptics = true,
  accent,
  style,
  contentStyle,
}: TabsProps) {
  const { colors, radius, dark } = useKit();
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;
  const [inner, setInner] = useState(defaultValue ?? items.find((t) => !t.disabled)?.value);
  const active = value ?? inner;
  const index = Math.max(0, items.findIndex((t) => t.value === active));
  const hasContent = items.some((t) => t.content !== undefined);
  const mode: 'fill' | 'auto' | 'scroll' = scrollable === true ? 'scroll' : scrollable === false ? 'fill' : 'auto';

  // ---- measurements ----
  const tabs = useRef<Box[]>([]);
  const labels = useRef<Box[]>([]);
  const heights = useRef<number[]>([]);
  const [measured, setMeasured] = useState(0);
  const bump = () => setMeasured((n) => n + 1);
  const [paneW, setPaneW] = useState(0);
  const [barW, setBarW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const overflow = mode !== 'fill' && contentW > barW + 1;

  // ---- animated values ----
  // Underline edges + pane height: JS driver (left / width / height).
  const lx = useRef(new Animated.Value(0)).current;
  const rx = useRef(new Animated.Value(0)).current;
  const hv = useRef(new Animated.Value(0)).current;
  // Pager offset + fade: native driver, on the pager row.
  const pan = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [lineShown, setLineShown] = useState(false);
  const [heightShown, setHeightShown] = useState(false);
  const linePlaced = useRef(false);
  const pagerPlaced = useRef(false);
  const lastIndex = useRef(index);
  const release = useRef({ v: 0, dragged: false });
  const paging = useRef(false); // pager spring in flight (its JS value is stale until it ends)
  const [settle, setSettle] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const edgesOf = (i: number): [number, number] | null => {
    const t = tabs.current[i];
    const l = labels.current[i];
    return t && l ? [t.x + l.x, t.x + l.x + l.w] : null;
  };

  const select = (t: TabItem) => {
    if (t.disabled || t.value === active) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (value === undefined) setInner(t.value);
    onValueChange?.(t.value);
  };

  // Go to the active tab: underline, pager, height, bar scroll. Also runs after a drag ends
  // (settle) so a controlled parent that ignores the change still snaps back.
  useEffect(() => {
    const e = edgesOf(index);
    // First placement happens in the layout callbacks (placeFirst); from then on, animate.
    if (e && linePlaced.current) {
      if (reduce) {
        Animated.parallel([
          Animated.timing(lx, { toValue: e[0], duration: 160, useNativeDriver: false }),
          Animated.timing(rx, { toValue: e[1], duration: 160, useNativeDriver: false }),
        ]).start();
      } else {
        const right = index >= lastIndex.current;
        Animated.parallel([
          Animated.spring(lx, { toValue: e[0], useNativeDriver: false, ...(right ? TRAIL : LEAD) }),
          Animated.spring(rx, { toValue: e[1], useNativeDriver: false, ...(right ? LEAD : TRAIL) }),
        ]).start();
      }
    }

    const { v, dragged } = release.current;
    release.current = { v: 0, dragged: false };
    if (paneW) {
      const to = -index * paneW;
      if (!pagerPlaced.current || transition === 'none') {
        pan.setValue(to);
        pagerPlaced.current = true;
      } else if (transition === 'fade' && !dragged && lastIndex.current !== index) {
        pan.setValue(to);
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      } else if (reduce) {
        Animated.timing(pan, { toValue: to, duration: 180, useNativeDriver: true }).start();
      } else {
        paging.current = true;
        Animated.spring(pan, { toValue: to, velocity: v, useNativeDriver: true, ...motion.snappy, damping: 24 }).start(
          ({ finished }) => {
            if (finished) paging.current = false;
          }
        );
      }
    }

    const h = heights.current[index];
    if (h && heightShown) {
      if (reduce) {
        Animated.timing(hv, { toValue: h, duration: 180, useNativeDriver: false }).start();
      } else {
        Animated.spring(hv, { toValue: h, useNativeDriver: false, ...motion.gentle }).start();
      }
    }

    const t = tabs.current[index];
    if (overflow && t && lastIndex.current !== index) {
      const x = Math.max(0, Math.min(contentW - barW, t.x + t.w / 2 - barW / 2));
      scrollRef.current?.scrollTo({ x, animated: !reduce });
    }
    lastIndex.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, settle, paneW, measured]);

  // ---- swipe between panes ----
  const live = useRef({ index, items, paneW, swipe: false, select, edgesOf });
  live.current = { index, items, paneW, swipe: swipeable && hasContent && paneW > 0, select, edgesOf };
  const drag = useRef({ base: 0, off: 0 });
  const neighbour = (i: number, dir: 1 | -1) => {
    const t = live.current.items[i + dir];
    return t && !t.disabled ? i + dir : -1;
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => live.current.swipe && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const { index: i, paneW: W } = live.current;
          lx.stopAnimation();
          rx.stopAnimation();
          hv.stopAnimation();
          // Grabbed mid-flight: continue from where the pane is; at rest it sits exactly on its slot.
          drag.current.base = 0;
          if (paging.current) pan.stopAnimation((v) => (drag.current.base = Math.max(-W, Math.min(W, v + i * W))));
          paging.current = false;
          drag.current.off = drag.current.base;
        },
        onPanResponderMove: (_, g) => {
          const { index: i, paneW: W, edgesOf: edges } = live.current;
          let off = drag.current.base + g.dx;
          const prev = neighbour(i, -1);
          const next = neighbour(i, 1);
          if (off > 0 && prev < 0) off = rubber(off, W);
          if (off < 0 && next < 0) off = -rubber(-off, W);
          off = Math.max(-W, Math.min(W, off));
          drag.current.off = off;
          pan.setValue(-i * W + off);

          // Underline + height follow the finger toward the neighbour.
          const j = off < 0 ? next : prev;
          const a = edges(i);
          const b = j >= 0 ? edges(j) : null;
          if (!a || !b) return;
          const p = Math.min(1, Math.abs(off) / W);
          const lead = 1 - (1 - p) * (1 - p); // ease-out: the leading edge runs ahead
          const trail = p * p; // ease-in: the trailing edge hangs back
          const toRight = j > i;
          lx.setValue(a[0] + (b[0] - a[0]) * (toRight ? trail : lead));
          rx.setValue(a[1] + (b[1] - a[1]) * (toRight ? lead : trail));
          const ha = heights.current[i];
          const hb = heights.current[j];
          if (ha && hb) hv.setValue(ha + (hb - ha) * p);
        },
        onPanResponderRelease: (_, g) => finish(g.vx),
        onPanResponderTerminate: () => finish(0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const finish = (vx: number) => {
    const { index: i, paneW: W, items: list, select: pick } = live.current;
    const off = drag.current.off;
    let target = i;
    if (off < 0 && (off < -W * 0.22 || vx < -0.35)) target = neighbour(i, 1);
    else if (off > 0 && (off > W * 0.22 || vx > 0.35)) target = neighbour(i, -1);
    if (target < 0) target = i;
    release.current = { v: vx, dragged: true };
    if (target !== i) pick(list[target]);
    setSettle((n) => n + 1);
  };

  // ---- layout callbacks ----
  // The first underline position and pane height are set here, not in an effect, so the first
  // frame after measuring is already right.
  const placeFirst = () => {
    const i = live.current.index;
    const e = edgesOf(i);
    if (!linePlaced.current && e) {
      lx.setValue(e[0]);
      rx.setValue(e[1]);
      linePlaced.current = true;
      lastIndex.current = i;
      setLineShown(true);
    }
    const h = heights.current[i];
    if (!heightShown && h) {
      hv.setValue(h);
      setHeightShown(true);
    }
  };
  const onTabLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    const p = tabs.current[i];
    if (p && p.x === x && p.w === width) return;
    tabs.current[i] = { x, w: width };
    placeFirst();
    bump();
  };
  const onLabelLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    const p = labels.current[i];
    if (p && p.x === x && p.w === width) return;
    labels.current[i] = { x, w: width };
    placeFirst();
    bump();
  };
  const onPaneLayout = (i: number) => (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (heights.current[i] === h) return;
    heights.current[i] = h;
    placeFirst();
    bump();
  };

  const h = size === 'sm' ? 36 : 44;
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);

  const row = (
    <View accessibilityRole="tablist" style={[styles.row, mode !== 'scroll' && styles.grow]}>
      {items.map((t, i) => (
        <Tab
          key={t.value}
          item={t}
          active={i === index}
          mode={mode}
          height={h}
          fontSize={size === 'sm' ? 13.5 : 14.5}
          tint={tint}
          reduce={reduce}
          onPress={() => select(t)}
          onLayout={onTabLayout(i)}
          onLabelLayout={onLabelLayout(i)}
        />
      ))}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.underline,
          {
            left: lx,
            width: Animated.subtract(rx, lx),
            opacity: lineShown ? 1 : 0,
            backgroundColor: tint,
            borderTopLeftRadius: radius.capsule(UNDERLINE * 2),
            borderTopRightRadius: radius.capsule(UNDERLINE * 2),
          },
        ]}
      />
    </View>
  );

  // ---- panes ----
  let panes: React.ReactNode = null;
  if (hasContent) {
    const current = items[index];
    panes = (
      <Animated.View
        {...responder.panHandlers}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (Math.abs(w - paneW) > 0.5) setPaneW(w);
        }}
        style={[styles.viewport, heightShown && paneW ? { height: hv } : null]}
      >
        {paneW ? (
          <Animated.View
            style={[
              styles.pager,
              { width: paneW * items.length, opacity: fade, transform: [{ translateX: pan }] },
            ]}
          >
            {items.map((t, i) => (
              <View
                key={t.value}
                onLayout={onPaneLayout(i)}
                accessibilityElementsHidden={i !== index}
                importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
                style={[styles.pane, { width: paneW }, contentStyle]}
              >
                {t.content}
              </View>
            ))}
          </Animated.View>
        ) : (
          <View style={[styles.pane, contentStyle]}>{current?.content}</View>
        )}
      </Animated.View>
    );
  }

  return (
    <View style={style}>
      <View
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={overflow}
          bounces={overflow}
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={(w) => setContentW(w)}
          contentContainerStyle={styles.scroll}
        >
          {row}
        </ScrollView>
      </View>
      {panes}
    </View>
  );
}

interface TabProps {
  item: TabItem;
  active: boolean;
  mode: 'fill' | 'auto' | 'scroll';
  height: number;
  fontSize: number;
  tint: string;
  reduce: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onLabelLayout: (e: LayoutChangeEvent) => void;
}

function Tab({ item, active, mode, height, fontSize, tint, reduce, onPress, onLayout, onLabelLayout }: TabProps) {
  const { colors } = useKit();
  const a = useRef(new Animated.Value(active ? 1 : 0)).current; // label colour (JS)
  const press = useRef(new Animated.Value(1)).current; // squish (native)

  useEffect(() => {
    Animated.timing(a, { toValue: active ? 1 : 0, duration: reduce ? 0 : 180, useNativeDriver: false }).start();
  }, [active, a, reduce]);

  const pressTo = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, ...(to < 1 ? motion.snappy : motion.bouncy) }).start();

  const fg = active ? colors.foreground : colors.mutedForeground;
  const color = a.interpolate({ inputRange: [0, 1], outputRange: [colors.mutedForeground, colors.foreground] });
  const icon = typeof item.icon === 'function' ? item.icon({ active, color: fg }) : item.icon;
  const slop = height < 44 ? (44 - height) / 2 : 0;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.accessibilityLabel ?? (item.badge !== undefined ? `${item.label}, ${item.badge}` : item.label)}
      accessibilityState={{ selected: active, disabled: !!item.disabled }}
      disabled={item.disabled}
      onPress={onPress}
      onPressIn={() => pressTo(0.94)}
      onPressOut={() => pressTo(1)}
      onLayout={onLayout}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      style={[
        styles.tab,
        { height, paddingHorizontal: mode === 'fill' ? 8 : 14, opacity: item.disabled ? 0.4 : 1 },
        mode === 'fill' && styles.fill,
        mode === 'auto' && styles.grow,
      ]}
    >
      {/* Measured: the underline spans exactly this (icon + label). */}
      <Animated.View onLayout={onLabelLayout} style={[styles.labelRow, { transform: [{ scale: press }] }]}>
        {icon}
        <Animated.Text numberOfLines={1} style={[styles.label, { color, fontSize }]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
      {item.badge !== undefined ? <TabBadge value={item.badge} active={active} tint={tint} reduce={reduce} /> : null}
    </Pressable>
  );
}

/** Count bubble: accent when its tab is active, muted otherwise. Pops when the value changes. */
function TabBadge({ value, active, tint, reduce }: { value: number | string; active: boolean; tint: string; reduce: boolean }) {
  const { colors, radius, dark } = useKit();
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      return;
    }
    s.setValue(0.5);
    Animated.spring(s, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [value, reduce, s]);
  const text = typeof value === 'number' && value > 999 ? `${Math.floor(value / 1000)}k` : String(value);
  return (
    <Animated.View
      style={[
        styles.badge,
        {
          borderRadius: radius.capsule(18),
          backgroundColor: active ? tint : alpha(colors.mutedForeground, dark ? 0.22 : 0.14),
          transform: [{ scale: s }],
        },
      ]}
    >
      <Animated.Text style={[styles.badgeText, { color: active ? readableOn(tint) : colors.mutedForeground }]}>{text}</Animated.Text>
    </Animated.View>
  );
}

/** Resistance past the ends: moves less the further you pull, never more than ~half a pane. */
function rubber(d: number, w: number) {
  return (1 - 1 / ((d * 0.55) / Math.max(1, w) + 1)) * w * 0.5;
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
  scroll: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flexGrow: 1 },
  fill: { flex: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontWeight: '400', letterSpacing: -0.1 },
  underline: { position: 'absolute', bottom: 0, height: UNDERLINE },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '400', fontVariant: ['tabular-nums'] },
  viewport: { overflow: 'hidden' },
  pager: { flexDirection: 'row', alignItems: 'flex-start' },
  pane: { paddingTop: 16 },
});
