import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';

import { useKit } from '@/lib/kit';

// Docs preview of the template: a tab app with the floating Liquid Glass bar the template ships for
// iOS 18 and older, Android and web (on iOS 26 it uses the system NativeTabs instead).

type TabKey = 'index' | 'explore' | 'alerts' | 'profile';

const TABS: { key: TabKey; title: string; badge?: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'index', title: 'Home', icon: (c) => <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" stroke={c} strokeWidth={2} strokeLinejoin="round" fill="none" /> },
  {
    key: 'explore',
    title: 'Explore',
    icon: (c) => (
      <>
        <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={2} fill="none" />
        <Path d="m15.5 8.5-2 5-5 2 2-5z" stroke={c} strokeWidth={2} strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  { key: 'alerts', title: 'Alerts', badge: '3', icon: (c) => <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" /> },
  {
    key: 'profile',
    title: 'Profile',
    icon: (c) => (
      <>
        <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={2} fill="none" />
        <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      </>
    ),
  },
];

const PHOTOS = [
  'photo-1501785888041-af3ef285b470',
  'photo-1469474968028-56623f02e42e',
  'photo-1500530855697-b586d89ba3ee',
  'photo-1470071459604-3b5ec3a7fe05',
  'photo-1441974231531-c6227db76b6e',
].map((id) => `https://images.unsplash.com/${id}?w=700&auto=format&fit=crop`);

const COPY: Record<TabKey, { title: string; sub: string }> = {
  index: { title: 'For you', sub: 'Places picked for this weekend' },
  explore: { title: 'Explore', sub: 'Trending trails near you' },
  alerts: { title: 'Alerts', sub: '3 new since yesterday' },
  profile: { title: 'Profile', sub: 'Trips, saves and settings' },
};

/**
 * The template's tab app: scroll down and the glass bar folds into a circle in the corner showing the
 * current tab (scroll up or tap it to open again); tap tabs to switch.
 */
export function Preview() {
  const { dark } = useKit();
  const [tab, setTab] = useState<TabKey>('index');
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 24) setCollapsed(false);
    else if (dy > 6) setCollapsed(true);
    else if (dy < -6) setCollapsed(false);
  };
  const fg = dark ? '#ffffff' : '#1c1c1e';
  const sub = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const offset = TABS.findIndex((t) => t.key === tab);
  const copy = COPY[tab];

  return (
    <View style={[styles.root, { backgroundColor: dark ? '#000000' : '#f2f2f7' }]}>
      <ScrollView contentContainerStyle={styles.feed} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        <Text style={[styles.large, { color: fg }]}>{copy.title}</Text>
        <Text style={[styles.sub, { color: sub }]}>{copy.sub}</Text>
        {[0, 1, 2, 3, 4].map((i) => {
          const p = PHOTOS[(i + offset) % PHOTOS.length];
          return (
            <View key={`${tab}-${i}`} style={styles.card}>
              <Image source={{ uri: p }} alt="" style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={styles.cardShade} />
              <Text style={styles.cardTitle}>{['Lake Braies', 'Dolomites', 'Valley trail', 'Blue ridge', 'Old forest'][(i + offset) % 5]}</Text>
            </View>
          );
        })}
      </ScrollView>
      <GlassBar value={tab} onChange={setTab} dark={dark} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
    </View>
  );
}

const BAR_H = 64;

function GlassBar({
  value,
  onChange,
  dark,
  collapsed,
  onExpand,
}: {
  value: TabKey;
  onChange: (k: TabKey) => void;
  dark: boolean;
  collapsed: boolean;
  onExpand: () => void;
}) {
  const [w, setW] = useState(0);
  // 0 = full bar, 1 = folded into a circle (JS driver: it animates the bar's width).
  const fold = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(fold, { toValue: collapsed ? 1 : 0, useNativeDriver: false, damping: 20, stiffness: 220, mass: 0.9 }).start();
  }, [collapsed, fold]);
  const width = fold.interpolate({ inputRange: [0, 1], outputRange: [w || 1, BAR_H] });
  const rowOpacity = fold.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' });
  const dotOpacity = fold.interpolate({ inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const dotScale = fold.interpolate({ inputRange: [0.55, 1], outputRange: [0.6, 1], extrapolate: 'clamp' });
  const active = TABS.find((t) => t.key === value) ?? TABS[0];
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const index = TABS.findIndex((t) => t.key === value);
  const itemW = w ? (w - 8) / TABS.length : 0;
  const tint = dark ? '#0a84ff' : '#007aff';
  const inactive = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';

  useEffect(() => {
    if (!itemW) return;
    Animated.parallel([
      Animated.spring(x, { toValue: index * itemW, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.9 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.22, duration: 110, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 260 }),
      ]),
    ]).start();
  }, [index, itemW, x, stretch]);

  return (
    <View pointerEvents="box-none" style={styles.host} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View style={[styles.shadow, dark ? styles.shadowDark : styles.shadowLight, w ? { width } : null]}>
        <View style={[styles.glass, { borderColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.8)' }]}>
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 40} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, styles.round]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(28,28,34,0.5)' : 'rgba(255,255,255,0.55)' }]} />
          <View style={[styles.rim, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)' }]} />
          {itemW ? (
            <Animated.View
              style={[
                styles.bubble,
                {
                  width: itemW,
                  backgroundColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)',
                  transform: [{ translateX: x }, { scaleX: stretch }, { scaleY: stretch.interpolate({ inputRange: [1, 1.22], outputRange: [1, 0.88] }) }],
                },
              ]}
            />
          ) : null}
          <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={[styles.row, w ? { width: w } : null, { opacity: rowOpacity }]}>
            {TABS.map((t) => {
              const on = t.key === value;
              const c = on ? tint : inactive;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onChange(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t.title}
                  style={styles.item}
                >
                  <View>
                    <Svg width={24} height={24} viewBox="0 0 24 24">
                      {t.icon(c)}
                    </Svg>
                    {t.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{t.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, { color: c }]}>{t.title}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
          <Animated.View pointerEvents={collapsed ? 'auto' : 'none'} style={[styles.dot, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]}>
            <Pressable onPress={onExpand} accessibilityRole="button" accessibilityLabel={`${active.title}. Show tab bar`} style={styles.dotPress}>
              <Svg width={26} height={26} viewBox="0 0 24 24">
                {active.icon(tint)}
              </Svg>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  feed: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 12 },
  large: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontWeight: '400' },
  sub: { fontSize: 15, marginTop: -6, marginBottom: 6 },
  card: { height: 190, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end', padding: 16 },
  cardShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  cardTitle: { color: '#ffffff', fontSize: 20, fontWeight: '400', letterSpacing: -0.3 },
  host: { position: 'absolute', left: 20, right: 20, bottom: 24 },
  shadow: { height: BAR_H, borderRadius: BAR_H / 2 },
  shadowLight: { boxShadow: '0 10px 28px -8px rgba(0,0,0,0.22)' },
  shadowDark: { boxShadow: '0 10px 28px -8px rgba(0,0,0,0.7)' },
  glass: { flex: 1, borderRadius: 32, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2 },
  round: { borderRadius: 32 },
  rim: { position: 'absolute', top: 0, left: 24, right: 24, height: 1 },
  bubble: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 28 },
  row: { flex: 1, flexDirection: 'row', paddingHorizontal: 4 },
  dot: { position: 'absolute', top: 0, left: 0, width: BAR_H, height: BAR_H },
  dotPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontWeight: '400' },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#ffffff', fontSize: 10.5, fontWeight: '400' },
});
