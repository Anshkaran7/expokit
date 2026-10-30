import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentHash, parseJsonc } from '../bin/lib.mjs';

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
    JSON.stringify({ token: 'tok', url: 'https://expokit.in' })
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

test('a redirect never carries the token on', async () => {
  const seen = [];
  const listen = (handler) =>
    new Promise((resolve) => {
      const server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
    });
  const elsewhere = await listen((req, res) => {
    seen.push(req.headers.authorization);
    res.end('{}');
  });
  const site = await listen((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${elsewhere.address().port}${req.url}` }).end();
  });
  try {
    const child = spawn(process.execPath, [CLI, 'login', '--token', 'tok'], {
      cwd: TMP,
      env: { ...process.env, HOME, USERPROFILE: HOME, EXPO_KIT_URL: `http://127.0.0.1:${site.address().port}`, NO_COLOR: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const [status] = await once(child, 'close');
    assert.equal(status, 1, out);
    assert.match(out, /answered with a redirect \(HTTP 302/);
    assert.deepEqual(seen, []);
    assert.equal(fs.existsSync(path.join(HOME, '.expo-kit', 'credentials.json')), false);
  } finally {
    site.close();
    elsewhere.close();
  }
});

test('unknown item asks the site and reports a network error (not an auth error)', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = run(['add', 'definitely-not-an-item', '--dry-run'], dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Network error/);
  assert.doesNotMatch(r.out, /not logged in|Unexpected error/i);
});

test('update of a Pro item that is not installed fails without downloading', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  assert.equal(run(['init'], dir).status, 0);
  const r = run(['update', 'checkout', '--dry-run'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /checkout isn't installed here/);
  assert.doesNotMatch(r.out, /downloading|Network error/);
});

/** Runs the CLI against a local fake site that records POST /api/cli/installed bodies. */
async function runAgainstSite(args, cwd, env = {}) {
  const posts = [];
  const site = await new Promise((resolve) => {
    const server = http
      .createServer((req, res) => {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => {
          if (req.method === 'POST' && req.url === '/api/cli/installed') {
            posts.push({ type: req.headers['content-type'], auth: req.headers.authorization, body: JSON.parse(body) });
          }
          res.writeHead(202, { 'content-type': 'application/json' }).end('{"counted":1}');
        });
      })
      .listen(0, '127.0.0.1', () => resolve(server));
  });
  try {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, HOME, USERPROFILE: HOME, EXPO_KIT_URL: `http://127.0.0.1:${site.address().port}`, EXPO_KIT_TOKEN: 'secret-token', NO_COLOR: '1', CI: '', DO_NOT_TRACK: '', EXPO_KIT_TELEMETRY: '', ...env },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const [status] = await once(child, 'close');
    return { status, out, posts };
  } finally {
    site.close();
  }
}

test('add reports only the item name, as JSON, without the token', async () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = await runAgainstSite(['add', 'confetti'], dir);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.posts, [{ type: 'application/json', auth: undefined, body: { items: ['confetti'] } }]);
});

test('no install report for --dry-run, update, DO_NOT_TRACK, EXPO_KIT_TELEMETRY=0 or CI', async () => {
  const dir = makeProject(STOCK_TSCONFIG);
  for (const [args, env] of [
    [['add', 'confetti', '--dry-run'], {}],
    [['add', 'confetti'], { DO_NOT_TRACK: '1' }],
    [['add', 'confetti', '--force'], { EXPO_KIT_TELEMETRY: '0' }],
    [['add', 'confetti', '--force'], { CI: 'true' }],
  ]) {
    const r = await runAgainstSite(args, dir, env);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.posts, [], `${args.join(' ')} ${JSON.stringify(env)}`);
  }
});

test('an unreachable or failing site never breaks add', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const r = run(['add', 'confetti'], dir, { CI: '', DO_NOT_TRACK: '', EXPO_KIT_TELEMETRY: '' });
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /Network error|Unexpected error/);
});

// ---------------------------------------------------------------------------
// add: clashes with the user's files, batches, one install, suggestions, --dir
// ---------------------------------------------------------------------------

