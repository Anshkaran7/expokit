import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { FlipCard, useFlipProgress } from '@/components/ui/flip-card';
import { TiltCard } from '@/components/ui/tilt-card';

export type PaymentCardBrand = 'visa' | 'mastercard' | 'amex' | 'rupay' | 'none';

export interface PaymentCardProps {
  /** Card number — spaces are fine. Shown masked to the last 4 unless `masked` is false. */
  number: string;
  /** Cardholder name. */
  name: string;
  /** Expiry, e.g. "09/29". */
  expiry: string;
  /** Shown on the back. */
  cvv?: string;
  brand?: PaymentCardBrand;
  /** Issuer name, top-left. */
  bank?: string;
  /** Small label top-right, e.g. "Debit", "World Elite". */
  label?: string;
  /** Card art — a photo or texture (`require('./card.jpg')` or `{ uri }`). Default: brushed graphite. */
  image?: ImageSourcePropType;
  /** `light` text for dark art (default), `dark` text for pale art. */
  tone?: 'light' | 'dark';
  /** EMV chip finish. */
  chip?: 'gold' | 'silver';
  /** Show only the last 4 digits (default true). */
  masked?: boolean;
  /** Controlled side: true shows the back. */
  flipped?: boolean;
  defaultFlipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Tilt toward the finger (default true). */
  tilt?: boolean;
  /**
   * Tap flips the card (default true). `false` makes it a still card — no tilt, no taps — for use
   * inside something tappable (e.g. a CardStack); a controlled `flipped` still turns it.
   */
  flippable?: boolean;
  /** Frozen cards are frosted over with a label and ignore taps. */
  frozen?: boolean;
  /** Corner radius (default 16 — a real card's corner at phone size). */
  radius?: number;
  /** Every built-in string, for translation ({bank} and {last4} are filled in). */
  labels?: PaymentCardLabels;
  style?: StyleProp<ViewStyle>;
}

export interface PaymentCardLabels {
  cardholder?: string;
  validThru?: string;
  frozen?: string;
  /** Fine print on the back (default "This card is the property of {bank} …"). */
  legal?: string;
  /** Default "Card ending {last4} · tap to turn back". */
  back?: string;
  /** Screen-reader label (default "{bank} card ending {last4}"). */
  accessibility?: string;
}

/**
 * "4821 7590 1234 0317" → groups of 4 (Amex 4-6-5, 14-digit Diners 4-6-4, 19-digit cards get a
 * fifth group). Masking hides every digit but the last four, whatever the length. Keeps • placeholders.
 */
function formatNumber(number: string, brand: PaymentCardBrand, masked: boolean) {
  const raw = number.replace(/[^\d•]/g, '');
  const shown = masked ? [...raw].map((c, i) => (i < raw.length - 4 ? '•' : c)).join('') : raw;
  const groups = brand === 'amex' ? [4, 6, 5] : raw.length === 14 ? [4, 6, 4] : [4, 4, 4, 4];
  const out: string[] = [];
  let i = 0;
  for (const g of groups) {
    const part = shown.slice(i, i + g);
    if (!part) break;
    out.push(part);
    i += g;
  }
  if (i < shown.length) out.push(shown.slice(i));
  return out.join('  ');
}

function BrandMark({ brand, ink }: { brand: PaymentCardBrand; ink: string }) {
  if (brand === 'none') return null;
  if (brand === 'mastercard') {
    // Red and yellow circles with the true orange overlap.
    return (
      <Svg width={46} height={28} viewBox="0 0 46 28">
        <Defs>
          <ClipPath id="mc-left">
            <Circle cx={15} cy={14} r={13} />
          </ClipPath>
        </Defs>
        <Circle cx={15} cy={14} r={13} fill="#EB001B" />
        <Circle cx={31} cy={14} r={13} fill="#F79E1B" />
        <G clipPath="url(#mc-left)">
          <Circle cx={31} cy={14} r={13} fill="#FF5F00" />
        </G>
      </Svg>
    );
  }
  if (brand === 'visa') {
    return <Text style={[styles.visa, { color: ink }]}>VISA</Text>;
  }
  if (brand === 'amex') {
    return (
      <View style={[styles.amex, { borderColor: ink }]}>
        <Text style={{ color: ink, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, lineHeight: 10 }}>AMERICAN</Text>
        <Text style={{ color: ink, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, lineHeight: 10 }}>EXPRESS</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ color: ink, fontSize: 18, fontWeight: '800', fontStyle: 'italic', letterSpacing: -0.3 }}>RuPay</Text>
      <Svg width={14} height={16} viewBox="0 0 14 16">
        <Path d="M2 1 L10 8 L2 15 Z" fill="#F47920" />
        <Path d="M6 1 L14 8 L6 15 Z" fill="#0B8E36" />
      </Svg>
    </View>
  );
}

