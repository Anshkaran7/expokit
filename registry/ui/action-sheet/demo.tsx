import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { readableOn, useKit } from '@/lib/kit';

function useMuted() {
  const { colors } = useKit();
  return { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' as const };
}

export function Photo() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('Tap the photo to change it');
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Avatar name="Maya Patel" size="xl" ring="accent" onPress={() => setOpen(true)} />
      <Text style={muted}>{status}</Text>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title="Profile photo"
        message="Your photo is visible to everyone in Northwind."
        actions={[
          { label: 'Take photo', onPress: () => setStatus('Opening camera…') },
          { label: 'Choose from library', onPress: () => setStatus('Opening library…') },
          { label: 'Remove photo', destructive: true, onPress: () => setStatus('Photo removed') },
        ]}
      />
    </View>
  );
}

export function MessageActions() {
  const { colors, radius } = useKit();
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState('Long-press the message');
  return (
    <View style={{ alignSelf: 'stretch', gap: 12, paddingHorizontal: 16 }}>
      <Pressable
        onLongPress={() => setOpen(true)}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityHint="Long-press for message actions"
        style={({ pressed }) => ({
          alignSelf: 'flex-end',
          maxWidth: '82%',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.scale(20),
          borderBottomRightRadius: radius.scale(6),
          backgroundColor: colors.accent,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <Text style={{ color: readableOn(colors.accent), fontSize: 15, lineHeight: 20 }}>
          Running 10 min late — grab us a table by the window?
        </Text>
      </Pressable>
      <Text style={muted}>{status}</Text>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        actions={[
          { label: 'Reply', icon: 'reply', onPress: () => setStatus('Replying to Maya') },
          { label: 'Forward', icon: 'forward', onPress: () => setStatus('Choose a chat') },
          { label: 'Copy text', icon: 'copy', onPress: () => setStatus('Copied to clipboard') },
          {
            label: pinned ? 'Unpin' : 'Pin',
            icon: 'pin',
            onPress: () => {
              setPinned((p) => !p);
              setStatus(pinned ? 'Unpinned' : 'Pinned to the top of the chat');
            },
          },
          { label: 'Edit', icon: 'edit', disabled: true },
          { label: 'Delete for everyone', icon: 'trash', destructive: true, onPress: () => setStatus('Message deleted') },
        ]}
      />
    </View>
  );
}

export function Share() {
  const { colors } = useKit();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="accent" onPress={() => setOpen(true)}>
        Share trip
      </Button>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        variant="grid"
        title="Share “Lisbon, May 12–16”"
        actions={[
          { label: 'Messages', icon: 'message', color: colors.success },
          { label: 'Mail', icon: 'mail', color: colors.accent },
          { label: 'Send to…', icon: 'send', color: colors.primary },
          { label: 'Copy link', icon: 'link' },
          { label: 'Save PDF', icon: 'download' },
          { label: 'Print', icon: 'printer' },
          { label: 'Invite', icon: 'user' },
          { label: 'More', icon: 'more' },
        ]}
      />
    </View>
  );
}

export function PostOptions() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Button variant="outline" onPress={() => setOpen(true)}>
        Post options
      </Button>
      <Text style={muted}>{saved ? 'Saved to your collection' : 'Material list with icons'}</Text>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        variant="list"
        title="Jonas’s post"
        cancelLabel={null}
        actions={[
          { label: 'Edit post', icon: 'edit' },
          { label: saved ? 'Remove from saved' : 'Save post', icon: 'bookmark', onPress: () => setSaved((s) => !s) },
          { label: 'Copy link', icon: 'copy' },
          { label: 'Hide from feed', icon: 'eye-off' },
          { label: 'Report post', icon: 'flag', destructive: true },
        ]}
      />
    </View>
  );
}

export function DiscardDraft() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Close editor
      </Button>
      {result ? <Text style={muted}>{result}</Text> : null}
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        message="You have unsaved changes to “Weekly update”. Save them as a draft?"
        onCancel={() => setResult('Kept editing')}
        cancelLabel="Keep editing"
        actions={[
          { label: 'Discard changes', destructive: true, onPress: () => setResult('Changes discarded') },
          { label: 'Save draft', onPress: () => setResult('Draft saved') },
          { label: 'Schedule post', disabled: true },
        ]}
      />
    </View>
  );
}
