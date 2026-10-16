import React, { useState } from 'react';
import { View } from 'react-native';

import { ListGroup, ListItem, ListSection } from '@/components/ui/list-item';
import { Switch } from '@/components/ui/switch';

export function Settings() {
  const [dark, setDark] = useState(true);
  return (
    <View style={{ gap: 22 }}>
      <ListGroup header="Account">
        <ListItem icon="user" title="Profile" value="Amelia Hart" onPress={() => {}} />
        <ListItem icon="bell" iconColor="#ef4444" title="Notifications" value="Banners" onPress={() => {}} />
        <ListItem icon="shield" iconColor="#22c55e" title="Privacy & security" onPress={() => {}} />
        <ListItem
          icon="moon"
          iconColor="#0ea5e9"
          title="Dark mode"
          trailing={<Switch size="sm" value={dark} onValueChange={setDark} accessibilityLabel="Dark mode" />}
        />
      </ListGroup>
      <ListGroup footer="You'll need your password to sign back in on this device.">
        <ListItem icon="logout" title="Sign out" destructive chevron={false} onPress={() => {}} />
      </ListGroup>
    </View>
  );
}

const CONTACTS = [
  { name: 'Aisha Rahman', role: 'Product designer · Lisbon', src: 'https://i.pravatar.cc/120?img=47', online: true },
  { name: 'Alex Moreno', role: 'iOS engineer · Madrid' },
  { name: 'Ben Carter', role: 'Founder at Northwind', src: 'https://i.pravatar.cc/120?img=12' },
  { name: 'Bianca Rossi', role: 'Marketing lead · Milan', online: true },
];

export function Contacts() {
  return (
    <View>
      <ListSection header="A">
        {CONTACTS.slice(0, 2).map((c) => (
          <ListItem key={c.name} avatar={{ src: c.src, name: c.name, online: c.online }} title={c.name} subtitle={c.role} onPress={() => {}} />
        ))}
      </ListSection>
      <ListSection header="B">
        {CONTACTS.slice(2).map((c) => (
          <ListItem key={c.name} avatar={{ src: c.src, name: c.name, online: c.online }} title={c.name} subtitle={c.role} onPress={() => {}} />
        ))}
      </ListSection>
    </View>
  );
}

const MAIL = [
  { from: 'Maya Lin', subject: 'Q3 roadmap — final draft', body: 'Attached the updated plan with the launch moved to the 14th. Can you sign off by Friday?', time: '9:41', unread: 3 },
  { from: 'Stripe', subject: 'Your payout is on the way', body: '₹4,21,850 will arrive in your account ending 4432 on Wednesday.', time: '8:02', unread: 1, color: '#635bff' },
  { from: 'Jonas Weber', subject: 'Re: Dinner on Saturday?', body: "Booked the Italian place for 7:30. I'll bring the wine.", time: 'Tue' },
];

export function Inbox() {
  return (
    <ListGroup>
      {MAIL.map((m) => (
        <ListItem
          key={m.from}
          size="lg"
          avatar={{ name: m.from, color: m.color }}
          title={m.from}
          titleStyle={m.unread ? { fontWeight: '400' } : null}
          meta={m.time}
          subtitle={m.subject}
          description={m.body}
          badge={m.unread}
          chevron={false}
          onPress={() => {}}
        />
      ))}
    </ListGroup>
  );
}

export function Picker() {
  const [lang, setLang] = useState('English');
  return (
    <ListGroup header="Language" footer="Apps and websites will use the first language they support.">
      {['English', 'Español', 'Deutsch', '日本語'].map((l) => (
        <ListItem key={l} size="sm" title={l} checked={lang === l} onPress={() => setLang(l)} />
      ))}
    </ListGroup>
  );
}

export function Tinted() {
  return (
    <ListGroup>
      <ListItem icon="wifi" iconVariant="tinted" iconColor="#0ea5e9" title="Wi-Fi" value="Home-5G" onPress={() => {}} />
      <ListItem icon="card" iconVariant="tinted" iconColor="#f59e0b" title="Payment methods" description="Visa ending 4432 · Apple Pay" onPress={() => {}} />
      <ListItem icon="star" iconVariant="tinted" title="Upgrade to Pro" badge="New" onPress={() => {}} />
      <ListItem icon="trash" iconVariant="tinted" title="Delete account" destructive disabled onPress={() => {}} />
    </ListGroup>
  );
}
