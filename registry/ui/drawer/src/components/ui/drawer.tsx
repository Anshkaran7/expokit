import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type DrawerSide = 'left' | 'right';
/**
 * `overlay` — the panel slides over the screen, which dims (and gently scales with `scaleContent`).
 * `push` — the screen becomes a rounded card that shrinks to 0.92 and slides aside, revealing the
 * panel underneath (the modern mail-app look). Needs `children`; without them it renders as overlay.
 */
export type DrawerVariant = 'overlay' | 'push';

const INLINE_TOP = Platform.select({ ios: 14, android: 10, default: 8 }) ?? 8;
const INLINE_BOTTOM = Platform.select({ ios: 18, android: 12, default: 10 }) ?? 10;
const MODAL_TOP = Platform.select({ ios: 52, android: (StatusBar.currentHeight ?? 24) + 8, default: 16 }) ?? 16;
const MODAL_BOTTOM = Platform.select({ ios: 28, android: 16, default: 12 }) ?? 12;

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

/** Panel surface hidden past the screen edge, so overshoot and rubber-banding never show a gap. */
const EXTRA = 48;
/** Extra travel when closed so the panel's shadow is off-screen too. */
const SHADOW_PAD = 28;
const PUSH_SCALE = 0.92;
const PUSH_GAP = 14;
/** Kit snappy with a touch more damping: the panel lands with a hint of overshoot, not a wobble. */
const OPEN_SPRING = motion.snappy;
/** Closing is clamped, so it ends on the first crossing — exits feel faster than entrances. */
const CLOSE_SPRING = { ...motion.snappy, overshootClamping: true };

interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);
/** The colour behind the panel content, so status-dot rings blend in. */
const SurfaceContext = createContext<string | null>(null);

/** Open / close the nearest Drawer from anywhere inside it (header buttons, DrawerItems…). */
export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  return ctx ?? { open: false, setOpen: () => {}, toggle: () => {}, close: () => {} };
}

export interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The panel's content (usually DrawerItems). Scrolls between `header` and `footer`. */
  content: React.ReactNode;
  /** Pinned above the scrolling content (DrawerProfile or DrawerHeader). */
  header?: React.ReactNode;
  /** Pinned below the scrolling content (DrawerFooter, a DrawerItem or buttons). */
  footer?: React.ReactNode;
  /**
   * The screen the drawer belongs to. When given, the drawer lives inside this container (no
   * Modal): edge swipe and the 'push' variant work. Without children it opens in a Modal.
   */
  children?: React.ReactNode;
  side?: DrawerSide;
  /** Points or a percentage of the container width (default '80%', max 360). */
  width?: number | `${number}%`;
  /** 'overlay' slides over the screen · 'push' shrinks the screen into a card and slides it aside. */
  variant?: DrawerVariant;
  /** Swipe in from the screen edge to open (needs `children`, default true). */
  edgeSwipe?: boolean;
  /** Width of the edge-swipe zone (default 24). Taps in it still reach your screen. */
  edgeWidth?: number;
  /** Close on scrim tap and drag (default true). */
  dismissible?: boolean;
  /** Overlay variant: scale the screen behind to 0.96 with rounded corners while open (inline only, default true). */
  scaleContent?: boolean;
  /** Light haptic when the drawer opens; DrawerItems tick on press (default true). */
  haptics?: boolean;
  /** Space above the header (default: a small inline gap, or the status bar height in Modal mode). */
  topInset?: number;
  /** Space below the footer, e.g. useSafeAreaInsets().bottom (default: platform estimate). */
  bottomInset?: number;
  accessibilityLabel?: string;
  /** Root container style (inline mode). */
  style?: StyleProp<ViewStyle>;
  /** Panel style. */
  panelStyle?: StyleProp<ViewStyle>;
}

/**
 * A side navigation drawer that follows your finger. It springs in with the scrim fading
 * behind it, swipes open from the screen edge, drags closed from anywhere on the panel, settles
 * with your release velocity and rubber-bands past fully open. The 'push' variant shrinks the
 * screen into a rounded card and slides it aside, like modern mail apps.
 */
