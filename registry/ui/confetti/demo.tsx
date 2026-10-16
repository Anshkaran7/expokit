import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Confetti, type ConfettiHandle } from '@/components/ui/confetti';
import { useKit } from '@/lib/kit';

/** Order placed: two cannons fire from the bottom corners. */
export function Celebrate() {
  const { colors, radius } = useKit();
  const confetti = useRef<ConfettiHandle>(null);
  return (
    <View style={{ height: 420, borderRadius: radius.xl, backgroundColor: colors.muted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
      <Text style={{ fontSize: 44 }}>🎉</Text>
      <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>Order placed!</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: 'center' }}>You saved ₹240 with coupon GLOW50. Arriving Thursday.</Text>
      <Pressable
        onPress={() => confetti.current?.burst()}
        accessibilityRole="button"
        style={{ marginTop: 12, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, backgroundColor: colors.primary }}
      >
        <Text style={{ color: colors.primaryForeground, fontSize: 15, fontWeight: '700' }}>Celebrate again</Text>
      </Pressable>
      <Confetti ref={confetti} autoplay />
    </View>
  );
}

/** Rain from the top, fired by a changing `trigger` — no ref needed. */
export function Rain() {
  const { colors, radius } = useKit();
  const [shower, setShower] = useState(0);
  return (
    <View style={{ height: 360, borderRadius: radius.xl, backgroundColor: colors.muted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={() => setShower((n) => n + 1)} accessibilityRole="button" style={{ paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.foreground }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>Make it rain</Text>
      </Pressable>
      <Confetti origin="top" count={120} trigger={shower} colors={['#ffd23f', '#ffb000', '#fff3b0', '#ffffff']} />
    </View>
  );
}

/** Tap anywhere: a burst pops right under your finger. */
export function TapToPop() {
  const { colors, radius } = useKit();
  const confetti = useRef<ConfettiHandle>(null);
  return (
    <Pressable
      onPress={(e) => confetti.current?.burst({ origin: 'center', x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, count: 50 })}
      accessibilityRole="button"
      accessibilityLabel="Tap to pop confetti"
      style={{ height: 360, borderRadius: radius.xl, backgroundColor: colors.muted, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Not touchable, so locationX/Y are always relative to the panel. */}
      <View pointerEvents="none">
        <Text style={{ color: colors.mutedForeground, fontSize: 15, fontWeight: '600' }}>Tap anywhere</Text>
      </View>
      <Confetti ref={confetti} />
    </Pressable>
  );
}
