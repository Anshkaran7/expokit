import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'expo-kit.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-kit-mcp-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Sends JSON-RPC lines to `expo-kit mcp`, closes stdin, returns parsed stdout lines + stderr. */
function rpc(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'mcp'], { cwd: TMP, env: { ...process.env, HOME: TMP, EXPO_KIT_TOKEN: '' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        resolve({ code, err, replies: out.split('\n').filter(Boolean).map((l) => JSON.parse(l)) });
      } catch (e) {
        reject(new Error(`stdout is not pure JSON-RPC: ${e.message}\n${out}`));
      }
    });
    child.stdin.end(messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
  });
}

const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const text = (reply) => reply.result.content[0].text;

test('mcp: handshake, tools/list and a clean exit when stdin closes', async () => {
  const { code, replies } = await rpc([init, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
  assert.equal(code, 0);
  assert.equal(replies.length, 2, 'notifications get no reply');
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.equal(replies[0].result.serverInfo.name, 'expokit');
  assert.deepEqual(
    replies[1].result.tools.map((t) => t.name),
    ['list_items', 'search_items', 'view_item', 'get_add_command']
  );
  for (const t of replies[1].result.tools) assert.equal(t.annotations.readOnlyHint, true);
});

test('mcp: unknown protocol version gets our newest', async () => {
  const { replies } = await rpc([{ ...init, params: { ...init.params, protocolVersion: '1999-01-01' } }]);
  assert.match(replies[0].result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(replies[0].result.protocolVersion, '1999-01-01');
});

test('mcp: search, view (aliases, props, examples, source) and add command', async () => {
  const { replies } = await rpc([
    init,
    call(2, 'search_items', { query: 'glass sheet' }),
    call(3, 'view_item', { name: 'native-tabs' }),
    call(4, 'view_item', { name: 'button', include_source: true }),
    call(5, 'get_add_command', { names: ['button', 'glass-sheet'] }),
    call(6, 'view_item', { name: 'glass-sheet', include_source: true }),
  ]);
  assert.match(text(replies[1]), /glass-sheet \(component, PRO\)/);
  assert.match(text(replies[2]), /\(liquidglass-tab\)/);
  const button = text(replies[3]);
  assert.match(button, /import \{ Button \} from '@\/components\/ui\/button';/);
  assert.match(button, /## Props/);
  assert.match(button, /## Examples/);
  assert.match(button, /### src\/components\/ui\/button\.tsx/);
  assert.match(text(replies[4]), /npx @expokit\/cli@latest add button glass-sheet/);
  assert.match(text(replies[4]), /PRO: glass-sheet needs/);
  const pro = text(replies[5]);
  assert.match(pro, /## Props/);
  assert.doesNotMatch(pro, /## Examples|## Source/, 'Pro code must not ship in the package');
});

test('mcp: bad input is a tool error, unknown methods are JSON-RPC errors', async () => {
  const { replies } = await rpc([
    init,
    call(2, 'view_item', { name: 'definitely-not-an-item' }),
    call(3, 'no_such_tool', {}),
    { jsonrpc: '2.0', id: 4, method: 'nope/nope' },
    { jsonrpc: '2.0', id: 5, method: 'ping' },
  ]);
  assert.equal(replies[1].result.isError, true);
  assert.match(text(replies[1]), /Unknown item/);
  assert.equal(replies[2].error.code, -32602);
  assert.equal(replies[3].error.code, -32601);
  assert.deepEqual(replies[4].result, {});
});

test('mcp: free charts from expo-charts are found, viewed and installed with expo install', async () => {
  const { replies } = await rpc([
    init,
    call(2, 'search_items', { query: 'line chart' }),
    call(3, 'view_item', { name: 'area-chart', include_source: true }),
    call(4, 'get_add_command', { names: ['button', 'line-chart', 'bar-chart', 'line-chart'] }),
    call(5, 'get_add_command', { names: ['pie-chart'] }),
    call(6, 'list_items', { type: 'chart', tier: 'free' }),
  ]);
  assert.match(text(replies[1]).split('\n')[1], /^- line-chart \(chart\) — Line Chart/, 'the Line Chart is the top hit');
  const area = text(replies[2]);
  assert.match(area, /Install \(npm package expo-charts, not copied source\): `npx expo install expo-charts react-native-svg`/);
  assert.match(area, /import \{ AreaSeriesChart \} from 'expo-charts';/);
  assert.match(area, /## Props/);
  assert.match(area, /## Usage[\s\S]*from ['"]expo-charts['"]/, 'usage carries its import');
  assert.match(area, /no source to edit/);
  assert.doesNotMatch(area, /@expokit\/cli@latest add area-chart/);
  const mixed = text(replies[3]);
  assert.match(mixed, /npx @expokit\/cli@latest add button\n/, 'charts are not passed to the CLI');
  assert.match(mixed, /npx expo install expo-charts react-native-svg/);
  assert.equal(mixed.match(/Line Chart/g).length, 1, 'duplicates collapse');
  const only = text(replies[4]);
  assert.doesNotMatch(only, /@expokit\/cli/);
  assert.match(only, /comes from the expo-charts npm package/);
  const list = text(replies[5]);
  assert.ok(Number(list.match(/^(\d+) item/)[1]) >= 30, 'the free charts are listed');
});

test('mcp: missing names, huge input and too many items stay short tool errors', async () => {
  const huge = 'x'.repeat(10_000);
  const { replies } = await rpc([
    init,
    call(2, 'view_item', {}),
    call(3, 'view_item', { name: 42 }),
    call(4, 'search_items', { query: huge }),
    call(5, 'view_item', { name: huge }),
    call(6, 'get_add_command', { names: Array(51).fill('button') }),
  ]);
  assert.match(text(replies[1]), /name is required/);
  assert.match(text(replies[2]), /name is required/);
  for (const r of replies.slice(3, 5)) assert.ok(text(r).length < 300, 'the query is not echoed back in full');
  assert.equal(replies[5].result.isError, true);
});

test('the CLI registry ships docs for every item, and no Pro demo code', () => {
  const reg = path.resolve(path.dirname(CLI), '..', 'registry');
  for (const f of fs.readdirSync(reg).filter((f) => f.endsWith('.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(reg, f), 'utf8'));
    const docs = JSON.parse(fs.readFileSync(path.join(reg, '_docs', f), 'utf8'));
    assert.equal(docs.name, meta.name);
    if (meta.tier === 'pro') assert.deepEqual(docs.examples, [], `${meta.name} is Pro`);
  }
});

// ---------------------------------------------------------------------------
// mcp init
// ---------------------------------------------------------------------------

let n = 0;
function project() {
  const dir = path.join(TMP, `app-${(n += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: { expo: '~54.0.0' } }));
  return dir;
}

function runCli(args, cwd) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: TMP, NO_COLOR: '1' } });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

const SERVER = { command: 'npx', args: ['-y', '@expokit/cli@latest', 'mcp'] };

test('mcp init --client claude merges into an existing .mcp.json', () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  const r = runCli(['mcp', 'init', '--client', 'claude'], dir);
  assert.equal(r.status, 0, r.out);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8'));
  assert.deepEqual(cfg.mcpServers, { other: { command: 'x' }, expokit: SERVER });
  assert.match(runCli(['mcp', 'init', '--client', 'claude'], dir).out, /already has/);
});

test('mcp init writes Cursor and VS Code configs from a subfolder into the project root', () => {
  const dir = project();
  const sub = path.join(dir, 'src');
  fs.mkdirSync(sub);
  assert.equal(runCli(['mcp', 'init', '--client=cursor'], sub).status, 0);
  assert.equal(runCli(['mcp', 'init', '--client', 'vscode'], sub).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.cursor/mcp.json'), 'utf8')), { mcpServers: { expokit: SERVER } });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.vscode/mcp.json'), 'utf8')), { servers: { expokit: { type: 'stdio', ...SERVER } } });
});

test('mcp init leaves a commented config alone and prints the snippet', () => {
  const dir = project();
  const original = '{\n  // mine\n  "servers": {},\n}\n';
  fs.mkdirSync(path.join(dir, '.vscode'));
  fs.writeFileSync(path.join(dir, '.vscode/mcp.json'), original);
  const r = runCli(['mcp', 'init', '--client', 'vscode'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /"expokit"/);
  assert.equal(fs.readFileSync(path.join(dir, '.vscode/mcp.json'), 'utf8'), original);
});

test('mcp init: codex prints the TOML, bad clients fail', () => {
  const dir = project();
  const codex = runCli(['mcp', 'init', '--client', 'codex'], dir);
  assert.equal(codex.status, 0);
  assert.match(codex.out, /\[mcp_servers\.expokit\]/);
  assert.equal(runCli(['mcp', 'init'], dir).status, 1);
  assert.match(runCli(['mcp', 'init', '--client', 'emacs'], dir).out, /Unknown client/);
  assert.match(runCli(['mcp', 'serve'], dir).out, /Unknown mcp option/);
});

test('server.json (the MCP Registry listing) matches the package version, so the registry installs this release', () => {
  const dir = path.resolve(path.dirname(CLI), '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const server = JSON.parse(fs.readFileSync(path.join(dir, 'server.json'), 'utf8'));
  assert.equal(server.name, pkg.mcpName, 'npm checks mcpName against the registry name');
  assert.equal(server.version, pkg.version, 'bump server.json with package.json, then run mcp-publisher publish');
  for (const p of server.packages) {
    assert.equal(p.identifier, pkg.name);
    assert.equal(p.version, pkg.version);
  }
});
