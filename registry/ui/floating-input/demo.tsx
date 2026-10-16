import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FloatingInput } from '@/components/ui/floating-input';
import { readableOn, useKit } from '@/lib/kit';

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

const isEmail = (v: string) => /^\S+@\S+\.\S{2,}$/.test(v);

export function SignUp() {
  const { colors } = useKit();
  const [name, setName] = useState('Priya Sharma');
  const [email, setEmail] = useState('priya@');
  const [phone, setPhone] = useState('');
  const emailError = email.length > 0 && !isEmail(email) ? 'Enter a valid email address' : undefined;
  return (
    <Card title="Create your account" subtitle="It takes less than a minute.">
      <FloatingInput label="Full name" value={name} onChangeText={setName} autoComplete="name" clearable />
      <FloatingInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={emailError}
        success={isEmail(email) ? 'Looks good' : undefined}
      />
      <FloatingInput
        label="Mobile number"
        prefix="+91"
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
        keyboardType="phone-pad"
        maxLength={10}
        success={phone.length === 10}
        helper="We'll text you a 6-digit code"
      />
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
        Already have an account? <Text style={{ fontWeight: '400', color: colors.accent }}>Sign in</Text>
      </Text>
    </Card>
  );
}

const formatCard = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const cardBrand = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'MC';
  if (/^3[47]/.test(d)) return 'AMEX';
  return undefined;
};

/** '' = not finished yet, otherwise an error message or null when valid. */
const expiryError = (v: string): string | null | '' => {
  if (v.length < 5) return '';
  const month = Number(v.slice(0, 2));
  const year = 2000 + Number(v.slice(3));
  if (month < 1 || month > 12) return 'Month must be 01–12';
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return 'This card has expired';
  return null;
};

// Indian digit grouping (₹1,23,456) by hand — Hermes may ignore toLocaleString locales.
const rupees = (n: number) => {
  const [int, frac] = n.toFixed(2).split('.');
  return `₹${int.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,')}${frac === '00' ? '' : `.${frac}`}`;
};

export function Payment() {
  const { colors, radius } = useKit();
  const [amount, setAmount] = useState('1299');
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [paid, setPaid] = useState(false);
  const brand = cardBrand(card);
  const cvcLen = brand === 'AMEX' ? 4 : 3;
  const expErr = expiryError(expiry);
  const ready = Number(amount) > 0 && card.length >= 18 && expErr === null && cvc.length === cvcLen;
  return (
    <Card title="Add funds" subtitle="Charged securely — you can cancel anytime.">
      <FloatingInput label="Amount" prefix="₹" suffix="INR" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <FloatingInput
        label="Card number"
        keyboardType="number-pad"
        autoComplete="cc-number"
        value={card}
        onChangeText={(v) => setCard(formatCard(v))}
        maxLength={19}
        suffix={brand}
        success={card.length === 19}
      />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <FloatingInput
          label="MM/YY"
          keyboardType="number-pad"
          autoComplete="cc-exp"
          value={expiry}
          onChangeText={(v) => setExpiry(formatExpiry(v))}
          maxLength={5}
          error={expErr || undefined}
          success={expErr === null}
          style={{ flex: 1 }}
        />
        <FloatingInput
          label="CVC"
          keyboardType="number-pad"
          autoComplete="cc-csc"
          secureTextEntry
          value={cvc}
          onChangeText={(v) => setCvc(v.replace(/\D/g, '').slice(0, cvcLen))}
          maxLength={cvcLen}
          helper={`${cvcLen} digits on the ${brand === 'AMEX' ? 'front' : 'back'}`}
          style={{ flex: 1 }}
        />
      </View>
      <Pressable
        disabled={!ready}
        onPress={() => setPaid(true)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        style={({ pressed }) => ({
          height: 50,
          marginTop: 4,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready ? colors.accent : colors.muted,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '400', color: ready ? readableOn(colors.accent) : colors.mutedForeground }}>
          {paid ? 'Paid ✓' : `Pay ${rupees(Number(amount) || 0)}`}
        </Text>
      </Pressable>
    </Card>
  );
}

export function Variants() {
  return (
    <View style={{ gap: 18 }}>
      <FloatingInput label="Outlined" defaultValue="Notch cuts the border" helper="Tap to see the focus halo" />
      <FloatingInput variant="filled" label="Filled" defaultValue="Bar grows from the centre" />
      <FloatingInput variant="underline" label="Underline" defaultValue="Minimal, for dense forms" />
    </View>
  );
}

export function States() {
  return (
    <View style={{ gap: 16 }}>
      <FloatingInput label="Username" defaultValue="admin" error="That username is already taken" />
      <FloatingInput label="Username" defaultValue="priya.codes" success="Nice — it's available" />
      <FloatingInput label="Workspace" defaultValue="Acme Inc." editable={false} helper="Only owners can rename the workspace" />
    </View>
  );
}

export function Website() {
  const [slug, setSlug] = useState('');
  return (
    <Card title="Your public page">
      <FloatingInput
        label="Website"
        prefix="https://"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        clearable
      />
      <FloatingInput
        label="Handle"
        prefix="@"
        suffix=".expo.page"
        value={slug}
        onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        autoCapitalize="none"
        maxLength={20}
        counter
        helper="Letters, numbers and dashes"
      />
    </Card>
  );
}

export function Sizes() {
  return (
    <View style={{ gap: 14 }}>
      <FloatingInput size="sm" label="Small · 44pt" defaultValue="Compact filters and toolbars" clearable />
      <FloatingInput size="md" label="Medium · 54pt" defaultValue="The default for forms" clearable />
      <FloatingInput size="lg" label="Large · 64pt" defaultValue="Hero fields" clearable />
    </View>
  );
}

/** floatingLabel={false}: static labels above the fields, placeholders inside. */
export function LabelAbove() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  return (
    <Card title="Edit profile" subtitle="This is how others will see you.">
      <FloatingInput floatingLabel={false} label="Full name" placeholder="Priya Sharma" value={name} onChangeText={setName} autoComplete="name" clearable />
      <FloatingInput
        floatingLabel={false}
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={email.length > 0 && !isEmail(email) ? 'Enter a valid email address' : undefined}
        helper="We'll never share it."
      />
      <FloatingInput
        floatingLabel={false}
        label="Bio"
        placeholder="A line about you"
        value={bio}
        onChangeText={setBio}
        maxLength={80}
        counter
      />
    </Card>
  );
}

/** Style slots: restyle the box, label, typed text and message without forking the component. */
export function CustomStyles() {
  const { colors, radius } = useKit();
  const [handle, setHandle] = useState('priya.codes');
  return (
    <Card title="Custom styles" subtitle="fieldStyle, labelStyle, inputStyle, messageStyle.">
      <FloatingInput
        label="Username"
        prefix="@"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        autoCorrect={false}
        helper="Letters, numbers and dots."
        fieldStyle={{ borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card }}
        surface={colors.card}
        labelStyle={{ fontSize: 15, fontWeight: '400', letterSpacing: 0.2 }}
        inputStyle={{ fontSize: 17, fontWeight: '400', letterSpacing: 0.3 }}
        prefixStyle={{ color: colors.accent, fontWeight: '400' }}
        messageStyle={{ fontStyle: 'italic' }}
      />
    </Card>
  );
}
