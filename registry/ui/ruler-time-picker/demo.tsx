import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RulerTimePicker, type TimeValue } from '@/components/ui/ruler-time-picker';
import { alpha, useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

// The screen behind the sheet, drawn as soft shapes (blurred text is unreadable anyway). Faint
// copies offset in rings blend their edges into a frosted blur without a native blur view, so it
// works in Expo Go and on web.
const BLUR: [number, number][] = [2, 4, 7, 10].flatMap((r, ring) =>
  Array.from({ length: 8 }, (_, i): [number, number] => {
    const a = ((i + ring / 2) / 8) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }),
);

/** The settings screen the sheet was opened from, as blocks: a title, a grouped list and toggles. */
const SettingsScreen = React.memo(function SettingsScreen() {
  const { colors, radius, dark } = useKit();
  // In dark mode the grouped rows sit a step lighter than the screen, like iOS Settings.
  const group = dark ? colors.secondary : colors.card;
  const rows: [number, 'value' | 'on' | 'off'][] = [
    [0.42, 'value'],
    [0.3, 'value'],
    [0.38, 'on'],
    [0.34, 'on'],
    [0.4, 'off'],
    [0.28, 'value'],
  ];
  const bar = (w: number | `${number}%`, h: number, color: string) => (
    <View style={{ width: w, height: h, backgroundColor: color, borderRadius: radius.capsule(h) }} />
  );
  return (
    <View style={s.screen}>
      {bar(150, 30, alpha(colors.foreground, 0.7))}
      <View style={[s.group, { backgroundColor: group, borderRadius: radius.lg }]}>
        {rows.map(([w, kind], i) => (
          <View key={i} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            {bar(`${w * 100}%`, 14, alpha(colors.foreground, 0.45))}
            {kind === 'value' ? (
              bar(64, 14, colors.mutedForeground)
            ) : (
              <View style={[s.toggle, { backgroundColor: kind === 'on' ? colors.accent : colors.border, borderRadius: radius.capsule(28) }]}>
                <View style={[s.knob, { backgroundColor: colors.background, alignSelf: kind === 'on' ? 'flex-end' : 'flex-start', borderRadius: radius.capsule(24) }]} />
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={[s.group, s.card2, { backgroundColor: group, borderRadius: radius.lg }]}>
        {bar('55%', 14, alpha(colors.foreground, 0.45))}
        {bar('80%', 12, colors.mutedForeground)}
      </View>
    </View>
  );
});

/** A bottom sheet over a blurred, dimmed screen, with a Done button under the picker. */
function Sheet({ screen, bottomInset = 0, children }: DemoProps & { children: React.ReactNode }) {
  const { colors, radius, dark } = useKit();
  return (
    <View
      style={[
        s.frame,
        { backgroundColor: colors.muted },
        screen ? s.frameScreen : { borderRadius: radius.xl, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {BLUR.map(([x, y], i) => (
          <View key={i} style={[StyleSheet.absoluteFill, { opacity: 1 / 12, transform: [{ translateX: x }, { translateY: y }] }]}>
            <SettingsScreen />
          </View>
        ))}
        {/* A lighter dim than a modal's, so the screen behind still reads as a screen. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dark ? 0.45 : 0.5 }]} />
      </View>
      {/* Raised above the screen: an elevated (lighter) surface in dark mode, and a hairline edge in both. */}
      <View
        style={[
          s.sheet,
          {
            backgroundColor: dark ? colors.border : colors.card,
            borderColor: dark ? alpha(colors.foreground, 0.12) : colors.border,
            borderRadius: radius.scale(32),
            marginBottom: 8 + bottomInset,
          },
        ]}
      >
        <View style={[s.grabber, { backgroundColor: alpha(colors.foreground, dark ? 0.3 : 0.15), borderRadius: radius.capsule(5) }]} />
        {children}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [s.button, { backgroundColor: colors.primary, borderRadius: radius.lg, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text maxFontSizeMultiplier={FONT_CAP} style={[s.buttonText, { color: colors.primaryForeground }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Drag the ruler, every digit rolls with a motion blur. */
export function Reminder(props: DemoProps) {
  const [time, setTime] = useState<TimeValue>({ hours: 2, minutes: 15 });
  return (
    <Sheet {...props}>
      <RulerTimePicker label="Reminder time:" value={time} onChange={setTime} />
    </Sheet>
  );
}

/** `mode="date"`: a tick per day, month starts marked, no past days. */
export function Delivery(props: DemoProps) {
  const [today] = useState(() => new Date());
  const [date, setDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));
  return (
    <Sheet {...props}>
      <RulerTimePicker mode="date" label="Delivery date:" value={date} onChange={setDate} minDate={today} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  frame: { alignSelf: 'stretch', minHeight: 400, justifyContent: 'flex-end', overflow: 'hidden', paddingHorizontal: 8 },
  frameScreen: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  card2: { paddingVertical: 16, gap: 10 },
  group: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50 },
  toggle: { width: 46, height: 28, padding: 2, justifyContent: 'center' },
  knob: { width: 24, height: 24 },
  sheet: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  grabber: { alignSelf: 'center', width: 40, height: 5 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
