/**
 * `expo-kit mcp` — a Model Context Protocol server over stdio, so AI coding assistants
 * (Claude Code, Cursor, VS Code, Codex…) can browse ExpoKit and add items with the CLI.
 *
 * Zero dependencies: MCP over stdio is newline-delimited JSON-RPC 2.0, and this server only
 * offers tools. It reads the registry bundled with this package and never touches the network
 * or the user's token. stdout carries protocol messages only — diagnostics go to stderr.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Newest first; we answer with the client's version when we know it, else our newest. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const PACKAGE = '@anshkaran7/expo-kit';
const TYPES = ['component', 'chart', 'block', 'template', 'lib'];

const INSTRUCTIONS = `ExpoKit is a shadcn-style kit of copy-paste UI for Expo / React Native (iOS + Android first).
Items are copied into the user's app as source files by the expo-kit CLI — they are not an npm package.
Workflow: search_items or list_items → view_item (props, import line, examples) → get_add_command, then run that command in the app's root folder.
The CLI creates components.json, adds the @/* tsconfig alias, copies files under src/ (or the root app layout) and installs npm deps with \`npx expo install\`.
Import components from '@/components/...' and wrap the app in <KitProvider> from '@/lib/kit' (added with the first item).
Pro items need an ExpoKit Pro plan: the user runs \`npx ${PACKAGE}@latest login\` once (token from https://expokit.karandev.in/account). Never ask the user to paste a token into chat.`;

// ---------------------------------------------------------------------------
// Registry access (bundled JSON)
// ---------------------------------------------------------------------------

export function loadCatalog(registryDir, aliases = {}) {
  const items = fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(registryDir, f), 'utf8')))
    .sort((a, b) => a.name.localeCompare(b.name));
  const docs = new Map();
  for (const it of items) {
    const p = path.join(registryDir, '_docs', `${it.name}.json`);
    docs.set(it.name, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
  }
  const byName = new Map(items.map((it) => [it.name, it]));
  const alias = new Map(Object.entries(aliases));
  for (const [name, d] of docs) for (const a of d?.aliases ?? []) alias.set(a, name);
  return {
    items,
    docs,
    find(name) {
      const key = String(name ?? '').trim().toLowerCase();
      return byName.get(key) ?? byName.get(alias.get(key)) ?? null;
    },
  };
}

function itemLine(it) {
  return `- ${it.name} (${it.type}${it.tier === 'pro' ? ', PRO' : ''}) — ${it.title}: ${it.description}`;
}

/** `import { Button } from '@/components/ui/button';` from the item's main file. */
function importLine(it, doc) {
  if (!doc?.exportName) return null;
  const main = doc.files.find((f) => f.endsWith(`/${it.name}.tsx`)) ?? doc.files[0];
  if (!main) return null;
  return `import { ${doc.exportName} } from '@/${main.replace(/^src\//, '').replace(/\.tsx?$/, '')}';`;
}

function addCommand(names) {
  return `npx ${PACKAGE}@latest add ${names.join(' ')}`;
}

function searchScore(it, doc, words) {
  const fields = [
    [it.name, 6],
    [(doc?.aliases ?? []).join(' '), 5],
    [it.title, 4],
    [doc?.category ?? '', 3],
    [it.type, 2],
    [it.description, 1],
  ].map(([text, weight]) => [String(text).toLowerCase(), weight]);
  let score = 0;
  for (const w of words) {
    let best = 0;
    for (const [text, weight] of fields) if (text.includes(w)) best = Math.max(best, weight);
    if (!best) return 0; // every word must match somewhere
    score += best;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'list_items',
    title: 'List ExpoKit items',
    description: 'List every ExpoKit item (components, charts, blocks, templates) with type, tier (free/PRO) and a one-line description. Optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'Only items of this type.' },
        tier: { type: 'string', enum: ['free', 'pro'], description: 'Only free or only Pro items.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'search_items',
    title: 'Search ExpoKit items',
    description: 'Find ExpoKit items by keywords (e.g. "bottom sheet", "line chart", "glass tab bar", "onboarding"). Matches names, aliases, titles, categories and descriptions.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords.' } },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'view_item',
    title: 'View an ExpoKit item',
    description: 'Details for one item: description, import line, props, npm and registry dependencies, usage examples (free items) and the command that adds it. Set include_source to also get the source files of a free item.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name or alias, e.g. "button".' },
        include_source: { type: 'boolean', description: "Also return the item's own source files (free items only). Default false." },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'get_add_command',
    title: 'Get the add command',
    description: "The exact CLI command that copies one or more items into the user's Expo app (run it in the app's root folder), plus what it will do.",
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Item names or aliases.' },
      },
      required: ['names'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
];

class ToolError extends Error {}

function requireItem(catalog, name) {
  const it = catalog.find(name);
  if (!it) throw new ToolError(`Unknown item "${name}". Use search_items or list_items to find the right name.`);
  return it;
}

function listItems(catalog, { type, tier } = {}) {
  const items = catalog.items.filter((it) => (!type || it.type === type) && (!tier || it.tier === tier));
  if (!items.length) return 'No items match those filters.';
  return `${items.length} item(s):\n${items.map(itemLine).join('\n')}`;
}

