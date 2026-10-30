import React, { createContext, useContext, useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type CardVariant = 'default' | 'outline' | 'elevated';
export type CardHighlight = 'none' | 'spotlight' | 'border';

export interface CardProps {
  children?: React.ReactNode;
  variant?: CardVariant;
  /** Inner padding in points (default 18). Sections are spaced by `gap`. */
  padding?: number;
  /** Space between Header, Content and Footer (default 14). */
  gap?: number;
  /** Makes the whole card a button with spring press feedback. */
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  /** Spring press feedback without an onPress (e.g. the card wraps its own buttons). */
  pressable?: boolean;
  /** Light up on press: a soft spotlight that follows the finger, or a glowing accent border. */
  highlight?: CardHighlight;
  /** Colour of the highlight (default: theme accent). */
  accent?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const CardContext = createContext({ padding: 18 });

/**
 * Surface for grouping content. Compose with Card.Header, Card.Title, Card.Description,
 * Card.Content, Card.Media and Card.Footer. Optional spring press with a finger-following spotlight.
 */
export function Card({
  children,
  variant = 'default',
  padding = 18,
  gap = 14,
  onPress,
  onLongPress,
  pressable,
  highlight = 'none',
  accent,
  disabled,
  accessibilityLabel,
  style,
}: CardProps) {
  const { colors, radius, dark } = useKit();
  const tint = accent ?? colors.accent;
  const interactive = !!(onPress || onLongPress || pressable);
  const corner = radius.scale(18);
  const gid = 'card' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduce = useReduceMotion();

  const [scale] = useState(() => new Animated.Value(1));
  const [glow] = useState(() => new Animated.Value(0));
  const [spot] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const spotD = Math.max(size.w, size.h) * 1.1;

  const surfaces: Record<CardVariant, ViewStyle> = {
    default: {
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: colors.border,
      ...shadow(dark ? 0 : 0.04, 2, 6),
    },
    outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    elevated: { backgroundColor: dark ? colors.popover : colors.card, ...shadow(dark ? 0.5 : 0.1, 10, 28) },
  };

  const border = (surfaces[variant].borderWidth as number | undefined) ?? 0;

  // Reduce Motion: no press squish and the spotlight doesn't grow; the glow still fades in and out.
  const pressIn = (e: GestureResponderEvent) => {
    if (!reduce) Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, ...motion.snappy }).start();
    if (highlight === 'none') return;
    moveSpot(e);
    Animated.spring(glow, { toValue: 1, useNativeDriver: true, ...motion.gentle }).start();
  };
  const pressOut = () => {
    if (reduce) scale.setValue(1);
    else Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...motion.bouncy }).start();
    if (highlight !== 'none') Animated.timing(glow, { toValue: 0, duration: reduce ? 150 : 420, useNativeDriver: true }).start();
  };
  // Touch coordinates are relative to whichever child was hit, so work from page coordinates.
  const clipRef = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0 });
  const placeSpot = (pageX: number, pageY: number) =>
    spot.setValue({ x: pageX - origin.current.x - spotD / 2, y: pageY - origin.current.y - spotD / 2 });
  const moveSpot = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    clipRef.current?.measure((_x, _y, _w, _h, px, py) => {
      origin.current = { x: px, y: py };
      placeSpot(pageX, pageY);
    });
  };
  const followSpot = (e: GestureResponderEvent) => placeSpot(e.nativeEvent.pageX, e.nativeEvent.pageY);

  const content = (
    <View ref={clipRef} style={[styles.clip, { borderRadius: Math.max(0, corner - border) }]}>
      {highlight === 'spotlight' && spotD > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.spot,
            {
              width: spotD,
              height: spotD,
              opacity: glow,
              transform: [
                { translateX: spot.x },
                { translateY: spot.y },
                { scale: glow.interpolate({ inputRange: [0, 1], outputRange: reduce ? [1, 1] : [0.4, 1] }) },
              ],
            },
          ]}
        >
          <Svg width={spotD} height={spotD}>
            <Defs>
              <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={tint} stopOpacity={dark ? 0.32 : 0.2} />
                <Stop offset="0.55" stopColor={tint} stopOpacity={dark ? 0.1 : 0.06} />
                <Stop offset="1" stopColor={tint} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={spotD} height={spotD} fill={`url(#${gid})`} />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={{ padding, gap }}>{children}</View>
      {highlight !== 'none' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { borderRadius: Math.max(0, corner - border), borderColor: alpha(tint, 0.85), opacity: glow }]}
        />
      ) : null}
    </View>
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  };

  return (
    <CardContext.Provider value={{ padding }}>
      <Animated.View
        onLayout={onLayout}
        style={[
          { borderRadius: corner, opacity: disabled ? 0.55 : 1 },
          surfaces[variant],
          interactive && { transform: [{ scale }] },
          style,
        ]}
      >
        {interactive ? (
          <Pressable
            accessibilityRole={onPress || onLongPress ? 'button' : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={pressIn}
            onPressOut={pressOut}
            onTouchMove={highlight === 'spotlight' ? followSpot : undefined}
            style={Platform.OS === 'web' ? ({ cursor: onPress ? 'pointer' : 'auto' } as ViewStyle) : undefined}
          >
            {content}
          </Pressable>
        ) : (
          content
        )}
      </Animated.View>
    </CardContext.Provider>
  );
}

export interface CardHeaderProps {
  children?: React.ReactNode;
  /** Element pinned to the top-right (menu button, badge, avatar). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Title + description stack, with an optional action on the right. */
export function CardHeader({ children, action, style }: CardHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerText}>{children}</View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

export interface CardTextProps {
  children?: React.ReactNode;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}

export function CardTitle({ children, numberOfLines, style }: CardTextProps) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  return (
    <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[styles.title, ff, { color: colors.cardForeground }, style]}>
      {children}
    </Text>
  );
}

export function CardDescription({ children, numberOfLines, style }: CardTextProps) {
  const { colors, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  return (
    <Text numberOfLines={numberOfLines} style={[styles.description, ff, { color: colors.mutedForeground }, style]}>
      {children}
    </Text>
  );
}

export interface CardSectionProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function CardContent({ children, style }: CardSectionProps) {
  return <View style={style}>{children}</View>;
}

/** Row of actions at the bottom. */
export function CardFooter({ children, style }: CardSectionProps) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

export interface CardMediaProps {
  source: ImageSourcePropType;
  /** Image height (default 168). */
  height?: number;
  /** Optional overlay content (e.g. a badge) placed on top of the image. */
  children?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Full-bleed image. Put it first inside the Card — it cancels the card padding. */
export function CardMedia({ source, height = 168, children, accessibilityLabel, style }: CardMediaProps) {
  const { padding } = useContext(CardContext);
  const { colors } = useKit();
  return (
    <View style={[{ height, marginTop: -padding, marginHorizontal: -padding, backgroundColor: colors.muted }, style]}>
      <Image
        source={source}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={styles.media}
      />
      {children ? <View style={[styles.mediaOverlay, { padding: padding - 4 }]}>{children}</View> : null}
    </View>
  );
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;
Card.Media = CardMedia;

/** A boxShadow: the same soft shadow on iOS, Android and web (unlike elevation). */
function shadow(opacity: number, y: number, blur: number): ViewStyle {
  if (!opacity) return {};
  return { boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${opacity})` };
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
  clip: { overflow: 'hidden' },
  spot: { position: 'absolute', top: 0, left: 0 },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.2 },
  description: { fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  media: { width: '100%', height: '100%' },
  mediaOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
});
