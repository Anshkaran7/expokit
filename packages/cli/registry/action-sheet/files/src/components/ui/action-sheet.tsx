import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { alpha, motion, readableOn, useKit, useLayout } from '@/lib/kit';

/**
 * `inset` — iOS: grouped rounded cards floating above the home indicator, with a separate Cancel card (default).
 * `list` — Material: an edge-to-edge sheet with a drag handle and icon rows.
 * `grid` — share-sheet tiles.
 */
export type ActionSheetVariant = 'inset' | 'list' | 'grid';

const ICONS = {
  camera: ['M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z', 'M12 17a4 4 0 100-8 4 4 0 000 8z'],
  image: [
    'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
    'M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
    'M21 15l-5-5L5 21',
  ],
  trash: ['M3 6h18', 'M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6', 'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2', 'M10 11v6M14 11v6'],
  share: ['M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  link: ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
  copy: [
    'M11 9h9a2 2 0 012 2v9a2 2 0 01-2 2h-9a2 2 0 01-2-2v-9a2 2 0 012-2z',
    'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
  ],
  mail: ['M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z', 'M22 6l-10 7L2 6'],
  message: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
  download: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z'],
  user: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z'],
  'eye-off': [
    'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94',
    'M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19',
    'M14.12 14.12a3 3 0 11-4.24-4.24',
    'M1 1l22 22',
  ],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  reply: ['M9 17l-5-5 5-5', 'M20 18v-2a4 4 0 00-4-4H4'],
  forward: ['M15 17l5-5-5-5', 'M4 18v-2a4 4 0 014-4h12'],
  pin: [
    'M12 17v5',
    'M9 10.8a2 2 0 01-1.1 1.8l-1.8.9A2 2 0 005 15.2V17h14v-1.8a2 2 0 00-1.1-1.8l-1.8-.9a2 2 0 01-1.1-1.8V6h1a2 2 0 000-4H8a2 2 0 000 4h1z',
  ],
  archive: ['M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8', 'M2 3h20v5H2z', 'M10 12h4'],
  printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2', 'M6 14h12v8H6z'],
} as const;

export type ActionSheetIconName = keyof typeof ICONS;

export interface ActionSheetAction {
  label: string;
  /** A built-in icon name or your own node. */
  icon?: ActionSheetIconName | React.ReactNode;
  /** Danger colour; use for actions that delete or can't be undone. */
  destructive?: boolean;
  disabled?: boolean;
  /** Tile colour in the 'grid' variant. */
  color?: string;
  /** Return `false` to keep the sheet open. */
  onPress?: () => void | boolean;
}

export interface ActionSheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  message?: string;
  actions: ActionSheetAction[];
  /** Label of the separate cancel button; `null` hides it (default 'Cancel'). */
  cancelLabel?: string | null;
  /** Called on Cancel, backdrop tap, drag-to-dismiss, back and Escape. */
  onCancel?: () => void;
  /** 'inset' iOS grouped cards · 'list' Material edge-to-edge list · 'grid' share-sheet tiles. */
  variant?: ActionSheetVariant;
  /** Extra bottom padding for the home indicator. Defaults to a safe phone inset; pass `useSafeAreaInsets().bottom` to match the device. */
  bottomInset?: number;
  /** Colour of regular text-only actions and Cancel in 'inset' (default: theme accent). */
  accent?: string;
  /** Close on backdrop tap and drag-down (default true). When false the sheet only rubber-bands. */
  dismissible?: boolean;
  /** Light impact on open, selection tick on picking an action (default true). */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;
const DEFAULT_BOTTOM_INSET = Platform.select({ ios: 20, android: 12, default: 16 }) ?? 16;

/** iOS-style resistance: moves 1:1 at first, then ever more slowly towards `limit`. */
function rubber(x: number, limit: number) {
  return (1 - 1 / ((x * 0.55) / limit + 1)) * limit;
}

/**
 * A bottom action sheet. iOS look by default: grouped rounded cards with hairline separators,
 * an optional title and message, and a separate Cancel card. It springs up over a fading scrim
 * and follows your finger anywhere on the sheet — fling it or pull past a third of its height to
 * dismiss; pulling up rubber-bands. Rows highlight on touch and tick a selection haptic.
 * Also a Material edge-to-edge list and a share-sheet grid.
 */
export function ActionSheet({
  open,
  defaultOpen = false,
  onOpenChange,
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  onCancel,
  variant = 'inset',
  bottomInset = DEFAULT_BOTTOM_INSET,
  accent,
  dismissible = true,
  haptics = true,
  style,
}: ActionSheetProps) {
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const { height: winH } = useWindowDimensions();
  // Full width on portrait phones; a centred, width-capped card on foldables, tablets and landscape.
  const { sheetWidth } = useLayout();
  const reduceMotion = useReduceMotion();
  const tint = accent ?? colors.accent;
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  // Stays mounted while the exit animation runs; cleared in its completion callback.
  const keep = useRef(isOpen);
  const [, rerender] = useState(0);
  const mounted = isOpen || keep.current;

  // Both native-driven, on the sheet node: open progress (0 → 1) and finger offset.
  const t = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const sheetH = useRef(320);
  const flung = useRef(false);

  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  const dismiss = () => {
    if (!dismissible) return;
    onCancel?.();
    setOpen(false);
  };
  const live = useRef({ dismiss, dismissible });
  live.current = { dismiss, dismissible };

  useEffect(() => {
    if (isOpen) {
      keep.current = true;
      drag.setValue(0);
      flung.current = false;
      if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      (reduceMotion
        ? Animated.timing(t, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true })
        : Animated.spring(t, { toValue: 1, useNativeDriver: true, ...motion.gentle })
      ).start();
    } else {
      // Exit is quicker than the entry; after a fling it keeps the finger's momentum (ease-out).
      Animated.timing(t, {
        toValue: 0,
        duration: reduceMotion ? 160 : 240,
        easing: flung.current ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        keep.current = false;
        rerender((n) => n + 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Escape closes on web.
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && live.current.dismiss();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Drag anywhere on the sheet: a vertical move steals the touch from the row under the finger.
  const pan = useMemo(() => {
    const settle = (velocity = 0) =>
      Animated.spring(drag, { toValue: 0, velocity, useNativeDriver: true, ...motion.snappy }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderGrant: () => drag.stopAnimation(),
      onPanResponderMove: (_, g) => {
        const down = live.current.dismissible ? g.dy : rubber(g.dy, 90);
        drag.setValue(g.dy > 0 ? down : -rubber(-g.dy, 70));
      },
      onPanResponderRelease: (_, g) => {
        const far = g.dy > sheetH.current * 0.3;
        const flick = g.vy > 0.9 && g.dy > 12;
        if (live.current.dismissible && (far || flick)) {
          flung.current = true;
          live.current.dismiss();
        } else settle(g.vy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => settle(),
    });
  }, [drag]);

  const scrim = Animated.multiply(
    t,
    drag.interpolate({ inputRange: [0, Math.max(200, sheetH.current)], outputRange: [1, 0], extrapolate: 'clamp' }),
  );

  const pick = (a: ActionSheetAction) => {
    if (a.disabled) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (a.onPress?.() === false) return;
    setOpen(false);
  };

  const edge = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const separator = alpha(colors.foreground, dark ? 0.12 : 0.09);
  const highlight = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const dangerHighlight = alpha(colors.danger, dark ? 0.16 : 0.09);
  const icon = (a: ActionSheetAction, color: string, size: number) =>
    typeof a.icon === 'string' ? <SheetIcon name={a.icon as ActionSheetIconName} color={color} size={size} /> : a.icon;

  const list = variant === 'list';
  const header =
    title || message ? (
      <View style={list ? styles.headLeft : styles.head}>
        {title ? (
          <Text
            accessibilityRole="header"
            style={[list ? styles.titleLarge : styles.title, ff, { color: list ? colors.foreground : colors.mutedForeground }]}
          >
            {title}
          </Text>
        ) : null}
        {message ? (
          <Text style={[styles.message, ff, { color: colors.mutedForeground, textAlign: list ? 'left' : 'center' }]}>
            {message}
          </Text>
        ) : null}
      </View>
    ) : null;

  const corner = radius.scale(16);
  const cancelCard =
    cancelLabel !== null ? (
      <Card corner={corner} bg={colors.popover} edge={edge} dark={dark}>
        <Row onPress={dismiss} highlight={highlight} label={cancelLabel} style={styles.row}>
          <Text style={[styles.rowLabel, ff, styles.center, { color: variant === 'inset' ? tint : colors.foreground }]}>
            {cancelLabel}
          </Text>
        </Row>
      </Card>
    ) : null;

  let body: React.ReactNode;
  if (variant === 'grid') {
    body = (
      <>
        <Card corner={corner} bg={colors.popover} edge={edge} dark={dark}>
          {header}
          <View style={[styles.grid, header ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator } : null]}>
            {actions.map((a) => {
              const fill = a.destructive ? colors.danger : (a.color ?? alpha(colors.foreground, dark ? 0.1 : 0.06));
              const fg = a.destructive || a.color ? readableOn(fill) : colors.foreground;
              return (
                <Row
                  key={a.label}
                  onPress={() => pick(a)}
                  disabled={a.disabled}
                  label={a.label}
                  highlight={highlight}
                  corner={radius.scale(14)}
                  style={styles.tile}
                >
                  <View style={[styles.tileIcon, { backgroundColor: fill, borderRadius: radius.scale(16) }]}>
                    {icon(a, fg, 24)}
                  </View>
                  <Text maxFontSizeMultiplier={FONT_CAP} numberOfLines={2} style={[styles.tileLabel, ff, { color: a.destructive ? colors.danger : colors.foreground }]}>
                    {a.label}
                  </Text>
                </Row>
              );
            })}
          </View>
        </Card>
        {cancelCard}
      </>
    );
  } else if (list) {
    body = (
      <View
        style={[
          styles.listSheet,
          {
            backgroundColor: colors.popover,
            borderTopLeftRadius: radius.scale(28),
            borderTopRightRadius: radius.scale(28),
            borderColor: edge,
            boxShadow: `0px -6px 48px rgba(0,0,0,${dark ? 0.5 : 0.12})`,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: alpha(colors.foreground, dark ? 0.3 : 0.2), borderRadius: radius.capsule(4) }]} />
        {header}
        {actions.map((a) => {
          const color = a.destructive ? colors.danger : colors.foreground;
          return (
            <Row
              key={a.label}
              onPress={() => pick(a)}
              disabled={a.disabled}
              label={a.label}
              highlight={a.destructive ? dangerHighlight : highlight}
              corner={radius.md}
              style={styles.listRow}
            >
              {a.icon ? (
                <View style={styles.listIcon}>{icon(a, a.destructive ? colors.danger : colors.mutedForeground, 22)}</View>
              ) : null}
              <Text style={[styles.listLabel, ff, { color }]} numberOfLines={1}>
                {a.label}
              </Text>
            </Row>
          );
        })}
        {cancelLabel !== null ? (
          <>
            <View style={[styles.divider, { backgroundColor: separator }]} />
            <Row onPress={dismiss} highlight={highlight} corner={radius.md} label={cancelLabel} style={styles.listRow}>
              <Text style={[styles.listLabel, ff, styles.center, { color: colors.mutedForeground }]}>{cancelLabel}</Text>
            </Row>
          </>
        ) : null}
        <View style={{ height: 8 + bottomInset }} />
        {/* Skirt below the sheet so the spring's overshoot never shows a gap at the bottom edge. */}
        <View style={[styles.skirt, { backgroundColor: colors.popover }]} />
      </View>
    );
  } else {
    // iOS: text-only rows are centred in the accent colour; rows with icons read like a menu
    // (label leading, icon trailing, label colour).
    const withIcons = actions.some((a) => a.icon);
    body = (
      <>
        <Card corner={corner} bg={colors.popover} edge={edge} dark={dark}>
          {header}
          {actions.map((a, i) => {
            const color = a.destructive ? colors.danger : withIcons ? colors.foreground : tint;
            return (
              <Row
                key={a.label}
                onPress={() => pick(a)}
                disabled={a.disabled}
                label={a.label}
                highlight={highlight}
                style={[
                  styles.row,
                  withIcons && styles.rowMenu,
                  (i > 0 || header) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: separator },
                ]}
              >
                <Text style={[styles.rowLabel, ff, withIcons ? styles.rowLabelMenu : styles.center, { color }]} numberOfLines={1}>
                  {a.label}
                </Text>
                {withIcons ? <View style={styles.rowIcon}>{a.icon ? icon(a, color, 22) : null}</View> : null}
              </Row>
            );
          })}
        </Card>
        {cancelCard}
      </>
    );
  }

  const inset = !list;
  const grabber = inset ? (
    <View style={[styles.grabber, { backgroundColor: alpha('#ffffff', dark ? 0.3 : 0.75), borderRadius: radius.capsule(5) }]} />
  ) : null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          importantForAccessibility={cancelLabel !== null ? 'no' : 'auto'}
          accessible={cancelLabel === null}
        />
      </Animated.View>
      <View style={styles.host} pointerEvents="box-none">
        <Animated.View
          {...pan.panHandlers}
          accessibilityViewIsModal
          onLayout={(e) => {
            sheetH.current = Math.max(1, Math.round(e.nativeEvent.layout.height));
          }}
          style={[
            styles.sheet,
            { maxWidth: sheetWidth },
            inset && { paddingHorizontal: 8, paddingBottom: 8 + bottomInset },
            {
              opacity: reduceMotion ? t : 1,
              transform: [
                {
                  translateY: reduceMotion
                    ? drag
                    : Animated.add(t.interpolate({ inputRange: [0, 1], outputRange: [winH, 0] }), drag),
                },
              ],
            },
            style,
          ]}
        >
          {grabber}
          {body}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Rounded group with a hairline edge and two shadow layers (soft ambient + tight contact). */
function Card({
  corner,
  bg,
  edge,
  dark,
  children,
}: {
  corner: number;
  bg: string;
  edge: string;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ borderRadius: corner, backgroundColor: bg, boxShadow: `0px 10px 48px rgba(0,0,0,${dark ? 0.5 : 0.14})` }}>
      <View style={{ borderRadius: corner, backgroundColor: bg, boxShadow: `0px 1px 4px rgba(0,0,0,${dark ? 0.3 : 0.06})` }}>
        <View style={{ borderRadius: corner, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: edge }}>
          {children}
        </View>
      </View>
    </View>
  );
}

/** Pressable row whose highlight appears instantly on touch and fades out on release (native driver). */
function Row({
  onPress,
  disabled,
  label,
  highlight,
  corner = 0,
  style,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  highlight: string;
  corner?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const hl = useRef(new Animated.Value(0)).current;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        hl.stopAnimation();
        hl.setValue(1);
      }}
      onPressOut={() => Animated.timing(hl, { toValue: 0, duration: 280, useNativeDriver: true }).start()}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[style, disabled ? styles.disabled : null]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: highlight, borderRadius: corner, opacity: hl }]}
      />
      {children}
    </Pressable>
  );
}

