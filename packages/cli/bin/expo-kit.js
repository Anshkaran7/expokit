#!/usr/bin/env node
/**
 * expo-kit CLI — shadcn-style add for Expo / React Native
 * Usage: npx @expokit/cli@latest init
 *        npx @expokit/cli@latest add liquidglass-tab
 *        npx @expokit/cli@latest doctor
 *        npx @expokit/cli@latest login      (Pro items)
 *        npx @expokit/cli@latest mcp        (MCP server for AI assistants)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  CliError,
  DEFAULT_SITE_URL,
  addTsconfigPathAlias,
  canSendToken,
  hasJsoncExtras,
  isSafePackageSpec,
  isValidItemName,
  kitVersion,
  mergeDependencies,
  parseJsonc,
  parseSiteUrl,
  tabComponentName,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(PACKAGE_ROOT, 'registry');

/** Website that serves Pro items (GET /api/registry/<name>) and issues CLI tokens (/account). */
const SITE_URL = (process.env.EXPO_KIT_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const CREDENTIALS_DIR = path.join(os.homedir(), '.expo-kit');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');

const DEFAULT_ALIASES = {
  components: '@/components',
  lib: '@/lib',
  hooks: '@/hooks',
};

const SRC_PATHS = {
  components: 'src/components',
  lib: 'src/lib',
  app: 'src/app',
};

const ROOT_PATHS = {
  components: 'components',
  lib: 'lib',
  app: 'app',
};

const ALIASES = {
  'liquid-glass-tab': 'liquidglass-tab',
  'native-tabs': 'liquidglass-tab',
  'liquidglass-tabs': 'liquidglass-tab',
};

const TAB_TEMPLATE_PEERS = [
  'expo-router',
  '@expo/vector-icons',
  'expo-glass-effect',
  'expo-blur',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-reanimated',
  'react-native-worklets',
];

/** Registry paths (under src/) refreshed by `update` — user tabs.ts is preserved. */
const LIQUIDGLASS_FRAMEWORK_PATHS = [
  'app/_layout.tsx',
  'app/(tabs)/_layout.tsx',
  'components/TabScreen.tsx',
  'components/GlassTabBar.tsx',
  'lib/tab-icons.ts',
  'lib/tab-bar.ts',
];

function getPackageVersion() {
  const pkgPath = path.join(PACKAGE_ROOT, 'package.json');
  return readJsonFile(pkgPath, 'expo-kit package.json').version ?? '0.0.0';
}

function log(msg) {
  console.log(`\x1b[36mexpo-kit\x1b[0m ${msg}`);
}

function warn(msg) {
  console.warn(`\x1b[33mexpo-kit\x1b[0m ${msg}`);
}

function fail(msg) {
  console.error(`\x1b[31mexpo-kit\x1b[0m ${msg}`);
  process.exit(1);
}

/** Reads + parses a JSON file. Throws CliError (with `code` from fs, e.g. ENOENT) — callers decide whether to fail. */
function readJsonFile(filePath, label = path.basename(filePath)) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const err = new CliError(`Could not read ${label}: ${e?.message ?? e}`);
    err.code = e?.code;
    throw err;
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new CliError(`${label} is not valid JSON (${filePath}): ${e?.message ?? e}`);
  }
}

function tryReadJsonFile(filePath) {
  try {
    return readJsonFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Plans the `@/*` alias edit for tsconfig.json without writing anything.
 * Returns null when there is no tsconfig.json; throws CliError when it can't be read/parsed.
 */
function planTsconfigAlias(projectRoot, aliasTarget) {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(tsconfigPath, 'utf8');
  } catch (e) {
    throw new CliError(`Could not read tsconfig.json: ${e?.message ?? e}`);
  }
  try {
    return { tsconfigPath, ...addTsconfigPathAlias(raw, '@/*', aliasTarget) };
  } catch (e) {
    throw new CliError(
      `tsconfig.json could not be parsed (${e?.message ?? e}). Fix it, or add "@/*": ${JSON.stringify(aliasTarget)} to compilerOptions.paths yourself, then re-run init.`
    );
  }
}

function parseFlags(argv) {
  const flags = { dryRun: false, force: false };
  const positional = [];
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--list' || arg === '-l') positional.push('--list');
    else positional.push(arg);
  }
  return { flags, positional };
}

function detectProjectLayout(projectRoot) {
  const hasSrcApp = fs.existsSync(path.join(projectRoot, 'src', 'app'));
  const hasRootApp = fs.existsSync(path.join(projectRoot, 'app'));
  if (hasSrcApp) {
    return { paths: { ...SRC_PATHS }, aliasTarget: ['./src/*'], layout: 'src' };
  }
  if (hasRootApp) {
    return { paths: { ...ROOT_PATHS }, aliasTarget: ['./*'], layout: 'root' };
  }
  return { paths: { ...SRC_PATHS }, aliasTarget: ['./src/*'], layout: 'src' };
}

function buildDefaultConfig(projectRoot) {
  const { paths } = detectProjectLayout(projectRoot);
  return {
    $schema: 'https://expokit.karandev.in/schema.json',
    aliases: { ...DEFAULT_ALIASES },
    paths,
  };
}

function findProjectRoot(cwd) {
  let dir = cwd;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = tryReadJsonFile(path.join(dir, 'package.json'));
      if (pkg && (pkg.dependencies?.expo || pkg.devDependencies?.expo)) return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, 'components.json');
  const defaults = buildDefaultConfig(projectRoot);
  if (!fs.existsSync(configPath)) {
    return { ...defaults, configPath };
  }
  const user = readJsonFile(configPath, 'components.json');
  return {
    ...defaults,
    ...user,
    aliases: { ...defaults.aliases, ...user.aliases },
    paths: { ...defaults.paths, ...user.paths },
    installed: { ...user.installed },
    configPath,
  };
}

