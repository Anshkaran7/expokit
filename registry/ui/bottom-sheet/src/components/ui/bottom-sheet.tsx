import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent as RNKeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { alpha, motion, useKit, useLayout } from '@/lib/kit';

export type SnapPoint = number | `${number}%`;

export interface BottomSheetProps {
  open: boolean;
  /** Called when the sheet has been dragged, flung, tapped or back-buttoned closed. */
  onClose: () => void;
  /**
   * Heights the sheet rests at: points or percentages of the screen (sorted for you). Omit to size
   * the sheet to its content (capped below the status bar; taller content scrolls).
   */
  snapPoints?: SnapPoint[] | undefined;

  /** Which snap point it opens at (default 0, the lowest). */
  initialSnap?: number | undefined;

  /** Controlled snap index: change it while open to move the sheet. */
  snapIndex?: number | undefined;

  onSnapChange?: ((index: number) => void) | undefined;

  /** Allow closing by dragging down / tapping the backdrop (default true). */
  dismissible?: boolean | undefined;

  /** Heading under the grabber. */
  title?: string | undefined;

  /** Muted line under the title. */
  subtitle?: string | undefined;

  /** Node at the trailing end of the title row (e.g. a Reset or Done link). */
  headerRight?: React.ReactNode | undefined;

  /** Round ✕ button in the header (default: shown with a title when dismissible and there's no headerRight). */
  showClose?: boolean | undefined;

  /** Screen-reader name of the close button (default: the kit's `labels.close`). */
  closeLabel?: string | undefined;

  /** Show the grabber pill (default true). */
  handle?: boolean | undefined;

  /**
   * Wrap the body in a ScrollView. Below the top snap point a vertical drag on the body resizes
   * the sheet; at the top snap point the body scrolls, and pulling down from its top collapses it.
   */
  scrollable?: boolean | undefined;

  /** Let vertical drags on the body move the sheet (default: true when `scrollable`). Keep false if children contain their own ScrollView. */
  dragFromContent?: boolean | undefined;

  /** Pinned to the bottom of the visible sheet at every snap point (e.g. an Apply button). */
  footer?: React.ReactNode | undefined;

  /** Lift the sheet above the on-screen keyboard (default true). */
  avoidKeyboard?: boolean | undefined;

  /** Light impact on open and a selection tick on each snap (default true). */
  haptics?: boolean | undefined;

  /** Max backdrop dim at the highest snap point, 0–1 (default 1 = theme overlay). */
  backdropOpacity?: number | undefined;

  /** Extra bottom padding for the home indicator (default: platform safe inset). */
  bottomInset?: number | undefined;

  accessibilityLabel?: string | undefined;

  children?: React.ReactNode | undefined;

  style?: StyleProp<ViewStyle> | undefined;

  contentStyle?: StyleProp<ViewStyle> | undefined;

}


const DEFAULT_BOTTOM_INSET = Platform.select({ ios: 20, android: 12, default: 16 }) ?? 16;
/** Kit gentle, firmed up — glides between detents without bouncing past them. */
const SNAP_SPRING = { ...motion.gentle, damping: 29, stiffness: 220, mass: 0.9 };
/** The sheet handles reduced motion itself, so Reanimated must not also skip its animations. */
const KEEP = ReduceMotion.Never;
const SNAPPY = { ...motion.snappy, reduceMotion: KEEP };
const BOUNCY = { ...motion.bouncy, reduceMotion: KEEP };
/** Extra sheet below the screen edge, so pulling up past the top snap never shows a gap. */
const OVERDRAG = 120;
/** Never let the sheet's top go closer than this to the top of the screen. */
const TOP_GAP = 24;

function toPx(p: SnapPoint, screen: number) {
  return typeof p === 'number' ? p : (parseFloat(p) / 100) * screen;
}

/** Diminishing resistance past the limits (approaches `dimension`). */
function rubber(distance: number, dimension: number) {
  'worklet';
  return (distance * dimension * 0.55) / (dimension + 0.55 * distance);
}

