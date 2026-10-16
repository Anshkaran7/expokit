import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Spinner } from '@/components/ui/spinner';
import { readableOn, useKit } from '@/lib/kit';

export function Variants() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <Spinner variant="ring" size="lg" track />
      <Spinner variant="ring" size="lg" />
      <Spinner variant="dots" size="lg" />
    </View>
  );
}

export function InButton() {
  const { colors, radius } = useKit();
  const [busy, setBusy] = useState(false);
  const fg = readableOn(colors.accent);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 2200);
      }}
      style={{
        height: 48,
        borderRadius: radius.capsule(48),
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
      }}
    >
      {busy ? (
        <Spinner size="sm" color={fg} label="Placing order" labelPosition="right" />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: '400' }}>Place order · ₹749</Text>
      )}
    </Pressable>
  );
}

export function LoadingCard() {
  const { colors, radius } = useKit();
  return (
    <View
      style={{
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 32,
        paddingHorizontal: 20,
        borderRadius: radius.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Spinner size="xl" track label="Preparing your itinerary" labelPosition="bottom" />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center' }}>
        Checking 3 flights and 2 hotels
      </Text>
    </View>
  );
}

export function InlineStatus() {
  return (
    <View style={{ gap: 16 }}>
      <Spinner size="sm" label="Syncing 128 photos" labelPosition="right" />
      <Spinner variant="dots" size="md" label="Maya is typing" labelPosition="right" />
    </View>
  );
}

export function Colors() {
  const { colors } = useKit();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 20 }}>
      <Spinner size="lg" color={colors.success} track />
      <Spinner variant="dots" size="lg" color={colors.warning} />
      <Spinner size="lg" color={colors.danger} />
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <Spinner size="xl" />
    </View>
  );
}
