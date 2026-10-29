import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { GrainGradient } from '@/components/ui/grain';
import { TiltCard, TiltLayer } from '@/components/ui/tilt-card';
import { alpha, useKit } from '@/lib/kit';

/** Demo control text (buttons, chips, labels on fixed shapes) stops at iOS's largest standard text size. */
const FONT_CAP = 1.35;

/** Any photo works (`require()` or a URL). */
const photo = (id: number, w: number, h: number) => ({ uri: `https://picsum.photos/id/${id}/${w}/${h}` });

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

const glass = {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.18)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.32)',
} as const;

/** A travel card: the title and rating float above the photo as it tilts. */
export function TravelCard() {
  const { colors } = useKit();
  const [tab, setTab] = useState('Coast');
  return (
    <View style={{ gap: 18 }}>
      <Header title="Explore" sub="Stays our guests loved this month" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Coast', 'Mountains', 'Cities', 'Lakes'].map((t) => {
          const on = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.foreground : colors.muted }}
            >
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: on ? colors.background : colors.foreground, fontSize: 13, fontWeight: '600' }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <TiltCard idle image={photo(397, 540, 720)} radius={26} accessibilityLabel="Manarola, Cinque Terre" style={{ width: 270, alignSelf: 'center' }}>
      <View style={{ height: 360 }} />
      <TiltLayer depth={1.2}>
        <View style={[glass, { position: 'absolute', top: 16, right: 16 }]}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>★ 4.9</Text>
        </View>
      </TiltLayer>
      <TiltLayer depth={0.8}>
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 2 }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>CINQUE TERRE · ITALY</Text>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>Manarola</Text>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>3 nights · from €140</Text>
        </View>
      </TiltLayer>
      </TiltCard>
    </View>
  );
}

/**
 * Album art in a music player — the title floats off the cover.
 * @pro
 */
export function NowPlaying() {
  const { colors } = useKit();
  const [playing, setPlaying] = useState(true);
  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 20 }}>⌄</Text>
        <View style={{ flexShrink: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>PLAYING FROM</Text>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>Late night drive</Text>
        </View>
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 20 }}>⋯</Text>
      </View>
      <TiltCard idle radius={20} accessibilityLabel="Midnight Bloom by Lumen" style={{ width: 250 }}>
        <GrainGradient palette="noir" seed={1} style={{ height: 250 }} />
        <TiltLayer depth={1}>
          <View style={{ position: 'absolute', left: 18, bottom: 16 }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 30 }}>MIDNIGHT</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 30, fontWeight: '300', letterSpacing: -1, lineHeight: 32 }}>bloom</Text>
          </View>
        </TiltLayer>
      </TiltCard>
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <View>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700' }}>Midnight Bloom</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Lumen</Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha(colors.mutedForeground, 0.25) }}>
          <View style={{ width: '42%', height: 4, borderRadius: 2, backgroundColor: colors.foreground }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontVariant: ['tabular-nums'] }}>1:42</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontVariant: ['tabular-nums'] }}>−2:21</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 34 }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 22 }}>⏮</Text>
          <Pressable
            onPress={() => setPlaying((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.background, fontSize: 20 }}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 22 }}>⏭</Text>
        </View>
      </View>
    </View>
  );
}

/** A product card: the camera pops out of the card, price and button sit just above it. */
export function Product() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 18 }}>
      <Header
        title="New in"
        sub="Film cameras, serviced and tested"
        right={
          <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.muted }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>Bag · 2</Text>
          </View>
        }
      />
      <TiltCard maxTilt={14} radius={26} accessibilityLabel="Leica M6 film camera" style={{ width: 280, alignSelf: 'center' }}>
      <View style={{ height: 360, backgroundColor: '#efece6' }} />
      <TiltLayer depth={1.4}>
        <View style={{ position: 'absolute', top: 26, left: 22, right: 22, height: 190, borderRadius: 18, overflow: 'hidden' }}>
          <Image alt="" source={photo(250, 560, 380)} style={{ flex: 1 }} />
        </View>
      </TiltLayer>
      <TiltLayer depth={0.4}>
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: 22, gap: 12 }}>
          <View>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#8a8378', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>FILM CAMERA</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#1b1915', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>Rangefinder 35</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#1b1915', fontSize: 20, fontWeight: '700' }}>$1,290</Text>
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: '#1b1915' }}>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add to bag</Text>
            </View>
          </View>
        </View>
      </TiltLayer>
      </TiltCard>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>Free shipping · 2-year warranty</Text>
    </View>
  );
}

/** A feed card with a gentle tilt — tap still opens it. */
export function FeedCard() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 16 }}>
      <Header title="For you" sub="Picked from places you saved" />
      <TiltCard maxTilt={5} pressScale={1.015} glare="soft" radius={20} onPress={() => {}} accessibilityLabel="Read: A fairytale weekend in Bavaria" style={{ alignSelf: 'stretch' }}>
      <View style={{ backgroundColor: colors.card }}>
        <Image alt="" source={photo(1040, 720, 360)} style={{ height: 170 }} />
        <View style={{ padding: 16, gap: 4 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TRAVEL · 6 MIN READ</Text>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>A fairytale weekend in Bavaria</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>Castles, lakes and the best pretzels we had all year.</Text>
        </View>
      </View>
      </TiltCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.card }}>
        <Image alt="" source={photo(419, 160, 160)} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.muted }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>UP NEXT · 4 MIN READ</Text>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600' }}>Lisbon by tram, end to end</Text>
        </View>
      </View>
    </View>
  );
}
