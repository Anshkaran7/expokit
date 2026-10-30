# @expokit/cli

[![npm](https://img.shields.io/npm/v/@expokit/cli.svg)](https://www.npmjs.com/package/@expokit/cli)
[![CI](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml/badge.svg)](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Anshkaran7/expokit/badge)](https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

The CLI for **[ExpoKit](https://expokit.in)** — animated UI components for Expo and React Native. It copies
the component source into your app (like shadcn/ui), so you own the code.

<p align="center">
  <a href="https://expokit.in/showcase"><img src="https://expokit.in/readme/charts.gif" alt="ExpoKit charts on iPhone: scrubbing an area chart and a bar chart, dragging a gauge, tapping through a donut" width="720"></a>
</p>

<p align="center">
  <a href="https://expokit.in/docs/components"><img src="https://expokit.in/readme/screens.jpg" alt="ExpoKit on iPhone in dark and light mode: payment card, flip card, dashboard block and checkout block" width="720"></a>
  <br>
  <sub>Payment card and flip card are free; the dashboard and checkout screens are <a href="https://expokit.in/pricing">Pro</a> blocks.</sub>
</p>

- **Buttons, inputs, cards, sheets, tabs, charts and full screens**, all animated, with light and dark mode
- **Built for touch**: springs, drag gestures and haptics, on iOS, Android, web and in Expo Go
- **You own the code**: plain typed files in your app, with no runtime library to lock you in

**[Browse every component with live previews →](https://expokit.in/docs/components)** ·
**[Try them on your phone in Expo Go →](https://expokit.in/docs/run-on-your-phone)**

## Usage

In your Expo app's folder:

```bash
npx @expokit/cli@latest init
npx @expokit/cli@latest add button otp-input
```

```tsx
import { Button } from '@/components/ui/button';

<Button onPress={save}>Save</Button>;
```

See every component: `npx @expokit/cli@latest add --list`

Already have a `Skeleton.tsx` (or any file the kit would clash with)? `add` skips that item, says why, and adds the
rest. Put the kit's copy next to yours with `--dir`:

```bash
npx @expokit/cli@latest add skeleton --dir src/components/kit   # import from "@/components/kit/ui/skeleton"
```

`init` asks for your brand colour, font, radius and light / dark (or takes `--brand`, `--font`, `--radius`,
`--scheme`; `--yes` skips the questions) and writes `lib/kit-theme.tsx`, an `<AppTheme>` wrapper for your root layout.

## Keeping up to date

`components.json` remembers a hash of every file `add` wrote. When a new CLI ships fixes:

```bash
npx @expokit/cli@latest diff toast      # your changes since install, and what changed upstream
npx @expokit/cli@latest update          # refresh every installed item
```

`update` refreshes the files nobody touched and stops on a file you patched, showing the diff, so your fix is never
silently replaced. `update toast --force` takes upstream anyway.

## Docs

Everything else — live previews, props, installation, theming, Pro, AI / MCP setup and help — is on
**[expokit.in](https://expokit.in/docs)**.

## Security

- **No dependencies, no install scripts.**
- **Anonymous install counts only** — after a successful `add`, the CLI sends the item's name (`{"items":["button"]}`)
  to expokit.in so the site can show how often each component is installed. No token, files, paths or machine details;
  repeat adds count once a day. Turn it off with `DO_NOT_TRACK=1` or `EXPO_KIT_TELEMETRY=0`; it never runs in CI,
  `--dry-run` or `update`.
- **Writes only inside your app** — `components.json`, the `@/*` alias in `tsconfig.json` and the component files.
  `--dry-run` shows every change first; `add` and `update` never overwrite a file you changed unless you pass
  `--force` (the hashes in `components.json` only ever mark a file as untouched; their paths are never read or
  written), and
  never replaces one that differs only by case (`Skeleton.tsx` vs `skeleton.tsx`), a symlink or a folder, not even
  with `--force`. `paths` in `components.json` that point outside the app are refused, and `aliases` must be plain
  import aliases (they are written into the copied files' imports). A file that is a symlink is never written
  through; a symlinked *folder* inside the app is still followed, so a cloned repo that links a folder elsewhere can
  send writes there.
- **Free components need no network to install** — they ship inside this package. Pro components are downloaded over HTTPS from
  expokit.in; your token is stored readable only by you, sent only to that site and never through a redirect.
  In scripts, pipe it to `login` or set `EXPO_KIT_TOKEN` (`--token` leaves it in your shell history).
- **Runs one command:** `npx expo install` for the packages a component needs — without `EXPO_KIT_TOKEN` in its
  environment, so install scripts never see your token.

Report a vulnerability privately: [SECURITY.md](https://github.com/Anshkaran7/expokit/blob/main/SECURITY.md).

## License

MIT
