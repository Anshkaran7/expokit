import React, { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

import { FlipCard } from '@/components/ui/flip-card';
import { useKit } from '@/lib/kit';

/** Demo control text (buttons, chips, labels on fixed shapes) stops at iOS's largest standard text size. */
const FONT_CAP = 1.35;

/** Any photo works (`require()` or a URL). */
const photo = (id: number, w: number, h: number) => ({ uri: `https://picsum.photos/id/${id}/${w}/${h}` });
const hand = Platform.select({ ios: 'Noteworthy', android: 'casual', default: '"Bradley Hand", "Segoe Print", cursive' });

/** Smooth darkening toward the bottom of a photo, made from thin bands. */
function Scrim({ height = '55%', max = 0.75 }: { height?: `${number}%` | number; max?: number }) {
  const steps = 40; // fine steps: coarse ones read as faint lines on iOS
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      {Array.from({ length: steps }, (_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${(max * ((i + 0.5) / steps) ** 1.6).toFixed(3)})` }} />
      ))}
    </View>
  );
}

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

/** A Polaroid: tap to turn it over and read the note on the back. */
export function Polaroid() {
  const { colors } = useKit();
  const paper = { width: 240, padding: 12, paddingBottom: 0, backgroundColor: '#f7f5f0' } as const;
  return (
    <View style={{ gap: 26 }}>
      <Header title="Memories" sub="Lisbon · June 2025 · 24 photos" />
      <FlipCard
      radius={6}
      accessibilityLabel="Polaroid of a Lisbon tram"
      style={{ alignSelf: 'center', transform: [{ rotate: '-2deg' }] }}
      front={
        <View style={paper}>
          <Image alt="" source={photo(419, 480, 480)} style={{ width: 216, height: 216, backgroundColor: '#ddd' }} />
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontFamily: hand, fontSize: 19, color: '#2b2b2b', textAlign: 'center', paddingVertical: 14 }}>Lisbon, June ’25</Text>
        </View>
      }
      back={
        <View style={[paper, { flex: 1, padding: 22, backgroundColor: '#efe9dc', justifyContent: 'space-between' }]}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontFamily: hand, fontSize: 18, lineHeight: 27, color: '#2f2a22' }}>
            Tram 28 all the way up to Graça. Pastéis de nata still warm. Best trip yet — come back next year?
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontFamily: hand, fontSize: 16, color: '#5b5245' }}>— M.</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1.5, borderColor: '#b04a3a', borderRadius: 4, transform: [{ rotate: '6deg' }] }}>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#b04a3a', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>LISBOA · 14 JUN</Text>
            </View>
          </View>
        </View>
      }
      />
      <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center' }}>Tap the photo to read the note on the back</Text>
    </View>
  );
}

/** A recipe card: the dish on the front, ingredients on the back. */
export function Recipe() {
  const { colors } = useKit();
  const items = ['3 parsnips, halved', '2 red onions, quartered', '4 carrots', 'Parsley & dill', 'Olive oil, salt, cracked pepper'];
  return (
    <View style={{ gap: 16 }}>
      <Header title="Tonight’s dinner" sub="Picked for you · vegetarian" />
      <FlipCard
      radius={22}
      accessibilityLabel="Roasted root vegetables recipe"
      front={
        <View style={{ height: 260, backgroundColor: '#222' }}>
          <Image alt="" source={photo(292, 720, 520)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Scrim />
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 18, gap: 2 }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>45 MIN · SERVES 4</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>Roasted roots</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Tap for ingredients</Text>
          </View>
        </View>
      }
      back={
        <View style={{ flex: 1, padding: 20, backgroundColor: '#f6f1e7', gap: 10 }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#3b3226', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }}>INGREDIENTS</Text>
          {items.map((it) => (
            <View key={it} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(59,50,38,0.12)' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#c9a227' }} />
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#3b3226', fontSize: 15 }}>{it}</Text>
            </View>
          ))}
        </View>
      }
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['45 min', 'Serves 4', '520 kcal'].map((t) => (
          <View key={t} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: colors.muted }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>{t}</Text>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary }}>
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.primaryForeground, fontSize: 15, fontWeight: '600' }}>Start cooking</Text>
      </Pressable>
    </View>
  );
}

/** A team profile: photo on the front, stats on the back. */
export function Profile() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 20 }}>
      <Header title="Design team" sub="Tap a card to see their year" />
      <FlipCard
      radius={24}
      accessibilityLabel="Ana Lima, lead designer"
      style={{ alignSelf: 'center', width: 250 }}
      front={
        <View style={{ height: 320, backgroundColor: '#222' }}>
          <Image alt="" source={photo(1027, 500, 640)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Scrim />
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 18 }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 }}>Ana Lima</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Lead designer · Lisbon</Text>
          </View>
        </View>
      }
      back={
        <View style={{ flex: 1, padding: 22, backgroundColor: '#141416', justifyContent: 'space-between' }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>THIS YEAR</Text>
          {[
            ['Projects shipped', '24'],
            ['Design reviews', '138'],
            ['Mentees', '6'],
          ].map(([k, v]) => (
            <View key={k}>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>{v}</Text>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{k}</Text>
            </View>
          ))}
        </View>
      }
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.primaryForeground, fontSize: 15, fontWeight: '600' }}>Message Ana</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: colors.muted }}>
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 15, fontWeight: '600' }}>View work</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A language flashcard with a photo — flip from a button, too. */
export function Flashcard() {
  const { colors } = useKit();
  const [flipped, setFlipped] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <Header
        title="Spanish · Fruit"
        sub="12 cards left today"
        right={<Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: '600' }}>8 / 20</Text>}
      />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, marginBottom: 6 }}>
        <View style={{ width: '40%', height: 6, borderRadius: 3, backgroundColor: colors.success }} />
      </View>
      <FlipCard
        radius={22}
        flipped={flipped}
        onFlip={setFlipped}
        accessibilityLabel="Flashcard"
        front={
          <View style={{ height: 240, backgroundColor: '#3a0d10' }}>
            <Image alt="" source={photo(1080, 720, 400)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <Scrim max={0.8} />
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: 18 }}>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>SPANISH</Text>
              <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: '#fff', fontSize: 30, fontWeight: '800' }}>la fresa</Text>
            </View>
          </View>
        }
        back={
          <View style={{ flex: 1, padding: 20, backgroundColor: colors.card, justifyContent: 'center', gap: 6 }}>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>ENGLISH</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 30, fontWeight: '800' }}>the strawberry</Text>
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.mutedForeground, fontSize: 14 }}>“Me encantan las fresas con nata.”</Text>
          </View>
        }
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {['Again', 'Good', 'Easy'].map((label) => (
          <Pressable
            key={label}
            onPress={() => setFlipped((f) => !f)}
            accessibilityRole="button"
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.muted }}
          >
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
