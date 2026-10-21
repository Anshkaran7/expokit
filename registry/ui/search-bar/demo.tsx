import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { SearchBar, type SearchSuggestion } from '@/components/ui/search-bar';
import { alpha, useKit } from '@/lib/kit';

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ screen, style, ...rest }: ViewProps & { screen?: boolean }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        { padding: 16, gap: 12 },
        screen
          ? { flex: 1, backgroundColor: colors.background }
          : { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card },
        style,
      ]}
      {...rest}
    />
  );
}

const SUGGESTIONS: SearchSuggestion[] = [
  { key: 'r1', label: 'Noise cancelling headphones', icon: 'recent' },
  { key: 'r2', label: 'Running shoes', icon: 'recent' },
  { key: 't1', label: 'Mechanical keyboard', icon: 'trending', hint: 'Trending' },
  { key: 't2', label: 'Standing desk', icon: 'trending', hint: '2.1k searches' },
  { key: 's1', label: 'Wireless charger', hint: 'Electronics' },
  { key: 's2', label: 'Coffee grinder', hint: 'Kitchen' },
];

export function WithSuggestions({ screen }: DemoProps) {
  const { colors } = useKit();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  return (
    // Reserve room for the open list, so the bar stays put when suggestions drop down below it.
    <View style={[{ gap: 10 }, screen ? { flex: 1 } : { minHeight: 400 }]}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search products"
        suggestions={SUGGESTIONS}
        maxSuggestions={5}
        onSelectSuggestion={(item) => setPicked(item.label)}
      />
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{picked ? `Showing results for “${picked}”` : 'Tap the field to see recent and trending searches'}</Text>
    </View>
  );
}

const CONTACTS = [
  { name: 'Aarav Mehta', role: 'Design lead' },
  { name: 'Priya Nair', role: 'Product manager' },
  { name: 'Rohan Kapoor', role: 'iOS engineer' },
  { name: 'Sara Ali', role: 'Marketing' },
  { name: 'Vikram Rao', role: 'Backend engineer' },
];

export function LiveResults({ screen }: DemoProps) {
  const { colors } = useKit();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!query) return setLoading(false);
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(id);
  }, [query]);
  const q = query.trim().toLowerCase();
  const results = CONTACTS.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
  return (
    <Card screen={screen}>
      <SearchBar variant="filled" value={query} onChangeText={setQuery} loading={loading} placeholder="Search people" />
      {loading ? (
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Searching your team…</Text>
      ) : results.length ? (
        results.slice(0, 4).map((c) => (
          <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: alpha(colors.accent, 0.16), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '400', color: colors.accent }}>{c.name.split(' ').map((p) => p[0]).join('')}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '400', color: colors.foreground }}>{c.name}</Text>
              <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>{c.role}</Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>No one matches “{query}”</Text>
      )}
    </Card>
  );
}

export function Minimal({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Card screen={screen} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '400', letterSpacing: -0.4, color: colors.foreground }}>Inbox</Text>
      <SearchBar variant="minimal" align="right" placeholder="Search mail" style={{ flex: 1 }} />
    </Card>
  );
}

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, radius } = useKit();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Filters, ${count} active`}
      style={{ height: 32, paddingHorizontal: 10, borderRadius: radius.capsule(32), backgroundColor: count ? colors.accent : colors.muted, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <View style={{ gap: 3, alignItems: 'center' }}>
        {[14, 10, 6].map((w) => (
          <View key={w} style={{ width: w, height: 2, borderRadius: 1, backgroundColor: count ? colors.accentForeground : colors.mutedForeground }} />
        ))}
      </View>
      {count ? <Text style={{ fontSize: 12.5, fontWeight: '400', color: colors.accentForeground }}>{count}</Text> : null}
    </Pressable>
  );
}

export function WithFilter() {
  const { colors } = useKit();
  const [count, setCount] = useState(2);
  return (
    <View style={{ gap: 10 }}>
      <SearchBar
        placeholder="Stays in Goa"
        showCancel={false}
        trailing={<FilterButton count={count} onPress={() => setCount((c) => (c + 1) % 4)} />}
      />
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{count ? `${count} filters · Pool, Under ₹8,000` : 'No filters applied'}</Text>
    </View>
  );
}

export function Sizes() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 14 }}>
      {(['sm', 'md', 'lg'] as const).map((size, i) => (
        <View key={size} style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '400', color: colors.mutedForeground }}>{['Small', 'Medium', 'Large'][i]}</Text>
          <SearchBar size={size} variant={i === 1 ? 'default' : 'filled'} defaultValue="Coffee near me" showCancel={false} />
        </View>
      ))}
    </View>
  );
}