function SheetIcon({ name, color, size }: { name: ActionSheetIconName; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {ICONS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={name === 'more' ? 3.2 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
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
  host: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', gap: 8 },
  head: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 14, alignItems: 'center', gap: 4 },
  headLeft: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, gap: 4 },
  title: { fontSize: 13.5, lineHeight: 18, fontWeight: '400', textAlign: 'center' },
  titleLarge: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.2 },
  message: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  rowMenu: { justifyContent: 'space-between', gap: 12 },
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { flexShrink: 1, fontSize: 18, lineHeight: 23, fontWeight: '400', letterSpacing: -0.3 },
  rowLabelMenu: { flex: 1, fontSize: 17, letterSpacing: -0.2 },
  center: { textAlign: 'center' },
  grabber: { alignSelf: 'center', width: 36, height: 5, marginTop: 2, marginBottom: 2 },
  handle: { alignSelf: 'center', width: 32, height: 4, marginTop: 10, marginBottom: 14 },
  listSheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 8,
  },
  listRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 16 },
  listIcon: { width: 24, alignItems: 'center' },
  listLabel: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 16 },
  skirt: { position: 'absolute', left: 0, right: 0, top: '100%', height: 160 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingVertical: 12 },
  tile: { width: '25%', alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingVertical: 8 },
  tileIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, lineHeight: 15, fontWeight: '400', textAlign: 'center' },
  disabled: { opacity: 0.38 },
});
