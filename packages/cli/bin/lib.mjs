/**
 * Pure helpers for the expo-kit CLI (no I/O, no dependencies) — kept separate so they can be unit-tested.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

/** Thrown for user-facing errors; the CLI entry point prints `message` and exits 1. */
export class CliError extends Error {}

// ---------------------------------------------------------------------------
// JSONC (tsconfig-style JSON with comments and trailing commas)
// ---------------------------------------------------------------------------

/** Removes // and /* *\/ comments outside strings (newlines kept so error positions stay close). */
export function stripJsonComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      const end = scanStringEnd(text, i);
      out += text.slice(i, end);
      i = end;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      out += text.slice(i, end).replace(/[^\r\n]/g, ' ');
      i = end;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Index just past the closing quote of the string starting at `start` (handles backslash escapes). */
function scanStringEnd(text, start) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') i += 2;
    else if (ch === '"') return i + 1;
    else i += 1;
  }
  return text.length; // unterminated — JSON.parse will report it
}

/** Removes commas that are directly followed (ignoring whitespace) by } or ] — outside strings. Input must be comment-free. */
export function stripTrailingCommas(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const end = scanStringEnd(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** JSON.parse for JSONC: comments and trailing commas are allowed (outside strings), BOM ignored. */
export function parseJsonc(text) {
  const clean = stripTrailingCommas(stripJsonComments(String(text).replace(/^﻿/, '')));
  return JSON.parse(clean);
}

/** True when the text has comments or trailing commas, i.e. a plain JSON.stringify rewrite would lose something. */
export function hasJsoncExtras(text) {
  const body = String(text).replace(/^﻿/, '');
  return stripTrailingCommas(stripJsonComments(body)) !== body;
}

/** Tokens of a JSONC document (whitespace and comments skipped) with source offsets. */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch) || ch === '﻿') {
      i += 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
    } else if (ch === '"') {
      const end = scanStringEnd(text, i);
      tokens.push({ type: 'string', start: i, end, raw: text.slice(i, end) });
      i = end;
    } else if ('{}[]:,'.includes(ch)) {
      tokens.push({ type: ch, start: i, end: i + 1 });
      i += 1;
    } else {
      let j = i;
      while (j < n && !/[\s{}[\]:,"/]/.test(text[j])) j += 1;
      if (j === i) j = i + 1;
      tokens.push({ type: 'literal', start: i, end: j });
      i = j;
    }
  }
  return tokens;
}

/** Within the object opened at tokens[openIdx], the token index of `key`'s value (or -1) and of the closing brace. */
function findMember(tokens, openIdx, key) {
  let depth = 0;
  for (let i = openIdx + 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === '{' || t.type === '[') depth += 1;
    else if (t.type === '}' || t.type === ']') {
      if (depth === 0) return { valueIdx: -1, closeIdx: i };
      depth -= 1;
    } else if (depth === 0 && t.type === 'string' && tokens[i + 1]?.type === ':') {
      let name;
      try {
        name = JSON.parse(t.raw);
      } catch {
        name = null;
      }
      if (name === key) return { valueIdx: i + 2, closeIdx: -1 };
    }
  }
  return { valueIdx: -1, closeIdx: -1 };
}

function lineIndentAt(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return text.slice(lineStart).match(/^[ \t]*/)[0];
}

function detectIndentUnit(text) {
  const m = text.match(/\n([ \t]+)\S/);
  return m ? (m[1].startsWith('\t') ? '\t' : m[1]) : '  ';
}

/** Inserts `memberText` (may span lines, already indented after its first line) as the first member of an object. */
function insertFirstMember(text, tokens, openIdx, memberText, memberIndent, closeIndent) {
  const open = tokens[openIdx];
  const isEmpty = tokens[openIdx + 1]?.type === '}';
  const insertion = isEmpty
    ? `\n${memberIndent}${memberText}\n${closeIndent}`
    : `\n${memberIndent}${memberText},`;
  if (isEmpty) {
    // replace whatever whitespace sat between { and }
    const close = tokens[openIdx + 1];
    return text.slice(0, open.end) + insertion + text.slice(close.start);
  }
  return text.slice(0, open.end) + insertion + text.slice(open.end);
}