/** A project whose package.json already lists what most kit items need, so `add` never runs npx. */
function makeProjectWithDeps(tsconfig = STOCK_TSCONFIG) {
  const dir = makeProject(tsconfig);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.dependencies = {
    ...pkg.dependencies,
    'react-native-svg': '15.15.4',
    'expo-haptics': '~57.0.3',
    'react-native-gesture-handler': '~2.28.0',
    'react-native-reanimated': '~4.1.0',
    'react-native-worklets': '~0.5.0',
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

function writeFile(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

const entries = (dir, rel) => fs.readdirSync(path.join(dir, rel));

test('a different-case file of the user (Skeleton.tsx) is never overwritten, even with --force; the rest of the batch still lands', () => {
  const dir = makeProjectWithDeps();
  const mine = 'export function Skeleton() { return null; }\n';
  writeFile(dir, 'components/ui/Skeleton.tsx', mine);
  const r = run(['add', 'skeleton', 'toast', '--force'], dir);
  assert.equal(r.status, 1, r.out);
  assert.equal(fs.readFileSync(path.join(dir, 'components/ui/Skeleton.tsx'), 'utf8'), mine);
  assert.ok(!entries(dir, 'components/ui').includes('skeleton.tsx'));
  assert.ok(entries(dir, 'components/ui').includes('toast.tsx'));
  // Full paths, the reason, and the ways out.
  assert.match(r.out, /components\/ui\/skeleton\.tsx clashes with your components\/ui\/Skeleton\.tsx/);
  assert.match(r.out, /macOS and Windows/);
  assert.match(r.out, /--dir components\/kit/);
  assert.match(r.out, /✓ toast/);
  assert.match(r.out, /✗ skeleton/);
});

test('a user file of the same name that is not from the kit is a conflict, not a "shared file kept"', () => {
  const dir = makeProjectWithDeps();
  const mine = 'export const kit = { brand: "#f00" };\n';
  writeFile(dir, 'lib/kit.tsx', mine);
  const r = run(['add', 'toast'], dir);
  assert.equal(r.status, 1, r.out);
  assert.doesNotMatch(r.out, /shared file kept/);
  assert.match(r.out, /lib\/kit\.tsx/);
  assert.match(r.out, /isn't an ExpoKit file/);
  assert.equal(fs.readFileSync(path.join(dir, 'lib/kit.tsx'), 'utf8'), mine);
  assert.equal(fs.existsSync(path.join(dir, 'components/ui/toast.tsx')), false);
});

test('a different-case shared file (lib/Kit.tsx) blocks the item, --force included', () => {
  const dir = makeProjectWithDeps();
  const mine = 'export const theme = {};\n';
  writeFile(dir, 'lib/Kit.tsx', mine);
  const r = run(['add', 'toast', '--force'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /lib\/kit\.tsx clashes with your lib\/Kit\.tsx/);
  assert.equal(fs.readFileSync(path.join(dir, 'lib/Kit.tsx'), 'utf8'), mine);
  assert.ok(!entries(dir, 'lib').includes('kit.tsx'));
});

test('an edited kit.tsx is still kept as a shared file', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton'], dir).status, 0);
  fs.appendFileSync(path.join(dir, 'lib/kit.tsx'), '\n// my tweak\n');
  const r = run(['add', 'toast'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /lib\/kit\.tsx \(shared file kept/);
  assert.match(fs.readFileSync(path.join(dir, 'lib/kit.tsx'), 'utf8'), /my tweak/);
});

test('--dir installs components into another folder and points their imports there', () => {
  const dir = makeProjectWithDeps();
  writeFile(dir, 'components/ui/Calendar.tsx', 'export const Calendar = 1;\n');
  const r = run(['add', 'date-picker', '--dir', 'components/kit'], dir);
  assert.equal(r.status, 0, r.out);
  const picker = fs.readFileSync(path.join(dir, 'components/kit/ui/date-picker.tsx'), 'utf8');
  assert.match(picker, /from '@\/components\/kit\/ui\/calendar'/);
  assert.match(picker, /from '@\/lib\/kit'/);
  assert.ok(fs.existsSync(path.join(dir, 'components/kit/ui/calendar.tsx')));
  assert.ok(fs.existsSync(path.join(dir, 'lib/kit.tsx')));
  assert.equal(fs.readFileSync(path.join(dir, 'components/ui/Calendar.tsx'), 'utf8'), 'export const Calendar = 1;\n');
  assert.match(r.out, /from "@\/components\/kit\/ui\/date-picker"/);
  // Re-adding into the same folder sees the files as unchanged (the rewrite is part of the comparison).
  const again = run(['add', 'date-picker', '--dir', 'components/kit'], dir);
  assert.equal(again.status, 0, again.out);
  assert.doesNotMatch(again.out, /overwrite/i);
});

test('--dir must be reachable through @/ and inside the project', () => {
  const dir = makeProjectWithDeps(STOCK_TSCONFIG.replace('"./*"', '"./src/*"'));
  for (const bad of ['components/kit', '../outside', 'src']) {
    const r = run(['add', 'skeleton', '--dir', bad, '--dry-run'], dir);
    assert.equal(r.status, 1, `${bad}: ${r.out}`);
    assert.match(r.out, /--dir/);
  }
  const ok = run(['add', 'skeleton', '--dir', 'src/components/kit', '--dry-run'], dir);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /src\/components\/kit\/ui\/skeleton\.tsx/);
  assert.equal(run(['add', 'skeleton', '--dir'], dir).status, 1);
});

test('aliases from item.json work, and a typo gets "did you mean"', () => {
  const dir = makeProject(STOCK_TSCONFIG);
  const alias = run(['add', 'grain-gradient', '--dry-run'], dir);
  assert.equal(alias.status, 0, alias.out);
  assert.match(alias.out, /Grain Gradient \(grain\)/);
  const typo = run(['add', 'buton', '--dry-run'], dir);
  assert.equal(typo.status, 1, typo.out);
  assert.match(typo.out, /Did you mean: button\?/);
});

test('a failing item does not hide the others: per-item status, exit code 1', () => {
  const dir = makeProjectWithDeps();
  const r = run(['add', 'skeletn', 'skeleton'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /✗ skeletn/);
  assert.match(r.out, /✓ skeleton/);
  assert.ok(fs.existsSync(path.join(dir, 'components/ui/skeleton.tsx')));
});

test('one install for the whole batch, without packages package.json already lists', () => {
  const bare = makeProject(STOCK_TSCONFIG);
  const r = run(['add', 'skeleton', 'toast', 'otp-input', '--dry-run'], bare);
  assert.equal(r.status, 0, r.out);
  const installs = r.out.match(/would run: npx expo install.*/g) ?? [];
  assert.deepEqual(installs, [
    'would run: npx expo install react-native-svg expo-haptics react-native-gesture-handler react-native-reanimated react-native-worklets',
  ]);

  const ready = makeProjectWithDeps();
  const r2 = run(['add', 'skeleton', 'toast', '--dry-run'], ready);
  assert.equal(r2.status, 0, r2.out);
  assert.doesNotMatch(r2.out, /npx expo install/);
  assert.match(r2.out, /already in package\.json: react-native-svg, expo-haptics, react-native-gesture-handler/);
});

test('the project\'s own Prettier formats the files add wrote; --no-format skips it; no Prettier, no run', { skip: process.platform === 'win32' }, () => {
  const dir = makeProjectWithDeps();
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.devDependencies = { prettier: '^3.0.0' };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const calls = path.join(dir, 'prettier-calls.txt');
  writeFile(dir, 'node_modules/.bin/prettier', `#!/bin/sh\necho "$@" >> "${calls}"\n`);
  fs.chmodSync(path.join(dir, 'node_modules/.bin/prettier'), 0o755);

  const r = run(['add', 'skeleton'], dir);
  assert.equal(r.status, 0, r.out);
  const args = fs.readFileSync(calls, 'utf8');
  assert.match(args, /^--write --log-level warn .*components\/ui\/skeleton\.tsx/);
  assert.match(args, /lib\/kit\.tsx/);
  assert.match(r.out, /Formatted 2 file\(s\)/);

  fs.rmSync(calls);
  assert.equal(run(['add', 'toast', '--no-format'], dir).status, 0);
  assert.equal(fs.existsSync(calls), false);

  const plain = makeProjectWithDeps();
  const p = run(['add', 'skeleton'], plain);
  assert.equal(p.status, 0, p.out);
  assert.doesNotMatch(p.out, /Prettier|Formatted/);
});

test('breakit: components.json aliases are code once rewritten into imports — anything but a plain alias is refused', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['init'], dir).status, 0);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'components.json'), 'utf8'));
  for (const bad of ["@/components'; import 'evil", '@/components"\nrequire("x")', '@/comp onents', 42]) {
    fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify({ ...config, aliases: { ...config.aliases, components: bad } }));
    const r = run(['add', 'date-picker'], dir);
    assert.equal(r.status, 1, `${JSON.stringify(bad)}: ${r.out}`);
    assert.match(r.out, /aliases\.components/);
    assert.equal(fs.existsSync(path.join(dir, 'components/ui/date-picker.tsx')), false);
  }
  // A plain custom alias works and is what the imports use.
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify({ ...config, aliases: { ...config.aliases, components: '~/ui-kit' } }));
  const ok = run(['add', 'date-picker'], dir);
  assert.equal(ok.status, 0, ok.out);
  assert.match(fs.readFileSync(path.join(dir, 'components/ui/date-picker.tsx'), 'utf8'), /from '~\/ui-kit\/ui\/calendar'/);
});

