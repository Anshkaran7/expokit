import React from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Timeline } from '@/components/ui/timeline';
import { alpha, useKit } from '@/lib/kit';

/** Control text stops at iOS's largest standard size. */
const FONT_CAP = 1.35;

/** From the Expo Go viewer: `screen` = this IS the phone screen, so no mock frame; `bottomInset` = home indicator. */
type DemoProps = { screen?: boolean; bottomInset?: number };

export function OrderTracking() {
  const { colors, radius, dark } = useKit();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={{ fontSize: 12.5, letterSpacing: 0.4, color: colors.mutedForeground }}>ORDER #4821</Text>
          <Text style={{ fontSize: 20, letterSpacing: -0.4, color: colors.foreground }}>Arriving today</Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: radius.capsule(24),
            backgroundColor: alpha(colors.accent, dark ? 0.2 : 0.1),
          }}
        >
          <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 12.5, color: colors.accent }}>by 6 PM</Text>
        </View>
      </View>
      <Timeline
        items={[
          { title: 'Ordered', time: 'Mon 9:12', description: 'Paid with Apple Pay · 2 items', icon: 'cart' },
          { title: 'Packed', time: 'Tue 16:40', description: 'Left the Rotterdam warehouse', icon: 'package' },
          {
            title: 'Out for delivery',
            time: '11:05',
            description: 'Jonas is 6 stops away in a white van',
            icon: 'truck',
            status: 'current',
          },
          { title: 'Delivered', time: 'Est. 17:30', description: 'Leave at the front door if no one answers', icon: 'home', status: 'upcoming' },
        ]}
      />
    </View>
  );
}

export function Activity() {
  const { colors, radius, dark } = useKit();
  return (
    <Timeline
      items={[
        {
          title: 'Priya Shah commented',
          time: '2m',
          avatar: { name: 'Priya Shah', src: 'https://i.pravatar.cc/120?img=32' },
          status: 'current',
          content: (
            <View
              style={{
                padding: 12,
                borderRadius: radius.md,
                backgroundColor: alpha(colors.foreground, dark ? 0.06 : 0.035),
              }}
            >
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.foreground }}>
                Love the new onboarding — can we try the shorter headline on step two?
              </Text>
            </View>
          ),
        },
        {
          title: 'Marco Bianchi uploaded 3 photos',
          time: '1h',
          description: 'Moodboard · Autumn campaign',
          avatar: { name: 'Marco Bianchi', src: 'https://i.pravatar.cc/120?img=15' },
          image: { uri: 'https://picsum.photos/id/1043/800/450', aspectRatio: 16 / 9 },
        },
        {
          title: 'Lena Fischer shared a file',
          time: '3h',
          avatar: { name: 'Lena Fischer' },
          content: (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: alpha(colors.foreground, dark ? 0.1 : 0.06),
                backgroundColor: colors.card,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.sm,
                  backgroundColor: alpha(colors.danger, 0.12),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 11, color: colors.danger }}>PDF</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, color: colors.foreground }}>Q4 brand guidelines.pdf</Text>
                <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>4.2 MB · 18 pages</Text>
              </View>
            </View>
          ),
        },
        { title: 'Nightly build failed', time: 'Yesterday', description: 'iOS · Signing certificate expired', status: 'error', icon: 'bug' },
      ]}
    />
  );
}

export function Release() {
  const { colors, radius, dark } = useKit();
  return (
    <Timeline
      variant="card"
      items={[
        { title: 'v3.0 — Widgets', time: 'Next week', description: 'Home-screen widgets for iOS and Android.', icon: 'rocket', status: 'upcoming' },
        {
          title: 'v2.4 — Offline mode',
          time: 'Oct 8',
          description: 'Edit notes without a connection; changes sync when you are back online.',
          icon: 'star',
          status: 'current',
          content: (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['New', 'Sync', 'iOS', 'Android'].map((t) => (
                <View
                  key={t}
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: radius.capsule(22),
                    backgroundColor: alpha(colors.accent, dark ? 0.2 : 0.1),
                  }}
                >
                  <Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 12, color: colors.accent }}>{t}</Text>
                </View>
              ))}
            </View>
          ),
        },
        { title: 'v2.3.2 — Fixes', time: 'Sep 29', description: 'Fixed a crash when sharing large PDFs.', icon: 'bug' },
        { title: 'v2.3 — Shared folders', time: 'Sep 12', description: 'Invite people to a folder and edit together.', icon: 'user' },
      ]}
    />
  );
}

export function Compact() {
  return (
    <Timeline
      variant="compact"
      items={[
        { title: 'Account created', time: '09:00' },
        { title: 'Email verified', time: '09:02' },
        { title: 'Profile completed', time: '09:10', status: 'current' },
        { title: 'First project', status: 'upcoming' },
        { title: 'Invite your team', status: 'upcoming' },
      ]}
    />
  );
}

export function Support() {
  const { colors } = useKit();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar size="sm" name="Support" status="online" />
        <Text style={{ flexShrink: 1, fontSize: 15, color: colors.foreground }}>Refund request #RF-2207</Text>
      </View>
      <Timeline
        variant="compact"
        accent={colors.success}
        items={[
          { title: 'Request received', time: 'Oct 9' },
          { title: 'Return label sent', time: 'Oct 9' },
          { title: 'Card refund declined', time: 'Oct 12', status: 'error' },
          { title: 'Refund to store credit', time: 'Now', status: 'current' },
        ]}
      />
    </View>
  );
}

