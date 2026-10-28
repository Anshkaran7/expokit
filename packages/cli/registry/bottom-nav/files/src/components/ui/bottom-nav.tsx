import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit } from '@/lib/kit';

/** The five looks. */
export type BottomNavLook = 'minimal' | 'floating' | 'pill' | 'center-fab' | 'indicator';

/**
 * @deprecated Retired looks. They still render, as the closest kept look:
 * `glass`, `neumorphic`, `dock`, `curved` → `floating`; `gradient`, `outline` → `pill`.
 */
export type BottomNavLegacyVariant = 'glass' | 'neumorphic' | 'gradient' | 'outline' | 'curved' | 'dock';

export type BottomNavVariant = BottomNavLook | BottomNavLegacyVariant;

const LEGACY: Record<BottomNavLegacyVariant, BottomNavLook> = {
  glass: 'floating',
  neumorphic: 'floating',
  dock: 'floating',
  curved: 'floating',
  gradient: 'pill',
  outline: 'pill',
};

export type BottomNavIconName =
  | 'home'
  | 'explore'
  | 'search'
  | 'projects'
  | 'saved'
  | 'profile'
  | 'inbox'
  | 'activity'
  | 'analytics'
  | 'message'
  | 'work'
  | 'browse'
  | 'library'
  | 'music'
  | 'create';

export interface BottomNavIconProps {
  color: string;
  size: number;
  active: boolean;
}

export interface BottomNavItem {
  key: string;
  label: string;
  /**
   * A built-in icon name, or a render function for your own icon. Render functions are called
   * twice (outline with `active: false`, filled with `active: true`) so the bar can morph between them.
   */
  icon: BottomNavIconName | ((props: BottomNavIconProps) => React.ReactNode);
  /** `true` shows a dot; a number shows a count (99+ above 99). */
  badge?: boolean | number;
  /**
   * A primary action (e.g. Create) instead of a destination: drawn as a solid accent button and never
   * becomes the active tab. Pressing it calls `onAction`.
   */
  action?: boolean;
  accessibilityLabel?: string;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (key: string) => void;
  /** Called with the item's key when an `action` item is pressed. */
  onAction?: (key: string) => void;
  variant?: BottomNavVariant;
  /** Active colour and the action button fill. */
  accent?: string;
  /** Opt-in two-colour gradient for the action button (default: none — a solid accent fill). */
  gradient?: [string, string];
  /** Show labels. `floating` and `pill` show only the active label; the others show all. */
  showLabels?: boolean;
  /** Extra bottom padding, e.g. `useSafeAreaInsets().bottom` when the bar sits at the screen edge. */
  bottomInset?: number;
  /** Show the iOS home-indicator line (default: on for `minimal`). */
  homeIndicator?: boolean;
  /** Selection tick on tab change, light impact on the action button (default true). */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

const ROW_H = 60;
const PAD_X = 6;
const PAD_TOP = 6;
const FAB = 58;
const ICON = 24;
const DOT = 5;
const PILL_H = 42;
/** Flex weight of the active item in the `pill` look (the others are 1). */
const PILL_GROW = 2.3;
// Liquid move: the edge in the direction of travel leads, the other one trails behind.
const LEAD = { damping: 31, stiffness: 320, mass: 0.7 };
const TRAIL = { damping: 24, stiffness: 150, mass: 0.9 };

/**
 * Bottom navigation in five looks — minimal dot, floating capsule, expanding pill, notched centre
 * FAB and top indicator with a spotlight. A liquid indicator stretches between tabs (leading edge
 * first, trailing edge catching up), icons morph from outline to filled with a spring and a lift,
 * badges pop, the solid accent action button glows softly, and every change ticks a haptic.
 */
export function BottomNav({
  items,
  value,
  defaultValue,
  onValueChange,
  onAction,
  variant = 'minimal',
  accent,
  gradient,
  showLabels = true,
  bottomInset = 0,
  homeIndicator,
  haptics = true,
  style,
}: BottomNavProps) {
  const { colors, radius, dark } = useKit();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduce = useReduceMotion();
  const look: BottomNavLook = variant in LEGACY ? LEGACY[variant as BottomNavLegacyVariant] : (variant as BottomNavLook);
  const tint = accent ?? colors.accent;
  const fabFrom = gradient?.[0] ?? tint;
  const fabTo = gradient?.[1] ?? fabFrom;

  const firstTab = items.findIndex((i) => !i.action);
  const [inner, setInner] = useState(defaultValue ?? items[firstTab]?.key);
  const active = value ?? inner;
  const found = items.findIndex((i) => i.key === active && !i.action);
  const index = found >= 0 ? found : firstTab;
  const actionIndex = items.findIndex((i) => i.action);

  // Measured: the row of slots (indicator geometry) and the whole bar (centre-fab notch).
  const [rowW, setRowW] = useState(0);
  const [bar, setBar] = useState({ w: 0, h: 0 });
  const n = Math.max(1, items.length);
  const slot = rowW / n;

  // Indicator edges (JS driver: they set left / width) and the slot offset (native: spotlight).
  const lead = useRef(new Animated.Value(0)).current;
  const trail = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const last = useRef(index);

  const edges = (i: number): [number, number] => {
    if (look === 'pill') {
      const unit = rowW / (n - 1 + PILL_GROW);
      return [i * unit + 2, (i + PILL_GROW) * unit - 2];
    }
    if (look === 'floating') return [i * slot + 4, (i + 1) * slot - 4];
    if (look === 'indicator') return [i * slot + slot * 0.24, (i + 1) * slot - slot * 0.24];
    const c = (i + 0.5) * slot;
    return [c - DOT / 2, c + DOT / 2];
  };

  useEffect(() => {
    if (!rowW || index < 0) return;
    const [L, R] = edges(index);
    const to = index * slot;
    if (!placed.current) {
      lead.setValue(L);
      trail.setValue(R);
      x.setValue(to);
      placed.current = true;
      last.current = index;
      return;
    }
    const right = index > last.current;
    last.current = index;
    if (reduce) {
      // Functional, not decorative: a short glide with no stretch.
      const t = { duration: 160, useNativeDriver: false };
      Animated.parallel([
        Animated.timing(lead, { toValue: L, ...t }),
        Animated.timing(trail, { toValue: R, ...t }),
        Animated.timing(x, { toValue: to, duration: 160, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(lead, { toValue: L, useNativeDriver: false, ...(right ? TRAIL : LEAD) }),
      Animated.spring(trail, { toValue: R, useNativeDriver: false, ...(right ? LEAD : TRAIL) }),
      Animated.spring(x, { toValue: to, useNativeDriver: true, ...motion.snappy }),
    ]).start();
    // edges() only reads rowW / look / n, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, rowW, look, n]);

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - rowW) > 0.5) setRowW(w);
  };
  const onBarLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - bar.w) > 0.5 || Math.abs(height - bar.h) > 0.5) setBar({ w: width, h: height });
  };

