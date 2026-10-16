import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FloatingInput } from '@/components/ui/floating-input';
import { PasswordInput } from '@/components/ui/password-input';
import { useKit } from '@/lib/kit';

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={{
        padding: 16,
        gap: 12,
        borderRadius: radius.xl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ gap: 2, marginBottom: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '400', color: colors.foreground }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function CreatePassword() {
  const [password, setPassword] = useState('Sunset');
  const [confirm, setConfirm] = useState('');
  return (
    <Card title="Choose a password" subtitle="You'll use it to sign in on new devices.">
      <PasswordInput label="New password" value={password} onChangeText={setPassword} requirements />
      <PasswordInput label="Confirm password" value={confirm} onChangeText={setConfirm} confirmOf={password} />
    </Card>
  );
}

export function SignIn() {
  const { colors } = useKit();
  return (
    <Card title="Welcome back">
      <FloatingInput label="Email" defaultValue="maya@studio.io" keyboardType="email-address" autoCapitalize="none" />
      <PasswordInput label="Password" strength={false} defaultValue="correct horse" />
      <Text style={{ alignSelf: 'flex-end', fontSize: 13, fontWeight: '400', color: colors.accent }}>Forgot password?</Text>
    </Card>
  );
}

export function StrengthMeter() {
  return (
    <View style={{ gap: 18 }}>
      <PasswordInput label="Password" defaultValue="hunter2" />
      <PasswordInput label="Password" defaultValue="Hunter2-Lighthouse!" />
    </View>
  );
}

export function CustomRules() {
  return (
    <Card title="Wi-Fi password" subtitle="Your router needs 12+ characters and no spaces.">
      <PasswordInput
        variant="filled"
        label="Network password"
        strength={false}
        defaultValue="cafe latte"
        requirements={[
          { label: '12+ characters', test: (v) => v.length >= 12 },
          { label: 'No spaces', test: (v) => v.length > 0 && !/\s/.test(v) },
        ]}
      />
    </Card>
  );
}

export function WrongPassword() {
  return (
    <PasswordInput
      label="Current password"
      strength={false}
      defaultValue="password123"
      error="That's not your current password"
      helper="Required to change your email"
    />
  );
}