const pic = (seed: string) => `https://picsum.photos/seed/${seed}/600/400`;

export function Journey({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Timeline
      variant="scroll"
      style={screen ? { flex: 1 } : { height: 560 }}
      header={
        <View style={{ gap: 2, paddingBottom: 20 }}>
          <Text style={{ fontSize: 12.5, letterSpacing: 0.4, color: colors.mutedForeground }}>12 DAYS · 1,140 KM</Text>
          <Text style={{ fontSize: 22, letterSpacing: -0.5, color: colors.foreground }}>Our journey through Portugal</Text>
        </View>
      }
      items={[
        { title: 'Landed in Lisbon', time: 'Day 1', description: 'Late flight, pastel de nata at the airport, tram 28 into Alfama before the rain.', images: [{ uri: pic('lisbon'), aspectRatio: 3 / 2 }], tags: ['Lisbon'] },
        { title: 'Lost in Alfama', time: 'Day 2', description: 'Stairs, tiles, a fado bar that only had six chairs. We stayed until two.', images: [pic('alfama'), pic('tiles')] },
        { title: 'Sintra day trip', time: 'Day 3', description: 'Fog on Pena Palace in the morning, sun in the Moorish castle by noon.', images: [pic('sintra'), pic('palace'), pic('forest'), pic('castle')] },
        { title: 'Rented the car', time: 'Day 4', description: 'A tiny Fiat with a stubborn second gear. Named it Rosa.' },
        { title: 'Comporta beaches', time: 'Day 5', description: 'Rice fields on one side, empty dunes on the other.', images: [{ uri: pic('dunes'), aspectRatio: 16 / 9 }], tags: ['Beach', 'Alentejo'] },
        { title: 'Évora', time: 'Day 6', description: 'Roman temple at sunset and the quietest night of the trip.', images: [pic('evora'), pic('temple'), pic('plains')] },
        { title: 'Wine in the Alentejo', time: 'Day 7', description: 'A cellar tour that turned into lunch with the owner’s family. Ordered a case home.' },
        { title: 'Down to the Algarve', time: 'Day 8', description: 'Benagil caves by kayak — go early, the tour boats arrive at ten.', images: [pic('caves'), pic('kayak')], links: [{ label: 'Kayak rental we used', onPress: () => {} }] },
        { title: 'Lagos', time: 'Day 9', description: 'Cliff walk to Ponta da Piedade and grilled sardines at the harbour.', images: [{ uri: pic('lagos'), aspectRatio: 3 / 2 }] },
        { title: 'Long drive north', time: 'Day 10', description: 'Six hours, two coffee stops, one wrong turn into a cork forest.' },
        { title: 'Porto', time: 'Day 11', status: 'current', description: 'Ribeira, the bridge at blue hour, port lodges across the river.', images: [pic('porto'), pic('bridge'), pic('river')], tags: ['Now'] },
        { title: 'Douro Valley', time: 'Day 12', status: 'upcoming', description: 'Train along the river to Pinhão, then home.' },
      ]}
    />
  );
}

/** @pro */
export function DeliveryScroll({ screen }: DemoProps) {
  const { colors } = useKit();
  return (
    <Timeline
      variant="scroll"
      style={screen ? { flex: 1 } : { height: 560 }}
      header={
        <View style={{ gap: 2, paddingBottom: 20 }}>
          <Text style={{ fontSize: 12.5, letterSpacing: 0.4, color: colors.mutedForeground }}>PARCEL DHL 4471 9902 31</Text>
          <Text style={{ fontSize: 20, letterSpacing: -0.4, color: colors.foreground }}>Out for delivery</Text>
        </View>
      }
      items={[
        { title: 'Order placed', time: 'Oct 6 · 18:22', description: 'Walnut desk lamp, linen shade · paid with Visa', icon: 'cart' },
        { title: 'Payment confirmed', time: 'Oct 6 · 18:23', icon: 'tag' },
        { title: 'Packed', time: 'Oct 7 · 10:40', description: 'Double-boxed with paper padding. Photo from the packing station:', icon: 'package', images: [{ uri: pic('parcel'), aspectRatio: 3 / 2 }] },
        { title: 'Handed to carrier', time: 'Oct 7 · 16:05', description: 'Picked up from the Leipzig warehouse', icon: 'truck' },
        { title: 'Left the sorting hub', time: 'Oct 8 · 02:14', description: 'Hauptumschlagbasis Leipzig', icon: 'truck' },
        { title: 'Arrived in the Netherlands', time: 'Oct 9 · 07:50', description: 'Customs cleared, no fees due', icon: 'home' },
        { title: 'Delivery attempt failed', time: 'Oct 10 · 14:31', description: 'No one home and no safe place. A card was left in the mailbox.', status: 'error', icon: 'home' },
        { title: 'Rescheduled', time: 'Oct 10 · 19:02', description: 'You picked Monday, 12:00–18:00', icon: 'chat' },
        { title: 'Out for delivery', time: '11:05', description: 'Jonas is 6 stops away in a white van', icon: 'truck', status: 'current', links: [{ label: 'Track on map', onPress: () => {} }] },
        { title: 'Delivered', time: 'Est. 15:30', description: 'Leave at the front door if no one answers', icon: 'home', status: 'upcoming' },
        { title: 'Rate your delivery', status: 'upcoming', icon: 'star' },
      ]}
    />
  );
}
