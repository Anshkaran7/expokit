import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset, useTabBarScroll, USE_NATIVE_TABS } from '@/lib/tab-bar';
import { getTab } from '@/lib/tabs';

interface TabScreenProps {
  title: string;
  description: string;
  accent: string;
  /** Label of a button pinned to the bottom of the screen, above the tab bar. */
  action?: string | undefined;
}

export function TabScreen({ title, description, accent, action }: TabScreenProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScroll();
  const bottomInset = useTabBarInset(24);
  // Bottom-anchored UI sits on top of the bar's footprint, not on the screen edge.
  const actionBottom = useTabBarInset(12);
  // Phones: full width, one card per row. Tablets and open foldables: a centred column, two cards per row.
  const { width } = useWindowDimensions();
  const columnW = Math.min(width, COLUMN_MAX);
  const side = Math.max(0, (width - columnW) / 2) + 20;
  const columns = width >= 600 ? 2 : 1;
  const cardW = columns > 1 ? (columnW - 40 - CARD_GAP * (columns - 1)) / columns : undefined;
  const bg = isDark ? '#0f0f1a' : '#f2f2f7';
  const text = isDark ? '#fff' : '#1c1c1e';
  const sub = isDark ? '#9898a8' : '#6c6c70';

  return (
    <View collapsable={false} style={styles.root}>
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: bottomInset },
          { width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
        // Pad by hand on every bar: useTabBarInset() already counts the floating bar and home indicator.
        contentInsetAdjustmentBehavior="never"
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

        <View style={columns > 1 ? styles.grid : undefined}>
          {SECTIONS.map((n) => (
            <View
              key={n}
              style={[
                styles.card,
                { width: cardW, backgroundColor: isDark ? '#1c1c2e' : '#ffffff' },
              ]}
            >
              <Text style={[styles.cardTitle, { color: text }]}>Section {n}</Text>
              <Text style={[styles.cardSub, { color: sub }]}>
                iOS 26+ gets the system Liquid Glass bar. Older iOS, Android and web get the
                blur glass fallback — both merge into a glass circle when you scroll down.
              </Text>
            </View>
          ))}
        </View>
        {action ? <View style={{ height: 64 }} /> : null}
      </ScrollView>
      {action ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, { left: side, right: side, bottom: actionBottom, backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TabScreenFromConfig({ tabName, action }: { tabName: string; action?: string | undefined }) {
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
      action={action}
    />
  );
}

const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Widest the screen's column gets on tablets. */
const COLUMN_MAX = 720;
const CARD_GAP = 10;

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: CARD_GAP },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '400' },
  cardSub: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  action: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '500', includeFontPadding: false, textAlignVertical: 'center' },
});
