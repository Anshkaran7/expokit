import React from 'react';
import { View } from 'react-native';

import { Checkbox } from '@/components/ui/checkbox';

export function Default() {
  return <Checkbox label="Accept terms and conditions" defaultChecked />;
}

export function WithDescription() {
  return (
    <Checkbox
      label="Marketing emails"
      description="Product news and offers, about once a month."
    />
  );
}

export function TodoList() {
  return (
    <View style={{ gap: 16 }}>
      <Checkbox shape="circle" strike label="Design the onboarding flow" defaultChecked />
      <Checkbox shape="circle" strike label="Ship floating inputs" />
      <Checkbox shape="circle" strike label="Write the docs" />
    </View>
  );
}

export function Colors() {
  return (
    <View style={{ flexDirection: 'row', gap: 18 }}>
      {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
        <Checkbox key={c} accent={c} defaultChecked size={28} />
      ))}
    </View>
  );
}
