import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ProgressSteps } from '@/components/ui/progress-steps';
import { alpha, useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

function Buttons({ step, max, set, last = 'Place order' }: { step: number; max: number; set: (n: number) => void; last?: string }) {
  const { colors, radius } = useKit();
  const done = step >= max;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable
        onPress={() => set(Math.max(0, step - 1))}
        disabled={step === 0}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          borderRadius: radius.capsule(48),
          backgroundColor: alpha(colors.foreground, pressed ? 0.1 : 0.05),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: step === 0 ? 0.4 : 1,
        })}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 15, color: colors.foreground }}>Back</Text>
      </Pressable>
      <Pressable
        onPress={() => set(done ? 0 : step + 1)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flex: 1.5,
          minHeight: 48,
          borderRadius: radius.capsule(48),
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 15, color: colors.accentForeground }}>
          {done ? 'Start over' : step === max - 1 ? last : 'Continue'}
        </Text>
      </Pressable>
    </View>
  );
}

/** Checkout: tap a completed step to jump back. */
export function Checkout() {
  const { colors } = useKit();
  const [step, setStep] = useState(1);
  const copy = [
    '2 items · ₹2,798',
    'Delivering to 14 Rua das Flores, Lisbon',
    'Visa ending 4242',
    'Arrives Thursday, 16 October',
  ];
  return (
    <View style={{ gap: 22 }}>
      <ProgressSteps
        steps={['Cart', 'Shipping', 'Payment', 'Review']}
        current={step}
        pressableSteps="completed"
        onStepPress={setStep}
      />
      <Text style={{ fontSize: 14, textAlign: 'center', color: colors.mutedForeground }}>
        {step >= 4 ? 'Order #4821 placed — receipt sent to amelia@hart.studio' : copy[step]}
      </Text>
      <Buttons step={step} max={4} set={setStep} />
    </View>
  );
}

/** Account setup: vertical with descriptions. */
export function Onboarding() {
  const [step, setStep] = useState(2);
  return (
    <View style={{ gap: 20 }}>
      <ProgressSteps
        variant="vertical"
        current={step}
        pressableSteps="completed"
        onStepPress={setStep}
        steps={[
          { label: 'Create your account', description: 'Signed up with amelia@hart.studio' },
          { label: 'Verify your email', description: 'Confirmed with a 6-digit code.' },
          { label: 'Connect your bank', description: 'Read-only access. You can disconnect any time.' },
          { label: 'Set your first budget', description: 'Pick categories and a monthly limit.' },
        ]}
      />
      <Buttons step={step} max={4} set={setStep} last="Finish setup" />
    </View>
  );
}

/** Compact bar for tight headers. */
export function Compact() {
  const [step, setStep] = useState(1);
  return (
    <View style={{ gap: 20 }}>
      <ProgressSteps variant="bar" steps={['Shipping address', 'Delivery options', 'Payment', 'Review order']} current={step} />
      <Buttons step={step} max={4} set={setStep} />
    </View>
  );
}

/** Horizontal with short descriptions. */
export function WithDescriptions() {
  const [step, setStep] = useState(1);
  return (
    <View style={{ gap: 22 }}>
      <ProgressSteps
        current={step}
        steps={[
          { label: 'Profile', description: 'Name, photo' },
          { label: 'Workspace', description: 'Invite team' },
          { label: 'Plan', description: 'Free or Pro' },
        ]}
      />
      <Buttons step={step} max={3} set={setStep} last="Create workspace" />
    </View>
  );
}

export function WithError() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 14 }}>
      <ProgressSteps steps={['Upload', 'Verify', 'Approve', 'Publish']} current={1} errorStep={1} />
      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, textAlign: 'center' }}>
        ID photo was blurry — retake it to continue.
      </Text>
    </View>
  );
}
