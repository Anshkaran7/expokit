# @expokit/cli

[![npm](https://img.shields.io/npm/v/@expokit/cli.svg)](https://www.npmjs.com/package/@expokit/cli)
[![CI](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml/badge.svg)](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Anshkaran7/expokit/badge)](https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

The CLI for **[ExpoKit](https://expokit.in)** — animated UI components for Expo and React Native. It copies
the component source into your app (like shadcn/ui), so you own the code.

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

## Docs

Everything else — live previews, props, installation, theming, Pro, AI / MCP setup and help — is on
**[expokit.in](https://expokit.in/docs)**.

## Security

- **No dependencies, no install scripts, no telemetry.**
- **Writes only inside your app** — `components.json`, the `@/*` alias in `tsconfig.json` and the component files.
  `--dry-run` shows every change first; `add` never overwrites a file you changed unless you pass `--force`.
  `paths` in `components.json` that point outside the app are refused. Symlinks inside the app are followed, not
  checked, so a cloned repo that symlinks a folder elsewhere can still send writes there.
- **Free components need no network** — they ship inside this package. Pro components are downloaded over HTTPS from
  expokit.in; your token is stored readable only by you, sent only to that site and never through a redirect.
  In scripts, pipe it to `login` or set `EXPO_KIT_TOKEN` (`--token` leaves it in your shell history).
- **Runs one command:** `npx expo install` for the packages a component needs — without `EXPO_KIT_TOKEN` in its
  environment, so install scripts never see your token.

Report a vulnerability privately: [SECURITY.md](https://github.com/Anshkaran7/expokit/blob/main/SECURITY.md).

## License

MIT
