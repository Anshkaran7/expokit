/**
 * Pure helpers for the expo-kit CLI (no I/O, no dependencies) — kept separate so they can be unit-tested.
 */

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

/** Union of dependency lists, order preserved. */
export function mergeDependencies(...lists) {
  const out = [];
  for (const list of lists) {
    for (const dep of list ?? []) if (!out.includes(dep)) out.push(dep);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Site URL + token guard
// ---------------------------------------------------------------------------

export const DEFAULT_SITE_URL = 'https://expokit.karandev.in';

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
