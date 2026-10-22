import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Select } from '@/components/ui/select';
import { alpha, readableOn, useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ screen, style, ...rest }: ViewProps & { screen?: boolean }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        screen
          ? { flex: 1, backgroundColor: colors.background, padding: 18, gap: 14 }
          : {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.xl,
              padding: 18,
              gap: 14,
            },
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

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.heading}>
      <Ink style={s.title}>{title}</Ink>
      {sub ? (
        <Ink tone="muted" style={s.sub}>
          {sub}
        </Ink>
      ) : null}
    </View>
  );
}

/** Small icon tile for option rows. */
function Glyph({ d, tone }: { d: string; tone?: 'accent' | 'success' | 'warning' }) {
  const { colors, radius } = useKit();
  const c = tone ? colors[tone] : colors.mutedForeground;
  return (
    <View style={[s.glyph, { borderRadius: radius.scale(8), backgroundColor: tone ? alpha(c, 0.14) : colors.muted }]}>
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path d={d} stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

const ICON = {
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.2-6',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18ZM6 12H4a2 2 0 0 0-2 2v8h4M18 9h2a2 2 0 0 1 2 2v11h-4M10 6h4M10 10h4M10 14h4M10 18h4',
};

const flag = (f: string) => <Text maxFontSizeMultiplier={FONT_CAP} style={s.flag}>{f}</Text>;

/**
 * Clean product form — label above the field, helper + error, CTA.
 * This is the pattern that reads best in docs; other demos follow it.
 */
export function Validation({ screen }: DemoProps) {
  const { colors, radius } = useKit();
  const [size, setSize] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const missing = touched && !size;
  return (
    <Card screen={screen}>
      <Heading title="Merino crew sweater" sub="₹3,499 · Oatmeal" />
      <Select
        label="Size"
        floatingLabel={false}
        placeholder="Choose a size"
        size="sm"
        value={size}
        surface={colors.card}
        onValueChange={(v) => {
          setSize(v);
          setTouched(true);
        }}
        options={[
          { label: 'XS', value: 'XS', disabled: true, description: 'Sold out' },
          { label: 'S', value: 'S', description: 'Chest 34–36"' },
          { label: 'M', value: 'M', description: 'Chest 38–40"' },
          { label: 'L', value: 'L', description: 'Chest 42–44"' },
          { label: 'XL', value: 'XL', description: 'Chest 46–48"' },
        ]}
        error={missing ? 'Pick a size to add this to your bag' : undefined}
        helper={missing ? undefined : 'Runs true to size · free exchanges'}
      />
      <Pressable
        onPress={() => setTouched(true)}
        accessibilityRole="button"
        style={({ pressed }) => [s.button, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: pressed ? 0.88 : 1 }]}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={[s.buttonText, { color: colors.primaryForeground }]}>Add to bag</Text>
      </Pressable>
    </Card>
  );
}

/** Single select with icon tiles and descriptions — same label-above pattern. */
export function Plan({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Card screen={screen}>
      <Heading title="Workspace plan" sub="Billed monthly · change anytime" />
      <Select
        label="Plan"
        floatingLabel={false}
        placeholder="Select a plan"
        size="sm"
        defaultValue="pro"
        surface={colors.card}
        helper="You can switch plans later from billing."
        options={[
          { label: 'Hobby', value: 'hobby', description: 'Free · 1 project', icon: <Glyph d={ICON.leaf} tone="success" /> },
          { label: 'Pro', value: 'pro', description: '₹499 / seat · unlimited projects', icon: <Glyph d={ICON.bolt} tone="accent" /> },
          { label: 'Team', value: 'team', description: '₹1,499 / seat · SSO and audit log', icon: <Glyph d={ICON.users} tone="warning" /> },
          { label: 'Enterprise', value: 'enterprise', description: 'Talk to sales', icon: <Glyph d={ICON.building} />, disabled: true },
        ]}
      />
    </Card>
  );
}

/** Searchable, grouped list with flags. */
export function Country({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Card screen={screen}>
      <Heading title="Shipping address" sub="Where should we send this order?" />
      <Select
        searchable
        label="Country"
        floatingLabel={false}
        placeholder="Select country"
        searchPlaceholder="Search countries"
        size="sm"
        defaultValue="DE"
        surface={colors.card}
        options={[
          { label: 'United States', value: 'US', icon: flag('🇺🇸'), group: 'Americas' },
          { label: 'Canada', value: 'CA', icon: flag('🇨🇦'), group: 'Americas' },
          { label: 'Brazil', value: 'BR', icon: flag('🇧🇷'), group: 'Americas' },
          { label: 'United Kingdom', value: 'GB', icon: flag('🇬🇧'), group: 'Europe' },
          { label: 'Germany', value: 'DE', icon: flag('🇩🇪'), group: 'Europe' },
          { label: 'France', value: 'FR', icon: flag('🇫🇷'), group: 'Europe' },
          { label: 'India', value: 'IN', icon: flag('🇮🇳'), group: 'Asia Pacific' },
          { label: 'Japan', value: 'JP', icon: flag('🇯🇵'), group: 'Asia Pacific' },
          { label: 'Australia', value: 'AU', icon: flag('🇦🇺'), group: 'Asia Pacific' },
        ]}
      />
    </Card>
  );
}

const avatar = (initials: string, color: string) => (
  <View style={[s.avatar, { backgroundColor: color }]}>
    <Text maxFontSizeMultiplier={FONT_CAP} style={[s.initials, { color: readableOn(color) }]}>{initials}</Text>
  </View>
);

/** Multi-select: chips in the field, the menu stays open while toggling. */
export function Assignees({ screen }: DemoProps) {
  const { colors } = useKit();
  const [people, setPeople] = useState(['maya', 'leo']);
  return (
    <Card screen={screen}>
      <Heading title="Fix checkout crash on Android 14" sub="ENG-2142 · In progress" />
      <Select
        multiple
        searchable
        label="Assignees"
        floatingLabel={false}
        placeholder="Add teammates"
        searchPlaceholder="Search teammates"
        size="sm"
        values={people}
        onValuesChange={setPeople}
        surface={colors.card}
        options={[
          { label: 'Maya Chen', value: 'maya', description: 'Design', icon: avatar('MC', '#f472b6') },
          { label: 'Leo Martins', value: 'leo', description: 'iOS', icon: avatar('LM', '#60a5fa') },
          { label: 'Ana Ruiz', value: 'ana', description: 'Android', icon: avatar('AR', '#34d399') },
          { label: 'Sam Okafor', value: 'sam', description: 'Backend', icon: avatar('SO', '#fbbf24') },
          { label: 'Priya Nair', value: 'priya', description: 'QA', icon: avatar('PN', '#a78bfa') },
        ]}
      />
    </Card>
  );
}

/** presentation="sheet": a bottom sheet on phones, a dialog on wide screens. */
export function Sheet({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Card screen={screen}>
      <Heading title="Notifications" sub="Opens as a sheet instead of a dropdown" />
      <Select
        presentation="sheet"
        label="Email digest"
        floatingLabel={false}
        placeholder="How often?"
        title="How often?"
        size="sm"
        defaultValue="weekly"
        surface={colors.card}
        options={[
          { label: 'Daily', value: 'daily', description: 'Every morning at 8:00' },
          { label: 'Weekly', value: 'weekly', description: 'Mondays at 8:00' },
          { label: 'Monthly', value: 'monthly', description: 'First of the month' },
          { label: 'Never', value: 'never', description: 'Only security alerts' },
        ]}
      />
    </Card>
  );
}

/** Sizes match FloatingInput: sm 44 · md 54 · lg 64. */
export function Sizes({ screen }: DemoProps) {
  const { colors } = useKit();
  const opts = ['Daily', 'Weekly', 'Monthly'];
  return (
    <Card screen={screen} style={{ gap: 16 }}>
      <Select size="sm" label="Small" floatingLabel={false} placeholder="Pick one" defaultValue="Weekly" options={opts} surface={colors.card} />
      <Select size="md" label="Medium" floatingLabel={false} placeholder="Pick one" defaultValue="Weekly" options={opts} surface={colors.card} />
      <Select size="lg" label="Large" floatingLabel={false} placeholder="Pick one" defaultValue="Weekly" options={opts} surface={colors.card} />
      <Select disabled label="Disabled" floatingLabel={false} placeholder="Unavailable" defaultValue="Daily" options={opts} surface={colors.card} />
    </Card>
  );
}

/** `accent` recolours the focus ring, label, checks and chips. */
export function Colors({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Card screen={screen}>
      <Heading title="Project labels" sub="Accent colour drives focus, checks and chips" />
      <Select
        multiple
        label="Labels"
        floatingLabel={false}
        placeholder="Add labels"
        size="sm"
        accent={colors.success}
        defaultValues={['frontend', 'perf']}
        surface={colors.card}
        options={[
          { label: 'Frontend', value: 'frontend' },
          { label: 'Performance', value: 'perf' },
          { label: 'Accessibility', value: 'a11y' },
          { label: 'Docs', value: 'docs' },
        ]}
      />
      <Select
        label="Priority"
        floatingLabel={false}
        placeholder="Set priority"
        size="sm"
        accent={colors.warning}
        defaultValue="p1"
        surface={colors.card}
        options={[
          { label: 'Urgent', value: 'p0', icon: <Dot color={colors.danger} /> },
          { label: 'High', value: 'p1', icon: <Dot color={colors.warning} /> },
          { label: 'Medium', value: 'p2', icon: <Dot color={colors.accent} /> },
          { label: 'Low', value: 'p3', icon: <Dot color={colors.mutedForeground} /> },
        ]}
      />
    </Card>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Circle cx={7} cy={7} r={5} fill={color} />
    </Svg>
  );
}

const s = StyleSheet.create({
  heading: { gap: 3, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: '400', letterSpacing: -0.2 },
  sub: { fontSize: 13, lineHeight: 18 },
  glyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  flag: { fontSize: 18 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 10.5, fontWeight: '400' },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  buttonText: { fontSize: 15, fontWeight: '400' },
});
