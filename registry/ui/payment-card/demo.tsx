import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { PaymentCard } from '@/components/ui/payment-card';
import { alpha, useKit } from '@/lib/kit';

/** Soft, blurred photos make premium card art — any image works (`require()` or a URL). */
const art = (id: number) => ({ uri: `https://picsum.photos/id/${id}/240/151?blur=10` });

/** A screen title, as it sits above the card in your app. */
function Header({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const { colors } = useKit();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>{title}</Text>
        {sub ? <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const DESIGNS = [
  { key: 'meadow', image: art(189) },
  { key: 'lagoon', image: art(846) },
  { key: 'violet', image: art(888) },
  { key: 'dusk', image: art(721) },
  { key: 'night', image: art(765) },
];

/** Wallet home: balance, the card (tilt it, tap to flip), quick actions and recent activity. */
export function WalletScreen() {
  const { colors } = useKit();
  const actions = [
    ['↑', 'Send'],
    ['↓', 'Request'],
    ['+', 'Top up'],
    ['⋯', 'More'],
  ];
  const activity = [
    ['B', 'Blue Tokai Coffee', 'Today · 09:12', '−₹240'],
    ['U', 'Uber', 'Yesterday · 21:40', '−₹386'],
    ['S', 'Salary · Northwind Labs', 'Mon · 10:00', '+₹82,000'],
  ];
  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Total balance</Text>
          <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>₹1,24,580.20</Text>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: '500' }}>+₹2,140 this week</Text>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>MP</Text>
        </View>
      </View>

      <PaymentCard
        image={art(189)}
        bank="Northwind"
        label="World Elite"
        number="5412 7590 1234 0317"
        name="Maya Patel"
        expiry="09/29"
        cvv="482"
        brand="mastercard"
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {actions.map(([glyph, label]) => (
          <View key={label} style={{ alignItems: 'center', gap: 6, width: 64 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '500' }}>{glyph}</Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>

      <View>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Recent activity</Text>
        {activity.map(([initial, what, when, amount]) => (
          <View key={what} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '500' }}>{what}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{when}</Text>
            </View>
            <Text style={{ color: amount.startsWith('+') ? colors.success : colors.foreground, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{amount}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Card controls: reveal the number, show the CVV, freeze the card. */
export function CardControls() {
  const { colors } = useKit();
  const [shown, setShown] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const row = (label: string, detail: string, value: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '500' }}>{label}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{detail}</Text>
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.success : alpha(colors.mutedForeground, 0.3) }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
  return (
    <View style={{ gap: 14 }}>
      <Header title="Manage card" sub="Changes apply instantly" />
      <PaymentCard
        image={art(888)}
        bank="Northwind"
        label="Platinum"
        number="4821 7590 3321 7752"
        name="Maya Patel"
        expiry="11/28"
        cvv="219"
        brand="visa"
        chip="silver"
        masked={!shown}
        frozen={frozen}
        flipped={flipped}
        onFlip={setFlipped}
      />
      <View>
        {row('Show card number', 'Hidden again when you leave', shown, () => setShown((v) => !v))}
        {row('Show CVV', 'Turns the card over', flipped, () => setFlipped((v) => !v))}
        {row('Freeze card', 'Blocks new payments instantly', frozen, () => setFrozen((v) => !v))}
      </View>
    </View>
  );
}

/** Choose a design — the card updates live as you pick. */
export function ChooseDesign() {
  const { colors } = useKit();
  const [pick, setPick] = useState(0);
  return (
    <View style={{ gap: 16 }}>
      <Header title="Pick your card" sub="Your design ships in 3–5 days" />
      <PaymentCard
        image={DESIGNS[pick].image}
        bank="Northwind"
        label="Debit"
        number="6521 4400 9911 4410"
        name="Maya Patel"
        expiry="01/30"
        brand="rupay"
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {DESIGNS.map((d, i) => {
          const on = i === pick;
          return (
            <Pressable
              key={d.key}
              onPress={() => setPick(i)}
              accessibilityRole="radio"
              accessibilityLabel={d.key}
              accessibilityState={{ selected: on }}
              style={{ padding: 2, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.foreground : 'transparent' }}
            >
              <Image alt="" source={d.image} style={{ width: 52, height: 33, borderRadius: 6, backgroundColor: colors.muted }} />
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, marginTop: 8 }}>
        <Text style={{ color: colors.primaryForeground, fontSize: 15, fontWeight: '600' }}>Order this card</Text>
      </Pressable>
    </View>
  );
}

/** Add a card: the number fills in live (graphite default, no image). */
export function AddCard() {
  const { colors } = useKit();
  const [digits, setDigits] = useState('4821');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  return (
    <View style={{ gap: 16 }}>
      <Header title="Add a card" sub="Type the number on the front" />
      <PaymentCard bank="New card" number={digits.padEnd(16, '•')} name="Your name" expiry="MM/YY" brand="visa" chip="silver" masked={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {keys.map((k) => (
          <Pressable
            key={k}
            onPress={() => setDigits((d) => (d.length >= 16 ? '4821' : d + k))}
            accessibilityRole="button"
            style={{ width: 58, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}
          >
            <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: '500' }}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
