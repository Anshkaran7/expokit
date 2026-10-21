import React from 'react';
import { Text, View } from 'react-native';

import { GRAIN_PALETTES, GrainGradient } from '@/components/ui/grain';
import { useKit } from '@/lib/kit';

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

/** A whole screen of grainy gradient with copy on top. */
export function Hero({ screen }: DemoProps) {
  const { radius } = useKit();
  return (
    <GrainGradient palette="ember" seed={1} style={screen ? { flex: 1 } : { height: 460, borderRadius: radius.xl }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 24, gap: 6 }}>
        <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700', letterSpacing: -0.8 }}>Golden hour</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>Warm light, soft grain, no photo needed.</Text>
      </View>
    </GrainGradient>
  );
}

/** Every palette, as cards. */
export function Palettes({ screen }: DemoProps) {
  const { radius } = useKit();
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, screen && { padding: 16 }]}>
      {GRAIN_PALETTES.map((p, i) => (
        <GrainGradient key={p} palette={p} seed={i} style={{ width: '47%', flexGrow: 1, height: 120, borderRadius: radius.lg }}>
          <Text style={{ margin: 12, color: ['peach', 'mint', 'lavender'].includes(p) ? '#1d1a26' : '#ffffff', fontWeight: '600', textTransform: 'capitalize' }}>{p}</Text>
        </GrainGradient>
      ))}
    </View>
  );
}

/** Your own colours, with heavier grain. */
export function Custom({ screen }: DemoProps) {
  const { radius } = useKit();
  return (
    <GrainGradient colors={['#0c0a1f', '#ff4d6d', '#ffd166', '#06d6a0']} grain={0.9} seed={2} style={screen ? { flex: 1 } : { height: 400, borderRadius: radius.xl }} />
  );
}
