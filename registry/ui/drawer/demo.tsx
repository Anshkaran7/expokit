import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerFooter,
  DrawerHeader,
  DrawerIcon,
  DrawerItem,
  DrawerProfile,
  DrawerSection,
  useDrawer,
  type DrawerIconName,
} from '@/components/ui/drawer';
import { alpha, useKit } from '@/lib/kit';

/* Shared phone chrome --------------------------------------------------------------------------- */

const STATUS_H = 40;

/** Phone-sized frame that follows the kit theme, so the docs radius / accent picker reshapes it too. */
function Frame({ style, ...rest }: ViewProps) {
  const { colors, radius } = useKit();
  return (
    <View
      style={[
        {
          height: 600,
          borderRadius: radius.scale(28),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.background,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** Fake status bar: time, signal and battery, drawn with Views. */
function StatusBar() {
  const { colors, radius } = useKit();
  const ink = colors.foreground;
  return (
    <View style={{ height: STATUS_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 15, color: ink, fontVariant: ['tabular-nums'] }}>9:41</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {[4, 6, 8, 10].map((h) => (
            <View key={h} style={{ width: 3, height: h, borderRadius: radius.capsule(3), backgroundColor: ink }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <View style={{ width: 22, height: 11, padding: 1.5, borderRadius: radius.scale(3.5), borderWidth: 1, borderColor: alpha(ink, 0.4) }}>
            <View style={{ width: '72%', flex: 1, borderRadius: radius.scale(2), backgroundColor: ink }} />
          </View>
          <View style={{ width: 1.5, height: 4, borderRadius: 1, backgroundColor: alpha(ink, 0.4) }} />
        </View>
      </View>
    </View>
  );
}

/** The app screen behind the drawer: status bar plus your content. */
function Phone({ children }: { children: React.ReactNode }) {
  const { colors } = useKit();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar />
      {children}
    </View>
  );
}

function IconButton({ icon, label, onPress, color }: { icon: DrawerIconName; label: string; onPress?: () => void; color?: string }) {
  const { colors, radius } = useKit();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.capsule(44),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.muted : 'transparent',
      })}
    >
      <DrawerIcon name={icon} size={22} color={color ?? colors.foreground} />
    </Pressable>
  );
}

/** The hamburger: toggles the surrounding Drawer through useDrawer(). */
function MenuButton() {
  const { open, setOpen } = useDrawer();
  return <IconButton icon="menu" label="Open navigation" onPress={() => setOpen(!open)} />;
}

/** A plain inline top bar: hamburger, title (+ subtitle) and trailing actions. */
function TopBar({ title, subtitle, right, menu = true }: { title: string; subtitle?: string; right?: React.ReactNode; menu?: boolean }) {
  const { colors } = useKit();
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: menu ? 6 : 16, paddingRight: 8, gap: 4 }}>
      {menu ? <MenuButton /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: subtitle ? 19 : 22, letterSpacing: -0.4, color: colors.foreground }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.mutedForeground }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function Initials({ name, size = 32, square, ring }: { name: string; size?: number; square?: boolean; ring?: string }) {
  const { colors, radius } = useKit();
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? radius.scale(size * 0.28) : radius.capsule(size),
        backgroundColor: square ? colors.foreground : alpha(colors.accent, 0.14),
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, color: square ? colors.background : colors.accent }}>{letters}</Text>
    </View>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  const { radius } = useKit();
  return <View style={{ width: size, height: size, borderRadius: radius.capsule(size), backgroundColor: color }} />;
}

/* Mail ------------------------------------------------------------------------------------------ */

const MAIL = [
  { from: 'Lena Fischer', subject: 'Offsite agenda — final draft', snippet: 'Attached the plan for Thursday. Shout if the 10:00 slot clashes.', time: '9:41', unread: true },
  { from: 'GitHub', service: true, subject: '[northwind/app] PR #482 merged', snippet: 'feat: offline drafts for the editor (#482) was merged into main.', time: '9:12', unread: true },
  { from: 'Omar Haddad', subject: 'Re: Invoice 2041', snippet: 'Paid this morning — the receipt is in the thread below.', time: '8:03', unread: true },
  { from: 'Figma', service: true, subject: 'Priya commented on Checkout v3', snippet: '“Can we try the sheet at 90% height here?”', time: 'Tue' },
  { from: 'Stripe', service: true, subject: 'Your October payout is on its way', snippet: '₹2,48,000 will arrive in your account in 2 business days.', time: 'Mon' },
  { from: 'Jonas Weber', subject: 'Photos from Lisbon', snippet: 'Finally sorted them — 48 shots, the tram ones came out great.', time: 'Sun' },
  { from: 'Ana Costa', subject: 'Lunch next week?', snippet: 'There is a new ramen place near the office, Wednesday works.', time: 'Sat' },
];

