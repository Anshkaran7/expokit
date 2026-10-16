# @anshkaran7/expo-kit

shadcn-style CLI for Expo — add native UI blocks and components into your app as **source you own**.

No opaque UI dependency. Run a command, get TypeScript files in your repo, edit freely.

## Quick start

From any Expo project:

```bash
npx @anshkaran7/expo-kit@latest init
npx @anshkaran7/expo-kit@latest add button
npx @anshkaran7/expo-kit@latest add liquidglass-tab
```

List everything in the registry:

```bash
npx @anshkaran7/expo-kit@latest add --list
```

## How it works

| Command | What it does |
| --- | --- |
| `init` | Creates `components.json` (paths + aliases) and sets up `@/*` in `tsconfig.json` if needed |
| `add <name>` | Copies registry files into your project and runs `npx expo install` for peer deps |
| `add --dry-run` | Preview files without writing |
| `add --force` | Overwrite existing files |
| `update` | Refresh framework files after a package upgrade (keeps `tabs.ts`) |
| `update --force` | Full overwrite including your `tabs.ts` |
| `doctor` | Validate tabs config, routes, and peer deps |
| `add --list` | Prints available components and templates (Pro items are tagged `PRO`) |
| `login [--token <t>]` | Saves a CLI token to `~/.expo-kit/credentials.json` (0600) for Pro items |
| `logout` / `whoami` | Removes the saved token / shows your plan |

Same mental model as `npx shadcn@latest add button` — copy-paste, not an import from `node_modules`.

## Pro items

Pro components and blocks are not bundled in this package — `add` downloads them from
`https://expokit.karandev.in/api/registry/<name>` with your token (free registry dependencies still come from the package):

```bash
# 1. create a token at https://expokit.karandev.in/account (signed in, Pro plan)
npx @anshkaran7/expo-kit@latest login
npx @anshkaran7/expo-kit@latest add shimmer-button
```

`EXPO_KIT_TOKEN` overrides the saved token (CI); `EXPO_KIT_URL` points the CLI at another site (e.g. a local build).

Token safety:

- `EXPO_KIT_URL` must be `https://` — plain `http://` is only accepted for `localhost` / `127.0.0.1`.
- `login` prints which host will receive the token and saves that site's origin with it. A saved token is only
  sent to that origin or to `https://expokit.karandev.in`; pointing `EXPO_KIT_URL` elsewhere makes the CLI refuse
  (run `login` again against the new site). `EXPO_KIT_TOKEN` is only sent to the default site or a localhost server.
- Item names that aren't bundled with your CLI version are looked up on the site before "unknown item" is reported,
  and their npm dependencies come from the site's response.

`init` only touches `tsconfig.json` when `compilerOptions.paths["@/*"]` is missing, and keeps comments and
formatting when it adds it.

## AI assistants (MCP)

`expo-kit mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so Claude Code,
Cursor, VS Code (Copilot) or Codex can search ExpoKit, read an item's props, import line and examples, and get the
exact `add` command. It reads the registry bundled with the CLI — no network, and it never sees your token.

```bash
# writes .mcp.json / .cursor/mcp.json / .vscode/mcp.json in your app (codex prints a config.toml snippet)
npx @anshkaran7/expo-kit@latest mcp init --client claude

# or, for Claude Code:
claude mcp add expokit -- npx -y @anshkaran7/expo-kit@latest mcp
```

Then ask your assistant something like "add an ExpoKit bottom sheet to the settings screen".

Tools: `list_items`, `search_items`, `view_item` (props, examples, optional source for free items), `get_add_command`.
Pro items show props only; adding them still needs `login`.

## Registry

| Name | Type | Description |
| --- | --- | --- |
| `button` | component | Pressable with solid / outline / ghost, sizes, loading |
| `liquidglass-tab` | template | NativeTabs with dynamic icons/labels and App Store scroll-collapse |

Aliases for the tab template: `liquid-glass-tab`, `native-tabs`, `liquidglass-tabs`.

### Button

```bash
npx @anshkaran7/expo-kit@latest add button
```

Writes `src/components/ui/button.tsx` (path configurable via `components.json`).

```tsx
import { Button } from "@/components/ui/button";

<Button onPress={onSave} loading={isSaving}>
  Save
</Button>

<Button variant="outline" size="lg">
  Cancel
</Button>
```

### Liquid glass bottom tabs

```bash
npx @anshkaran7/expo-kit@latest add liquidglass-tab
```

Copies:

- `src/app/_layout.tsx`
- `src/app/(tabs)/_layout.tsx` + tab screens
- `src/lib/tabs.ts` — labels, icons, icon libraries, collapse behavior
- `src/lib/tab-icons.ts` — `iconFont` / `icoMoon` for any .ttf (Tabler, Hugeicons, …)
- `src/components/TabScreen.tsx`

Then installs peers (`expo-router`, gesture handler, screens, reanimated, etc.).

**Next steps after add:**

1. Edit `src/lib/tabs.ts` — labels, icon presets, colors, screen text
2. Run `npx @anshkaran7/expo-kit@latest doctor`
3. Real liquid glass needs a **dev build** on **iOS 26+** with **Xcode 26** — Expo Go usually shows a normal blur bar
4. Scroll a tab screen: the bar collapses into a glass circle (current tab) like the App Store; scroll up to expand
5. Run: `npx expo run:ios`

Preview or overwrite safely:

```bash
npx @anshkaran7/expo-kit@latest add liquidglass-tab --dry-run
npx @anshkaran7/expo-kit@latest add liquidglass-tab --force
npx @anshkaran7/expo-kit@latest update
npx @anshkaran7/expo-kit@latest doctor
```

## Configuration

`init` creates `components.json`:

```json
{
  "$schema": "https://expokit.karandev.in/schema.json",
  "aliases": {
    "components": "@/components",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "paths": {
    "components": "src/components",
    "lib": "src/lib",
    "app": "src/app"
  }
}
```

Change `paths` if your app layout differs (e.g. `app` instead of `src/app`).

## Requirements

- Node 18+
- Expo SDK 51+ (SDK 54+ recommended for native liquid-glass tabs)
- TypeScript or JavaScript
- `expo-router` for tab templates

## Docs

- Site: [expokit.karandev.in/docs](https://expokit.karandev.in/docs)
- Installation: [expokit.karandev.in/docs/installation](https://expokit.karandev.in/docs/installation)
- Liquid glass tabs: [expokit.karandev.in/docs/templates/native-tabs-liquid-glass](https://expokit.karandev.in/docs/templates/native-tabs-liquid-glass)

## License

MIT