test('breakit: a symlink where add would write is never followed, --force included', { skip: process.platform === 'win32' }, () => {
  const dir = makeProjectWithDeps();
  const outside = path.join(TMP, `outside-${(n += 1)}.txt`);
  fs.writeFileSync(outside, 'precious\n');
  fs.mkdirSync(path.join(dir, 'components/ui'), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, 'components/ui/toast.tsx'));
  const r = run(['add', 'toast', '--force'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /components\/ui\/toast\.tsx is a symlink/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'precious\n');
});

test('breakit: a folder where a file goes is reported, not a crash', () => {
  const dir = makeProjectWithDeps();
  fs.mkdirSync(path.join(dir, 'components/ui/skeleton.tsx'), { recursive: true });
  const r = run(['add', 'skeleton', '--force'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /components\/ui\/skeleton\.tsx is a folder/);
  assert.doesNotMatch(r.out, /Unexpected error/);
});

// ---------------------------------------------------------------------------
// install records, diff, update, init theme
// ---------------------------------------------------------------------------

const readConfig = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'components.json'), 'utf8'));
const readText = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const KIT_SRC = fs.readFileSync(path.resolve(path.dirname(CLI), '..', 'registry', 'kit', 'files', 'src', 'lib', 'kit.tsx'), 'utf8');
const KIT_V = Number(/KIT_VERSION = (\d+)/.exec(KIT_SRC)[1]);

