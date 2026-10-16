import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CliError,
  addTsconfigPathAlias,
  canSendToken,
  isSafePackageSpec,
  isValidItemName,
  kitVersion,
  mergeDependencies,
  parseJsonc,
  parseSiteUrl,
  tabComponentName,
} from '../bin/lib.mjs';

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
  assert.equal(parseSiteUrl('https://expokit.karandev.in').host, 'expokit.karandev.in');
  assert.equal(parseSiteUrl('http://localhost:3000').port, '3000');
  assert.equal(parseSiteUrl('http://127.0.0.1:9').hostname, '127.0.0.1');
  assert.throws(() => parseSiteUrl('http://evil.example'), CliError);
  assert.throws(() => parseSiteUrl('http://localhost.evil.example'), CliError);
  assert.throws(() => parseSiteUrl('ftp://localhost'), CliError);
  assert.throws(() => parseSiteUrl('not a url'), CliError);
});

test('canSendToken: only the credentials origin or the default site', () => {
  const def = 'https://expokit.karandev.in';
  assert.equal(canSendToken({ siteUrl: def, credsUrl: def }), true);
  assert.equal(canSendToken({ siteUrl: def, credsUrl: undefined }), true);
  assert.equal(canSendToken({ siteUrl: 'https://evil.example', credsUrl: def }), false);
  assert.equal(canSendToken({ siteUrl: 'https://expokit.karandev.in.evil.example', credsUrl: def }), false);
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
