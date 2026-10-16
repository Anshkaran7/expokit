import type { ImageSourcePropType } from 'react-native';

import type { TabIconPreset } from '@/lib/tab-icons';

export {
  asFamily,
  ICON_SETS,
  iconFont,
  icoMoon,
  resolveIconLibrary,
  resolveIconNames,
} from '@/lib/tab-icons';
export type { IconSetName, TabIconPreset } from '@/lib/tab-icons';

/**
 * Edit this file only — tabs, labels, icons, colors, and screen copy.
 * Each tab needs a route file: src/app/(tabs)/{name}.tsx (use TabScreenFromConfig).
 *
 * Icons (pick one per tab):
 *   icon: { set: 'Ionicons', name: 'home-outline', selected: 'home' }
 *   library + iconName (any package with getImageSource)
 *   src: require('../assets/icon.png')
 */

export interface TabItem {
  /** Route name — file under (tabs)/ must match (e.g. index, explore) */
  name: string;
  title: string;
  description?: string;
  accent?: string;
  hidden?: boolean;
  hiddenLabel?: boolean;
  badge?: string;
  sf?: string | { default: string; selected: string };
  /** Preset — no import needed */
  icon?: TabIconPreset;
  /** Advanced — any icon-font module or iconFont() / icoMoon() */
  library?: unknown;
  iconName?: string;
  iconSelected?: string;
  src?:
    | ImageSourcePropType
    | { default: ImageSourcePropType; selected: ImageSourcePropType };
}

export const TAB_BAR = {
  /** 'automatic' | 'never' | 'onScrollDown' | 'onScrollUp' — the glass fallback supports all but 'automatic' (treated as onScrollDown). */
  minimizeBehavior: 'onScrollDown' as 'automatic' | 'never' | 'onScrollDown' | 'onScrollUp',
  /**
   * What to show where Liquid Glass is unavailable (iOS 18 and older, Android, web):
   *   'glass'  → floating blur pill that looks and collapses like Liquid Glass (default)
   *   'native' → plain system tab bar (UITabBar / Material bottom navigation)
   */
  legacy: 'glass' as 'glass' | 'native',
  /** 'auto' | 'selected' | 'labeled' | 'unlabeled' */
  labelVisibilityMode: 'labeled' as 'auto' | 'selected' | 'labeled' | 'unlabeled',
  /** null = transparent — only the floating glass pill shows (no solid bar fill). */
  backgroundColor: null as null,
  colors: {
    tint: { light: '#007AFF', dark: '#0A84FF' },
    inactive: { light: 'rgba(60,60,67,0.6)', dark: 'rgba(235,235,245,0.6)' },
  },
  labelStyle: {
    fontSize: 10,
    fontWeight: '400' as const,
    selectedFontWeight: '500' as const,
  },
};

export const TABS: TabItem[] = [
  {
    name: 'index',
    title: 'Home',
    description:
      'Scroll down — the glass tab bar collapses into a circle. Scroll up to expand all tabs again.',
    accent: '#6366f1',
    sf: { default: 'house', selected: 'house.fill' },
    icon: { set: 'Ionicons', name: 'home-outline', selected: 'home' },
  },
  {
    name: 'explore',
    title: 'Explore',
    description: 'Same collapse on this tab — only Explore stays as a glass circle when scrolling.',
    accent: '#8b5cf6',
    sf: { default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' },
    icon: { set: 'MaterialCommunityIcons', name: 'view-grid-outline', selected: 'view-grid' },
  },
  {
    name: 'alerts',
    title: 'Alerts',
    description: 'Every tab minimizes the same way. The active tab remains in the corner.',
    accent: '#0ea5e9',
    sf: { default: 'bell', selected: 'bell.fill' },
    icon: { set: 'Feather', name: 'bell' },
  },
  {
    name: 'profile',
    title: 'You',
    description: 'Change everything in src/lib/tabs.ts — icons, labels, colors, and screen text.',
    accent: '#10b981',
    sf: { default: 'person.circle', selected: 'person.circle.fill' },
    icon: { set: 'FontAwesome', name: 'user-circle-o', selected: 'user-circle' },
  },
];

export function getTab(name: string) {
  return TABS.find((tab) => tab.name === name);
}
