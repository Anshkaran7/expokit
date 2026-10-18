# expo-charts

[![npm](https://img.shields.io/npm/v/expo-charts.svg)](https://www.npmjs.com/package/expo-charts)
[![CI](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml/badge.svg)](https://github.com/Anshkaran7/expokit/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Anshkaran7/expokit/badge)](https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit)
![Types](https://img.shields.io/badge/types-included-blue)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

Animated, interactive charts for Expo and React Native, built on `react-native-svg` — line, bar, area, pie, donut,
radar, gauge, candlestick, heatmap, funnel and more. Works on iOS, Android, web and in Expo Go.

## Install

```bash
npx expo install expo-charts react-native-svg
```

## Usage

```tsx
import { LineChart } from 'expo-charts';

<LineChart
  data={[18, 24, 22, 31, 36, 42]}
  width={350}
  height={250}
  formatValue={(v) => `$${v}K`}
/>;
```

## Docs

Every chart with live previews, props, theming and help: **[expokit.karandev.in/docs/charts](https://expokit.karandev.in/docs/charts)**.

## Security

No dependencies (only `react`, `react-native` and `react-native-svg` as peers), no install scripts, no network access.
Report a vulnerability privately:
[SECURITY.md](https://github.com/Anshkaran7/expokit/blob/main/SECURITY.md).

## License

MIT