function saveConfig(projectRoot, config) {
  const { configPath, ...data } = config;
  fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
}

function markTemplateInstalled(projectRoot, config, resolved) {
  config.installed ??= {};
  config.installed[resolved] = getPackageVersion();
  saveConfig(projectRoot, config);
}

function detectInstalledTemplates(projectRoot, config) {
  const installed = new Set(Object.keys(config.installed ?? {}));

  const tabsPath = path.join(projectRoot, config.paths.lib ?? 'src/lib', 'tabs.ts');
  if (fs.existsSync(tabsPath)) {
    const content = fs.readFileSync(tabsPath, 'utf8');
    if (content.includes('export const TABS') && content.includes('TAB_BAR')) {
      installed.add('liquidglass-tab');
    }
  }

  return [...installed];
}

function registryPathToProjectPath(registryRel, config, projectRoot) {
  const [folder, ...rest] = registryRel.split('/');
  const folderDest = {
    app: config.paths.app ?? 'src/app',
    components: config.paths.components ?? 'src/components',
    lib: config.paths.lib ?? 'src/lib',
    constants: config.paths.constants ?? 'src/constants',
    hooks: config.paths.hooks ?? 'src/hooks',
  };
  return path.join(projectRoot, folderDest[folder] ?? `src/${folder}`, ...rest);
}

function copyRegistryFiles(filesRoot, projectRoot, config, registryPaths, options) {
  for (const registryRel of registryPaths) {
    const srcPath = path.join(filesRoot, 'src', registryRel);
    const destPath = registryPathToProjectPath(registryRel, config, projectRoot);
    const rel = path.relative(projectRoot, destPath);

    if (!fs.existsSync(srcPath)) {
      warn(`Registry file missing: ${registryRel}`);
      continue;
    }

    if (options.dryRun) {
      log(`  would write ${rel}`);
      continue;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, fs.readFileSync(srcPath, 'utf8'));
    log(`  + ${rel}`);
  }
}

function resolveRegistryName(name) {
  const key = name.toLowerCase();
  return ALIASES[key] ?? key;
}

function readMeta(resolved) {
  const metaPath = path.join(REGISTRY_DIR, `${resolved}.json`);
  return fs.existsSync(metaPath) ? readJsonFile(metaPath, `${resolved}.json`) : null;
}

/** Bundled files of a free item (its whole closure), or null for Pro items (served by the website). */
function bundledFilesRoot(meta) {
  if (!meta.filesDir) return null;
  const root = path.join(REGISTRY_DIR, meta.filesDir);
  return fs.existsSync(root) ? root : null;
}

/**
 * Meta + a local folder with the item's files under src/. Free items come from this package;
 * Pro items are downloaded from the website with the saved token (see `expo-kit login`).
 */
async function loadRegistryItem(name) {
  const resolved = resolveRegistryName(name);
  const meta = isValidItemName(resolved) ? readMeta(resolved) : null;
  if (!meta) {
    if (!isValidItemName(resolved)) fail(`Unknown item "${name}". Run: expo-kit add --list`);
    // Not in this package's registry — it may be newer than this CLI. Ask the site before giving up.
    const remoteMeta = { name: resolved, title: resolved, tier: 'pro', dependencies: [], unknownLocally: true };
    return stageRemoteItem(remoteMeta, resolved);
  }
  const filesRoot = bundledFilesRoot(meta);
  if (filesRoot) return { meta, filesRoot, resolved };
  if (meta.tier !== 'pro' && meta.filesDir) fail(`Registry files missing for "${resolved}".`);
  return stageRemoteItem(meta, resolved);
}

function listRegistry() {
  const files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'));
  log('Available items:\n');
  let pro = 0;
  for (const file of files) {
    const meta = readJsonFile(path.join(REGISTRY_DIR, file));
    if (meta.tier === 'pro') pro += 1;
    const tag = meta.tier === 'pro' ? '\x1b[35mPRO\x1b[0m ' : '    ';
    console.log(`  • ${meta.name.padEnd(18)} ${tag}${meta.title}`);
  }
  console.log('');
  if (pro) log(`PRO items need an ExpoKit Pro plan — run \`expo-kit login\` (tokens: ${SITE_URL}/account).\n`);
}

// ---------------------------------------------------------------------------
// Pro: credentials + remote items
// ---------------------------------------------------------------------------

function readCredentials() {
  if (process.env.EXPO_KIT_TOKEN) return { token: process.env.EXPO_KIT_TOKEN, source: 'EXPO_KIT_TOKEN', fromEnv: true };
  try {
    const data = readJsonFile(CREDENTIALS_PATH, 'credentials.json');
    return data?.token ? { ...data, source: CREDENTIALS_PATH } : null;
  } catch (e) {
    if (e?.code !== 'ENOENT') warn(`Ignoring saved credentials: ${e?.message ?? e}`);
    return null;
  }
}

