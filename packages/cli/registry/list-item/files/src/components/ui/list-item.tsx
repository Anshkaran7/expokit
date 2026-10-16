import React, { useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { alpha, isTextNode, readableOn, useKit } from '@/lib/kit';

export type ListItemSize = 'sm' | 'md' | 'lg';

export type ListItemIconName =
  | 'user'
  | 'bell'
  | 'lock'
  | 'shield'
  | 'mail'
  | 'card'
  | 'help'
  | 'logout'
  | 'moon'
  | 'globe'
  | 'star'
  | 'trash'
  | 'settings'
  | 'heart'
  | 'phone'
  | 'wifi';

export interface ListItemIconProps {
  color: string;
  size: number;
}

export interface ListItemAvatar {
  /** Image URL. Falls back to initials while loading or when it fails. */
  src?: string;
  /** Used for the initials and the fallback colour. */
  name?: string;
  /** Fallback circle colour (default: picked from the name). */
  color?: string;
  /** Shows a green presence dot. */
  online?: boolean;
}

export interface ListItemProps {
  title: string;
  /** One muted line under the title. */
  subtitle?: string;
  /** Longer muted text under the subtitle, clamped to `numberOfLines`. */
  description?: string;
  /** Lines shown of `description` (default 2). */
  numberOfLines?: number;
  /** Small text at the right end of the title row, e.g. a time ("9:41"). */
  meta?: string;

  /** Built-in icon name or your own icon, drawn in a rounded tile. */
  icon?: ListItemIconName | ((props: ListItemIconProps) => React.ReactNode);
  /** Tile colour (default: theme accent; the danger colour when `destructive`). */
  iconColor?: string;
  /** 'filled' white glyph on a solid tile (iOS Settings) · 'tinted' coloured glyph on a soft tile. */
  iconVariant?: 'filled' | 'tinted';
  /** Round avatar instead of an icon tile. */
  avatar?: ListItemAvatar;
  /** Anything else on the left (overrides `icon` / `avatar`). */
  leading?: React.ReactNode;

  /** Muted value text on the right, e.g. "English" or "1.2 GB". */
  value?: string;
  /** `true` draws a dot; a number or string draws a pill (99+ above 99). */
  badge?: boolean | number | string;
  /** Shows a chevron. Defaults to true when the row is pressable and has no `trailing` / `checked`. */
  chevron?: boolean;
  /** Shows an accent check mark (for pickers). */
  checked?: boolean;
  /** Anything on the right, e.g. a <Switch />. Rendered after `value` and `badge`. */
  trailing?: React.ReactNode;

  onPress?: () => void;
  onLongPress?: () => void;
  /** Red title and icon, for "Sign out" or "Delete account". */
  destructive?: boolean;
  disabled?: boolean;
  size?: ListItemSize;
  /** Hairline under the row that starts past the leading slot. ListGroup / ListSection set it for you. */
  divider?: boolean;
  /** Highlight colour for checks, badges and default icon tiles (default: theme accent). */
  accent?: string;
  titleStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ListItemSize, { minH: number; tile: number; glyph: number; avatar: number; title: number; sub: number; padY: number }> = {
  sm: { minH: 44, tile: 26, glyph: 15, avatar: 32, title: 15, sub: 13, padY: 8 },
  md: { minH: 52, tile: 30, glyph: 18, avatar: 40, title: 16, sub: 13.5, padY: 11 },
  lg: { minH: 68, tile: 38, glyph: 21, avatar: 48, title: 17, sub: 14, padY: 14 },
};

const PAD_X = 16;
const GAP = 12;
const AVATAR_COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#6366f1', '#eab308'];

/**
 * Settings / contacts style row: icon tile, avatar or custom leading; title, subtitle and
 * description; value, badge, check, chevron or any control on the right. Pressing fades in a
 * highlight on the native driver and fades it out slowly, like UIKit table cells.
 */
export function ListItem({
  title,
  subtitle,
  description,
  numberOfLines = 2,
  meta,
  icon,
  iconColor,
  iconVariant = 'filled',
  avatar,
  leading,
  value,
  badge,
  chevron,
  checked,
  trailing,
  onPress,
  onLongPress,
  destructive,
  disabled,
  size = 'md',
  divider,
  accent,
  titleStyle,
  accessibilityLabel,
  style,
}: ListItemProps) {
  const { colors, radius } = useKit();
  const tint = accent ?? colors.accent;
  const s = SIZES[size];
  const pressable = !!(onPress || onLongPress);
  const showChevron = chevron ?? (pressable && trailing === undefined && checked === undefined);
  const titleColor = destructive ? colors.danger : colors.foreground;

  // Press highlight: an overlay whose opacity runs on the native driver.
  const highlight = useRef(new Animated.Value(0)).current;
  const fade = (to: number, duration: number) =>
    Animated.timing(highlight, { toValue: to, duration, useNativeDriver: true }).start();

  // ---- leading -------------------------------------------------------------------------------
  let lead: React.ReactNode = leading ?? null;
  let leadW = 0;
  if (leading) {
    leadW = -1; // unknown width: divider starts at the text via onLayout below
  } else if (avatar) {
    lead = <AvatarCircle {...avatar} size={s.avatar} ring={colors.card} />;
    leadW = s.avatar;
  } else if (icon) {
    const tile = iconColor ?? (destructive ? colors.danger : tint);
    const filled = iconVariant === 'filled';
    const glyphColor = filled ? readableOn(tile) : tile;
    lead = (
      <View
        style={[
          styles.tile,
          { width: s.tile, height: s.tile, borderRadius: Math.min(s.tile / 2, radius.scale(Math.round(s.tile * 0.27))), backgroundColor: filled ? tile : alpha(tile, 0.14) },
        ]}
      >
        {typeof icon === 'function' ? icon({ color: glyphColor, size: s.glyph }) : <ListIcon name={icon} color={glyphColor} size={s.glyph} />}
      </View>
    );
    leadW = s.tile;
  }

  // Custom leading content: measure it so the divider still lines up with the text.
  const [measured, setMeasured] = useState(0);
  const inset = PAD_X + (leadW === -1 ? measured : leadW ? leadW + GAP : 0);

  const badgeText = typeof badge === 'number' ? (badge > 99 ? '99+' : String(badge)) : typeof badge === 'string' ? badge : null;

  const content = (
    <>
      {lead ? (
        <View onLayout={leadW === -1 ? (e) => setMeasured(e.nativeEvent.layout.width + GAP) : undefined} style={styles.leading}>
          {lead}
        </View>
      ) : null}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.title, { fontSize: s.title, color: titleColor }, titleStyle]}>
            {title}
          </Text>
          {meta ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{meta}</Text> : null}
        </View>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.sub, { fontSize: s.sub, color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
        {description ? (
          <Text numberOfLines={numberOfLines} style={[styles.desc, { fontSize: s.sub, lineHeight: s.sub * 1.36, color: colors.mutedForeground }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {value || badge || checked || trailing !== undefined || showChevron ? (
        <View style={styles.trailing}>
          {value ? (
            <Text numberOfLines={1} style={[styles.value, { color: colors.mutedForeground }]}>
              {value}
            </Text>
          ) : null}
          {badge === true ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
          {badgeText ? (
            <View style={[styles.badge, { borderRadius: radius.capsule(22), backgroundColor: tint }]}>
              <Text style={[styles.badgeText, { color: readableOn(tint) }]}>{badgeText}</Text>
            </View>
          ) : null}
          {isTextNode(trailing) ? <Text style={[styles.value, { color: colors.mutedForeground }]}>{trailing}</Text> : trailing}
          {checked ? <Check color={tint} /> : null}
          {showChevron ? <Chevron color={alpha(colors.mutedForeground, 0.7)} /> : null}
        </View>
      ) : null}
      {divider ? (
        <View pointerEvents="none" style={[styles.divider, { left: inset, backgroundColor: colors.border }]} />
      ) : null}
    </>
  );

  const rowStyle = [styles.row, { minHeight: s.minH, paddingVertical: s.padY }, disabled && styles.disabled, style];

  if (!pressable) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={rowStyle}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => fade(1, 60)}
      onPressOut={() => fade(0, 320)}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, checked: checked === undefined ? undefined : checked }}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value, badgeText ? `${badgeText} new` : null].filter(Boolean).join(', ')}
      style={rowStyle}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: destructive ? alpha(colors.danger, 0.1) : alpha(colors.foreground, 0.07), opacity: highlight },
        ]}
      />
      {content}
    </Pressable>
  );
}