function MailRow({ from, service, subject, snippet, time, unread }: (typeof MAIL)[number]) {
  const { colors } = useKit();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${from}, ${subject}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 11, paddingLeft: 16, paddingRight: 14, backgroundColor: pressed ? colors.muted : 'transparent' })}
    >
      <Initials name={from} size={40} square={service} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: unread ? colors.foreground : colors.mutedForeground }}>
            {from}
          </Text>
          <Text style={{ fontSize: 12.5, color: unread ? colors.accent : colors.mutedForeground }}>{time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.foreground, opacity: unread ? 1 : 0.8 }}>
            {subject}
          </Text>
          {unread ? <Dot color={colors.accent} size={8} /> : null}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13.5, color: colors.mutedForeground }}>
          {snippet}
        </Text>
      </View>
    </Pressable>
  );
}

/** Mail app with the push look: the inbox shrinks into a card and slides aside. */
export function AppNavigation() {
  const { colors, radius, dark } = useKit();
  const [page, setPage] = useState('Inbox');
  const nav: [DrawerIconName, string, number?][] = [
    ['inbox', 'Inbox', 12],
    ['star', 'Starred'],
    ['send', 'Sent'],
    ['file', 'Drafts', 2],
    ['archive', 'Archive'],
    ['trash', 'Trash'],
  ];
  const labels: [string, string, number?][] = [
    ['Design reviews', colors.accent, 4],
    ['Receipts', colors.success],
    ['Travel', colors.warning, 1],
  ];
  return (
    <Frame>
      <Drawer
        variant="push"
        width="78%"
        topInset={STATUS_H}
        header={<DrawerProfile name="Maya Patel" email="maya@northwind.app" status="online" onPress={() => {}} />}
        content={
          <>
            {nav.map(([icon, label, badge]) => (
              <DrawerItem key={label} icon={icon} label={label} badge={badge} active={page === label} onPress={() => setPage(label)} />
            ))}
            <DrawerSection title="Labels" trailing={<IconButton icon="plus" label="New label" color={colors.mutedForeground} />} />
            {labels.map(([label, color, badge]) => (
              <DrawerItem key={label} icon={<Dot color={color} />} label={label} badge={badge} active={page === label} onPress={() => setPage(label)} />
            ))}
          </>
        }
        footer={<DrawerFooter icon="cloud" label="Storage" detail="12.4 GB of 15 GB used" progress={0.83} />}
      >
        <Phone>
          <TopBar
            title={page}
            subtitle={page === 'Inbox' ? '3 unread · maya@northwind.app' : undefined}
            right={
              <>
                <IconButton icon="search" label="Search mail" />
                <View style={{ paddingRight: 6 }}>
                  <Initials name="Maya Patel" size={32} />
                </View>
              </>
            }
          />
          <Text style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2, fontSize: 13, color: colors.mutedForeground }}>Today</Text>
          {MAIL.map((m) => (
            <MailRow key={m.subject} {...m} />
          ))}
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: 18,
              height: 52,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: radius.scale(18),
              backgroundColor: colors.accent,
              shadowColor: dark ? colors.background : colors.foreground,
              shadowOpacity: 0.18,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <DrawerIcon name="plus" size={20} color={colors.accentForeground} strokeWidth={2} />
            <Text style={{ fontSize: 15, color: colors.accentForeground }}>Compose</Text>
          </View>
        </Phone>
      </Drawer>
    </Frame>
  );
}

/* Workspace ------------------------------------------------------------------------------------- */

const WORKSPACES = [
  { name: 'Northwind', detail: 'northwind.app · 24 members' },
  { name: 'Side Quests', detail: 'Personal · 1 member' },
  { name: 'Acme Studio', detail: 'acme.studio · 8 members' },
];

type TaskState = 'In progress' | 'In review' | 'Todo';

