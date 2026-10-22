import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { StatefulButton, type StatefulButtonState } from '@/components/ui/stateful-button';
import { useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SaveChanges() {
  return (
    <StatefulButton loadingText="Saving…" successText="Saved" onPress={() => sleep(1200)}>
      Save changes
    </StatefulButton>
  );
}

export function PaymentRetry() {
  const { colors } = useKit();
  const attempts = useRef(0);
  const [note, setNote] = useState('First attempt is declined, the retry goes through.');
  return (
    <View style={{ gap: 10 }}>
      <StatefulButton
        block
        size="lg"
        loadingText="Processing…"
        successText="Paid ₹1,299"
        errorText="Card declined"
        onPress={async () => {
          attempts.current += 1;
          await sleep(1300);
          if (attempts.current % 2 === 1) {
            setNote('Declined by the bank. Tap again to retry.');
            throw new Error('declined');
          }
          setNote('Payment received.');
        }}
      >
        Pay ₹1,299
      </StatefulButton>
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{note}</Text>
    </View>
  );
}

const ORDER: StatefulButtonState[] = ['idle', 'loading', 'success', 'error'];

export function Controlled() {
  const { colors, radius } = useKit();
  const [state, setState] = useState<StatefulButtonState>('idle');
  return (
    <View style={{ gap: 14 }}>
      <StatefulButton state={state} loadingText="Uploading" successText="Uploaded" errorText="Retry upload">
        Upload
      </StatefulButton>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ORDER.map((s) => (
          <Text
            key={s}
            maxFontSizeMultiplier={FONT_CAP}
            accessibilityRole="button"
            accessibilityState={{ selected: s === state }}
            onPress={() => setState(s)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: radius.capsule(34),
              overflow: 'hidden',
              fontSize: 13,
              color: s === state ? colors.accentForeground : colors.foreground,
              backgroundColor: s === state ? colors.accent : colors.muted,
            }}
          >
            {s}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function VariantsAndSizes() {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatefulButton onPress={() => sleep(1000)}>Publish</StatefulButton>
        <StatefulButton variant="secondary" onPress={() => sleep(1000)}>Sync</StatefulButton>
        <StatefulButton variant="outline" onPress={() => sleep(1000)}>Export</StatefulButton>
        <StatefulButton variant="ghost" onPress={() => sleep(1000)}>Archive</StatefulButton>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <StatefulButton size="sm" pill onPress={() => sleep(1000)}>Small</StatefulButton>
        <StatefulButton size="md" pill onPress={() => sleep(1000)}>Medium</StatefulButton>
        <StatefulButton size="lg" pill onPress={() => sleep(1000)}>Large</StatefulButton>
      </View>
    </View>
  );
}

export function FollowToggle() {
  const { colors } = useKit();
  const [following, setFollowing] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground }}>Expo</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>@expo · 214K followers</Text>
      </View>
      <StatefulButton
        pill
        size="sm"
        variant="secondary"
        successText={following ? 'Following' : 'Unfollowed'}
        resetAfter={900}
        onPress={async () => {
          await sleep(700);
          setFollowing((f) => !f);
        }}
      >
        {following ? 'Following' : 'Follow'}
      </StatefulButton>
    </View>
  );
}