  const press = (item: BottomNavItem) => {
    if (item.action) {
      if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onAction?.(item.key);
      return;
    }
    if (item.key === active) return;
    if (haptics) Haptics.selectionAsync().catch(() => {});
    if (value === undefined) setInner(item.key);
    onValueChange?.(item.key);
  };

  // ---- palette ---------------------------------------------------------------------------------
  const hairline = alpha(colors.foreground, dark ? 0.1 : 0.06);
  const surface = look === 'floating' && dark ? colors.popover : colors.card;
  const idle = colors.mutedForeground;
  const showHome = homeIndicator ?? (look === 'minimal' || variant === 'gradient');
  const notched = look === 'center-fab' && actionIndex >= 0;
  // Transparent band above the drawn bar that holds the FAB, so it stays inside the bar's bounds
  // (Android only delivers touches inside them).
  const overhang = notched ? FAB / 2 : 0;
  const floatR = radius.capsule(ROW_H + PAD_TOP * 2);

  // ---- indicator (behind the icons) ------------------------------------------------------------
  let indicator: React.ReactNode = null;
  if (rowW && index >= 0) {
    const width = Animated.subtract(trail, lead);
    if (look === 'minimal' || look === 'center-fab') {
      indicator = (
        <Animated.View
          pointerEvents="none"
          style={[styles.abs, { top: ROW_H - 6, height: DOT, borderRadius: radius.capsule(DOT), backgroundColor: tint, left: lead, width }]}
        />
      );
    } else if (look === 'pill') {
      indicator = (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            {
              top: (ROW_H - PILL_H) / 2,
              height: PILL_H,
              left: lead,
              width,
              borderRadius: radius.capsule(PILL_H),
              backgroundColor: alpha(tint, dark ? 0.2 : 0.11),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: alpha(tint, dark ? 0.3 : 0.18),
            },
          ]}
        />
      );
    } else if (look === 'floating') {
      indicator = (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            {
              top: 4,
              bottom: 4,
              left: lead,
              width,
              borderRadius: Math.max(radius.scale(10), floatR - PAD_TOP - 4),
              backgroundColor: alpha(tint, dark ? 0.18 : 0.1),
            },
          ]}
        />
      );
    } else {
      const H = ROW_H + PAD_TOP;
      indicator = (
        <>
          {/* Spotlight: a cone of accent light falling from the bar. Native slide. */}
          <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: -PAD_TOP, width: slot, height: H, transform: [{ translateX: x }] }]}>
            <Svg width={slot} height={H}>
              <Defs>
                <LinearGradient id={`bnSpot${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tint} stopOpacity={dark ? 0.26 : 0.16} />
                  <Stop offset="1" stopColor={tint} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={`M${slot * 0.24} 0 H${slot * 0.76} L${slot * 0.98} ${H} H${slot * 0.02} Z`} fill={`url(#bnSpot${uid})`} />
            </Svg>
          </Animated.View>
          {/* The liquid line on the top edge. JS-driven edges, separate view. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.abs,
              {
                top: -PAD_TOP,
                height: 3,
                left: lead,
                width,
                borderBottomLeftRadius: radius.capsule(6),
                borderBottomRightRadius: radius.capsule(6),
                backgroundColor: tint,
              },
            ]}
          />
        </>
      );
    }
  }

  // ---- centre FAB in its notch (absolute, so its whole face stays inside the bar's bounds) -----
  let centre: React.ReactNode = null;
  if (notched && rowW) {
    const item = items[actionIndex];
    centre = (
      <CentreAction
        item={item}
        left={PAD_X + actionIndex * slot}
        width={slot}
        height={overhang + PAD_TOP + ROW_H}
        labelTop={overhang + PAD_TOP + 37}
        from={fabFrom}
        to={fabTo}
        labelColor={idle}
        showLabel={showLabels}
        onPress={() => press(item)}
      />
    );
  }

  const row = (
    <View style={styles.row} onLayout={onRowLayout}>
      {indicator}
      {items.map((item, i) => (
        <NavButton
          key={item.key}
          item={item}
          active={i === index && !item.action}
          look={look}
          tint={tint}
          idle={idle}
          surface={surface}
          fab={[fabFrom, fabTo]}
          showLabels={showLabels}
          reduce={reduce}
          onPress={() => press(item)}
        />
      ))}
    </View>
  );

  const home = showHome ? (
    <View pointerEvents="none" style={[styles.home, { borderRadius: radius.capsule(5), backgroundColor: alpha(colors.foreground, 0.85) }]} />
  ) : null;

  if (look === 'floating') {
    // Two shadows: a wide soft one on the outer view, a tight contact one on the bar itself
    // (boxShadow, so they look the same on iOS, Android and web).
    return (
      <View
        style={[
          styles.floatOuter,
          { marginBottom: 12 + bottomInset, borderRadius: floatR, backgroundColor: surface, boxShadow: `0px 12px 48px rgba(0,0,0,${dark ? 0.55 : 0.1})` },
          style,
        ]}
      >
        <View
          accessibilityRole="tablist"
          style={[
            styles.bar,
            styles.floatInner,
            {
              paddingBottom: showHome ? 16 : PAD_TOP,
              borderRadius: floatR,
              backgroundColor: surface,
              borderColor: hairline,
              boxShadow: `0px 1px 6px rgba(0,0,0,${dark ? 0.35 : 0.06})`,
            },
          ]}
        >
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={`bnSheen${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.foreground} stopOpacity={dark ? 0.06 : 0} />
                <Stop offset="1" stopColor={colors.foreground} stopOpacity={dark ? 0 : 0.025} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={floatR} fill={`url(#bnSheen${uid})`} />
          </Svg>
          {row}
          {home}
        </View>
      </View>
    );
  }

  const barStyle: ViewStyle[] = [
    styles.bar,
    { paddingTop: PAD_TOP + overhang, paddingBottom: bottomInset + (showHome ? 18 : PAD_TOP) },
  ];
  if (notched) barStyle.push(styles.visible);
  else barStyle.push({ backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline });
  if (look === 'indicator') barStyle.push(styles.clip);

  return (
    <View accessibilityRole="tablist" onLayout={notched ? onBarLayout : undefined} style={[...barStyle, style]}>
      {notched && bar.w && rowW ? (
        <BarShape
          d={notchPath(bar.w, bar.h, PAD_X + (actionIndex + 0.5) * slot, FAB / 2 + 7, FAB / 2 + 4, overhang)}
          fill={colors.card}
          stroke={hairline}
        />
      ) : null}
      {row}
      {centre}
      {home}
    </View>
  );
}

interface NavButtonProps {
  item: BottomNavItem;
  active: boolean;
  look: BottomNavLook;
  tint: string;
  idle: string;
  surface: string;
  fab: [string, string];
  showLabels: boolean;
  reduce: boolean;
  onPress: () => void;
}

function NavButton({ item, active, look, tint, idle, surface, fab, showLabels, reduce, onPress }: NavButtonProps) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const press = useRef(new Animated.Value(1)).current; // press squish (native)
  const pop = useRef(new Animated.Value(active ? 1 : 0)).current; // active state (native)
  const grow = useRef(new Animated.Value(active ? 1 : 0)).current; // pill width (JS — layout)
  const [labelW, setLabelW] = useState(0);

  useEffect(() => {
    if (reduce) {
      Animated.timing(pop, { toValue: active ? 1 : 0, duration: 140, useNativeDriver: true }).start();
      if (look === 'pill') Animated.timing(grow, { toValue: active ? 1 : 0, duration: 140, useNativeDriver: false }).start();
      return;
    }
    Animated.spring(pop, { toValue: active ? 1 : 0, useNativeDriver: true, ...(active ? motion.bouncy : motion.snappy) }).start();
    if (look === 'pill') Animated.spring(grow, { toValue: active ? 1 : 0, useNativeDriver: false, ...LEAD }).start();
  }, [active, look, reduce, pop, grow]);

  const pressTo = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, ...(v < 1 ? motion.snappy : motion.bouncy) }).start();
  const a11y = item.accessibilityLabel ?? (typeof item.badge === 'number' ? `${item.label}, ${item.badge} new` : item.label);
  const pressable = {
    onPress,
    onPressIn: () => pressTo(0.88),
    onPressOut: () => pressTo(1),
    accessibilityLabel: a11y,
  };

  // ---- primary action ----
  if (item.action) {
    // Centre-fab draws its FAB over the notch (see CentreAction); keep the slot.
    if (look === 'center-fab') return <View style={styles.slot} />;
    const size = look === 'floating' ? 46 : 40;
    return (
      <Pressable {...pressable} accessibilityRole="button" hitSlop={4} style={styles.slot}>
        <Animated.View style={{ transform: [{ scale: press }] }}>
          <FabFace size={size} from={fab[0]} to={fab[1]} glow={false} pressed={press}>
            {renderIcon(item.icon, { color: readableOn(fab[0]), size: 22, active: true })}
          </FabFace>
        </Animated.View>
      </Pressable>
    );
  }

  const badge = item.badge ? <Badge value={item.badge} ring={surface} reduce={reduce} /> : null;
  const icon = <MorphIcon icon={item.icon} size={ICON} idle={idle} active={tint} pop={pop} />;
  const fadeIn = pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const tab = { ...pressable, accessibilityRole: 'tab' as const, accessibilityState: { selected: active } };

  // ---- pill: the active tab widens into a capsule and its label slides in ----
  if (look === 'pill') {
    return (
      <Animated.View style={{ flex: grow.interpolate({ inputRange: [0, 1], outputRange: [1, PILL_GROW] }) }}>
        <Pressable {...tab} style={styles.slot}>
          <Animated.View style={[styles.pillRow, { transform: [{ scale: press }] }]}>
            <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
              {icon}
              {badge}
            </Animated.View>
            {showLabels ? (
              <Animated.View
                style={{
                  width: grow.interpolate({ inputRange: [0, 1], outputRange: [0, labelW + 1] }),
                  marginLeft: grow.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }),
                  overflow: 'hidden',
                }}
              >
                <Animated.Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={FONT_CAP}
                  style={[
                    styles.pillLabel,
                    ff,
                    {
                      width: labelW + 1,
                      color: tint,
                      opacity: fadeIn,
                      transform: [{ translateX: pop.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                    },
                  ]}
                >
                  {item.label}
                </Animated.Text>
              </Animated.View>
            ) : null}
          </Animated.View>
          {/* Invisible measurer: the label's natural width, so it never ellipsizes while growing. */}
          {showLabels ? (
            <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.pillLabel, styles.selfStart, ff]} onLayout={(e) => setLabelW(Math.ceil(e.nativeEvent.layout.width))}>
                {item.label}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }

  // ---- floating: icon lifts and the active label rises in beneath it ----
  if (look === 'floating') {
    return (
      <Pressable {...tab} style={styles.slot}>
        <Animated.View style={{ transform: [{ scale: press }] }}>
          <Animated.View
            style={{
              transform: [
                { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, showLabels ? -8 : -1] }) },
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, showLabels ? 1 : 1.08] }) },
              ],
            }}
          >
            {icon}
            {badge}
          </Animated.View>
        </Animated.View>
        {showLabels ? (
          <Animated.Text
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_CAP}
            style={[
              styles.label,
              styles.floatLabel,
              ff,
              { color: tint, opacity: fadeIn, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
            ]}
          >
            {item.label}
          </Animated.Text>
        ) : null}
      </Pressable>
    );
  }

  // ---- minimal / indicator / centre-fab: icon over label ----
  return (
    <Pressable {...tab} style={styles.slot}>
      <Animated.View style={[styles.center, { transform: [{ scale: press }] }]}>
        <Animated.View
          style={{
            transform: [
              { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          }}
        >
          {icon}
          {badge}
        </Animated.View>
        {showLabels ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.label, ff, { color: active ? tint : idle }]}>
            {item.label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Outline and filled icons stacked: the outline fades out while the fill springs up from inside. */
function MorphIcon({
  icon,
  size,
  idle,
  active,
  pop,
}: {
  icon: BottomNavItem['icon'];
  size: number;
  idle: string;
  active: string;
  pop: Animated.Value;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
        {renderIcon(icon, { color: idle, size, active: false })}
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
          },
        ]}
      >
        {renderIcon(icon, { color: active, size, active: true })}
      </Animated.View>
    </View>
  );
}

