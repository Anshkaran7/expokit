import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useKit } from '@/lib/kit';

export function Soft() {
  return (
    <View style={{ gap: 10 }}>
      <Alert variant="info" title="New sign-in method" description="You can now use a passkey instead of your password." />
      <Alert variant="success" title="Payment received" description="₹1,24,000 from Northwind Traders." />
      <Alert variant="warning" title="Storage almost full" description="You've used 9.4 GB of your 10 GB plan." />
      <Alert variant="danger" title="Sync failed" description="We couldn't reach the server. Your edits are saved on this device." />
    </View>
  );
}

export function Appearances() {
  return (
    <View style={{ gap: 10 }}>
      <Alert variant="info" appearance="outline" title="Scheduled maintenance" description="Sunday 02:00–03:00 UTC." />
      <Alert variant="danger" appearance="outline" title="2 failed sign-in attempts" description="Chrome on Windows · Berlin, DE" />
      <Alert variant="success" appearance="solid" title="Profile published" description="Anyone with the link can view it." />
      <Alert variant="warning" appearance="solid" title="Trial ends in 3 days" />
    </View>
  );
}

export function WithActions() {
  return (
    <View style={{ gap: 10 }}>
      <Alert
        variant="info"
        title="Update available"
        description="Version 3.2 is ready. Restart to finish installing."
        actions={{ primary: { label: 'Restart', onPress: () => {} }, secondary: { label: 'Later', onPress: () => {} } }}
      />
      <Alert
        variant="danger"
        title="Payment declined"
        description="Your Visa ending 4242 was declined. Pro features pause on May 12."
        actions={{ primary: { label: 'Update card', onPress: () => {} }, secondary: { label: 'Contact bank', onPress: () => {} } }}
        dismissible
      />
    </View>
  );
}

export function AutoDismiss() {
  const { colors } = useKit();
  const [visible, setVisible] = useState(true);
  return (
    <View style={{ gap: 12 }}>
      <Alert
        variant="success"
        title="Changes saved"
        description="Your team can see the new pricing page."
        duration={6000}
        dismissible
        visible={visible}
        onDismiss={() => setVisible(false)}
      />
      <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Closes in 6 s. Touch and hold to pause the timer.</Text>
      <Button size="sm" variant="outline" style={{ alignSelf: 'flex-start' }} disabled={visible} onPress={() => setVisible(true)}>
        Show again
      </Button>
    </View>
  );
}

export function Dismissible() {
  const { colors } = useKit();
  const [visible, setVisible] = useState(true);
  return (
    <View style={{ gap: 12 }}>
      <Alert
        variant="success"
        title="Backup complete"
        description="2,184 photos were saved to iCloud."
        dismissible
        visible={visible}
        onDismiss={() => setVisible(false)}
      />
      <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Content below glides up when the alert collapses.</Text>
      <Button size="sm" variant="outline" style={{ alignSelf: 'flex-start' }} disabled={visible} onPress={() => setVisible(true)}>
        Show again
      </Button>
    </View>
  );
}

export function Compact() {
  return (
    <View style={{ gap: 10 }}>
      <Alert variant="info" description="Prices include VAT where applicable." />
      <Alert variant="warning" description="You're offline." action={{ label: 'Retry', onPress: () => {} }} />
      <Alert variant="success" description="Link copied to clipboard." dismissible />
      <Alert variant="danger" appearance="outline" description="This action can't be undone." icon={false} />
    </View>
  );
}
