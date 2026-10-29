import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FlipCalendar } from '@/components/ui/flip-calendar';
import { useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today", "Tomorrow", "In 5 days" or "3 days ago". */
function relative(date: Date, today: Date) {
  const n = Math.round((atMidnight(date).getTime() - atMidnight(today).getTime()) / 86400000);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** Lift a page to turn it over the rings, pull down to bring yesterday back. Flick to turn a few. */
export function Desk({ screen, bottomInset = 0 }: DemoProps) {
  const { colors, radius } = useKit();
  const [today] = useState(() => new Date());
  const [date, setDate] = useState(today);
  return (
    <View
      style={[
        s.frame,
        { backgroundColor: colors.muted, paddingBottom: 24 + bottomInset },
        screen ? s.frameScreen : { borderRadius: radius.xl, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={s.head}>
        <Text style={[s.title, { color: colors.foreground }]}>Pick-up date</Text>
        <Text style={[s.sub, { color: colors.mutedForeground }]}>{relative(date, today)}</Text>
      </View>
      <FlipCalendar value={date} onChange={setDate} accent={colors.danger} accessibilityLabel="Pick-up date" />
      <Text style={[s.hint, { color: colors.mutedForeground }]}>Lift a page to turn it · pull down to go back</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setDate(today)}
        style={({ pressed }) => [s.button, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.capsule(40), opacity: pressed ? 0.7 : 1 }]}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[s.buttonText, { color: colors.foreground }]}>Back to today</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { alignSelf: 'stretch', minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 24, paddingHorizontal: 24 },
  frameScreen: { flex: 1 },
  head: { alignItems: 'center', gap: 2 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 15 },
  hint: { fontSize: 13, textAlign: 'center' },
  button: { minHeight: 40, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
