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
    damping: 20,
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

/** Bottom padding a scrolling screen needs so its last row clears the floating bar. */
export function useTabBarInset() {
  const insets = useSafeAreaInsets();
  if (USE_NATIVE_TABS) return 24;
  return GLASS_BAR_HEIGHT + Math.max(insets.bottom, 12) + 24;
}
