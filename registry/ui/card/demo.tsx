import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

export function Default() {
  const { colors } = useKit();
  return (
    <Card>
      <Card.Header action={<Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 18, color: colors.mutedForeground }}>⋯</Text>}>
        <Card.Title>Invite your team</Card.Title>
        <Card.Description>Collaborators can edit boards, leave comments and see version history.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>3 of 10 seats used on the Starter plan</Text>
      </Card.Content>
      <Card.Footer>
        <Button variant="outline" size="sm">Copy link</Button>
        <Button variant="accent" size="sm">Send invites</Button>
      </Card.Footer>
    </Card>
  );
}

export function Variants() {
  return (
    <View style={{ gap: 12 }}>
      {(['default', 'outline', 'elevated'] as const).map((variant) => (
        <Card key={variant} variant={variant} padding={16}>
          <Card.Header>
            <Card.Title>{variant[0].toUpperCase() + variant.slice(1)}</Card.Title>
            <Card.Description>variant=&quot;{variant}&quot;</Card.Description>
          </Card.Header>
        </Card>
      ))}
    </View>
  );
}

/** @pro */
export function Spotlight() {
  const { colors } = useKit();
  const [opened, setOpened] = useState(0);
  return (
    <Card variant="elevated" highlight="spotlight" onPress={() => setOpened((n) => n + 1)} accessibilityLabel="Open Kyoto guide">
      <Card.Media source={{ uri: 'https://picsum.photos/seed/kyoto/600/400' }} height={150} />
      <Card.Header>
        <Card.Title>Kyoto in autumn</Card.Title>
        <Card.Description numberOfLines={2}>Temples, maple-lined paths and the best matcha spots — a 4-day walking guide.</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>12 min read · opened {opened}×</Text>
      </Card.Footer>
    </Card>
  );
}

export function SelectablePlans() {
  const { colors } = useKit();
  const [plan, setPlan] = useState('pro');
  const plans = [
    { id: 'starter', name: 'Starter', price: 'Free', note: 'For side projects' },
    { id: 'pro', name: 'Pro', price: '₹499/mo', note: 'Unlimited boards and history' },
    { id: 'team', name: 'Team', price: '₹1,499/mo', note: 'Roles, SSO and audit log' },
  ];
  return (
    <View style={{ gap: 10 }}>
      {plans.map((p) => (
        <Card
          key={p.id}
          variant="outline"
          padding={16}
          highlight="border"
          onPress={() => setPlan(p.id)}
          accessibilityLabel={`${p.name} plan`}
          style={plan === p.id ? { borderColor: colors.accent, borderWidth: 1.5 } : undefined}
        >
          <Card.Header action={<Text style={{ fontWeight: '400', color: plan === p.id ? colors.accent : colors.mutedForeground }}>{p.price}</Text>}>
            <Card.Title>{p.name}</Card.Title>
            <Card.Description>{p.note}</Card.Description>
          </Card.Header>
        </Card>
      ))}
    </View>
  );
}