/** Throws unless the saved/env token may be sent to SITE_URL (see canSendToken). */
function assertTokenTarget(creds) {
  if (!creds) return;
  if (canSendToken({ siteUrl: SITE_URL, credsUrl: creds.url, fromEnv: Boolean(creds.fromEnv) })) return;
  const target = new URL(SITE_URL).origin;
  throw new CliError(
    creds.fromEnv
      ? `Refusing to send EXPO_KIT_TOKEN to ${target} (only ${DEFAULT_SITE_URL} or localhost receive it). Unset EXPO_KIT_URL, or run \`expo-kit login\` against that site.`
      : `Your saved token was created for ${creds.url ?? DEFAULT_SITE_URL}, so it won't be sent to ${target}. ` +
        `Unset EXPO_KIT_URL, or run \`expo-kit login\` with EXPO_KIT_URL=${target} to save a token for that site.`
  );
}

function writeCredentials(data) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(CREDENTIALS_PATH, 0o600); // also when the file already existed
}

async function apiGet(pathname, token) {
  parseSiteUrl(SITE_URL); // https only (http just for localhost) — throws CliError
  const url = `${SITE_URL}${pathname}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    fail(
      `Network error: couldn't reach ${SITE_URL} (${e?.cause?.code ?? e?.name ?? e?.message ?? e}). ` +
        'Check your connection (or EXPO_KIT_URL) and try again.'
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page, …)
  }
  return { status: res.status, ok: res.ok, body };
}

function failServerError(status, what) {
  fail(`Server error from ${SITE_URL} (HTTP ${status}) while ${what}. This isn't a problem with your token — try again in a moment.`);
}

/** Downloads one Pro item (own files only). Exits with a clear message on 401 / 403 / 5xx. */
async function fetchRemoteItem(name, { unknownLocally = false } = {}) {
  const creds = readCredentials();
  assertTokenTarget(creds);
  const { status, ok, body } = await apiGet(`/api/registry/${encodeURIComponent(name)}`, creds?.token);
  if (ok && body && Array.isArray(body.files)) return body;
  if (status === 404 && unknownLocally) fail(`Unknown item "${name}". Run: expo-kit add --list`);
  if (status >= 500) failServerError(status, `downloading "${name}"`);
  if (status === 401 && !creds) {
    fail(
      `"${name}" is a Pro item and you're not logged in.\n` +
        `  1. Create a token at ${SITE_URL}/account\n` +
        `  2. Run: npx @expokit/cli@latest login`
    );
  }
  if (status === 401) {
    fail(`Your token (${creds.source}) is invalid or was revoked. Create a new one at ${SITE_URL}/account and run \`expo-kit login\`.`);
  }
  if (status === 403) {
    fail(`"${name}" needs ExpoKit Pro, and your account doesn't have it yet. Upgrade at ${SITE_URL}/pricing.`);
  }
  if (status === 404) fail(`"${name}" was not found on ${SITE_URL}. Update the CLI: npx @expokit/cli@latest add ${name}`);
  fail(`Couldn't download "${name}" from ${SITE_URL} (HTTP ${status}${body?.message ? `: ${body.message}` : ''}).`);
}

const SAFE_FILE = /^src\/(components|lib|hooks|app|constants)\/[A-Za-z0-9_.()[\]\/-]+$/;

/** Temp dirs from Pro downloads — one exit listener cleans all (avoids listener leak on repeated adds). */
const remoteTmpDirs = new Set();
let remoteTmpExitHooked = false;

