import { useCallback, useRef } from 'react';
import {
  Animated,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import { TAB_BAR } from '@/lib/tabs';

/**
 * Which tab bar this device gets:
 *   - iOS 26+ (built with Xcode 26)  → system NativeTabs with real Liquid Glass.
 *   - iOS 18 and older, Android, web → <GlassTabBar />, a floating blur pill that
 *     mimics Liquid Glass and collapses on scroll the same way.
 * Set TAB_BAR.legacy = 'native' to use plain system tabs on older OS versions instead.
 */
export const USE_NATIVE_TABS =
  Platform.OS !== 'web' &&
  ((Platform.OS === 'ios' && isLiquidGlassAvailable()) || TAB_BAR.legacy === 'native');

export const GLASS_BAR_HEIGHT = 64;

/** 0 = expanded, 1 = collapsed into a circle. Shared by every tab screen. */
export const tabBarCollapse = new Animated.Value(0);
let collapsed = false;

export function setTabBarCollapsed(next: boolean) {
  if (next === collapsed) return;
  collapsed = next;
  Animated.spring(tabBarCollapse, {
    toValue: next ? 1 : 0,
    useNativeDriver: false,
    damping: 29,
    stiffness: 220,
    mass: 0.9,
  }).start();
}

/** Pass to your ScrollView's onScroll — drives the collapse on the glass fallback bar. */
export function useTabBarScroll() {
  const last = useRef(0);
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (USE_NATIVE_TABS || TAB_BAR.minimizeBehavior === 'never') return;
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - last.current;
    last.current = y;
    const down = TAB_BAR.minimizeBehavior === 'onScrollUp' ? dy < 0 : dy > 0;
    if (y < 24) setTabBarCollapsed(false);
    else if (Math.abs(dy) > 6) setTabBarCollapsed(down);
  }, []);
}

/**
 * How far the tab bar covers the bottom of a screen, plus `gap`. Both bars float over the
 * content — iOS 26's Liquid Glass bar and the glass fallback — so use it for anything that
 * reaches the bottom edge: a ScrollView's paddingBottom (with
 * contentInsetAdjustmentBehavior="never"), a bottom-anchored button's `bottom`, or the
 * paddingBottom of a full-screen layout. Android's system bar (TAB_BAR.legacy = 'native')
 * sits below the content, so there it is just `gap`.
 */
export function useTabBarInset(gap = 8) {
  const insets = useSafeAreaInsets();
  if (USE_NATIVE_TABS && Platform.OS === 'android') return gap;
  // The system bar has no height API; it sits in the same spot as the fallback pill.
  return GLASS_BAR_HEIGHT + Math.max(insets.bottom, 12) + gap;
}
