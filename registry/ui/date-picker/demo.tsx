import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';

import { DatePicker, type DatePickerPresentation, type DateRange } from '@/components/ui/date-picker';
import { useKit } from '@/lib/kit';

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        s.card,
        { borderRadius: radius.xl, borderColor: colors.border, backgroundColor: colors.card },
        style,
      ]}
      {...rest}
    />
  );
}

/** Text in the kit's ink: `tone="muted"` for secondary copy. */
function Ink({ tone, style, ...rest }: TextProps & { tone?: 'muted' }) {
  const { colors } = useKit();
  return <Text style={[{ color: tone === 'muted' ? colors.mutedForeground : colors.foreground }, style]} {...rest} />;
}

const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

type Opens = Exclude<DatePickerPresentation, 'auto'>;
const OPENS: { key: Opens; label: string }[] = [
  { key: 'sheet', label: 'Sheet' },
  { key: 'dialog', label: 'Modal' },
  { key: 'popover', label: 'Popover' },
];

/** Card header with a compact switch for how the picker opens. */
function Header({ title, opens, onOpens }: { title: string; opens: Opens; onOpens: (o: Opens) => void }) {
  const { colors, radius } = useKit();
  return (
    <View style={s.header}>
      <Text style={[s.title, { color: colors.foreground }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[s.switch, { backgroundColor: colors.muted, borderRadius: radius.md }]} accessibilityRole="radiogroup">
        {OPENS.map((o) => {
          const on = o.key === opens;
          return (
            <Pressable
              key={o.key}
              onPress={() => onOpens(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Open as ${o.label}`}
              style={[s.switchItem, { borderRadius: Math.max(0, radius.md - 3) }, on && { backgroundColor: colors.background }]}
            >
              <Text style={[s.switchText, { color: on ? colors.foreground : colors.mutedForeground }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Birthday() {
  const [date, setDate] = useState<Date | null>(new Date(1994, 5, 12));
  const age = date ? Math.floor((today.getTime() - date.getTime()) / (365.25 * 86400000)) : null;
  const [opens, setOpens] = useState<Opens>('sheet');
  return (
    <Card>
      <Header title="Profile" opens={opens} onOpens={setOpens} />
      <DatePicker
        key={opens}
        presentation={opens}
        label="Date of birth"
        value={date}
        onChange={setDate}
        maxDate={today}
        formatOptions={{ day: 'numeric', month: 'long', year: 'numeric' }}
        helper={age !== null ? `You're ${age}. Tap the month title to jump years.` : 'Used to personalise your plan.'}
      />
    </Card>
  );
}

export function TripDates() {
  const [trip, setTrip] = useState<DateRange | null>(null);
  const nights = trip?.start && trip.end ? Math.round((trip.end.getTime() - trip.start.getTime()) / 86400000) : 0;
  const [opens, setOpens] = useState<Opens>('dialog');
  return (
    <Card>
      <Header title="Trip · Kyoto" opens={opens} onOpens={setOpens} />
      <DatePicker
        key={opens}
        presentation={opens}
        mode="range"
        label="Check-in – Check-out"
        title="When are you travelling?"
        placeholder="Add dates"
        value={trip}
        onChange={setTrip}
        presets
        confirm
        clearable
        minDate={today}
        success={nights ? `${nights} night${nights > 1 ? 's' : ''} · free cancellation until 48h before` : undefined}
      />
    </Card>
  );
}

export function Deadline() {
  const { colors, radius } = useKit();
  const [due, setDue] = useState<Date | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [opens, setOpens] = useState<Opens>('popover');
  return (
    <Card>
      <Header title="New task" opens={opens} onOpens={setOpens} />
      <DatePicker
        key={opens}
        presentation={opens}
        label="Due date"
        value={due}
        onChange={setDue}
        minDate={today}
        isDateDisabled={(d) => d.getDay() === 0 || d.getDay() === 6}
        presets={[
          { label: 'Tomorrow', value: () => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) },
          { label: 'End of month', value: () => new Date(today.getFullYear(), today.getMonth() + 1, 0) },
        ]}
        error={submitted && !due ? 'Pick a due date so the team can plan around it' : undefined}
        helper="Weekdays only."
      />
      <Pressable
        onPress={() => setSubmitted(true)}
        style={({ pressed }) => [s.button, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
      >
        <Text style={[s.buttonText, { color: colors.accentForeground }]}>Create task</Text>
      </Pressable>
    </Card>
  );
}

export function Sizes() {
  const d = new Date(today.getFullYear(), today.getMonth(), 24);
  return (
    <Card>
      <Ink tone="muted" style={s.label}>Small</Ink>
      <DatePicker size="sm" label="Invoice date" defaultValue={d} />
      <Ink tone="muted" style={s.label}>Medium</Ink>
      <DatePicker size="md" label="Invoice date" defaultValue={d} />
      <Ink tone="muted" style={s.label}>Large</Ink>
      <DatePicker size="lg" label="Invoice date" defaultValue={d} />
      <Ink tone="muted" style={s.label}>Disabled</Ink>
      <DatePicker disabled label="Invoice date" defaultValue={d} />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flexShrink: 1, fontSize: 15, fontWeight: '400' },
  switch: { flexDirection: 'row', padding: 3 },
  switchItem: { height: 28, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 12.5, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: -6 },
  button: { height: 46, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '400' },
});
