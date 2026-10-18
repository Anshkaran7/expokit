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

<p align="center">
  <a href="https://www.npmjs.com/package/@expokit/cli"><img src="https://img.shields.io/npm/v/@expokit/cli?label=%40expokit%2Fcli" alt="@expokit/cli on npm"></a>
  <a href="https://www.npmjs.com/package/expo-charts"><img src="https://img.shields.io/npm/v/expo-charts?label=expo-charts" alt="expo-charts on npm"></a>
  <a href="https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml"><img src="https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit"><img src="https://api.scorecard.dev/projects/github.com/Anshkaran7/expokit/badge" alt="OpenSSF Scorecard"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
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

## Security

- **No runtime dependencies** — neither `@expokit/cli` nor `expo-charts` installs anything else (`expo-charts` only
  has peer dependencies), and neither runs install scripts.
- **Source in the open** — every published version is built from the code in this repository.
- **Checked continuously** — CI, [CodeQL](.github/workflows/codeql.yml) and
  [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit) run on every change.

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

## Community

- X: [@expo_kit](https://x.com/expo_kit)
- Instagram: [@expokit.in](https://www.instagram.com/expokit.in/)
- Email: [work@karandev.in](mailto:work@karandev.in)

## License

[MIT](LICENSE) © Karan (anshkaran7) — covers everything in this repository. ExpoKit Pro items are not part of it:
they are sold separately under the terms at https://expokit.karandev.in/terms. The ExpoKit name and logo are not
licensed for use as your own branding.
