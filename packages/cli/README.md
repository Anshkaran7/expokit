# @anshkaran7/expo-kit

[![npm](https://img.shields.io/npm/v/@anshkaran7/expo-kit.svg)](https://www.npmjs.com/package/@anshkaran7/expo-kit)
![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web%20%7C%20Expo%20Go-blue)
![License](https://img.shields.io/badge/license-MIT-green)

The CLI for **[ExpoKit](https://expokit.karandev.in)** — beautifully animated UI components, blocks and charts for Expo
and React Native. Like shadcn/ui, it copies the **source** into your app: no UI dependency in `node_modules`, just
typed files you own and can change.

- **40+ free components** — buttons, inputs, OTP, switches, sliders, sheets, dialogs, drawers, selects, toasts, date and
  time pickers, tabs, cards and more
- **Pro** — 3D and Liquid Glass components, motion buttons, full-screen blocks (sign-in, checkout, settings, …) and more charts
- Plain React Native `Animated` + `react-native-svg` — runs on iOS, Android, web and in Expo Go, no native setup
- Light / dark built in; one `<KitProvider accent radius>` re-skins everything

Live previews and docs for every item: **[expokit.karandev.in/docs](https://expokit.karandev.in/docs)**

## Quick start

In your Expo app's folder:

```bash
npx @anshkaran7/expo-kit@latest init
npx @anshkaran7/expo-kit@latest add button otp-input bottom-sheet
```

Then use them:

```tsx
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';

<OtpInput length={6} onComplete={verify} />
<Button variant="gradient" onPress={save}>Continue</Button>
```

See everything you can add:

```bash
npx @anshkaran7/expo-kit@latest add --list
```

## Commands

| Command | What it does |
| --- | --- |
| `init` | Creates `components.json` (where files go) and adds the `@/*` alias to `tsconfig.json` if it is missing |
| `add <name...>` | Copies the items and their registry dependencies, then runs `npx expo install` for missing packages |
| `add --list` | Every component, block, chart and template (Pro items are tagged `PRO`) |
| `add --dry-run` / `--force` | Preview the files without writing / overwrite files you changed |
| `update [name]` | Refreshes template framework files after an upgrade (your `tabs.ts` is kept; `--force` replaces it) |
| `doctor` | Checks `components.json`, routes and peer dependencies |
| `login` / `logout` / `whoami` | Saves, removes or shows the CLI token used for Pro items |
| `mcp` / `mcp init --client <name>` | Starts the MCP server for AI assistants / writes its config into your app |

`add` never silently replaces a shared file you edited (like `src/lib/kit.tsx`) — it keeps yours and tells you. `init` only
touches `tsconfig.json` when `compilerOptions.paths["@/*"]` is missing, and keeps its comments and formatting.

## Theming

Every component reads colours, radius and light / dark from `useKit()`. Wrap your app once to re-skin all of them:

```tsx
import { Slot } from 'expo-router';
import { KitProvider } from '@/lib/kit';

export default function RootLayout() {
  return (
    <KitProvider accent="#6366f1" radius={14}>
      <Slot />
    </KitProvider>
  );
}
```

## Use it with AI

`expo-kit mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server, so your AI editor can search
ExpoKit, read an item's props, import line and examples, and run the exact `add` command — instead of guessing an API.
It reads the registry bundled with the CLI: no network, and it never sees your token.

```bash
# Claude Code
claude mcp add expokit -- npx -y @anshkaran7/expo-kit@latest mcp

# Cursor, VS Code: writes .cursor/mcp.json or .vscode/mcp.json in your app (codex prints a config.toml snippet)
npx @anshkaran7/expo-kit@latest mcp init --client cursor
```

Antigravity, Windsurf and the rest: [expokit.karandev.in/docs/mcp](https://expokit.karandev.in/docs/mcp). Then just ask
_"add an ExpoKit bottom sheet to the settings screen"_. Tools: `list_items`, `search_items`, `view_item`, `get_add_command`.

No MCP? Every docs page has **Copy for AI** with a prompt written for Cursor, Claude Code, Antigravity, ChatGPT and others.

## Pro items

Pro items aren't bundled in this package. With an [ExpoKit Pro](https://expokit.karandev.in/pricing) plan, create a token
on [your account page](https://expokit.karandev.in/account), log in once, and add them like any other item:

```bash
npx @anshkaran7/expo-kit@latest login
npx @anshkaran7/expo-kit@latest add glass-tab-bar swipe-deck
```

`add` downloads them from `https://expokit.karandev.in/api/registry/<name>`; free registry dependencies still come from
the package. In CI, set `EXPO_KIT_TOKEN` instead of logging in.

<details>
<summary>Token safety</summary>

- The token is saved in `~/.expo-kit/credentials.json` with `0600` permissions, together with the site it belongs to.
- A saved token is only sent to that site or to `https://expokit.karandev.in`. If `EXPO_KIT_URL` points elsewhere, the
  CLI refuses until you run `login` against the new site. `EXPO_KIT_TOKEN` is only sent to the default site or localhost.
- `EXPO_KIT_URL` must be `https://` — plain `http://` is accepted only for `localhost` / `127.0.0.1`.

</details>

## Liquid Glass tabs template

```bash
npx @anshkaran7/expo-kit@latest add liquidglass-tab
```

Copies the `expo-router` layouts, tab screens and `src/lib/tabs.ts` (labels, icons, collapse behaviour) and installs its
peers. Real Liquid Glass needs a development build on iOS 26+ (`npx expo run:ios`); Expo Go shows a regular blur bar.
Run `doctor` afterwards. Docs: [expokit.karandev.in/docs/templates/liquidglass-tab](https://expokit.karandev.in/docs/templates/liquidglass-tab)

## Configuration

`init` writes `components.json`:

```json
{
  "aliases": { "components": "@/components", "lib": "@/lib", "hooks": "@/hooks" },
  "paths": { "components": "src/components", "lib": "src/lib", "app": "src/app" }
}
```

Change `paths` before adding items if your app doesn't use `src/` (for example `components` and `app`).

## Requirements

- Node 18+
- Expo SDK 55+ (TypeScript or JavaScript)
- `expo-router` for the tab template

## Links

- Docs: [expokit.karandev.in/docs](https://expokit.karandev.in/docs) · Installation: [/docs/installation](https://expokit.karandev.in/docs/installation) · CLI: [/docs/cli](https://expokit.karandev.in/docs/cli)
- Charts as a regular npm package: [`expo-charts`](https://www.npmjs.com/package/expo-charts)
- Source of the free components: [github.com/Anshkaran7/expokit](https://github.com/Anshkaran7/expokit) · Issues: [/issues](https://github.com/Anshkaran7/expokit/issues)

## License

MIT for the CLI and the free components. Pro items are licensed under the [ExpoKit terms](https://expokit.karandev.in/terms).
