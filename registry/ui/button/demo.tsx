import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { readableOn, useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

export function Variants() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Button>Primary</Button>
      <Button variant="accent">Accent</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="soft">Soft</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="elevated">Elevated</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Link</Button>
    </View>
  );
}

/** @pro */
export function GradientAndGlow() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 12 }}>
      <Button
        variant="gradient"
        size="lg"
        block
        pill
        right={<Text maxFontSizeMultiplier={FONT_CAP} style={{ color: readableOn(colors.accent), fontSize: 18 }}>→</Text>}
      >
        Get started
      </Button>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant="glow" pill style={{ flex: 1 }}>
          Go live
        </Button>
        <Button variant="gradient" pill style={{ flex: 1 }}>
          Boost
        </Button>
      </View>
    </View>
  );
}

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899'];

export function DynamicColor() {
  const { colors, radius } = useKit();
  const [color, setColor] = useState(PALETTE[0]);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {PALETTE.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${c}`}
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.full,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: c === color ? colors.foreground : 'transparent',
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Button variant="accent" color={color}>Accent</Button>
        <Button variant="gradient" color={color}>Gradient</Button>
        <Button variant="glow" color={color}>Glow</Button>
        <Button variant="soft" color={color}>Soft</Button>
        <Button variant="outline" color={color}>Outline</Button>
        <Button variant="elevated" color={color}>Elevated</Button>
      </View>
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" variant="outline">
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 18 }}>♥</Text>
      </Button>
    </View>
  );
}

export function Loading() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="accent"
      pill
      block
      size="lg"
      loading={busy}
      onPress={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 1600);
      }}
    >
      {busy ? 'Saving' : 'Save changes'}
    </Button>
  );
}

export function Colors() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Button variant="soft" color="#10b981">Approve</Button>
      <Button variant="soft" color="#f59e0b">Pending</Button>
      <Button variant="soft" color="#ef4444">Reject</Button>
      <Button variant="accent" color="#ec4899" pill>Follow</Button>
    </View>
  );
}
