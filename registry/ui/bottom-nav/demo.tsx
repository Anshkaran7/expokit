import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomNav, type BottomNavItem } from '@/components/ui/bottom-nav';
import { alpha, useKit } from '@/lib/kit';

type Row = [title: string, subtitle: string, meta: string];

/** The bottom of a phone screen: a title, a few rows, the bar docked at the bottom. */
function Screen({ title, rows, children }: { title: string; rows: Row[]; children: React.ReactNode }) {
  const { colors, radius, dark } = useKit();
  return (
    <View
      style={{
        height: 300,
        alignSelf: 'stretch',
        borderRadius: radius.scale(28),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
        backgroundColor: colors.background,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ paddingHorizontal: 18, paddingTop: 18, gap: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: '400', letterSpacing: -0.5, color: colors.foreground }}>{title}</Text>
        {rows.map(([t, s, m]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.capsule(36),
                backgroundColor: alpha(colors.accent, dark ? 0.22 : 0.12),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '400', color: colors.accent }}>{t.slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '400', color: colors.foreground }}>{t}</Text>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '400', color: colors.mutedForeground }}>{s}</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '400', color: colors.mutedForeground }}>{m}</Text>
          </View>
        ))}
      </View>
      {children}
    </View>
  );
}

const ROWS: Record<string, Row[]> = {
  home: [
    ['Maya Chen', 'Shipped the onboarding redesign', '2m'],
    ['Leo Park', 'Booked the team offsite for June', '1h'],
  ],
  explore: [
    ['Design Systems Weekly', 'Motion tokens that scale', 'New'],
    ['Product Notes', 'How Linear plans a cycle', '4m read'],
  ],
  search: [
    ['Recent: invoices', 'Q2 invoices · 14 results', 'Today'],
    ['Recent: Maya', 'People · Design team', 'Mon'],
  ],
  projects: [
    ['Mobile app 2.0', '18 of 24 tasks done', '75%'],
    ['Brand refresh', 'Review on Thursday', '40%'],
  ],
  saved: [
    ['Kyoto travel guide', 'Saved from Atlas', 'Apr 2'],
    ['Sourdough basics', 'Saved from Recipes', 'Mar 28'],
  ],
  inbox: [
    ['Priya Nair', 'Can you review the pricing page?', '9:41'],
    ['GitHub', 'PR #482 was approved', '9:12'],
  ],
  analytics: [
    ['Weekly active users', '12,480 · up 8.2%', '7d'],
    ['Conversion', '3.4% · up 0.6 pts', '7d'],
  ],
  activity: [
    ['Leo Park', 'Commented on Launch plan', '5m'],
    ['Ana Ruiz', 'Moved Pricing to Done', '22m'],
  ],
  profile: [
    ['Karan Kumar', 'Product designer · Berlin', 'Edit'],
    ['Notifications', 'Mentions and replies only', 'On'],
  ],
  home2: [
    ['Late Night Drive', 'Playlist · 42 songs', '2h 31m'],
    ['Midnight City', 'M83 · Hurry Up, We\'re Dreaming', '4:03'],
  ],
  browse: [
    ['New this week', 'Fresh releases picked for you', '24'],
    ['Focus', 'Instrumental, low tempo', '60'],
  ],
  find: [
    ['Recent: Tycho', 'Artist · Ambient', 'Yesterday'],
    ['Recent: lo-fi beats', 'Playlist · 120 songs', 'Sun'],
  ],
  library: [
    ['Liked songs', '1,204 songs', 'Pinned'],
    ['Downloaded', '86 songs · 412 MB', 'Offline'],
  ],
};

const titleOf = (items: BottomNavItem[], key: string) => items.find((i) => i.key === key)?.label ?? '';

export function MinimalClean() {
  const items: BottomNavItem[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'explore', label: 'Explore', icon: 'explore' },
    { key: 'projects', label: 'Projects', icon: 'projects' },
    { key: 'saved', label: 'Saved', icon: 'saved' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  const [tab, setTab] = useState('home');
  return (
    <Screen title={titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="minimal" items={items} value={tab} onValueChange={setTab} />
    </Screen>
  );
}

export function Floating() {
  const [tab, setTab] = useState('home');
  const [unread, setUnread] = useState(3);
  const [drafts, setDrafts] = useState(0);
  const items: BottomNavItem[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'search', label: 'Search', icon: 'search' },
    { key: 'create', label: 'New note', icon: 'create', action: true },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', badge: unread || undefined },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  const open = (k: string) => {
    setTab(k);
    if (k === 'inbox') setUnread(0);
  };
  return (
    <Screen title={drafts ? `${drafts} new ${drafts === 1 ? 'draft' : 'drafts'}` : titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="floating" items={items} value={tab} onValueChange={open} onAction={() => setDrafts((n) => n + 1)} />
    </Screen>
  );
}

export function PillHighlight() {
  const items: BottomNavItem[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'projects', label: 'Projects', icon: 'projects' },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', badge: true },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  const [tab, setTab] = useState('home');
  return (
    <Screen title={titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="pill" items={items} value={tab} onValueChange={setTab} />
    </Screen>
  );
}

export function CenterFab() {
  const [tab, setTab] = useState('home');
  const [posts, setPosts] = useState(0);
  const items: BottomNavItem[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'explore', label: 'Explore', icon: 'explore' },
    { key: 'create', label: 'Post', icon: 'create', action: true },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', badge: 12 + posts },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  return (
    <Screen title={posts ? `Posted ${posts} ${posts === 1 ? 'time' : 'times'}` : titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="center-fab" items={items} value={tab} onValueChange={setTab} onAction={() => setPosts((n) => n + 1)} />
    </Screen>
  );
}

export function TabWithIndicator() {
  const items: BottomNavItem[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'analytics', label: 'Insights', icon: 'analytics' },
    { key: 'activity', label: 'Activity', icon: 'activity' },
    { key: 'inbox', label: 'Inbox', icon: 'inbox', badge: 5 },
    { key: 'profile', label: 'Profile', icon: 'profile' },
  ];
  const [tab, setTab] = useState('analytics');
  return (
    <Screen title={titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="indicator" items={items} value={tab} onValueChange={setTab} />
    </Screen>
  );
}

export function MusicIconsOnly() {
  const items: BottomNavItem[] = [
    { key: 'home2', label: 'Listen now', icon: 'music' },
    { key: 'browse', label: 'Browse', icon: 'browse' },
    { key: 'library', label: 'Library', icon: 'library' },
    { key: 'find', label: 'Search', icon: 'search' },
  ];
  const [tab, setTab] = useState('home2');
  return (
    <Screen title={titleOf(items, tab)} rows={ROWS[tab]}>
      <BottomNav variant="floating" showLabels={false} items={items} value={tab} onValueChange={setTab} />
    </Screen>
  );
}