function minimalAliasEdit(text, alias, target) {
  const tokens = tokenize(text);
  if (tokens[0]?.type !== '{') return null;
  const unit = detectIndentUnit(text);
  const valueJson = JSON.stringify(target).replace(/","/g, '", "');
  const entry = `${JSON.stringify(alias)}: ${valueJson}`;

  const co = findMember(tokens, 0, 'compilerOptions');
  if (co.valueIdx === -1) {
    const ind = lineIndentAt(text, tokens[0].start);
    const m = ind + unit;
    const member = `"compilerOptions": {\n${m}${unit}"paths": {\n${m}${unit}${unit}${entry}\n${m}${unit}}\n${m}}`;
    return insertFirstMember(text, tokens, 0, member, m, ind);
  }
  const coIdx = co.valueIdx;
  if (tokens[coIdx]?.type !== '{') return null;
  const coIndent = lineIndentAt(text, tokens[coIdx].start);
  const coMember = coIndent + unit;

  const p = findMember(tokens, coIdx, 'paths');
  if (p.valueIdx === -1) {
    const member = `"paths": {\n${coMember}${unit}${entry}\n${coMember}}`;
    return insertFirstMember(text, tokens, coIdx, member, coMember, coIndent);
  }
  const pIdx = p.valueIdx;
  if (tokens[pIdx]?.type !== '{') return null;
  const pIndent = lineIndentAt(text, tokens[pIdx].start);
  return insertFirstMember(text, tokens, pIdx, entry, pIndent + unit, pIndent);
}

/**
 * Ensures `compilerOptions.paths[alias]` exists in a tsconfig source. Leaves the file untouched when the alias
 * is already present. Otherwise does a minimal text insert that keeps comments/formatting; only if that can't
 * be done safely does it fall back to a full JSON rewrite (`commentsLost` tells the caller to warn).
 * Throws (SyntaxError) when the source isn't valid JSONC.
 */
export function addTsconfigPathAlias(text, alias, target) {
  const parsed = parseJsonc(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('tsconfig.json must contain a JSON object');
  }
  if (parsed.compilerOptions?.paths?.[alias] !== undefined) {
    return { changed: false, text, method: 'none', commentsLost: false };
  }

  const verify = (candidate) => {
    try {
      const out = parseJsonc(candidate);
      const { paths, ...restCo } = out.compilerOptions ?? {};
      const { paths: origPaths, ...origRestCo } = parsed.compilerOptions ?? {};
      const { compilerOptions: _a, ...rest } = out;
      const { compilerOptions: _b, ...origRest } = parsed;
      return (
        JSON.stringify(paths?.[alias]) === JSON.stringify(target) &&
        JSON.stringify({ ...paths, [alias]: undefined }) === JSON.stringify({ ...origPaths, [alias]: undefined }) &&
        JSON.stringify(restCo) === JSON.stringify(origRestCo) &&
        JSON.stringify(rest) === JSON.stringify(origRest)
      );
    } catch {
      return false;
    }
  };

  const minimal = minimalAliasEdit(text, alias, target);
  if (minimal !== null && verify(minimal)) {
    return { changed: true, text: minimal, method: 'minimal', commentsLost: false };
  }

  const next = structuredClone(parsed);
  if (next.compilerOptions === null || typeof next.compilerOptions !== 'object' || Array.isArray(next.compilerOptions)) {
    next.compilerOptions = {};
  }
  if (next.compilerOptions.paths === null || typeof next.compilerOptions.paths !== 'object' || Array.isArray(next.compilerOptions.paths)) {
    next.compilerOptions.paths = {};
  }
  next.compilerOptions.paths[alias] = target;
  return {
    changed: true,
    text: `${JSON.stringify(next, null, 2)}\n`,
    method: 'rewrite',
    commentsLost: hasJsoncExtras(text),
  };
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Valid PascalCase React component name for a tab route (`my-tab` → `MyTabScreen`, `index` → `HomeScreen`). */
export function tabComponentName(tabName) {
  if (tabName === 'index') return 'HomeScreen';
  const words = String(tabName)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!base) base = 'Tab';
  if (/^[0-9]/.test(base)) base = `Tab${base}`;
  return `${base}Screen`;
}

