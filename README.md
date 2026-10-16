# ExpoKit

Beautifully animated UI components, blocks and charts for **Expo and React Native**. You don't install
ExpoKit as a dependency — the CLI copies the source into your app, like shadcn/ui, and you own it.

- Docs and live previews: https://expokit.karandev.in
- Works on iOS, Android, web and Expo Go — plain React Native, `Animated` and `react-native-svg`.

## Quick start

```bash
npx @anshkaran7/expo-kit@latest init
npx @anshkaran7/expo-kit@latest add button otp-input bottom-sheet
```

## Use it with AI

- **Any editor (Cursor, Antigravity, VS Code, Windsurf, Codex):** add the MCP server `npx -y @anshkaran7/expo-kit@latest mcp` —
  setup for each one: https://expokit.karandev.in/docs/mcp.
- **Claude Code plugin** (skill + MCP server):
  ```
  /plugin marketplace add Anshkaran7/expokit
  /plugin install expokit@expokit
  ```
- Every docs page has **Copy for AI**, with a prompt written for your tool.

## What's here

| Folder | What |
| --- | --- |
| `registry/ui` | 43 free components (source, `item.json` and a demo) |
| `registry/lib` | Shared theme (`useKit`, `KitProvider`) |
| `registry/charts`, `registry/templates` | Free charts and app templates |
| `packages/cli` | `@anshkaran7/expo-kit`, the CLI (v0.1.3) |
| `packages/charts` | `expo-charts` |
| `skills/`, `.claude-plugin/` | The ExpoKit skill and Claude Code plugin |

ExpoKit Pro adds 3D, Liquid Glass and motion components, full-screen blocks and more charts:
https://expokit.karandev.in/pricing. Pro source is not in this repository.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [registry/CONTRIBUTING.md](registry/CONTRIBUTING.md).

```bash
npm ci
npm test            # CLI tests
npm run typecheck   # every free component and demo
```

## License

MIT — see [LICENSE](LICENSE).