function trackRemoteTmp(tmp) {
  remoteTmpDirs.add(tmp);
  if (remoteTmpExitHooked) return;
  remoteTmpExitHooked = true;
  process.on('exit', () => {
    for (const dir of remoteTmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * Builds a temporary registry folder for a Pro item: its own files from the website, plus every
 * registry dependency (free ones from this package, Pro ones downloaded too), then hands it to
 * the normal add flow. Dependency files are "shared" — kept when you've edited them.
 */
async function stageRemoteItem(meta, resolved) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `expo-kit-${resolved}-`));
  trackRemoteTmp(tmp);
  const shared = new Set();
  const seen = new Set();
  let dependencies = [...(meta.dependencies ?? [])];
  let title = meta.title;
  if (meta.unknownLocally) log(`"${resolved}" isn't bundled with this CLI — looking it up on ${SITE_URL}…`);
  else log(`${meta.title} is a Pro item — downloading from ${SITE_URL}…`);

  async function stage(name, isRoot) {
    if (seen.has(name)) return;
    seen.add(name);
    if (!isValidItemName(name)) fail(`Refusing unexpected registry dependency name: ${JSON.stringify(name)}`);
    const depMeta = readMeta(name);
    const bundled = depMeta && bundledFilesRoot(depMeta);
    if (bundled) {
      // Free dep: its bundled folder already holds its whole closure.
      for (const file of collectFiles(path.join(bundled, 'src'), path.join(tmp, 'src'))) {
        shared.add(path.relative(path.join(tmp, 'src'), file).split(path.sep).join('/'));
      }
      fs.cpSync(path.join(bundled, 'src'), path.join(tmp, 'src'), { recursive: true });
      dependencies = mergeDependencies(dependencies, depMeta.dependencies);
      return;
    }
    const item = await fetchRemoteItem(name, { unknownLocally: isRoot && Boolean(meta.unknownLocally) });
    if (isRoot && typeof item.title === 'string' && item.title) title = item.title;
    const remoteDeps = Array.isArray(item.dependencies) ? item.dependencies : [];
    for (const dep of remoteDeps) {
      if (!isSafePackageSpec(dep)) fail(`Refusing unexpected npm dependency from the registry: ${JSON.stringify(dep)}`);
    }
    dependencies = mergeDependencies(dependencies, remoteDeps);
    if (depMeta) dependencies = mergeDependencies(dependencies, depMeta.dependencies);
    for (const dep of Array.isArray(item.registryDependencies) ? item.registryDependencies : []) await stage(dep, false);
    for (const file of item.files) {
      if (typeof file?.path !== 'string' || typeof file.content !== 'string' || !SAFE_FILE.test(file.path) || file.path.includes('..')) {
        fail(`Refusing unexpected file path from the registry: ${JSON.stringify(file?.path)}`);
      }
      const dest = path.join(tmp, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
      const rel = file.path.slice('src/'.length);
      if (isRoot) shared.delete(rel);
      else shared.add(rel);
    }
  }

  await stage(resolved, true);
  return { meta: { ...meta, title, dependencies, sharedFiles: [...shared] }, filesRoot: tmp, resolved };
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cmdLogin(args) {
  const i = args.findIndex((a) => a === '--token' || a.startsWith('--token='));
  let token = i === -1 ? '' : args[i].includes('=') ? args[i].slice('--token='.length) : args[i + 1] ?? '';
  if (!token) {
    log(`Create a CLI token at ${SITE_URL}/account (signed in), then paste it here.`);
    if (!process.stdin.isTTY) fail('No token given. Use: expo-kit login --token <token>');
    token = await prompt('Token: ');
  }
  token = token.trim();
  if (!token) fail('No token given.');

  const site = parseSiteUrl(SITE_URL);
  log(`Verifying the token with ${site.host} — it will only be sent to ${site.origin}.`);
  if (site.origin !== new URL(DEFAULT_SITE_URL).origin) warn(`${site.origin} is not the default site (EXPO_KIT_URL is set).`);
  const { status, ok, body } = await apiGet('/api/cli/whoami', token);
  if (status === 401) fail(`That token isn't valid (or was revoked). Create a new one at ${SITE_URL}/account.`);
  if (status >= 500) failServerError(status, 'verifying the token');
  if (!ok) fail(`Couldn't verify the token (HTTP ${status}). Check your network and ${SITE_URL}, then try again.`);

  writeCredentials({ token, url: site.origin, savedAt: new Date().toISOString() });
  log(`Saved to ${CREDENTIALS_PATH} (readable only by you).`);
  if (ok && body) {
    log(body.pro ? `Logged in — Pro is unlocked (${body.plan} plan).` : `Logged in on the ${body.plan} plan. Pro items need Pro: ${SITE_URL}/pricing`);
  }
}

function cmdLogout() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    log('Not logged in.');
    return;
  }
  fs.rmSync(CREDENTIALS_PATH, { force: true });
  log(`Logged out — removed ${CREDENTIALS_PATH}. (Revoke the token itself at ${SITE_URL}/account.)`);
  if (process.env.EXPO_KIT_TOKEN) warn('EXPO_KIT_TOKEN is still set in your environment.');
}

async function cmdWhoami() {
  const creds = readCredentials();
  if (!creds) fail(`Not logged in. Run: expo-kit login (tokens: ${SITE_URL}/account)`);
  assertTokenTarget(creds);
  const { status, ok, body } = await apiGet('/api/cli/whoami', creds.token);
  if (status === 401) fail(`Your token (${creds.source}) is invalid or was revoked. Create a new one at ${SITE_URL}/account.`);
  if (status >= 500) failServerError(status, 'checking your token');
  if (!ok || !body) fail(`Couldn't check your token (HTTP ${status}).`);
  log(`User ${body.userId} · ${body.plan} plan · Pro ${body.pro ? 'unlocked' : 'locked'} · ${SITE_URL}`);
}

function collectFiles(src, dest, files = []) {
  if (!fs.existsSync(src)) return files;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      collectFiles(srcPath, destPath, files);
    } else {
      files.push(destPath);
    }
  }
  return files;
}

function identicalToRegistry(destFile, filesRoot, projectRoot, config) {
  const registrySrc = path.join(filesRoot, 'src');
  for (const folder of fs.readdirSync(registrySrc)) {
    const destRoot = path.join(projectRoot, config.paths[folder] ?? (folder === 'app' ? 'src/app' : `src/${folder}`));
    if (destFile.startsWith(destRoot + path.sep)) {
      const src = path.join(registrySrc, folder, path.relative(destRoot, destFile));
      return fs.existsSync(src) && fs.readFileSync(src, 'utf8') === fs.readFileSync(destFile, 'utf8');
    }
  }
  return false;
}

function planRegistryFiles(filesRoot, projectRoot, config) {
  const registrySrc = path.join(filesRoot, 'src');
  if (!fs.existsSync(registrySrc)) {
    fail('Registry layout must include src/ folder.');
  }

  const folderDest = {
    app: config.paths.app ?? 'src/app',
    components: config.paths.components ?? 'src/components',
    lib: config.paths.lib ?? 'src/lib',
    constants: config.paths.constants ?? 'src/constants',
    hooks: config.paths.hooks ?? 'src/hooks',
  };

  const planned = [];
  for (const entry of fs.readdirSync(registrySrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const destRel = folderDest[entry.name] ?? `src/${entry.name}`;
    planned.push(
      ...collectFiles(
        path.join(registrySrc, entry.name),
        path.join(projectRoot, destRel)
      )
    );
  }
  return planned;
}

function copyDir(src, dest, projectRoot, options) {
  const { dryRun } = options;
  if (!fs.existsSync(dest) && !dryRun) fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, projectRoot, options);
    } else {
      const rel = path.relative(projectRoot, destPath);
      const exists = fs.existsSync(destPath);
      const same = exists && fs.readFileSync(destPath, 'utf8') === fs.readFileSync(srcPath, 'utf8');
      const keep = exists && !same && !options.force && options.shared?.has(destPath);
      if (dryRun) {
        log(`  would ${same ? 'keep (unchanged)' : keep ? 'keep (shared, yours)' : 'write'} ${rel}${exists && !same && !keep ? ' (overwrite)' : ''}`);
        continue;
      }
      if (same) continue;
      if (keep) {
        log(`  = ${rel} (shared file kept — use --force to replace)`);
        continue;
      }
      if (exists) warn(`Overwriting ${rel}`);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, fs.readFileSync(srcPath, 'utf8'));
      log(`  + ${rel}`);
    }
  }
}

