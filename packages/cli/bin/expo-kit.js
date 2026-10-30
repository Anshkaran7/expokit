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
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  CliError,
  DEFAULT_SITE_URL,
  addTsconfigPathAlias,
  aliasRootFromTsconfig,
  aliasTargetForDir,
  canSendToken,
  caseClash,
  contentHash,
  envWithoutToken,
  fileStatus,
  hasJsoncExtras,
  isInsideDir,
  isSafePackageSpec,
  isSafeTabName,
  isValidItemName,
  kitThemeSource,
  kitVersion,
  looksLikeKitFile,
  mergeDependencies,
  missingPackages,
  normalizeInstalled,
  parseJsonc,
  parseSiteUrl,
  retryDelayMs,
  recordedHash,
  retryHint,
  rewriteKitImports,
  suggestItemNames,
  tabComponentName,
  telemetryEnabled,
  themeOptions,
  needsDevBuild,
  pickMainExport,
  unifiedDiff,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(PACKAGE_ROOT, 'registry');

/** Website that serves Pro items (GET /api/registry/<name>) and issues CLI tokens (/account). */
const SITE_URL = (process.env.EXPO_KIT_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const CREDENTIALS_DIR = path.join(os.homedir(), '.expo-kit');
/** How users run the CLI. Bare `expo-kit` only works once installed, and `npx expo-kit` would fetch an unrelated npm package. */
const RUN = 'npx @expokit/cli@latest';
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');
/** Env for `npx expo install` / create-expo-app: they run third-party install scripts that never need the Pro token. */
const childEnv = envWithoutToken(process.env);

const DEFAULT_ALIASES = {
  components: '@/components',
  lib: '@/lib',
  hooks: '@/hooks',
};

const SRC_PATHS = {
  components: 'src/components',
  lib: 'src/lib',
  hooks: 'src/hooks',
  app: 'src/app',
};

const ROOT_PATHS = {
  components: 'components',
  lib: 'lib',
  hooks: 'hooks',
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

/** Stops the current command with a user-facing message (main prints it and exits 1; a batch `add` records it per item). */
function fail(msg) {
  throw new CliError(msg);
}

function die(msg) {
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

/** Flags that take a value (`--dir x` or `--dir=x`), with the example shown when it's missing. */
const VALUE_FLAGS = {
  dir: '--dir components/kit',
  brand: '--brand "#6366f1"',
  font: '--font Inter',
  radius: '--radius 14',
  scheme: '--scheme dark',
};

function parseFlags(argv) {
  const flags = { dryRun: false, force: false, format: true, dir: null, yes: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const name = /^--([a-z]+)(=|$)/.exec(arg)?.[1];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--no-format') flags.format = false;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (name && Object.hasOwn(VALUE_FLAGS, name)) {
      const value = arg === `--${name}` ? argv[(i += 1)] : arg.slice(name.length + 3);
      if (!value || value.startsWith('--')) fail(`--${name} needs a value, e.g. ${VALUE_FLAGS[name]}`);
      flags[name] = value;
    } else if (arg === '--list' || arg === '-l') positional.push('--list');
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
    $schema: 'https://expokit.in/schema.json',
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
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new CliError('components.json must contain a JSON object. Fix it and re-run.');
  const paths = { ...defaults.paths, ...user.paths };
  // Every write goes to path.join(projectRoot, paths.*): a "../" from a cloned repo would land outside the app.
  for (const [key, value] of Object.entries(paths)) {
    if (value === null || value === undefined) continue; // falls back to the default folder
    if (typeof value !== 'string' || !isInsideDir(projectRoot, value)) {
      throw new CliError(`components.json paths.${key} (${JSON.stringify(value)}) must be a folder inside the project. Fix it and re-run.`);
    }
  }
  const aliases = { ...defaults.aliases, ...user.aliases };
  // Aliases are written into the copied files' import lines: a quote or space would be code, not a path.
  for (const [key, value] of Object.entries(aliases)) {
    if (typeof value !== 'string' || !/^[@~#$]?[A-Za-z0-9_.\/-]*$/.test(value) || value.length > 100) {
      throw new CliError(`components.json aliases.${key} (${JSON.stringify(value)}) must be an import alias like "@/components". Fix it and re-run.`);
    }
  }
  return {
    ...defaults,
    ...user,
    aliases,
    paths,
    installed: normalizeInstalled(user.installed),
    files: cleanFileHashes(user.files),
    configPath,
  };
}

/** components.json `files` (project path → sha256 of the file as the CLI last wrote it), malformed entries dropped. */
function cleanFileHashes(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
  return Object.fromEntries(Object.keys(files).flatMap((rel) => (recordedHash(files, rel) ? [[rel, files[rel]]] : [])));
}

function saveConfig(projectRoot, config) {
  const { configPath, ...data } = config;
  fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
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

/** Project folder (relative) each registry src/<folder> lands in. */
function folderDest(config, folder) {
  const dest = {
    app: config.paths.app ?? 'src/app',
    components: config.paths.components ?? 'src/components',
    lib: config.paths.lib ?? 'src/lib',
    constants: config.paths.constants ?? 'src/constants',
    hooks: config.paths.hooks ?? 'src/hooks',
  };
  return dest[folder] ?? `src/${folder}`;
}

function registryPathToProjectPath(registryRel, config, projectRoot) {
  const [folder, ...rest] = registryRel.split('/');
  return path.join(projectRoot, folderDest(config, folder), ...rest);
}

/** A registry file as it lands in this project: its @/components and @/lib imports follow components.json aliases. */
function registryText(srcPath, config) {
  const text = fs.readFileSync(srcPath, 'utf8');
  return /\.(tsx?|jsx?)$/.test(srcPath) ? rewriteKitImports(text, config.aliases) : text;
}

let aliasIndex = null;

/** alias → item name: the built-in ones plus every item's `aliases` (grain-gradient → grain). */
function localAliases() {
  if (aliasIndex) return aliasIndex;
  aliasIndex = new Map(Object.entries(ALIASES));
  for (const file of fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'))) {
    const meta = tryReadJsonFile(path.join(REGISTRY_DIR, file));
    for (const alias of Array.isArray(meta?.aliases) ? meta.aliases : []) {
      if (isValidItemName(alias) && !aliasIndex.has(alias)) aliasIndex.set(alias, meta.name);
    }
  }
  return aliasIndex;
}

function resolveRegistryName(name) {
  const key = String(name).toLowerCase();
  if (isValidItemName(key) && readMeta(key)) return key;
  return localAliases().get(key) ?? key;
}

/** " Did you mean: button?" for a name this CLI doesn't know, or "". */
function didYouMean(name) {
  const items = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
  const aliases = localAliases();
  const close = suggestItemNames(name, [...items, ...aliases.keys()]).map((n) => aliases.get(n) ?? n);
  const unique = [...new Set(close)];
  return unique.length ? ` Did you mean: ${unique.join(', ')}?` : '';
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
    if (!isValidItemName(resolved)) fail(`Unknown item "${name}".${didYouMean(resolved)} Run: ${RUN} add --list`);
    // Not in this package's registry — it may be newer than this CLI. Ask the site before giving up.
    const remoteMeta = { name: resolved, title: resolved, tier: 'pro', dependencies: [], unknownLocally: true };
    try {
      return await stageRemoteItem(remoteMeta, resolved);
    } catch (e) {
      if (e instanceof CliError) e.message += didYouMean(resolved);
      throw e;
    }
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
  if (pro) log(`PRO items need an ExpoKit Pro plan — run \`${RUN} login\` (tokens: ${SITE_URL}/account).\n`);
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
      ? `Refusing to send EXPO_KIT_TOKEN to ${target} (only ${DEFAULT_SITE_URL} or localhost receive it). Unset EXPO_KIT_URL, or run \`${RUN} login\` against that site.`
      : `Your saved token was created for ${creds.url ?? DEFAULT_SITE_URL}, so it won't be sent to ${target}. ` +
        `Unset EXPO_KIT_URL, or run \`${RUN} login\` with EXPO_KIT_URL=${target} to save a token for that site.`
  );
}

function writeCredentials(data) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(CREDENTIALS_PATH, 0o600); // also when the file already existed
}

async function siteFetch(url, token) {
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      // A request that carries the token never follows a redirect: the token goes to SITE_URL's origin only.
      redirect: token ? 'manual' : 'follow',
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    fail(
      `Network error: couldn't reach ${SITE_URL} (${e?.cause?.code ?? e?.name ?? e?.message ?? e}). ` +
        'Check your connection (or EXPO_KIT_URL) and try again.'
    );
  }
}

/** Rate limited (429) or briefly unavailable (503): worth one polite retry. */
const BUSY_STATUSES = new Set([429, 503]);

async function apiGet(pathname, token) {
  parseSiteUrl(SITE_URL); // https only (http just for localhost) — throws CliError
  const url = `${SITE_URL}${pathname}`;
  let res = await siteFetch(url, token);
  if (BUSY_STATUSES.has(res.status)) {
    // Wait what the server asks (plus jitter so a crowd of CLIs doesn't come back in lockstep), then try once more.
    // When it asks for more than 10 s, don't knock early: skip the retry and just say when to try again.
    const wait = retryDelayMs(res.headers.get('retry-after'));
    if (wait !== null) {
      await res.arrayBuffer().catch(() => {});
      log(`${new URL(SITE_URL).host} is busy (HTTP ${res.status}) — trying again in ${Math.max(1, Math.ceil(wait / 1000))} s…`);
      await sleep(wait + Math.floor(Math.random() * 500));
      res = await siteFetch(url, token);
    }
  }
  if (token && res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    fail(
      `${SITE_URL} answered with a redirect (HTTP ${res.status}${location ? ` to ${location}` : ''}). ` +
        `Your token is only sent to ${new URL(SITE_URL).origin} directly, so nothing was sent on. ` +
        'Check EXPO_KIT_URL, or update the CLI: npx @expokit/cli@latest'
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page, …)
  }
  if (BUSY_STATUSES.has(res.status)) {
    const why = res.status === 429 ? 'is limiting requests (HTTP 429).' : "is temporarily unavailable (HTTP 503) — this isn't a problem with your token.";
    const hint = typeof body?.message === 'string' && body.message ? body.message : `Try again ${retryHint(res.headers.get('retry-after'))}.`;
    fail(`${SITE_URL} ${why} ${hint}`);
  }
  return { status: res.status, ok: res.ok, body };
}

function failServerError(status, what) {
  fail(`Server error from ${SITE_URL} (HTTP ${status}) while ${what}. This isn't a problem with your token — try again in a moment.`);
}

/** Pro items already downloaded in this run, so `add a b c` and `update --force` fetch a shared dep (e.g. glass) once. */
const remoteItemCache = new Map();

/** The 401 message for a saved or given token: expired (the site says `token_expired`) or invalid / revoked. */
function rejectedToken(body, which) {
  return body?.error === 'token_expired'
    ? `${which} has expired. Create a new one at ${SITE_URL}/account and run \`${RUN} login\`.`
    : `${which} is invalid or was revoked. Create a new one at ${SITE_URL}/account and run \`${RUN} login\`.`;
}

/** " · token expires Jan 5, 2027" when the site sent an expiry, else "". */
function expiryNote(body) {
  const at = body?.expiresAt ? new Date(body.expiresAt) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return ` · token expires ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** Downloads one Pro item (own files only). Exits with a clear message on 401 / 403 / 429 / 5xx. */
async function fetchRemoteItem(name, { unknownLocally = false } = {}) {
  if (remoteItemCache.has(name)) return remoteItemCache.get(name);
  const creds = readCredentials();
  assertTokenTarget(creds);
  const { status, ok, body } = await apiGet(`/api/registry/${encodeURIComponent(name)}`, creds?.token);
  if (ok && body && Array.isArray(body.files)) {
    remoteItemCache.set(name, body);
    return body;
  }
  if (status === 404 && unknownLocally) fail(`Unknown item "${name}". Run: ${RUN} add --list`);
  if (status >= 500) failServerError(status, `downloading "${name}"`);
  if (status === 401 && !creds) {
    fail(
      `"${name}" is a Pro item and you're not logged in.\n` +
        `  1. Create a token at ${SITE_URL}/account\n` +
        `  2. Run: npx @expokit/cli@latest login`
    );
  }
  if (status === 401) {
    fail(rejectedToken(body, `Your token (${creds.source})`));
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

/** Reads one line from the terminal without echoing it (for tokens), so it stays off the screen and out of scrollback. */
function promptSecret(question) {
  process.stdout.write(question);
  const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise((resolve) => {
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      process.exit(130);
    });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/**
 * First non-blank line of a non-TTY stdin (`printf %s "$TOKEN" | … login`, or typed into a console without a TTY):
 * the token never lands in argv, shell history or `ps`.
 */
async function readTokenFromStdin() {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += chunk;
    // Stop at the first non-blank line: a pipe left open (Git Bash/mintty, IDE consoles) never sends EOF after Enter.
    if (/\S.*\n/.test(data)) break;
    if (data.length > 4096) break; // a token is ~50 chars; don't slurp a whole file
  }
  return data.trim().split(/\r?\n/)[0].trim();
}

async function cmdLogin(args) {
  const i = args.findIndex((a) => a === '--token' || a.startsWith('--token='));
  let token = i === -1 ? '' : args[i].includes('=') ? args[i].slice('--token='.length) : args[i + 1] ?? '';
  if (i !== -1) warn('--token leaves the token in your shell history. Prefer the prompt, piping it in, or EXPO_KIT_TOKEN.');
  if (!token) {
    if (process.stdin.isTTY) {
      log(`Create a CLI token at ${SITE_URL}/account (signed in), then paste it here (it won't be shown).`);
      token = await promptSecret('Token: ');
    } else {
      log(`Paste your token from ${SITE_URL}/account and press Enter (or pipe it in)…`);
      token = await readTokenFromStdin();
      if (!token) {
        fail(`No token given. Pipe it in (printf %s "$TOKEN" | ${RUN} login) or set EXPO_KIT_TOKEN. Tokens: ${SITE_URL}/account`);
      }
    }
  }
  token = token.trim();
  if (!token) fail('No token given.');

  const site = parseSiteUrl(SITE_URL);
  log(`Verifying the token with ${site.host} — it will only be sent to ${site.origin}.`);
  if (site.origin !== new URL(DEFAULT_SITE_URL).origin) warn(`${site.origin} is not the default site (EXPO_KIT_URL is set).`);
  const { status, ok, body } = await apiGet('/api/cli/whoami', token);
  if (status === 401) fail(rejectedToken(body, 'That token'));
  if (status >= 500) failServerError(status, 'verifying the token');
  if (!ok) fail(`Couldn't verify the token (HTTP ${status}). Check your network and ${SITE_URL}, then try again.`);

  writeCredentials({ token, url: site.origin, savedAt: new Date().toISOString() });
  log(`Saved to ${CREDENTIALS_PATH} (readable only by you).`);
  if (ok && body) {
    log(
      (body.pro ? `Logged in — Pro is unlocked (${body.plan} plan).` : `Logged in on the ${body.plan} plan. Pro items need Pro: ${SITE_URL}/pricing`) +
        expiryNote(body)
    );
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
  if (!creds) fail(`Not logged in. Run: ${RUN} login (tokens: ${SITE_URL}/account)`);
  assertTokenTarget(creds);
  const { status, ok, body } = await apiGet('/api/cli/whoami', creds.token);
  if (status === 401) fail(rejectedToken(body, `Your token (${creds.source})`));
  if (status >= 500) failServerError(status, 'checking your token');
  if (!ok || !body) fail(`Couldn't check your token (HTTP ${status}).`);
  log(`User ${body.userId} · ${body.plan} plan · Pro ${body.pro ? 'unlocked' : 'locked'}${expiryNote(body)} · ${SITE_URL}`);
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

/** Every file an item writes: its registry source, where it lands, and its path under src/ in the registry. */
function registryFiles(filesRoot, projectRoot, config) {
  const registrySrc = path.join(filesRoot, 'src');
  if (!fs.existsSync(registrySrc)) fail('Registry layout must include src/ folder.');
  const files = [];
  for (const entry of fs.readdirSync(registrySrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const from = path.join(registrySrc, entry.name);
    for (const src of collectFiles(from, from)) {
      const registryRel = path.relative(registrySrc, src).split(path.sep).join('/');
      files.push({ src, registryRel, dest: registryPathToProjectPath(registryRel, config, projectRoot) });
    }
  }
  return files;
}

/**
 * The existing path that differs from `dest` (or one of its folders) only by case — `components/ui/Skeleton.tsx`
 * for `components/ui/skeleton.tsx` — or null. Read from the folder listings, so it's the same answer on every OS.
 */
function caseClashOf(projectRoot, dest) {
  let dir = projectRoot;
  for (const seg of path.relative(projectRoot, dest).split(path.sep)) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return null; // folder doesn't exist yet: nothing below it can clash
    }
    const twin = caseClash(names, seg);
    if (twin) return path.join(dir, twin);
    dir = path.join(dir, seg);
  }
  return null;
}

const posixRel = (projectRoot, file) => path.relative(projectRoot, file).split(path.sep).join('/');

/** Whether diffs get colour: a terminal, and NO_COLOR unset. */
const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** At most this many lines of one file's diff are printed; `diff <item>` is the place for the rest. */
const DIFF_LINE_LIMIT = 120;

/** A unified diff as printable lines (coloured in a terminal), cut at DIFF_LINE_LIMIT. */
function diffLines(diff, more = '') {
  const lines = diff.replace(/\n$/, '').split('\n');
  const paint = (line) => {
    if (!COLOR || /^(---|\+\+\+) /.test(line)) return line;
    if (line.startsWith('+')) return `\x1b[32m${line}\x1b[0m`;
    if (line.startsWith('-')) return `\x1b[31m${line}\x1b[0m`;
    if (line.startsWith('@@')) return `\x1b[36m${line}\x1b[0m`;
    return line;
  };
  const shown = lines.slice(0, DIFF_LINE_LIMIT).map(paint);
  if (lines.length > DIFF_LINE_LIMIT) shown.push(`… ${lines.length - DIFF_LINE_LIMIT} more line(s)${more}`);
  return shown;
}

/**
 * What `add` / `update` would do with each file of an item, decided before anything is written:
 *   write (new) · same (already identical) · refresh (ours and untouched since: components.json's hash matches) ·
 *   keep (shared kit file you edited) · overwrite (--force)
 * plus `problems` that stop the whole item: a different-case twin (never replaced, --force included), a file of
 * yours where the item needs one of ours, a file you changed since it was installed, or a kept kit.tsx that is too old.
 * `flags.update`: liquidglass-tab only refreshes its framework files (tabs.ts and screens are yours), and changed
 * files are reported with their diff.
 */
function planItem(item, projectRoot, config, flags) {
  const { meta, filesRoot, resolved } = item;
  const shared = new Set(meta.sharedFiles ?? []);
  const files = [];
  const problems = [];
  const theirs = [];
  const conflicts = [];
  const componentsDir = posixRel(projectRoot, path.join(projectRoot, config.paths.components ?? 'src/components'));
  const kitDir = `${componentsDir}/kit`;
  const frameworkOnly = flags.update && !flags.force && resolved === 'liquidglass-tab';

  for (const { src, dest, registryRel } of registryFiles(filesRoot, projectRoot, config)) {
    if (frameworkOnly && !LIQUIDGLASS_FRAMEWORK_PATHS.includes(registryRel)) continue;
    const rel = posixRel(projectRoot, dest);
    const twin = caseClashOf(projectRoot, dest);
    if (twin) {
      const inComponents = registryRel.startsWith('components/');
      problems.push(
        `${rel} clashes with your ${posixRel(projectRoot, twin)} (macOS and Windows treat them as one file, so it would replace yours).`,
        inComponents
          ? `  • Install it next to yours: ${RUN} add ${resolved} --dir ${kitDir}`
          : `  • Rename or move your ${posixRel(projectRoot, twin)}, then add ${resolved} again.`,
        `  • Or keep yours as it is: nothing was written for ${resolved}.`
      );
      continue;
    }
    const text = registryText(src, config);
    let stat = null;
    try {
      stat = fs.lstatSync(dest);
    } catch {
      // doesn't exist yet
    }
    if (!stat) {
      files.push({ rel, dest, text, registryRel, action: 'write' });
      continue;
    }
    // Never write through a link (it could point anywhere, e.g. from a cloned repo) or over a folder.
    if (stat.isSymbolicLink() || !stat.isFile()) {
      problems.push(`${rel} is a ${stat.isSymbolicLink() ? 'symlink' : 'folder'}, so it isn't replaced (not even with --force). Move it, then add ${resolved} again.`);
      continue;
    }
    const have = fs.readFileSync(dest, 'utf8');
    const status = fileStatus(recordedHash(config.files, rel), have, text);
    if (status === 'current') {
      files.push({ rel, dest, text, registryRel, action: 'same' });
    } else if (status === 'pristine') {
      // Written by the CLI and untouched since (its hash is the one components.json recorded): safe to refresh.
      files.push({ rel, dest, text, registryRel, action: 'refresh' });
    } else if (shared.has(registryRel) && looksLikeKitFile(have)) {
      // A kit file you edited: kept, unless it's too old for this item (missing kit API would crash at runtime).
      const need = kitVersion(text);
      const got = kitVersion(have);
      if (!flags.force && need !== null && got !== null && got < need) {
        problems.push(
          `${meta.title} needs a newer kit than your edited ${rel} (kit v${got}, needs v${need}).`,
          `  • Re-run with --force to replace it (your edits to it are lost — back it up first), or merge the new version by hand.`
        );
      }
      files.push({ rel, dest, text, registryRel, action: flags.force ? 'overwrite' : 'keep' });
    } else if (flags.force) {
      files.push({ rel, dest, text, registryRel, action: 'overwrite' });
    } else if (shared.has(registryRel)) {
      theirs.push(rel);
    } else {
      conflicts.push({ rel, have, text, status });
    }
  }

  if (theirs.length) {
    problems.push(
      `${theirs.join(', ')} already exist${theirs.length === 1 ? 's' : ''} and isn't an ExpoKit file, but ${meta.title} imports ExpoKit's version from there.`,
      ...(theirs.some((r) => r.startsWith(`${componentsDir}/`)) ? [`  • Install the kit's copy elsewhere: ${RUN} add ${resolved} --dir ${kitDir}`] : []),
      `  • Or replace yours (it is lost): ${RUN} add ${resolved} --force`
    );
  }
  if (conflicts.length && flags.update) {
    problems.push(
      `${conflicts.length} file(s) changed since ${meta.title} was installed, so none of it was updated:`,
      ...conflicts.flatMap((c) => [
        `  • ${c.rel}${c.status === 'untracked' ? ' (no install record: added by an older CLI)' : ''}`,
        ...diffLines(unifiedDiff(c.have, c.text, { from: `${c.rel} (yours)`, to: `${c.rel} (upstream)` }), ` — see: ${RUN} diff ${resolved}`).map(
          (line) => `      ${line}`
        ),
      ]),
      `  • Keep yours: nothing was changed. Copy the upstream lines (+) you want into your file; update lists it until it matches.`,
      `  • Take upstream (your changes are lost): ${RUN} update ${resolved} --force`
    );
  } else if (conflicts.length) {
    problems.push(
      `Would overwrite ${conflicts.length} file(s) that differ from ${meta.title}:`,
      ...conflicts.map((c) => `  • ${c.rel}`),
      `  • See what differs: ${RUN} diff ${resolved}`,
      `  • Replace them (your changes are lost): ${RUN} add ${resolved} --force`
    );
  }
  return { files, problems };
}

/** Writes a planned item. Returns the project files it wrote (for Prettier). */
function applyPlan(plan) {
  const written = [];
  for (const file of plan.files) {
    if (file.action === 'same') continue;
    if (file.action === 'keep') {
      log(`  = ${file.rel} (shared file kept — use --force to replace)`);
      continue;
    }
    if (file.action === 'overwrite') warn(`Overwriting ${file.rel}`);
    fs.mkdirSync(path.dirname(file.dest), { recursive: true });
    fs.writeFileSync(file.dest, file.text);
    written.push(file.dest);
    log(`  ${file.action === 'refresh' ? '~' : '+'} ${file.rel}${file.action === 'refresh' ? ' (updated)' : ''}`);
  }
  return written;
}

function printPlan(plan) {
  for (const file of plan.files) {
    const what = {
      write: 'would write',
      same: 'unchanged',
      refresh: 'would update',
      keep: 'would keep (shared, yours)',
      overwrite: 'would overwrite',
    }[file.action];
    log(`  ${what} ${file.rel}`);
  }
}

/**
 * After a write: components.json remembers each file's hash as it now is on disk (after Prettier), so the next
 * `update` / `add` can tell "ours, untouched" from "you changed it". Kept files (your edits) keep their old record.
 */
function recordInstall(config, name, plan, dir) {
  for (const file of plan.files) {
    if (file.action === 'keep') continue;
    try {
      config.files[file.rel] = contentHash(fs.readFileSync(file.dest, 'utf8'));
    } catch {
      delete config.files[file.rel];
    }
  }
  const entry = { version: getPackageVersion() };
  const kit = plan.files.find((f) => f.registryRel === 'lib/kit.tsx');
  if (kit) {
    try {
      const v = kitVersion(fs.readFileSync(kit.dest, 'utf8'));
      if (v !== null) entry.kitVersion = v;
    } catch {
      // unreadable: no version to record
    }
  }
  if (dir) entry.dir = dir;
  config.installed[name] = entry;
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
    // Names come from the user's tabs.ts and become file names: never let one be a path.
    if (!isSafeTabName(tabName)) {
      warn(`Skipping tab ${JSON.stringify(tabName)} in tabs.ts: route names may only use letters, numbers and - _ . ( ) [ ]`);
      continue;
    }
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
  log(`Installing ${packages.join(', ')}…`);
  // npm's own output (engine warnings, audit notes) stays hidden unless the install fails.
  const result = spawnSync('npx', ['expo', 'install', ...packages], {
    cwd: projectRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    const lines = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split(/\r?\n/)
      .filter((line) => line.trim() && !/\bEBADENGINE\b|^npm warn (engine|  )/i.test(line));
    if (lines.length) console.log(lines.slice(-25).join('\n'));
    warn(`expo install failed${result.error ? ` (${result.error.message})` : ''} — run it yourself:`);
    console.log(`  npx expo install ${packages.join(' ')}`);
    return false;
  }
  return true;
}

/** The project's own Prettier (node_modules/.bin), when package.json lists it; never a download. */
function projectPrettier(projectRoot, pkg) {
  if (!pkg?.dependencies?.prettier && !pkg?.devDependencies?.prettier) return null;
  const bin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
  return fs.existsSync(bin) ? bin : null;
}

/** Formats the files `add` wrote with the project's Prettier config, so `npm run lint` / `format --check` pass. */
function formatWritten(projectRoot, pkg, files, flags) {
  // Windows runs prettier.cmd through a shell: only plain paths go on its command line.
  const rels = files.map((f) => path.relative(projectRoot, f)).filter((rel) => /^[A-Za-z0-9_.()[\]\/\\-]+$/.test(rel));
  if (!flags.format || !rels.length) return;
  const bin = projectPrettier(projectRoot, pkg);
  if (!bin) return;
  if (flags.dryRun) {
    log('  would format the new files with your Prettier config (--no-format to skip)');
    return;
  }
  const result = spawnSync(bin, ['--write', '--log-level', 'warn', ...rels], {
    cwd: projectRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status === 0) log(`Formatted ${rels.length} file(s) with your Prettier config.`);
  else warn(`Prettier couldn't format the new files: ${(result.stderr || result.stdout || result.error?.message || '').trim().split('\n')[0]}`);
}

/** After an add: can the item run in Expo Go, or does it need a development build? */
function printRunHint(deps) {
  const native = needsDevBuild(deps);
  if (!native.length) {
    log('Runs in Expo Go: npx expo start, then scan the QR code with your phone.');
    return;
  }
  log(`Needs a development build (not in Expo Go): ${native.join(', ')}`);
  console.log('  • Build and run it: npx expo run:ios  or  npx expo run:android');
}

/** Folder names `init <dir>` will create: no paths, no spaces, nothing a shell could misread. */
const SAFE_APP_DIR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** `init my-app`: a new Expo app (create-expo-app) in ./my-app, then the usual init inside it. */
function createExpoApp(cwd, dir, flags) {
  if (!SAFE_APP_DIR.test(dir)) fail(`"${dir}" is not a valid folder name (letters, numbers, ".", "_" and "-").`);
  const target = path.join(cwd, dir);
  if (fs.existsSync(target) && fs.readdirSync(target).length) fail(`./${dir} already exists and is not empty.`);
  if (flags.dryRun) {
    log(`Would run: npx create-expo-app@latest ${dir} --yes`);
    log(`Would then set up ExpoKit in ./${dir}`);
    return null;
  }
  log(`Creating a new Expo app in ./${dir}…`);
  const result = spawnSync('npx', ['create-expo-app@latest', dir, '--yes'], {
    cwd,
    env: childEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 || !fs.existsSync(path.join(target, 'package.json'))) {
    fail(`create-expo-app failed. Create the app yourself (npx create-expo-app@latest ${dir}), then run ${RUN} init inside it.`);
  }
  return target;
}

/** Asks one theme question until the answer passes `check` (Enter keeps the default). */
async function ask(rl, question, check) {
  for (;;) {
    const answer = (await new Promise((resolve) => rl.question(question, resolve))).trim();
    try {
      check(answer);
      return answer;
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      warn(e.message.replace(/^--\w+ /, 'It '));
    }
  }
}

/** `init` in a terminal: brand colour, font, radius and light / dark, each skippable with Enter. */
async function askTheme() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    rl.close();
    process.stdout.write('\n');
    process.exit(130);
  });
  try {
    log('Theme (Enter keeps the default; change it later in the file init writes):');
    const brand = await ask(rl, '  Brand colour, hex (Enter: monochrome) › ', (v) => themeOptions({ brand: v }));
    const font = await ask(rl, '  Font family (Enter: system font) › ', (v) => themeOptions({ font: v }));
    const radius = await ask(rl, '  Corner radius in points (Enter: 12) › ', (v) => themeOptions({ radius: v }));
    const scheme = await ask(rl, '  light, dark or system (Enter: system) › ', (v) => themeOptions({ scheme: v }));
    return themeOptions({ brand, font, radius, scheme });
  } finally {
    rl.close();
  }
}

const THEME_FLAGS = ['brand', 'font', 'radius', 'scheme'];

/**
 * The theme step of `init`: adds kit.tsx (tracked like any add) and writes <lib>/kit-theme.tsx, an `AppTheme`
 * wrapper around KitProvider with the chosen values. An existing kit-theme.tsx is never replaced: the snippet is
 * printed instead.
 */
function writeTheme(projectRoot, config, theme, flags) {
  const pkg = readJsonFile(path.join(projectRoot, 'package.json'), 'package.json');
  const kitMeta = readMeta('kit');
  const kit = { meta: kitMeta, filesRoot: bundledFilesRoot(kitMeta), resolved: 'kit' };
  const plan = planItem(kit, projectRoot, config, { force: false });
  const written = [];
  if (plan.problems.length) {
    warn(`Couldn't add lib/kit.tsx, so no theme file was written:`);
    for (const line of plan.problems) console.log(`    ${line}`);
    return;
  }
  const source = kitThemeSource(theme, config.aliases.lib);
  const themePath = path.join(projectRoot, folderDest(config, 'lib'), 'kit-theme.tsx');
  const themeRel = posixRel(projectRoot, themePath);
  const exists = (() => {
    try {
      fs.lstatSync(themePath);
      return true;
    } catch {
      return false;
    }
  })();
  if (flags.dryRun) {
    printPlan(plan);
    log(exists ? `  would keep your ${themeRel}` : `  would write ${themeRel}`);
    return;
  }
  written.push(...applyPlan(plan));
  recordInstall(config, 'kit', plan, null);
  saveConfig(projectRoot, config);
  if (exists) {
    warn(`${themeRel} already exists, so it was kept. The theme you picked, to merge by hand:`);
    console.log(`\n${source}`);
  } else {
    fs.mkdirSync(path.dirname(themePath), { recursive: true });
    fs.writeFileSync(themePath, source);
    written.push(themePath);
    log(`  + ${themeRel}`);
  }
  formatWritten(projectRoot, pkg, written, flags);
  const lib = String(config.aliases.lib).replace(/\/+$/, '');
  log('Wrap your root layout (app/_layout.tsx) in it:');
  console.log(`  import { AppTheme } from "${lib}/kit-theme";`);
  console.log('  <AppTheme><Stack /></AppTheme>');
  console.log(`  Bring your own design system: ${SITE_URL}/docs/design-tokens`);
}

/**
 * `init`: components.json, the `@/*` alias and package.json "main", then the theme (flags, or questions in a
 * terminal). `theme: false` for the quiet init `add` runs on a project without components.json.
 */
async function cmdInit(cwd, flags, dir, { theme = true } = {}) {
  if (dir) {
    // Already inside an Expo app: `init <dir>` still means "create a new one there".
    themeOptions(flags); // a bad --brand fails before create-expo-app runs
    const target = createExpoApp(cwd, dir, flags);
    if (!target) return;
    await cmdInit(target, flags);
    log('');
    log(`Next: cd ${dir} && npx expo start — then scan the QR with Expo Go.`);
    return;
  }
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail(`Not inside an Expo project (expo dependency not found). Start a new app with: ${RUN} init my-app`);

  // Checked before anything is written: these values end up in a .tsx file.
  const themeGiven = THEME_FLAGS.some((k) => flags[k] !== undefined);
  let picked = themeOptions(flags);

  const configPath = path.join(projectRoot, 'components.json');
  if (fs.existsSync(configPath)) {
    if (!theme || !themeGiven) {
      warn(`components.json already exists.${theme ? ` To (re)write the theme: ${RUN} init --brand "#6366f1"` : ''}`);
      return;
    }
    writeTheme(projectRoot, loadConfig(projectRoot), picked, flags);
    return;
  }

  const { paths, aliasTarget, layout } = detectProjectLayout(projectRoot);
  const config = {
    $schema: 'https://expokit.in/schema.json',
    aliases: { ...DEFAULT_ALIASES },
    paths,
  };

  // Plan the tsconfig edit first: a broken tsconfig must not leave a half-initialised project.
  const tsPlan = planTsconfigAlias(projectRoot, aliasTarget);

  if (theme && !themeGiven && !flags.yes && !flags.dryRun && process.stdin.isTTY && process.stdout.isTTY) {
    picked = await askTheme();
  }

  if (flags.dryRun) {
    log(`Would create components.json (${layout} layout)`);
    if (tsPlan?.changed) log(`Would add @/* → ${aliasTarget[0]} in tsconfig.json`);
    ensureExpoRouterMain(projectRoot, true);
    if (theme) writeTheme(projectRoot, loadConfig(projectRoot), picked, flags);
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
  if (theme) writeTheme(projectRoot, loadConfig(projectRoot), picked, flags);
  log(`Done. Add items with: ${RUN} add <name>`);
}

/**
 * After a successful add: tells the site which item was installed — just its name, no token or project
 * data (README "Privacy"). Off with DO_NOT_TRACK=1 / EXPO_KIT_TELEMETRY=0 and in CI. Never fails the add.
 */
async function reportInstalled(names) {
  if (!telemetryEnabled(process.env) || !names.length) return;
  try {
    parseSiteUrl(SITE_URL);
    // The site takes small bodies (2 KB): a long batch goes in a few posts.
    for (let i = 0; i < names.length; i += 20) {
      const res = await fetch(`${SITE_URL}/api/cli/installed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: names.slice(i, i + 20) }),
        signal: AbortSignal.timeout(1500),
      });
      await res.arrayBuffer();
    }
  } catch {
    // offline, slow or blocked: the count just misses these
  }
}

/**
 * `add --dir <folder>`: this run's config with the registry's components/ going to <folder>, and their
 * `@/components/…` imports pointing there. The folder must be reachable through the project's `@/*` alias.
 */
function withComponentsDir(projectRoot, config, dir) {
  let aliasRoot = null;
  try {
    aliasRoot = aliasRootFromTsconfig(parseJsonc(fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8')));
  } catch {
    // no / unreadable tsconfig: fall back to the layout init would set up
  }
  if (aliasRoot === null) aliasRoot = detectProjectLayout(projectRoot).layout === 'src' ? 'src' : '';
  const alias = aliasTargetForDir(dir, aliasRoot);
  const example = `${aliasRoot ? `${aliasRoot}/` : ''}components/kit`;
  if (!alias || !isInsideDir(projectRoot, dir)) {
    fail(`--dir ${dir}: use a folder inside ${aliasRoot ? `${aliasRoot}/` : 'the project'} so "@/…" imports reach it, e.g. --dir ${example}`);
  }
  const folder = dir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return { ...config, paths: { ...config.paths, components: folder }, aliases: { ...config.aliases, components: alias } };
}

/** `import { X } from "…"` for an item's main component, or null when it has none (templates, lib-only items). */
function importLine(item, config) {
  const { filesRoot, resolved, meta } = item;
  const folder = ['ui', 'blocks', 'charts'].find((f) => fs.existsSync(path.join(filesRoot, 'src', 'components', f, `${resolved}.tsx`)));
  if (!folder) return null;
  const exported = pickMainExport(fs.readFileSync(path.join(filesRoot, 'src', 'components', folder, `${resolved}.tsx`), 'utf8'), [
    meta.title,
    resolved,
  ]);
  return exported ? `import { ${exported} } from "${(config.aliases.components ?? '@/components').replace(/\/+$/, '')}/${folder}/${resolved}";` : null;
}

/**
 * The config an item is written with: `--dir` (this run), else the folder it was installed into (components.json,
 * untrusted, so it goes through the same checks as --dir), else components.json's paths.
 */
function targetFor(projectRoot, config, name, flags) {
  const dir = flags.dir ?? (flags.update ? config.installed[name]?.dir : undefined);
  if (!dir) return { target: config, dir: null };
  const target = withComponentsDir(projectRoot, config, dir);
  return { target, dir: target.paths.components };
}

/** Items components.json says were added (plus a liquidglass-tab set up before it kept records). */
function installedNames(projectRoot, config) {
  return [...new Set([...Object.keys(config.installed), ...detectInstalledTemplates(projectRoot, config)])];
}

/**
 * Whether `name` is in this project: recorded in components.json, or (for projects from before the records) a
 * bundled item whose own files are there. Pro items need the record, so nothing is downloaded to find out.
 */
function isInstalled(projectRoot, config, name) {
  if (installedNames(projectRoot, config).includes(name)) return true;
  const meta = isValidItemName(name) ? readMeta(name) : null;
  const root = meta && bundledFilesRoot(meta);
  if (!root) return false;
  const shared = new Set(meta.sharedFiles ?? []);
  return registryFiles(root, projectRoot, config).some((f) => !shared.has(f.registryRel) && fs.existsSync(f.dest));
}

/**
 * `add a b c` / `update a b c`: every item is planned and written on its own (one that can't be added doesn't stop
 * the rest), then one `npx expo install` for the packages the items need and package.json doesn't list yet, then
 * the install records and a summary. Exits 1 when any item wasn't written. `flags.update`: only installed items,
 * and files you changed stop the item with their diff (unless --force).
 */
async function runBatch(names, projectRoot, config, flags, { report }) {
  const results = [];
  const written = [];

  for (const name of names) {
    console.log('');
    let item;
    let plan;
    let dir;
    try {
      if (flags.update && !isInstalled(projectRoot, config, resolveRegistryName(name))) {
        fail(`${resolveRegistryName(name)} isn't installed here. Add it: ${RUN} add ${resolveRegistryName(name)}`);
      }
      item = await loadRegistryItem(name);
      const where = targetFor(projectRoot, config, item.resolved, flags);
      dir = where.dir;
      item.target = where.target;
      plan = planItem(item, projectRoot, item.target, flags);
    } catch (e) {
      if (!(e instanceof CliError)) throw e;
      results.push({ name: item?.resolved ?? name, ok: false, lines: [e.message] });
      continue;
    }
    const { meta, resolved } = item;
    const verb = flags.update ? 'Updating' : 'Adding';
    log(`${flags.dryRun ? 'Dry run — ' : `${verb} `}${meta.title} (${resolved})…`);
    if (flags.dryRun) printPlan(plan);
    if (plan.problems.length) {
      results.push({ name: resolved, ok: false, lines: plan.problems });
      continue;
    }
    if (!flags.dryRun) written.push(...applyPlan(plan));
    if (flags.update && !flags.dryRun && plan.files.every((f) => f.action === 'same' || f.action === 'keep')) log('  already up to date');
    if (resolved === 'liquidglass-tab') {
      syncTabRoutes(projectRoot, item.target, flags);
      ensureExpoRouterMain(projectRoot, flags.dryRun);
    }
    results.push({ name: resolved, ok: true, item, plan, dir, importLine: importLine(item, item.target) });
  }

  const added = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const pkg = readJsonFile(path.join(projectRoot, 'package.json'), 'package.json');
  const deps = mergeDependencies(...added.map((r) => r.item.meta.dependencies ?? []));
  const missing = missingPackages(deps, pkg);
  const present = deps.filter((d) => !missing.includes(d));

  console.log('');
  formatWritten(projectRoot, pkg, written, flags);
  runExpoInstall(projectRoot, missing, flags.dryRun);
  if (present.length && !flags.update) log(`${flags.dryRun ? '  ' : ''}already in package.json: ${present.join(', ')}`);

  if (!flags.dryRun && added.length) {
    // Hashes are taken after Prettier, from the files as they are now. A one-off --dir is recorded per item,
    // never as the components.json default.
    for (const r of added) recordInstall(config, r.name, r.plan, r.dir);
    saveConfig(projectRoot, config);
    if (report) await reportInstalled(added.map((r) => r.name));
  }

  console.log('');
  for (const r of results) {
    if (r.ok) {
      log(`✓ ${r.name}${r.importLine && !flags.update ? `   ${r.importLine}` : ''}`);
    } else {
      log(`✗ ${r.name} — ${r.lines[0]}`);
      for (const line of r.lines.slice(1)) console.log(`    ${line}`);
    }
  }
  if (added.length && !flags.update) {
    console.log('');
    if (added.some((r) => r.name === 'liquidglass-tab')) {
      log('Next steps for liquidglass-tab:');
      console.log('  • Edit src/lib/tabs.ts — labels, icon presets, colors, screen text');
      console.log(`  • Run: ${RUN} doctor`);
      console.log('  • Build a dev client: npx expo run:ios (iOS 26 shows real Liquid Glass,');
      console.log('    iOS 18 and older, Android and web get the glass fallback bar)');
      console.log('  • After package updates: npx @expokit/cli@latest update');
    }
    if (added.some((r) => r.name !== 'liquidglass-tab')) printRunHint(deps);
  }
  if (written.length && flags.update) {
    console.log('');
    if (added.some((r) => r.name === 'liquidglass-tab') && !flags.force) log('Your tabs.ts and tab screens were kept — only framework files refresh.');
    log('Reload Metro (or rebuild the native app) to see the changes.');
  }
  if (failed.length) {
    const verb = flags.update ? 'updated' : 'added';
    fail(`${failed.length} of ${results.length} item(s) not ${verb} (${failed.map((r) => r.name).join(', ')}).${added.length ? ' The others were.' : ''}`);
  }
}

/** Project root + components.json for a command that needs both. */
function openProject(cwd, { needConfig }) {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project. Run from your app root.');
  if (needConfig && !fs.existsSync(path.join(projectRoot, 'components.json'))) fail(`No components.json — run: ${RUN} init`);
  return { projectRoot, config: loadConfig(projectRoot) };
}

async function cmdAdd(args, cwd) {
  const { flags, positional } = parseFlags(args);
  const names = [...new Set(positional.filter((p) => p !== '--list'))];

  if (!names.length) {
    listRegistry();
    return;
  }

  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project. Run from your app root.');

  if (!fs.existsSync(path.join(projectRoot, 'components.json'))) {
    warn('No components.json — running init first.');
    await cmdInit(cwd, flags, undefined, { theme: false });
  }

  await runBatch(names, projectRoot, loadConfig(projectRoot), flags, { report: true });
}

/**
 * `update [names]`: every installed item (or the named ones) brought to this CLI's version. Files the CLI wrote and
 * nobody touched refresh; a file you changed stops its item and shows the diff, unless --force takes upstream.
 */
async function cmdUpdate(args, cwd) {
  const { flags, positional } = parseFlags(args);
  const { projectRoot, config } = openProject(cwd, { needConfig: true });
  const names = positional.length ? [...new Set(positional.map(resolveRegistryName))] : installedNames(projectRoot, config);
  if (!names.length) fail(`Nothing to update: components.json lists no installed items. Add one: ${RUN} add <name>`);
  log(`Updating ${names.join(', ')} to expo-kit@${getPackageVersion()}${flags.force ? ' (--force: your changes are replaced)' : ''}…`);
  await runBatch(names, projectRoot, config, { ...flags, update: true }, { report: false });
}

/** Files bigger than this aren't diffed (a component is a few dozen KB). */
const MAX_DIFF_BYTES = 2 * 1024 * 1024;

/**
 * `diff [names]`: each file of an installed item against what was installed and what this CLI ships. With only a
 * hash on record, "as installed" can be shown when upstream hasn't moved since; otherwise yours vs upstream.
 */
async function cmdDiff(args, cwd) {
  const { flags, positional } = parseFlags(args);
  const { projectRoot, config } = openProject(cwd, { needConfig: true });
  const names = positional.length ? [...new Set(positional.map(resolveRegistryName))] : installedNames(projectRoot, config);
  if (!names.length) fail(`Nothing to compare: components.json lists no installed items. Add one: ${RUN} add <name>`);
  const counts = { current: 0, pristine: 0, modified: 0, both: 0, untracked: 0, other: 0 };
  const show = (diff) => {
    for (const line of diffLines(diff)) console.log(`      ${line}`);
  };

  for (const name of names) {
    const item = await loadRegistryItem(name);
    const { target } = targetFor(projectRoot, config, item.resolved, { ...flags, update: true });
    const entry = config.installed[item.resolved];
    console.log('');
    log(
      `${item.meta.title} (${item.resolved}) — ${entry?.version ? `installed with expo-kit ${entry.version}` : 'no install record'}` +
        `${entry?.kitVersion ? `, kit v${entry.kitVersion}` : ''}; this CLI is ${getPackageVersion()}`
    );
    for (const { src, dest, registryRel } of registryFiles(item.filesRoot, projectRoot, target)) {
      const rel = posixRel(projectRoot, dest);
      const say = (what) => console.log(`  ${rel.padEnd(42)} ${what}`);
      const upstream = registryText(src, target);
      let stat = null;
      try {
        stat = fs.lstatSync(dest);
      } catch {
        // not there
      }
      if (!stat) {
        counts.other += 1;
        say('not in your project (update adds it)');
        continue;
      }
      if (!stat.isFile()) {
        counts.other += 1;
        say(`skipped — it's a ${stat.isSymbolicLink() ? 'symlink' : 'folder'}, not read`);
        continue;
      }
      if (stat.size > MAX_DIFF_BYTES) {
        counts.other += 1;
        say('skipped — larger than 2 MB');
        continue;
      }
      if (item.resolved === 'liquidglass-tab' && !LIQUIDGLASS_FRAMEWORK_PATHS.includes(registryRel)) {
        counts.other += 1;
        say('starter file — yours to edit; update keeps it');
        continue;
      }
      const have = fs.readFileSync(dest, 'utf8');
      const recorded = recordedHash(config.files, rel);
      const status = fileStatus(recorded, have, upstream);
      const both = status === 'modified' && recorded !== contentHash(upstream);
      counts[both ? 'both' : status] += 1;
      if (status === 'current') {
        say('up to date');
      } else if (status === 'pristine') {
        say('changed upstream — yours is untouched; update refreshes it');
        show(unifiedDiff(have, upstream, { from: `${rel} (yours, as installed)`, to: `${rel} (upstream)` }));
      } else if (status === 'modified' && !both) {
        say('changed by you');
        show(unifiedDiff(upstream, have, { from: `${rel} (as installed)`, to: `${rel} (yours)` }));
      } else if (status === 'modified') {
        say(`changed by you and upstream — update stops here (--force takes upstream)`);
        show(unifiedDiff(have, upstream, { from: `${rel} (yours)`, to: `${rel} (upstream)` }));
      } else {
        say('differs from upstream (no install record)');
        show(unifiedDiff(have, upstream, { from: `${rel} (yours)`, to: `${rel} (upstream)` }));
      }
    }
  }
  console.log('');
  log(
    `${counts.current} up to date · ${counts.pristine} changed upstream · ${counts.modified} changed by you` +
      `${counts.both ? ` · ${counts.both} changed by you and upstream` : ''}` +
      `${counts.untracked ? ` · ${counts.untracked} without a record` : ''}${counts.other ? ` · ${counts.other} other` : ''}`
  );
  if (counts.pristine || counts.both || counts.untracked) console.log(`  Bring in upstream: ${RUN} update ${positional.length ? names.join(' ') : ''}`.trimEnd());
}

function cmdDoctor(cwd) {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) fail('Not inside an Expo project.');

  const config = loadConfig(projectRoot);
  let issues = 0;

  log('Checking project…\n');

  if (!fs.existsSync(config.configPath)) {
    warn(`Missing components.json — run: ${RUN} init`);
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
  const usesLiquidGlass = fs.existsSync(tabsPath) || Object.hasOwn(config.installed, 'liquidglass-tab');
  if (usesLiquidGlass) {
    if (!fs.existsSync(tabsPath)) {
      warn(`No src/lib/tabs.ts — run: ${RUN} add liquidglass-tab`);
      issues += 1;
    } else {
      log('  ✓ src/lib/tabs.ts');
      const installedVersion = config.installed['liquidglass-tab']?.version;
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
        if (!isSafeTabName(tabName)) {
          warn(`Tab ${JSON.stringify(tabName)} in tabs.ts is not a valid route name (letters, numbers and - _ . ( ) [ ] only)`);
          issues += 1;
          continue;
        }
        const fileName = tabName === 'index' ? 'index.tsx' : `${tabName}.tsx`;
        const routePath = path.join(tabsDir, fileName);
        if (!fs.existsSync(routePath)) {
          warn(`Missing route for tab "${tabName}": ${path.relative(projectRoot, routePath)}`);
          console.log(`    Fix: add the file or run ${RUN} add liquidglass-tab --force`);
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
  if (!client) fail(`Pick a client: ${RUN} mcp init --client <${names}>`);

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
  npx @expokit/cli@latest init [my-app] [--brand <hex>] [--font <name>] [--radius <pt>] [--scheme light|dark|system] [--yes] [--dry-run]
  npx @expokit/cli@latest add <name...> [--dry-run] [--force] [--dir <folder>] [--no-format]
  npx @expokit/cli@latest diff [name...]
  npx @expokit/cli@latest update [name...] [--dry-run] [--force]
  npx @expokit/cli@latest doctor
  npx @expokit/cli@latest add --list
  npx @expokit/cli@latest login
  npx @expokit/cli@latest logout
  npx @expokit/cli@latest whoami
  npx @expokit/cli@latest mcp
  npx @expokit/cli@latest mcp init --client <claude|cursor|vscode|codex>

Examples:
  npx @expokit/cli@latest init my-app        new Expo app with ExpoKit set up
  npx @expokit/cli@latest init --brand "#0ea5e9" --radius 16 --scheme dark
  npx @expokit/cli@latest add liquidglass-tab --dry-run
  npx @expokit/cli@latest add liquidglass-tab --force
  npx @expokit/cli@latest add toast skeleton bottom-sheet
  npx @expokit/cli@latest add skeleton --dir src/components/kit   next to your own Skeleton.tsx
  npx @expokit/cli@latest diff toast          your changes and upstream's, per file
  npx @expokit/cli@latest update
  npx @expokit/cli@latest update toast --force
  npx @expokit/cli@latest doctor

Note: expo-kit copies files into your app (like shadcn). npm updates do NOT
auto-sync — run \`update\` after upgrading the package.

\`add\` with several names adds each one on its own (one that can't be added doesn't stop
the rest), runs one \`npx expo install\` for packages package.json doesn't list yet,
and formats the new files with your Prettier when the project has it (--no-format).
It never replaces a file of yours that differs only by case (Skeleton.tsx vs
skeleton.tsx), not even with --force: --dir <folder> puts the components somewhere
else (inside the folder @/ points at) and points their imports there.

\`init\` asks for a brand colour, font, radius and light / dark (or takes the
flags; --yes skips the questions), adds lib/kit.tsx and writes lib/kit-theme.tsx,
an <AppTheme> wrapper around KitProvider for your root layout.

components.json remembers a hash of every file add / update wrote. \`diff\` shows
what you changed since and what changed upstream. \`update\` (every installed
item, or the ones named) refreshes the files nobody touched and stops on files
you patched, showing the diff — \`--force\` takes upstream. liquidglass-tab keeps
your tabs.ts and screens.

Pro items (marked PRO in \`add --list\`): create a token at ${SITE_URL}/account,
run \`login\` and paste it, then \`add\` them like any other item. In scripts, pipe
it in (printf %s "$TOKEN" | npx @expokit/cli@latest login) or set EXPO_KIT_TOKEN;
\`login --token <token>\` still works but leaves the token in your shell history.
Credentials live in ~/.expo-kit/credentials.json. EXPO_KIT_URL overrides the
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
      const { flags, positional } = parseFlags(rest);
      if (positional.length > 1) fail(`init takes one folder name: ${RUN} init my-app`);
      await cmdInit(process.cwd(), flags, positional[0]);
      break;
    }
    case '--version':
    case '-v':
      console.log(getPackageVersion());
      break;
    case 'add':
      await cmdAdd(rest, process.cwd());
      break;
    case 'update':
      await cmdUpdate(rest, process.cwd());
      break;
    case 'diff':
      await cmdDiff(rest, process.cwd());
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
      fail(`Unknown command "${command}". Use: init | add | diff | update | doctor | login | logout | whoami | mcp`);
  }
}

const [, , command, ...rest] = process.argv;
try {
  await main(command, rest);
} catch (e) {
  if (e instanceof CliError) die(e.message);
  die(`Unexpected error: ${e?.stack ?? e?.message ?? e}`);
}