function searchItems(catalog, { query }) {
  const words = String(query ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) throw new ToolError('query is empty.');
  const hits = catalog.items
    .map((it) => ({ it, score: searchScore(it, catalog.docs.get(it.name), words) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name))
    .slice(0, 15);
  if (!hits.length) return `Nothing matches "${query}". Try fewer or broader words, or list_items.`;
  return `${hits.length} match(es) for "${query}":\n${hits.map((h) => itemLine(h.it)).join('\n')}\n\nNext: view_item with a name.`;
}

function viewItem(catalog, registryDir, { name, include_source: includeSource = false }) {
  const it = requireItem(catalog, name);
  const doc = catalog.docs.get(it.name);
  const out = [`# ${it.title} (${it.name})`, '', it.description, ''];
  out.push(`Type: ${it.type} · Tier: ${it.tier === 'pro' ? 'PRO (needs an ExpoKit Pro plan)' : 'free'}${doc?.category ? ` · Category: ${doc.category}` : ''}`);
  if (doc?.aliases?.length) out.push(`Aliases: ${doc.aliases.join(', ')}`);
  out.push('', `Add: \`${addCommand([it.name])}\``);
  const imp = importLine(it, doc);
  if (imp) out.push(`Import: \`${imp}\``);
  if (doc?.files?.length) out.push(`Files it adds: ${doc.files.join(', ')}`);
  if (it.dependencies.length) out.push(`npm deps (installed by the CLI): ${it.dependencies.join(', ')}`);
  if (it.registryDependencies.length) out.push(`Also adds: ${it.registryDependencies.join(', ')}`);

  if (doc?.props?.length) {
    out.push('', '## Props', '', '| Prop | Type | Default | Description |', '| --- | --- | --- | --- |');
    const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    for (const [prop, type, def, desc] of doc.props) out.push(`| ${cell(prop)} | ${cell(type)} | ${cell(def)} | ${cell(desc)} |`);
  }

  if (doc?.examples?.length) {
    out.push('', '## Examples');
    for (const ex of doc.examples) out.push('', `### ${ex.title}`, '', '```tsx', ex.code.trimEnd(), '```');
  } else if (it.tier === 'pro') {
    out.push('', 'Usage examples and source for Pro items are on https://expokit.karandev.in after signing in, and in the files the add command copies.');
  }

  if (includeSource) {
    if (it.tier === 'pro' || !it.filesDir) {
      out.push('', 'Source: not bundled for Pro items. After `add`, read the copied files in the project.');
    } else {
      out.push('', '## Source');
      for (const rel of doc?.files ?? []) {
        const file = path.join(registryDir, it.filesDir, rel);
        if (!fs.existsSync(file)) continue;
        out.push('', `### ${rel}`, '', '```tsx', fs.readFileSync(file, 'utf8').trimEnd(), '```');
      }
    }
  }
  return out.join('\n');
}

function getAddCommand(catalog, { names }) {
  if (!Array.isArray(names) || !names.length) throw new ToolError('names must be a non-empty array.');
  const items = names.map((n) => requireItem(catalog, n));
  const unique = [...new Set(items.map((it) => it.name))];
  const pro = items.filter((it) => it.tier === 'pro').map((it) => it.name);
  const lines = [
    `Run in the root folder of the Expo app (where package.json lists "expo"):`,
    '',
    addCommand(unique),
    '',
    '- First run creates components.json and the @/* tsconfig alias (same as `init`).',
    '- Copies the files (and their registry dependencies) into src/ or the root app layout, and runs `npx expo install` for npm deps.',
    '- Existing files are never overwritten unless `--force` is added; add `--dry-run` to preview.',
  ];
  if (pro.length)
    lines.push(
      `- PRO: ${pro.join(', ')} ${pro.length === 1 ? 'needs' : 'need'} an ExpoKit Pro plan. If the command reports "not logged in", ask the user to run \`npx ${PACKAGE}@latest login\` themselves (token from https://expokit.karandev.in/account). Never ask for the token in chat.`
    );
  return lines.join('\n');
}

export function callTool(catalog, registryDir, name, args = {}) {
  switch (name) {
    case 'list_items':
      return listItems(catalog, args);
    case 'search_items':
      return searchItems(catalog, args);
    case 'view_item':
      return viewItem(catalog, registryDir, args);
    case 'get_add_command':
      return getAddCommand(catalog, args);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC / MCP
// ---------------------------------------------------------------------------

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** One incoming JSON-RPC message → the response object, or null for notifications. */
export function handleMessage(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && 'id' in msg ? rpcError(msg.id ?? null, -32600, 'Invalid request') : null;
  }
  const isRequest = 'id' in msg && msg.id !== null;
  if (!isRequest) return null; // notifications/initialized, notifications/cancelled, …
  const { id, method, params = {} } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'expokit', title: 'ExpoKit', version: ctx.version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const text = callTool(ctx.catalog, ctx.registryDir, params.name, params.arguments ?? {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        const text = e instanceof ToolError ? e.message : `Internal error: ${e?.message ?? e}`;
        return ok({ content: [{ type: 'text', text }], isError: true });
      }
    }
    // Clients may probe these even though we don't advertise them.
    case 'resources/list':
      return ok({ resources: [] });
    case 'resources/templates/list':
      return ok({ resourceTemplates: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** Serves MCP on stdin/stdout until stdin closes. */
export function startMcpServer({ registryDir, version, aliases }) {
  const ctx = { registryDir, version, catalog: loadCatalog(registryDir, aliases) };
  const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        send(rpcError(null, -32700, 'Parse error'));
        continue;
      }
      // Batches came and went in 2025-03-26; answer them anyway.
      const replies = (Array.isArray(msg) ? msg : [msg]).map((m) => handleMessage(m, ctx)).filter(Boolean);
      if (Array.isArray(msg)) {
        if (replies.length) send(replies);
      } else if (replies[0]) send(replies[0]);
    }
  });
  process.stdin.on('end', () => process.exit(0));
  console.error(`expo-kit MCP server ${version} ready on stdio (${ctx.catalog.items.length} items)`);
}
