import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomNavIcon } from '@/components/ui/bottom-nav';
import { Tabs } from '@/components/ui/tabs';
import { alpha, useKit } from '@/lib/kit';

/** Control text stops at iOS's largest standard size. */
const FONT_CAP = 1.35;

function Panel({ title, body }: { title: string; body: string }) {
  const { colors } = useKit();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '400', color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: 14, fontWeight: '400', lineHeight: 20, color: colors.mutedForeground }}>{body}</Text>
    </View>
  );
}

type Post = [who: string, text: string, meta: string];

function Feed({ posts }: { posts: Post[] }) {
  const { colors, radius, dark } = useKit();
  return (
    <View style={{ gap: 14 }}>
      {posts.map(([who, text, meta]) => (
        <View key={text} style={{ flexDirection: 'row', gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.capsule(34),
              backgroundColor: alpha(colors.accent, dark ? 0.22 : 0.12),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 13, fontWeight: '400', color: colors.accent }}>{who.slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '400', color: colors.mutedForeground }}>
              <Text style={{ color: colors.foreground }}>{who}</Text> · {meta}
            </Text>
            <Text style={{ fontSize: 14.5, fontWeight: '400', lineHeight: 20, color: colors.foreground }}>{text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Grid() {
  const { colors, radius, dark } = useKit();
  const tones = [0.1, 0.18, 0.26, 0.14, 0.22, 0.3];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {tones.map((a, i) => (
        <View
          key={i}
          style={{ width: '32%', aspectRatio: 1, borderRadius: radius.scale(10), backgroundColor: alpha(colors.accent, dark ? a + 0.08 : a) }}
        />
      ))}
    </View>
  );
}

export function Underline() {
  return (
    <Tabs
      items={[
        { value: 'overview', label: 'Overview', content: <Panel title="Revenue up 12%" body="Annual plans drove most of the growth this week. Churn held at 1.8%." /> },
        { value: 'activity', label: 'Activity', badge: 3, content: <Panel title="3 new comments" body="Priya and Leo left notes on the Q4 roadmap since yesterday." /> },
        { value: 'settings', label: 'Settings', content: <Panel title="Project settings" body="Notifications, members and integrations for Mobile app 2.0." /> },
      ]}
    />
  );
}

export function Profile() {
  return (
    <Tabs
      items={[
        {
          value: 'posts',
          label: 'Posts',
          badge: 128,
          content: (
            <Feed
              posts={[
                ['Maya Chen', 'Shipped the new onboarding today. Three screens instead of seven, and it finally feels calm.', '2h'],
                ['Maya Chen', 'Hot take: every tab bar needs a haptic tick.', '1d'],
              ]}
            />
          ),
        },
        {
          value: 'replies',
          label: 'Replies',
          content: <Feed posts={[['Maya Chen', 'Agreed, the spring on that indicator is perfect. Ship it.', '5h']]} />,
        },
        { value: 'media', label: 'Media', badge: 24, content: <Grid /> },
        {
          value: 'likes',
          label: 'Likes',
          content: (
            <Feed
              posts={[
                ['Leo Park', 'Offsite is booked: June 12–14 in Lisbon. Bring sunscreen.', '3h'],
                ['Ana Ruiz', 'Pricing page v3 is live. Conversion up 0.6 points so far.', '1d'],
              ]}
            />
          ),
        },
      ]}
    />
  );
}

export function Scrollable() {
  const categories = ['For you', 'Trending', 'Design', 'Engineering', 'Product', 'Marketing', 'Finance', 'Remote'];
  return (
    <Tabs
      items={categories.map((c, i) => ({
        value: c,
        label: c,
        badge: i === 1 ? 'New' : undefined,
        content: <Panel title={c} body={`Hand-picked ${c.toLowerCase()} stories from people you follow, updated every hour.`} />,
      }))}
    />
  );
}

export function WithIcons() {
  const { colors } = useKit();
  const [unread, setUnread] = useState(4);
  const [mentions, setMentions] = useState(2);
  const clear = (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setUnread(0);
        setMentions(0);
      }}
      hitSlop={10}
      style={{ alignSelf: 'flex-start', marginTop: 12 }}
    >
      <Text style={{ fontSize: 14, fontWeight: '400', color: colors.accent }}>Mark all as read</Text>
    </Pressable>
  );
  return (
    <Tabs
      size="sm"
      items={[
        {
          value: 'inbox',
          label: 'Inbox',
          icon: ({ active, color }) => <BottomNavIcon name="inbox" color={color} size={17} active={active} />,
          badge: unread || undefined,
          content: (
            <View>
              <Feed posts={[['Priya Nair', 'Can you review the pricing page before 3pm?', '9:41']]} />
              {clear}
            </View>
          ),
        },
        {
          value: 'mentions',
          label: 'Mentions',
          icon: ({ active, color }) => <BottomNavIcon name="message" color={color} size={17} active={active} />,
          badge: mentions || undefined,
          content: <Feed posts={[['Leo Park', '@karan the offsite deck is ready for a look.', '9:12']]} />,
        },
        { value: 'activity', label: 'Activity', icon: ({ active, color }) => <BottomNavIcon name="activity" color={color} size={17} active={active} />, content: <Panel title="All quiet" body="Nothing new since you last checked." /> },
      ]}
    />
  );
}