const TASKS: { id: string; title: string; state: TaskState; due: string; done: number; total: number; people: string[] }[] = [
  { id: 'MOB-212', title: 'Sheet snap points jitter on Android 14', state: 'In progress', due: 'Today', done: 3, total: 5, people: ['Maya Patel', 'Omar Haddad'] },
  { id: 'MOB-208', title: 'Offline drafts for the editor', state: 'In review', due: 'Thu', done: 6, total: 6, people: ['Lena Fischer'] },
  { id: 'MOB-199', title: 'Rewrite the push permission prompt', state: 'Todo', due: 'Mon', done: 0, total: 3, people: ['Priya Nair', 'Maya Patel'] },
  { id: 'MOB-187', title: 'Haptics on tab change', state: 'Todo', due: 'Oct 28', done: 1, total: 2, people: ['Jonas Weber'] },
];

function StatePill({ state }: { state: TaskState }) {
  const { colors, radius } = useKit();
  const tone = state === 'In progress' ? colors.accent : state === 'In review' ? colors.warning : colors.mutedForeground;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 9, borderRadius: radius.capsule(24), backgroundColor: alpha(tone, 0.13) }}>
      <Dot color={tone} size={7} />
      <Text style={{ fontSize: 12, color: colors.foreground }}>{state}</Text>
    </View>
  );
}

