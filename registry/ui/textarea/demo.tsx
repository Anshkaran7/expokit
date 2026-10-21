import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Textarea } from '@/components/ui/textarea';
import { useKit } from '@/lib/kit';

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

function Card({ title, subtitle, screen, children }: { title: string; subtitle?: string; screen?: boolean; children: React.ReactNode }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={
        screen
          ? { flex: 1, padding: 16, gap: 12, backgroundColor: colors.background }
          : {
              padding: 16,
              gap: 12,
              borderRadius: radius.xl,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }
      }
    >
      <View style={{ gap: 2, marginBottom: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '400', color: colors.foreground }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ToolButton({ glyph, label }: { glyph: string; label: string }) {
  const { colors } = useKit();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}
    >
      <Text style={{ fontSize: 17, fontWeight: '400', color: colors.mutedForeground }}>{glyph}</Text>
    </Pressable>
  );
}

export function Composer() {
  const { colors, radius } = useKit();
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>(['Are we still on for the design review at 3?']);
  const canSend = draft.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    setSent((s) => [...s.slice(-1), draft.trim()]);
    setDraft('');
  };
  return (
    <View style={{ gap: 10 }}>
      {sent.map((m, i) => (
        <View
          key={i}
          style={{ alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: colors.accent, borderRadius: radius.scale(18), paddingHorizontal: 14, paddingVertical: 9 }}
        >
          <Text style={{ color: colors.accentForeground, fontSize: 15 }}>{m}</Text>
        </View>
      ))}
      <Textarea
        placeholder="Message Alex…"
        value={draft}
        onChangeText={setDraft}
        minRows={1}
        maxRows={5}
        toolbar={
          <>
            <ToolButton glyph="+" label="Attach a file" />
            <ToolButton glyph="@" label="Mention someone" />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              hitSlop={6}
              style={{
                height: 32,
                paddingHorizontal: 14,
                borderRadius: radius.capsule(32),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
                opacity: canSend ? 1 : 0.4,
              }}
            >
              <Text style={{ color: colors.accentForeground, fontSize: 14, fontWeight: '400' }}>Send ↑</Text>
            </Pressable>
          </>
        }
      />
    </View>
  );
}

export function Review({ screen }: DemoProps) {
  const [review, setReview] = useState('Great coffee, but');
  const length = review.trim().length;
  return (
    <Card screen={screen} title="Rate Blue Bottle, Hayes Valley" subtitle="Reviews are public and show your first name.">
      <Textarea
        label="Your review"
        value={review}
        onChangeText={setReview}
        maxLength={200}
        enforceMaxLength={false}
        minRows={3}
        error={length > 0 && length < 20 ? 'Tell us a little more — at least 20 characters' : length > 200 ? 'Keep it under 200 characters' : undefined}
        success={length >= 20 && length <= 200 ? 'Thanks — that will really help others' : undefined}
      />
    </Card>
  );
}

export function Feedback({ screen }: DemoProps) {
  return (
    <Card screen={screen} title="Send feedback" subtitle="Goes straight to the product team.">
      <Textarea
        variant="filled"
        label="What could be better?"
        defaultValue="Dark mode on the invoices page is a little too low-contrast for me."
        helper="Screenshots help — attach them in the next step."
        minRows={3}
        maxRows={6}
      />
    </Card>
  );
}

export function CharacterLimit() {
  return (
    <Textarea
      label="What's happening?"
      maxLength={140}
      defaultValue="Shipping the new ExpoKit inputs today — focus halos, animated checks and fields that glide taller as you type."
      minRows={3}
    />
  );
}

export function States() {
  return (
    <View style={{ gap: 16 }}>
      <Textarea label="Delivery instructions" minRows={2} defaultValue="Leave it with the concierge, code 4417." success="Saved for next time" />
      <Textarea label="Notes for the courier" minRows={2} editable={false} defaultValue="Locked while the order is out for delivery." />
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ gap: 14 }}>
      <Textarea size="sm" label="Small · 14px" minRows={1} defaultValue="Compact comment box" />
      <Textarea size="md" label="Medium · 16px" minRows={1} defaultValue="The default for forms" />
      <Textarea size="lg" label="Large · 18px" minRows={1} defaultValue="Journaling and long-form" />
    </View>
  );
}