function mapRegistryToProject(filesRoot, projectRoot, config, options) {
  const registrySrc = path.join(filesRoot, 'src');
  if (!fs.existsSync(registrySrc)) {
    fail('Registry layout must include src/ folder.');
  }

  const folderDest = {
    app: config.paths.app ?? 'src/app',
    components: config.paths.components ?? 'src/components',
    lib: config.paths.lib ?? 'src/lib',
    constants: config.paths.constants ?? 'src/constants',
    hooks: config.paths.hooks ?? 'src/hooks',
  };

  for (const entry of fs.readdirSync(registrySrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const destRel = folderDest[entry.name] ?? `src/${entry.name}`;
    copyDir(
      path.join(registrySrc, entry.name),
      path.join(projectRoot, destRel),
      projectRoot,
      options
    );
  }
}

function ensureExpoRouterMain(projectRoot, dryRun) {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = readJsonFile(pkgPath, 'package.json');
  if (pkg.main === 'expo-router/entry') return false;

  if (dryRun) {
    log('  would set package.json "main" to "expo-router/entry"');
    return true;
  }

  pkg.main = 'expo-router/entry';
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  log('Set package.json "main" to "expo-router/entry"');
  return true;
}

function parseTabNamesFromConfig(projectRoot, config) {
  const tabsPath = path.join(projectRoot, config.paths.lib ?? 'src/lib', 'tabs.ts');
  if (!fs.existsSync(tabsPath)) return [];
  const content = fs.readFileSync(tabsPath, 'utf8').replace(/\r\n/g, '\n');
  const tabsMatch = content.match(/export const TABS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!tabsMatch) return [];

  const names = [];
  const re = /^\s{4}name:\s*['"]([^'"]+)['"]\s*,?\s*$/gm;
  let match = re.exec(tabsMatch[1]);
  while (match) {
    names.push(match[1]);
    match = re.exec(tabsMatch[1]);
  }
  return names;
}

function tabRouteStub(tabName) {
  return `import { TabScreenFromConfig } from '@/components/TabScreen';

export default function ${tabComponentName(tabName)}() {
  return <TabScreenFromConfig tabName=${JSON.stringify(tabName)} />;
}
`;
}

function syncTabRoutes(projectRoot, config, options) {
  const tabNames = parseTabNamesFromConfig(projectRoot, config);
  if (!tabNames.length) return;

  const tabsDir = path.join(projectRoot, config.paths.app ?? 'src/app', '(tabs)');
  if (!fs.existsSync(tabsDir) && !options.dryRun) {
    fs.mkdirSync(tabsDir, { recursive: true });
  }

  for (const tabName of tabNames) {
    const fileName = tabName === 'index' ? 'index.tsx' : `${tabName}.tsx`;
    const destPath = path.join(tabsDir, fileName);
    const rel = path.relative(projectRoot, destPath);

    if (fs.existsSync(destPath)) continue;

    if (options.dryRun) {
      log(`  would create missing route ${rel}`);
      continue;
    }

    fs.writeFileSync(destPath, tabRouteStub(tabName));
    log(`  + ${rel} (from tabs.ts)`);
  }
}

function runExpoInstall(projectRoot, packages, dryRun) {
  if (!packages.length) return true;
  if (dryRun) {
    log(`  would run: npx expo install ${packages.join(' ')}`);
    return true;
  }
  log(`Installing: ${packages.join(', ')}`);
  const result = spawnSync('npx', ['expo', 'install', ...packages], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    warn('expo install failed — run manually:');
    console.log(`  npx expo install ${packages.join(' ')}`);
    return false;
  }
  return true;
}

function cmdInit(cwd, flags) {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project (expo dependency not found).');

  const configPath = path.join(projectRoot, 'components.json');
  if (fs.existsSync(configPath)) {
    warn('components.json already exists.');
    return;
  }

  const { paths, aliasTarget, layout } = detectProjectLayout(projectRoot);
  const config = {
    $schema: 'https://expokit.karandev.in/schema.json',
    aliases: { ...DEFAULT_ALIASES },
    paths,
  };

  // Plan the tsconfig edit first: a broken tsconfig must not leave a half-initialised project.
  const tsPlan = planTsconfigAlias(projectRoot, aliasTarget);

  if (flags.dryRun) {
    log(`Would create components.json (${layout} layout)`);
    if (tsPlan?.changed) log(`Would add @/* → ${aliasTarget[0]} in tsconfig.json`);
    ensureExpoRouterMain(projectRoot, true);
    return;
  }

  if (tsPlan?.changed) {
    if (tsPlan.commentsLost) warn('tsconfig.json had comments/trailing commas that could not be kept — they were removed.');
    fs.writeFileSync(tsPlan.tsconfigPath, tsPlan.text);
    log(`Added @/* path alias to tsconfig.json → ${aliasTarget[0]}`);
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  log(`Created components.json (${layout} layout)`);

  ensureExpoRouterMain(projectRoot, false);
  log('Done. Add items with: npx @expokit/cli add <name>');
}

async function cmdAdd(args, cwd) {
  const { flags, positional } = parseFlags(args);
  // `add a b c` → add each in turn with the same flags.
  if (positional.length > 1 && !positional.includes('--list')) {
    const flagArgs = args.filter((a) => a.startsWith('--'));
    for (const item of positional) await cmdAdd([item, ...flagArgs], cwd);
    return;
  }
  const name = positional[0];

  if (!name || name === '--list') {
    listRegistry();
    return;
  }

  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project. Run from your app root.');

  const configPath = path.join(projectRoot, 'components.json');
  if (!fs.existsSync(configPath)) {
    warn('No components.json — running init first.');
    cmdInit(cwd, flags);
  }

  const config = loadConfig(projectRoot);
  const { meta, filesRoot, resolved } = await loadRegistryItem(name);

  const shared = new Set(
    (meta.sharedFiles ?? []).map((rel) => registryPathToProjectPath(rel, config, projectRoot))
  );
  const planned = planRegistryFiles(filesRoot, projectRoot, config);
  const srcOf = (file) => {
    const rel = (meta.sharedFiles ?? []).find((r) => registryPathToProjectPath(r, config, projectRoot) === file);
    return rel ? path.join(filesRoot, 'src', rel) : null;
  };
  const conflicts = planned.filter((file) => {
    if (!fs.existsSync(file) || shared.has(file)) return false;
    return !identicalToRegistry(file, filesRoot, projectRoot, config) && !srcOf(file);
  });

  // A kept (edited) shared kit.tsx older than this item needs would crash at runtime (missing kit API).
  const outdated = [...shared].flatMap((file) => {
    const src = srcOf(file);
    if (!src || !fs.existsSync(file)) return [];
    const need = kitVersion(fs.readFileSync(src, 'utf8'));
    const have = kitVersion(fs.readFileSync(file, 'utf8'));
    return need !== null && have !== null && have < need ? [{ file, have, need }] : [];
  });
  if (outdated.length && !flags.force) {
    console.log('');
    fail(
      `${meta.title} needs a newer kit than your edited copy:\n` +
        outdated.map((o) => `  • ${path.relative(projectRoot, o.file)} (kit v${o.have}, needs v${o.need})`).join('\n') +
        `\nRe-run with --force to replace it (your edits to it are lost — back it up first), or merge the new version by hand.`
    );
  }

  if (flags.dryRun) {
    log(`Dry run — ${meta.title} (${resolved})\n`);
    for (const file of planned) {
      const rel = path.relative(projectRoot, file);
      const exists = fs.existsSync(file);
      const same = exists && identicalToRegistry(file, filesRoot, projectRoot, config);
      const isShared = (meta.sharedFiles ?? []).some((r) => registryPathToProjectPath(r, config, projectRoot) === file);
      log(
        same
          ? `  unchanged ${rel}`
          : `  would write ${rel}${exists ? (isShared ? ' (shared — kept unless --force)' : ' (overwrite with --force)') : ''}`
      );
    }
    if (conflicts.length && !flags.force) {
      console.log('');
      fail(
        `Would overwrite ${conflicts.length} file(s). Re-run with --force:\n` +
          conflicts.map((f) => `  • ${path.relative(projectRoot, f)}`).join('\n')
      );
    }
    if (resolved === 'liquidglass-tab') {
      syncTabRoutes(projectRoot, config, flags);
      ensureExpoRouterMain(projectRoot, true);
    }
    runExpoInstall(projectRoot, meta.dependencies ?? [], true);
    return;
  }

  const copyOptions = { dryRun: false, force: flags.force, shared };

  if (conflicts.length && !flags.force) {
    console.log('');
    fail(
      `Would overwrite ${conflicts.length} file(s). Re-run with --force:\n` +
        conflicts.map((f) => `  • ${path.relative(projectRoot, f)}`).join('\n')
    );
  }

  log(`Adding ${meta.title} (${resolved})…\n`);
  mapRegistryToProject(filesRoot, projectRoot, config, copyOptions);

  if (resolved === 'liquidglass-tab') {
    syncTabRoutes(projectRoot, config, copyOptions);
    ensureExpoRouterMain(projectRoot, false);
  }

  const depsOk = runExpoInstall(projectRoot, meta.dependencies ?? [], false);

  if (depsOk) markTemplateInstalled(projectRoot, config, resolved);

  console.log('');
  if (resolved === 'liquidglass-tab') {
    log('Next steps:');
    console.log('  • Edit src/lib/tabs.ts — labels, icon presets, colors, screen text');
    console.log('  • Run: npx expo-kit doctor');
    console.log('  • Build a dev client: npx expo run:ios (iOS 26 shows real Liquid Glass,');
    console.log('    iOS 18 and older, Android and web get the glass fallback bar)');
    console.log('  • After package updates: npx @expokit/cli@latest update');
  } else {
    const folder = ['ui', 'blocks', 'charts'].find((f) =>
      fs.existsSync(path.join(filesRoot, 'src', 'components', f, `${resolved}.tsx`))
    );
    const main = folder ? path.join(filesRoot, 'src', 'components', folder, `${resolved}.tsx`) : null;
    const exported = main
      ? fs.readFileSync(main, 'utf8').match(/export (?:function|const) ([A-Z]\w*)/)?.[1]
      : null;
    if (exported) log(`Import: import { ${exported} } from "@/components/${folder}/${resolved}";`);
  }
}

async function cmdUpdate(args, cwd) {
  const { flags, positional } = parseFlags(args);
  const name = positional[0];

  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project. Run from your app root.');

  const configPath = path.join(projectRoot, 'components.json');
  if (!fs.existsSync(configPath)) {
    fail('No components.json — run: npx @expokit/cli@latest init');
  }

  const config = loadConfig(projectRoot);
  const pkgVersion = getPackageVersion();
  const targets = name ? [resolveRegistryName(name)] : detectInstalledTemplates(projectRoot, config);

  if (!targets.length) {
    fail('No templates found. Run: npx @expokit/cli@latest add liquidglass-tab');
  }

  if (flags.force) {
    for (const resolved of targets) {
      log(`Full overwrite ${resolved} (--force${flags.dryRun ? ', dry run' : ''})…\n`);
      await cmdAdd([resolved, '--force', ...(flags.dryRun ? ['--dry-run'] : [])], cwd);
    }
    return;
  }

  log(`Updating template files (expo-kit@${pkgVersion})…`);
  log('Your src/lib/tabs.ts is kept — only framework files refresh.\n');

  for (const resolved of targets) {
    if (resolved !== 'liquidglass-tab') {
      warn(
        `Smart update only supports liquidglass-tab today. For "${resolved}" run: npx @expokit/cli@latest add ${resolved} --force`
      );
      continue;
    }
    const { meta, filesRoot } = await loadRegistryItem(resolved);

    if (flags.dryRun) {
      log(`Dry run — ${meta.title} (${resolved})\n`);
    } else {
      log(`${meta.title} (${resolved})`);
    }

    copyRegistryFiles(filesRoot, projectRoot, config, LIQUIDGLASS_FRAMEWORK_PATHS, flags);
    syncTabRoutes(projectRoot, config, flags);
    ensureExpoRouterMain(projectRoot, flags.dryRun);

    if (!flags.dryRun) {
      markTemplateInstalled(projectRoot, config, resolved);
    }
  }

  console.log('');
  log('Update complete. Reload Metro or rebuild the native app to see changes.');
  log('To overwrite tabs.ts too: npx @expokit/cli@latest update --force');
}

function cmdDoctor(cwd) {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project.');

  const config = loadConfig(projectRoot);
  let issues = 0;

  log('Checking project…\n');

  if (!fs.existsSync(config.configPath)) {
    warn('Missing components.json — run: expo-kit init');
    issues += 1;
  } else {
    log('  ✓ components.json');
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = readJsonFile(pkgPath, 'package.json');
  if (pkg.main !== 'expo-router/entry') {
    warn('package.json "main" should be "expo-router/entry"');
    issues += 1;
  } else {
    log('  ✓ package.json main');
  }

  const tabsPath = path.join(projectRoot, config.paths.lib ?? 'src/lib', 'tabs.ts');
  const usesLiquidGlass = fs.existsSync(tabsPath) || config.installed?.['liquidglass-tab'];
  if (usesLiquidGlass) {
    if (!fs.existsSync(tabsPath)) {
      warn('No src/lib/tabs.ts — run: expo-kit add liquidglass-tab');
      issues += 1;
    } else {
      log('  ✓ src/lib/tabs.ts');
      const installedVersion = config.installed?.['liquidglass-tab'];
      const pkgVersion = getPackageVersion();
      if (installedVersion && installedVersion !== pkgVersion) {
        warn(
          `Template is ${installedVersion}, CLI is ${pkgVersion} — run: npx @expokit/cli@latest update`
        );
        issues += 1;
      } else if (installedVersion) {
        log(`  ✓ template version ${installedVersion}`);
      }
      const tabNames = parseTabNamesFromConfig(projectRoot, config);
      const tabsDir = path.join(projectRoot, config.paths.app ?? 'src/app', '(tabs)');

      for (const tabName of tabNames) {
        const fileName = tabName === 'index' ? 'index.tsx' : `${tabName}.tsx`;
        const routePath = path.join(tabsDir, fileName);
        if (!fs.existsSync(routePath)) {
          warn(`Missing route for tab "${tabName}": ${path.relative(projectRoot, routePath)}`);
          console.log(`    Fix: add the file or run expo-kit add liquidglass-tab --force`);
          issues += 1;
        } else {
          log(`  ✓ route ${path.relative(projectRoot, routePath)}`);
        }
      }

      for (const dep of TAB_TEMPLATE_PEERS) {
        const installed =
          pkg.dependencies?.[dep] ||
          pkg.devDependencies?.[dep] ||
          fs.existsSync(path.join(projectRoot, 'node_modules', dep));
        if (!installed) {
          warn(`Missing dependency: ${dep}`);
          issues += 1;
        }
      }
    }
  }

  console.log('');
  if (issues === 0) {
    log('All checks passed.');
    return;
  }
  fail(`${issues} issue(s) found.`);
}

// ---------------------------------------------------------------------------
// mcp: MCP server for AI assistants (bin/mcp.mjs) + `mcp init --client <name>`
// ---------------------------------------------------------------------------

const MCP_SERVER = { command: 'npx', args: ['-y', '@expokit/cli@latest', 'mcp'] };

/** Project config file each client reads, and how our server entry goes into it. */
const MCP_CLIENTS = {
  claude: { file: '.mcp.json', key: 'mcpServers', entry: MCP_SERVER, label: 'Claude Code' },
  cursor: { file: '.cursor/mcp.json', key: 'mcpServers', entry: MCP_SERVER, label: 'Cursor' },
  vscode: { file: '.vscode/mcp.json', key: 'servers', entry: { type: 'stdio', ...MCP_SERVER }, label: 'VS Code' },
};

const CODEX_TOML = `[mcp_servers.expokit]
command = "npx"
args = ["-y", "@expokit/cli@latest", "mcp"]`;

async function cmdMcp(args, cwd) {
  if (args[0] !== 'init') {
    if (args.length) fail(`Unknown mcp option "${args[0]}". Use: mcp | mcp init --client <claude|cursor|vscode|codex>`);
    const { startMcpServer } = await import('./mcp.mjs');
    startMcpServer({ registryDir: REGISTRY_DIR, version: getPackageVersion(), aliases: ALIASES });
    return;
  }
  const i = args.findIndex((a) => a === '--client' || a.startsWith('--client='));
  const client = i < 0 ? undefined : args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
  const names = [...Object.keys(MCP_CLIENTS), 'codex'].join('|');
  if (!client) fail(`Pick a client: expo-kit mcp init --client <${names}>`);

  if (client === 'codex') {
    log('Codex reads MCP servers from ~/.codex/config.toml (shared by every project). Add:\n');
    console.log(`${CODEX_TOML}\n`);
    return;
  }
  const spec = MCP_CLIENTS[client];
  if (!spec) fail(`Unknown client "${client}". Use: ${names}`);

  const root = findProjectRoot(cwd) ?? cwd;
  const file = path.join(root, spec.file);
  let config = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    try {
      config = text.trim() ? parseJsonc(text) : {};
    } catch {
      fail(`${spec.file} could not be parsed — fix it, or add this under "${spec.key}":\n${JSON.stringify({ expokit: spec.entry }, null, 2)}`);
    }
    if (hasJsoncExtras(text)) {
      warn(`${spec.file} has comments or trailing commas; add this under "${spec.key}" yourself:`);
      console.log(JSON.stringify({ expokit: spec.entry }, null, 2));
      return;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail(`${spec.file} must be a JSON object.`);
  }
  const existing = config[spec.key]?.expokit;
  if (existing && JSON.stringify(existing) === JSON.stringify(spec.entry)) {
    log(`${spec.file} already has the expokit server.`);
    return;
  }
  config[spec.key] = { ...(config[spec.key] ?? {}), expokit: spec.entry };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  log(`${existing ? 'Updated' : 'Added'} the expokit MCP server in ${path.relative(cwd, file) || spec.file}.`);
  log(`Restart ${spec.label} (or reload its MCP servers), then ask it e.g. "add an ExpoKit bottom sheet".`);
}

function printHelp() {
  console.log(`
expo-kit — copy-paste Expo UI (shadcn-style)

Usage:
  npx @expokit/cli@latest init
  npx @expokit/cli@latest add <name...> [--dry-run] [--force]
  npx @expokit/cli@latest update [name] [--dry-run] [--force]
  npx @expokit/cli@latest doctor
  npx @expokit/cli@latest add --list
  npx @expokit/cli@latest login [--token <token>]
  npx @expokit/cli@latest logout
  npx @expokit/cli@latest whoami
  npx @expokit/cli@latest mcp
  npx @expokit/cli@latest mcp init --client <claude|cursor|vscode|codex>

Examples:
  npx @expokit/cli@latest add liquidglass-tab --dry-run
  npx @expokit/cli@latest add liquidglass-tab --force
  npx @expokit/cli@latest update
  npx @expokit/cli@latest update liquidglass-tab
  npx @expokit/cli@latest doctor

Note: expo-kit copies files into your app (like shadcn). npm updates do NOT
auto-sync — run \`update\` after upgrading the package.

\`update\` currently has smart refresh paths only for liquidglass-tab (framework
files; tabs.ts kept). Other items: use \`add <name> --force\` to overwrite.

Pro items (marked PRO in \`add --list\`): create a token at ${SITE_URL}/account,
run \`login\`, then \`add\` them like any other item. Credentials live in
~/.expo-kit/credentials.json (or set EXPO_KIT_TOKEN). EXPO_KIT_URL overrides the
site (https only; http just for localhost). A saved token is only sent to the site
it was created for (or ${DEFAULT_SITE_URL}).

AI assistants: \`mcp\` runs an MCP server (stdio) that lets Claude Code, Cursor,
VS Code or Codex search ExpoKit, read props and examples, and get the add command.
\`mcp init --client <name>\` writes the client's project config (.mcp.json,
.cursor/mcp.json, .vscode/mcp.json) or prints the Codex snippet.

Config: components.json (created by init)
`);
}

async function main(command, rest) {
  switch (command) {
    case 'init': {
      const { flags } = parseFlags(rest);
      cmdInit(process.cwd(), flags);
      break;
    }
    case 'add':
      await cmdAdd(rest, process.cwd());
      break;
    case 'update':
      await cmdUpdate(rest, process.cwd());
      break;
    case 'login':
      await cmdLogin(rest);
      break;
    case 'logout':
      cmdLogout();
      break;
    case 'whoami':
      await cmdWhoami();
      break;
    case 'doctor':
      cmdDoctor(process.cwd());
      break;
    case 'mcp':
      await cmdMcp(rest, process.cwd());
      break;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      fail(`Unknown command "${command}". Use: init | add | update | doctor | login | logout | whoami | mcp`);
  }
}

const [, , command, ...rest] = process.argv;
try {
  await main(command, rest);
} catch (e) {
  if (e instanceof CliError) fail(e.message);
  fail(`Unexpected error: ${e?.stack ?? e?.message ?? e}`);
}
