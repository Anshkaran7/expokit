# expo-charts

[![npm](https://img.shields.io/npm/v/expo-charts.svg)](https://www.npmjs.com/package/expo-charts)
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

## License

MIT