/** Pretends the file was installed by an older CLI: its content (and the recorded hash) become `text`. */
function installOlder(dir, rel, text) {
  writeFile(dir, rel, text);
  const config = readConfig(dir);
  config.files[rel] = contentHash(text);
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(config, null, 2));
}

test('add records a hash per written file (as written, after Prettier) and the kit version', { skip: process.platform === 'win32' }, () => {
  const dir = makeProjectWithDeps();
  const r = run(['add', 'skeleton', 'toast'], dir);
  assert.equal(r.status, 0, r.out);
  const config = readConfig(dir);
  for (const rel of ['components/ui/skeleton.tsx', 'components/ui/toast.tsx', 'lib/kit.tsx']) {
    assert.equal(config.files[rel], contentHash(readText(dir, rel)), rel);
  }
  assert.equal(config.installed.skeleton.kitVersion, KIT_V);
  assert.match(config.installed.toast.version, /^\d+\.\d+\.\d+/);

  // With the project's Prettier, the hash is of the formatted file.
  const fmt = makeProjectWithDeps();
  const pkg = JSON.parse(readText(fmt, 'package.json'));
  pkg.devDependencies = { prettier: '^3.0.0' };
  fs.writeFileSync(path.join(fmt, 'package.json'), JSON.stringify(pkg, null, 2));
  writeFile(fmt, 'node_modules/.bin/prettier', '#!/bin/sh\nshift 3\nfor f in "$@"; do printf "// formatted\\n" >> "$f"; done\n');
  fs.chmodSync(path.join(fmt, 'node_modules/.bin/prettier'), 0o755);
  assert.equal(run(['add', 'skeleton'], fmt).status, 0);
  const text = readText(fmt, 'components/ui/skeleton.tsx');
  assert.match(text, /\/\/ formatted\n$/);
  assert.equal(readConfig(fmt).files['components/ui/skeleton.tsx'], contentHash(text));
  // …so adding it again sees an untouched file of ours, not a conflict.
  const again = run(['add', 'skeleton'], fmt);
  assert.equal(again.status, 0, again.out);
});

