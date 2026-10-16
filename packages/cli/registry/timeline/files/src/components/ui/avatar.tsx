import * as Haptics from 'expo-haptics';
import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { alpha, motion, useKit } from '@/lib/kit';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';
/** 'story' / 'accent' solid accent ring · 'seen' (same as `ring="story"` + `seen`). */
export type AvatarRing = 'none' | 'story' | 'accent' | 'seen';
/** 'soft' tint with deep ink (default) · 'solid' flat fill · 'gradient' opt-in two-tone. */
export type AvatarFallback = 'soft' | 'solid' | 'gradient';

export interface AvatarProps {
  /** Image URL. Initials show while it loads, and stay if it fails. */
  src?: string;
  /** Used for the initials, the fallback colour (same name → same colour) and the accessibility label. */
  name?: string;
  /** 'xs' 24 · 'sm' 32 · 'md' 40 · 'lg' 56 · 'xl' 72, or any number of points. */
  size?: AvatarSize | number;
  shape?: AvatarShape;
  /** Presence dot cut into the bottom-right edge. */
  status?: AvatarStatus;
  /** Soft pulse behind the status dot (default: on for 'online'). */
  pulse?: boolean;
  /** Ring around the face, separated by a clear gap. */
  ring?: AvatarRing;
  /** The story has been watched: the ring cross-fades to a quiet hairline. */
  seen?: boolean;
  /** Ring colour override — the first entry is used as a solid colour (default: `accent`). */
  ringColors?: string[];
  /** Spin a broken story ring — a "story is loading" state. */
  ringSpin?: boolean;
  /** Initials look when there is no photo. Default 'soft'. */
  fallback?: AvatarFallback;
  /** Soft layered shadow under the face (default true for 72pt and up). */
  elevated?: boolean;
  /** Notification count (`true` = dot), top-right. */
  badge?: number | boolean;
  /** Verified seal with a check, bottom-right (bottom-left when a status dot is shown). */
  verified?: boolean;
  /** Colour behind the avatar — the dot, badge and seal cut-outs are punched in it. Default: theme background. */
  surface?: string;
  /** Ring and verified seal colour (default: theme accent). */
  accent?: string;
  /** Makes it a button with a spring press and a light haptic tick. */
  onPress?: () => void;
  /** Haptic tick on press (default true). */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 };

/** Stable 0–359 hue for a name (FNV-1a hash). */
export function hueFromName(name = '') {
  let h = 0x811c9dc5;
  const s = name.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

/**
 * Fallback colours for a name: `base` for flat and soft fills, `ink` for the initials — white when
 * it reads, otherwise a deep shade of the same hue — and `from` → `to` for the opt-in gradient look.
 */
export function gradientFromName(name = '', dark = false) {
  const h = hueFromName(name);
  // Warm hues turn toward red (not lime); greens and cyans are perceptually bright, so sit a touch deeper.
  const turn = h >= 15 && h < 95 ? -28 : 28;
  const deep = h >= 70 && h < 205 ? 0.09 : 0;
  const from = hsl(h - turn * 0.3, 0.74, (dark ? 0.58 : 0.64) - deep);
  const to = hsl(h + turn, 0.68, (dark ? 0.4 : 0.44) - deep);
  const base = hsl(h + turn * 0.35, 0.7, (dark ? 0.5 : 0.53) - deep);
  const ink = contrast('#ffffff', base) >= 3 ? '#ffffff' : hsl(h + turn * 0.35, 0.75, 0.16);
  return { from, to, base, ink, hue: h };
}

/** Same name, same colour — every time, on every device. */
export function colorFromName(name = '') {
  return gradientFromName(name).base;
}

export function initialsFrom(name = '', max = 2) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];
  return letters.slice(0, max).join('').toUpperCase();
}

const resolveSize = (s: AvatarSize | number) => (typeof s === 'number' ? s : SIZES[s]);

/**
 * Photo that fades in over soft tinted initials (hue hashed from the name), with
 * presence dots, notification badges and a verified seal cut into the edge, a gapped story ring
 * that cross-fades to "seen", and an optional spring press.
 */