/**
 * Draggable bottom sheet with snap points. It follows your finger, rubber-bands past its limits,
 * settles on the snap point projected from your release velocity (a fling skips ahead or
 * dismisses) with a haptic tick, and the scrim dims in step with its height. Content can scroll
 * once the sheet is fully expanded, a footer stays pinned at every detent, and the keyboard lifts
 * it. Drags and snaps run on the UI thread (Reanimated + Gesture Handler), so a busy JS thread
 * never stalls them.
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
  closeLabel,
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
  const { colors, radius, dark, font, labels } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const reduceMotion = useReduceMotion();
  const { height: screen } = useWindowDimensions();
  // Full width on portrait phones; a centred, width-capped card on foldables, tablets and landscape.
  const { sheetWidth } = useLayout();

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
  const max = heights[heights.length - 1] ?? 0;
  // translateY for each snap (0 = top snap) and for closed.
  const stops = heights.map((h) => max - h);
  const closed = max + 24;
  const last = stops.length - 1;

  // UI-thread values: sheet position, keyboard lift, grabber stretch, the body's scroll offset.
  const y = useSharedValue(closed);
  const lift = useSharedValue(0);
  const grip = useSharedValue(0);
  const index = useSharedValue(initialSnap);
  const busy = useSharedValue(false); // a snap animation is running
  const scrollY = useSharedValue(0);
  // Per-drag: where the sheet was when the finger took it, which of sheet / list it moves, and the list offset to hold.
  const origin = useSharedValue(0);
  const scrolling = useSharedValue(false);
  const scrollHold = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(false); // at the top snap → body scrolls
  const [kbPad, setKbPad] = useState(0);
  const shown = useRef(false); // auto: slid in once measured
  const rootRef = useRef<ComponentRef<typeof View>>(null);

  const bodyDrags = dragFromContent ?? scrollable;

  const announce = (k: number) => {
    onSnapChange?.(k);
    if (haptics) Haptics.selectionAsync().catch(() => {});
  };

  const settle = (to: number, velocity = 0, close = false) => {
    'worklet';
    busy.set(true);
    const done = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      busy.set(false);
      if (close) scheduleOnRN(onClose);
    };
    y.set(
      reduceMotion
        ? withTiming(to, { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: KEEP }, done)
        : withSpring(to, { ...SNAP_SPRING, velocity, overshootClamping: to === closed, reduceMotion: KEEP }, done),
    );
  };

  const snapTo = (i: number, velocity = 0) => {
    'worklet';
    const k = Math.max(0, Math.min(last, i));
    if (index.get() !== k) scheduleOnRN(announce, k);
    index.set(k);
    scheduleOnRN(setExpanded, k === last);
    settle(stops[k] ?? closed, velocity);
  };

  const dismiss = (velocity = 0) => {
    'worklet';
    settle(closed, velocity, true);
  };

  const enter = () => {
    shown.current = true;
    const k = Math.max(0, Math.min(last, snapIndex ?? initialSnap));
    y.set(closed);
    lift.set(0);
    scrollY.set(0);
    index.set(k);
    scheduleOnRN(setExpanded, k === last);
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    settle(stops[k] ?? closed);
  };

  // Mount as soon as `open` turns on (render-time update, so no extra effect pass).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      shown.current = false;
      // Off-screen until there is a height to open to.
      y.set(screen);
      if (measured) enter();
    } else if (mounted) {
      // Exit is quicker than the entrance: a short ease-in, no spring.
      Keyboard.dismiss();
      lift.set(withTiming(0, { duration: 160, reduceMotion: KEEP }));
      y.set(
        withTiming(closed, { duration: 200, easing: Easing.in(Easing.quad), reduceMotion: KEEP }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto height: slide in as soon as the content has been measured; afterwards follow its size.
  useEffect(() => {
    if (!open || !auto || !measured) return;
    if (!shown.current) enter();
    else if (!busy.get() && index.get() === 0) y.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auto, measured, autoH]);

  // Controlled snap index.
  useEffect(() => {
    if (open && mounted && snapIndex !== undefined && snapIndex !== index.get()) snapTo(snapIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapIndex]);

  // Keyboard: lift the sheet by however much the keyboard overlaps the screen (0 when the window
  // already resized for it), but never push its top past TOP_GAP — the rest becomes scroll padding.
  useEffect(() => {
    if (!mounted || !avoidKeyboard) return;
    const ios = Platform.OS === 'ios';
    const apply = (overlap: number, duration: number) => {
      const visible = max - y.get();
      const room = Math.max(0, screen - TOP_GAP - visible);
      const up = Math.min(overlap, room);
      setKbPad(overlap - up);
      lift.set(withTiming(-up, { duration, easing: Easing.out(Easing.cubic), reduceMotion: KEEP }));
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e: RNKeyboardEvent) => {
      const duration = e.duration || 220;
      const kbTop = e.endCoordinates.screenY;
      if (!rootRef.current) return apply(e.endCoordinates.height, duration);
      rootRef.current.measureInWindow((_x, top, _w, h) => apply(Math.max(0, top + h - kbTop), duration));
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e: RNKeyboardEvent) => {
      setKbPad(0);
      lift.set(withTiming(0, { duration: e?.duration || 200, easing: Easing.out(Easing.cubic), reduceMotion: KEEP }));
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted, avoidKeyboard, screen, max, y, lift]);

  // Escape closes on web (the Modal handles Android back).
  useEffect(() => {
    if (!mounted || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, dismissible]);

  // One drag model, run on the UI thread, for the grabber/header and the body.
  // `dy` is how far the finger already travelled before the drag activated: the sheet picks up from here, no jump.
  const take = (dy: number) => {
    'worklet';
    cancelAnimation(y);
    busy.set(false);
    origin.set(y.get() - dy);
  };
  const follow = (dy: number) => {
    'worklet';
    let next = origin.get() + dy;
    if (next < 0) next = -rubber(-next, OVERDRAG);
    const top = stops[0] ?? 0;
    if (!dismissible && next > top) next = top + rubber(next - top, OVERDRAG);
    y.set(Math.min(next, closed + 40));
  };
  const release = (dy: number, vy: number) => {
    'worklet';
    const current = origin.get() + dy;
    // Project where the fling would carry the sheet (vy is points per second).
    const projected = current + vy * 0.22;
    const targets = dismissible ? [...stops, closed] : stops;
    let best = 0;
    targets.forEach((t, i) => {
      if (Math.abs(t - projected) < Math.abs((targets[best] ?? t) - projected)) best = i;
    });
    if (dismissible && (best === stops.length || (vy > 1600 && current > (stops[0] ?? 0)))) dismiss(vy);
    else snapTo(Math.min(best, last), vy);
  };

  // Grabber and header: any vertical drag moves the sheet; taps still reach the close button.
  const grab = usePanGesture({
    activeOffsetY: [-4, 4],
    onBegin: () => {
      grip.set(withSpring(1, SNAPPY));
    },
    onActivate: (e) => take(e.translationY),
    onUpdate: (e) => follow(e.translationY),
    onDeactivate: (e) => {
      if (e.canceled) snapTo(index.get());
      else release(e.translationY, e.velocityY);
    },
    onFinalize: () => {
      grip.set(withSpring(0, BOUNCY));
    },
  });

  // Body: vertical drags only, so taps and horizontal scrollers still work. At the top snap of a
  // scrollable sheet the list scrolls instead, and a pull down from its very top moves the sheet.
  const scrolls = scrollable || auto; // auto height scrolls when its content is taller than the screen allows
  const handoff = scrollable && expanded;
  const scrollGesture = useNativeGesture({ enabled: scrolls });
  const body = usePanGesture({
    enabled: bodyDrags,
    activeOffsetY: [-8, 8],
    failOffsetX: [-8, 8],
    simultaneousWith: scrollGesture,
    onActivate: (e) => {
      scrollHold.set(scrollY.get());
      scrolling.set(handoff && (e.translationY < 0 || scrollY.get() > 0));
      if (!scrolling.get()) take(e.translationY);
    },
    onUpdate: (e) => {
      if (scrolling.get()) {
        // Scrolled back to the top and still pulling down: hand the drag to the sheet.
        if (scrollY.get() > 0 || e.changeY <= 0) return;
        scrolling.set(false);
        scrollHold.set(0);
        origin.set(y.get() - e.translationY);
      }
      if (scrolls) scrollTo(scrollRef, 0, scrollHold.get(), false);
      follow(e.translationY);
    },
    onDeactivate: (e) => {
      if (scrolling.get()) return;
      if (e.canceled) snapTo(index.get());
      else release(e.translationY, e.velocityY);
    },
  });

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const lowest = Math.max(1, stops[0] ?? 0);
  const restDim = backdropOpacity * (heights.length > 1 ? 0.7 : 1);
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, lowest, closed], [backdropOpacity, restDim, 0], Extrapolation.CLAMP),
  }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() + lift.get() }] }));
  const gripStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 + 0.3 * grip.get() }] }));
  // Keeps the footer on the screen's bottom edge at every detent; it follows the sheet down when closing.
  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(y.get(), [0, lowest], [0, -lowest], Extrapolation.CLAMP) }],
  }));

  if (!mounted) return null;

  const surface = dark ? colors.popover : colors.card;
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const corner = radius.scale(28);
  const closeButton = showClose ?? (!!title && dismissible && !headerRight);
  const hasHeader = !!(title || subtitle || headerRight || closeButton);

  const content = scrolls ? (
    <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        onContentSizeChange={auto ? (_w, h) => setContentH(Math.ceil(h)) : undefined}
        contentContainerStyle={[styles.content, { paddingBottom: 12 + (footer ? footerH : 0) + kbPad }, contentStyle]}
        scrollEnabled={expanded}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={expanded && (!auto || headerH + contentH + bottomInset > screen - TOP_GAP)}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {children}
      </Animated.ScrollView>
    </GestureDetector>
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
      {/* A Modal is its own native root, so gestures inside it need their own handler root. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View ref={rootRef} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, dimStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={labels.closeSheet}
              onPress={() => dismissible && dismiss()}
            />
          </Animated.View>
          <View style={styles.dock} pointerEvents="box-none">
            <Animated.View
              accessibilityViewIsModal
              accessibilityLabel={accessibilityLabel ?? title}
              onAccessibilityEscape={() => dismissible && dismiss()}
              style={[styles.sheet, { height: max + OVERDRAG, width: sheetWidth, opacity: measured ? 1 : 0 }, sheetStyle, style]}
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
                    // Ambient + contact shadow as boxShadow: identical on iOS, Android and web.
                    boxShadow: `0px -8px 64px rgba(0,0,0,${dark ? 0.5 : 0.12}), 0px -1px 6px rgba(0,0,0,${dark ? 0.35 : 0.06})`,
                  },
                ]}
              >
                <GestureDetector gesture={grab}>
                  <View style={styles.grab} onLayout={auto ? (e) => setHeaderH(Math.ceil(e.nativeEvent.layout.height)) : undefined}>
                    {handle ? (
                      <View
                        style={styles.handleArea}
                        accessible
                        accessibilityRole="adjustable"
                        accessibilityLabel={labels.sheetGrabber}
                        accessibilityHint={labels.sheetResizeHint}
                        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                        onAccessibilityAction={(e) => {
                          const at = index.get();
                          if (e.nativeEvent.actionName === 'increment') snapTo(at + 1);
                          else if (at === 0 && dismissible) dismiss();
                          else snapTo(at - 1);
                        }}
                      >
                        <Animated.View
                          style={[
                            styles.handle,
                            { borderRadius: radius.capsule(5), backgroundColor: alpha(colors.foreground, dark ? 0.26 : 0.18) },
                            gripStyle,
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
                            accessibilityLabel={closeLabel ?? labels.close}
                            style={({ pressed }) => [styles.close, { backgroundColor: alpha(colors.foreground, pressed ? 0.14 : 0.08) }]}
                          >
                            <View style={[styles.closeBar, { backgroundColor: colors.mutedForeground, transform: [{ rotate: '45deg' }] }]} />
                            <View style={[styles.closeBar, { backgroundColor: colors.mutedForeground, transform: [{ rotate: '-45deg' }] }]} />
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </GestureDetector>
                <GestureDetector gesture={body}>
                  <View style={styles.flex}>{content}</View>
                </GestureDetector>
                {footer ? (
                  <Animated.View
                    onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
                    style={[
                      styles.footer,
                      { bottom: OVERDRAG, paddingBottom: bottomInset, backgroundColor: surface, borderTopColor: hairline },
                      footerStyle,
                    ]}
                  >
                    {footer}
                  </Animated.View>
                ) : null}
              </View>
            </Animated.View>
          </View>
        </View>
      </GestureHandlerRootView>
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
  sheet: { maxWidth: '100%' },
  surface: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
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
