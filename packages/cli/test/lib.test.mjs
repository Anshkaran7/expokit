import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
  CliError,
  RETRY_MAX_WAIT_MS,
  addTsconfigPathAlias,
  aliasRootFromTsconfig,
  aliasTargetForDir,
  caseClash,
  looksLikeKitFile,
  missingPackages,
  rewriteKitImports,
  suggestItemNames,
  canSendToken,
  envWithoutToken,
  isInsideDir,
  isSafePackageSpec,
  isSafeTabName,
  isValidItemName,
  kitVersion,
  mergeDependencies,
  telemetryEnabled,
  needsDevBuild,
  parseRetryAfter,
  pickMainExport,
  parseJsonc,
  parseSiteUrl,
  retryDelayMs,
  retryHint,
  tabComponentName,
  contentHash,
  fileStatus,
  kitThemeSource,
  normalizeInstalled,
  recordedHash,
  themeOptions,
  unifiedDiff,
} from '../bin/lib.mjs';
import { handleLine } from '../bin/mcp.mjs';

export const STOCK_EXPO_TSCONFIG = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
`;

const OLD_EXPO_TSCONFIG = `{
  // Expo base config
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true, /* keep strict */
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
}
`;

test('parseJsonc: comments and trailing commas outside strings', () => {
  const src = `{
    // line comment
    "a": 1, /* block */
    "b": [1, 2, 3,],
    /* multi
       line */
    "c": { "d": true, },
  }`;
  assert.deepEqual(parseJsonc(src), { a: 1, b: [1, 2, 3], c: { d: true } });
});

test('parseJsonc: glob-like strings are not treated as comments', () => {
  const src = '{ "paths": { "@/*": ["./src/*"] }, "include": ["**/*.ts", "a//b", "x/*y*/z"] }';
  assert.deepEqual(parseJsonc(src), {
    paths: { '@/*': ['./src/*'] },
    include: ['**/*.ts', 'a//b', 'x/*y*/z'],
  });
});

test('parseJsonc: escaped quotes and backslashes inside strings', () => {
  const src = String.raw`{ "q": "say \"hi\" // not a comment", "bs": "C:\\dir\\", "t": ",}" , }`;
  assert.deepEqual(parseJsonc(src), { q: 'say "hi" // not a comment', bs: 'C:\\dir\\', t: ',}' });
});

test('parseJsonc: BOM and invalid input', () => {
  assert.deepEqual(parseJsonc('\uFEFF{"a":1}'), { a: 1 });
  assert.throws(() => parseJsonc('{ "a": }'), SyntaxError);
});

test('stock Expo tsconfig parses and is left untouched (alias already present)', () => {
  const parsed = parseJsonc(STOCK_EXPO_TSCONFIG);
  assert.deepEqual(parsed.compilerOptions.paths['@/*'], ['./*']);
  assert.deepEqual(parsed.include[0], '**/*.ts');
  const res = addTsconfigPathAlias(STOCK_EXPO_TSCONFIG, '@/*', ['./src/*']);
  assert.equal(res.changed, false);
  assert.equal(res.text, STOCK_EXPO_TSCONFIG);
});

test('alias added with a minimal edit that keeps comments', () => {
  const res = addTsconfigPathAlias(OLD_EXPO_TSCONFIG, '@/*', ['./src/*']);
  assert.equal(res.changed, true);
  assert.equal(res.method, 'minimal');
  assert.equal(res.commentsLost, false);
  assert.match(res.text, /\/\/ Expo base config/);
  assert.match(res.text, /\/\* keep strict \*\//);
  const out = parseJsonc(res.text);
  assert.deepEqual(out.compilerOptions, { paths: { '@/*': ['./src/*'] }, strict: true });
  assert.equal(out.extends, 'expo/tsconfig.base');
  assert.deepEqual(out.include, ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts']);
});

test('alias added into existing paths / missing compilerOptions / empty objects', () => {
  const withPaths = '{\n  "compilerOptions": {\n    "paths": {\n      "~/*": ["./x/*"]\n    }\n  }\n}\n';
  let out = parseJsonc(addTsconfigPathAlias(withPaths, '@/*', ['./*']).text);
  assert.deepEqual(out.compilerOptions.paths, { '@/*': ['./*'], '~/*': ['./x/*'] });

  out = parseJsonc(addTsconfigPathAlias('{ "extends": "expo/tsconfig.base" }', '@/*', ['./*']).text);
  assert.deepEqual(out, { compilerOptions: { paths: { '@/*': ['./*'] } }, extends: 'expo/tsconfig.base' });

  out = parseJsonc(addTsconfigPathAlias('{}', '@/*', ['./*']).text);
  assert.deepEqual(out, { compilerOptions: { paths: { '@/*': ['./*'] } } });

  out = parseJsonc(addTsconfigPathAlias('{"compilerOptions":{"paths":{}}}', '@/*', ['./*']).text);
  assert.deepEqual(out, { compilerOptions: { paths: { '@/*': ['./*'] } } });
});

test('alias edit falls back to a rewrite when paths is not an object', () => {
  const res = addTsconfigPathAlias('{ "compilerOptions": { "paths": null } // c\n}', '@/*', ['./*']);
  assert.equal(res.method, 'rewrite');
  assert.equal(res.commentsLost, true);
  assert.deepEqual(JSON.parse(res.text), { compilerOptions: { paths: { '@/*': ['./*'] } } });
});

test('alias edit throws on invalid tsconfig', () => {
  assert.throws(() => addTsconfigPathAlias('{ "a": ', '@/*', ['./*']));
  assert.throws(() => addTsconfigPathAlias('[]', '@/*', ['./*']));
});

test('tabComponentName: PascalCase, valid identifiers', () => {
  assert.equal(tabComponentName('index'), 'HomeScreen');
  assert.equal(tabComponentName('explore'), 'ExploreScreen');
  assert.equal(tabComponentName('my-tab'), 'MyTabScreen');
  assert.equal(tabComponentName('my_tab two'), 'MyTabTwoScreen');
  assert.equal(tabComponentName('2fa'), 'Tab2faScreen');
  assert.equal(tabComponentName('---'), 'TabScreen');
  for (const n of ['my-tab', '2fa', 'a.b', '(x)']) assert.match(tabComponentName(n), /^[A-Z][A-Za-z0-9]*$/);
});

test('parseSiteUrl: https anywhere, http only on loopback', () => {
  assert.equal(parseSiteUrl('https://expokit.in').host, 'expokit.in');
  assert.equal(parseSiteUrl('http://localhost:3000').port, '3000');
  assert.equal(parseSiteUrl('http://127.0.0.1:9').hostname, '127.0.0.1');
  assert.throws(() => parseSiteUrl('http://evil.example'), CliError);
  assert.throws(() => parseSiteUrl('http://localhost.evil.example'), CliError);
  assert.throws(() => parseSiteUrl('ftp://localhost'), CliError);
  assert.throws(() => parseSiteUrl('not a url'), CliError);
});

test('canSendToken: only the credentials origin or the default site', () => {
  const def = 'https://expokit.in';
  assert.equal(canSendToken({ siteUrl: def, credsUrl: def }), true);
  assert.equal(canSendToken({ siteUrl: def, credsUrl: undefined }), true);
  assert.equal(canSendToken({ siteUrl: 'https://evil.example', credsUrl: def }), false);
  assert.equal(canSendToken({ siteUrl: 'https://expokit.in.evil.example', credsUrl: def }), false);
  assert.equal(canSendToken({ siteUrl: 'http://localhost:3000', credsUrl: 'http://localhost:3000' }), true);
  assert.equal(canSendToken({ siteUrl: 'http://localhost:3000/', credsUrl: 'http://localhost:3000' }), true);
  assert.equal(canSendToken({ siteUrl: 'http://localhost:4000', credsUrl: 'http://localhost:3000' }), false);
  assert.equal(canSendToken({ siteUrl: 'https://staging.example', credsUrl: undefined }), false);
  // EXPO_KIT_TOKEN: default site or loopback only
  assert.equal(canSendToken({ siteUrl: def, fromEnv: true }), true);
  assert.equal(canSendToken({ siteUrl: 'http://127.0.0.1:3000', fromEnv: true }), true);
  assert.equal(canSendToken({ siteUrl: 'https://evil.example', fromEnv: true }), false);
});

test('item names and npm package specs are validated', () => {
  assert.equal(isValidItemName('shimmer-button'), true);
  assert.equal(isValidItemName('../etc/passwd'), false);
  assert.equal(isValidItemName('Button'), false);
  assert.equal(isSafePackageSpec('react-native-svg'), true);
  assert.equal(isSafePackageSpec('@expo/vector-icons'), true);
  assert.equal(isSafePackageSpec('expo-haptics@~14.0.0'), true);
  assert.equal(isSafePackageSpec('foo && rm -rf /'), false);
  assert.equal(isSafePackageSpec('--registry=evil'), false);
  assert.equal(isSafePackageSpec('expo-haptics@^2'), true);
  assert.equal(isSafePackageSpec('foo@1|calc'), false);
  assert.equal(isSafePackageSpec('a@1>out.txt'), false);
  assert.equal(isSafePackageSpec('a@>=1'), false);
  assert.deepEqual(mergeDependencies(['a', 'b'], undefined, ['b', 'c']), ['a', 'b', 'c']);
});

test('kitVersion: marker, pre-marker kit files, other files', () => {
  assert.equal(kitVersion("export const KIT_VERSION = 2;\nexport function KitProvider() {}"), 2);
  assert.equal(kitVersion('export function KitProvider({ children }) {}'), 1);
  assert.equal(kitVersion('export function Button() {}'), null);
});

test('needsDevBuild: Expo Go packages pass, anything else is listed', () => {
  assert.deepEqual(needsDevBuild(['react-native-svg', 'expo-haptics', '@shopify/react-native-skia']), []);
  assert.deepEqual(needsDevBuild([]), []);
  assert.deepEqual(needsDevBuild(undefined), []);
  assert.deepEqual(needsDevBuild(['react-native-svg', 'react-native-mmkv']), ['react-native-mmkv']);
  assert.deepEqual(needsDevBuild(['react-native-reanimated@~4.7.1', '@scope/native-thing@1.0.0']), ['@scope/native-thing']);
});

test('pickMainExport: the export named like the item, never a CONSTANT', () => {
  const src = 'export const GRAIN_PALETTES = [];\nexport function GrainOverlay() {}\nexport function GrainGradient() {}';
  assert.equal(pickMainExport(src, ['Grain Gradient', 'grain']), 'GrainGradient');
  assert.equal(pickMainExport(src, ['grain']), 'GrainOverlay');
  assert.equal(pickMainExport('export const X_Y = 1;', ['x']), null);
  assert.equal(pickMainExport('export function QrCodeButton() {}', ['QR Code Button', 'qr-code-button']), 'QrCodeButton');
});

test('isInsideDir: components.json paths may not climb out of the project', () => {
  const root = path.resolve('/work/app');
  for (const ok of ['src/lib', 'lib', './src/components', '.', '', 'src/../lib', '/src/lib', 'a/..b', '..lib']) {
    assert.equal(isInsideDir(root, ok), true, ok);
  }
  for (const bad of ['..', '../lib', '../../other/project/lib', 'src/../../x', './../x']) {
    assert.equal(isInsideDir(root, bad), false, bad);
  }
});

test('isSafeTabName: route names only, never a path', () => {
  for (const ok of ['index', 'explore', 'my-tab', 'my_tab', '(home)', '[id]', 'v1.2']) assert.equal(isSafeTabName(ok), true, ok);
  for (const bad of ['../../x', 'a/b', 'a\\b', '..', '.', '', 'a b', 'tab\n', 'x'.repeat(101), undefined, 5]) {
    assert.equal(isSafeTabName(bad), false, String(bad));
  }
});

test('envWithoutToken: drops EXPO_KIT_TOKEN (any case), keeps the rest', () => {
  const env = { PATH: '/bin', HOME: '/h', EXPO_KIT_TOKEN: 'ek_secret', Expo_Kit_Token: 'ek_win', EXPO_KIT_URL: 'https://x' };
  assert.deepEqual(envWithoutToken(env), { PATH: '/bin', HOME: '/h', EXPO_KIT_URL: 'https://x' });
  assert.equal(env.EXPO_KIT_TOKEN, 'ek_secret', 'the original env is not changed');
});

test('Retry-After: seconds or an HTTP date; retry only when the wait fits in 10 s, never sooner than asked', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(parseRetryAfter('30', now), 30);
  assert.equal(parseRetryAfter(' 0 ', now), 0);
  assert.equal(parseRetryAfter('Tue, 20 Oct 2026 12:00:45 GMT', now), 45);
  assert.equal(parseRetryAfter('Tue, 20 Oct 2026 11:00:00 GMT', now), 0, 'a past date means now');
  for (const bad of [null, undefined, '', '-5', '1.5', 'soon']) assert.equal(parseRetryAfter(bad, now), null, String(bad));

  assert.equal(retryDelayMs('2', now), 2000);
  assert.equal(retryDelayMs('10', now), RETRY_MAX_WAIT_MS);
  assert.equal(retryDelayMs('11', now), null, 'longer than the cap: say when, never retry early');
  assert.equal(retryDelayMs('30', now), null);
  assert.equal(retryDelayMs('60', now), null);
  assert.equal(retryDelayMs('86400', now), null);
  assert.equal(retryDelayMs(null, now), 3000, 'no header: a short default wait');
  assert.ok(RETRY_MAX_WAIT_MS <= 10_000);

  assert.equal(retryHint('30', now), 'in 30 s');
  assert.equal(retryHint('0', now), 'in 1 s');
  assert.equal(retryHint('600', now), 'in 10 min');
  assert.equal(retryHint('7200', now), 'in about 2 h');
  assert.equal(retryHint('999999999', now), 'later');
  assert.equal(retryHint(null, now), 'in a minute');
});

test('mcp: malformed lines get an error or no reply, never an exception', () => {
  const ctx = { version: '0.0.0', registryDir: '/nonexistent', catalog: { items: [], docs: new Map(), find: () => null } };
  const line = (obj) => handleLine(typeof obj === 'string' ? obj : JSON.stringify(obj), ctx);
  // No id to answer: nothing is sent back.
  for (const stray of ['5', '"abc"', 'null', 'true', '[5, "x", null, []]', '[]']) assert.equal(line(stray), null, stray);
  assert.equal(line('{').error.code, -32700);
  assert.equal(line({ id: 1 }).error.code, -32600);
  assert.equal(line({ jsonrpc: '2.0', id: 2, method: 7 }).error.code, -32600);
  // params: null / an array is treated as no params.
  assert.equal(line({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: null }).error.code, -32602);
  assert.equal(line({ jsonrpc: '2.0', id: 4, method: 'initialize', params: null }).result.serverInfo.name, 'expokit');
  assert.equal(line({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: [1] }).error.code, -32602);
  const list = line({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_items', arguments: null } });
  assert.match(list.result.content[0].text, /No items/);
  // A batch answers its valid requests and skips the junk.
  assert.deepEqual(line([5, { jsonrpc: '2.0', id: 7, method: 'ping' }]), [{ jsonrpc: '2.0', id: 7, result: {} }]);
  // Anything that still throws becomes an Internal error for that request.
  assert.equal(handleLine(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'initialize' }), null).error.code, -32603);
});

test('telemetryEnabled: on by default, off for DO_NOT_TRACK, EXPO_KIT_TELEMETRY=0 and CI', () => {
  assert.equal(telemetryEnabled({}), true);
  assert.equal(telemetryEnabled({ DO_NOT_TRACK: '' }), true);
  assert.equal(telemetryEnabled({ DO_NOT_TRACK: '0' }), true);
  assert.equal(telemetryEnabled({ DO_NOT_TRACK: '1' }), false);
  assert.equal(telemetryEnabled({ DO_NOT_TRACK: 'true' }), false);
  for (const v of ['0', 'false', 'off', 'no', 'FALSE']) assert.equal(telemetryEnabled({ EXPO_KIT_TELEMETRY: v }), false, v);
  assert.equal(telemetryEnabled({ EXPO_KIT_TELEMETRY: '1' }), true);
  assert.equal(telemetryEnabled({ CI: 'true' }), false);
  assert.equal(telemetryEnabled({ CI: '1' }), false);
  assert.equal(telemetryEnabled({ CI: 'false' }), true);
});

test('needsDevBuild: expo-status-bar and async-storage ship in Expo Go (the app templates use them)', () => {
  assert.deepEqual(needsDevBuild(['expo-status-bar', '@react-native-async-storage/async-storage', 'expo-router']), []);
  assert.deepEqual(needsDevBuild(['react-native-mmkv']), ['react-native-mmkv']);
});

test('pickMainExport: a prefixed export beats the first one (Toast → Toaster)', () => {
  const src = "export function ToastProvider() {}\nexport function Toaster() {}\nexport const toast = 1;";
  assert.equal(pickMainExport(src, ['Toast', 'toast']), 'Toaster');
  assert.equal(pickMainExport(src, ['Other']), 'ToastProvider');
});

test('caseClash: a different-case twin in the folder, never the exact name', () => {
  assert.equal(caseClash(['Skeleton.tsx', 'Card.tsx'], 'skeleton.tsx'), 'Skeleton.tsx');
  assert.equal(caseClash(['skeleton.tsx', 'Skeleton.tsx'], 'skeleton.tsx'), 'Skeleton.tsx');
  assert.equal(caseClash(['skeleton.tsx'], 'skeleton.tsx'), null);
  assert.equal(caseClash([], 'skeleton.tsx'), null);
  assert.equal(caseClash(['UI'], 'ui'), 'UI');
});

test('looksLikeKitFile: kit sources and files built on it, not a user file of the same name', () => {
  assert.equal(looksLikeKitFile("import { useKit } from '@/lib/kit';\nexport function Button() {}"), true);
  assert.equal(looksLikeKitFile('import { useKit } from "@/lib/kit";'), true);
  assert.equal(looksLikeKitFile("import { useKit } from '@/shared/lib/kit';"), true);
  assert.equal(looksLikeKitFile('export const KIT_VERSION = 3;\nexport function KitProvider() {}'), true);
  assert.equal(looksLikeKitFile('export function KitProvider({ children }) { return children; }'), true);
  assert.equal(looksLikeKitFile("import { Pressable } from 'react-native';\nexport function Button() {}"), false);
  assert.equal(looksLikeKitFile("import { theme } from '@/lib/kitchen';"), false);
  assert.equal(looksLikeKitFile(''), false);
});

test('missingPackages: skips what package.json already lists (dependencies or devDependencies)', () => {
  const pkg = { dependencies: { 'react-native-svg': '15.0.0' }, devDependencies: { 'expo-haptics': '~14.0.0' } };
  assert.deepEqual(missingPackages(['react-native-svg', 'expo-haptics', 'expo-blur'], pkg), ['expo-blur']);
  assert.deepEqual(missingPackages(['react-native-svg@15.1.0', '@shopify/react-native-skia@2'], pkg), ['@shopify/react-native-skia@2']);
  assert.deepEqual(missingPackages(['expo-blur', 'expo-blur'], {}), ['expo-blur']);
  assert.deepEqual(missingPackages(['expo-blur'], null), ['expo-blur']);
  // An inherited key (`__proto__`, `toString`) is not an installed package.
  assert.deepEqual(missingPackages(['constructor'], { dependencies: {} }), ['constructor']);
});

test('suggestItemNames: typos, word order and partial names, closest first', () => {
  const names = ['button', 'button-3d', 'bottom-sheet', 'grain', 'skeleton', 'toast', 'glass-tab-bar'];
  assert.deepEqual(suggestItemNames('buton', names).slice(0, 1), ['button']);
  assert.deepEqual(suggestItemNames('sheet-bottom', names).slice(0, 1), ['bottom-sheet']);
  assert.deepEqual(suggestItemNames('skeletn', names), ['skeleton']);
  assert.ok(suggestItemNames('grain-gradient', names).includes('grain'));
  assert.ok(suggestItemNames('glass-tabbar', names).includes('glass-tab-bar'));
  assert.deepEqual(suggestItemNames('zzzzzz', names), []);
  assert.ok(suggestItemNames('b', names).length <= 3);
});

test('rewriteKitImports: moves @/components and @/lib imports to the configured aliases', () => {
  const src = [
    "import { useKit } from '@/lib/kit';",
    'import { Button } from "@/components/ui/button";',
    "export { x } from '@/components/ui/x';",
    "const lazy = import('@/components/ui/sheet');",
    "import { other } from '@/components-extra/y';",
    "import { glass } from '@/lib/kitchen';",
  ].join('\n');
  const out = rewriteKitImports(src, { components: '@/components/kit', lib: '@/lib' });
  assert.match(out, /from '@\/lib\/kit'/);
  assert.match(out, /from "@\/components\/kit\/ui\/button"/);
  assert.match(out, /from '@\/components\/kit\/ui\/x'/);
  assert.match(out, /import\('@\/components\/kit\/ui\/sheet'\)/);
  assert.match(out, /'@\/components-extra\/y'/);
  assert.match(out, /'@\/lib\/kitchen'/);
  assert.equal(rewriteKitImports(src, { components: '@/components', lib: '@/lib' }), src);
  assert.equal(rewriteKitImports(src, {}), src);
});

test('aliasRootFromTsconfig + aliasTargetForDir: --dir must stay reachable through @/', () => {
  assert.equal(aliasRootFromTsconfig({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }), 'src');
  assert.equal(aliasRootFromTsconfig({ compilerOptions: { paths: { '@/*': ['./*'] } } }), '');
  assert.equal(aliasRootFromTsconfig({ compilerOptions: { paths: { '@/*': ['src/*'] } } }), 'src');
  assert.equal(aliasRootFromTsconfig({ compilerOptions: { baseUrl: 'app', paths: { '@/*': ['./src/*'] } } }), 'app/src');
  assert.equal(aliasRootFromTsconfig({}), null);
  assert.equal(aliasRootFromTsconfig(null), null);

  assert.equal(aliasTargetForDir('src/components/kit', 'src'), '@/components/kit');
  assert.equal(aliasTargetForDir('./components/kit/', ''), '@/components/kit');
  assert.equal(aliasTargetForDir('components\\kit', ''), '@/components/kit');
  assert.equal(aliasTargetForDir('lib/kit', 'src'), null); // outside src/: @/ can't reach it
  assert.equal(aliasTargetForDir('src', 'src'), null); // the alias root itself is not a components folder
  assert.equal(aliasTargetForDir('../elsewhere', ''), null);
  assert.equal(aliasTargetForDir('/abs/path', ''), null);
  assert.equal(aliasTargetForDir('src/comp onents', 'src'), null); // must be a plain folder path
});

// ---------------------------------------------------------------------------
// install records: hashes, statuses, diffs, init theme
// ---------------------------------------------------------------------------

test('contentHash: sha256 hex of the text, CRLF and LF hash the same (git autocrlf)', () => {
  const h = contentHash('a\nb\n');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(contentHash('a\r\nb\r\n'), h);
  assert.notEqual(contentHash('a\nb'), h);
});

test('recordedHash: only a well-formed own entry counts (components.json is untrusted)', () => {
  const good = 'a'.repeat(64);
  const files = JSON.parse(`{"lib/kit.tsx":"${good}","bad":"xyz","upper":"${'A'.repeat(64)}","__proto__":"${good}","n":42}`);
  assert.equal(recordedHash(files, 'lib/kit.tsx'), good);
  assert.equal(recordedHash(files, 'bad'), null);
  assert.equal(recordedHash(files, 'upper'), null);
  assert.equal(recordedHash(files, 'n'), null);
  assert.equal(recordedHash(files, 'toString'), null);
  assert.equal(recordedHash(files, 'missing'), null);
  assert.equal(recordedHash(null, 'lib/kit.tsx'), null);
  assert.equal(recordedHash(['x'], '0'), null);
  assert.equal(recordedHash('str', '0'), null);
});

test('fileStatus: current / pristine (ours, untouched) / modified / untracked', () => {
  const installed = 'v1\n';
  const upstream = 'v2\n';
  assert.equal(fileStatus(contentHash(installed), upstream, upstream), 'current');
  assert.equal(fileStatus(contentHash(installed), installed, upstream), 'pristine');
  assert.equal(fileStatus(contentHash(installed), 'v1 patched\n', upstream), 'modified');
  assert.equal(fileStatus(null, 'v1 patched\n', upstream), 'untracked');
  assert.equal(fileStatus(null, upstream.replace('\n', '\r\n'), upstream), 'current');
});

test('normalizeInstalled: legacy version strings, objects, junk dropped', () => {
  const raw = JSON.parse(
    '{"toast":"0.4.4","skeleton":{"version":"0.5.0","kitVersion":3,"dir":"components/kit"},"__proto__":{"version":"x"},"Bad Name":"1","arr":[1],"num":{"version":5,"kitVersion":"3"}}'
  );
  const out = normalizeInstalled(raw);
  assert.deepEqual(out.toast, { version: '0.4.4' });
  assert.deepEqual(out.skeleton, { version: '0.5.0', kitVersion: 3, dir: 'components/kit' });
  assert.equal(Object.hasOwn(out, 'Bad Name'), false);
  assert.equal(Object.hasOwn(out, 'arr'), false);
  assert.deepEqual(out.num, {});
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(normalizeInstalled('nope'), {});
  assert.deepEqual(normalizeInstalled(['toast']), {});
  assert.deepEqual(normalizeInstalled(undefined), {});
});

test('unifiedDiff: hunks with context, nothing for equal text, big inputs still diff', () => {
  assert.equal(unifiedDiff('a\nb\n', 'a\nb\n'), '');
  const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].join('\n') + '\n';
  const b = a.replace('5\n', 'five\n').replace('10\n', '10\n11\n');
  const d = unifiedDiff(a, b, { from: 'yours', to: 'upstream' });
  assert.match(d, /^--- yours\n\+\+\+ upstream\n/);
  assert.match(d, /@@ -2,9 \+2,10 @@/);
  assert.match(d, /\n-5\n\+five\n/);
  assert.match(d, /\n\+11\n?$/);
  // CRLF vs LF alone is no diff
  assert.equal(unifiedDiff('x\r\ny\r\n', 'x\ny\n'), '');
  // Final-newline-only differences are still reported
  assert.match(unifiedDiff('x', 'x\n'), /newline/);
  // Two far-apart changes make two hunks
  const long = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n') + '\n';
  const two = unifiedDiff(long, long.replace('l2\n', 'L2\n').replace('l35\n', 'L35\n'));
  assert.equal(two.match(/^@@/gm).length, 2);
  // Huge rewrites fall back to a whole-block replace instead of a quadratic table
  const big = Array.from({ length: 5000 }, (_, i) => `a${i}`).join('\n');
  const other = Array.from({ length: 5000 }, (_, i) => `b${i}`).join('\n');
  const bd = unifiedDiff(big, other);
  assert.match(bd, /^-a0$/m);
  assert.match(bd, /^\+b4999$/m);
});

test('themeOptions: brand colour, font, radius, scheme validated (they become code)', () => {
  assert.deepEqual(themeOptions({ brand: '#FF6600', font: 'Inter Tight', radius: '14', scheme: 'dark' }), {
    brand: '#ff6600',
    font: 'Inter Tight',
    radius: 14,
    scheme: 'dark',
  });
  assert.deepEqual(themeOptions({}), { brand: null, font: null, radius: null, scheme: 'system' });
  assert.deepEqual(themeOptions({ brand: 'f60', scheme: 'LIGHT' }), { brand: '#ff6600', font: null, radius: null, scheme: 'light' });
  for (const bad of [{ brand: "#fff'; evil()" }, { brand: 'red' }, { brand: '#ggg' }, { font: 'Inter"}/>' }, { font: 'x'.repeat(65) }, { radius: '-1' }, { radius: '1e3' }, { radius: '99' }, { radius: 'abc' }, { scheme: 'sepia' }]) {
    assert.throws(() => themeOptions(bad), CliError, JSON.stringify(bad));
  }
});

test('kitThemeSource: a KitProvider wrapper with only the chosen props, through the lib alias', () => {
  const src = kitThemeSource({ brand: '#ff6600', font: 'Inter', radius: 14, scheme: 'dark' }, '@/lib');
  assert.match(src, /import \{ KitProvider \} from '@\/lib\/kit';/);
  assert.match(src, /export function AppTheme/);
  assert.match(src, /scheme="dark"/);
  assert.match(src, /accent="#ff6600"/);
  assert.match(src, /radius=\{14\}/);
  assert.match(src, /fontFamily="Inter"/);
  const plain = kitThemeSource({ brand: null, font: null, radius: null, scheme: 'system' }, '~/lib/');
  assert.match(plain, /from '~\/lib\/kit'/);
  assert.doesNotMatch(plain, /accent=|radius=\{|fontFamily=/);
});
