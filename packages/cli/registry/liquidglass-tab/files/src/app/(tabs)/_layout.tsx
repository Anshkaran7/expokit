import React from 'react';
import { DynamicColorIOS, Platform } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
// SDK 54–57 path. On SDK 58+ change this to 'expo-router/native-tabs'.
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { GlassTabBar } from '@/components/GlassTabBar';
import { USE_NATIVE_TABS } from '@/lib/tab-bar';
import {
  asFamily,
  resolveIconLibrary,
  resolveIconNames,
  TAB_BAR,
  TABS,
  type TabItem,
} from '@/lib/tabs';

type IconProps = React.ComponentProps<typeof NativeTabs.Trigger.Icon>;

function dynamicColor(pair: { light: string; dark: string }) {
  return Platform.OS === 'ios' ? DynamicColorIOS(pair) : pair.light;
}

/** Vector-font icon rasterised for the native bar (Android, or iOS when no SF Symbol is set). */
function vectorSrc(tab: TabItem) {
  const library = resolveIconLibrary(tab);
  const { name, selected } = resolveIconNames(tab);
  if (!library || !name) return undefined;

  const family = asFamily(library);
  const icon = <NativeTabs.Trigger.VectorIcon family={family} name={name} />;
  if (!selected) return icon;
  return { default: icon, selected: <NativeTabs.Trigger.VectorIcon family={family} name={selected} /> };
}

/**
 * Returns the Icon element itself (not a wrapper component): NativeTabs reads its
 * children by type, so <NativeTabs.Trigger.Icon> must be a direct child of the Trigger.
 */
function nativeIcon(tab: TabItem, tint: IconProps['selectedColor']) {
  const src = tab.src ?? vectorSrc(tab);
  if (!tab.sf && !src) return null;
  // sf wins on iOS, src is used on Android.
  const props = { sf: tab.sf, src, selectedColor: tint } as IconProps;
  return <NativeTabs.Trigger.Icon {...props} />;
}

function NativeTabLayout() {
  const tint = dynamicColor(TAB_BAR.colors.tint);
  const inactive = dynamicColor(TAB_BAR.colors.inactive);
  const { fontSize, fontWeight, selectedFontWeight } = TAB_BAR.labelStyle;

  return (
    <NativeTabs
      tintColor={tint}
      iconColor={inactive}
      labelVisibilityMode={TAB_BAR.labelVisibilityMode}
      minimizeBehavior={TAB_BAR.minimizeBehavior}
      labelStyle={{ color: inactive, fontSize, fontWeight }}
      {...(TAB_BAR.backgroundColor != null ? { backgroundColor: TAB_BAR.backgroundColor } : null)}
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name} hidden={tab.hidden}>
          {nativeIcon(tab, tint)}
          <NativeTabs.Trigger.Label
            hidden={tab.hiddenLabel}
            selectedStyle={{ color: tint, fontSize, fontWeight: selectedFontWeight }}
          >
            {tab.title}
          </NativeTabs.Trigger.Label>
          {tab.badge ? <NativeTabs.Trigger.Badge>{tab.badge}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function GlassTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.title, href: tab.hidden ? null : undefined }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  return USE_NATIVE_TABS ? <NativeTabLayout /> : <GlassTabLayout />;
}