/** EMV chip with contact pads, in gold or silver. */
function Chip({ finish }: { finish: 'gold' | 'silver' }) {
  const [a, b, c] = finish === 'gold' ? ['#f3dc9d', '#d1ab5c', '#9c7a34'] : ['#f1f2f4', '#c4c7cd', '#8d9199'];
  return (
    <Svg width={42} height={32} viewBox="0 0 42 32">
      <Defs>
        <LinearGradient id={`chip-${finish}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="0.55" stopColor={b} />
          <Stop offset="1" stopColor={c} />
        </LinearGradient>
      </Defs>
      <Rect x={0.5} y={0.5} width={41} height={31} rx={6} fill={`url(#chip-${finish})`} stroke={c} strokeOpacity={0.6} />
      <Path d="M0 11 H14 Q17 11 17 14 V18 Q17 21 14 21 H0 M42 11 H28 Q25 11 25 14 V18 Q25 21 28 21 H42 M14 0 V11 M28 0 V11 M14 32 V21 M28 32 V21" stroke={c} strokeOpacity={0.7} strokeWidth={1} fill="none" />
    </Svg>
  );
}

function Contactless({ ink }: { ink: string }) {
  return (
    <Svg width={20} height={24} viewBox="0 0 20 24">
      {[5, 9, 13].map((r, k) => (
        <Path key={r} d={`M${3 + k * 4} ${12 - r * 0.72} A ${r} ${r} 0 0 1 ${3 + k * 4} ${12 + r * 0.72}`} stroke={ink} strokeOpacity={0.85} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Brushed graphite, used when no `image` is given. */
function Graphite() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 63">
      <Defs>
        <LinearGradient id="pc-graphite" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3a3a40" />
          <Stop offset="0.45" stopColor="#232327" />
          <Stop offset="1" stopColor="#141416" />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="63" fill="url(#pc-graphite)" />
      {Array.from({ length: 32 }, (_, i) => (
        <Line key={i} x1="0" y1={i * 2} x2="100" y2={i * 2 + 0.6} stroke="#ffffff" strokeOpacity={i % 3 ? 0.012 : 0.025} strokeWidth={0.4} />
      ))}
    </Svg>
  );
}

/** A soft darkening (mostly toward the bottom) so the text stays crisp on busy or pale art. */
function Shade({ strength }: { strength: number }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id={`pc-shade-${Math.round(strength * 100)}`} x1="0" y1="0" x2="0" y2="1">
          {/* A whisper at the top keeps the issuer name readable on pale art; most of it is at the bottom. */}
          <Stop offset="0" stopColor="#000" stopOpacity={strength * 0.4} />
          <Stop offset="0.4" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={strength} />
        </LinearGradient>
      </Defs>
      <Rect width="1" height="1" fill={`url(#pc-shade-${Math.round(strength * 100)})`} />
    </Svg>
  );
}

/**
 * A realistic bank card: card art (any photo), EMV chip, contactless mark, embossed number and
 * the network's mark. It tilts toward your finger and flips on tap to the back — magnetic stripe,
 * signature panel with the CVV and a hologram. Frozen state for card controls.
 */
export function PaymentCard({
  number,
  name,
  expiry,
  cvv,
  brand = 'visa',
  bank,
  label,
  image,
  tone = 'light',
  chip = 'gold',
  masked = true,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlip,
  tilt = true,
  flippable = true,
  frozen = false,
  radius = 16,
  labels,
  style,
}: PaymentCardProps) {
  const controlled = flippedProp !== undefined;
  const [own, setOwn] = useState(defaultFlipped);
  // A frozen card always shows its front (where the frost and the label are).
  const flipped = (controlled ? flippedProp : own) && !frozen;
  // One flip drives both the card and the tilt shadow, so the shadow narrows as the card turns
  // edge-on — otherwise the flat shadow plate behind it shows as a dark box mid-flip.
  const flip = useFlipProgress(flipped);

  const toggle = () => {
    if (frozen) return;
    if (!controlled) setOwn(!flipped);
    onFlip?.(!flipped);
  };

  const ink = tone === 'light' ? '#ffffff' : '#141414';
  const soft = tone === 'light' ? 'rgba(255,255,255,0.72)' : 'rgba(20,20,20,0.62)';
  const emboss = tone === 'light' ? { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 } : null;
  const last4 = number.replace(/\D/g, '').slice(-4);
  const fill = (t: string) => t.replace('{bank}', bank ?? 'the issuer').replace('{last4}', last4);
  const text = {
    cardholder: 'CARDHOLDER',
    validThru: 'VALID THRU',
    frozen: 'Frozen',
    legal: 'This card is the property of {bank} and must be returned on request. Use is subject to the cardholder agreement.',
    back: 'Card ending {last4} · tap to turn back',
    accessibility: bank ? '{bank} card ending {last4}' : 'Card ending {last4}',
    ...labels,
  };

  const art = (darken: number) => (
    <>
      {image ? <Image alt="" source={image} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Graphite />}
      {darken > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${darken})` }]} /> : null}
    </>
  );
  const edge = <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }]} />;

  const front = (
    <View style={[styles.face, { borderRadius: radius }]}>
      {art(0)}
      {tone === 'light' ? <Shade strength={image ? 0.38 : 0.2} /> : null}
      <View style={styles.inner}>
        <View style={styles.row}>
          <Text style={[{ color: ink, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 }, emboss]}>{bank ?? ''}</Text>
          {label ? <Text style={[{ color: soft, fontSize: 11, fontWeight: '600', letterSpacing: 1 }, emboss]}>{label.toUpperCase()}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Chip finish={chip} />
          <Contactless ink={ink} />
        </View>
        <View style={{ gap: 10 }}>
          <Text style={[{ color: ink, fontSize: 19, fontWeight: '500', letterSpacing: 2, fontVariant: ['tabular-nums'] }, emboss]}>
            {formatNumber(number, brand, masked)}
          </Text>
          <View style={[styles.row, { alignItems: 'flex-end' }]}>
            <View style={{ flexDirection: 'row', gap: 20, flexShrink: 1 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.tiny, { color: soft }]}>{text.cardholder}</Text>
                <Text style={[{ color: ink, fontSize: 13, fontWeight: '600', letterSpacing: 0.8 }, emboss]} numberOfLines={1}>
                  {name.toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={[styles.tiny, { color: soft }]}>{text.validThru}</Text>
                <Text style={[{ color: ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }, emboss]}>{expiry}</Text>
              </View>
            </View>
            <BrandMark brand={brand} ink={ink} />
          </View>
        </View>
      </View>
      {frozen ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(214,232,255,0.28)' }]}>
          <View style={styles.frozenPill}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>❄︎  {text.frozen}</Text>
          </View>
        </View>
      ) : null}
      {edge}
    </View>
  );

  const back = (
    <View style={[styles.face, { borderRadius: radius }]}>
      {art(0.42)}
      <View style={styles.stripe} />
      <View style={styles.backRow}>
        <View style={styles.signature}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 10">
            {Array.from({ length: 26 }, (_, i) => (
              <Line key={i} x1={i * 4} y1={10} x2={i * 4 + 6} y2={0} stroke="#9aa3b2" strokeOpacity={0.35} strokeWidth={0.6} />
            ))}
          </Svg>
        </View>
        <View style={styles.cvv}>
          <Text style={{ color: '#111', fontSize: 15, fontWeight: '700', fontStyle: 'italic', letterSpacing: 1.5, fontVariant: ['tabular-nums'] }}>{cvv ?? '•••'}</Text>
        </View>
      </View>
      <View style={styles.backFoot}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 9, lineHeight: 12 }}>
            {fill(text.legal)}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>{fill(text.back)}</Text>
        </View>
        {/* Security hologram. */}
        <Svg width={40} height={30} viewBox="0 0 40 30">
          <Defs>
            <LinearGradient id="pc-holo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#c9f2ff" />
              <Stop offset="0.3" stopColor="#f5c6ff" />
              <Stop offset="0.6" stopColor="#fff1b8" />
              <Stop offset="1" stopColor="#b8ffe1" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={40} height={30} rx={4} fill="url(#pc-holo)" opacity={0.92} />
          <Circle cx={20} cy={15} r={8} fill="none" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.2} />
        </Svg>
      </View>
      {edge}
    </View>
  );

  const card = <FlipCard front={front} back={back} flipped={flipped} progress={flip.progress} trigger="none" perspective={1600} radius={radius} shadow={false} />;
  const a11y = [fill(text.accessibility), frozen ? text.frozen : null].filter(Boolean).join(', ');

  if (!flippable) {
    // A still card: no tilt and no taps of its own, so a parent (e.g. a CardStack) gets the touch.
    return (
      <View accessible accessibilityLabel={a11y} style={[{ borderRadius: radius }, style]}>
        {card}
      </View>
    );
  }
  return tilt ? (
    <TiltCard onPress={toggle} glare="soft" maxTilt={10} radius={radius} shadowScaleX={flip.shadowScaleX} accessibilityLabel={a11y} style={style}>
      {card}
    </TiltCard>
  ) : (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ disabled: frozen }} accessibilityLabel={a11y} style={[styles.flat, { borderRadius: radius }, style]}>
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: { aspectRatio: 1.586, overflow: 'hidden', backgroundColor: '#1c1c20' },
  inner: { flex: 1, padding: 20, justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tiny: { fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  visa: { fontSize: 24, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  amex: { borderWidth: 1.5, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 3 },
  center: { alignItems: 'center', justifyContent: 'center' },
  frozenPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(10,20,35,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  stripe: { position: 'absolute', left: 0, right: 0, top: '13%', height: '19%', backgroundColor: '#0b0b0c' },
  backRow: { position: 'absolute', left: 18, right: 18, top: '42%', height: '16%', flexDirection: 'row', gap: 8 },
  signature: { flex: 1, borderRadius: 3, backgroundColor: '#eef0f4', overflow: 'hidden' },
  cvv: { width: 58, borderRadius: 3, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  backFoot: { position: 'absolute', left: 18, right: 18, bottom: 16, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flat: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
});