test('add refreshes a file it wrote and nobody touched, instead of calling it a conflict', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton'], dir).status, 0);
  installOlder(dir, 'components/ui/skeleton.tsx', 'export const Skeleton = "old version";\n');
  const r = run(['add', 'skeleton'], dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(readText(dir, 'components/ui/skeleton.tsx'), /old version/);
});

test('diff: up to date, your changes, upstream changes, untracked files', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton'], dir).status, 0);
  const clean = run(['diff', 'skeleton'], dir);
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /components\/ui\/skeleton\.tsx\s+up to date/);

  fs.appendFileSync(path.join(dir, 'components/ui/skeleton.tsx'), '// my patch\n');
  const mine = run(['diff', 'skeleton'], dir);
  assert.equal(mine.status, 0, mine.out);
  assert.match(mine.out, /components\/ui\/skeleton\.tsx\s+changed by you/);
  assert.match(mine.out, /--- components\/ui\/skeleton\.tsx \(as installed\)/);
  assert.match(mine.out, /^\s*\+\/\/ my patch$/m);

  installOlder(dir, 'lib/kit.tsx', KIT_SRC.replace('export const KIT_VERSION', '// an older kit\nexport const KIT_VERSION'));
  const up = run(['diff', 'skeleton'], dir);
  assert.match(up.out, /lib\/kit\.tsx\s+changed upstream/);
  assert.match(up.out, /^\s*-\/\/ an older kit$/m);

  // Legacy record (no hashes): differences are shown against upstream.
  const config = readConfig(dir);
  delete config.files;
  config.installed = { skeleton: '0.4.4' };
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(config));
  const legacy = run(['diff'], dir);
  assert.equal(legacy.status, 0, legacy.out);
  assert.match(legacy.out, /skeleton\.tsx\s+differs from upstream \(no install record\)/);
});

test('update refreshes untouched files, stops on patched ones with the diff, --force takes upstream', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton', 'toast'], dir).status, 0);
  installOlder(dir, 'components/ui/skeleton.tsx', 'export const Skeleton = "old version";\n');
  installOlder(dir, 'components/ui/toast.tsx', 'export const Toast = "old toast";\n');
  fs.appendFileSync(path.join(dir, 'components/ui/toast.tsx'), '// LocMart fix\n');

  const r = run(['update'], dir);
  assert.equal(r.status, 1, r.out);
  // skeleton was ours and untouched: refreshed, record moved on.
  const sk = readText(dir, 'components/ui/skeleton.tsx');
  assert.doesNotMatch(sk, /old version/);
  assert.equal(readConfig(dir).files['components/ui/skeleton.tsx'], contentHash(sk));
  // toast was patched: untouched, with the diff and the ways out.
  assert.match(readText(dir, 'components/ui/toast.tsx'), /LocMart fix/);
  assert.match(r.out, /✗ toast/);
  assert.match(r.out, /components\/ui\/toast\.tsx/);
  assert.match(r.out, /^\s*-\/\/ LocMart fix$/m);
  assert.match(r.out, /update toast --force/);
  assert.match(r.out, /✓ skeleton/);

  const forced = run(['update', 'toast', '--force'], dir);
  assert.equal(forced.status, 0, forced.out);
  const toast = readText(dir, 'components/ui/toast.tsx');
  assert.doesNotMatch(toast, /LocMart fix/);
  assert.equal(readConfig(dir).files['components/ui/toast.tsx'], contentHash(toast));
});