/** Registry item names: lowercase slug, no path characters. */
export function isValidItemName(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(name);
}

/**
 * Tab names from the user's tabs.ts become route files in app/(tabs)/: letters, digits and route punctuation
 * (`-_.()[]`) only, so a name can never be a path like `../../x`.
 */
export function isSafeTabName(name) {
  return typeof name === 'string' && name.length <= 100 && /^[A-Za-z0-9_.()[\]-]+$/.test(name) && !/^\.+$/.test(name);
}

// ---------------------------------------------------------------------------
// Project paths
// ---------------------------------------------------------------------------

/**
 * Whether `rel` (a components.json `paths` value) stays inside `root` once joined to it the way the CLI
 * writes files: `../x` escapes, while `/src/lib` is re-rooted by path.join and stays inside.
 */
export function isInsideDir(root, rel) {
  const r = path.relative(root, path.join(root, rel));
  return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r));
}

/**
 * npm package name, optionally with a simple version (`@1.2.3`, `@~14.0.0`, `@^2`). It reaches
 * `npx expo install` through a shell on Windows, so no `< > | =` or spaces — ranges like `>=1` are out.
 */
export function isSafePackageSpec(spec) {
  return (
    typeof spec === 'string' &&
    spec.length <= 214 &&
    /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(@[A-Za-z0-9.^~*-]+)?$/.test(spec)
  );
}

/** `export const KIT_VERSION = n` of a kit.tsx (1 for files from before the marker), or null if the file isn't one. */
export function kitVersion(text) {
  const m = /^export const KIT_VERSION = (\d+);/m.exec(text);
  if (m) return Number(m[1]);
  return /export function KitProvider\b/.test(text) ? 1 : null;
}

/**
 * Packages a registry item may depend on that work in the Expo Go app (SDK 58): native modules Expo Go
 * ships, plus pure-JS packages. Anything else needs a development build (`npx expo run:ios|android`).
 * Keep in sync with the Expo Go module list when the SDK moves.
 */
export const EXPO_GO_PACKAGES = new Set([
  '@expo/vector-icons',
  '@react-native-async-storage/async-storage',
  '@shopify/react-native-skia',
  'expo-audio',
  'expo-blur',
  'expo-charts',
  'expo-file-system',
  'expo-glass-effect',
  'expo-haptics',
  'expo-router',
  'expo-splash-screen',
  'expo-status-bar',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-worklets',
]);

/** Which of `deps` keep an item out of Expo Go (bare names; `pkg@1.2` is read as `pkg`). Empty: runs in Expo Go. */
export function needsDevBuild(deps) {
  return (deps ?? [])
    .map((spec) => spec.replace(/^(@?[^@]+)@.*$/, '$1'))
    .filter((name) => !EXPO_GO_PACKAGES.has(name));
}

/**
 * The component a file is named for: the PascalCase export matching one of `names` ("Grain Gradient" or
 * "grain-gradient" → GrainGradient), then one that starts with it (Toast → Toaster, not ToastProvider: the shortest),
 * else the first PascalCase export (never a CONSTANT).
 */
