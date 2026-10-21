import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
  CliError,
  RETRY_MAX_WAIT_MS,
  addTsconfigPathAlias,
  canSendToken,
  envWithoutToken,
  isInsideDir,
  isSafePackageSpec,
  isSafeTabName,
  isValidItemName,
  kitVersion,
  mergeDependencies,
  needsDevBuild,
  parseRetryAfter,
  pickMainExport,
  parseJsonc,
  parseSiteUrl,
  retryDelayMs,
  retryHint,
  tabComponentName,
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
