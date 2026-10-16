# Writing an ExpoKit component

Every component is copy-pasted into someone's app, so it has to read like code they would be
proud to own: one file, typed props, no magic, works everywhere.

## Layout

```
registry/ui/<name>/
  item.json                          metadata, props table, deps
  demo.tsx                           every `export function X()` is one live preview variant
  src/components/ui/<name>.tsx       the component (what the CLI copies)
```

`item.json`

```json
{
  "name": "<name>",
  "title": "Title Case Name",
  "category": "Inputs | Selection | Buttons | Feedback | Overlays | Display | Navigation | Motion",
  "description": "One or two sentences — what it does and what makes the motion special.",
  "dependencies": ["react-native-svg"],
  "registryDependencies": ["kit"],
  "props": [["propName", "type", "default", "What it does."]]
}
```

`dependencies` are npm packages the user must install. Only `react-native-svg` and `expo-haptics`
are allowed beyond React Native itself. `registryDependencies` always includes `"kit"`; add another
component (e.g. `"floating-input"`) if you import it.

## Rules

1. **Runs everywhere, no native setup.** iOS, Android, web and Expo Go. Use React Native's
   `Animated`, `PanResponder`, `LayoutAnimation`-free code. No Reanimated, Gesture Handler, Skia,
   Linear Gradient or Blur. SVG via `react-native-svg` is fine (animate props with
   `Animated.createAnimatedComponent`).
2. **Theme from `useKit()`** (`@/lib/kit`): `colors`, `radius`, `dark`, plus `motion` presets and
   `alpha(hex, a)`. Never hard-code greys. Accept an `accent?: string` (or `color`) prop that
   defaults to `colors.accent` where a component has a highlight colour. Corners follow the kit:
   `radius.sm|md|lg|xl`, `radius.scale(n)` for a corner designed at the default radius 12, and
   `radius.capsule(h)` for bars and chips (pill at ≥ 12, square at 0) — never a bare number or
   `h / 2`. Don't edit `lib/kit.tsx` in a component PR; kit changes are reviewed on their own.
3. **Native driver whenever possible.** `transform` and `opacity` → `useNativeDriver: true`.
   Colours, width/height, SVG props → `useNativeDriver: false`, on a *different* Animated.Value
   and a *different* view than native-driven ones (never mix drivers on one node).
4. **Springs over timings** for anything the user touches; use `motion.snappy | bouncy | gentle`.
5. **Controlled + uncontrolled.** `value` / `onChange` (or `onValueChange`) plus `defaultValue`.
6. **Variants and sizes** via string unions (`variant`, `size`). Aim for 3+ meaningful variants.
7. **Accessibility:** `accessibilityRole`, `accessibilityState`, `accessibilityLabel`, ≥ 44pt hit
   targets (use `hitSlop` when smaller).
8. **Style:** `StyleSheet.create` at the bottom, 2-space indent, single quotes, named export
   (`export function Switch`), exported props interface (`export interface SwitchProps`), a short
   JSDoc on the component. Accept `style?: StyleProp<ViewStyle>` on the root.
9. **No dependencies between demos and app state.** `demo.tsx` imports only from `react`,
   `react-native`, `@/components/ui/*` and `@/lib/kit` (theme only: `useKit`, `alpha`,
   `readableOn`). Demo chrome (cards, titles, buttons) must come from the theme, never hex —
   the docs customizer restyles the preview through `<KitProvider accent radius>`. Each variant is self-contained, ~5–30 lines, realistic
   copy (no lorem ipsum), and fits a 360pt-wide phone. Width is given by the preview frame — use
   `alignSelf`/flex, never fixed screen widths.
10. Keep it typed: `strict` TypeScript, no `any` in the public props.

## Pull requests

Open a PR with the three files above and a short screen recording of each variant on iOS and Android.
The maintainer adds it to the CLI and the docs site.