function CentreAction({
  item,
  left,
  width,
  height,
  labelTop,
  from,
  to,
  labelColor,
  showLabel,
  onPress,
}: {
  item: BottomNavItem;
  left: number;
  width: number;
  height: number;
  labelTop: number;
  from: string;
  to: string;
  labelColor: string;
  showLabel: boolean;
  onPress: () => void;
}) {
  const { font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const press = useRef(new Animated.Value(1)).current;
  const pressTo = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, ...(v < 1 ? motion.snappy : motion.bouncy) }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      onPress={onPress}
      onPressIn={() => pressTo(0.9)}
      onPressOut={() => pressTo(1)}
      style={[styles.abs, styles.centreCol, { left, top: 0, width, height }]}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <FabFace size={FAB} from={from} to={to} glow pressed={press}>
          {renderIcon(item.icon, { color: readableOn(from), size: 28, active: true })}
        </FabFace>
      </Animated.View>
      {showLabel ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.label, styles.abs, ff, { top: labelTop, color: labelColor }]}>
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Action button: a solid `from` fill (or a `from` → `to` diagonal when an opt-in gradient is given),
 * a faint top sheen, a hairline rim and an optional same-colour glow.
 */
function FabFace({
  size,
  from,
  to,
  glow,
  pressed,
  children,
}: {
  size: number;
  from: string;
  to: string;
  glow: boolean;
  pressed: Animated.Value;
  children: React.ReactNode;
}) {
  const { radius } = useKit();
  const id = 'bnFab' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = radius.capsule(size);
  const G = size * 2;
  const twoTone = to.toLowerCase() !== from.toLowerCase();
  return (
    <View style={{ width: size, height: size }}>
      {glow ? (
        // Soft accent glow (works on Android too, where coloured shadows don't). Brightens on press.
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            {
              left: -size / 2,
              top: -size / 2 + size * 0.16,
              width: G,
              height: G,
              opacity: pressed.interpolate({ inputRange: [0.9, 1], outputRange: [1, 0.7], extrapolate: 'clamp' }),
            },
          ]}
        >
          <Svg width={G} height={G}>
            <Defs>
              <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={from} stopOpacity={0.4} />
                <Stop offset="0.5" stopColor={from} stopOpacity={0.12} />
                <Stop offset="1" stopColor={from} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={size} cy={size} r={size} fill={`url(#${id}g)`} />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: from, boxShadow: `0px 6px 24px ${alpha(from, 0.4)}` }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            {twoTone ? (
              <LinearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={from} />
                <Stop offset="1" stopColor={to} />
              </LinearGradient>
            ) : null}
            <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.12} />
              <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {twoTone ? <Rect width={size} height={size} rx={r} fill={`url(#${id}f)`} /> : null}
          <Rect width={size} height={size} rx={r} fill={`url(#${id}s)`} />
          <Rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={Math.max(0, r - 0.5)} fill="none" stroke="#ffffff" strokeOpacity={0.22} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
      </View>
    </View>
  );
}

