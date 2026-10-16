import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { alpha, useKit } from '@/lib/kit';

export function ProfileHeader() {
  const { colors, radius, dark } = useKit();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: 12,
        paddingVertical: 20,
        paddingHorizontal: 16,
        borderRadius: radius.xl,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
      }}
    >
      <Avatar
        size={88}
        src="https://i.pravatar.cc/240?img=47"
        name="Ava Rossi"
        ring="story"
        verified
        surface={colors.card}
        elevated
      />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 19, fontWeight: '400', letterSpacing: -0.3, color: colors.foreground }}>Ava Rossi</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Product designer · Milan</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
        {[
          ['248', 'Posts'],
          ['12.4k', 'Followers'],
          ['311', 'Following'],
        ].map(([n, l]) => (
          <View key={l} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: colors.foreground, fontVariant: ['tabular-nums'] }}>{n}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ChatList() {
  const { colors } = useKit();
  const chats = [
    { name: 'Noah Kim', src: 'https://i.pravatar.cc/150?img=59', status: 'online', msg: 'Pushed the fix — can you re-test?', time: '9:41', unread: 2 },
    { name: 'Priya Patel', status: 'away', msg: 'Sounds good, see you at 3.', time: '9:12', unread: 0 },
    { name: 'Diego Alvarez', src: 'https://i.pravatar.cc/150?img=12', status: 'busy', msg: 'In a call until noon', time: 'Mon', unread: 0 },
    { name: 'Hannah Lee', status: 'offline', msg: 'Thanks for the notes!', time: 'Sun', unread: 0 },
  ] as const;
  return (
    <View>
      {chats.map((c, i) => (
        <View
          key={c.name}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: alpha(colors.foreground, 0.06),
          }}
        >
          <Avatar size={48} name={c.name} src={'src' in c ? c.src : undefined} status={c.status} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, color: colors.foreground }}>{c.name}</Text>
              <Text style={{ fontSize: 12, color: c.unread ? colors.accent : colors.mutedForeground }}>{c.time}</Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 2 }}>
              {c.msg}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function Stories() {
  const { colors } = useKit();
  const [seen, setSeen] = useState<string[]>(['Theo']);
  const people = [
    { name: 'Kai Müller', short: 'Kai', img: 11 },
    { name: 'Mila Novak', short: 'Mila', img: 25 },
    { name: 'Theo Grant', short: 'Theo', img: 33 },
    { name: 'Nora Ali', short: 'Nora', img: 41 },
    { name: 'Sam Ortiz', short: 'Sam', img: 0 },
    { name: 'Lucía Romero', short: 'Lucía', img: 44 },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 8 }}>
      {people.map((p, i) => (
        <View key={p.short} style={{ alignItems: 'center', gap: 6 }}>
          <Avatar
            size="lg"
            src={p.img ? `https://i.pravatar.cc/150?img=${p.img}` : undefined}
            name={p.name}
            ring="story"
            seen={seen.includes(p.short)}
            ringSpin={i === 1 && !seen.includes(p.short)}
            onPress={() => setSeen((s) => (s.includes(p.short) ? s.filter((n) => n !== p.short) : [...s, p.short]))}
          />
          <Text style={{ fontSize: 12, color: seen.includes(p.short) ? colors.mutedForeground : colors.foreground }}>{p.short}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function Group() {
  const { colors, radius, dark } = useKit();
  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          padding: 14,
          gap: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 15, color: colors.foreground }}>Mobile launch</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Design · Engineering</Text>
          </View>
          <AvatarGroup max={4} total={9} surface={colors.card} size="sm" onPressMore={() => {}}>
            {[8, 16, 26, 36, 48].map((n, i) => (
              <Avatar key={n} src={`https://i.pravatar.cc/150?img=${n}`} name={['Maya Chen', 'Leo Park', 'Ava Rossi', 'Noah Kim', 'Zoe Martin'][i]} />
            ))}
          </AvatarGroup>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AvatarGroup size="sm" max={3} total={1284}>
          <Avatar name="Ana Silva" />
          <Avatar name="Ben Carter" />
          <Avatar name="Chloe Dubois" />
        </AvatarGroup>
        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>1,284 members</Text>
      </View>
      <AvatarGroup size="lg" shape="rounded" max={5}>
        {['Priya Patel', 'Omar Haddad', 'Sven Larsen', 'Iris Okafor'].map((n) => (
          <Avatar key={n} name={n} />
        ))}
      </AvatarGroup>
    </View>
  );
}

export function Fallbacks() {
  const names = ['Priya Patel', 'Diego Alvarez', 'Hannah Lee', 'Omar Haddad', 'Sven Larsen'];
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {names.map((n) => (
          <Avatar key={n} name={n} size="lg" />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {names.map((n) => (
          <Avatar key={n} name={n} size="lg" fallback="solid" />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {names.slice(0, 3).map((n) => (
          <Avatar key={n} name={n} size="lg" shape="rounded" fallback="gradient" />
        ))}
        <Avatar size="lg" shape="rounded" src="https://example.invalid/broken.jpg" name="Kenji Watanabe" />
        <Avatar size="lg" />
      </View>
    </View>
  );
}

export function Sizes() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <Avatar size="xs" src="https://i.pravatar.cc/150?img=32" name="Maya Chen" />
      <Avatar size="sm" src="https://i.pravatar.cc/150?img=12" name="Leo Park" status="online" />
      <Avatar size="md" name="Ava Rossi" status="away" />
      <Avatar size="lg" src="https://i.pravatar.cc/150?img=59" name="Noah Kim" verified />
      <Avatar size="xl" src="https://i.pravatar.cc/150?img=5" name="Zoe Martin" status="online" />
    </View>
  );
}

export function Status() {
  const { colors } = useKit();
  const rows = [
    { name: 'Ethan Brooks', img: 15, status: 'online' },
    { name: 'Lina Novak', img: 44, status: 'away' },
    { name: 'Marcus Hill', img: 68, status: 'busy' },
    { name: 'Iris Okafor', img: 0, status: 'offline' },
  ] as const;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {rows.map((r) => (
        <View key={r.name} style={{ alignItems: 'center', gap: 6 }}>
          <Avatar size="lg" src={r.img ? `https://i.pravatar.cc/150?img=${r.img}` : undefined} name={r.name} status={r.status} />
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{r.status[0].toUpperCase() + r.status.slice(1)}</Text>
        </View>
      ))}
    </View>
  );
}

export function Badges() {
  const { colors } = useKit();
  const [count, setCount] = useState(3);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Add a notification" onPress={() => setCount((c) => c + 1)} style={{ alignItems: 'center', gap: 6 }}>
        <Avatar size="lg" src="https://i.pravatar.cc/150?img=22" name="Maya Chen" badge={count} />
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Tap +1</Text>
      </Pressable>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar size="lg" src="https://i.pravatar.cc/150?img=9" name="Leo Park" badge={128} status="online" />
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Mentions</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar size="lg" name="Design Team" shape="rounded" badge verified />
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Workspace</Text>
      </View>
    </View>
  );
}
