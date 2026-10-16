import React, { useState } from 'react';
import { Text } from 'react-native';

import { RadioGroup } from '@/components/ui/radio-group';

export function Default() {
  return (
    <RadioGroup
      defaultValue="standard"
      options={[
        { value: 'standard', label: 'Standard shipping', description: '4–6 business days · Free' },
        { value: 'express', label: 'Express', description: '1–2 business days · ₹99' },
        { value: 'pickup', label: 'Pick up in store', description: 'Ready in 2 hours' },
      ]}
    />
  );
}

export function Horizontal() {
  const [size, setSize] = useState('m');
  return (
    <RadioGroup
      direction="horizontal"
      value={size}
      onValueChange={setSize}
      accessibilityLabel="Cup size"
      options={[
        { value: 's', label: 'Small' },
        { value: 'm', label: 'Medium' },
        { value: 'l', label: 'Large' },
      ]}
    />
  );
}

export function Cards() {
  return (
    <RadioGroup
      variant="card"
      defaultValue="pro"
      options={[
        { value: 'starter', label: 'Starter', description: 'For side projects', hint: '₹0' },
        { value: 'pro', label: 'Pro', description: 'Unlimited projects, priority support', hint: '₹499/mo' },
        { value: 'team', label: 'Team', description: 'Shared workspaces and SSO', hint: '₹1,499/mo' },
      ]}
    />
  );
}

export function CardsHorizontal() {
  return (
    <RadioGroup
      variant="card"
      direction="horizontal"
      defaultValue="card"
      options={[
        { value: 'card', label: 'Card', description: 'Visa ·· 4242', icon: <Text style={{ fontSize: 20 }}>💳</Text> },
        { value: 'wallet', label: 'Wallet', description: 'Apple Pay', icon: <Text style={{ fontSize: 20 }}>📱</Text> },
      ]}
    />
  );
}

export function GroupedList() {
  return (
    <RadioGroup
      variant="segmented-list"
      defaultValue="system"
      accessibilityLabel="Appearance"
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'Automatic', description: 'Follows your device settings' },
      ]}
    />
  );
}
