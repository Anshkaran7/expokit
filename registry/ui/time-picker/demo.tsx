import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';

import { TimePicker, formatTime, type TimeValue } from '@/components/ui/time-picker';
import { useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, screen, ...rest }: ViewProps & { screen?: boolean }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        s.card,
        screen
          ? { flex: 1, borderWidth: 0, backgroundColor: colors.background }
          : { borderRadius: radius.xl, borderColor: colors.border, backgroundColor: colors.card },
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

/** "in 7 h 20 min" until the next occurrence of `t`. */
function until(t: TimeValue) {
  const now = new Date();
  let diff = t.hours * 60 + t.minutes - (now.getHours() * 60 + now.getMinutes());
  if (diff <= 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  return h ? `in ${h} h ${diff % 60} min` : `in ${diff} min`;
}

export function Alarm({ screen }: DemoProps) {
  const [time, setTime] = useState<TimeValue>({ hours: 6, minutes: 45 });
  return (
    <Card screen={screen}>
      <View style={s.head}>
        <View style={s.headText}>
          <Ink style={s.title}>Wake up</Ink>
          <Ink tone="muted" style={s.meta}>Weekdays · Radar</Ink>
        </View>
        <Ink tone="muted" style={[s.meta, { flexShrink: 1 }]}>{until(time)}</Ink>
      </View>
      <TimePicker value={time} onChange={setTime} hour12 />
    </Card>
  );
}

export function Clock({ screen }: DemoProps) {
  const { colors, radius } = useKit();
  const [time, setTime] = useState<TimeValue>({ hours: 7, minutes: 30 });
  return (
    <Card screen={screen}>
      <View style={s.headText}>
        <Ink style={s.title}>Morning run</Ink>
        <Ink tone="muted" style={s.meta}>Tap the hour or minute, then drag the dial.</Ink>
      </View>
      <TimePicker variant="clock" value={time} onChange={setTime} hour12 />
      <View style={[s.note, { backgroundColor: colors.muted, borderRadius: radius.md }]}>
        <Ink tone="muted" style={s.meta}>Rings {until(time)}</Ink>
      </View>
    </Card>
  );
}

export function Appointment({ screen }: DemoProps) {
  const { colors, radius } = useKit();
  const [slot, setSlot] = useState<TimeValue | null>(null);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Dr. Amara Okafor · Dermatology</Ink>
      <TimePicker
        variant="chips"
        value={slot}
        onChange={setSlot}
        hour12
        startTime="09:00"
        endTime="18:00"
        minuteInterval={30}
        bookedTimes={['09:30', '10:00', '11:30', '13:00', '14:30', '15:00', '17:30']}
        disabledTimes={['12:00', '12:30']}
        groupByPeriod
      />
      <Pressable
        disabled={!slot}
        style={[s.button, { backgroundColor: colors.accent, borderRadius: radius.md }, !slot && s.buttonOff]}
        accessibilityRole="button"
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[s.buttonText, { color: colors.accentForeground }]}>{slot ? `Book ${formatTime(slot)} · 30 min` : 'Choose a time'}</Text>
      </Pressable>
    </Card>
  );
}

export function Reminder({ screen }: DemoProps) {
  const [time, setTime] = useState<TimeValue>({ hours: 21, minutes: 30 });
  return (
    <Card screen={screen}>
      <View style={s.head}>
        <Ink style={[s.title, { flexShrink: 1 }]}>Daily journal reminder</Ink>
        <Ink tone="muted" style={s.meta}>{formatTime(time, false)}</Ink>
      </View>
      <TimePicker value={time} onChange={setTime} hour12={false} minuteInterval={15} />
      <Ink tone="muted" style={s.hint}>24-hour clock, 15-minute steps.</Ink>
    </Card>
  );
}

export function InSheet({ screen }: DemoProps) {
  const [pickup, setPickup] = useState<TimeValue | null>({ hours: 18, minutes: 15 });
  const [delivery, setDelivery] = useState<TimeValue | null>(null);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Order #4821 · Green Basket</Ink>
      <TimePicker presentation="sheet" label="Pickup time" title="When will you pick up?" value={pickup} onChange={setPickup} minuteInterval={5} hour12 />
      <TimePicker
        presentation="sheet"
        variant="chips"
        label="Delivery slot"
        title="Choose a delivery slot"
        value={delivery}
        onChange={setDelivery}
        hour12
        startTime="08:00"
        endTime="21:00"
        minuteInterval={60}
        bookedTimes={['08:00', '12:00', '18:00']}
        groupByPeriod
        success={delivery ? 'Free delivery in this slot' : undefined}
        helper="We'll text you when the driver is close."
      />
    </Card>
  );
}

export function ClockInSheet({ screen }: DemoProps) {
  const [start, setStart] = useState<TimeValue | null>({ hours: 9, minutes: 0 });
  const [end, setEnd] = useState<TimeValue | null>(null);
  return (
    <Card screen={screen}>
      <Ink style={s.title}>Focus block · Thursday</Ink>
      <TimePicker presentation="sheet" variant="clock" label="Starts" title="Start time" value={start} onChange={setStart} hour12 />
      <TimePicker
        presentation="sheet"
        variant="clock"
        label="Ends"
        title="End time"
        value={end}
        onChange={setEnd}
        minuteInterval={5}
        hour12
        helper="Snaps to 5-minute steps."
      />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: 12, rowGap: 4 },
  headText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '400' },
  meta: { fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12.5, textAlign: 'center' },
  note: { paddingVertical: 10, alignItems: 'center' },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '400' },
});
