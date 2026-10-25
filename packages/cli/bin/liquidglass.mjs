/**
 * Pure helpers for the liquidglass-tab template (no I/O): which Expo Router API shape to write for
 * the installed SDK, starter-app detection, and tabs.ts generation for an existing app.
 */

import { CliError } from './lib.mjs';

// ---------------------------------------------------------------------------
// Expo SDK → API shape
// ---------------------------------------------------------------------------

/** Newest SDK this CLI knows the API of; also assumed when neither expo nor expo-router is installed. */
export const LATEST_KNOWN_SDK = 58;
export const MIN_SDK = 54;

/** "~6.0.24", "^54.0.0", "6.0.24", "54" → [6, 0, 24]; "latest", "*", "file:…" → null. */
export function parseVersion(spec) {
  const m = /^(?:[\^~]|>=?|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(spec ?? '').trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** expo-router majors before it switched to SDK numbering (55.x = SDK 55). */
const ROUTER_TO_SDK = { 6: 54, 5: 53, 4: 52, 3: 50, 2: 49 };

/**
 * What to write for an installed expo / expo-router (versions or package.json ranges):
 *   SDK 54     NativeTabs + standalone Icon/Label/Badge/VectorIcon; Tabs from 'expo-router'
 *   SDK 55     NativeTabs.Trigger.*; Tabs from 'expo-router'
 *   SDK 56–57  NativeTabs.Trigger.*; Tabs from 'expo-router/js-tabs'; themes from 'expo-router'
 *   SDK 58+    as 56–57, NativeTabs from 'expo-router/native-tabs'
 */
export function routerTarget({ router, expo } = {}) {
  const r = parseVersion(router);
  const e = parseVersion(expo);
  let sdk = null;
  let source = null;
  if (r) {
    sdk = r[0] >= 50 ? r[0] : (ROUTER_TO_SDK[r[0]] ?? (r[0] < 2 ? 48 : null));
    source = `expo-router ${r.join('.')}`;
  }
  if (sdk === null && e) {
    sdk = e[0];
    source = `expo ${e.join('.')}`;
  }
  const assumed = sdk === null;
  if (assumed) sdk = LATEST_KNOWN_SDK;
  if (sdk < MIN_SDK) return { sdk, source, unsupported: true };
  const legacyNav = sdk <= 55;
  return {
    sdk,
    source: source ?? `assumed SDK ${sdk}`,
    assumed,
    icons: sdk === 54 ? 'standalone' : 'trigger',
    nativeTabs: sdk >= 58 ? 'expo-router/native-tabs' : 'expo-router/unstable-native-tabs',
    tabs: legacyNav ? 'expo-router' : 'expo-router/js-tabs',
    tabBarProps: legacyNav ? '@react-navigation/bottom-tabs' : 'expo-router/js-tabs',
    themes: legacyNav ? '@react-navigation/native' : 'expo-router',
    /** Imported directly on SDK 54–55 (expo-router depends on them; strict installers need them listed). */
    deps: legacyNav ? ['@react-navigation/bottom-tabs', '@react-navigation/native'] : [],
  };
}

function replaceOnce(text, re, replacement, what) {
  if (!re.test(text)) throw new CliError(`liquidglass-tab template changed shape (${what}) — update the CLI: npx @expokit/cli@latest`);
  return text.replace(re, replacement);
}

/** Registry `src/`-relative paths in comments ("src/app/(tabs)", "src/lib/tabs.ts") → the project's folders. */
export function localizePaths(text, paths = {}) {
  const map = { app: paths.app, components: paths.components, lib: paths.lib };
  return text.replace(/\bsrc\/(app|components|lib)\//g, (all, folder) => (map[folder] ? `${map[folder].replace(/\/+$/, '')}/` : all));
}

/** A template file rewritten for `target` (from routerTarget). Files without SDK-specific imports come back unchanged. */
export function adaptLiquidGlassFile(rel, text, target) {
  if (rel === 'components/LiquidGlassTabs.tsx') {
    const standalone = target.icons === 'standalone';
    const header =
      `// Expo SDK ${target.sdk}${standalone ? ': standalone Icon / Label / Badge / VectorIcon (NativeTabs.Trigger.* is SDK 55+)' : ''}.\n` +
      `// After upgrading Expo, run \`npx @expokit/cli@latest update\` to get the matching imports.\n` +
      `import { Tabs } from '${target.tabs}';\n` +
      (standalone
        ? `import { Badge, Icon, Label, NativeTabs, VectorIcon } from '${target.nativeTabs}';\n`
        : `import { NativeTabs } from '${target.nativeTabs}';\n`);
    let out = replaceOnce(
      text,
      /\/\/ Written for your Expo SDK[^\n]*\n\/\/[^\n]*\nimport \{ Tabs \} from 'expo-router\/js-tabs';\nimport \{ NativeTabs \} from 'expo-router\/unstable-native-tabs';\n/,
      header,
      'LiquidGlassTabs imports'
    );
    if (standalone) out = out.replace(/\bNativeTabs\.Trigger\.(Icon|Label|Badge|VectorIcon)\b/g, '$1');
    return out;
  }
  if (rel === 'components/GlassTabBar.tsx') {
    return replaceOnce(
      text,
      /\/\/ '@react-navigation\/bottom-tabs' on SDK[^\n]*\nimport type \{ BottomTabBarProps \} from 'expo-router\/js-tabs';\n/,
      `import type { BottomTabBarProps } from '${target.tabBarProps}';\n`,
      'GlassTabBar imports'
    );
  }
  if (rel === 'app/_layout.tsx') {
    const imports =
      target.themes === 'expo-router'
        ? "// SDK 56+: navigation themes come from expo-router itself. Using @react-navigation/native's\n" +
          '// ThemeProvider here does nothing (expo-router ships its own copy) and causes a white flash.\n' +
          "import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';\n"
        : "import { Slot } from 'expo-router';\n" +
          `// SDK ${target.sdk}: navigation themes come from React Navigation (expo-router re-exports them from SDK 56).\n` +
          "import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';\n";
    return replaceOnce(
      text,
      /\/\/ Navigation themes:[^\n]*\n\/\/[^\n]*\nimport \{ DarkTheme, DefaultTheme, Slot, ThemeProvider \} from 'expo-router';\n/,
      imports,
      'root layout imports'
    );
  }
  return text;
}

// ---------------------------------------------------------------------------
// Existing apps: routes → tabs.ts
// ---------------------------------------------------------------------------

const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/;
const PLATFORM_EXT = /\.(ios|android|web|native)$/;

/**
 * Tab names of a navigator from the entries of its folder (`{ name, dir }`): route files minus
 * platform suffixes, and sub-folders. Skips layouts, `+not-found`-style special files and `_`/`.` names.
 */
export function routeNamesFromEntries(entries) {
  const names = [];
  for (const { name, dir } of entries) {
    if (name.startsWith('.') || name.startsWith('_') || name.startsWith('+')) continue;
    let route;
    if (dir) route = name;
    else {
      if (!ROUTE_EXT.test(name) || name.endsWith('.d.ts')) continue;
      route = name.replace(ROUTE_EXT, '').replace(PLATFORM_EXT, '');
    }
    if (!names.includes(route)) names.push(route);
  }
  return names;
}

/** "index" → "Home", "my-cards" → "My cards", "[id]" → "Id". */
export function tabTitle(name) {
  if (name === 'index') return 'Home';
  const words = String(name).replace(/[[\]().]/g, ' ').split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return String(name);
  const text = words.join(' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Tab order and titles from an existing layout: `<Tabs.Screen name="x" options={{ title: 'X' }}>` or
 * `<NativeTabs.Trigger name="x"><…Label>X</…Label>`. Best effort — unknown shapes give [].
 */
export function readTabsFromLayout(text) {
  const src = String(text ?? '');
  const re = /<(Tabs\.Screen|NativeTabs\.Trigger)\b[^>]*?\bname=["'{]+([^"'}]+)["'}]+/g;
  const hits = [...src.matchAll(re)];
  return hits.map((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : src.length;
    const block = src.slice(m.index, end);
    const title =
      /\btitle:\s*["']([^"']+)["']/.exec(block)?.[1] ??
      /<(?:NativeTabs\.Trigger\.)?Label\b[^>]*>\s*([^<{]+?)\s*<\//.exec(block)?.[1] ??
      null;
    return { name: m[2], title };
  });
}

/** [match words, SF Symbol default/selected, Ionicons default/selected] — a sensible icon per common tab name. */
const ICON_GUESSES = [
  [['index', 'home', 'feed'], 'house', 'house.fill', 'home-outline', 'home'],
  [['explore', 'discover', 'browse'], 'safari', 'safari.fill', 'compass-outline', 'compass'],
  [['search', 'find'], 'magnifyingglass', 'magnifyingglass', 'search-outline', 'search'],
  [['profile', 'account', 'me', 'you', 'user'], 'person.crop.circle', 'person.crop.circle.fill', 'person-circle-outline', 'person-circle'],
  [['settings', 'preferences'], 'gearshape', 'gearshape.fill', 'settings-outline', 'settings'],
  [['alerts', 'notifications', 'activity'], 'bell', 'bell.fill', 'notifications-outline', 'notifications'],
  [['messages', 'chat', 'chats', 'inbox'], 'bubble.left.and.bubble.right', 'bubble.left.and.bubble.right.fill', 'chatbubbles-outline', 'chatbubbles'],
  [['cart', 'bag', 'shop', 'store', 'orders'], 'bag', 'bag.fill', 'bag-outline', 'bag'],
  [['favorites', 'favourites', 'likes', 'saved'], 'heart', 'heart.fill', 'heart-outline', 'heart'],
  [['cards', 'wallet', 'pay', 'payments'], 'creditcard', 'creditcard.fill', 'card-outline', 'card'],
  [['calendar', 'schedule', 'events'], 'calendar', 'calendar', 'calendar-outline', 'calendar'],
  [['library', 'books'], 'books.vertical', 'books.vertical.fill', 'library-outline', 'library'],
];

export function guessTabIcon(name) {
  const key = String(name).toLowerCase().replace(/[^a-z]/g, '');
  const hit = ICON_GUESSES.find(([words]) => words.includes(key)) ?? ICON_GUESSES.find(([words]) => words.some((w) => key.includes(w)));
  const [, sf, sfSelected, ion, ionSelected] = hit ?? [null, 'circle', 'circle.fill', 'ellipse-outline', 'ellipse'];
  return { sf, sfSelected, ion, ionSelected };
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** One TABS entry (same layout as the template's, so parseTabNamesFromConfig reads it back). */
export function tabEntrySource({ name, title }) {
  const icon = guessTabIcon(name);
  const sf = icon.sf === icon.sfSelected ? q(icon.sf) : `{ default: ${q(icon.sf)}, selected: ${q(icon.sfSelected)} }`;
  const lines = [
    '  {',
    `    name: ${q(name)},`,
    `    title: ${q(title ?? tabTitle(name))},`,
    ...(/^\[.*\]$/.test(name) ? ['    hidden: true,'] : []),
    `    sf: ${sf},`,
    `    icon: { set: 'Ionicons', name: ${q(icon.ion)}, selected: ${q(icon.ionSelected)} },`,
    '  },',
  ];
  return lines.join('\n');
}

/**
 * Tabs for an existing app: its route names, ordered and titled like its current layout when that
 * layout names them, `index` first otherwise.
 */
export function tabsFromRoutes(routes, layoutTabs = []) {
  const known = layoutTabs.filter((t) => routes.includes(t.name));
  const rest = routes.filter((r) => !known.some((t) => t.name === r)).sort((a, b) => (a === 'index' ? -1 : b === 'index' ? 1 : a.localeCompare(b)));
  return [...known.map((t) => ({ name: t.name, title: t.title ?? tabTitle(t.name) })), ...rest.map((name) => ({ name, title: tabTitle(name) }))];
}

/** The template's tabs.ts with its TABS list replaced by `tabs`. */
export function replaceTabsList(tabsTs, tabs) {
  const body = tabs.map(tabEntrySource).join('\n');
  return replaceOnce(tabsTs, /export const TABS: TabItem\[\] = \[[\s\S]*?\n\];/, `export const TABS: TabItem[] = [\n${body}\n];`, 'tabs.ts TABS');
}

// ---------------------------------------------------------------------------
// create-expo-app starters (safe to replace: nothing of the user's in them yet)
// ---------------------------------------------------------------------------

/** SDK 54 starter app/(tabs)/_layout.tsx: JS Tabs with HapticTab + IconSymbol. */
export function isStarterTabsLayout(text) {
  const s = String(text ?? '');
  return /from ['"]@\/components\/haptic-?tab['"]/i.test(s) && /IconSymbol/.test(s) && !/Redirect|useAuth|useSession/.test(s);
}

/** SDK 55+ starter components/app-tabs(.web).tsx: the starter's two tabs (index, explore). */
export function isStarterAppTabs(text) {
  const s = String(text ?? '');
  if (/Redirect|useAuth|useSession/.test(s)) return false;
  const native = /tabIcons\/home\.png/.test(s) && /tabIcons\/explore\.png/.test(s);
  const web = /from ['"]expo-router\/ui['"]/.test(s) && /TabList/.test(s) && /href=["']\/explore["']/.test(s);
  return native || web;
}

/** create-expo-app root layouts (SDK 54: Stack anchored on (tabs) + modal; SDK 55+: AnimatedSplashOverlay + AppTabs). */
export function isStarterRootLayout(text) {
  const s = String(text ?? '');
  const sdk54 = /anchor:\s*['"]\(tabs\)['"]/.test(s) && /name=["']modal["']/.test(s);
  const sdk55 = /AnimatedSplashOverlay/.test(s) && /AppTabs/.test(s);
  const providers = [...s.matchAll(/<(\w+Provider)\b/g)].map((m) => m[1]).filter((p) => p !== 'ThemeProvider');
  return (sdk54 || sdk55) && !providers.length && !/Redirect/.test(s);
}

/** Files the template ships that a later `update` may refresh: anything that names its building blocks. */
export function isLiquidGlassSource(text) {
  return /\b(USE_NATIVE_TABS|LiquidGlassTabs|GlassTabBar|TabScreenFromConfig|tabBarCollapse|asFamily|TAB_BAR)\b/.test(String(text ?? ''));
}

// ---------------------------------------------------------------------------
// package.json diff (what `npx expo install` changed)
// ---------------------------------------------------------------------------

/** `{ added: [[name, version]], changed: [[name, from, to]] }` between two package.json objects. */
export function diffDependencies(before = {}, after = {}) {
  const all = (pkg) => ({ ...pkg?.devDependencies, ...pkg?.dependencies });
  const a = all(before);
  const b = all(after);
  const added = [];
  const changed = [];
  for (const [name, version] of Object.entries(b)) {
    if (!(name in a)) added.push([name, version]);
    else if (a[name] !== version) changed.push([name, a[name], version]);
  }
  return { added, changed };
}
