import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';

import { Calendar, addDays, startOfDay, toDateKey, type DateRange } from '@/components/ui/calendar';
import { alpha, useKit } from '@/lib/kit';

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

const today = startOfDay(new Date());
const day = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. In `screen` mode it is the page itself. */
function Card({ screen, style, ...rest }: ViewProps & { screen?: boolean }) {
  const { colors, radius } = useKit();
  if (screen) return <View style={[s.screen, { backgroundColor: colors.background }, style]} {...rest} />;
  return <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl }, style]} {...rest} />;
}

/** Text in the kit's ink: `tone="muted"` for secondary copy. */
function Ink({ tone, style, ...rest }: TextProps & { tone?: 'muted' }) {
  const { colors } = useKit();
  return <Text style={[{ color: tone === 'muted' ? colors.mutedForeground : colors.foreground }, style]} {...rest} />;
}

export function Single({ screen }: DemoProps) {
  const [date, setDate] = useState<Date>(addDays(today, 3));
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Delivery day</Ink>
      <Calendar value={date} onChange={setDate} minDate={today} />
      <View style={s.summary}>
        <Ink tone="muted" style={s.muted}>Arriving</Ink>
        <Ink style={s.strong}>{day(date)}</Ink>
      </View>
    </Card>
  );
}

export function Range({ screen }: DemoProps) {
  const [stay, setStay] = useState<DateRange>({ start: addDays(today, 4), end: addDays(today, 8) });
  const { colors, radius } = useKit();
  const nights = stay.start && stay.end ? Math.round((stay.end.getTime() - stay.start.getTime()) / 86400000) : 0;
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Your stay · Lisbon</Ink>
      <Calendar mode="range" value={stay} onChange={setStay} minDate={today} />
      <View style={s.row}>
        <View style={s.col}>
          <Ink tone="muted" style={s.muted}>Check-in</Ink>
          <Ink style={s.strong}>{day(stay.start)}</Ink>
        </View>
        <View style={s.col}>
          <Ink tone="muted" style={s.muted}>Check-out</Ink>
          <Ink style={s.strong}>{stay.end ? day(stay.end) : 'Select a date'}</Ink>
        </View>
        <View style={[s.pill, { opacity: nights ? 1 : 0.4, backgroundColor: alpha(colors.accent, 0.14), borderRadius: radius.capsule(30) }]}>
          <Text style={[s.pillText, { color: colors.accent }]}>{nights ? `${nights} night${nights > 1 ? 's' : ''}` : '0 nights'}</Text>
        </View>
      </View>
    </Card>
  );
}

const MEETING = '#38bdf8';
const BIRTHDAY = '#f472b6';
const TRIP = '#f59e0b';
const DONE = '#22c55e';
const DUE = '#ef4444';

export function Marked({ screen }: DemoProps) {
  const [date, setDate] = useState<Date>(today);
  const { highlights, marks } = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const k = (d: number) => toDateKey(new Date(y, m, d));
    return {
      // Whole-day fills: who / what owns the day.
      highlights: { [k(2)]: MEETING, [k(14)]: BIRTHDAY, [k(18)]: TRIP, [k(21)]: MEETING, [k(31)]: BIRTHDAY },
      // Dots underneath: smaller things on that day.
      marks: { [k(3)]: DONE, [k(8)]: DUE, [k(12)]: DONE, [k(17)]: DONE, [k(22)]: [DONE, DUE], [k(26)]: DUE },
    };
  }, []);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Schedule</Ink>
      <Calendar value={date} onChange={setDate} highlightedDates={highlights} markedDates={marks} weekStartsOn={1} />
      <View style={s.legend}>
        {[
          ['Meeting', MEETING],
          ['Birthday', BIRTHDAY],
          ['Trip', TRIP],
          ['Done', DONE],
          ['Due', DUE],
        ].map(([label, color]) => (
          <View key={label} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: color }]} />
            <Ink tone="muted" style={s.muted}>{label}</Ink>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function Booking({ screen }: DemoProps) {
  const booked = useMemo(() => new Set([2, 5, 6, 11, 19].map((n) => toDateKey(addDays(today, n)))), []);
  const [date, setDate] = useState<Date | null>(null);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Book a consultation</Ink>
      <Calendar
        value={date}
        onChange={setDate}
        minDate={today}
        maxDate={addDays(today, 45)}
        isDateDisabled={(d) => d.getDay() === 0 || booked.has(toDateKey(d))}
        showOutsideDays
        fixedWeeks
      />
      <Ink tone="muted" style={s.muted}>
        {date ? `Next: choose a time on ${day(date)}` : 'Faded days are fully booked or closed on Sundays.'}
      </Ink>
    </Card>
  );
}

export function WeekStartsMonday({ screen }: DemoProps) {
  const [days, setDays] = useState<Date[]>([addDays(today, 1), addDays(today, 3)]);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Training days · pick up to 3</Ink>
      <Calendar mode="multiple" value={days} onChange={setDays} max={3} weekStartsOn={1} locale="en-GB" showOutsideDays />
      <Ink tone="muted" style={s.muted}>{days.length ? days.map((d) => day(d)).join('  ·  ') : 'No sessions planned'}</Ink>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  screen: { flex: 1, justifyContent: 'center', padding: 16, gap: 12 },
  title: { fontSize: 15, fontWeight: '400' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  col: { flex: 1, gap: 2 },
  muted: { fontSize: 13 },
  strong: { fontSize: 15, fontWeight: '400' },
  pill: { paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '400' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