export function Drawer({
  open,
  defaultOpen = false,
  onOpenChange,
  content,
  header,
  footer,
  children,
  side = 'left',
  width = '80%',
  variant = 'overlay',
  edgeSwipe = true,
  edgeWidth = 24,
  dismissible = true,
  scaleContent = true,
  haptics = true,
  topInset,
  bottomInset,
  accessibilityLabel = 'Navigation drawer',
  style,
  panelStyle,
}: DrawerProps) {
  const { colors, dark, radius } = useKit();
  const reduceMotion = useReduceMotion();
  const win = useWindowDimensions();
  const inline = children !== undefined;
  const push = inline && variant === 'push';
  const [box, setBox] = useState(inline ? 0 : win.width);
  const containerW = inline ? box : win.width;
  const W = Math.max(
    0,
    Math.min(typeof width === 'number' ? width : (parseFloat(width) / 100) * containerW, 360, containerW - 40),
  );
  const dir = side === 'left' ? -1 : 1; // closed offset direction
  const top = topInset ?? (inline ? INLINE_TOP : MODAL_TOP);
  const bottom = bottomInset ?? (inline ? INLINE_BOTTOM : MODAL_BOTTOM);
  // The screen moves (push, or the overlay scale) → its corners round in on the JS driver.
  const movesScreen = inline && (push || (scaleContent && !reduceMotion));

  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const [mounted, setMounted] = useState(isOpen); // Modal mode only
  // Progress 0 (closed) → 1 (open), native-driven; every transform and opacity reads from it.
  const p = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  // Same progress on the JS driver, for the screen's corner radius and edge colour (separate view).
  const r = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

  const live = useRef({ open: isOpen, w: W, box, reduce: reduceMotion, haptics, movesScreen, edgeSwipe, edgeWidth, dismissible });
  live.current = { open: isOpen, w: W, box, reduce: reduceMotion, haptics, movesScreen, edgeSwipe, edgeWidth, dismissible };

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInner(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  const target = useRef<0 | 1>(isOpen ? 1 : 0);
  const settle = useCallback(
    (to: 0 | 1, velocity = 0) => {
      const was = target.current;
      target.current = to;
      if (to === 1 && !inline) setMounted(true);
      if (to === 1 && was === 0 && live.current.haptics) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const done = ({ finished }: { finished: boolean }) => {
        if (finished && to === 0 && !inline) setMounted(false);
      };
      if (live.current.reduce) {
        const cfg = { toValue: to, duration: 200, easing: Easing.out(Easing.cubic) };
        Animated.timing(p, { ...cfg, useNativeDriver: true }).start(done);
        if (live.current.movesScreen) Animated.timing(r, { ...cfg, useNativeDriver: false }).start();
        return;
      }
      const cfg = { toValue: to, velocity, ...(to === 1 ? OPEN_SPRING : CLOSE_SPRING) };
      Animated.spring(p, { ...cfg, useNativeDriver: true }).start(done);
      if (live.current.movesScreen) Animated.spring(r, { ...cfg, useNativeDriver: false }).start();
    },
    [p, r, inline],
  );

  useEffect(() => {
    if (isOpen && !inline) setMounted(true);
    // Skip when a drag release already started a velocity spring towards this state.
    if (target.current !== (isOpen ? 1 : 0)) settle(isOpen ? 1 : 0);
  }, [isOpen, settle, inline]);

  // Android back (inline mode; the Modal handles it otherwise) and Escape on web.
  useEffect(() => {
    if (!isOpen) return;
    const sub = inline && Platform.OS !== 'web'
      ? BackHandler.addEventListener('hardwareBackPress', () => {
          setOpenRef.current(false);
          return true;
        })
      : null;
    let off: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenRef.current(false);
      document.addEventListener('keydown', onKey);
      off = () => document.removeEventListener('keydown', onKey);
    }
    return () => {
      sub?.remove();
      off?.();
    };
  }, [isOpen, inline]);

  // Root position on the page, for the edge-swipe zone (gesture coordinates are page-based).
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const rootX = useRef(0);
  const measure = useCallback(() => {
    rootRef.current?.measure((_x, _y, _w, _h, pageX) => {
      if (typeof pageX === 'number') rootX.current = pageX;
    });
  }, []);

  // Two responders sharing one drag: `edge` captures a horizontal swipe that starts in the edge
  // zone (so taps there still reach the screen), `drag` captures horizontal drags on the open
  // panel / scrim (so vertical scrolling and taps inside the panel keep working).
  const start = useRef(0);
  const pans = useMemo(() => {
    const toward = (dx: number) => (side === 'left' ? dx : -dx); // + means "more open"
    const horizontal = (g: PanResponderGestureState) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    const base = {
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        p.stopAnimation((v) => (start.current = v));
        r.stopAnimation();
        if (!live.current.open && !inline) setMounted(true);
      },
      onPanResponderMove: (_: unknown, g: PanResponderGestureState) => {
        const w = live.current.w || 1;
        let next = start.current + toward(g.dx) / w;
        if (next > 1) next = 1 + rubber((next - 1) * w, EXTRA) / w;
        if (next < 0) next = 0;
        p.setValue(next);
        if (live.current.movesScreen) r.setValue(Math.min(1, next));
      },
      onPanResponderRelease: (_: unknown, g: PanResponderGestureState) => {
        const w = live.current.w || 1;
        const v = toward(g.vx); // px/ms, + means opening
        const projected = start.current + toward(g.dx) / w + (v * 200) / w;
        let to: 0 | 1 = projected > 0.5 ? 1 : 0;
        if (Math.abs(v) > 0.35) to = v > 0 ? 1 : 0; // a flick decides on its own
        settle(to, (v * 1000) / w);
        if ((to === 1) !== live.current.open) setOpenRef.current(to === 1);
      },
      onPanResponderTerminate: () => settle(live.current.open ? 1 : 0),
    };
    const edge = PanResponder.create({
      ...base,
      onMoveShouldSetPanResponderCapture: (_, g) => {
        const l = live.current;
        if (!l.edgeSwipe || l.open || !horizontal(g) || toward(g.dx) <= 0) return false;
        const x = g.x0 - rootX.current;
        return side === 'left' ? x <= l.edgeWidth : x >= l.box - l.edgeWidth;
      },
    });
    const drag = PanResponder.create({
      ...base,
      onMoveShouldSetPanResponderCapture: (_, g) => live.current.dismissible && live.current.open && horizontal(g),
    });
    return { edge, drag };
  }, [p, r, side, settle, inline]);

  const ctx = useMemo(
    () => ({ open: isOpen, setOpen, toggle: () => setOpen(!isOpen), close: () => setOpen(false) }),
    [isOpen, setOpen],
  );

  /* Interpolations (all native) ---------------------------------------------------------------- */
  const panelX = push
    ? p.interpolate({ inputRange: [0, 1], outputRange: [dir * W * 0.28, 0], extrapolate: 'clamp' })
    : p.interpolate({ inputRange: [0, 1, 2], outputRange: [dir * (W + EXTRA + SHADOW_PAD), 0, -dir * W], extrapolate: 'clamp' });
  const panelOpacity = push ? p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0.9, 1], extrapolate: 'clamp' }) : 1;
  const scrimOpacity = p.interpolate({ inputRange: [0, 1], outputRange: [0, push ? 0.5 : 1], extrapolate: 'clamp' });
  const S = reduceMotion ? 1 : PUSH_SCALE;
  const shift = W + PUSH_GAP - ((1 - S) * containerW) / 2;
  const screenTransform = push
    ? [
        { translateX: p.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -dir * shift, -dir * (shift + W)], extrapolate: 'clamp' }) },
        { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, S], extrapolate: 'clamp' }) },
      ]
    : movesScreen
      ? [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96], extrapolate: 'clamp' }) }]
      : undefined;
  // JS driver, on the inner screen view only.
  const screenRadius = r.interpolate({ inputRange: [0, 1], outputRange: [0, radius.scale(push ? 28 : 20)], extrapolate: 'clamp' });
  const screenEdge = r.interpolate({
    inputRange: [0, 1],
    outputRange: [alpha(colors.foreground, 0), alpha(colors.foreground, dark ? 0.12 : 0.08)],
    extrapolate: 'clamp',
  });

  /* Panel ---------------------------------------------------------------------------------------- */
  const surface = dark ? colors.popover : colors.card;
  const rootBg = push ? (dark ? colors.card : colors.muted) : dark ? colors.background : colors.foreground;
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const corner = push ? 0 : radius.scale(24);
  const round =
    side === 'left'
      ? { borderTopRightRadius: corner, borderBottomRightRadius: corner }
      : { borderTopLeftRadius: corner, borderBottomLeftRadius: corner };

  const panel = (
    <Animated.View
      {...(dismissible ? pans.drag.panHandlers : null)}
      accessibilityViewIsModal={isOpen}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}
      pointerEvents={push && !isOpen ? 'none' : 'auto'}
      style={[
        styles.panel,
        side === 'left' ? { left: -EXTRA } : { right: -EXTRA },
        { width: W + EXTRA, opacity: panelOpacity, transform: [{ translateX: panelX }] },
        panelStyle,
      ]}
    >
      <View
        style={[
          styles.flex,
          round,
          !push && {
            backgroundColor: surface,
            // Ambient + contact shadow as boxShadow: the same on iOS, Android and web.
            boxShadow: `${-dir * 8}px 0px 56px rgba(0,0,0,${dark ? 0.45 : 0.12}), ${-dir}px 0px 8px rgba(0,0,0,${dark ? 0.3 : 0.06})`,
          },
        ]}
      >
        <View
          style={[
            styles.flex,
            styles.clip,
            round,
            !push && { borderColor: hairline },
            !push && (side === 'left' ? styles.borderRight : styles.borderLeft),
          ]}
        >
          <SurfaceContext.Provider value={push ? rootBg : surface}>
            <View style={[styles.flex, side === 'left' ? { paddingLeft: EXTRA } : { paddingRight: EXTRA }]}>
              <View
                style={[
                  styles.chromeTop,
                  { paddingTop: top },
                  header ? [styles.chromeTopDivided, { borderBottomColor: hairline }] : null,
                ]}
              >
                {header ?? <DrawerHandle side={side} />}
              </View>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {content}
              </ScrollView>
              {footer ? (
                <View style={[styles.chromeBottom, { paddingBottom: bottom, borderTopColor: hairline }]}>{footer}</View>
              ) : (
                <View style={{ height: bottom }} />
              )}
            </View>
          </SurfaceContext.Provider>
        </View>
      </View>
    </Animated.View>
  );

  const scrim = (
    <Animated.View
      {...(dismissible ? pans.drag.panHandlers : null)}
      pointerEvents={isOpen ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: scrimOpacity }]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => dismissible && setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Close drawer"
      />
    </Animated.View>
  );

  if (!inline) {
    return (
      <DrawerContext.Provider value={ctx}>
        <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => setOpen(false)}>
          {scrim}
          {panel}
        </Modal>
      </DrawerContext.Provider>
    );
  }

  return (
    <DrawerContext.Provider value={ctx}>
      <View
        ref={rootRef}
        {...pans.edge.panHandlers}
        onTouchStart={measure}
        onLayout={(e: LayoutChangeEvent) => {
          setBox(e.nativeEvent.layout.width);
          measure();
        }}
        style={[styles.root, movesScreen && { backgroundColor: rootBg }, style]}
      >
        {push && box ? panel : null}
        <Animated.View
          importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}
          style={[
            StyleSheet.absoluteFill,
            screenTransform && { transform: screenTransform },
          ]}
        >
          <Animated.View
            style={[
              styles.flex,
              movesScreen && {
                backgroundColor: colors.background,
                borderRadius: screenRadius,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: screenEdge,
                overflow: 'hidden',
              },
              push && { boxShadow: `${dir * 6}px 8px 48px rgba(0,0,0,${dark ? 0.5 : 0.16})` },
            ]}
          >
            {children}
            {push ? scrim : null}
          </Animated.View>
        </Animated.View>
        {push ? null : scrim}
        {!push && box ? panel : null}
      </View>
    </DrawerContext.Provider>
  );
}

