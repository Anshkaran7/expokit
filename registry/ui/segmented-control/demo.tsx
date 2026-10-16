import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { useKit } from '@/lib/kit';

export function Pill() {
  return <SegmentedControl options={['Day', 'Week', 'Month', 'Year']} defaultValue="Week" />;
}

export function Underline() {
  const [tab, setTab] = useState('overview');
  return (
    <SegmentedControl
      variant="underline"
      fullWidth={false}
      value={tab}
      onValueChange={setTab}
      options={[
        { value: 'overview', label: 'Overview' },
        { value: 'activity', label: 'Activity' },
        { value: 'reviews', label: 'Reviews (128)' },
      ]}
    />
  );
}

export function Outline() {
  return <SegmentedControl variant="outline" options={['Monthly', 'Yearly · save 20%']} defaultValue="Yearly · save 20%" />;
}

export function WithIcons() {
  const glyph = (g: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 15, color }}>{g}</Text>;
  return (
    <SegmentedControl
      defaultValue="grid"
      options={[
        { value: 'list', label: 'List', icon: glyph('☰') },
        { value: 'grid', label: 'Grid', icon: glyph('▦') },
        { value: 'map', label: 'Map', icon: glyph('◎') },
      ]}
    />
  );
}

export function Accent() {
  const { colors } = useKit();
  return (
    <SegmentedControl
      accent={colors.accent}
      options={[
        { value: 'buy', label: 'Buy' },
        { value: 'rent', label: 'Rent' },
        { value: 'sold', label: 'Sold' },
      ]}
    />
  );
}

export function Sizes() {
  return (
    <View style={{ gap: 12 }}>
      <SegmentedControl size="sm" options={['XS', 'S', 'M', 'L', 'XL']} defaultValue="M" />
      <SegmentedControl size="md" options={['Small', 'Medium', 'Large']} defaultValue="Medium" />
      <SegmentedControl size="lg" options={['Pickup', 'Delivery']} />
    </View>
  );
}
