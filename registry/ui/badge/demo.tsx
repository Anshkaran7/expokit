import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, BadgeIcon, BadgeIconTile, NotificationBadge, type BadgeIconName, type BadgeTone } from '@/components/ui/badge';
import { alpha, useKit } from '@/lib/kit';

const TONES = ['neutral', 'accent', 'success', 'warning', 'danger'] as const;

export function Variants() {
  return (
    <View style={{ gap: 10 }}>
      {(['solid', 'soft', 'outline', 'dot'] as const).map((variant) => (
        <View key={variant} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TONES.map((tone) => (
            <Badge key={tone} variant={variant} tone={tone}>
              {tone[0].toUpperCase() + tone.slice(1)}
            </Badge>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Statuses() {
  const { colors } = useKit();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Badge variant="dot" tone="success" pulse>Live</Badge>
      <Badge variant="soft" tone="success" icon={<BadgeIcon name="package" color={colors.success} size={14} />}>Paid</Badge>
      <Badge variant="soft" tone="warning">Pending review</Badge>
      <Badge variant="outline" tone="danger">Overdue</Badge>
      <Badge variant="solid" tone="accent" shape="rounded">PRO</Badge>
      <Badge variant="soft" tone="accent" icon={<BadgeIcon name="heart" color={colors.accent} size={14} />}>Saved</Badge>
    </View>
  );
}

const DEPLOY: { label: string; tone: BadgeTone; icon: BadgeIconName }[] = [
  { label: 'Queued', tone: 'neutral', icon: 'clock' },
  { label: 'Building', tone: 'warning', icon: 'refresh' },
  { label: 'Deployed', tone: 'success', icon: 'check' },
  { label: 'Failed', tone: 'danger', icon: 'alert' },
];

export function LiveStatus() {
  const { colors } = useKit();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((i) => (i + 1) % DEPLOY.length), 1800);
    return () => clearInterval(id);
  }, []);
  const { label, tone, icon } = DEPLOY[step];
  const tint = { neutral: colors.mutedForeground, accent: colors.accent, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 15, color: colors.foreground }}>web-checkout #482</Text>
        <Badge tone={tone} icon={<BadgeIcon name={icon} color={tint} size={14} />}>
          {label}
        </Badge>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 15, color: colors.foreground }}>api-gateway #117</Text>
        <Badge variant="solid" tone={tone} size="lg">
          {label}
        </Badge>
        <Badge variant="dot" tone={tone} pulse={tone === 'warning'}>
          {label}
        </Badge>
      </View>
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Badge size="sm" tone="accent">Small</Badge>
      <Badge size="md" tone="accent">Medium</Badge>
      <Badge size="lg" tone="accent">Large</Badge>
    </View>
  );
}

export function Notifications() {
  const { colors, radius } = useKit();
  const [count, setCount] = useState(3);
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', gap: 26 }}>
        <NotificationBadge count={count}>
          <BadgeIconTile name="bell" backgroundColor={alpha(colors.accent, 0.12)} color={colors.accent} />
        </NotificationBadge>
        <NotificationBadge count={count * 37} tone="accent">
          <BadgeIconTile name="message" backgroundColor={alpha(colors.accent, 0.1)} color={colors.accent} />
        </NotificationBadge>
        <NotificationBadge count={count} dot tone="success">
          <BadgeIconTile name="package" backgroundColor={alpha(colors.success, 0.12)} color={colors.success} />
        </NotificationBadge>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          ['+ New', () => setCount((c) => c + 1)],
          ['Mark all read', () => setCount(0)],
        ].map(([label, onPress]) => (
          <Pressable
            key={label as string}
            onPress={onPress as () => void}
            style={{ paddingHorizontal: 14, height: 36, borderRadius: radius.capsule(36), justifyContent: 'center', backgroundColor: colors.muted }}
          >
            <Text style={{ fontWeight: '400', color: colors.foreground }}>{label as string}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
