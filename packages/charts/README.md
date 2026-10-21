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

## Built for phones

- **Scrub with your finger**, tap to pin a point; charts never fight the page's ScrollView (iOS and Android).
- **Haptics**: one line gives every chart a selection tick.
- **VoiceOver & TalkBack**: each chart reads a summary, and swiping up / down steps through the points.
- **Reduce Motion**: animations switch off when the phone asks for it. Text follows the font size setting (capped so layouts hold).
- **Real-world data**: missing values leave a gap (`connectNulls` to bridge), `yDomain={["auto", "auto"]}` for prices and
  vitals, `referenceLines` for goals and limits, an empty state, and dense series skip their dots automatically.

```tsx
import * as Haptics from 'expo-haptics';
import { ChartProvider, LineSeriesChart } from 'expo-charts';

<ChartProvider haptics={Haptics.selectionAsync}>
  <LineSeriesChart
    data={prices} // [{ day: "1 Oct", close: 148.2 }, …]
    config={{ close: { label: "Close" } }}
    xKey="day"
    yDomain={["auto", "auto"]}
    referenceLines={[{ value: 148.2, label: "Open" }]}
    activeIndex={prices.length - 1} // show the latest price until the finger scrubs
  />
</ChartProvider>;
```

## Mobile dashboard charts

Capsule bars, tick bars, a fan gauge and mini rings for health, fitness and analytics screens. They are plain
Views animated on the native UI thread, so they stay smooth even while your JS thread is busy.

```tsx
import { PillBarChart, TickBarChart, FanGauge, MiniRing } from 'expo-charts';

<PillBarChart data={steps} activeGradient={['#C3E550', '#4C9A3B']} defaultIndex={4} dimAfter={4} activeDot />
<PillBarChart data={week} max={100} track />            // progress to a goal
<TickBarChart data={[{ label: 'Done', value: 1012 }, { label: 'Pending', value: 340 }]} />
<FanGauge value={82} label="Sales Growth" onChange={setValue} />
<MiniRing value={72} color="#E4572E" />
```

More in the same family: `PriceChart` (stock/crypto with 1D–ALL tabs), `GoalBars`, `ActivityRings`, `ScoreGauge`,
`BeadChart`, `StatCard`, `BarList`, `SegmentedBar`, `RangeBarChart`, `DivergingBarChart`, `StackedPillChart`,
`WaffleChart`, `CalendarHeatmap`, `TickRing`, `LiquidGauge`, and 3D `Donut3D` / `CylinderBarChart`.

## Docs

Every chart with live previews, props, theming and help: **[expokit.in/docs/charts](https://expokit.in/docs/charts)**.

## Security

No dependencies (only `react`, `react-native` and `react-native-svg` as peers), no install scripts, no network access.
Report a vulnerability privately:
[SECURITY.md](https://github.com/Anshkaran7/expokit/blob/main/SECURITY.md).

## License

MIT
