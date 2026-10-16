import React, { useState } from 'react';
import { StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';

import { TagInput } from '@/components/ui/tag-input';
import { useKit } from '@/lib/kit';

/** Demo card that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Card({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        s.card,
        { borderRadius: radius.xl, borderColor: colors.border, backgroundColor: colors.card },
        style,
      ]}
      {...rest}
    />
  );
}

/** Text in the kit's ink: `tone="muted"` for secondary copy. */
function Ink({ tone, style, ...rest }: TextProps & { tone?: 'muted' }) {
  const { colors } = useKit();
  return <Text style={[{ color: tone === 'muted' ? colors.mutedForeground : colors.foreground }, style]} {...rest} />;
}

export function Skills() {
  return (
    <Card>
      <Ink style={s.title}>Your skills</Ink>
      <TagInput
        placeholder="Add a skill…"
        defaultValue={['TypeScript', 'React Native']}
        suggestions={['React', 'Swift', 'SwiftUI', 'Kotlin', 'GraphQL', 'Figma', 'Node.js', 'Rust', 'PostgreSQL']}
        helper="Type to search, or tap a suggestion."
      />
    </Card>
  );
}

export function InviteByEmail() {
  const [emails, setEmails] = useState(['maya@studio.co', 'leo@studio.co']);
  return (
    <Card>
      <Ink style={s.title}>Invite teammates</Ink>
      <TagInput
        value={emails}
        onChange={setEmails}
        validate={(tag) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(tag) || `“${tag}” isn't a valid email address`}
        transform={(tag) => tag.toLowerCase()}
        chipVariant="outline"
        keyboardType="email-address"
        placeholder="name@company.com"
        helper="Separate addresses with a comma or space."
        separators={[',', ' ']}
      />
    </Card>
  );
}

export function Topics() {
  return (
    <Card>
      <Ink style={s.title}>Follow topics</Ink>
      <TagInput
        colorize
        maxTags={5}
        defaultValue={['Design', 'Climate', 'Startups']}
        suggestions={['Space', 'AI', 'Music', 'Cooking', 'Photography', 'Travel']}
        placeholder="Add a topic…"
        helper="Pick up to five for your feed."
      />
    </Card>
  );
}

export function Hashtags() {
  return (
    <Card>
      <Ink style={s.title}>New post</Ink>
      <TagInput
        variant="filled"
        chipVariant="solid"
        prefix="#"
        transform={(tag) => tag.replace(/\s+/g, '').toLowerCase()}
        separators={[',', ' ']}
        defaultValue={['sunset', 'lisbon']}
        suggestions={['travel', 'goldenhour', 'streetphotography', 'portugal']}
        placeholder="#hashtag"
        helper="Backspace once to highlight the last tag, twice to remove it."
      />
    </Card>
  );
}

export function ChipStyles() {
  return (
    <Card>
      <Ink tone="muted" style={s.label}>Soft</Ink>
      <TagInput defaultValue={['Vegan', 'Gluten-free']} placeholder="Dietary needs" />
      <Ink tone="muted" style={s.label}>Solid</Ink>
      <TagInput chipVariant="solid" defaultValue={['Urgent', 'Bug']} placeholder="Labels" />
      <Ink tone="muted" style={s.label}>Outline</Ink>
      <TagInput chipVariant="outline" defaultValue={['Remote', 'Full-time']} placeholder="Job filters" />
      <Ink tone="muted" style={s.label}>Disabled</Ink>
      <TagInput editable={false} defaultValue={['Read-only']} />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: -6 },
});
