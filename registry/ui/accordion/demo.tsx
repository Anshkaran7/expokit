import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { useKit } from '@/lib/kit';

/** Controls stop at iOS's largest standard text size; content text stays uncapped. */
const FONT_CAP = 1.35;

export function Default() {
  return (
    <Accordion defaultValue={['shipping']}>
      <AccordionItem value="shipping" title="How long does shipping take?">
        Orders leave our warehouse within 24 hours. Standard delivery takes 3–5 business days; express arrives the next day in most cities.
      </AccordionItem>
      <AccordionItem value="returns" title="Can I return an item?">
        Yes — you have 30 days to send anything back for a full refund. Return labels are free and printable from your order page.
      </AccordionItem>
      <AccordionItem value="warranty" title="Is there a warranty?">
        Every product comes with a two-year warranty covering manufacturing defects.
      </AccordionItem>
    </Accordion>
  );
}

export function Bordered() {
  return (
    <Accordion variant="bordered" type="multiple" defaultValue={['account']}>
      <AccordionItem value="account" title="Account" subtitle="Email, password, two-factor">
        Change your sign-in email, rotate your password and manage the devices that can approve logins.
      </AccordionItem>
      <AccordionItem value="billing" title="Billing" subtitle="Plan, invoices, payment method">
        You are on the Pro plan, renewing on 14 November. Invoices are emailed to finance@northwind.io.
      </AccordionItem>
      <AccordionItem value="danger" title="Delete workspace" subtitle="Owners only" disabled>
        This can't be undone.
      </AccordionItem>
    </Accordion>
  );
}

export function SeparatedCards() {
  return (
    <Accordion variant="separated">
      {[
        ['🔒', 'Is my data encrypted?', 'Everything is encrypted in transit with TLS 1.3 and at rest with AES-256. Keys rotate every 90 days.'],
        ['💳', 'Do you offer refunds?', 'If ExpoKit is not for you, email us within 14 days of purchase and we will refund you in full.'],
        ['🌍', 'Which regions do you host in?', 'Frankfurt, Virginia and Singapore. Pick a region when you create a project.'],
      ].map(([icon, q, a]) => (
        <AccordionItem key={q} value={q} title={q} icon={<Text maxFontSizeMultiplier={FONT_CAP} style={{ fontSize: 18 }}>{icon}</Text>}>
          {a}
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function Controlled() {
  const { colors } = useKit();
  const [open, setOpen] = useState<string[]>([]);
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Open: {open.length ? open.join(', ') : 'none'}</Text>
      <Accordion variant="bordered" type="multiple" value={open} onValueChange={setOpen}>
        <AccordionItem value="Ingredients" title="Ingredients">
          <View style={{ gap: 6 }}>
            {['200 g spaghetti', '2 egg yolks + 1 whole egg', '60 g pecorino romano', '120 g guanciale', 'Black pepper'].map((x) => (
              <Text key={x} style={{ fontSize: 14.5, color: colors.mutedForeground }}>• {x}</Text>
            ))}
          </View>
        </AccordionItem>
        <AccordionItem value="Method" title="Method">
          Crisp the guanciale, toss with hot pasta off the heat, then stir in the egg and cheese with a splash of pasta water until glossy.
        </AccordionItem>
      </Accordion>
    </View>
  );
}
