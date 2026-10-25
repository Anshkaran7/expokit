import AntDesign from '@expo/vector-icons/AntDesign';
import Entypo from '@expo/vector-icons/Entypo';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Octicons from '@expo/vector-icons/Octicons';
import {
  createIconSet,
  createIconSetFromIcoMoon,
} from '@expo/vector-icons';
import type { ColorValue, ImageSourcePropType } from 'react-native';

/**
 * Native UITabBar can only show icon fonts or PNG/WebP — not SVG React components.
 *
 * Preset sets (no import needed): Ionicons, Feather, FontAwesome, …
 * Custom font: iconFont() / icoMoon()
 * Custom module: library + icon on TabItem
 * PNG: src on TabItem — SVG kits (Hugeicons, Lucide, Tabler) → PNGs with
 *   npx @expokit/cli@latest icons --from hugeicons --names Home01Icon --out assets/tab-icons
 */

export type IconSetName =
  | 'Ionicons'
  | 'Feather'
  | 'FontAwesome'
  | 'FontAwesome5'
  | 'MaterialCommunityIcons'
  | 'MaterialIcons'
  | 'AntDesign'
  | 'Entypo'
  | 'Octicons';

export const ICON_SETS: Record<IconSetName, unknown> = {
  Ionicons,
  Feather,
  FontAwesome,
  FontAwesome5,
  MaterialCommunityIcons,
  MaterialIcons,
  AntDesign,
  Entypo,
  Octicons,
};

export interface TabIconPreset {
  set: IconSetName;
  name: string;
  selected?: string;
}

export type VectorIconFamily = {
  getImageSource: (
    name: string,
    size: number,
    color: ColorValue
  ) => Promise<ImageSourcePropType | null>;
};

export function asFamily(mod: unknown): VectorIconFamily {
  if (mod == null) {
    throw new Error('[expo-kit] Missing icon library. Set `icon.set` or `library` on the tab.');
  }

  const pack = mod as {
    getImageSource?: VectorIconFamily['getImageSource'];
    getImageSourceSync?: (
      name: string,
      size: number,
      color: ColorValue
    ) => ImageSourcePropType | null;
  };

  if (typeof pack.getImageSource === 'function') {
    return { getImageSource: pack.getImageSource.bind(pack) };
  }

  if (typeof pack.getImageSourceSync === 'function') {
    return {
      getImageSource: async (name, size, color) =>
        pack.getImageSourceSync!(name, size, color),
    };
  }

  throw new Error(
    '[expo-kit] This icon package has no getImageSource — SVG kits (Hugeicons, Lucide, Tabler) can not be drawn by the native tab bar.\n' +
      'Render them to PNGs and use `src` on the tab:\n' +
      '  npx @expokit/cli@latest icons --from hugeicons --names Home01Icon,Search01Icon --out assets/tab-icons\n' +
      'Or use an icon.set preset, iconFont() or icoMoon().'
  );
}

export function resolveIconLibrary(tab: {
  icon?: TabIconPreset;
  library?: unknown;
}): unknown | undefined {
  if (tab.library) return tab.library;
  if (tab.icon?.set) return ICON_SETS[tab.icon.set];
  return undefined;
}

export function resolveIconNames(tab: {
  icon?: TabIconPreset;
  iconName?: string;
  iconSelected?: string;
}): { name?: string; selected?: string } {
  if (tab.icon?.name) {
    return { name: tab.icon.name, selected: tab.icon.selected };
  }
  if (tab.iconName) {
    return { name: tab.iconName, selected: tab.iconSelected };
  }
  return {};
}

export function iconFont(
  glyphMap: Record<string, number | string>,
  fontFamily: string,
  fontAsset: number | string
): VectorIconFamily {
  return asFamily(createIconSet(glyphMap, fontFamily, fontAsset));
}

export function icoMoon(
  selectionJson: unknown,
  fontFamily: string,
  fontAsset: number | string
): VectorIconFamily {
  return asFamily(createIconSetFromIcoMoon(selectionJson, fontFamily, fontAsset));
}
