import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useKit } from '@/lib/kit';

function useMuted() {
  const { colors } = useKit();
  return { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' as const };
}

export function Basic() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="accent" onPress={() => setOpen(true)}>
        Enable notifications
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        tone="info"
        title="Turn on notifications?"
        description="Get a heads-up when someone mentions you, replies to your post or shares a file."
        cancelLabel="Not now"
        confirmLabel="Allow"
      />
    </View>
  );
}

export function Destructive() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Button variant="destructive" onPress={() => setOpen(true)}>
        Delete project
      </Button>
      {status ? <Text style={muted}>{status}</Text> : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        variant="destructive"
        title="Delete “Mobile redesign”?"
        description="This permanently removes the project, its 48 files and all comments. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              setStatus('“Mobile redesign” was deleted');
              resolve();
            }, 1200),
          )
        }
      />
    </View>
  );
}

export function WithForm() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Q3 roadmap');
  const [error, setError] = useState('');
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Rename board
      </Button>
      <Text style={muted}>Board: {name}</Text>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setError('');
        }}
        title="Rename board"
        description="Everyone with access will see the new name."
        prompt={{ defaultValue: name, placeholder: 'Board name', maxLength: 40, onChangeText: () => setError('') }}
        error={error}
        confirmLabel="Save"
        onConfirm={(value) => {
          const next = value.trim();
          if (!next) {
            setError('Give the board a name.');
            return false;
          }
          setName(next);
        }}
      />
    </View>
  );
}

export function PaymentSent() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="accent" onPress={() => setOpen(true)}>
        Send ₹1,850
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        tone="success"
        title="Payment sent"
        description="₹1,850 is on its way to Lena Fischer for “Dinner at Tasca”. She'll get it in a few seconds."
        cancelLabel={null}
        confirmLabel="Done"
      />
    </View>
  );
}

export function SignOut() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('iOS-style hairline buttons');
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Button variant="outline" onPress={() => setOpen(true)}>
        Sign out
      </Button>
      <Text style={muted}>{status}</Text>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        appearance="ios"
        title="Sign out of Northwind?"
        description="Offline drafts on this device will be removed."
        actions={[
          { label: 'Cancel', role: 'cancel' },
          { label: 'Sign out', role: 'destructive', onPress: () => setStatus('Signed out') },
        ]}
      />
    </View>
  );
}

export function ThreeActions() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="outline" onPress={() => setOpen(true)}>
        Close document
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        appearance="ios"
        title="Save changes to “Pitch deck”?"
        description="Your edits will be lost if you don't save them."
        actions={[
          { label: 'Save', role: 'primary' },
          { label: "Don't save", role: 'destructive' },
          { label: 'Cancel', role: 'cancel' },
        ]}
      />
    </View>
  );
}

export function ActionSheetDemo() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Button variant="outline" onPress={() => setOpen(true)}>
        Change profile photo
      </Button>
      <Text style={muted}>Bottom choices live in Action Sheet — not Dialog.</Text>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title="Profile photo"
        message="Your photo is visible to everyone in your workspace."
        actions={[
          { label: 'Take photo' },
          { label: 'Choose from library' },
          { label: 'Remove photo', destructive: true },
        ]}
      />
    </View>
  );
}
