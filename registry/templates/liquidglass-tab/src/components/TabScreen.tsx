import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset, useTabBarScroll, USE_NATIVE_TABS } from '@/lib/tab-bar';
import { getTab } from '@/lib/tabs';

interface TabScreenProps {
  title: string;
  description: string;
  accent: string;
}

export function TabScreen({ title, description, accent }: TabScreenProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScroll();
  const bottomInset = useTabBarInset();
  const bg = isDark ? '#0f0f1a' : '#f2f2f7';
  const text = isDark ? '#fff' : '#1c1c1e';
  const sub = isDark ? '#9898a8' : '#6c6c70';

  return (
    <View collapsable={false} style={styles.root}>
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: USE_NATIVE_TABS ? 12 : insets.top + 12, paddingBottom: bottomInset },
        ]}
        showsVerticalScrollIndicator={false}
        // Native tabs inset content for the system bars; the glass fallback pads it manually.
        contentInsetAdjustmentBehavior={USE_NATIVE_TABS ? 'automatic' : 'never'}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <View style={[styles.hero, { backgroundColor: accent }]}>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroHint}>
            {USE_NATIVE_TABS ? 'Liquid Glass · scroll down to collapse' : 'Glass fallback · scroll down to collapse'}
          </Text>
        </View>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: sub }]}>{description}</Text>

        {SECTIONS.map((n) => (
          <View
            key={n}
            style={[
              styles.card,
              { backgroundColor: isDark ? '#1c1c2e' : '#ffffff' },
            ]}
          >
            <Text style={[styles.cardTitle, { color: text }]}>Section {n}</Text>
            <Text style={[styles.cardSub, { color: sub }]}>
              iOS 26+ gets the system Liquid Glass bar. Older iOS, Android and web get the
              blur glass fallback — both merge into a glass circle when you scroll down.
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function TabScreenFromConfig({ tabName }: { tabName: string }) {
  const tab = getTab(tabName);
  if (!tab) {
    return null;
  }

  return (
    <TabScreen
      title={tab.title}
      description={
        tab.description ??
        'Scroll to test native tab bar minimize behavior on iOS 26+.'
      }
      accent={tab.accent ?? '#6366f1'}
    />
  );
}

const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  hero: {
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '400',
  },
  heroHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '400',
  },
  title: { fontSize: 34, fontWeight: '400', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 8, marginBottom: 20, lineHeight: 22 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '400' },
  cardSub: { fontSize: 14, marginTop: 4, lineHeight: 20 },
});
