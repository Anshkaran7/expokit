import React, { useState } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { Slider } from '@/components/ui/slider';
import { useKit } from '@/lib/kit';

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl }, style]}
      {...rest}
    />
  );
}

function Header({ title, value }: { title: string; value?: string }) {
  const { colors } = useKit();
  return (
    <View style={s.head}>
      <Text style={[s.title, { color: colors.foreground }]}>{title}</Text>
      {value ? <Text style={[s.value, { color: colors.mutedForeground }]}>{value}</Text> : null}
    </View>
  );
}

export function ControlCenter() {
  const [brightness, setBrightness] = useState(72);
  return (
    <Card>
      <Header title="Display & sound" />
      <Slider
        variant="bar"
        size="lg"
        step={0}
        value={brightness}
        onValueChange={setBrightness}
        icon="sun-high"
        showValue="always"
        formatValue={(v) => `${Math.round(v)}%`}
        accessibilityLabel="Brightness"
      />
      <Slider variant="bar" size="lg" defaultValue={40} icon="volume-high" accessibilityLabel="Volume" />
    </Card>
  );
}

export function Default() {
  const [volume, setVolume] = useState(64);
  return (
    <Card>
      <Header title="Media volume" value={`${volume}%`} />
      <Slider
        value={volume}
        onValueChange={setVolume}
        leftIcon="volume-low"
        rightIcon="volume-high"
        formatValue={(v) => `${v}%`}
        accessibilityLabel="Media volume"
      />
    </Card>
  );
}

const PRICE_MAX = 2000;
const rupees = (v: number) => `₹${String(v).replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')}`;
const PRICES = [2, 4, 7, 11, 16, 22, 30, 34, 38, 33, 29, 26, 21, 18, 14, 12, 9, 7, 5, 4, 3, 2, 2, 1];

export function PriceRange() {
  const { colors } = useKit();
  const [price, setPrice] = useState<[number, number]>([400, 1400]);
  const per = PRICE_MAX / PRICES.length;
  const results = PRICES.reduce((n, c, i) => (i * per + per / 2 >= price[0] && i * per + per / 2 <= price[1] ? n + c : n), 0);
  return (
    <Card>
      <Header title="Price" value={`${rupees(price[0])} – ${rupees(price[1])}${price[1] === PRICE_MAX ? '+' : ''}`} />
      <Slider
        range
        min={0}
        max={PRICE_MAX}
        step={50}
        value={price}
        onValueChange={setPrice}
        histogram={PRICES}
        histogramHeight={40}
        showMinMax
        maxLabel={`${rupees(PRICE_MAX)}+`}
        formatValue={rupees}
        accessibilityLabel="Price"
      />
      <Text style={[s.note, { color: colors.mutedForeground }]}>{results * 3} stays match</Text>
    </Card>
  );
}

export function FontSize() {
  const { colors } = useKit();
  const [size, setSize] = useState(17);
  const glyph = (px: number) => <Text style={{ color: colors.mutedForeground, fontSize: px, fontWeight: '400' }}>A</Text>;
  return (
    <Card>
      <Header title="Text size" value={`${size} pt`} />
      <Text style={{ color: colors.foreground, fontSize: size, lineHeight: size * 1.35 }}>
        Your reading view will look like this.
      </Text>
      <Slider
        variant="stepped"
        min={13}
        max={23}
        step={2}
        value={size}
        onValueChange={setSize}
        leftIcon={glyph(13)}
        rightIcon={glyph(21)}
        showValue="never"
        accessibilityLabel="Text size"
      />
    </Card>
  );
}

export function Sizes() {
  const { colors } = useKit();
  const label = (t: string) => <Text style={[s.label, { color: colors.mutedForeground }]}>{t}</Text>;
  return (
    <Card>
      {label('Small')}
      <Slider size="sm" defaultValue={25} accessibilityLabel="Small" />
      {label('Medium')}
      <Slider size="md" defaultValue={50} accessibilityLabel="Medium" />
      {label('Large')}
      <Slider size="lg" defaultValue={75} accessibilityLabel="Large" />
      {label('Disabled')}
      <Slider defaultValue={40} disabled accessibilityLabel="Disabled" />
    </Card>
  );
}

export function Colors() {
  const { colors } = useKit();
  return (
    <Card>
      <Header title="Daily goals" />
      <Slider defaultValue={80} accent={colors.success} showValue="always" formatValue={(v) => `${v}% steps`} accessibilityLabel="Steps" />
      <Slider variant="bar" size="sm" defaultValue={55} accent={colors.warning} accessibilityLabel="Calories" />
      <Slider variant="stepped" min={0} max={10} step={1} defaultValue={3} accent={colors.danger} accessibilityLabel="Screen time hours" />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 15, fontWeight: '400' },
  value: { fontSize: 15, fontWeight: '400', fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: -8 },
  note: { fontSize: 13 },
});