export interface ListGroupProps {
  /** Small uppercase heading above the card. */
  header?: string;
  /** Muted explanation under the card. */
  footer?: string;
  /** Card colour (default: theme card). */
  background?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * iOS inset-grouped card: rounded surface with a header and footer, and hairline separators
 * between rows that start past the icon so they line up with the text.
 */
export function ListGroup({ header, footer, background, children, style }: ListGroupProps) {
  const { colors, radius } = useKit();
  return (
    <View style={[styles.group, style]}>
      {header ? (
        <Text accessibilityRole="header" style={[styles.header, { color: colors.mutedForeground }]}>
          {header}
        </Text>
      ) : null}
      <View
        style={[
          styles.card,
          { backgroundColor: background ?? colors.card, borderColor: colors.border, borderRadius: radius.lg },
        ]}
      >
        {withDividers(children)}
      </View>
      {footer ? <Text style={[styles.footer, { color: colors.mutedForeground }]}>{footer}</Text> : null}
    </View>
  );
}

export interface ListSectionProps {
  /** Section heading, e.g. "A" in a contacts list or "Today" in an inbox. */
  header?: string;
  footer?: string;
  /** Hairline under the last row too (default false). */
  dividerAfterLast?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Plain full-width section: header text, then rows with inset separators. */
export function ListSection({ header, footer, dividerAfterLast, children, style }: ListSectionProps) {
  const { colors } = useKit();
  return (
    <View style={style}>
      {header ? (
        <Text accessibilityRole="header" style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
          {header}
        </Text>
      ) : null}
      {withDividers(children, dividerAfterLast)}
      {footer ? <Text style={[styles.footer, { color: colors.mutedForeground }]}>{footer}</Text> : null}
    </View>
  );
}

/** Gives every ListItem but the last a divider (unless it sets `divider` itself). */
function withDividers(children: React.ReactNode, last = false) {
  const items = React.Children.toArray(children).filter(React.isValidElement);
  return items.map((child, i) => {
    if (child.type !== ListItem) return child;
    const el = child as React.ReactElement<ListItemProps>;
    if (el.props.divider !== undefined) return el;
    return React.cloneElement(el, { divider: last || i < items.length - 1 });
  });
}

function AvatarCircle({ src, name = '', color, online, size, ring }: ListItemAvatar & { size: number; ring: string }) {
  const { colors } = useKit();
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const bg = color ?? AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Text style={{ color: readableOn(bg), fontSize: size * 0.38, fontWeight: '400' }}>{initials}</Text>
        {src && !failed ? (
          <Image source={{ uri: src }} onError={() => setFailed(true)} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
        ) : null}
      </View>
      {online ? (
        <View
          style={[
            styles.online,
            { width: dot, height: dot, borderRadius: dot / 2, borderColor: ring, backgroundColor: colors.success },
          ]}
        />
      ) : null}
    </View>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Check({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The built-in glyphs, 24×24 line icons with a 1.8 stroke. */
export function ListIcon({ name, color, size = 20 }: { name: ListItemIconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const paths: Record<ListItemIconName, React.ReactNode> = {
    user: (
      <>
        <Circle cx={12} cy={8} r={4} {...p} />
        <Path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" {...p} />
      </>
    ),
    bell: (
      <>
        <Path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" {...p} />
        <Path d="M10 21h4" {...p} />
      </>
    ),
    lock: (
      <>
        <Rect x={5} y={11} width={14} height={10} rx={2.5} {...p} />
        <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} />
      </>
    ),
    shield: (
      <>
        <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...p} />
        <Path d="M9 12l2 2 4-4" {...p} />
      </>
    ),
    mail: (
      <>
        <Rect x={3} y={5} width={18} height={14} rx={2.5} {...p} />
        <Path d="M3.5 7l8.5 6 8.5-6" {...p} />
      </>
    ),
    card: (
      <>
        <Rect x={3} y={5} width={18} height={14} rx={2.5} {...p} />
        <Path d="M3 10h18M7 15h4" {...p} />
      </>
    ),
    help: (
      <>
        <Circle cx={12} cy={12} r={9} {...p} />
        <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3" {...p} />
        <Circle cx={12} cy={17} r={1} fill={color} />
      </>
    ),
    logout: (
      <>
        <Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" {...p} />
        <Path d="M10 8l-4 4 4 4M6 12h10" {...p} />
      </>
    ),
    moon: <Path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" {...p} />,
    globe: (
      <>
        <Circle cx={12} cy={12} r={9} {...p} />
        <Path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" {...p} />
      </>
    ),
    star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" {...p} />,
    trash: (
      <>
        <Path d="M4 7h16M10 11v6M14 11v6M9 7V4.5h6V7" {...p} />
        <Path d="M6 7l1 13h10l1-13" {...p} />
      </>
    ),
    settings: (
      <>
        <Circle cx={12} cy={12} r={3} {...p} />
        <Path
          d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.2 2.5 1.2 2.5-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6L6 12.7 4.8 10.2l2.3-1.6.6-2.7 2.7.6z"
          {...p}
        />
      </>
    ),
    heart: <Path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" {...p} />,
    phone: <Path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 6.2 2 2 0 0 1 5 4z" {...p} />,
    wifi: (
      <>
        <Path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9.2 9.2 0 0 1 12.4 0M9.1 16a4.5 4.5 0 0 1 5.8 0" {...p} />
        <Circle cx={12} cy={19.2} r={1.1} fill={color} />
      </>
    ),
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths[name]}
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD_X, gap: GAP, overflow: 'hidden' },
  disabled: { opacity: 0.45 },
  leading: { alignItems: 'center', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontWeight: '400', letterSpacing: -0.2 },
  meta: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  sub: { marginTop: 2 },
  desc: { marginTop: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: '50%' },
  value: { fontSize: 15, flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '400', fontVariant: ['tabular-nums'] },
  divider: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  online: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2 },
  group: { gap: 8, alignSelf: 'stretch' },
  header: { fontSize: 12.5, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16 },
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  footer: { fontSize: 12.5, lineHeight: 17, paddingHorizontal: 16 },
  sectionHeader: { fontSize: 13, fontWeight: '400', letterSpacing: 0.3, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
