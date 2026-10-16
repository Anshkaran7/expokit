import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { PaginationDots } from '@/components/ui/pagination-dots';
import { useKit } from '@/lib/kit';

// The first page has no colour of its own: it wears the theme accent. The rest are illustration colours.
const PAGES: { color?: string; kicker: string; title: string; body: string }[] = [
  { kicker: 'PLAN', title: 'Plan your week in minutes', body: 'Drag tasks onto your calendar and we block the time for you.' },
  { color: '#0ea5e9', kicker: 'FOCUS', title: 'Stay in the zone', body: 'Focus sessions silence notifications until your block ends.' },
  { color: '#10b981', kicker: 'REVIEW', title: 'See what moved', body: 'A Friday recap shows what you shipped and what slipped.' },
  { color: '#f59e0b', kicker: 'SHARE', title: 'Bring your team along', body: 'Shared boards keep everyone on the same page.' },
];

export function Onboarding() {
  const { colors, radius } = useKit();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const ref = useRef<ScrollView>(null);
  const progress = useMemo(() => (width ? Animated.divide(scrollX, width) : 0), [scrollX, width]);
  const go = (i: number) => ref.current?.scrollTo({ x: i * width, animated: true });

  return (
    <View style={{ gap: 18 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => width && setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {PAGES.map((p) => (
          <View key={p.title} style={{ width: width || 1, paddingHorizontal: 2 }}>
            <View style={{ height: 210, borderRadius: radius.scale(24), backgroundColor: p.color ?? colors.accent, padding: 22, justifyContent: 'flex-end' }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '400', letterSpacing: 1.2 }}>{p.kicker}</Text>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '400', letterSpacing: -0.5, marginTop: 6 }}>{p.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, marginTop: 6 }}>{p.body}</Text>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => go(PAGES.length - 1)} hitSlop={12} accessibilityRole="button">
          <Text style={{ fontSize: 15, fontWeight: '400', color: colors.mutedForeground }}>Skip</Text>
        </Pressable>
        <PaginationDots count={PAGES.length} progress={progress} onPress={go} accessibilityLabel="Onboarding page" />
        <Pressable
          onPress={() => go(Math.min(PAGES.length - 1, page + 1))}
          accessibilityRole="button"
          style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.capsule(44), backgroundColor: colors.accent, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '400', color: colors.accentForeground }}>{page === PAGES.length - 1 ? 'Done' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Label({ children }: { children: string }) {
  const { colors } = useKit();
  return <Text style={{ fontSize: 12, fontWeight: '400', letterSpacing: 0.4, color: colors.mutedForeground }}>{children}</Text>;
}

export function Variants() {
  const { colors, radius } = useKit();
  const [i, setI] = useState(1);
  return (
    <View style={{ gap: 22 }}>
      {(['dots', 'scale', 'line', 'numbers'] as const).map((variant) => (
        <View key={variant} style={{ gap: 10 }}>
          <Label>{variant.toUpperCase()}</Label>
          <PaginationDots variant={variant} count={5} index={i} onPress={setI} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        {['Previous', 'Next'].map((t, k) => (
          <Pressable
            key={t}
            onPress={() => setI((v) => Math.max(0, Math.min(4, v + (k ? 1 : -1))))}
            accessibilityRole="button"
            style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '400', color: colors.foreground }}>{t}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <PaginationDots size="sm" count={6} index={2} />
      <PaginationDots size="md" count={6} index={2} />
      <PaginationDots size="lg" count={6} index={2} />
    </View>
  );
}