export function Avatar({
  src,
  name,
  size = 'md',
  shape = 'circle',
  status,
  pulse,
  ring = 'none',
  seen,
  ringColors,
  ringSpin,
  fallback = 'soft',
  elevated,
  badge,
  verified,
  surface,
  accent,
  onPress,
  haptics = true,
  style,
}: AvatarProps) {
  const { colors, radius, dark } = useKit();
  const reduceMotion = useReduceMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const px = resolveSize(size);
  const bg = surface ?? colors.background;
  const tint = accent ?? colors.accent;
  const corner = shape === 'circle' ? px / 2 : Math.min(px / 2, radius.scale(Math.round(px * 0.3)));
  const faceRadius = shape === 'circle' ? radius.full : corner;

  // Remember which URL failed so a new `src` gets a fresh try without resetting state in an effect.
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = !!src && failedSrc === src;
  const loaded = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulseV = useRef(new Animated.Value(0)).current;

  const isSeen = seen ?? ring === 'seen';
  const seenV = useRef(new Animated.Value(isSeen ? 1 : 0)).current;

  useEffect(() => {
    loaded.setValue(0);
  }, [src, loaded]);

  useEffect(() => {
    Animated.timing(seenV, {
      toValue: isSeen ? 1 : 0,
      duration: reduceMotion ? 0 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSeen, reduceMotion, seenV]);

  const showPulse = !!status && !reduceMotion && (pulse ?? status === 'online');
  useEffect(() => {
    if (!showPulse) return;
    pulseV.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseV, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showPulse, pulseV]);

  const hasRing = ring !== 'none' || seen === true;
  const spinning = !!ringSpin && hasRing && shape === 'circle' && !isSeen && !reduceMotion;
  useEffect(() => {
    if (!spinning) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, spin]);

  // Geometry: ring stroke + clear gap around the face; everything else is laid out inside `outer`.
  const stroke = hasRing ? Math.max(2, Math.round(px * 0.05)) : 0;
  const gap = hasRing ? Math.max(2, Math.round(px * 0.045)) : 0;
  const pad = stroke + gap;
  const outer = px + pad * 2;
  const circ = Math.PI * (outer - stroke);
  const ringPaint = ringColors?.[0] ?? tint;
  const hairline = alpha(colors.foreground, dark ? 0.22 : 0.16);

  // Points on the face edge at 45°: works for circles and rounded squares alike.
  const r = Math.min(corner, px / 2);
  const near = r * (1 - Math.SQRT1_2);
  const far = px - near;
  const cut = Math.max(1.5, Math.round(px * 0.045 * 2) / 2);

  const named = !!name?.trim();
  const g = gradientFromName(name, dark);
  const initials = initialsFrom(name, px < 30 ? 1 : 2);
  const look = named ? fallback : 'none';
  const faceBg =
    look === 'soft' ? alpha(g.base, dark ? 0.24 : 0.16) : look === 'none' ? colors.muted : g.base;
  const ink =
    look === 'soft'
      ? hsl(g.hue, dark ? 0.8 : 0.6, dark ? 0.76 : 0.34)
      : look === 'none'
        ? colors.mutedForeground
        : g.ink;
  const showElevated = elevated ?? px >= 72;
  const showPhoto = !!src && !failed;

  const label =
    [
      name,
      verified ? 'verified' : null,
      status,
      typeof badge === 'number' && badge > 0 ? `${badge} notifications` : badge === true ? 'new notification' : null,
      hasRing ? (isSeen ? 'story seen' : 'new story') : null,
    ]
      .filter(Boolean)
      .join(', ') || 'Avatar';

  const onImageLoad = () => {
    Animated.timing(loaded, {
      toValue: 1,
      duration: reduceMotion ? 120 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const face = (
    <View
      style={[
        styles.face,
        { width: px, height: px, borderRadius: faceRadius, backgroundColor: faceBg },
        showElevated
          ? {
              shadowColor: '#000',
              shadowOpacity: dark ? 0.5 : 0.14,
              shadowRadius: px * 0.16,
              shadowOffset: { width: 0, height: Math.max(2, px * 0.07) },
              elevation: Math.round(px * 0.1),
            }
          : null,
      ]}
    >
      <View style={[styles.clip, { borderRadius: faceRadius }]}>
        {look === 'gradient' ? (
          <Svg width={px} height={px} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={`fb${uid}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={g.from} />
                <Stop offset="1" stopColor={g.to} />
              </LinearGradient>
              <LinearGradient id={`hl${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={dark ? 0.12 : 0.2} />
                <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={px} height={px} fill={`url(#fb${uid})`} />
            <Rect width={px} height={px} fill={`url(#hl${uid})`} />
          </Svg>
        ) : null}

        {initials ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              styles.initials,
              {
                color: ink,
                fontSize: Math.max(9, px * (initials.length > 1 ? 0.37 : 0.42)),
                letterSpacing: px >= 56 ? 0.4 : 0,
              },
              ink === '#ffffff' && look !== 'soft' ? styles.inkShadow : null,
            ]}
          >
            {initials}
          </Text>
        ) : (
          <PersonIcon size={px} color={ink} />
        )}

        {showPhoto ? (
          <Animated.Image
            source={{ uri: src }}
            onLoad={onImageLoad}
            onError={() => setFailedSrc(src)}
            accessibilityIgnoresInvertColors
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: loaded,
                transform: [{ scale: loaded.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
              },
            ]}
          />
        ) : null}

        {/* Inner hairline so photos and gradients separate from any background. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: faceRadius,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
            },
          ]}
        />
      </View>
    </View>
  );

  const ringLayer = (paint: string, width: number, dashed: boolean) =>
    shape === 'circle' ? (
      <Circle
        cx={outer / 2}
        cy={outer / 2}
        r={(outer - stroke) / 2}
        stroke={paint}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={dashed ? [circ * 0.7, circ * 0.3] : undefined}
      />
    ) : (
      <Rect
        x={stroke / 2}
        y={stroke / 2}
        width={outer - stroke}
        height={outer - stroke}
        rx={corner + gap + stroke / 2}
        stroke={paint}
        strokeWidth={width}
        fill="none"
      />
    );

  const statusCorner = status ? 'br' : null;
  const sealCorner = verified ? (statusCorner ? 'bl' : 'br') : null;
  const dot = Math.max(8, Math.round(px * 0.24));
  const seal = Math.max(12, Math.round(px * 0.3));
  const badgeH = Math.max(14, Math.round(px * 0.34));
  const badgeText = typeof badge === 'number' ? (badge > 99 ? '99+' : String(badge)) : null;
  const showBadge = badge === true || (typeof badge === 'number' && badge > 0);

  /** Absolute position for a cut-out of diameter `d` centred on the face edge at a corner. */
  const at = (c: 'br' | 'bl' | 'tr', d: number): ViewStyle => ({
    position: 'absolute',
    left: pad + (c === 'bl' ? near : far) - d / 2,
    top: pad + (c === 'tr' ? near : far) - d / 2,
  });

  const body = (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {hasRing ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: seenV.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [
                  { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                  { scale: seenV.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
                ],
              },
            ]}
          >
            <Svg width={outer} height={outer}>
              {ringLayer(ringPaint, stroke, spinning)}
            </Svg>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: seenV }]}>
            <Svg width={outer} height={outer}>
              {ringLayer(hairline, Math.max(1, stroke * 0.5), false)}
            </Svg>
          </Animated.View>
        </>
      ) : null}

      {face}

      {statusCorner ? (
        <View pointerEvents="none" style={at(statusCorner, dot + cut * 2)}>
          {showPulse ? (
            <Animated.View
              style={[
                styles.pulse,
                {
                  left: cut,
                  top: cut,
                  width: dot,
                  height: dot,
                  borderRadius: radius.full,
                  backgroundColor: statusTone(status!, colors),
                  opacity: pulseV.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                  transform: [{ scale: pulseV.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
                },
              ]}
            />
          ) : null}
          <StatusDot status={status!} size={dot} cut={cut} surface={bg} />
        </View>
      ) : null}

      {sealCorner ? (
        <View pointerEvents="none" style={at(sealCorner, seal + cut * 2)}>
          <VerifiedSeal size={seal} cut={cut} color={tint} surface={bg} />
        </View>
      ) : null}

      {showBadge ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              minWidth: badgeH + cut * 2,
              height: badgeH + cut * 2,
              borderRadius: radius.full,
              borderWidth: cut,
              borderColor: bg,
              backgroundColor: colors.danger,
              paddingHorizontal: badgeText && badgeText.length > 1 ? 3 + cut : 0,
              left: pad + far - (badgeH + cut * 2) / 2,
              top: pad + near - (badgeH + cut * 2) / 2,
            },
            badge === true ? { minWidth: dot + cut * 2, height: dot + cut * 2, left: pad + far - dot / 2 - cut, top: pad + near - dot / 2 - cut } : null,
          ]}
        >
          {badgeText ? (
            <Text
              allowFontScaling={false}
              style={[styles.badgeText, { color: colors.dangerForeground, fontSize: Math.max(9, badgeH * 0.6) }]}
            >
              {badgeText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={style}>
        {body}
      </View>
    );
  }

  const springTo = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, ...motion.bouncy }).start();
  return (
    <Animated.View style={[{ transform: [{ scale: press }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={outer < 44 ? Math.ceil((44 - outer) / 2) : undefined}
        onPress={() => {
          if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        onPressIn={() => springTo(reduceMotion ? 1 : 0.93)}
        onPressOut={() => springTo(1)}
      >
        {body}
      </Pressable>
    </Animated.View>
  );
}

/** Presence dot inside its cut-out: filled online, crescent away, bar busy, hollow offline. */
function StatusDot({ status, size, cut, surface }: { status: AvatarStatus; size: number; cut: number; surface: string }) {
  const { colors, radius } = useKit();
  const tone = statusTone(status, colors);
  const ring = Math.max(1.5, size * 0.2);
  return (
    <View
      style={{
        width: size + cut * 2,
        height: size + cut * 2,
        borderRadius: radius.full,
        backgroundColor: surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
            backgroundColor: status === 'offline' ? surface : tone,
            borderWidth: status === 'offline' ? ring : 0,
            borderColor: tone,
          },
        ]}
      >
        {status === 'away' ? (
          <View
            style={{
              position: 'absolute',
              left: -size * 0.12,
              top: -size * 0.12,
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: radius.full,
              backgroundColor: surface,
            }}
          />
        ) : null}
        {status === 'busy' ? (
          <View
            style={{
              width: size * 0.56,
              height: Math.max(1.5, size * 0.18),
              borderRadius: radius.full,
              backgroundColor: surface,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function statusTone(status: AvatarStatus, colors: ReturnType<typeof useKit>['colors']) {
  return { online: colors.success, away: colors.warning, busy: colors.danger, offline: colors.mutedForeground }[status];
}

/** Eight-lobed rosette with a check, ringed by the surface colour so it reads as cut out. */
function VerifiedSeal({ size, cut, color, surface }: { size: number; cut: number; color: string; surface: string }) {
  const p = (cut * 24) / size;
  const w = size + cut * 2;
  const ink = contrast('#ffffff', color) >= 2.4 ? '#ffffff' : '#09090b';
  return (
    <Svg width={w} height={w} viewBox={`${-p} ${-p} ${24 + p * 2} ${24 + p * 2}`}>
      <Path d={SEAL} fill={surface} stroke={surface} strokeWidth={p * 2} strokeLinejoin="round" />
      <Path d={SEAL} fill={color} />
      <Path d="M8 12.4l2.8 2.8 5.4-5.6" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const SEAL = (() => {
  const n = 8;
  const pts = Array.from({ length: n * 2 }, (_, k) => {
    const a = (k * Math.PI) / n - Math.PI / 2;
    const rr = k % 2 === 0 ? 12 : 10.1;
    return [12 + rr * Math.cos(a), 12 + rr * Math.sin(a)] as const;
  });
  const mid = (a: readonly number[], b: readonly number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (v: number) => v.toFixed(2);
  const start = mid(pts[pts.length - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  pts.forEach((pt, i) => {
    const m = mid(pt, pts[(i + 1) % pts.length]);
    d += `Q${f(pt[0])} ${f(pt[1])} ${f(m[0])} ${f(m[1])}`;
  });
  return d + 'Z';
})();

function PersonIcon({ size, color }: { size: number; color: string }) {
  const s = size * 0.56;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={3.6} fill={color} />
      <Path d="M5.5 19.2c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export interface AvatarGroupProps {
  /** `<Avatar>` elements. The group sets their size, shape and surface. */
  children: React.ReactNode;
  /** Show at most this many, then a "+N" chip. */
  max?: number;
  size?: AvatarSize | number;
  shape?: AvatarShape;
  /** How far each avatar tucks under the previous one, as a fraction of its size (default 0.28). */
  overlap?: number;
  /** Real total when it is larger than the children you pass (e.g. 1,284 members). */
  total?: number;
  /** Staggered spring-in on mount (skipped with reduce motion). */
  animated?: boolean;
  /** Colour of the separating borders — match what the group sits on (default: theme background). */
  surface?: string;
  /** Makes the "+N" chip a button. */
  onPressMore?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Overlapping avatars separated by cut-out borders, with a "+N" chip and a staggered spring-in. */
export function AvatarGroup({
  children,
  max = 4,
  size = 'md',
  shape = 'circle',
  overlap = 0.28,
  total,
  animated = true,
  surface,
  onPressMore,
  style,
}: AvatarGroupProps) {
  const { colors, radius, dark } = useKit();
  const reduceMotion = useReduceMotion();
  const px = resolveSize(size);
  const bg = surface ?? colors.background;
  const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<AvatarProps>[];
  const shown = items.slice(0, Math.max(0, max));
  const extra = Math.max(0, (total ?? items.length) - shown.length);
  const count = shown.length + (extra > 0 ? 1 : 0);
  const border = Math.max(1.5, Math.round(px * 0.06 * 2) / 2);
  const inner = shape === 'circle' ? radius.full : Math.min(px / 2, radius.scale(Math.round(px * 0.3)));
  const wrapCorner = shape === 'circle' ? radius.full : inner + border;

  const anims = useRef<Animated.Value[]>([]).current;
  while (anims.length < count) anims.push(new Animated.Value(animated ? 0 : 1));

  useEffect(() => {
    if (!animated) return;
    if (reduceMotion) {
      anims.forEach((v) => v.setValue(1));
      return;
    }
    Animated.stagger(
      55,
      anims.slice(0, count).map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: true, ...motion.bouncy })),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const names = shown.map((c) => c.props.name).filter(Boolean) as string[];
  const label =
    names.length === 0
      ? `${total ?? items.length} people`
      : `${names.slice(0, 3).join(', ')}${(total ?? items.length) - Math.min(3, names.length) > 0 ? ` and ${(total ?? items.length) - Math.min(3, names.length)} more` : ''}`;

  const wrap = (child: React.ReactNode, i: number, key: React.Key) => (
    <Animated.View
      key={key}
      style={{
        marginLeft: i === 0 ? 0 : -px * overlap,
        borderRadius: wrapCorner,
        padding: border,
        backgroundColor: bg,
        zIndex: count - i,
        opacity: anims[i],
        transform: [
          { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
          { scale: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
      }}
    >
      {child}
    </Animated.View>
  );

  const extraText = extra > 999 ? `${(extra / 1000).toFixed(extra >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(extra);
  const more =
    extra > 0 ? (
      <Pressable
        accessibilityRole={onPressMore ? 'button' : 'text'}
        accessibilityLabel={`${extra} more`}
        disabled={!onPressMore}
        onPress={onPressMore}
        hitSlop={px < 44 ? Math.ceil((44 - px) / 2) : undefined}
        style={({ pressed }) => [
          styles.more,
          {
            width: px,
            height: px,
            borderRadius: inner,
            backgroundColor: alpha(colors.foreground, pressed ? (dark ? 0.18 : 0.12) : dark ? 0.12 : 0.07),
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.moreText, { color: colors.foreground, fontSize: Math.max(8, px * (extraText.length <= 2 ? 0.34 : extraText.length === 3 ? 0.29 : 0.24)) }]}
        >
          +{extraText}
        </Text>
      </Pressable>
    ) : null;

  return (
    <View
      accessible={!onPressMore}
      accessibilityRole={onPressMore ? undefined : 'image'}
      accessibilityLabel={onPressMore ? undefined : label}
      style={[styles.group, style]}
    >
      {shown.map((child, i) =>
        wrap(
          React.cloneElement(child, {
            size: px,
            shape,
            surface: bg,
            ring: 'none',
            seen: false,
            elevated: false,
            badge: undefined,
          }),
          i,
          child.key ?? i,
        ),
      )}
      {more ? wrap(more, shown.length, 'more') : null}
    </View>
  );
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function hsl(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(full.slice(1, 7), 16);
  if (Number.isNaN(n)) return 0;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const styles = StyleSheet.create({
  face: { overflow: 'visible' },
  clip: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '400', includeFontPadding: false, textAlign: 'center' },
  inkShadow: { textShadowColor: 'rgba(0,0,0,0.18)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0.5 } },
  pulse: { position: 'absolute' },
  dot: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '400', letterSpacing: -0.2, includeFontPadding: false },
  group: { flexDirection: 'row', alignItems: 'center' },
  more: { alignItems: 'center', justifyContent: 'center' },
  moreText: { fontWeight: '400', letterSpacing: -0.2 },
});
