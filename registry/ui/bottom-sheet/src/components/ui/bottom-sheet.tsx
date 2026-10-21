import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent as RNKeyboardEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { alpha, motion, useKit } from '@/lib/kit';

export type SnapPoint = number | `${number}%`;

export interface BottomSheetProps {
  open: boolean;
  /** Called when the sheet has been dragged, flung, tapped or back-buttoned closed. */
  onClose: () => void;
  /**
   * Heights the sheet rests at: points or percentages of the screen (sorted for you). Omit to size
   * the sheet to its content (capped below the status bar; taller content scrolls).
   */
  snapPoints?: SnapPoint[];
  /** Which snap point it opens at (default 0, the lowest). */
  initialSnap?: number;
  /** Controlled snap index: change it while open to move the sheet. */
  snapIndex?: number;
  onSnapChange?: (index: number) => void;
  /** Allow closing by dragging down / tapping the backdrop (default true). */
  dismissible?: boolean;
  /** Heading under the grabber. */
  title?: string;
  /** Muted line under the title. */
  subtitle?: string;
  /** Node at the trailing end of the title row (e.g. a Reset or Done link). */
  headerRight?: React.ReactNode;
  /** Round ✕ button in the header (default: shown with a title when dismissible and there's no headerRight). */
  showClose?: boolean;
  /** Show the grabber pill (default true). */
  handle?: boolean;
  /**
   * Wrap the body in a ScrollView. Below the top snap point a vertical drag on the body resizes
   * the sheet; at the top snap point the body scrolls, and pulling down from its top collapses it.
   */
  scrollable?: boolean;
  /** Let vertical drags on the body move the sheet (default: true when `scrollable`). Keep false if children contain their own ScrollView. */
  dragFromContent?: boolean;
  /** Pinned to the bottom of the visible sheet at every snap point (e.g. an Apply button). */
  footer?: React.ReactNode;
  /** Lift the sheet above the on-screen keyboard (default true). */
  avoidKeyboard?: boolean;
  /** Light impact on open and a selection tick on each snap (default true). */
  haptics?: boolean;
  /** Max backdrop dim at the highest snap point, 0–1 (default 1 = theme overlay). */
  backdropOpacity?: number;
  /** Extra bottom padding for the home indicator (default: platform safe inset). */
  bottomInset?: number;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

const DEFAULT_BOTTOM_INSET = Platform.select({ ios: 20, android: 12, default: 16 }) ?? 16;
/** Kit gentle, firmed up — glides between detents without bouncing past them. */
const SNAP_SPRING = { ...motion.gentle, damping: 29, stiffness: 220, mass: 0.9 };
/** Extra sheet below the screen edge, so pulling up past the top snap never shows a gap. */
const OVERDRAG = 120;
/** Never let the sheet's top go closer than this to the top of the screen. */
const TOP_GAP = 24;

function toPx(p: SnapPoint, screen: number) {
  return typeof p === 'number' ? p : (parseFloat(p) / 100) * screen;
}

/** Diminishing resistance past the limits (approaches `dimension`). */
function rubber(distance: number, dimension: number) {
  return (distance * dimension * 0.55) / (dimension + 0.55 * distance);
}

/**
 * Draggable bottom sheet with snap points. It follows your finger, rubber-bands past its limits,
 * settles on the snap point projected from your release velocity (a fling skips ahead or
 * dismisses) with a haptic tick, and the scrim dims in step with its height. Content can scroll
 * once the sheet is fully expanded, a footer stays pinned at every detent, and the keyboard lifts
 * it. PanResponder only.
 */
export function BottomSheet({
  open,
  onClose,
  snapPoints,
  initialSnap = 0,
  snapIndex,
  onSnapChange,
  dismissible = true,
  title,
  subtitle,
  headerRight,
  showClose,
  handle = true,
  scrollable = false,
  dragFromContent,
  footer,
  avoidKeyboard = true,
  haptics = true,
  backdropOpacity = 1,
  bottomInset = DEFAULT_BOTTOM_INSET,
  accessibilityLabel,
  children,
  style,
  contentStyle,
}: BottomSheetProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduceMotion = useReduceMotion();
  const { height: screen } = useWindowDimensions();

  // No snap points: one detent at the content's own height, measured before the sheet slides in.
  const auto = !snapPoints || snapPoints.length === 0;
  const [headerH, setHeaderH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  const measured = !auto || (headerH > 0 && contentH > 0);
  const autoH = Math.min(headerH + contentH + (footer ? 0 : bottomInset), screen - TOP_GAP);

  // Snap heights in px, ascending, capped below the status bar. Keyed by value, not array identity.
  const snapKey = auto ? `auto:${Math.round(autoH)}` : snapPoints.join('|');
  const heights = useMemo(
    () =>
      auto
        ? [Math.max(1, autoH)]
        : snapKey
            .split('|')
            .map((p) => Math.min(toPx(p.endsWith('%') ? (p as `${number}%`) : Number(p), screen), screen - TOP_GAP))
            .sort((a, b) => a - b),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapKey, screen],
  );
  const max = heights[heights.length - 1];
  // translateY for each snap (0 = top snap) and for closed.
  const stops = heights.map((h) => max - h);
  const closed = max + 24;
  const last = stops.length - 1;

  // Native driver: sheet position, keyboard lift, grabber stretch — separate values.
  const y = useRef(new Animated.Value(closed)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const grip = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(false); // at the top snap → body scrolls
  const [kbPad, setKbPad] = useState(0);
  const shown = useRef(false); // auto: slid in once measured
  const index = useRef(initialSnap);
  const scrollY = useRef(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);

  const bodyDrags = dragFromContent ?? scrollable;
  const live = useRef({ stops, closed, max, dismissible, onClose, onSnapChange, haptics, reduceMotion, scrollable, bodyDrags, expanded });
  live.current = { stops, closed, max, dismissible, onClose, onSnapChange, haptics, reduceMotion, scrollable, bodyDrags, expanded };

  const pos = useRef(closed); // last known resting / dragged position (JS mirror of `y`)
  const moving = useRef(false);

  const settle = (to: number, velocity = 0, after?: () => void) => {
    pos.current = to;
    moving.current = true;
    const anim = live.current.reduceMotion
      ? Animated.timing(y, { toValue: to, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      : Animated.spring(y, {
          toValue: to,
          velocity,
          useNativeDriver: true,
          ...SNAP_SPRING,
          overshootClamping: to === live.current.closed,
        });
    anim.start(({ finished }) => {
      moving.current = false;
      if (finished) after?.();
    });
  };

  const snapTo = (i: number, velocity = 0) => {
    const s = live.current.stops;
    const k = Math.max(0, Math.min(s.length - 1, i));
    if (index.current !== k) {
      live.current.onSnapChange?.(k);
      if (live.current.haptics) Haptics.selectionAsync().catch(() => {});
    }
    index.current = k;
    setExpanded(k === s.length - 1);
    settle(s[k], velocity);
  };

  const dismiss = (velocity = 0) => settle(live.current.closed, velocity, () => live.current.onClose());

  const enter = () => {
    shown.current = true;
    y.setValue(closed);
    lift.setValue(0);
    pos.current = closed;
    scrollY.current = 0;
    index.current = Math.max(0, Math.min(last, snapIndex ?? initialSnap));
    setExpanded(index.current === last);
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    settle(stops[index.current]);
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      shown.current = false;
      // Off-screen until there is a height to open to.
      y.setValue(screen);
      if (measured) enter();
    } else if (mounted) {
      // Exit is quicker than the entrance: a short ease-in, no spring.
      Keyboard.dismiss();
      Animated.timing(lift, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      Animated.timing(y, { toValue: closed, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() =>
        setMounted(false),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto height: slide in as soon as the content has been measured; afterwards follow its size.
  useEffect(() => {
    if (!open || !auto || !measured) return;
    if (!shown.current) enter();
    else if (!moving.current && index.current === 0) {
      pos.current = 0;
      y.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auto, measured, autoH]);

  // Controlled snap index.
  useEffect(() => {
    if (open && mounted && snapIndex !== undefined && snapIndex !== index.current) snapTo(snapIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapIndex]);

  // Keyboard: lift the sheet by however much the keyboard overlaps the screen (0 when the window
  // already resized for it), but never push its top past TOP_GAP — the rest becomes scroll padding.
  useEffect(() => {
    if (!mounted || !avoidKeyboard) return;
    const ios = Platform.OS === 'ios';
    const apply = (overlap: number, duration: number) => {
      const visible = live.current.max - pos.current;
      const room = Math.max(0, screen - TOP_GAP - visible);
      const up = Math.min(overlap, room);
      setKbPad(overlap - up);
      Animated.timing(lift, { toValue: -up, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e: RNKeyboardEvent) => {
      const duration = e.duration || 220;
      const kbTop = e.endCoordinates.screenY;
      if (!rootRef.current) return apply(e.endCoordinates.height, duration);
      rootRef.current.measureInWindow((_x, top, _w, h) => apply(Math.max(0, top + h - kbTop), duration));
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e: RNKeyboardEvent) => {
      setKbPad(0);
      Animated.timing(lift, { toValue: 0, duration: e?.duration || 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted, avoidKeyboard, screen, lift]);

  // Escape closes on web (the Modal handles Android back).
  useEffect(() => {
    if (!mounted || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current.dismissible) dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // One drag model for the grabber/header (claims any touch) and the body (captures vertical
  // drags only, so taps, horizontal scrollers and — at the top snap — scrolling still work).
  const pans = useRef(
    (() => {
      const origin = { start: 0 };
      const base = {
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          origin.start = pos.current;
          Animated.spring(grip, { toValue: 1, useNativeDriver: true, ...motion.snappy }).start();
          if (!moving.current) return;
          moving.current = false;
          y.stopAnimation((v) => {
            if (typeof v === 'number') origin.start = v;
          });
        },
        onPanResponderMove: (_: unknown, g: PanResponderGestureState) => {
          const { closed: bottom, stops: s, dismissible: canClose } = live.current;
          let next = origin.start + g.dy;
          if (next < 0) next = -rubber(-next, OVERDRAG);
          if (!canClose && next > s[0]) next = s[0] + rubber(next - s[0], OVERDRAG);
          pos.current = Math.min(next, bottom + 40);
          y.setValue(pos.current);
        },
        onPanResponderRelease: (_: unknown, g: PanResponderGestureState) => {
          Animated.spring(grip, { toValue: 0, useNativeDriver: true, ...motion.bouncy }).start();
          const { stops: s, closed: bottom, dismissible: canClose } = live.current;
          const current = origin.start + g.dy;
          const projected = current + g.vy * 220;
          const targets = canClose ? [...s, bottom] : s;
          let best = 0;
          targets.forEach((t, i) => {
            if (Math.abs(t - projected) < Math.abs(targets[best] - projected)) best = i;
          });
          if (canClose && (best === s.length || (g.vy > 1.6 && current > s[0]))) dismiss(g.vy);
          else snapTo(Math.min(best, s.length - 1), g.vy);
        },
        onPanResponderTerminate: () => {
          Animated.spring(grip, { toValue: 0, useNativeDriver: true, ...motion.bouncy }).start();
          snapTo(index.current);
        },
      };
      const grab = PanResponder.create({
        ...base,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
      });
      const body = PanResponder.create({
        ...base,
        onMoveShouldSetPanResponderCapture: (_, g) => {
          const l = live.current;
          if (!l.bodyDrags) return false;
          if (Math.abs(g.dy) < 8 || Math.abs(g.dy) < Math.abs(g.dx) * 1.3) return false;
          if (!l.scrollable || !l.expanded) return true;
          // Fully expanded: the list scrolls; pulling down from its very top collapses the sheet.
          return g.dy > 0 && scrollY.current <= 0;
        },
      });
      return { grab, body };
    })(),
  ).current;

  if (!mounted) return null;

  const lowest = Math.max(1, stops[0]);
  const dim = y.interpolate({
    inputRange: [0, lowest, closed],
    outputRange: [backdropOpacity, backdropOpacity * (heights.length > 1 ? 0.7 : 1), 0],
    extrapolate: 'clamp',
  });
  // Keeps the footer on the screen's bottom edge at every detent; it follows the sheet down when closing.
  const footerY = y.interpolate({ inputRange: [0, lowest], outputRange: [0, -lowest], extrapolate: 'clamp' });

  const surface = dark ? colors.popover : colors.card;
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const corner = radius.scale(28);
  const closeButton = showClose ?? (!!title && dismissible && !headerRight);
  const hasHeader = !!(title || subtitle || headerRight || closeButton);

  // Auto height always scrolls when its content is taller than the screen allows.
  const scrolls = scrollable || auto;
  const body = scrolls ? (
    <ScrollView
      style={styles.flex}
      onContentSizeChange={auto ? (_w, h) => setContentH(Math.ceil(h)) : undefined}
      contentContainerStyle={[styles.content, { paddingBottom: 12 + (footer ? footerH : 0) + kbPad }, contentStyle]}
      scrollEnabled={expanded}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={expanded && (!auto || headerH + contentH + bottomInset > screen - TOP_GAP)}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      onLayout={auto ? (e) => setContentH(Math.ceil(e.nativeEvent.layout.height)) : undefined}
      style={[styles.content, !auto && styles.flex, styles.contentEnd, footer ? { paddingBottom: footerH } : null, contentStyle]}
    >
      {children}
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => (dismissible ? dismiss() : snapTo(0))}
    >
      <View ref={rootRef} style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onPress={() => dismissible && dismiss()}
          />
        </Animated.View>
        <View style={styles.dock} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel ?? title}
            onAccessibilityEscape={() => dismissible && dismiss()}
            style={[
              styles.sheet,
              {
                height: max + OVERDRAG,
                opacity: measured ? 1 : 0,
                shadowOpacity: dark ? 0.5 : 0.12,
                transform: [{ translateY: Animated.add(y, lift) }],
              },
              style,
            ]}
          >
            <View
              style={[
                styles.surface,
                {
                  paddingBottom: OVERDRAG + (footer ? 0 : bottomInset),
                  backgroundColor: surface,
                  borderTopLeftRadius: corner,
                  borderTopRightRadius: corner,
                  borderColor: hairline,
                  shadowOpacity: dark ? 0.35 : 0.06,
                },
              ]}
            >
              <View {...pans.grab.panHandlers} style={styles.grab} onLayout={auto ? (e) => setHeaderH(Math.ceil(e.nativeEvent.layout.height)) : undefined}>
                {handle ? (
                  <View
                    style={styles.handleArea}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel="Sheet grabber"
                    accessibilityHint="Swipe up or down to resize"
                    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === 'increment') snapTo(index.current + 1);
                      else if (index.current === 0 && dismissible) dismiss();
                      else snapTo(index.current - 1);
                    }}
                  >
                    <Animated.View
                      style={[
                        styles.handle,
                        {
                          borderRadius: radius.capsule(5),
                          backgroundColor: alpha(colors.foreground, dark ? 0.26 : 0.18),
                          transform: [{ scaleX: grip.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
                        },
                      ]}
                    />
                  </View>
                ) : null}
                {hasHeader ? (
                  <View style={[styles.header, !handle && { paddingTop: 20 }]}>
                    <View style={styles.headerText}>
                      {title ? (
                        <Text accessibilityRole="header" style={[styles.title, ff, { color: colors.foreground }]} numberOfLines={1}>
                          {title}
                        </Text>
                      ) : null}
                      {subtitle ? (
                        <Text style={[styles.subtitle, ff, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {headerRight}
                    {closeButton ? (
                      <Pressable
                        onPress={() => (dismissible ? dismiss() : onClose())}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        style={({ pressed }) => [styles.close, { backgroundColor: alpha(colors.foreground, pressed ? 0.14 : 0.08) }]}
                      >
                        <View style={[styles.closeBar, { backgroundColor: colors.mutedForeground, transform: [{ rotate: '45deg' }] }]} />
                        <View style={[styles.closeBar, { backgroundColor: colors.mutedForeground, transform: [{ rotate: '-45deg' }] }]} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View {...pans.body.panHandlers} style={styles.flex}>
                {body}
              </View>
              {footer ? (
                <Animated.View
                  onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
                  style={[
                    styles.footer,
                    {
                      bottom: OVERDRAG,
                      paddingBottom: bottomInset,
                      backgroundColor: surface,
                      borderTopColor: hairline,
                      transform: [{ translateY: footerY }],
                    },
                  ]}
                >
                  {footer}
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
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
  flex: { flex: 1 },
  // No text selection while dragging with a mouse on web.
  grab: Platform.OS === 'web' ? ({ userSelect: 'none', cursor: 'grab' } as object) : {},
  dock: { position: 'absolute', left: 0, right: 0, bottom: -OVERDRAG, alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 640,
    shadowColor: '#000',
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  surface: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowRadius: 3,
    shadowOffset: { width: 0, height: -1 },
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 10, minHeight: 28 },
  handle: { width: 36, height: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '400', letterSpacing: -0.3 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  closeBar: { position: 'absolute', width: 12, height: 1.8, borderRadius: 1 },
  contentEnd: { paddingBottom: 6 },
  subtitle: { fontSize: 13.5, lineHeight: 18, fontWeight: '400' },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
