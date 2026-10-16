import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../bin/lib.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'expo-kit.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-kit-test-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME);
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const STOCK_TSCONFIG = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`;

const COMMENTED_TSCONFIG = `{
  // comments + trailing commas, no alias yet
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, },
  "include": ["**/*.ts", "**/*.tsx"],
}
`;

let n = 0;
function makeProject(tsconfig) {
  const dir = path.join(TMP, `app-${(n += 1)}`);
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'app', main: 'expo-router/entry', dependencies: { expo: '~54.0.0' } }, null, 2)
  );
  if (tsconfig !== undefined) fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig);
  return dir;
}

function run(args, cwd, env = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      HOME,
      USERPROFILE: HOME,
      EXPO_KIT_URL: 'http://127.0.0.1:9',
      EXPO_KIT_TOKEN: '',
      NO_COLOR: '1',
      ...env,
    },
  });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

test('--help works', () => {
  const r = run(['--help'], TMP);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /Usage:/);
});

test('add button --dry-run writes nothing and does not crash', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = run(['add', 'button', '--dry-run'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /would write/);
  assert.equal(fs.existsSync(path.join(dir, 'components.json')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'), STOCK_TSCONFIG);
});

test('init on stock Expo tsconfig keeps it byte-identical and valid', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = run(['init'], dir);
  assert.equal(r.status, 0, r.out);
  const ts = fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8');
  assert.equal(ts, STOCK_TSCONFIG);
  JSON.parse(ts);
  assert.ok(fs.existsSync(path.join(dir, 'components.json')));
});

test('init adds the alias to a commented tsconfig without losing comments', () => {
  const dir = makeProject(COMMENTED_TSCONFIG);
  const r = run(['init'], dir);
  assert.equal(r.status, 0, r.out);
  const ts = fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8');
  assert.match(ts, /\/\/ comments \+ trailing commas/);
  const parsed = parseJsonc(ts);
  assert.deepEqual(parsed.compilerOptions.paths['@/*'], ['./*']);
  assert.deepEqual(parsed.include, ['**/*.ts', '**/*.tsx']);
});

test('init with a broken tsconfig fails without writing components.json', () => {
  const dir = makeProject('{ "compilerOptions": { ');
  const r = run(['init'], dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /tsconfig\.json could not be parsed/);
  assert.equal(fs.existsSync(path.join(dir, 'components.json')), false);
});

test('logged-out whoami gives the friendly login message', () => {
  const r = run(['whoami'], TMP);
  assert.equal(r.status, 1);
  assert.match(r.out, /Not logged in/);
  assert.doesNotMatch(r.out, /ENOENT/);
});

test('saved token is not sent to a different site', () => {
  const home = path.join(TMP, 'home-creds');
  fs.mkdirSync(path.join(home, '.expo-kit'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.expo-kit', 'credentials.json'),
    JSON.stringify({ token: 'tok', url: 'https://expokit.karandev.in' })
  );
  const r = run(['whoami'], TMP, { HOME: home, USERPROFILE: home, EXPO_KIT_URL: 'http://localhost:9' });
  assert.equal(r.status, 1);
  assert.match(r.out, /won't be sent to http:\/\/localhost:9/);
});

test('non-https site is rejected before any request', () => {
  const r = run(['login', '--token', 'tok'], TMP, { EXPO_KIT_URL: 'http://evil.example' });
  assert.equal(r.status, 1);
  assert.match(r.out, /must be https/);
});

test('unknown item asks the site and reports a network error (not an auth error)', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = run(['add', 'definitely-not-an-item', '--dry-run'], dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Network error/);
  assert.doesNotMatch(r.out, /not logged in|Unexpected error/i);
});

test('update <non-tab item> warns without downloading', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  assert.equal(run(['init'], dir).status, 0);
  const r = run(['update', 'checkout', '--dry-run'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Smart update only supports liquidglass-tab/);
  assert.doesNotMatch(r.out, /downloading|Network error/);
});
