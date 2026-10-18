import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AnimatedText } from '@/components/ui/text-animation';
import { useKit } from '@/lib/kit';

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius } = useKit();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={4}
      style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.capsule(36), justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: colors.muted }}
    >
      <Text style={{ color: colors.foreground, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Reveal() {
  const [run, setRun] = useState(0);
  return (
    <View style={{ gap: 16 }}>
      <AnimatedText replayKey={run} textStyle={{ fontSize: 30, fontWeight: '600', letterSpacing: -0.8, lineHeight: 36 }}>
        Ship native apps that feel alive.
      </AnimatedText>
      <Chip label="Replay" onPress={() => setRun((r) => r + 1)} />
    </View>
  );
}

export function Thinking() {
  const { colors, radius } = useKit();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: 28, height: 28, borderRadius: radius.capsule(28), backgroundColor: colors.accent }} />
      <AnimatedText variant="shimmer" textStyle={{ fontSize: 16 }}>
        Thinking…
      </AnimatedText>
    </View>
  );
}

const STATUSES = ['Queued', 'Building', 'Deploying', 'Live'];

export function DeployStatus() {
  const { colors, radius } = useKit();
  const [i, setI] = useState(0);
  const status = STATUSES[i];
  const live = status === 'Live';
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 10, height: 10, borderRadius: radius.capsule(10), backgroundColor: live ? colors.success : colors.warning }} />
        <Text style={{ fontSize: 17, color: colors.mutedForeground }}>expokit.dev</Text>
        <AnimatedText variant="cascade" color={live ? colors.success : colors.foreground} textStyle={{ fontSize: 17, fontWeight: '600' }}>
          {status}
        </AnimatedText>
      </View>
      <Chip label="Next status" onPress={() => setI((n) => (n + 1) % STATUSES.length)} />
    </View>
  );
}

export function Scramble() {
  const { colors, font } = useKit();
  const [run, setRun] = useState(0);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Your referral code</Text>
        <AnimatedText variant="scramble" replayKey={run} textStyle={{ fontSize: 28, fontWeight: '600', letterSpacing: 2, fontFamily: font.mono }}>
          SPRING-7Q2X
        </AnimatedText>
      </View>
      <Chip label="Generate again" onPress={() => setRun((r) => r + 1)} />
    </View>
  );
}

const ANSWER =
  'Spring animations feel natural because they keep momentum: a flick carries its speed into the motion, and nothing stops dead.';

export function Streaming() {
  const { colors, radius } = useKit();
  const [text, setText] = useState('');
  const [run, setRun] = useState(0);
  useEffect(() => {
    // Simulates tokens arriving from a model, a few words at a time.
    const words = ANSWER.split(' ');
    let n = 0;
    const id = setInterval(() => {
      n = Math.min(words.length, n + 1 + Math.floor(Math.random() * 3));
      setText(words.slice(0, n).join(' '));
      if (n >= words.length) clearInterval(id);
    }, 260);
    return () => clearInterval(id);
  }, [run]);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ padding: 14, borderRadius: radius.lg, backgroundColor: colors.muted }}>
        <AnimatedText key={run} variant="typewriter" textStyle={{ fontSize: 16, lineHeight: 23 }}>
          {text}
        </AnimatedText>
      </View>
      <Chip
        label="Ask again"
        onPress={() => {
          setText('');
          setRun((r) => r + 1);
        }}
      />
    </View>
  );
}

export function Hero() {
  const { colors } = useKit();
  const [run, setRun] = useState(0);
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Replays the animation" onPress={() => setRun((r) => r + 1)} style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <AnimatedText variant="scramble" replayKey={run} color={colors.accent} style={{ alignSelf: 'stretch' }} textStyle={{ fontSize: 13, fontWeight: '600', letterSpacing: 1.5, textAlign: 'center' }}>
        NEW IN EXPOKIT
      </AnimatedText>
      <AnimatedText replayKey={run} delay={250} style={{ alignSelf: 'stretch' }} textStyle={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, lineHeight: 40, textAlign: 'center' }}>
        Motion your users can feel
      </AnimatedText>
      <AnimatedText variant="typewriter" replayKey={run} delay={900} caret={false} style={{ alignSelf: 'stretch' }} color={colors.mutedForeground} textStyle={{ fontSize: 15, textAlign: 'center' }}>
        Tap anywhere to play it again.
      </AnimatedText>
    </Pressable>
  );
}
