import React, { useId } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export type GrainPalette =
  | 'sunset'
  | 'ocean'
  | 'aurora'
  | 'dusk'
  | 'peach'
  | 'graphite'
  | 'ember'
  | 'mint'
  | 'lavender'
  | 'candy'
  | 'forest'
  | 'noir';

export interface GrainGradientProps {
  /** A built-in colour set. */
  palette?: GrainPalette;
  /** Your own colours: the first is the base, the rest become soft blobs (up to 4). Overrides `palette`. */
  colors?: string[];
  /** Strength of the film grain, 0–1. */
  grain?: number;
  /** Shuffle where the blobs sit. */
  seed?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export interface GrainOverlayProps {
  /** Strength of the grain, 0–1. */
  grain?: number;
  style?: StyleProp<ViewStyle>;
}

const PALETTES: Record<GrainPalette, string[]> = {
  sunset: ['#2a1238', '#ff6a3d', '#ff3d8b', '#ffc15e', '#7b2ff7'],
  ocean: ['#04203a', '#0fb5c9', '#2f6bff', '#7ce7d6', '#123f8f'],
  aurora: ['#0b1324', '#2ee6a6', '#7b5cff', '#1fa2ff', '#b8ff6b'],
  dusk: ['#1a1433', '#ff7aa8', '#6d5dfc', '#ffb38a', '#2b2a6b'],
  peach: ['#ffe9dc', '#ffb48a', '#ff8fab', '#ffd6a5', '#c7b8ff'],
  graphite: ['#16171b', '#3b3f4a', '#6b6f7d', '#2a2d35', '#8a8f9e'],
  ember: ['#1c0806', '#ff4e1f', '#ff9a3c', '#b3122e', '#ffd36e'],
  mint: ['#e6fff6', '#7ff0c8', '#58c7ff', '#c4ffde', '#9bf2a8'],
  lavender: ['#efe9ff', '#b9a2ff', '#ff9ed8', '#a8c8ff', '#e0c3ff'],
  candy: ['#2b0a3d', '#ff5fa2', '#4dd8ff', '#ffe066', '#a05bff'],
  forest: ['#071a12', '#1f8a5b', '#7ccf6b', '#0f5c4a', '#d4e66b'],
  noir: ['#050506', '#2b2b33', '#5b4bff', '#121216', '#ff3d6e'],
};

/** Every built-in palette, in order. */
export const GRAIN_PALETTES = Object.keys(PALETTES) as GrainPalette[];

// Where the blobs sit, in percent of the box: [cx, cy, r].
const SPOTS: [number, number, number][][] = [
  [[18, 22, 62], [86, 30, 58], [30, 88, 64], [82, 86, 52]],
  [[80, 16, 60], [14, 52, 58], [62, 70, 66], [24, 96, 48]],
  [[50, 8, 64], [8, 78, 60], [92, 62, 58], [46, 50, 40]],
];

// 128×128 tiling noise (grey speckle with varying alpha), drawn at 2× so each speck is one device pixel or so.
const NOISE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAQAAABpN6lAAAAyMklEQVR42k2dwZXdOAwEeVYADEABMACeFBpDY2a0UNX647fPa3s88yWRINBoNKDWrtWf3mab+2rX08/7p2fuvue6nrHup6+rjXav9+97vn+a75/mc7X368+1730/93r/fPrpz9j34etrvP+fq++x+/v589xnnFF/8ir1SXu+15jtOvd6v/95r/F+xrXm+zn3+xPv19/vfT+7vV+t69ZPPfd57+29xljv57X+Xuk67/0+9anvd7/fdde/13ft8X7l/b49Wv3+XpXnen/2qSe53k9977jtunTfPMp7S3Xx9yPfj7reW34/+Fz8qhuom3p/9Mx3We66UD1me7+r1eO/X3kX5X7G+7DvIr4XrM94v/L+6mvu92/16/1zr0d/byqPu3urJaiHeb/+3uZ7N3x6fx97vH+7699qM2obamPau0Dv/9/PXHX1UYu+ayHeJauNen+9D75qyUYt/nu1u676/undkDPqSqfutrb+XbnxPtb7IfWPtWavFdTjXmUF78O+l9isJ4/xPnSrPb9Prej7va12fby3/O7oe0tlK6N+7v2393K1A0/dRC1cffbAOuqh6hbrtt9Hr8V4l5lHPzzw+1hlVbUko/7ltQ7/dtfS/n3u+yDvDp+yk5v7rc+869qrbLasmTt7sINV+88TrfqZd0nfn+NCdel331wVDbpW+P2B+v+oh29lkKNu+F2g9/veh63HfG+wFmBhHXVcytBax8CxiNrNw4OVbb1fqX3A3k4t17t/tWetHrkWlYNSC1rfUVa0y9jfhXpv9soS9+OSl22NusP3uhzhd9PKUrjjp7a0lw0vrrA4PHVXLNpd21zHrtW+vz9WDz/4kDohZWqsd12yaYyvRZTxvTv8rvWjsdYxqZPZ63brUepnz41nwCreW60bv/ExZbi9fr17Ub6kTH/UgtWiPDzwxj/U76uWppaW4/d+Tq9db/7se7/4m7r6xVLX9TrGXxZQnzPxbnWIu16l1UOzCR6hOrLv870Pxv69j1Entx601r8MpswHu9j+GnWma21xLHXD72Vf863bfc8zFlQ3yUOfWpYy3bucW1lLubWyifcs4wyf2jusq8wVl1Q3XSZdOzQbJ1pnXP/6Pk797HtvuEO3rP7DwdYG1IPxu15m4Kuug3fAj9QSvE51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';

/** Film grain to lay over anything: a photo, a gradient, a flat colour. Fills its parent; never takes touches. */
export function GrainOverlay({ grain = 0.55, style }: GrainOverlayProps) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: Math.max(0, Math.min(1, grain)) }, style]}>
      <Image source={{ uri: NOISE, scale: 2 }} alt="" resizeMode="repeat" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * A soft mesh-style gradient — a base colour with blurred colour blobs — finished with real film
 * grain. Use it as a screen or card background, or behind glass so there is something to refract.
 * Pure react-native-svg plus a tiny tiling noise image: no native setup.
 */
export function GrainGradient({ palette = 'sunset', colors, grain = 0.55, seed = 0, style, children }: GrainGradientProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [base, ...blobs] = colors && colors.length ? colors : PALETTES[palette];
  const spots = SPOTS[Math.abs(seed) % SPOTS.length];
  return (
    <View style={[styles.root, { backgroundColor: base }, style]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id={`base${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={base} stopOpacity={1} />
            <Stop offset="1" stopColor={blobs[blobs.length - 1] ?? base} stopOpacity={0.35} />
          </LinearGradient>
          {blobs.slice(0, 4).map((c, i) => (
            <RadialGradient key={i} id={`b${i}${id}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity={0.95} />
              <Stop offset="0.45" stopColor={c} stopOpacity={0.55} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#base${id})`} />
        {blobs.slice(0, 4).map((_, i) => (
          <Circle key={i} cx={spots[i][0]} cy={spots[i][1]} r={spots[i][2]} fill={`url(#b${i}${id})`} />
        ))}
      </Svg>
      <GrainOverlay grain={grain} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