/** Top spacing used when you do not pass `header`. */
export function DrawerHandle(_: { side?: DrawerSide }) {
  return <View style={styles.handleSpacer} />;
}

export interface DrawerHeaderProps {
  title?: string;
  subtitle?: string;
  /** Optional leading node (avatar, logo). */
  leading?: React.ReactNode;
  /** Shows a close control on the trailing edge (default false). */
  showClose?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Title block with optional leading node and close button — drop into `header`. */
export function DrawerHeader({ title, subtitle, leading, showClose = false, onClose, children, style }: DrawerHeaderProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const drawerCtx = useContext(DrawerContext);
  const close = onClose ?? (() => drawerCtx?.close());
  const canClose = showClose || onClose !== undefined;
  return (
    <View style={[styles.header, style]}>
      {leading ? <View>{leading}</View> : null}
      <View style={styles.headerText}>
        {title ? (
          <Text accessibilityRole="header" style={[styles.headerTitle, ff, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.headerSub, ff, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
      {canClose ? (
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          hitSlop={8}
          style={({ pressed }) => [
            styles.closeBtn,
            {
              borderRadius: radius.capsule(34),
              backgroundColor: alpha(colors.foreground, pressed ? (dark ? 0.16 : 0.1) : dark ? 0.08 : 0.05),
            },
          ]}
        >
          <DrawerIcon name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------------
 * DrawerProfile
 * -----------------------------------------------------------------------------------------------*/

export type DrawerPresence = 'online' | 'away' | 'busy' | 'offline';

export interface DrawerProfileProps {
  name: string;
  /** Email or any second line (plan, role, workspace URL). */
  email?: string;
  /** Avatar image URL. Without it, initials sit on a soft solid tint derived from the name. */
  src?: string;
  /** Presence dot on the avatar. */
  status?: DrawerPresence;
  /** 'row' — avatar beside the text · 'stacked' — large avatar above (Gmail-style). */
  layout?: 'row' | 'stacked';
  /** Makes the block a button (e.g. an account or workspace switcher). */
  onPress?: () => void;
  /** Trailing node. Defaults to an up/down chevron when `onPress` is set; `null` hides it. */
  accessory?: React.ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Account block for the drawer header: initials (or image) avatar with presence, name and email. */
export function DrawerProfile({
  name,
  email,
  src,
  status,
  layout = 'row',
  onPress,
  accessory,
  accessibilityHint,
  style,
}: DrawerProfileProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const press = useRef(new Animated.Value(0)).current;
  const stacked = layout === 'stacked';
  const trailing =
    accessory !== undefined ? (
      accessory
    ) : onPress ? (
      <View
        style={[
          styles.profileChevron,
          { borderRadius: radius.capsule(30), backgroundColor: alpha(colors.foreground, dark ? 0.08 : 0.05) },
        ]}
      >
        <DrawerIcon name="chevrons" size={16} color={colors.mutedForeground} />
      </View>
    ) : null;
  const text = (
    <View style={styles.profileText}>
      <Text numberOfLines={1} style={[styles.profileName, ff, { color: colors.foreground }, stacked && styles.profileNameLg]}>
        {name}
      </Text>
      {email ? (
        <Text numberOfLines={1} style={[styles.profileEmail, ff, { color: colors.mutedForeground }]}>
          {email}
        </Text>
      ) : null}
    </View>
  );
  const spring = (to: number) => Animated.spring(press, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();
  return (
    <Animated.View style={[{ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] }, style]}>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        onPressIn={() => spring(1)}
        onPressOut={() => spring(0)}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={email ? `${name}, ${email}` : name}
        accessibilityHint={accessibilityHint ?? (onPress ? 'Switch account' : undefined)}
        style={({ pressed }) => [
          stacked ? styles.profileStacked : styles.profileRow,
          {
            borderRadius: radius.lg,
            backgroundColor: pressed && onPress ? alpha(colors.foreground, dark ? 0.08 : 0.05) : 'transparent',
          },
        ]}
      >
        {stacked ? (
          <>
            <View style={styles.profileTop}>
              <ProfileAvatar name={name} src={src} size={56} status={status} />
              {trailing}
            </View>
            {text}
          </>
        ) : (
          <>
            <ProfileAvatar name={name} src={src} size={44} status={status} />
            {text}
            {trailing}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ProfileAvatar({ name, src, size, status }: { name: string; src?: string; size: number; status?: DrawerPresence }) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const ring = useContext(SurfaceContext) ?? colors.card;
  const hue = nameColor(name);
  const ink = dark ? mix(hue, colors.foreground, 0.35) : mix(hue, colors.foreground, 0.3);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const dot = Math.round(size * 0.27);
  const presence: Record<DrawerPresence, string> = {
    online: colors.success,
    away: colors.warning,
    busy: colors.danger,
    offline: colors.mutedForeground,
  };
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <View
        style={[
          styles.clip,
          styles.center,
          {
            width: size,
            height: size,
            borderRadius: radius.capsule(size),
            backgroundColor: alpha(hue, dark ? 0.24 : 0.16),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: alpha(hue, dark ? 0.36 : 0.24),
          },
        ]}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[{ color: ink, fontSize: size * 0.36, fontWeight: '400', letterSpacing: -0.2 }, ff]}>{initials}</Text>
        {src ? <Image source={{ uri: src }} alt="" style={StyleSheet.absoluteFill} /> : null}
      </View>
      {status ? (
        <View
          style={[
            styles.presence,
            {
              width: dot + 4,
              height: dot + 4,
              borderRadius: radius.capsule(dot + 4),
              backgroundColor: presence[status],
              borderColor: ring,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Icons
 * -----------------------------------------------------------------------------------------------*/

const ICONS = {
  home: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  inbox: [
    'M22 12h-6l-2 3h-4l-2-3H2',
    'M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  ],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  file: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M8 13h8M8 17h5'],
  archive: ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4'],
  trash: ['M3 6h18', 'M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6', 'M10 11v6M14 11v6', 'M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2'],
  alert: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 8v4M12 16h.01'],
  calendar: ['M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', 'M16 2v4M8 2v4M3 10h18'],
  folder: ['M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z'],
  users: [
    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2',
    'M9 11a4 4 0 100-8 4 4 0 000 8z',
    'M23 21v-2a4 4 0 00-3-3.87',
    'M16 3.13a4 4 0 010 7.75',
  ],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  chart: ['M18 20V10M12 20V4M6 20v-6'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  target: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 16a4 4 0 100-8 4 4 0 000 8z'],
  search: ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'M21 21l-4.35-4.35'],
  music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 100-6 3 3 0 000 6z', 'M18 19a3 3 0 100-6 3 3 0 000 6z'],
  cloud: ['M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z'],
  settings: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  help: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  logout: ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  bell: ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z'],
  tag: ['M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z', 'M7 7h.01'],
  plus: ['M12 5v14M5 12h14'],
  menu: ['M3 6h18M3 12h18M3 18h18'],
  filter: ['M3 6h18M6 12h12M10 18h4'],
  chevrons: ['M7 9l5-5 5 5', 'M7 15l5 5 5-5'],
  chevronRight: ['M9 18l6-6-6-6'],
  x: ['M18 6L6 18M6 6l12 12'],
  check: ['M20 6L9 17l-5-5'],
} as const;

export type DrawerIconName = keyof typeof ICONS;

export interface DrawerIconProps {
  name: DrawerIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** The drawer's line icons (1.8 stroke), exported for menu buttons and headers. */
export function DrawerIcon({ name, size = 22, color, strokeWidth = 1.8 }: DrawerIconProps) {
  const { colors } = useKit();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {ICONS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color ?? colors.foreground}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/* -------------------------------------------------------------------------------------------------
 * DrawerItem
 * -----------------------------------------------------------------------------------------------*/

export interface DrawerItemProps {
  label: string;
  /** A built-in icon name or your own node (e.g. a label colour dot). */
  icon?: DrawerIconName | React.ReactNode;
  /** A count or short text on the right. 0 hides it. */
  badge?: number | string;
  /** 'neutral' plain muted count (accent ink when active) · 'accent' soft tinted pill · 'danger' solid pill for alerts. */
  badgeTone?: 'neutral' | 'accent' | 'danger';
  /** Highlights the row as the current destination with a tinted pill. */
  active?: boolean;
  /** 'danger' tints the icon and label (e.g. Log out). */
  tone?: 'default' | 'danger';
  onPress?: () => void;
  /** Close the surrounding Drawer after pressing (default true). */
  closeOnPress?: boolean;
  /** Active colour (default: theme accent). */
  accent?: string;
  /** Selection haptic on press (default true). */
  haptics?: boolean;
  /** Anything after the badge, e.g. a chevron or a Switch. */
  trailing?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ITEM_H = 46;

/** A drawer row: icon, label and count badge, with a spring-in accent pill when active. */
export function DrawerItem({
  label,
  icon,
  badge,
  badgeTone = 'neutral',
  active = false,
  tone = 'default',
  onPress,
  closeOnPress = true,
  accent,
  haptics = true,
  trailing,
  disabled,
  style,
}: DrawerItemProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const drawer = useContext(DrawerContext);
  const reduceMotion = useReduceMotion();
  const danger = tone === 'danger';
  const tint = danger ? colors.danger : (accent ?? colors.accent);
  const ink = dark ? tint : mix(tint, colors.foreground, 0.22);

  // Native-driven: pill presence, icon pop, badge pop, press scale — each on its own value.
  const on = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const badgePop = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  const firstBadge = useRef(true);

  useEffect(() => {
    Animated.spring(on, { toValue: active ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
    if (first.current) {
      first.current = false;
      return;
    }
    if (active && !reduceMotion) {
      pop.setValue(0.78);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (firstBadge.current) {
      firstBadge.current = false;
      return;
    }
    if (reduceMotion) return;
    badgePop.setValue(0.6);
    Animated.spring(badgePop, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge]);

  const showBadge = badge !== undefined && badge !== 0 && badge !== '';
  // Neutral counts are plain text (iOS / Material 3 style); 'accent' gets a soft tinted pill and
  // 'danger' a solid one. On the active row the count takes the row's ink colour.
  const badgeColors =
    badgeTone === 'danger'
      ? { bg: colors.danger, fg: colors.dangerForeground }
      : badgeTone === 'accent'
        ? { bg: alpha(tint, dark ? 0.24 : 0.14), fg: ink }
        : { bg: 'transparent', fg: active ? ink : colors.mutedForeground };
  const badgePill = badgeTone !== 'neutral';
  const iconColor = active ? tint : danger ? colors.danger : colors.mutedForeground;
  const labelColor = active ? ink : danger ? colors.danger : colors.foreground;
  const pill = radius.capsule(ITEM_H);
  const spring = (to: number) => Animated.spring(press, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();

  return (
    <Animated.View style={{ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] }}>
      <Pressable
        onPress={() => {
          if (haptics) Haptics.selectionAsync().catch(() => {});
          onPress?.();
          if (closeOnPress) drawer?.close();
        }}
        disabled={disabled}
        accessibilityRole="menuitem"
        accessibilityLabel={showBadge ? `${label}, ${badge}` : label}
        accessibilityState={{ selected: active, disabled: !!disabled }}
        onPressIn={() => spring(1)}
        onPressOut={() => spring(0)}
        style={({ pressed }) => [
          styles.item,
          {
            borderRadius: pill,
            opacity: disabled ? 0.45 : 1,
            backgroundColor: pressed && !active ? alpha(colors.foreground, dark ? 0.07 : 0.045) : 'transparent',
          },
          style,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: pill,
              backgroundColor: alpha(tint, dark ? 0.18 : 0.12),
              opacity: on,
              transform: [{ scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
        />
        {icon ? (
          <Animated.View style={[styles.itemIcon, { transform: [{ scale: pop }] }]}>
            {typeof icon === 'string' ? (
              <DrawerIcon name={icon as DrawerIconName} size={21} color={iconColor} strokeWidth={active ? 2.1 : 1.8} />
            ) : (
              icon
            )}
          </Animated.View>
        ) : null}
        <Text numberOfLines={1} style={[styles.itemLabel, ff, { color: labelColor }]}>
          {label}
        </Text>
        {showBadge ? (
          <Animated.View
            style={[
              styles.badge,
              !badgePill && styles.badgePlain,
              { borderRadius: radius.capsule(22), backgroundColor: badgeColors.bg, transform: [{ scale: badgePop }] },
            ]}
          >
            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.badgeText, ff, { color: badgeColors.fg }]}>
              {typeof badge === 'number' && badge > 99 ? '99+' : badge}
            </Text>
          </Animated.View>
        ) : null}
        {trailing}
      </Pressable>
    </Animated.View>
  );
}

export interface DrawerSectionProps {
  title: string;
  /** Node on the right of the heading, e.g. a small "+" button. */
  trailing?: React.ReactNode;
  /** Hairline above the heading, separating it from the group before (default true). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A quiet heading between groups of DrawerItems, with a hairline divider above it. */
export function DrawerSection({ title, trailing, divider = true, style }: DrawerSectionProps) {
  const { colors, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  return (
    <View style={style}>
      {divider ? <View style={[styles.divider, { backgroundColor: alpha(colors.foreground, dark ? 0.1 : 0.07) }]} /> : null}
      <View style={[styles.section, !divider && styles.sectionFlush]}>
        <Text accessibilityRole="header" style={[styles.sectionText, ff, { color: colors.mutedForeground }]}>
          {title}
        </Text>
        {trailing}
      </View>
    </View>
  );
}

export interface DrawerFooterProps {
  label: string;
  /** Muted second line, e.g. "12.4 GB of 15 GB used". */
  detail?: string;
  icon?: DrawerIconName | React.ReactNode;
  /** 0–1: draws a thin meter under the label (turns warning above 90%). */
  progress?: number;
  onPress?: () => void;
  /** Node on the right, e.g. an icon button. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A compact footer row — storage meter, app version, sync status — for the `footer` slot. */
export function DrawerFooter({ label, detail, icon, progress, onPress, trailing, style }: DrawerFooterProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const pct = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityValue={pct !== undefined ? { min: 0, max: 100, now: Math.round(pct * 100) } : undefined}
      style={({ pressed }) => [
        styles.footerRow,
        {
          borderRadius: radius.lg,
          backgroundColor: pressed && onPress ? alpha(colors.foreground, dark ? 0.07 : 0.045) : 'transparent',
        },
        style,
      ]}
    >
      {icon ? (
        <View style={styles.itemIcon}>
          {typeof icon === 'string' ? <DrawerIcon name={icon as DrawerIconName} size={20} color={colors.mutedForeground} /> : icon}
        </View>
      ) : null}
      <View style={styles.footerText}>
        <Text numberOfLines={1} style={[styles.footerLabel, ff, { color: colors.foreground }]}>
          {label}
        </Text>
        {pct !== undefined ? (
          <View style={[styles.meter, { borderRadius: radius.capsule(4), backgroundColor: alpha(colors.foreground, dark ? 0.1 : 0.07) }]}>
            <View
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                borderRadius: radius.capsule(4),
                backgroundColor: pct > 0.9 ? colors.warning : colors.accent,
              }}
            />
          </View>
        ) : null}
        {detail ? (
          <Text numberOfLines={1} style={[styles.footerDetail, ff, { color: colors.mutedForeground }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** Diminishing resistance past the limits (approaches `dimension`). */
function rubber(distance: number, dimension: number) {
  return (distance * dimension * 0.55) / (dimension + 0.55 * distance);
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

function parseHex(hex: string): [number, number, number] | null {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  if (!/^#[0-9a-fA-F]{6}/.test(full)) return null;
  const n = parseInt(full.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend `a` toward `b` by `t` (hex colours; returns `a` if either can't be parsed). */
function mix(a: string, b: string, t: number) {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** One solid, calm colour per name, so the same person always gets the same avatar tint. */
function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hsl(h, 0.55, 0.52);
}

const styles = StyleSheet.create({
  // 'clip' on web: an overflow:hidden box can still be scrolled by focus, which would shift the panel.
  root: Platform.OS === 'web' ? ({ flex: 1, overflow: 'clip' } as object) : { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', top: 0, bottom: 0 },
  borderRight: { borderRightWidth: StyleSheet.hairlineWidth },
  borderLeft: { borderLeftWidth: StyleSheet.hairlineWidth },
  chromeTop: { paddingHorizontal: 10, paddingBottom: 6 },
  chromeTopDivided: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10, marginBottom: 4 },
  chromeBottom: { paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  handleSpacer: { height: 8 },
  content: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8 },
  headerText: { flex: 1, gap: 2, minWidth: 0 },
  headerTitle: { fontSize: 20, lineHeight: 26, fontWeight: '400', letterSpacing: -0.4 },
  headerSub: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
  profileStacked: { gap: 12, padding: 8 },
  profileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  profileText: { flex: 1, minWidth: 0, gap: 1 },
  profileName: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.2 },
  profileNameLg: { fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  profileEmail: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  profileChevron: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  presence: { position: 'absolute', right: -2, bottom: -2, borderWidth: 2 },
  item: { minHeight: ITEM_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 14 },
  itemIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, fontSize: 15.5, fontWeight: '400', letterSpacing: -0.15 },
  badge: { minWidth: 22, minHeight: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgePlain: { paddingHorizontal: 2, minWidth: 0 },
  badgeText: { fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingLeft: 14,
    paddingRight: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  sectionFlush: { paddingTop: 10 },
  sectionText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0.1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14, marginTop: 10, marginBottom: 4 },
  footerRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 8 },
  footerText: { flex: 1, minWidth: 0, gap: 5 },
  footerLabel: { fontSize: 14, fontWeight: '400' },
  footerDetail: { fontSize: 12, fontWeight: '400' },
  meter: { height: 4, overflow: 'hidden' },
});
