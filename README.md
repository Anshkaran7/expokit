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

Using Cursor, Claude Code, Antigravity, VS Code or Codex? `npx @anshkaran7/expo-kit@latest mcp` lets your
AI find and add components — see https://expokit.karandev.in/docs/mcp.

## What's here

| Folder | What |
| --- | --- |
| `registry/ui` | 43 free components (source, `item.json` and a demo) |
| `registry/lib` | Shared theme (`useKit`, `KitProvider`) |
| `registry/charts`, `registry/templates` | Free charts and app templates |
| `packages/cli` | `@anshkaran7/expo-kit`, the CLI (v0.1.3) |
| `packages/charts` | `expo-charts` |

ExpoKit Pro adds 3D, Liquid Glass and motion components, full-screen blocks and more charts:
https://expokit.karandev.in/pricing. Pro source is not in this repository.

## Contributing

See [registry/CONTRIBUTING.md](registry/CONTRIBUTING.md). Run the CLI tests with `npm test`.

## License

MIT — see [LICENSE](LICENSE).
