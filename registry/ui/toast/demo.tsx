import React, { useRef } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Button } from '@/components/ui/button';
import { toast, Toaster, ToastProvider, useToast } from '@/components/ui/toast';
import { useKit } from '@/lib/kit';

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

/** Demo frame that follows the kit theme, so the docs radius / accent picker reshapes it too. In screen mode it is the screen. */
function Frame({ screen, style, ...rest }: ViewProps & { screen?: boolean }) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        { padding: 16 },
        screen
          ? { flex: 1, backgroundColor: colors.background }
          : {
              height: 300,
              overflow: 'hidden',
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.xl,
            },
        style,
      ]}
      {...rest}
    />
  );
}
const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const fail = (ms: number) => new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

export function Default({ screen }: DemoProps) {
  const to = { toaster: 'demo-default' };
  return (
    <Frame screen={screen}>
      <View style={row}>
        <Button
          size="sm"
          variant="accent"
          onPress={() => toast('Event created', { ...to, description: 'Friday, June 14 at 9:00 AM' })}
        >
          Default
        </Button>
        <Button
          size="sm"
          variant="outline"
          onPress={() => toast.success('Changes saved', { ...to, description: 'Synced to all your devices.' })}
        >
          Success
        </Button>
        <Button size="sm" variant="outline" onPress={() => toast.warning('Storage almost full', { ...to, description: '92% of 15 GB used.' })}>
          Warning
        </Button>
        <Button size="sm" variant="outline" onPress={() => toast.error('Could not reach server', to)}>
          Error
        </Button>
      </View>
      <Toaster id="demo-default" />
    </Frame>
  );
}

export function RichColors({ screen }: DemoProps) {
  const { colors } = useKit();
  const to = { toaster: 'demo-rich' };
  return (
    <Frame screen={screen}>
      <View style={row}>
        <Button
          size="sm"
          variant="soft"
          color={colors.success}
          onPress={() => toast.success('Payment received', { ...to, description: '₹18,500 from Acme Inc.' })}
        >
          Success
        </Button>
        <Button
          size="sm"
          variant="soft"
          color={colors.danger}
          onPress={() => toast.error('Card declined', { ...to, description: 'Try another payment method.' })}
        >
          Error
        </Button>
        <Button size="sm" variant="soft" color={colors.warning} onPress={() => toast.warning('You are offline', { ...to, description: 'Changes will sync when you reconnect.' })}>
          Warning
        </Button>
        <Button size="sm" variant="soft" onPress={() => toast.info('New version available', { ...to, description: 'Restart to update to 4.2.' })}>
          Info
        </Button>
      </View>
      <Toaster id="demo-rich" variant="rich" />
    </Frame>
  );
}

/** Dynamic Island: a black capsule at the top that springs open, morphs between toasts and folds away. */
export function Island({ screen }: DemoProps) {
  const to = { toaster: 'demo-island' };
  return (
    <Frame screen={screen} style={{ justifyContent: 'flex-end' }}>
      <View style={row}>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => toast.success('AirPods connected', { ...to, description: 'Battery 84% · Case 100%' })}
        >
          Success
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            toast.error('Payment failed', {
              ...to,
              description: 'Your card ending 4242 was declined by the bank. Update your billing details to keep Pro.',
              action: { label: 'Update', onPress: () => toast.info('Opening billing…', to) },
            })
          }
        >
          Error
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            toast.promise(wait(2200), { loading: 'Sending to Maya…', success: 'Photo sent', error: 'Could not send' }, to)
          }
        >
          Promise
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => toast('Maya Chen', { ...to, description: 'Running 5 min late, grab us a table?' })}
        >
          Message
        </Button>
      </View>
      <Toaster id="demo-island" variant="island" />
    </Frame>
  );
}

/** The spinner arc keeps turning while it closes into a circle, then the mark draws in. */
export function PromiseMorph({ screen }: DemoProps) {
  const to = { toaster: 'demo-promise' };
  return (
    <Frame screen={screen}>
      <View style={row}>
        <Button
          size="sm"
          variant="accent"
          onPress={() =>
            toast.promise(
              wait(1800),
              { loading: 'Uploading report.pdf…', success: 'Report uploaded', error: 'Upload failed' },
              { ...to, description: 'Q3 board pack · 4.2 MB' },
            )
          }
        >
          Upload (succeeds)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onPress={() =>
            toast
              .promise(
                fail(1800),
                { loading: 'Publishing release…', success: 'Release published', error: 'Publish failed: build timed out' },
                to,
              )
              .catch(() => {})
          }
        >
          Publish (fails)
        </Button>
      </View>
      <Toaster id="demo-promise" />
    </Frame>
  );
}

export function Minimal({ screen }: DemoProps) {
  const to = { toaster: 'demo-minimal' };
  return (
    <Frame screen={screen} style={{ justifyContent: 'flex-end' }}>
      <View style={row}>
        <Button size="sm" variant="secondary" onPress={() => toast('Copied to clipboard', to)}>
          Copy link
        </Button>
        <Button size="sm" variant="secondary" onPress={() => toast.success('Added to favourites', to)}>
          Favourite
        </Button>
        <Button size="sm" variant="secondary" onPress={() => toast.loading('Syncing…', { ...to, id: 'sync', duration: 1500 })}>
          Sync
        </Button>
      </View>
      <Toaster id="demo-minimal" variant="minimal" position="top" />
    </Frame>
  );
}

export function WithAction({ screen }: DemoProps) {
  const to = { toaster: 'demo-action' };
  return (
    <Frame screen={screen}>
      <Button
        variant="destructive"
        size="sm"
        style={{ alignSelf: 'flex-start' }}
        onPress={() =>
          toast('Conversation archived', {
            ...to,
            description: 'Moved 12 messages to Archive.',
            action: { label: 'Undo', onPress: () => toast.success('Conversation restored', to) },
          })
        }
      >
        Archive chat
      </Button>
      <Toaster id="demo-action" closeButton duration={6000} />
    </Frame>
  );
}

export function Expanded({ screen }: DemoProps) {
  const to = { toaster: 'demo-expanded' };
  const messages = [
    () => toast.info('Maya joined #design', to),
    () => toast.success('Build #1824 passed', { ...to, description: 'main · 3m 12s' }),
    () => toast('Invoice INV-0042 sent', to),
    () => toast.warning('Disk usage at 85%', to),
  ];
  const n = useRef(0);
  return (
    <Frame screen={screen} style={{ justifyContent: 'flex-end' }}>
      <Button size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => messages[n.current++ % messages.length]()}>
        Send notification
      </Button>
      <Toaster id="demo-expanded" position="top" expand visibleToasts={3} gap={8} />
    </Frame>
  );
}

/** Isolated stack via ToastProvider + useToast (no global `toast` / toaster id needed). */
export function WithProvider({ screen }: DemoProps) {
  return (
    <ToastProvider>
      <ProviderDemo screen={screen} />
    </ToastProvider>
  );
}

function ProviderDemo({ screen }: { screen?: boolean }) {
  const toast = useToast();
  return (
    <Frame screen={screen}>
      <View style={row}>
        <Button
          size="sm"
          variant="outline"
          onPress={() => toast.success('Draft saved', { description: 'Only this Toaster sees it.' })}
        >
          Save draft
        </Button>
        <Button size="sm" variant="outline" onPress={() => toast('Reminder set for 6:00 PM')}>
          Remind me
        </Button>
      </View>
      <Toaster />
    </Frame>
  );
}
