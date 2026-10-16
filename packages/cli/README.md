# @anshkaran7/expo-kit

[![npm](https://img.shields.io/npm/v/@anshkaran7/expo-kit.svg)](https://www.npmjs.com/package/@anshkaran7/expo-kit)
![License](https://img.shields.io/badge/license-MIT-green)

The CLI for **[ExpoKit](https://expokit.karandev.in)** — animated UI components for Expo and React Native. It copies
the component source into your app (like shadcn/ui), so you own the code.

## Usage

In your Expo app's folder:

```bash
npx @anshkaran7/expo-kit@latest init
npx @anshkaran7/expo-kit@latest add button otp-input
```

```tsx
import { Button } from '@/components/ui/button';

<Button onPress={save}>Save</Button>;
```

See every component: `npx @anshkaran7/expo-kit@latest add --list`

## Docs

Everything else — live previews, props, installation, theming, Pro, AI / MCP setup and help — is on
**[expokit.karandev.in](https://expokit.karandev.in/docs)**.

## License

MIT
