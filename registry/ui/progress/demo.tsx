import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useKit } from '@/lib/kit';

export function Linear() {
  const [value, setValue] = useState(32);
  return (
    <View style={{ gap: 18 }}>
      <Progress value={value} label="Uploading trip-to-lisbon.mov" showValue />
      <Progress value={value} size="sm" />
      <Progress value={value} size="lg" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" variant="outline" onPress={() => setValue((v) => Math.max(0, v - 20))}>
          − 20
        </Button>
        <Button size="sm" variant="outline" onPress={() => setValue((v) => Math.min(100, v + 20))}>
          + 20
        </Button>
      </View>
    </View>
  );
}

export function Download() {
  const { colors } = useKit();
  const [mb, setMb] = useState(6);
  useEffect(() => {
    const id = setInterval(() => setMb((v) => (v >= 48 ? 0 : Math.min(48, v + 3.4))), 700);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ gap: 6 }}>
      <Progress
        value={mb}
        max={48}
        label="Offline maps · Portugal"
        showValue
        formatValue={(v, max) => `${v.toFixed(1)} of ${max} MB`}
      />
      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
        {mb >= 48 ? 'Ready to use offline' : `4.8 MB/s · about ${Math.ceil((48 - mb) / 4.8)} s left`}
      </Text>
    </View>
  );
}

export function Completion() {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (value >= 100) return;
    const id = setTimeout(() => setValue((v) => Math.min(100, v + 12 + Math.round(Math.random() * 10))), 450);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <View style={{ gap: 18 }}>
      <Progress value={value} label={value >= 100 ? 'Backup complete' : 'Backing up photos'} showValue />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Progress variant="circular" size="md" value={value} />
        <Button size="sm" variant="outline" onPress={() => setValue(0)}>
          Run again
        </Button>
      </View>
    </View>
  );
}

export function Indeterminate() {
  return (
    <View style={{ gap: 18 }}>
      <Progress indeterminate label="Connecting to Wi‑Fi printer" />
      <Progress value={64} striped label="Compressing video" showValue />
      <Progress indeterminate size="sm" />
    </View>
  );
}

export function Spinning() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      <Progress variant="circular" size="sm" indeterminate />
      <Progress variant="circular" size="md" indeterminate label="Restoring backup" />
    </View>
  );
}

export function Circular() {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setValue((v) => (v >= 100 ? 0 : v + 25)), 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' }}>
      <Progress variant="circular" size="sm" value={value} />
      <Progress variant="circular" size="md" value={72} label="iCloud storage" />
      <Progress variant="circular" size="lg" value={value} label="Move goal" />
    </View>
  );
}

export function Steps() {
  const [step, setStep] = useState(2);
  return (
    <View style={{ gap: 16 }}>
      <Progress
        variant="steps"
        steps={5}
        value={step}
        label={step >= 5 ? 'Profile ready' : 'Set up your profile'}
        showValue
        formatValue={(v, max) => `Step ${Math.min(max, v + 1)} of ${max}`}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" variant="outline" onPress={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        <Button size="sm" variant="accent" onPress={() => setStep((s) => Math.min(5, s + 1))}>
          Continue
        </Button>
      </View>
    </View>
  );
}
