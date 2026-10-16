import React, { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { Confetti, type ConfettiHandle } from '@/components/ui/confetti';
import { Coupon } from '@/components/ui/coupon';
import { useKit } from '@/lib/kit';

const logo = (id: number) => <Image alt="" source={{ uri: `https://picsum.photos/id/${id}/64/64` }} style={{ width: 18, height: 18, borderRadius: 5 }} />;

/** 3D and holographic: tilt it, copy the code, read the T&C on the back, apply it — confetti. */
export function Hero() {
  const { colors } = useKit();
  const [applied, setApplied] = useState(false);
  const confetti = useRef<ConfettiHandle>(null);
  return (
    <View style={{ gap: 14, paddingVertical: 8 }}>
      <View>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>Just for you</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Tilt the coupon · tap T&C to flip it</Text>
      </View>
      <Coupon
        tilt
        holo
        idle
        shine
        theme="candy"
        size="lg"
        brand="Glow Beauty"
        logo={logo(64)}
        prefix="Flat"
        value="50%"
        unit="Off"
        title="Your first order, on us"
        description="Up to ₹300 off on skincare & makeup"
        code="GLOW50"
        expires="Valid till 31 Dec"
        terms={['Min. order ₹699', 'Once per account', 'Not valid on gift cards', 'Can’t be combined with other offers']}
        status={applied ? 'applied' : 'available'}
        onCopy={() => {}}
        onApply={() => {
          setApplied(true);
          confetti.current?.burst();
        }}
      />
      {applied ? (
        <Pressable onPress={() => setApplied(false)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: '600' }}>Remove coupon</Text>
        </Pressable>
      ) : null}
      <Confetti ref={confetti} />
    </View>
  );
}

/** A real offers list — every state a coupon goes through, flat so it scrolls smoothly. */
export function OffersList() {
  const { colors } = useKit();
  const [applied, setApplied] = useState<string | null>('SWIGGY60');
  const [soon] = useState(() => Date.now() + 2 * 3600_000 + 14 * 60_000);
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800' }}>Offers for you</Text>
      <Coupon
        theme="fire"
        brand="Swiggy"
        logo={logo(292)}
        value="60%"
        unit="Off"
        title="Up to ₹120 on your next meal"
        code="SWIGGY60"
        expiresAt={soon}
        status={applied === 'SWIGGY60' ? 'applied' : 'available'}
        onCopy={() => {}}
        onApply={() => setApplied('SWIGGY60')}
      />
      <Coupon
        theme="ocean"
        variant="stamp"
        brand="HDFC Bank"
        prefix="Instant"
        value="₹250"
        unit="Off"
        title="On HDFC credit cards"
        description="Orders above ₹1,500"
        code="HDFC250"
        status={applied === 'HDFC250' ? 'applied' : 'available'}
        onCopy={() => {}}
        onApply={() => setApplied('HDFC250')}
      />
      <Coupon
        theme="lime"
        variant="receipt"
        brand="BigBasket"
        value="FREE"
        unit="Delivery"
        title="Free delivery on groceries"
        code="FREEDEL"
        status="locked"
        lockedHint="Add ₹120 more to unlock"
        onApply={() => {}}
      />
      <Coupon theme="ink" variant="scallop" brand="Myntra" value="BOGO" unit="Deal" title="Buy 1 get 1 on tees" code="BOGOTEE" status="expired" onApply={() => {}} />
    </View>
  );
}

/** Five outlines — ticket, stamp, receipt, scallop and a cut-here paper coupon. */
export function Shapes() {
  return (
    <View style={{ gap: 14 }}>
      <Coupon size="sm" theme="sunset" variant="ticket" value="30%" unit="Off" title="Ticket — classic notches" code="TICKET30" onCopy={() => {}} />
      <Coupon size="sm" theme="ocean" variant="stamp" value="₹99" unit="Off" title="Stamp — perforated edges" code="STAMP99" onCopy={() => {}} />
      <Coupon size="sm" theme="gold" variant="receipt" value="2X" unit="Points" title="Receipt — torn zigzag ends" code="RECEIPT2X" onCopy={() => {}} />
      <Coupon size="sm" theme="candy" variant="scallop" value="FREE" unit="Gift" title="Scallop — wavy edges" code="SCALLOP" onCopy={() => {}} />
      <Coupon size="sm" theme="paper" variant="cutout" value="25%" unit="Off" title="Cut-out — clip along the line" code="CLIPME25" onCopy={() => {}} />
    </View>
  );
}

/** Vertical coupons in a two-column grid — bank and wallet offers. */
export function Grid() {
  const offers = [
    { theme: 'neon' as const, brand: 'Paytm', value: '₹100', unit: 'Cashback', title: 'On UPI payments', code: 'PAYTM100' },
    { theme: 'gold' as const, brand: 'Amex', value: '10%', unit: 'Off', title: 'Weekend dining', code: 'AMEX10' },
    { theme: 'sunset' as const, brand: 'Zomato', value: '₹75', unit: 'Off', title: 'Orders above ₹299', code: 'ZOMATO75' },
    { theme: 'holo' as const, brand: 'Nykaa', value: '3X', unit: 'Points', title: 'This weekend only', code: 'NYKAA3X' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {offers.map((o) => (
        <Coupon key={o.code} {...o} layout="vertical" size="sm" variant={o.theme === 'gold' ? 'stamp' : 'ticket'} onCopy={() => {}} style={{ width: '47%', flexGrow: 1 }} />
      ))}
    </View>
  );
}

/** A flash sale: the countdown ticks live, the shine sweeps, and it expires on its own. */
export function FlashSale() {
  const { colors } = useKit();
  const [ends, setEnds] = useState(() => Date.now() + 47_000);
  return (
    <View style={{ gap: 14 }}>
      <Coupon
        theme="sunset"
        layout="vertical"
        size="lg"
        shine
        brand="Flash sale"
        prefix="Extra"
        value="70%"
        unit="Off"
        title="Sneakers · next 47 seconds"
        description="Ends when the timer does — no extensions"
        code="FLASH70"
        expiresAt={ends}
        onCopy={() => {}}
        onApply={() => {}}
      />
      <Pressable onPress={() => setEnds(Date.now() + 47_000)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: '600' }}>Restart timer</Text>
      </Pressable>
    </View>
  );
}