export function pickMainExport(source, names = []) {
  const exports = [...source.matchAll(/export (?:function|const) ([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b/g)].map((m) => m[1]);
  const pascal = (s) => String(s ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const wanted = names.map(pascal).map((n) => n.toLowerCase()).filter(Boolean);
  const exact = exports.find((e) => wanted.includes(e.toLowerCase()));
  if (exact) return exact;
  const prefixed = exports.filter((e) => wanted.some((w) => e.toLowerCase().startsWith(w))).sort((a, b) => a.length - b.length);
  return prefixed[0] ?? exports[0] ?? null;
}

// ---------------------------------------------------------------------------
// add: clashes, kit files, packages, suggestions, --dir
// ---------------------------------------------------------------------------

/**
 * The entry in a folder listing that differs from `name` only by case (`Skeleton.tsx` for `skeleton.tsx`), or null.
 * macOS and Windows treat the two as one file, so writing ours would replace theirs; on Linux both would live side
 * by side and break the repo for anyone who clones it on a Mac.
 */
export function caseClash(entries, name) {
  const lower = name.toLowerCase();
  return entries.find((e) => e !== name && e.toLowerCase() === lower) ?? null;
}

/** Whether a file came from ExpoKit (kit.tsx itself, or a component built on it) rather than being the user's own. */
export function looksLikeKitFile(text) {
  return /\bfrom\s+['"][^'"]*\/lib\/kit['"]/.test(text) || kitVersion(text) !== null;
}

const bareName = (spec) => spec.replace(/^(@?[^@]+)@.*$/, '$1');

/** `deps` (npm specs, `pkg@1.2` allowed) that package.json doesn't list yet, deduped by package name. */
export function missingPackages(deps, pkg) {
  const has = (name) =>
    [pkg?.dependencies, pkg?.devDependencies].some((d) => d && typeof d === 'object' && Object.hasOwn(d, name));
  const seen = new Set();
  return (deps ?? []).filter((spec) => {
    const name = bareName(spec);
    if (seen.has(name) || has(name)) return false;
    seen.add(name);
    return true;
  });
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Up to 3 item names close to a mistyped one ("buton" → button, "sheet-bottom" → bottom-sheet), closest first. */
export function suggestItemNames(input, names) {
  const want = String(input).toLowerCase();
  const sorted = (s) => s.split('-').filter(Boolean).sort().join('-');
  const flat = (s) => s.replace(/-/g, '');
  const scored = [];
  for (const name of new Set(names)) {
    const d = editDistance(want, name);
    let score = null;
    if (sorted(want) === sorted(name) || flat(want) === flat(name)) score = 0;
    else if (Math.min(want.length, name.length) >= 3 && (want.includes(name) || name.includes(want))) score = 1;
    else if (d <= Math.max(1, Math.floor(want.length / 3))) score = 1 + d;
    if (score !== null) scored.push({ name, score, d });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.d - b.d || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((s) => s.name);
}

/**
 * Registry files import each other as `@/components/…` and `@/lib/…`. When components.json maps those to other
 * aliases (or `add --dir` moved the components), point the imports there. Leaves everything else untouched.
 */
export function rewriteKitImports(text, aliases) {
  let out = text;
  for (const key of ['components', 'lib', 'hooks']) {
    const to = aliases?.[key];
    if (typeof to !== 'string' || to === `@/${key}`) continue;
    out = out.replace(new RegExp(`(['"])@/${key}/`, 'g'), (_, q) => `${q}${to.replace(/\/+$/, '')}/`);
  }
  return out;
}

/**
 * The folder `@/*` points at in a parsed tsconfig ("src" for `./src/*`, "" for `./*`), or null when there is no
 * such alias. Used to tell whether an `add --dir` folder can be imported as `@/…`.
 */
export function aliasRootFromTsconfig(tsconfig) {
  const target = tsconfig?.compilerOptions?.paths?.['@/*']?.[0];
  if (typeof target !== 'string' || !target.endsWith('*')) return null;
  const base = typeof tsconfig.compilerOptions.baseUrl === 'string' ? tsconfig.compilerOptions.baseUrl : '.';
  const joined = path.posix.normalize(path.posix.join(base, target.slice(0, -1)));
  const clean = joined.replace(/\/+$/, '');
  return clean === '.' ? '' : clean;
}

/**
 * `@/…` alias for a project-relative folder under the alias root (`src/components/kit` → `@/components/kit` when
 * `@/*` is `./src/*`), or null when the folder is outside it, is the root itself, or isn't a plain folder path.
 */
export function aliasTargetForDir(dir, aliasRoot) {
  const rel = String(dir).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || !/^[A-Za-z0-9._()/-]+$/.test(rel)) return null;
  if (rel.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return null;
  if (!aliasRoot) return `@/${rel}`;
  return rel.startsWith(`${aliasRoot}/`) ? `@/${rel.slice(aliasRoot.length + 1)}` : null;
}

/** Union of dependency lists, order preserved. */
export function mergeDependencies(...lists) {
  const out = [];
  for (const list of lists) {
    for (const dep of list ?? []) if (!out.includes(dep)) out.push(dep);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Install records (components.json `files` / `installed`), diffs, init theme
// ---------------------------------------------------------------------------

/** sha256 (hex) of a file's text, line endings normalised so a git autocrlf checkout hashes the same. */
export function contentHash(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

const HASH = /^[0-9a-f]{64}$/;

/**
 * The hash components.json recorded for a project file, or null. The file comes from the repo, so it is untrusted:
 * only own, well-formed entries count, and its keys are only ever looked up — never used as paths to read or write.
 */
export function recordedHash(files, rel) {
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.hasOwn(files, rel)) return null;
  const value = files[rel];
  return typeof value === 'string' && HASH.test(value) ? value : null;
}

/**
 * A project file against the registry's copy:
 *   current (same as upstream) · pristine (as the CLI wrote it, upstream moved on) ·
 *   modified (changed since it was written) · untracked (differs, and there is no record to tell why)
 */
export function fileStatus(recorded, have, upstream) {
  const norm = (t) => String(t).replace(/\r\n/g, '\n');
  if (norm(have) === norm(upstream)) return 'current';
  if (!recorded) return 'untracked';
  return contentHash(have) === recorded ? 'pristine' : 'modified';
}

/**
 * components.json `installed`, cleaned: `{ name: { version?, kitVersion?, dir? } }`. Older CLIs stored just the
 * version string. Unknown names and odd values are dropped (the file is untrusted); `dir` is checked where it's used.
 */
export function normalizeInstalled(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (!isValidItemName(name)) continue;
    if (typeof value === 'string') {
      out[name] = value.length <= 40 ? { version: value } : {};
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = {};
    if (typeof value.version === 'string' && value.version.length <= 40) entry.version = value.version;
    if (Number.isInteger(value.kitVersion) && value.kitVersion > 0) entry.kitVersion = value.kitVersion;
    if (typeof value.dir === 'string' && value.dir.length <= 200) entry.dir = value.dir;
    out[name] = entry;
  }
  return out;
}

const splitLines = (text) => {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/** Edit script (' ', '-', '+' per line) by LCS; past `maxCells` the changed middle is one remove + add block. */
function diffOps(a, b, maxCells) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  const x = a.slice(pre, a.length - suf);
  const y = b.slice(pre, b.length - suf);
  const ops = a.slice(0, pre).map((line) => [' ', line]);
  if (x.length * y.length > maxCells) {
    ops.push(...x.map((line) => ['-', line]), ...y.map((line) => ['+', line]));
  } else {
    const w = y.length + 1;
    const lcs = new Uint32Array((x.length + 1) * w);
    for (let i = x.length - 1; i >= 0; i -= 1) {
      for (let j = y.length - 1; j >= 0; j -= 1) {
        lcs[i * w + j] = x[i] === y[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        ops.push([' ', x[i]]);
        i += 1;
        j += 1;
      } else if (i < x.length && (j === y.length || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
        ops.push(['-', x[i]]);
        i += 1;
      } else {
        ops.push(['+', y[j]]);
        j += 1;
      }
    }
  }
  ops.push(...a.slice(a.length - suf).map((line) => [' ', line]));
  return ops;
}

/** A unified diff (`--- from` / `+++ to` / `@@` hunks) of two texts, or '' when they match (CRLF vs LF is no change). */
export function unifiedDiff(a, b, { from = 'a', to = 'b', context = 3, maxCells = 4_000_000 } = {}) {
  const na = String(a).replace(/\r\n/g, '\n');
  const nb = String(b).replace(/\r\n/g, '\n');
  if (na === nb) return '';
  const head = `--- ${from}\n+++ ${to}\n`;
  const ops = diffOps(splitLines(na), splitLines(nb), maxCells);
  const changed = ops.flatMap((op, i) => (op[0] === ' ' ? [] : [i]));
  if (!changed.length) return `${head}(only the newline at the end of the file differs)\n`;

  // Line numbers before each op, for the @@ headers.
  const at = [];
  let la = 1;
  let lb = 1;
  for (const [kind] of ops) {
    at.push([la, lb]);
    if (kind !== '+') la += 1;
    if (kind !== '-') lb += 1;
  }
  let out = head;
  let k = 0;
  while (k < changed.length) {
    const start = Math.max(0, changed[k] - context);
    let end = changed[k];
    while (k + 1 < changed.length && changed[k + 1] - end <= context * 2 + 1) end = changed[(k += 1)];
    k += 1;
    end = Math.min(ops.length - 1, end + context);
    const slice = ops.slice(start, end + 1);
    const countA = slice.filter(([kind]) => kind !== '+').length;
    const countB = slice.filter(([kind]) => kind !== '-').length;
    const [sa, sb] = at[start];
    out += `@@ -${countA ? sa : sa - 1},${countA} +${countB ? sb : sb - 1},${countB} @@\n`;
    out += slice.map(([kind, line]) => `${kind}${line}\n`).join('');
  }
  return out;
}

/** `init` theme answers, checked: they are written into a .tsx file, so only plain values get through. */
export function themeOptions({ brand, font, radius, scheme } = {}) {
  const out = { brand: null, font: null, radius: null, scheme: 'system' };
  if (brand !== undefined && brand !== null && brand !== '') {
    const hex = String(brand).trim().replace(/^#?/, '#').toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) throw new CliError(`--brand must be a hex colour like #6366f1 (got ${JSON.stringify(brand)}).`);
    out.brand = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  }
  if (font !== undefined && font !== null && font !== '') {
    const name = String(font).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(name)) throw new CliError(`--font must be a font family name like Inter (got ${JSON.stringify(font)}).`);
    out.font = name;
  }
  if (radius !== undefined && radius !== null && radius !== '') {
    const text = String(radius).trim();
    if (!/^\d{1,2}$/.test(text) || Number(text) > 48) throw new CliError(`--radius must be a whole number of points from 0 to 48 (got ${JSON.stringify(radius)}).`);
    out.radius = Number(text);
  }
  if (scheme !== undefined && scheme !== null && scheme !== '') {
    const s = String(scheme).trim().toLowerCase();
    if (!['system', 'light', 'dark'].includes(s)) throw new CliError(`--scheme must be light, dark or system (got ${JSON.stringify(scheme)}).`);
    out.scheme = s;
  }
  return out;
}

/** The `AppTheme` wrapper `init` writes next to kit.tsx: KitProvider with the chosen theme, and a place for your tokens. */
export function kitThemeSource({ brand, font, radius, scheme }, libAlias = '@/lib') {
  const props = [`scheme="${scheme}"`];
  if (brand) props.push(`accent="${brand}"`);
  if (radius !== null && radius !== undefined) props.push(`radius={${radius}}`);
  if (font) props.push(`fontFamily="${font}"`);
  return `import type { ReactNode } from 'react';

import { KitProvider } from '${String(libAlias).replace(/\/+$/, '')}/kit';

/**
 * Your app's ExpoKit theme, written by \`expo-kit init\`. Wrap your root layout in it:
 *   <AppTheme><Stack /></AppTheme>
 * Already have a design system? Point the kit tokens at it in \`colors\`:
 * https://expokit.in/docs/design-tokens
 */
export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <KitProvider
      ${props.join('\n      ')}
      colors={{
        // light: { background: tokens.surface, foreground: tokens.text, muted: tokens.subtle, border: tokens.line },
        light: {},
        dark: {},
      }}
    >
      {children}
    </KitProvider>
  );
}
`;
}

// ---------------------------------------------------------------------------
// Site URL + token guard
// ---------------------------------------------------------------------------

export const DEFAULT_SITE_URL = 'https://expokit.in';

const OFF = /^(0|false|off|no)$/i;
const set = (v) => v !== undefined && v !== '' && !OFF.test(v);

/**
 * Anonymous install counts (README "Privacy"): on unless DO_NOT_TRACK is set, EXPO_KIT_TELEMETRY is
 * 0/false/off/no, or it's a CI run (builds re-adding items aren't new installs).
 */
export function telemetryEnabled(env) {
  if (set(env.DO_NOT_TRACK) || set(env.CI)) return false;
  return !(env.EXPO_KIT_TELEMETRY !== undefined && OFF.test(env.EXPO_KIT_TELEMETRY));
}

export function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/** Parses the site URL; throws CliError unless it is https (or http on localhost / 127.0.0.1). */
export function parseSiteUrl(siteUrl) {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new CliError(`EXPO_KIT_URL is not a valid URL: ${JSON.stringify(siteUrl)}`);
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return url;
  throw new CliError(
    `Refusing to use ${url.origin}: the site must be https:// (plain http is only allowed for localhost / 127.0.0.1). Check EXPO_KIT_URL.`
  );
}

function originOf(u) {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

/**
 * Whether a token may be sent to `siteUrl`. Saved credentials go only to the origin they were created for
 * (stored as `url` by `login`) or the default site; an EXPO_KIT_TOKEN only to the default site or a loopback dev server.
 */
export function canSendToken({ siteUrl, credsUrl, fromEnv = false, defaultUrl = DEFAULT_SITE_URL }) {
  const target = originOf(siteUrl);
  if (!target) return false;
  if (target === originOf(defaultUrl)) return true;
  if (fromEnv) return isLoopbackHost(new URL(siteUrl).hostname);
  return Boolean(credsUrl) && target === originOf(credsUrl);
}

/**
 * `env` without EXPO_KIT_TOKEN, for child processes: `npx expo install` runs third-party install scripts,
 * and none of them needs the Pro token. Case-insensitive, as Windows env names are.
 */
export function envWithoutToken(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key.toUpperCase() !== 'EXPO_KIT_TOKEN'));
}

// ---------------------------------------------------------------------------
// 429 / 503: wait once, then give up
// ---------------------------------------------------------------------------

/** The longest the CLI waits before its one retry of a 429 / 503. */
export const RETRY_MAX_WAIT_MS = 10_000;

/** A Retry-After header (delta-seconds or an HTTP date) in whole seconds from `now`; null when missing or unreadable. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (!/[A-Za-z]/.test(text)) return null; // an HTTP date always names its day / month
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Milliseconds to wait before retrying a 429 / 503 once: what the server asked (3 s when it didn't say).
 * null when it asked for longer than RETRY_MAX_WAIT_MS: retrying sooner than that just earns another 429 / 503.
 */
export function retryDelayMs(retryAfter, now = Date.now()) {
  const secs = parseRetryAfter(retryAfter, now);
  if (secs === null) return 3000;
  if (secs * 1000 > RETRY_MAX_WAIT_MS) return null;
  return secs * 1000;
}

/** "in 30 s" / "in 5 min" / "in about 2 h" for a "try again …" message; "in a minute" when the server didn't say. */
export function retryHint(retryAfter, now = Date.now()) {
  const secs = parseRetryAfter(retryAfter, now);
  if (secs === null) return 'in a minute';
  if (secs < 90) return `in ${Math.max(1, secs)} s`;
  if (secs < 90 * 60) return `in ${Math.round(secs / 60)} min`;
  if (secs < 48 * 3600) return `in about ${Math.round(secs / 3600)} h`;
  return 'later';
}
