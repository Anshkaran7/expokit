import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { OtpInput } from '@/components/ui/otp-input';
import { useKit } from '@/lib/kit';

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        { padding: 16, gap: 12, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card },
        style,
      ]}
      {...rest}
    />
  );
}

function Header({ title, body }: { title: string; body: string }) {
  const { colors } = useKit();
  return (
    <View style={{ gap: 4, alignItems: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '400', color: colors.foreground, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center' }}>{body}</Text>
    </View>
  );
}

export function VerifyPhone() {
  const { colors } = useKit();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(24);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const done = code.length === 6;
  return (
    <Card>
      <Header title="Verify your number" body="Enter the code sent to +91 98•••• 4210" />
      <OtpInput
        value={code}
        onChangeText={setCode}
        success={code === '123456'}
        error={done && code !== '123456'}
        successText="Number verified"
        errorText="That code didn't match. Try 123456."
        helperText="Tip: the demo code is 123456"
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
        <Pressable disabled={left > 0} onPress={() => { setLeft(24); setCode(''); }} hitSlop={10}>
          <Text style={{ fontSize: 13, fontWeight: '400', color: left > 0 ? colors.mutedForeground : colors.accent }}>
            {left > 0 ? `Resend in 0:${String(left).padStart(2, '0')}` : 'Resend code'}
          </Text>
        </Pressable>
        <Pressable hitSlop={10} accessibilityRole="button">
          <Text style={{ fontSize: 13, fontWeight: '400', color: colors.accent }}>Change number</Text>
        </Pressable>
      </View>
    </Card>
  );
}

export function Pin() {
  const [pin, setPin] = useState('');
  return (
    <Card>
      <Header title="Enter your PIN" body="Confirm the transfer of ₹2,400 to Ananya" />
      <OtpInput variant="pill" length={4} secure value={pin} onChangeText={setPin} maxCellSize={56} />
    </Card>
  );
}

export function Underline() {
  return (
    <Card>
      <Header title="Check your inbox" body="We emailed a 6-digit code to karan@…" />
      <OtpInput variant="underline" helperText="Code expires in 10 minutes" />
    </Card>
  );
}

export function WithSeparator() {
  return (
    <Card>
      <Header title="Two-factor authentication" body="Open your authenticator app" />
      <OtpInput separatorAfter={3} maxCellSize={46} />
    </Card>
  );
}

export function States() {
  return (
    <View style={{ gap: 18 }}>
      <OtpInput length={4} value="4821" success successText="Verified" />
      <OtpInput length={4} value="1093" error errorText="Incorrect code" />
      <OtpInput length={4} value="72" disabled helperText="Too many attempts — try again in 5 min" />
    </View>
  );
}