test('update keeps an install with --dir in its folder', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton', '--dir', 'components/kit'], dir).status, 0);
  assert.equal(readConfig(dir).installed.skeleton.dir, 'components/kit');
  installOlder(dir, 'components/kit/ui/skeleton.tsx', 'export const Skeleton = "old";\n');
  const r = run(['update', 'skeleton'], dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(readText(dir, 'components/kit/ui/skeleton.tsx'), /"old"/);
  assert.equal(fs.existsSync(path.join(dir, 'components/ui/skeleton.tsx')), false);
});

test('update with nothing installed says how to add, and update <not installed> refuses', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['init'], dir).status, 0);
  // init added kit.tsx, so there is exactly one thing to update — and it's current.
  const kit = run(['update'], dir);
  assert.equal(kit.status, 0, kit.out);
  assert.match(kit.out, /already up to date/);
  const config = readConfig(dir);
  delete config.installed;
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(config));
  const r = run(['update'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Nothing to update/);
  const one = run(['update', 'skeleton'], dir);
  assert.equal(one.status, 1, one.out);
  assert.match(one.out, /skeleton isn't installed here/);
  assert.equal(fs.existsSync(path.join(dir, 'components/ui/skeleton.tsx')), false);
});

test('kit labels: shipped components take their visible English from useKit().labels, not literals', () => {
  // An app in another language translates these once with <KitProvider labels>; a literal would stay English.
  const reg = path.resolve(path.dirname(CLI), '..', 'registry');
  const banned = [
    /^\s+(Today|Clear|Done)\s*$/m, // JSX text on its own line
    />(Cancel|Done|Clear|Today|Choose one or more)</,
    /\b\w+ = '(Cancel|Search|Select…|Select a time|Done|Failed|Show QR Code|Copy|Copied|Slide to confirm|Confirmed|LIKE|NOPE|Passwords match)',/,
    /'(No results|No options|Morning|Afternoon|Evening|Pick a start date|Select a date|Select dates|Next 7 days|Last 30 days)'/,
    /`Done · \$\{/,
  ];
  const items = ['calendar', 'date-picker', 'select', 'time-picker', 'search-bar', 'glass-search-bar', 'action-sheet', 'dialog', 'stateful-button', 'password-input', 'qr-code-button', 'slide-to-confirm', 'swipe-deck'];
  let checked = 0;
  for (const item of items) {
    const file = path.join(reg, item, 'files', 'src', 'components', 'ui', `${item}.tsx`);
    if (!fs.existsSync(file)) continue; // Pro items ship without files
    const src = fs.readFileSync(file, 'utf8');
    for (const re of banned) assert.doesNotMatch(src, re, `${item} has a hard-coded English string`);
    checked++;
  }
  assert.ok(checked >= 5, `only ${checked} items checked`);
  for (const key of ['cancel', 'done', 'today', 'search', 'selectPlaceholder', 'passwordLevels', 'like']) {
    assert.match(KIT_SRC, new RegExp(`^  ${key}: `, 'm'), `kit labels miss ${key}`);
  }
});

test('init takes the theme as flags and writes a KitProvider wrapper plus kit.tsx', () => {
  const dir = makeProjectWithDeps();
  const r = run(['init', '--brand', '#FF6600', '--font', 'Inter', '--radius', '14', '--scheme', 'dark'], dir);
  assert.equal(r.status, 0, r.out);
  const theme = readText(dir, 'lib/kit-theme.tsx');
  assert.match(theme, /accent="#ff6600"/);
  assert.match(theme, /fontFamily="Inter"/);
  assert.match(theme, /radius=\{14\}/);
  assert.match(theme, /scheme="dark"/);
  assert.match(theme, /from '@\/lib\/kit'/);
  assert.equal(readText(dir, 'lib/kit.tsx'), KIT_SRC);
  assert.equal(readConfig(dir).files['lib/kit.tsx'], contentHash(KIT_SRC));
  assert.match(r.out, /<AppTheme>/);

  // Without a terminal and without flags: the defaults, no prompt.
  const plain = makeProjectWithDeps();
  const p = run(['init'], plain);
  assert.equal(p.status, 0, p.out);
  assert.match(readText(plain, 'lib/kit-theme.tsx'), /scheme="system"/);

  // Re-running with flags on an initialised project never replaces the wrapper.
  fs.writeFileSync(path.join(dir, 'lib/kit-theme.tsx'), '// mine\n');
  const again = run(['init', '--brand', '#000'], dir);
  assert.equal(again.status, 0, again.out);
  assert.equal(readText(dir, 'lib/kit-theme.tsx'), '// mine\n');
  assert.match(again.out, /accent="#000000"/);
});

test('breakit: init theme values are code once written — anything but plain values is refused, nothing written', () => {
  const dir = makeProjectWithDeps();
  for (const args of [['--brand', "#fff'/><Evil"], ['--font', 'Inter"; import x from "y'], ['--radius', '12}/>'], ['--scheme', 'dark" evil="']]) {
    const r = run(['init', ...args], dir);
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.out}`);
    assert.equal(fs.existsSync(path.join(dir, 'components.json')), false);
    assert.equal(fs.existsSync(path.join(dir, 'lib/kit-theme.tsx')), false);
  }
});

