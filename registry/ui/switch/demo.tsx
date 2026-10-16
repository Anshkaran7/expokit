import React, { useState } from 'react';
import { View } from 'react-native';

import { Switch } from '@/components/ui/switch';
import { useKit } from '@/lib/kit';

export function IOS() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <Switch defaultValue />
      <Switch />
      <Switch defaultValue accent="#22c55e" />
      <Switch defaultValue disabled />
    </View>
  );
}

export function Material() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <Switch variant="material" defaultValue />
      <Switch variant="material" />
      <Switch variant="material" defaultValue />
    </View>
  );
}

export function Icons() {
  const [dark, setDark] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Switch variant="icon" size="lg" value={dark} onValueChange={setDark} accessibilityLabel="Dark mode" />
      <Switch variant="icon" icon="check" defaultValue accessibilityLabel="Auto-save" />
    </View>
  );
}

export function SettingsRows() {
  const { colors, radius } = useKit();
  const rows = [
    { label: 'Push notifications', description: 'Replies, mentions and direct messages.', on: true },
    { label: 'Weekly digest', description: "A summary of your team's activity every Monday." },
    { label: 'Share usage data', description: 'Managed by your organisation.', disabled: true },
  ];
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <Switch
          key={r.label}
          label={r.label}
          description={r.description}
          defaultValue={r.on}
          disabled={r.disabled}
          style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}
        />
      ))}
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <Switch size="sm" defaultValue />
      <Switch size="md" defaultValue />
      <Switch size="lg" defaultValue />
    </View>
  );
}
