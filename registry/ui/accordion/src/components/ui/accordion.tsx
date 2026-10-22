import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';

import { alpha, isTextNode, motion, useKit } from '@/lib/kit';

export type AccordionVariant = 'default' | 'bordered' | 'separated';

export interface AccordionProps {
  children: React.ReactNode;
  /** 'single' keeps one item open at a time; 'multiple' lets any number stay open. */
  type?: 'single' | 'multiple';
  /** Open item values (controlled). */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** In 'single' mode, allow closing the open item (default true). */
  collapsible?: boolean;
  variant?: AccordionVariant;
  /** Chevron colour of open items (default: theme accent). */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

interface Ctx {
  open: string[];
  toggle: (v: string) => void;
  variant: AccordionVariant;
  tint: string;
  reduce: boolean;
}
const AccordionContext = createContext<Ctx | null>(null);
const PositionContext = createContext({ first: true, last: true });

/** Expanding sections with measured-height spring motion and a rotating chevron. */
export function Accordion({
  children,
  type = 'single',
  value,
  defaultValue = [],
  onValueChange,
  collapsible = true,
  variant = 'default',
  accent,
  style,
}: AccordionProps) {
  const { colors, radius } = useKit();
  const reduce = useReduceMotion();
  const [inner, setInner] = useState(defaultValue);
  const open = value ?? inner;
  const openRef = useRef(open);
  openRef.current = open;

  const toggle = useCallback(
    (v: string) => {
      const cur = openRef.current;
      const isOpen = cur.includes(v);
      let next: string[];
      if (type === 'multiple') next = isOpen ? cur.filter((x) => x !== v) : [...cur, v];
      else next = isOpen ? (collapsible ? [] : cur) : [v];
      if (next === cur) return;
      if (value === undefined) setInner(next);
      onValueChange?.(next);
    },
    [type, collapsible, value, onValueChange]
  );

  const ctx = useMemo(
    () => ({ open, toggle, variant, tint: accent ?? colors.accent, reduce }),
    [open, toggle, variant, accent, colors.accent, reduce]
  );
  const items = React.Children.toArray(children);

  return (
    <AccordionContext.Provider value={ctx}>
      <View
        style={[
          variant === 'bordered' && {
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: colors.border,
            borderRadius: radius.lg,
            backgroundColor: colors.card,
            overflow: 'hidden',
          },
          variant === 'separated' && styles.separated,
          style,
        ]}
      >
        {items.map((child, i) => (
          <PositionContext.Provider key={(child as React.ReactElement).key ?? i} value={{ first: i === 0, last: i === items.length - 1 }}>
            {child}
          </PositionContext.Provider>
        ))}
      </View>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps {
  /** Unique id used by the Accordion's value. */
  value: string;
  title: React.ReactNode;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Leading icon. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One collapsible section. Content is measured, so any height animates smoothly. */
export function AccordionItem({ value, title, subtitle, icon, children, disabled, style }: AccordionItemProps) {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('AccordionItem must be used inside <Accordion>');
  const { open: openValues, toggle, variant, tint, reduce } = ctx;
  const { last } = useContext(PositionContext);
  const { colors, radius, dark, font } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const open = openValues.includes(value);

  const [height, setHeight] = useState(0);
  // `progress` drives height (layout → JS driver); `turn` rotates the chevron on the native driver.
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    // Reduce Motion: open and close at once, chevron flips without turning.
    if (reduce) {
      progress.setValue(open ? 1 : 0);
      turn.setValue(open ? 1 : 0);
      return;
    }
    Animated.spring(progress, { toValue: open ? 1 : 0, useNativeDriver: false, ...motion.gentle, overshootClamping: true }).start();
    Animated.spring(turn, { toValue: open ? 1 : 0, useNativeDriver: true, ...motion.snappy }).start();
  }, [open, progress, turn, reduce]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h !== height) setHeight(h);
  };

  const pad = variant === 'default' ? 0 : 16;
  const container: ViewStyle =
    variant === 'separated'
      ? {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: open ? alpha(tint, dark ? 0.45 : 0.35) : colors.border,
          overflow: 'hidden',
        }
      : variant === 'default' || !last
        ? { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border }
        : {};

  return (
    <View style={[container, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => toggle(value)}
        style={({ pressed }) => [
          styles.header,
          { paddingHorizontal: pad, opacity: disabled ? 0.45 : 1 },
          pressed && variant !== 'default' && { backgroundColor: colors.muted },
          pressed && variant === 'default' && { opacity: 0.6 },
        ]}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <View style={styles.titles}>
          {isTextNode(title) ? (
            <Text style={[styles.title, ff, { color: open && variant === 'default' ? tint : colors.foreground }]}>{title}</Text>
          ) : (
            title
          )}
          {subtitle ? <Text style={[styles.subtitle, ff, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
        <Animated.View
          style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              d="M6 9l6 6 6-6"
              stroke={open ? tint : colors.mutedForeground}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Pressable>

      <Animated.View
        style={{ height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), overflow: 'hidden' }}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <Animated.View
          onLayout={onLayout}
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            styles.body,
            {
              paddingHorizontal: pad,
              paddingLeft: pad + (icon ? 36 : 0),
              opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.4, 1] }),
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            },
          ]}
        >
          {isTextNode(children) ? (
            <Text style={[styles.text, ff, { color: colors.mutedForeground }]}>{children}</Text>
          ) : (
            children
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

Accordion.Item = AccordionItem;

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
  separated: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 14, gap: 12 },
  icon: { width: 24, alignItems: 'center' },
  titles: { flex: 1, gap: 2 },
  title: { fontSize: 15.5, fontWeight: '400', letterSpacing: -0.1 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  body: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16 },
  text: { fontSize: 14.5, lineHeight: 21 },
});
