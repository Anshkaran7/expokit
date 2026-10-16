<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://expokit.karandev.in/logo-mark-light.svg">
    <img src="https://expokit.karandev.in/logo-mark.svg" alt="ExpoKit" height="72">
  </picture>
</p>

<h1 align="center">ExpoKit</h1>

<p align="center">
  Beautifully animated UI components, charts and templates for Expo and React Native.
  <br>
  <a href="https://expokit.karandev.in">Website</a> ·
  <a href="https://expokit.karandev.in/docs">Docs</a> ·
  <a href="https://www.npmjs.com/package/@expokit/cli">CLI on npm</a> ·
  <a href="https://www.npmjs.com/package/expo-charts">expo-charts on npm</a>
</p>

## What is ExpoKit?

ExpoKit works like shadcn/ui for mobile: instead of installing a UI library, the CLI copies each component's source
into your app. You get readable, typed files you own and can change however you like.

- **Built for touch** — springs, drag gestures, squash and stretch, haptics-ready feedback
- **Runs everywhere** — iOS, Android, web and Expo Go, with plain React Native `Animated` and `react-native-svg`
- **One theme** — light and dark built in; one `KitProvider` re-skins every component
- **Accessible** — roles, states and labels for VoiceOver and TalkBack, 44pt touch targets
- **AI-ready** — an MCP server and a Claude Code plugin let your editor find and add components for you

## What's in this repo

| Folder | What |
| --- | --- |
| `registry/` | The free components, charts and templates — each with its source, props (`item.json`) and demos |
| `packages/cli` | `@expokit/cli`, the CLI that adds components to your app |
| `packages/charts` | `expo-charts`, animated and interactive charts |
| `skills/`, `.claude-plugin/` | The ExpoKit skill and Claude Code plugin |

[ExpoKit Pro](https://expokit.karandev.in/pricing) adds 3D and Liquid Glass components, full-screen blocks and more
charts. Pro source is not in this repository.

## Docs

Installation, live previews, props, theming and AI setup for every component:
**[expokit.karandev.in/docs](https://expokit.karandev.in/docs)**

## Feedback

This repository is a read-only mirror of ExpoKit, so pull requests are closed automatically. Found a bug or want a
component? [Open an issue](https://github.com/Anshkaran7/expokit/issues/new/choose).

## License

[MIT](LICENSE) © Karan (anshkaran7)
