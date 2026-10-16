import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Button3D } from '@/components/ui/button-3d';
import { useKit } from '@/lib/kit';

/** Any photo works (`require()` or a URL). `blur` gives soft, abstract art. */
const photo = (id: number, w: number, h: number, blur = false) => ({ uri: `https://picsum.photos/id/${id}/${w}/${h}${blur ? '?blur=10' : ''}` });

/** A screen title, as it sits above the content in your app. */
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

/** A trip planner's start screen: frosted-glass keys on a photo. */
export function OnPhoto() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 18 }}>
      <Header
        title="Good morning, Maya"
        sub="Your trip starts in 3 days"
        right={
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>MP</Text>
          </View>
        }
      />
      <View style={{ height: 440, borderRadius: 28, overflow: 'hidden', backgroundColor: '#1a2a22' }}>
        <Image alt="" source={photo(1039, 700, 880)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' }} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 22, gap: 16 }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }}>OREGON · 3 DAYS</Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Multnomah Falls</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>Waterfalls, old-growth forest and a lodge by the river</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Button3D appearance="glass" size="lg" shape="pill" style={{ flex: 1 }} block>
              Start the trip
            </Button3D>
            <Button3D appearance="glass" size="lg" shape="circle" accessibilityLabel="Save">
              ♡
            </Button3D>
            <Button3D appearance="glass" size="lg" shape="circle" accessibilityLabel="Share">
              ↗
            </Button3D>
          </View>
        </View>
      </View>
    </View>
  );
}

/** A passcode screen: a PIN pad of light keycaps. */
export function Keypad() {
  const { colors } = useKit();
  const [pin, setPin] = useState('');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <View style={{ gap: 26, alignItems: 'center' }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>Enter passcode</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>to unlock Northwind</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i < pin.length ? colors.foreground : colors.border }} />
        ))}
      </View>
      <View style={{ width: 252, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {keys.map((k, i) =>
          k ? (
            <Button3D
              key={k}
              appearance="light"
              size="lg"
              style={{ width: 76 }}
              accessibilityLabel={k === '⌫' ? 'Delete' : k}
              onPress={() => setPin((p) => (k === '⌫' ? p.slice(0, -1) : (p + k).slice(0, 4)))}
            >
              {k}
            </Button3D>
          ) : (
            <View key={`gap-${i}`} style={{ width: 76 }} />
          )
        )}
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: '500' }}>Forgot passcode?</Text>
    </View>
  );
}

/** Checkout: the main action sinks, then spins while it works. */
export function Checkout() {
  const { colors } = useKit();
  const [busy, setBusy] = useState(false);
  const items = [
    { img: 766, name: 'House blend beans', detail: '250 g · ×2', price: '₹880' },
    { img: 1060, name: 'Pour-over filters', detail: 'Pack of 100', price: '₹120' },
  ];
  const line = (label: string, value: string, strong = false) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: strong ? colors.foreground : colors.mutedForeground, fontSize: strong ? 16 : 14, fontWeight: strong ? '700' : '400' }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontSize: strong ? 16 : 14, fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <Header title="Checkout" sub="2 items · arrives tomorrow" />
      <View style={{ gap: 12 }}>
        {items.map((it) => (
          <View key={it.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image alt="" source={photo(it.img, 120, 120)} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600' }}>{it.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{it.detail}</Text>
            </View>
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{it.price}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
        {line('Subtotal', '₹1,000')}
        {line('Express delivery', '₹240')}
        {line('Total', '₹1,240', true)}
      </View>
      <View style={{ gap: 12 }}>
        <Button3D
          block
          size="lg"
          loading={busy}
          onPress={() => {
            setBusy(true);
            setTimeout(() => setBusy(false), 1500);
          }}
        >
          Pay ₹1,240
        </Button3D>
        <Button3D block size="md" color={colors.muted}>
          Add a promo code
        </Button3D>
      </View>
    </View>
  );
}

/** Keycaps — press and hold one to feel it sink. */
export function Keycaps() {
  const row = (keys: [string, number?][], appearance: 'light' | 'dark') => (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {keys.map(([k, w]) => (
        <Button3D key={k} appearance={appearance} size="lg" style={{ width: w ?? 56 }} accessibilityLabel={k}>
          {k}
        </Button3D>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 22 }}>
      <Header title="Keycaps" sub="Press and hold a key to feel it sink" />
      <View style={{ gap: 12 }}>
        {row([['esc', 64], ['Q'], ['W'], ['E'], ['R']], 'light')}
        {row([['⌘', 64], ['A'], ['S'], ['D'], ['F']], 'dark')}
        {row([['space', 196], ['↵', 92]], 'light')}
      </View>
    </View>
  );
}

/** Light, dark and glass keycaps, and a custom colour. */
export function Materials() {
  return (
    <View style={{ gap: 18 }}>
      <Header title="Materials" sub="Light, dark, frosted glass — or any colour" />
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        <Button3D appearance="light">Light</Button3D>
        <Button3D appearance="dark">Dark</Button3D>
        <Button3D color="#ff5a5f">Custom</Button3D>
      </View>
      <View style={{ borderRadius: 22, overflow: 'hidden', padding: 18, alignItems: 'center', backgroundColor: '#3a2b55' }}>
        <Image alt="" source={photo(888, 300, 160, true)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button3D appearance="glass">Glass</Button3D>
          <Button3D appearance="glass" shape="pill">
            On any photo
          </Button3D>
        </View>
      </View>
    </View>
  );
}