test('breakit: hashes and paths in components.json are untrusted', () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton'], dir).status, 0);
  fs.appendFileSync(path.join(dir, 'components/ui/skeleton.tsx'), '// mine\n');
  const outside = path.join(TMP, `outside-${(n += 1)}.txt`);
  fs.writeFileSync(outside, 'precious\n');
  const config = readConfig(dir);
  // A forged / malformed hash never turns a patched file into "ours": update still stops on it.
  config.files['components/ui/skeleton.tsx'] = 'not-a-hash';
  config.files[path.relative(dir, outside)] = contentHash('precious\n');
  config.files['../../etc/passwd'] = contentHash('x');
  config.installed = { skeleton: { version: '0.0.1' }, __proto__: { version: 'x' }, 'bad name': 1, toast: { dir: '../../outside' } };
  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify(config));
  const r = run(['update'], dir);
  assert.equal(r.status, 1, r.out);
  assert.match(readText(dir, 'components/ui/skeleton.tsx'), /\/\/ mine/);
  assert.match(r.out, /✗ toast — .*--dir/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'precious\n');
  assert.doesNotMatch(r.out, /Unexpected error/);

  // Junk where an object should be is ignored, not a crash.
  for (const junk of [{ files: 'x', installed: 'y' }, { files: [1, 2], installed: [3] }, { files: null, installed: null }]) {
    fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify({ ...config, ...junk }));
    const d = run(['diff', 'skeleton'], dir);
    assert.equal(d.status, 0, `${JSON.stringify(junk)}: ${d.out}`);
    assert.doesNotMatch(d.out, /Unexpected error/);
  }
});

test('breakit: diff never reads through a symlink', { skip: process.platform === 'win32' }, () => {
  const dir = makeProjectWithDeps();
  assert.equal(run(['add', 'skeleton'], dir).status, 0);
  const secret = path.join(TMP, `secret-${(n += 1)}.txt`);
  fs.writeFileSync(secret, 'TOP SECRET\n');
  fs.rmSync(path.join(dir, 'components/ui/skeleton.tsx'));
  fs.symlinkSync(secret, path.join(dir, 'components/ui/skeleton.tsx'));
  const r = run(['diff', 'skeleton'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /symlink/);
  assert.doesNotMatch(r.out, /TOP SECRET/);
});