function TaskCard({ id, title, state, due, done, total, people }: (typeof TASKS)[number]) {
  const { colors, radius, dark } = useKit();
  return (
    <View
      style={{
        padding: 14,
        gap: 10,
        borderRadius: radius.scale(16),
        backgroundColor: colors.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        shadowColor: dark ? colors.background : colors.foreground,
        shadowOpacity: dark ? 0.4 : 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatePill state={state} />
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>{id}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 15.5, letterSpacing: -0.2, color: colors.foreground }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <DrawerIcon name="calendar" size={14} color={due === 'Today' ? colors.danger : colors.mutedForeground} />
          <Text style={{ fontSize: 12.5, color: due === 'Today' ? colors.danger : colors.mutedForeground }}>{due}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <DrawerIcon name="check" size={14} color={colors.mutedForeground} />
          <Text style={{ fontSize: 12.5, color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>
            {done}/{total}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row' }}>
          {people.map((p, i) => (
            <View key={p} style={{ marginLeft: i ? -8 : 0 }}>
              <Initials name={p} size={26} ring={colors.card} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Project tracker with an overlay drawer whose header switches workspace in place. */
export function WorkspaceSwitcher() {
  const { colors, radius } = useKit();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]);
  const [picking, setPicking] = useState(false);
  const [page, setPage] = useState('My issues');
  const [filter, setFilter] = useState('Active');
  return (
    <Frame>
      <Drawer
        topInset={STATUS_H}
        header={<DrawerProfile name={workspace.name} email={workspace.detail} onPress={() => setPicking((v) => !v)} accessibilityHint="Switch workspace" />}
        content={
          picking ? (
            <>
              <DrawerSection title="Workspaces" divider={false} />
              {WORKSPACES.map((w) => (
                <DrawerItem
                  key={w.name}
                  label={w.name}
                  icon={w.name === workspace.name ? 'check' : 'layers'}
                  active={w.name === workspace.name}
                  closeOnPress={false}
                  onPress={() => {
                    setWorkspace(w);
                    setPicking(false);
                  }}
                />
              ))}
              <DrawerItem icon="plus" label="Create workspace" closeOnPress={false} />
            </>
          ) : (
            <>
              {(
                [
                  ['inbox', 'Inbox', 5, 'accent'],
                  ['target', 'My issues', 14],
                  ['search', 'Search'],
                ] as [DrawerIconName, string, number?, 'accent'?][]
              ).map(([icon, label, badge, badgeTone]) => (
                <DrawerItem key={label} icon={icon} label={label} badge={badge} badgeTone={badgeTone} active={page === label} onPress={() => setPage(label)} />
              ))}
              <DrawerSection title="Teams" trailing={<IconButton icon="plus" label="New team" color={colors.mutedForeground} />} />
              {(
                [
                  ['layers', 'Mobile', 8],
                  ['layers', 'Platform', 3],
                  ['users', 'Design'],
                ] as [DrawerIconName, string, number?][]
              ).map(([icon, label, badge]) => (
                <DrawerItem key={label} icon={icon} label={label} badge={badge} active={page === label} onPress={() => setPage(label)} />
              ))}
            </>
          )
        }
        footer={
          <>
            <DrawerItem icon="settings" label="Settings" active={page === 'Settings'} onPress={() => setPage('Settings')} />
            <DrawerItem icon="logout" label="Log out" tone="danger" />
          </>
        }
      >
        <Phone>
          <TopBar title={page} subtitle={`${workspace.name} · Mobile team`} right={<IconButton icon="plus" label="New issue" />} />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 }}>
            {[
              ['Active', '4'],
              ['Backlog', '9'],
              ['Done', '23'],
            ].map(([label, n]) => {
              const on = filter === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => setFilter(label)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    height: 32,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: radius.capsule(32),
                    backgroundColor: on ? alpha(colors.accent, 0.13) : 'transparent',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: on ? alpha(colors.accent, 0.3) : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13.5, color: on ? colors.accent : colors.foreground }}>{label}</Text>
                  <Text style={{ fontSize: 12.5, color: on ? colors.accent : colors.mutedForeground }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {TASKS.map((t) => (
              <TaskCard key={t.id} {...t} />
            ))}
          </View>
        </Phone>
      </Drawer>
    </Frame>
  );
}

/* Stays (right panel) --------------------------------------------------------------------------- */

/** Right-side filter panel, opened from a button. */
export function RightPanel() {
  const { colors, radius } = useKit();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('Any price');
  const [tags, setTags] = useState<string[]>(['Free cancellation']);
  const toggle = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const count = 48 - tags.length * 9 - (price === 'Any price' ? 0 : 11);
  const active = tags.length + (price !== 'Any price' ? 1 : 0);
  return (
    <Frame>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="right"
        width="86%"
        topInset={STATUS_H}
        accessibilityLabel="Filters"
        header={<DrawerHeader title="Filters" subtitle="Porto · Jun 3 – 7 · 2 guests" showClose onClose={() => setOpen(false)} />}
        content={
          <>
            <DrawerSection title="Price per night" divider={false} />
            {['Any price', 'Under ₹5,000', '₹5,000 – ₹10,000', '₹10,000+'].map((p) => (
              <DrawerItem key={p} label={p} icon={price === p ? 'check' : <View />} active={price === p} closeOnPress={false} onPress={() => setPrice(p)} />
            ))}
            <DrawerSection title="Amenities" />
            {['Free cancellation', 'Breakfast included', 'Pet friendly', 'Workspace'].map((t) => (
              <DrawerItem key={t} label={t} icon={tags.includes(t) ? 'check' : <View />} active={tags.includes(t)} closeOnPress={false} onPress={() => toggle(t)} />
            ))}
          </>
        }
        footer={
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => {
                setPrice('Any price');
                setTags([]);
              }}
            >
              Reset
            </Button>
            <Button variant="accent" style={{ flex: 1.4 }} onPress={() => setOpen(false)}>
              {`Show ${count} stays`}
            </Button>
          </View>
        }
      >
        <Phone>
          <TopBar
            menu={false}
            title="Stays in Porto"
            subtitle={`${count} places · Jun 3 – 7`}
            right={
              <Button size="sm" variant="secondary" pill left={<DrawerIcon name="filter" size={16} />} onPress={() => setOpen(true)}>
                {active ? `Filters · ${active}` : 'Filters'}
              </Button>
            }
          />
          <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 16 }}>
            {[
              { name: 'Casa da Ribeira', meta: 'River view · 1 bedroom', price: '₹6,800', rating: '4.92', art: 'sunset' as const },
              { name: 'Azulejo Loft', meta: 'Breakfast included', price: '₹4,800', rating: '4.81', art: 'grid' as const },
              { name: 'Miradouro Suites', meta: 'Free cancellation', price: '₹12,500', rating: '4.97', art: 'rings' as const },
            ].map((s) => (
              <View key={s.name} style={{ gap: 8 }}>
                <Art kind={s.art} size={0} height={112} radiusSize={radius.scale(18)} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.foreground }}>{s.name}</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{s.meta}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <DrawerIcon name="star" size={13} color={colors.foreground} />
                      <Text style={{ fontSize: 13, color: colors.foreground }}>{s.rating}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      <Text style={{ color: colors.foreground }}>{s.price}</Text> night
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Phone>
      </Drawer>
    </Frame>
  );
}

/* Music ----------------------------------------------------------------------------------------- */

type ArtKind = 'sunset' | 'grid' | 'rings' | 'stripes' | 'split';

/**
 * Album art drawn with plain Views in theme colours. `size` 0 stretches to the parent width
 * (then pass `height`).
 */
function Art({ kind, size, height, radiusSize }: { kind: ArtKind; size: number; height?: number; radiusSize?: number }) {
  const { colors, radius } = useKit();
  const h = height ?? size;
  const w = size || undefined;
  const d = Math.min(size || h, h);
  const box = {
    width: w,
    alignSelf: size ? undefined : ('stretch' as const),
    height: h,
    borderRadius: radiusSize ?? radius.scale(size > 60 ? 14 : 8),
    overflow: 'hidden' as const,
  };
  const on = colors.accentForeground;
  if (kind === 'sunset') {
    return (
      <View style={[box, { backgroundColor: colors.accent, alignItems: 'center' }]}>
        <View style={{ position: 'absolute', top: h * 0.3, width: d * 0.5, height: d * 0.5, borderRadius: radius.capsule(d), backgroundColor: alpha(on, 0.85) }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.34, backgroundColor: alpha(colors.foreground, 0.35) }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: h * 0.22, height: Math.max(1, h * 0.03), backgroundColor: alpha(on, 0.35) }} />
      </View>
    );
  }
  if (kind === 'grid') {
    const cell = d * 0.18;
    return (
      <View style={[box, { backgroundColor: colors.foreground, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: cell * 3 + cell * 0.5 * 2, flexDirection: 'row', flexWrap: 'wrap', gap: cell * 0.5 }}>
          {[1, 0.25, 0.6, 0.25, 1, 0.25, 0.6, 0.25, 1].map((a, i) => (
            <View key={i} style={{ width: cell, height: cell, borderRadius: radius.scale(cell * 0.3), backgroundColor: alpha(colors.accent, a) }} />
          ))}
        </View>
      </View>
    );
  }
  if (kind === 'rings') {
    return (
      <View style={[box, { backgroundColor: alpha(colors.accent, 0.16), alignItems: 'center', justifyContent: 'center' }]}>
        {[0.95, 0.7, 0.45, 0.2].map((f) => (
          <View
            key={f}
            style={{
              position: 'absolute',
              width: d * f,
              height: d * f,
              borderRadius: radius.capsule(d),
              borderWidth: Math.max(1.5, d * 0.03),
              borderColor: alpha(colors.accent, 1 - f * 0.6),
            }}
          />
        ))}
      </View>
    );
  }
  if (kind === 'stripes') {
    return (
      <View style={[box, { backgroundColor: colors.muted, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ width: d * 1.6, gap: d * 0.07, transform: [{ rotate: '-30deg' }] }}>
          {[0.9, 0.55, 0.3, 0.55, 0.9].map((a, i) => (
            <View key={i} style={{ height: d * 0.1, backgroundColor: alpha(colors.accent, a) }} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: colors.foreground, flexDirection: 'row' }]}>
      <View style={{ flex: 1, backgroundColor: colors.accent }} />
      <View style={{ flex: 1 }} />
      <View
        style={{
          position: 'absolute',
          left: (w ?? d) / 2 - d * 0.22,
          top: h / 2 - d * 0.22,
          width: d * 0.44,
          height: d * 0.44,
          borderRadius: radius.capsule(d),
          backgroundColor: colors.background,
        }}
      />
    </View>
  );
}

/** A right-pointing triangle made from borders (play / skip glyphs). */
function Tri({ size, color, flip }: { size: number; color: string; flip?: boolean }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: size / 2,
        borderBottomWidth: size / 2,
        borderLeftWidth: size * 0.85,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
        transform: flip ? [{ scaleX: -1 }] : undefined,
      }}
    />
  );
}

function Skip({ color, back }: { color: string; back?: boolean }) {
  const { radius } = useKit();
  return (
    <View style={{ flexDirection: back ? 'row-reverse' : 'row', alignItems: 'center', gap: 1 }}>
      <Tri size={14} color={color} flip={back} />
      <View style={{ width: 2.5, height: 14, borderRadius: radius.capsule(2.5), backgroundColor: color }} />
    </View>
  );
}

const TRACKS: { title: string; artist: string; time: string; art: ArtKind; playing?: boolean }[] = [
  { title: 'Midnight City Lights', artist: 'Nova Arcade', time: '4:12', art: 'sunset', playing: true },
  { title: 'Paper Planes', artist: 'Juniper Fields', time: '3:27', art: 'rings' },
  { title: 'Tidal', artist: 'Okra & The Moon', time: '5:03', art: 'stripes' },
  { title: 'Slow Burn', artist: 'Halcyon Days', time: '3:48', art: 'grid' },
  { title: 'Northern Line', artist: 'The Lanterns', time: '4:31', art: 'split' },
];

/** Music app with the push look and a stacked profile. */
export function PushLayout() {
  const { colors, radius, dark } = useKit();
  const [view, setView] = useState('Listen now');
  const [playing, setPlaying] = useState(true);
  return (
    <Frame>
      <Drawer
        variant="push"
        width={252}
        topInset={STATUS_H}
        header={<DrawerProfile layout="stacked" name="Jonas Weber" email="Premium · 2 devices" />}
        content={
          <>
            {(
              [
                ['home', 'Listen now'],
                ['search', 'Search'],
                ['music', 'Library', 3],
                ['bell', 'New releases', 8, 'accent'],
              ] as [DrawerIconName, string, number?, 'accent'?][]
            ).map(([icon, label, badge, badgeTone]) => (
              <DrawerItem key={label} icon={icon} label={label} badge={badge} badgeTone={badgeTone} active={view === label} onPress={() => setView(label)} />
            ))}
            <DrawerSection title="Playlists" />
            {['Late Night Drive', 'Focus Flow', 'Sunday Coffee'].map((p, i) => (
              <DrawerItem
                key={p}
                icon={<Art kind={(['sunset', 'rings', 'stripes'] as const)[i]} size={22} radiusSize={radius.scale(5)} />}
                label={p}
                active={view === p}
                onPress={() => setView(p)}
              />
            ))}
          </>
        }
        footer={<DrawerItem icon="help" label="Help & feedback" closeOnPress={false} />}
      >
        <Phone>
          <TopBar title={view} right={<IconButton icon="search" label="Search music" />} />
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <View
              style={{
                padding: 14,
                gap: 12,
                borderRadius: radius.scale(20),
                backgroundColor: colors.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                shadowColor: dark ? colors.background : colors.foreground,
                shadowOpacity: dark ? 0.4 : 0.06,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <Art kind="sunset" size={92} />
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.accent }}>Now playing</Text>
                  <Text numberOfLines={1} style={{ fontSize: 17, letterSpacing: -0.3, color: colors.foreground }}>
                    Midnight City Lights
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, color: colors.mutedForeground }}>
                    Nova Arcade · Afterglow
                  </Text>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ height: 4, borderRadius: radius.capsule(4), backgroundColor: colors.muted, overflow: 'hidden' }}>
                  <View style={{ width: '43%', height: '100%', borderRadius: radius.capsule(4), backgroundColor: colors.accent }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11.5, color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>1:48</Text>
                  <Text style={{ fontSize: 11.5, color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>-2:24</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
                <Skip color={colors.foreground} back />
                <Pressable
                  onPress={() => setPlaying((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Pause' : 'Play'}
                  style={{ width: 48, height: 48, borderRadius: radius.capsule(48), backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
                >
                  {playing ? (
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <View style={{ width: 4.5, height: 16, borderRadius: radius.capsule(4.5), backgroundColor: colors.accentForeground }} />
                      <View style={{ width: 4.5, height: 16, borderRadius: radius.capsule(4.5), backgroundColor: colors.accentForeground }} />
                    </View>
                  ) : (
                    <View style={{ marginLeft: 3 }}>
                      <Tri size={17} color={colors.accentForeground} />
                    </View>
                  )}
                </Pressable>
                <Skip color={colors.foreground} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, letterSpacing: -0.3, color: colors.foreground }}>Up next</Text>
              <Text style={{ fontSize: 13.5, color: colors.accent }}>See all</Text>
            </View>
            <View style={{ gap: 12 }}>
              {TRACKS.map((t) => (
                <View key={t.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Art kind={t.art} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: t.playing ? colors.accent : colors.foreground }}>
                      {t.title}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedForeground }}>
                      {t.artist}
                    </Text>
                  </View>
                  {t.playing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 }}>
                      {[8, 14, 10].map((hh, i) => (
                        <View key={i} style={{ width: 3, height: hh, borderRadius: radius.capsule(3), backgroundColor: colors.accent }} />
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontVariant: ['tabular-nums'] }}>{t.time}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </Phone>
      </Drawer>
    </Frame>
  );
}
