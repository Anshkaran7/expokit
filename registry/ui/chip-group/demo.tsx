import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ChipGroup } from '@/components/ui/chip-group';

export function Solid() {
  return (
    <ChipGroup
      multiple
      defaultValue={['Vegan', 'Gluten-free']}
      options={['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal']}
    />
  );
}

export function Outline() {
  return (
    <ChipGroup
      variant="outline"
      defaultValue={['Remote']}
      options={['Remote', 'Hybrid', 'On-site']}
    />
  );
}

export function Soft() {
  return (
    <ChipGroup
      variant="soft"
      multiple
      defaultValue={['open']}
      options={[
        { value: 'open', label: 'Open', count: 24 },
        { value: 'review', label: 'In review', count: 7 },
        { value: 'merged', label: 'Merged', count: 112 },
        { value: 'closed', label: 'Closed', count: 3 },
      ]}
    />
  );
}

export function Scrollable() {
  const [picked, setPicked] = useState<string[]>(['all']);
  return (
    <ChipGroup
      scrollable
      deselectable={false}
      value={picked}
      onValueChange={setPicked}
      options={[
        { value: 'all', label: 'All' },
        { value: 'coffee', label: 'Coffee', icon: <Text>☕️</Text> },
        { value: 'bakery', label: 'Bakery', icon: <Text>🥐</Text> },
        { value: 'brunch', label: 'Brunch', icon: <Text>🍳</Text> },
        { value: 'pizza', label: 'Pizza', icon: <Text>🍕</Text> },
        { value: 'sushi', label: 'Sushi', icon: <Text>🍣</Text> },
      ]}
    />
  );
}

export function Sizes() {
  return (
    <View style={{ gap: 12 }}>
      <ChipGroup size="sm" multiple defaultValue={['S']} options={['XS', 'S', 'M', 'L']} />
      <ChipGroup size="md" multiple defaultValue={['M']} options={['XS', 'S', 'M', 'L']} />
      <ChipGroup size="lg" multiple defaultValue={['L']} options={['XS', 'S', 'M', 'L']} />
    </View>
  );
}
