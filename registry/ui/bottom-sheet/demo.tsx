import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip-group';
import { ListIcon, ListItem, ListSection } from '@/components/ui/list-item';
import { Switch } from '@/components/ui/switch';
import { alpha, readableOn, useKit } from '@/lib/kit';

function useMuted() {
  const { colors } = useKit();
  return { fontSize: 14, lineHeight: 20, color: colors.mutedForeground };
}

/** Share sheet: recent people, app targets and actions. */
export function Basic() {
  const { colors, radius } = useKit();
  const [open, setOpen] = useState(false);
  const apps: [string, 'mail' | 'phone' | 'globe' | 'heart', string][] = [
    ['Mail', 'mail', colors.accent],
    ['Messages', 'phone', colors.success],
    ['Browser', 'globe', colors.warning],
    ['Favorites', 'heart', colors.danger],
  ];
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="accent" onPress={() => setOpen(true)}>
        Share album
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share “Lisbon, May 12–16”"
        subtitle="24 photos · 3 videos"
        contentStyle={{ paddingHorizontal: 0 }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingHorizontal: 20, paddingVertical: 8 }}>
          {['Ana Costa', 'Luis Moreno', 'Priya Shah', 'Tom Becker', 'Mei Lin'].map((name) => (
            <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Send to ${name}`} style={{ alignItems: 'center', gap: 6, width: 58 }}>
              <Avatar name={name} size={54} />
              <Text numberOfLines={1} style={{ fontSize: 12, color: colors.foreground }}>
                {name.split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
          {apps.map(([label, icon, color]) => (
            <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: radius.scale(16),
                  backgroundColor: color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ListIcon name={icon} color={readableOn(color)} size={24} />
              </View>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <ListSection>
          <ListItem title="Copy link" icon="globe" iconVariant="tinted" chevron={false} size="sm" onPress={() => setOpen(false)} />
          <ListItem title="Add to shared album" icon="user" iconVariant="tinted" chevron={false} size="sm" onPress={() => setOpen(false)} />
          <ListItem title="Mark as favorite" icon="star" iconVariant="tinted" chevron={false} size="sm" onPress={() => setOpen(false)} />
        </ListSection>
      </BottomSheet>
    </View>
  );
}

/** Ride details with two snap points: 40% shows the essentials, drag to 90% for the trip. */
export function SnapPoints() {
  const { colors, radius } = useKit();
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState(0);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="accent" onPress={() => setOpen(true)}>
        Track your ride
      </Button>
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          setSnap(0);
        }}
        snapPoints={['40%', '90%']}
        snapIndex={snap}
        onSnapChange={setSnap}
        scrollable
        accessibilityLabel="Ride details"
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 24, letterSpacing: -0.5, color: colors.foreground }}>Arriving in 4 min</Text>
            <Text style={[muted, { marginTop: 2 }]}>Silver Toyota Prius · 7KJ 482</Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              height: 28,
              justifyContent: 'center',
              borderRadius: radius.capsule(28),
              backgroundColor: alpha(colors.success, 0.14),
            }}
          >
            <Text style={{ fontSize: 13, color: colors.success }}>On time</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <Avatar name="Daniel Ortiz" size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: colors.foreground }}>Daniel Ortiz</Text>
            <Text style={muted}>★ 4.92 · 2,184 trips</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <Button variant="secondary" style={{ flex: 1 }}>
            Message
          </Button>
          <Button variant="secondary" style={{ flex: 1 }}>
            Call
          </Button>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => setSnap(1)}>
            {snap === 0 ? 'Details' : 'Share'}
          </Button>
        </View>

        <Text style={[muted, { marginTop: 28, marginBottom: 6, fontSize: 12, letterSpacing: 0.8 }]}>TRIP</Text>
        {[
          ['Pickup', 'Rua Augusta 24, Baixa', colors.accent],
          ['Drop-off', 'Lisbon Airport, Terminal 1', colors.foreground],
        ].map(([label, place, color]) => (
          <View key={label} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 10, height: 10, marginTop: 5, borderRadius: radius.capsule(10), backgroundColor: color }} />
            <View>
              <Text style={muted}>{label}</Text>
              <Text style={{ fontSize: 15, color: colors.foreground }}>{place}</Text>
            </View>
          </View>
        ))}
        <Text style={[muted, { marginTop: 22, marginBottom: 6, fontSize: 12, letterSpacing: 0.8 }]}>FARE</Text>
        {[
          ['Comfort · 14.2 km', '₹333'],
          ['Airport fee', '₹50'],
          ['Promo SPRING10', '−₹35'],
          ['Total · Visa ••42', '₹348'],
        ].map(([item, price], i, all) => (
          <View key={item} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
            <Text style={[muted, i === all.length - 1 && { color: colors.foreground }]}>{item}</Text>
            <Text style={{ fontSize: 14, color: colors.foreground }}>{price}</Text>
          </View>
        ))}
        <Text style={[muted, { marginTop: 22, marginBottom: 6, fontSize: 12, letterSpacing: 0.8 }]}>SAFETY</Text>
        <ListSection>
          <ListItem title="Share trip status" icon="user" iconVariant="tinted" size="sm" onPress={() => {}} />
          <ListItem title="Emergency assistance" icon="shield" iconVariant="tinted" size="sm" onPress={() => {}} />
          <ListItem title="Cancel ride" icon="trash" destructive size="sm" chevron={false} onPress={() => setOpen(false)} />
        </ListSection>
      </BottomSheet>
    </View>
  );
}

/** Scrolling filters with a Reset link and a pinned results button. */
export function Filters() {
  const { colors } = useKit();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string[]>(['Entire home']);
  const [price, setPrice] = useState<string[]>(['₹5,000 – ₹10,000']);
  const [rooms, setRooms] = useState<string[]>(['2']);
  const [amenities, setAmenities] = useState<string[]>(['Wi-Fi', 'Kitchen']);
  const [instant, setInstant] = useState(true);
  const [flexible, setFlexible] = useState(false);
  const count = 214 - amenities.length * 23 - (instant ? 31 : 0) - (flexible ? 18 : 0);
  const reset = () => {
    setType([]);
    setPrice([]);
    setRooms([]);
    setAmenities([]);
    setInstant(false);
    setFlexible(false);
  };
  const heading = (t: string) => <Text style={{ fontSize: 16, color: colors.foreground, marginTop: 20, marginBottom: 10 }}>{t}</Text>;
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="outline" onPress={() => setOpen(true)}>
        Filters · Porto
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={['62%', '92%']}
        scrollable
        title="Filters"
        headerRight={
          <Pressable onPress={reset} accessibilityRole="button" hitSlop={12}>
            <Text style={{ fontSize: 15, color: colors.accent }}>Reset</Text>
          </Pressable>
        }
        footer={
          <Button variant="accent" block onPress={() => setOpen(false)}>
            {`Show ${count} homes`}
          </Button>
        }
      >
        {heading('Type of place')}
        <ChipGroup options={['Entire home', 'Private room', 'Shared room']} value={type} onValueChange={setType} />
        {heading('Price per night')}
        <ChipGroup options={['Under ₹5,000', '₹5,000 – ₹10,000', '₹10,000+']} value={price} onValueChange={setPrice} />
        {heading('Bedrooms')}
        <ChipGroup options={['Any', '1', '2', '3', '4+']} value={rooms} onValueChange={setRooms} />
        {heading('Amenities')}
        <ChipGroup
          multiple
          options={['Wi-Fi', 'Kitchen', 'Washer', 'Air conditioning', 'Free parking', 'Workspace', 'Pool']}
          value={amenities}
          onValueChange={setAmenities}
        />
        {heading('Booking options')}
        <View style={{ gap: 14 }}>
          <Switch label="Instant book" description="Book without waiting for host approval" value={instant} onValueChange={setInstant} />
          <Switch label="Free cancellation" description="Cancel up to 48 h before check-in" value={flexible} onValueChange={setFlexible} />
        </View>
      </BottomSheet>
    </View>
  );
}

/** Reply composer: the keyboard lifts the sheet. */
export function KeyboardAware() {
  const { colors, radius } = useKit();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Reply to Lena
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={[300]}
        title="Reply to Lena Fischer"
        subtitle="Re: Offsite agenda"
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Thursday works for me — I’ll bring the prototypes."
          placeholderTextColor={colors.mutedForeground}
          multiline
          accessibilityLabel="Reply"
          style={{
            minHeight: 110,
            padding: 14,
            fontSize: 15,
            textAlignVertical: 'top',
            color: colors.foreground,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: alpha(colors.foreground, 0.08),
            backgroundColor: colors.muted,
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Button variant="ghost" onPress={() => setOpen(false)}>
            Discard
          </Button>
          <Button
            variant="accent"
            disabled={!text.trim()}
            onPress={() => {
              setText('');
              setOpen(false);
            }}
          >
            Send
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}

/** Must-acknowledge sheet: no drag-to-dismiss, rubber-bands at its lowest point. */
export function NonDismissible() {
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: 'center' }}>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Review terms
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={['40%', '70%']}
        dismissible={false}
        title="We updated our terms"
        subtitle="Effective November 1, 2026"
      >
        <Text style={muted}>
          Your files stay encrypted at rest, and we never sell personal information. We now keep deleted items for 30 days so you
          can restore them. Please review and accept to keep using your account.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Button variant="outline" style={{ flex: 1 }} block onPress={() => setOpen(false)}>
            Later
          </Button>
          <Button variant="accent" style={{ flex: 1 }} block onPress={() => setOpen(false)}>
            Accept
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}