/** Dot or count. Pops in with a spring when it appears or its value changes. */
function Badge({ value, ring, reduce }: { value: true | number; ring: string; reduce: boolean }) {
  const { colors, radius, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const s = useRef(new Animated.Value(reduce ? 1 : 0.3)).current;
  useEffect(() => {
    if (reduce) {
      s.setValue(1);
      return;
    }
    s.setValue(0.3);
    Animated.spring(s, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
  }, [value, reduce, s]);
  const dot = value === true;
  const text = typeof value === 'number' ? (value > 99 ? '99+' : String(value)) : '';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.badge,
        dot ? [styles.badgeDot, { borderRadius: radius.capsule(10) }] : [styles.badgeCount, { borderRadius: radius.capsule(19) }],
        {
          backgroundColor: colors.danger,
          borderColor: ring,
          opacity: s.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ scale: s }],
        },
      ]}
    >
      {!dot && <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.badgeText, ff, { color: colors.dangerForeground }]}>{text}</Text>}
    </Animated.View>
  );
}

/** Bar outline with a smooth dip of radius `r` and depth `depth` centred on `cx`, top edge at `y`. */
function notchPath(w: number, h: number, cx: number, r: number, depth: number, y: number) {
  const x1 = cx - r - 14;
  const x2 = cx + r + 14;
  return [
    `M0 ${y}`,
    `H${x1}`,
    `C${x1 + 11} ${y} ${cx - r + 1} ${y + depth} ${cx} ${y + depth}`,
    `C${cx + r - 1} ${y + depth} ${x2 - 11} ${y} ${x2} ${y}`,
    `H${w} V${h} H0 Z`,
  ].join(' ');
}

