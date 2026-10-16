# 📊 Expo Charts

A modern, customizable charting library built specifically for Expo and React Native applications. Create beautiful, animated charts with minimal configuration.

![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
[![npm](https://img.shields.io/npm/v/expo-charts.svg)](https://www.npmjs.com/package/expo-charts)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Current Features

- 📊 21 charts: Bar, Line, Area, Pie, Donut, Multi-line, Stacked/Grouped bars, Ranking bars, Radar, Activity rings, Gauge, Candlestick, Heatmap, Funnel and Sparkline, plus shadcn-style Area, Line, Bar, Combo, Pie and Radial series charts
- 📱 Built specifically for Expo and React Native
- 🎨 Fully customizable colors and styles
- ⚡ Smooth animations
- 📱 Responsive design
- 🔥 High performance
- 💪 TypeScript support
- 🔍 Interactive tooltips and press/drag callbacks
- 📦 Lightweight

## 🚀 Installation

```bash
# Using npm
npm install expo-charts react-native-svg

# Using yarn
yarn add expo-charts react-native-svg

# Using pnpm
pnpm add expo-charts react-native-svg
```

## 📋 Requirements

- Expo SDK 48 or later
- React Native 0.71.0 or later
- react-native-svg 13.0.0 or later

## 🎯 Quick Start

```jsx
import { AreaChart, BarChart, DonutChart, LineChart, PieChart } from "expo-charts";

export default function App() {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  return (
    <>
      <LineChart
        data={[18, 24, 22, 31, 36, 42]}
        width={350}
        height={250}
        title="Revenue"
        subtitle="Drag or tap points"
        lineColor="#2563EB"
        accentColor="#7C3AED"
        formatValue={(value) => `$${value}K`}
        formatLabel={(index) => labels[index]}
        onPointPress={(value, index) => console.log(value, index)}
      />

      <BarChart
        data={[12, 19, 15, 28, 32, 41]}
        width={350}
        height={240}
        title="Users"
        primaryColor="#2563EB"
        secondaryColor="#10B981"
        formatLabel={(index) => labels[index]}
        onBarPress={(value, index) => console.log(value, index)}
      />

      <DonutChart
        data={[
          { label: "Organic", value: 42 },
          { label: "Paid", value: 28 },
          { label: "Referral", value: 18 },
          { label: "Direct", value: 12 },
        ]}
        centerValue="100%"
        centerLabel="Traffic"
        width={300}
        height={300}
      />
    </>
  );
}
```

## 📖 Available Charts

### Bar Chart

The Bar Chart component offers extensive customization and interactivity:

![Bar Chart Example](https://raw.githubusercontent.com/Anshkaran7/expokit/main/packages/charts/assets/barchart.png)

```jsx
<BarChart
  data={[10, 20, 18, 32]}
  width={350}
  height={240}
  title="Sales Data"
  primaryColor="#2563EB"
  secondaryColor="#7C3AED"
  formatLabel={(index) => ["Q1", "Q2", "Q3", "Q4"][index]}
  onBarPress={(value, index) => console.log(value, index)}
/>
```

#### Props

| Prop           | Type                                     | Default             | Description           |
| -------------- | ---------------------------------------- | ------------------- | --------------------- |
| data           | Array<number>                            | []                  | Data to be displayed  |
| width          | number                                   | 300                 | Width of the chart    |
| height         | number                                   | 200                 | Height of the chart   |
| title          | string                                   | ''                  | Chart title           |
| primaryColor   | string                                   | '#4C51BF'           | Primary bar color     |
| secondaryColor | string                                   | '#48BB78'           | Secondary bar color   |
| animate        | boolean                                  | true                | Enable animations     |
| showGrid       | boolean                                  | true                | Show background grid  |
| formatValue    | (value: number) => string                | (v) => v.toString() | Format value labels   |
| formatLabel    | (index: number) => string                | (i) => i.toString() | Format x-axis labels  |
| onBarPress     | (value: number, index: number) => void   | undefined           | Bar press handler     |
| getBarColor    | (value: number, index: number) => string | undefined           | Custom color function |

### Line Chart

The Line Chart component supports curved lines, area fills, tooltips, and drag/tap selection:

![Line Chart Example](https://raw.githubusercontent.com/Anshkaran7/expokit/main/packages/charts/assets/linechart.png)

```jsx
<LineChart
  data={linechartData}
  width={350}
  height={250}
  lineColor="#6366F1"
  accentColor="#818CF8"
  labelColor="#1F2937"
  axisColor="#E5E7EB"
  backgroundColor="#FFFFFF"
  title="Monthly Revenue"
  subtitle="Revenue growth over time"
  formatValue={(value) => `$${value}K`}
  formatLabel={(index) => months[index]}
  showGrid={true}
  animate={true}
  showDots={true}
  showArea={true}
  onPointPress={(value, index) => console.log(value, index)}
/>
```

#### Props

| Prop            | Type                      | Default             | Description               |
| --------------- | ------------------------- | ------------------- | ------------------------- |
| data            | Array<number>             | []                  | Data points               |
| width           | number                    | 300                 | Width of the chart        |
| height          | number                    | 200                 | Height of the chart       |
| title           | string                    | ''                  | Chart title               |
| subtitle        | string                    | ''                  | Chart subtitle            |
| lineColor       | string                    | '#6366F1'           | Line color                |
| accentColor     | string                    | '#818CF8'           | Dots and highlights color |
| labelColor      | string                    | '#1F2937'           | Label text color          |
| axisColor       | string                    | '#E5E7EB'           | Axis lines color          |
| backgroundColor | string                    | '#FFFFFF'           | Chart background color    |
| showDots        | boolean                   | true                | Show data points          |
| showArea        | boolean                   | false               | Show area under line      |
| showGrid        | boolean                   | true                | Show background grid      |
| animate         | boolean                   | true                | Enable animations         |
| formatValue     | (value: number) => string | (v) => v.toString() | Format y-axis labels      |
| formatLabel     | (index: number) => string | (i) => i.toString() | Format x-axis labels      |
| onPointPress    | (value, index) => void    | undefined           | Point select handler      |

### Area Chart

```jsx
<AreaChart
  data={[12, 18, 16, 27, 34, 39]}
  width={350}
  height={240}
  title="Engagement"
  color="#10B981"
  accentColor="#2563EB"
  formatLabel={(index) => labels[index]}
  onPointPress={(value, index) => console.log(value, index)}
/>
```

### Pie Chart

```jsx
<PieChart
  data={[
    { label: "Mobile", value: 42 },
    { label: "Web", value: 28 },
    { label: "Tablet", value: 18 },
    { label: "API", value: 12 },
  ]}
  width={300}
  height={300}
  onSegmentPress={(item, index) => console.log(item, index)}
/>
```

### Donut Chart

```jsx
<DonutChart
  data={[
    { label: "Organic", value: 42 },
    { label: "Paid", value: 28 },
    { label: "Referral", value: 18 },
    { label: "Direct", value: 12 },
  ]}
  centerValue="$12.4K"
  centerLabel="Total"
  width={300}
  height={300}
/>
```

## 🎨 Series charts and theming

These charts follow the [shadcn/ui charts](https://ui.shadcn.com/charts) model: you pass rows of `data` plus a `config` that names the series. Wrap your app in `ChartProvider` to theme every chart at once (palette, light/dark, radius).

```tsx
import { ChartProvider, ChartCard, AreaSeriesChart, Chart } from "expo-charts";

const data = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 200 },
  { month: "Mar", desktop: 237, mobile: 120 },
];
const config = { desktop: { label: "Desktop" }, mobile: { label: "Mobile" } };

<ChartProvider palette="blue" mode="system">
  <ChartCard title="Visitors" description="Last 3 months" trend={{ value: 5.2 }}>
    <AreaSeriesChart data={data} config={config} xKey="month" stacked showLegend />
  </ChartCard>
  <Chart.Pie data={browsers} nameKey="browser" valueKey="visitors" innerRadius={0.6} />
</ChartProvider>
```

| Chart (`Chart.*` alias) | Highlights |
| --- | --- |
| `AreaSeriesChart` (`Chart.Area`) | Curves `monotone` / `natural` / `linear` / `step`, stacked, 100% expanded, gradient |
| `LineSeriesChart` (`Chart.Line`) | Dots, value labels, dashed keys for targets/forecasts |
| `BarSeriesChart` (`Chart.Bar`) | Grouped / stacked, `layout="horizontal"`, negative colours, labels, per-bar `getColor` |
| `ComboChart` (`Chart.Combo`) | Bars + lines + areas on one axis via `types` |
| `PieSeriesChart` (`Chart.Pie`) | Pie or donut, pad angle, active slice pops out, drag around to select, centre text, outside labels |
| `RadialSeriesChart` (`Chart.Radial`) | Radial bars, any start angle/sweep (e.g. a semicircle), stacked segments, centre text |

**Pro charts:** Polar Area, Isometric Bars, Pixel Bars, Treemap, Waterfall, Bullet and Timeline are not part of this package. ExpoKit Pro users add them to their app with the CLI (for example `npx @anshkaran7/expo-kit add treemap`); the copied source builds on `expo-charts`.

**Shared behaviour:** each chart fills its parent when `width` is left out. When data changes, the paths animate smoothly to the new shape. You can scrub with a finger (the tooltip follows it), tap to pin a selection, and tap legend items to toggle series. Common props: `height`, `radius`, `strokeWidth`, `showGrid`, `showXAxis`, `showYAxis`, `showLegend`, `showLabels`, `tooltipIndicator` (`dot`, `line` or `dashed`), `formatValue`, `formatLabel`, `onSelect`, `onScrubStart` and `onScrubEnd`.

**Building blocks:** `ChartCard`, `ChartTooltip`, `ChartLegend`, `TrendIcon`, `useChartTheme()`, `palettes`, and the path helpers `buildPath`, `roundedRect` and `sector`. For custom charts there are also `responsive`, `TouchLayer`, `useMorphPaths`, `useAnimatedValues`, `AnimatedPath` / `AnimatedRect` and the number helpers `niceTicks`, `compactNumber`, `labelStep`, `estimateTextWidth`, `clamp` and `readableTextColor`.

**Palettes:** `default`, `blue`, `green`, `violet`, `rose`, `orange`, `vivid`. You can also pass your own `string[]`. The interactive charts below pick up the provider's palette and colours too.

## 👆 Interactive charts

Each of these charts **fills its parent's width when you leave out `width`**, and re-lays out on rotation, split screen and tablets. They share theme props (`labelColor`, `gridColor`, `tooltipBackground`, `tooltipTextColor`), an `animate` flag, `formatValue`, and an `onSelect` callback (handy for haptics). Data changes morph smoothly instead of jumping.

| Chart | Interaction |
| --- | --- |
| `MultiLineChart` | Drag sideways to scrub; the header follows your finger. Tap the legend to hide a series. |
| `CandlestickChart` | Scrub for OHLC, change % and a price tag; optional volume bars. |
| `StackedBarChart` | Tap a bar for a breakdown tooltip. Switch `mode="stacked" \| "grouped"` and it morphs. |
| `HorizontalBarChart` | Auto-sorted ranking; tap a row. |
| `RadarChart` | Spring-in polygons (native driver); tap an axis to compare; legend toggles. |
| `ProgressRings` | Activity-style rings; tap a ring to focus it. |
| `GaugeChart` | Animated needle (native driver); `interactive` lets users drag the dial. |
| `HeatmapChart` | Calendar-style grid with a wave-in animation; tap a cell. |
| `FunnelChart` | Step-to-step conversion %; tap a stage. |
| `Sparkline` | Tiny inline trend with a pulsing last point, for KPI cards. |

```tsx
import { MultiLineChart, GaugeChart, ProgressRings } from "expo-charts";

const [scrollEnabled, setScrollEnabled] = useState(true);

<ScrollView scrollEnabled={scrollEnabled}>
  <MultiLineChart
    series={[
      { name: "Revenue", data: [12, 18, 15, 22, 28, 31], color: "#3B82F6" },
      { name: "Costs", data: [8, 9, 11, 10, 14, 15], color: "#EC4899" },
    ]}
    labels={["Jan", "Feb", "Mar", "Apr", "May", "Jun"]}
    // Pause the ScrollView while the finger scrubs the chart.
    onScrubStart={() => setScrollEnabled(false)}
    onScrubEnd={() => setScrollEnabled(true)}
  />

  <GaugeChart
    value={score}
    interactive
    onChange={setScore}
    segments={[
      { to: 40, color: "#EF4444" },
      { to: 70, color: "#F59E0B" },
      { to: 100, color: "#10B981" },
    ]}
  />

  <ProgressRings
    rings={[
      { label: "Move", value: 420, max: 600, color: "#EF4444" },
      { label: "Exercise", value: 22, max: 30, color: "#10B981" },
    ]}
  />
</ScrollView>
```

All props are typed. See `src/types.ts` for the full list.

Live previews of every chart: [expokit.karandev.in/docs/charts](https://expokit.karandev.in/docs/charts).

## 🎨 Styling Guide

Every chart takes a `style` for its container, on top of its colour and layout props:

```jsx
// Example of advanced styling
<BarChart
  style={{
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  }}
  // ... other props
/>
```

## ⚡ Performance Tips

1. Use `React.memo` for static charts
2. Disable animations for real-time data
3. Memoize callbacks and formatters
4. Use appropriate dimensions for your device
5. Avoid unnecessary re-renders

## 🤝 Contributing

The source lives in [github.com/Anshkaran7/expokit](https://github.com/Anshkaran7/expokit/tree/main/packages/charts).
Found a bug or want a chart? [Open an issue](https://github.com/Anshkaran7/expokit/issues/new/choose) — a screenshot or the
data you used helps a lot.

## 📝 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 📫 Support

Need help? We're here for you:

- Open an [issue](https://github.com/Anshkaran7/expokit/issues)
- Email: ansh.tsx@gmail.com

---

Made with ❤️ by [Karandev.in](https://karandev.in)
