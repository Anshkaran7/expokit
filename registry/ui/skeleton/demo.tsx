import React, { useEffect, useRef, useState } from 'react';
import { Text, View, type DimensionValue } from 'react-native';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useKit } from '@/lib/kit';

/** Control text stops at iOS's largest standard size. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

export function Shimmer() {
  return (
    <Skeleton.Group style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Skeleton.Avatar size={52} />
      <View style={{ flex: 1, gap: 10 }}>
        <Skeleton width="70%" height={14} radius="capsule" />
        <Skeleton width="45%" height={12} radius="capsule" />
      </View>
    </Skeleton.Group>
  );
}

export function Card() {
  return (
    <Skeleton.Group style={{ gap: 14 }}>
      <Skeleton.Card />
      <Skeleton.Card media={false} lines={3} />
    </Skeleton.Group>
  );
}

export function List() {
  const { radius } = useKit();
  return (
    <Skeleton.Group style={{ gap: 8 }}>
      <Skeleton height={40} radius={radius.capsule(40)} />
      <Skeleton.List rows={5} dividers />
    </Skeleton.Group>
  );
}

export function ProductGrid() {
  return (
    <Skeleton.Group style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexBasis: '45%', flexGrow: 1, gap: 8 }}>
          <Skeleton.Media aspectRatio={1} radius="lg" />
          <Skeleton width={i % 2 ? '70%' : '86%'} height={12} radius="capsule" />
          <Skeleton width={56} height={14} radius="capsule" />
        </View>
      ))}
    </Skeleton.Group>
  );
}

const ROW_W: DimensionValue[] = ['34%', '46%', '28%'];

/** Account screen: avatar + name, then grouped settings-style rows. */
export function ProfileHeader() {
  const { colors, radius, dark } = useKit();
  const surface = { backgroundColor: dark ? colors.card : colors.muted, borderRadius: radius.xl, paddingHorizontal: 14 };
  return (
    <Skeleton.Group style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Skeleton.Avatar size={72} />
        <View style={{ flex: 1, gap: 9 }}>
          <Skeleton width="58%" height={16} radius="capsule" />
          <Skeleton width="74%" height={11} radius="capsule" />
          <Skeleton width={96} height={28} radius="full" style={{ marginTop: 4 }} />
        </View>
      </View>
      {[3, 2].map((rows, g) => (
        <View key={g} style={{ gap: 8 }}>
          <Skeleton width={g ? 84 : 120} height={10} radius="capsule" />
          <View style={surface}>
            {Array.from({ length: rows }, (_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 }}>
                <Skeleton width={30} height={30} radius="md" />
                <Skeleton width={ROW_W[i % 3]} height={12} radius="capsule" />
                <View style={{ flex: 1 }} />
                <Skeleton width={[64, 40, 52][i % 3]} height={11} radius="capsule" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Skeleton.Group>
  );
}

export function Wave() {
  return (
    <Skeleton.Group style={{ gap: 16 }}>
      <Skeleton.Media variant="wave" radius="lg" />
      <Skeleton.Text variant="wave" lines={3} />
      <Skeleton.List variant="wave" rows={2} />
    </Skeleton.Group>
  );
}

export function Pulse() {
  return (
    <View style={{ gap: 16 }}>
      <Skeleton variant="pulse" height={140} radius="lg" />
      <Skeleton.Text variant="pulse" lines={3} />
    </View>
  );
}

export function Nav({ screen }: DemoProps) {
  return <Skeleton.Nav rows={6} tabCount={5} style={screen ? undefined : { minHeight: 600 }} />;
}