function BarShape({ d, fill, stroke }: { d: string; fill: string; stroke: string }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Path d={d} fill={fill} stroke={stroke} strokeWidth={1} />
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

function renderIcon(icon: BottomNavItem['icon'], props: BottomNavIconProps) {
  return typeof icon === 'function' ? icon(props) : <BottomNavIcon name={icon} {...props} />;
}

/** The built-in icon set (24pt grid, 1.8 stroke). Active icons fill their main shape. */
export function BottomNavIcon({ name, color, size = 24, active = false }: { name: BottomNavIconName } & Partial<BottomNavIconProps> & { color: string }) {
  const s = { stroke: color, strokeWidth: active ? 2 : 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const f = active ? { ...s, fill: color } : s;
  let body: React.ReactNode;
  switch (name) {
    case 'home':
      body = <Path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6H9.2v5.6H5A1.5 1.5 0 0 1 3.5 19z" {...f} />;
      break;
    case 'explore':
      body = (
        <>
          <Circle cx="12" cy="12" r="8.6" {...s} />
          <Path d="m15.4 8.6-1.9 4.9-4.9 1.9 1.9-4.9z" {...f} />
        </>
      );
      break;
    case 'search':
      body = (
        <>
          <Circle cx="11" cy="11" r="6.6" {...s} />
          <Path d="m16 16 4.4 4.4" {...s} />
        </>
      );
      break;
    case 'projects':
      body = <Path d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h3.9l2 2.1h7.7a1.7 1.7 0 0 1 1.7 1.7v8.9a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z" {...f} />;
      break;
    case 'saved':
      body = <Path d="M6.5 4.8A1.3 1.3 0 0 1 7.8 3.5h8.4a1.3 1.3 0 0 1 1.3 1.3v15.7L12 16.8l-5.5 3.7z" {...f} />;
      break;
    case 'profile':
      body = (
        <>
          <Circle cx="12" cy="8" r="3.9" {...f} />
          <Path d="M4.5 20.2a7.5 7.5 0 0 1 15 0z" {...f} />
        </>
      );
      break;
    case 'inbox':
      body = (
        <>
          <Path d="M6.2 16V11a5.8 5.8 0 0 1 11.6 0v5l1.6 2.1H4.6z" {...f} />
          <Path d="M10 20.7h4" {...s} />
        </>
      );
      break;
    case 'activity':
      body = <Path d="M3 12.5h3.8l2.6-6.8 4.8 13 2.6-6.2H21" {...s} />;
      break;
    case 'analytics':
      body = <Path d="M5 20v-6.5M12 20V5M19 20v-9.5" {...s} strokeWidth={active ? 3 : 2.2} />;
      break;
    case 'message':
      body = <Path d="M12 3.8a8.2 8.2 0 0 0-7.1 12.3L3.8 20.2l4.2-1.1A8.2 8.2 0 1 0 12 3.8z" {...f} />;
      break;
    case 'work':
      body = (
        <>
          <Rect x="3.5" y="7.2" width="17" height="12.6" rx="2" {...f} />
          <Path d="M9 7.2V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6v1.6" {...s} />
        </>
      );
      break;
    case 'browse':
      body = (
        <>
          <Rect x="3.8" y="3.8" width="7" height="7" rx="1.8" {...f} />
          <Rect x="13.2" y="3.8" width="7" height="7" rx="1.8" {...s} />
          <Rect x="3.8" y="13.2" width="7" height="7" rx="1.8" {...s} />
          <Rect x="13.2" y="13.2" width="7" height="7" rx="1.8" {...f} />
        </>
      );
      break;
    case 'library':
      body = (
        <>
          <Rect x="3.8" y="4" width="4.4" height="16" rx="1.2" {...f} />
          <Rect x="9.8" y="4" width="4.4" height="16" rx="1.2" {...s} />
          <Path d="m16 5.4 3.6-.9 1.4 15-3.6.9z" {...f} />
        </>
      );
      break;
    case 'music':
      body = (
        <>
          <Path d="M9 18V5.5l10-2v12.5" {...s} />
          <Circle cx="6.5" cy="18" r="2.6" {...f} />
          <Circle cx="16.5" cy="16" r="2.6" {...f} />
        </>
      );
      break;
    case 'create':
      body = <Path d="M12 5v14M5 12h14" {...s} strokeWidth={2.4} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: PAD_X,
    paddingTop: PAD_TOP,
  },
  visible: {
    overflow: 'visible',
  },
  clip: {
    overflow: 'hidden',
  },
  floatOuter: {
    marginHorizontal: 16,
  },
  floatInner: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    height: ROW_H,
  },
  abs: {
    position: 'absolute',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreCol: {
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 4,
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  floatLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW_H / 2 + 3,
    marginTop: 0,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_H,
  },
  pillLabel: {
    fontSize: 13.5,
    fontWeight: '400',
    letterSpacing: -0.1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  measure: {
    position: 'absolute',
    width: 400,
    opacity: 0,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  home: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    width: 120,
    height: 4,
  },
  badge: {
    position: 'absolute',
    borderWidth: 2,
  },
  badgeDot: {
    top: -1,
    right: -2,
    width: 10,
    height: 10,
  },
  badgeCount: {
    top: -6,
    right: -11,
    minWidth: 19,
    minHeight: 19,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
