import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { Stepper } from '@/components/ui/stepper';
import { useKit } from '@/lib/kit';

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 16, gap: 12 },
        style,
      ]}
      {...rest}
    />
  );
}

const eyebrow = { fontSize: 12, fontWeight: '400', letterSpacing: 0.6, textTransform: 'uppercase' } as const;
// Indian digit grouping (₹1,23,456) by hand — Hermes may ignore toLocaleString locales.
const money = (n: number) => {
  const [int, frac] = n.toFixed(2).split('.');
  return `₹${int.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')}${frac === '00' ? '' : `.${frac}`}`;
};

const MENU = [
  { key: 'bowl', emoji: '🥗', name: 'Harvest bowl', note: 'Kale, squash, tahini', price: 349 },
  { key: 'ramen', emoji: '🍜', name: 'Miso ramen', note: 'Spicy · extra egg', price: 420 },
  { key: 'mochi', emoji: '🍡', name: 'Mochi trio', note: 'Matcha, yuzu, sesame', price: 180 },
];

export function Cart() {
  const { colors, radius } = useKit();
  const [qty, setQty] = useState<Record<string, number>>({ bowl: 1, ramen: 2, mochi: 0 });
  const total = MENU.reduce((sum, it) => sum + it.price * (qty[it.key] ?? 0), 0);
  return (
    <Card>
      <Text style={[eyebrow, { color: colors.mutedForeground }]}>Your order</Text>
      {MENU.map((it) => (
        <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.scale(12), backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>{it.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '400', color: colors.foreground }}>{it.name}</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{money(it.price)} · {it.note}</Text>
          </View>
          <Stepper
            variant="cart"
            size="sm"
            value={qty[it.key]}
            onValueChange={(n) => setQty((q) => ({ ...q, [it.key]: n }))}
            max={9}
            accessibilityLabel={`${it.name} quantity`}
          />
        </View>
      ))}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 15, fontWeight: '400', color: colors.foreground }}>Subtotal</Text>
        <Text style={{ fontSize: 18, fontWeight: '400', color: colors.foreground, fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
      </View>
    </Card>
  );
}

export function Guests() {
  const { colors } = useKit();
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const cap = 6;
  const rule = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
  return (
    <Card style={{ gap: 14 }}>
      <Stepper label="Adults" description="Ages 13 or above" value={adults} onValueChange={setAdults} min={1} max={cap - children} />
      {rule}
      <Stepper label="Children" description="Ages 2–12" value={children} onValueChange={setChildren} max={cap - adults} />
      {rule}
      <Stepper label="Infants" description="Under 2" value={infants} onValueChange={setInfants} max={5} />
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
        This place has a maximum of {cap} guests, not including infants.
      </Text>
    </Card>
  );
}

export function AddToBag() {
  const { colors, radius } = useKit();
  const [qty, setQty] = useState(1);
  const price = 1899;
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '400', color: colors.foreground }}>Linen overshirt</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Sand · Size M · Free returns</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Stepper variant="filled" size="lg" value={qty} onValueChange={setQty} min={1} max={10} accessibilityLabel="Quantity" />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: 44,
            borderRadius: radius.capsule(44),
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '400', color: colors.primaryForeground, fontVariant: ['tabular-nums'] }}>
            Add to bag · {money(price * qty)}
          </Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Only 10 left — hold + to add faster.</Text>
    </Card>
  );
}

export function Menu() {
  const { colors } = useKit();
  return (
    <Card>
      <Text style={[eyebrow, { color: colors.mutedForeground }]}>Popular</Text>
      <Stepper variant="cart" addLabel="Add" label="Pistachio croissant" description="₹220 · Baked this morning" accessibilityLabel="Pistachio croissant" />
      <Stepper variant="cart" addLabel="Add" label="Iced oat latte" description="₹280 · 16 oz" defaultValue={1} accessibilityLabel="Iced oat latte" />
    </Card>
  );
}

export function Formatted() {
  return (
    <Card style={{ gap: 16 }}>
      <Stepper variant="filled" size="sm" label="Nights" description="Check-in Fri, Oct 24" defaultValue={3} min={1} max={28} suffix={(n) => (n === 1 ? 'night' : 'nights')} />
      <Stepper variant="filled" size="sm" label="Driver tip" description="100% goes to your driver" defaultValue={50} step={10} min={0} max={500} format={money} />
      <Stepper variant="filled" size="sm" label="Search radius" defaultValue={2.5} step={0.5} min={0.5} max={10} suffix="km" />
      <Stepper variant="compact" label="Seats" description="₹499 per seat / month" defaultValue={5} min={1} max={50} />
    </Card>
  );
}

export function Sizes() {
  const { colors } = useKit();
  const row = (name: string, el: React.ReactNode) => (
    <View key={name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
      <Text style={{ fontSize: 13, fontWeight: '400', color: colors.mutedForeground }}>{name}</Text>
      {el}
    </View>
  );
  return (
    <Card style={{ gap: 4 }}>
      {row('Small', <Stepper size="sm" defaultValue={2} max={20} accessibilityLabel="Small stepper" />)}
      {row('Medium', <Stepper size="md" defaultValue={2} max={20} accessibilityLabel="Medium stepper" />)}
      {row('Large', <Stepper size="lg" defaultValue={2} max={20} accessibilityLabel="Large stepper" />)}
      {row('Compact', <Stepper variant="compact" defaultValue={2} max={20} accessibilityLabel="Compact stepper" />)}
    </Card>
  );
}

export function Colors() {
  const { colors } = useKit();
  return (
    <Card style={{ gap: 16 }}>
      <Stepper variant="filled" accent={colors.success} label="Water" description="Glasses today" defaultValue={6} max={12} />
      <Stepper variant="compact" accent={colors.warning} label="Espresso shots" defaultValue={2} max={4} />
      <Stepper variant="cart" accent={colors.danger} addLabel="Add" label="Hot sauce" description="₹30 each" />
    </Card>
  );
}
