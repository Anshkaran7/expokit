import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  type ColorValue,
  type ImageSourcePropType,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
// '@react-navigation/bottom-tabs' on SDK 54–55 (the CLI writes the right one).
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { GLASS_BAR_HEIGHT, setTabBarCollapsed, tabBarCollapse } from '@/lib/tab-bar';
import { getTab, resolveIconLibrary, resolveIconNames, TAB_BAR, type TabItem } from '@/lib/tabs';

/**
 * Liquid-Glass look-alike for devices without the real thing (iOS 18 and older, Android, web).
 * A floating blur pill with a sliding selection bubble. On scroll it collapses into a single
 * glass circle holding the active tab — tap the circle to expand it again, like iOS 26.
 */
export function GlassTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const isDark = useColorScheme() === 'dark';
  const { width: screenW } = useWindowDimensions();
  const tint = isDark ? TAB_BAR.colors.tint.dark : TAB_BAR.colors.tint.light;
  const inactive = isDark ? TAB_BAR.colors.inactive.dark : TAB_BAR.colors.inactive.light;

  const routes = state.routes.filter((r) => !getTab(r.name)?.hidden);
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === activeKey));
  const activeTab = getTab(routes[activeIndex]?.name ?? '');

  const fullW = Math.min(screenW - 32, 520);
  const itemW = fullW / Math.max(routes.length, 1);
  const bubbleX = useRef(new Animated.Value(activeIndex * itemW)).current;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    Animated.spring(bubbleX, {
      toValue: activeIndex * itemW,
      useNativeDriver: true,
      damping: 29,
      stiffness: 240,
      mass: 0.8,
    }).start();
    setTabBarCollapsed(false);
  }, [activeIndex, itemW, bubbleX]);

  useEffect(() => {
    const id = tabBarCollapse.addListener(({ value }) => setCollapsed(value > 0.5));
    return () => tabBarCollapse.removeListener(id);
  }, []);

  const width = tabBarCollapse.interpolate({ inputRange: [0, 1], outputRange: [fullW, GLASS_BAR_HEIGHT] });
  const rowOpacity = tabBarCollapse.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  const dotOpacity = tabBarCollapse.interpolate({ inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const dotScale = tabBarCollapse.interpolate({ inputRange: [0.55, 1], outputRange: [0.6, 1], extrapolate: 'clamp' });

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 12) }]}>
      <Animated.View style={[styles.shadow, { width }]}>
        <View style={[styles.glass, { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)' }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? 'rgba(28,28,34,0.55)' : 'rgba(255,255,255,0.55)' },
            ]}
          />
          {/* Specular rim along the top edge. */}
          <View style={[styles.rim, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)' }]} />

          <Animated.View
            pointerEvents={collapsed ? 'none' : 'auto'}
            style={[styles.row, { width: fullW, opacity: rowOpacity }]}
          >
            <Animated.View
              style={[
                styles.bubble,
                {
                  width: itemW - 8,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                  transform: [{ translateX: bubbleX }],
                },
              ]}
            />
            {routes.map((route) => {
              const tab = getTab(route.name);
              const focused = route.key === activeKey;
              const color = focused ? tint : inactive;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name, route.params);
                }
              };
              return (
                <TabButton
                  key={route.key}
                  tab={tab}
                  title={tab?.title ?? route.name}
                  focused={focused}
                  color={color}
                  width={itemW}
                  onPress={onPress}
                />
              );
            })}
          </Animated.View>

          <Animated.View
            pointerEvents={collapsed ? 'auto' : 'none'}
            style={[styles.dot, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show tabs"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setTabBarCollapsed(false);
              }}
              style={styles.dotPress}
            >
              <TabIcon tab={activeTab} focused color={tint} size={26} />
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

function TabButton({
  tab,
  title,
  focused,
  color,
  width,
  onPress,
}: {
  tab?: TabItem;
  title: string;
  focused: boolean;
  color: ColorValue;
  width: number;
  onPress: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={() => to(0.86)}
      onPressOut={() => to(1)}
      style={[styles.item, { width }]}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: press }] }}>
        <View>
          <TabIcon tab={tab} focused={focused} color={color} size={23} />
          {tab?.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tab.badge}</Text>
            </View>
          ) : null}
        </View>
        {tab?.hiddenLabel ||
        TAB_BAR.labelVisibilityMode === 'unlabeled' ||
        (TAB_BAR.labelVisibilityMode === 'selected' && !focused) ? null : (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                color,
                fontSize: TAB_BAR.labelStyle.fontSize,
                fontWeight: focused ? TAB_BAR.labelStyle.selectedFontWeight : TAB_BAR.labelStyle.fontWeight,
              },
            ]}
          >
            {title}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

type IconComponent = React.ComponentType<{ name: string; size: number; color: ColorValue }>;

/** Same icon config as the native bar: `src` image, or a vector-icon set / custom icon font. */
function TabIcon({ tab, focused, color, size }: { tab?: TabItem; focused: boolean; color: ColorValue; size: number }) {
  if (tab?.src) {
    const src = tab.src as ImageSourcePropType | { default: ImageSourcePropType; selected: ImageSourcePropType };
    const pair = typeof src === 'object' && src !== null && 'selected' in src ? src : null;
    const source = pair ? (focused ? pair.selected : pair.default) : (src as ImageSourcePropType);
    return <Image source={source} style={{ width: size, height: size, tintColor: color as string }} />;
  }
  const library = tab ? resolveIconLibrary(tab) : undefined;
  const { name, selected } = tab ? resolveIconNames(tab) : {};
  if (typeof library === 'function' && name) {
    const Icon = library as IconComponent;
    return <Icon name={focused && selected ? selected : name} size={size} color={color} />;
  }
  return <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size, backgroundColor: color, margin: size * 0.3 }} />;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'flex-start' },
  shadow: {
    height: GLASS_BAR_HEIGHT,
    borderRadius: GLASS_BAR_HEIGHT / 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  glass: {
    flex: 1,
    borderRadius: GLASS_BAR_HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  rim: { position: 'absolute', top: 0, left: 24, right: 24, height: StyleSheet.hairlineWidth * 2, borderRadius: 1 },
  row: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center' },
  bubble: { position: 'absolute', top: 5, bottom: 5, left: 4, borderRadius: (GLASS_BAR_HEIGHT - 10) / 2 },
  item: { height: GLASS_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 3, letterSpacing: 0.1 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '400' },
  dot: { position: 'absolute', top: 0, left: 0, width: GLASS_BAR_HEIGHT, height: GLASS_BAR_HEIGHT },
  dotPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
