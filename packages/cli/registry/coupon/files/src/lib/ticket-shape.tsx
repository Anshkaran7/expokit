import React, { useEffect, useId, useMemo, useState } from 'react';
import { Animated, Image, PixelRatio, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn } from '@/lib/kit';

export type TicketSide = 'top' | 'right' | 'bottom' | 'left';
/** `perforated` = small round bites (a stamp), `scalloped` = round bumps, `zigzag` = torn-receipt teeth. */
export type TicketEdge = 'straight' | 'perforated' | 'scalloped' | 'zigzag';
export type TicketPattern = 'none' | 'dots' | 'stripes' | 'grid' | 'waves' | 'sunburst' | 'confetti';
/** One radius for every corner, or [topLeft, topRight, bottomRight, bottomLeft]. Negative cuts the corner inward. */
export type TicketCorners = number | readonly [number, number, number, number];

export interface TicketNotch {
  side: TicketSide;
  /** Centre along that side, in points from its top / left end. */
  at: number;
  radius: number;
}

export interface TicketRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TicketGeometry {
  width: number;
  height: number;
  corners?: TicketCorners | undefined;
  /** Round bites cut into a side — e.g. both ends of a tear line. */
  notches?: readonly TicketNotch[] | undefined;
  /** Pattern per side (default straight). */
  edges?: Partial<Record<TicketSide, TicketEdge | undefined>> | undefined;
  /** Bite radius, scallop depth or tooth height of the edge patterns (default 5). */
  edgeSize?: number | undefined;
}

const SIDES: readonly TicketSide[] = ['top', 'right', 'bottom', 'left'];
const PREV: Record<TicketSide, TicketSide> = { top: 'left', right: 'top', bottom: 'right', left: 'bottom' };
const NEXT: Record<TicketSide, TicketSide> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
const TURN: Record<TicketSide, number> = { top: 0, right: 90, bottom: 180, left: 270 };

const r2 = (n: number) => Math.round(n * 100) / 100;

function cornerList(c: TicketCorners | undefined): [number, number, number, number] {
  if (c === undefined) return [0, 0, 0, 0];
  return typeof c === 'number' ? [c, c, c, c] : [c[0], c[1], c[2], c[3]];
}

/** How far a side's pattern reaches into the shape. */
const depthOf = (edge: TicketEdge | undefined, size: number) => (edge && edge !== 'straight' ? size : 0);

/**
 * SVG path data for a ticket outline: rounded or cut-in corners, notches and edge patterns,
 * drawn clockwise from the top-left corner.
 */
export function ticketPath({ width: w, height: h, corners, notches = [], edges = {}, edgeSize = 5 }: TicketGeometry): string {
  if (!(w > 0 && h > 0)) return '';
  const [tl, tr, br, bl] = cornerList(corners);
  const s = edgeSize;
  // Scallops and zigzags stand on a baseline set in from the edge; their tips touch the edge.
  const base = (side: TicketSide) => (edges[side] === 'scalloped' || edges[side] === 'zigzag' ? s : 0);
  const length: Record<TicketSide, number> = { top: w, right: h, bottom: w, left: h };
  const startCorner: Record<TicketSide, number> = { top: tl, right: tr, bottom: br, left: bl };
  const endCorner: Record<TicketSide, number> = { top: tr, right: br, bottom: bl, left: tl };
  // Each side in its own frame: u runs along it (clockwise), v points into the shape. Every frame
  // is a rotation of the top one, so arc sweep flags mean the same thing on all four sides.
  const at = (side: TicketSide, u: number, v: number) => {
    const [x, y] = side === 'top' ? [u, v] : side === 'right' ? [w - v, u] : side === 'bottom' ? [w - u, h - v] : [v, h - u];
    return `${r2(x)} ${r2(y)}`;
  };

  let d = '';
  for (const side of SIDES) {
    const b = base(side);
    const u0 = base(PREV[side]) + Math.abs(startCorner[side]);
    const u1 = length[side] - base(NEXT[side]) - Math.abs(endCorner[side]);
    if (side === 'top') d = `M ${at(side, u0, b)}`;
    const L = (u: number, v = b) => ` L ${at(side, u, v)}`;
    const A = (rx: number, ry: number, sweep: 0 | 1, u: number) => ` A ${r2(rx)} ${r2(ry)} ${TURN[side]} 0 ${sweep} ${at(side, u, b)}`;

    const cuts = notches
      .filter((n) => n.side === side)
      .map((n) => ({ u: side === 'top' || side === 'right' ? n.at : length[side] - n.at, r: n.radius }))
      .filter((c) => c.r > 0 && c.u - c.r >= u0 - 0.01 && c.u + c.r <= u1 + 0.01)
      .sort((a, z) => a.u - z.u);

    // Fills [a, z] with the side's pattern: the pen starts at (a, b) and ends at (z, b).
    const run = (a: number, z: number) => {
      const edge = edges[side] ?? 'straight';
      const span = z - a;
      if (edge === 'perforated' && span > 3 * s) {
        const gap = s * 1.1;
        const n = Math.floor((span - gap) / (2 * s + gap));
        let u = a + (span - (n * 2 * s + (n - 1) * gap)) / 2;
        for (let i = 0; i < n; i++, u += 2 * s + gap) d += L(u) + A(s, s, 0, u + 2 * s);
      } else if (edge === 'scalloped' && span > s) {
        const n = Math.max(1, Math.round(span / (2.4 * s)));
        for (let i = 1; i <= n; i++) d += A(span / n / 2, s, 1, a + (i * span) / n);
        return;
      } else if (edge === 'zigzag' && span > s) {
        const n = Math.max(1, Math.round(span / (2 * s)));
        for (let i = 0; i < n; i++) d += L(a + ((i + 0.5) * span) / n, b - s) + L(a + ((i + 1) * span) / n);
        return;
      }
      d += L(z);
    };

    let pen = u0;
    for (const c of cuts) {
      run(pen, c.u - c.r);
      d += A(c.r, c.r, 0, c.u + c.r);
      pen = c.u + c.r;
    }
    run(pen, u1);

    // Into the next side: a convex corner turns clockwise, a cut-in corner the other way.
    const c = endCorner[side];
    const next = at(NEXT[side], b + Math.abs(c), base(NEXT[side]));
    d += c === 0 ? ` L ${next}` : ` A ${r2(Math.abs(c))} ${r2(Math.abs(c))} 0 0 ${c > 0 ? 1 : 0} ${next}`;
  }
  return `${d} Z`;
}

/**
 * Rectangles that cover the shape but none of its holes (notches, cut-in corners, edge patterns)
 * — e.g. where a TiltCard's reflection may fall (`glareClip`). `offset` shifts them into a parent's
 * coordinates.
 */
export function ticketSafeRects(g: TicketGeometry, offset: { x: number; y: number } = { x: 0, y: 0 }): TicketRect[] {
  const { width: w, height: h, notches = [], edges = {}, edgeSize = 5 } = g;
  if (!(w > 0 && h > 0)) return [];
  const [tl, tr, br, bl] = cornerList(g.corners);
  const x0 = depthOf(edges.left, edgeSize);
  const y0 = depthOf(edges.top, edgeSize);
  const x1 = w - depthOf(edges.right, edgeSize);
  const y1 = h - depthOf(edges.bottom, edgeSize);
  // Each round hole is covered by a few stepped rects that hug its curve, so almost nothing
  // around it is left without light.
  const holes: [number, number, number, number][] = [];
  // Consecutive pairs of [0, 0.45, 0.75, 1].
  const STEPS: readonly (readonly [number, number])[] = [
    [0, 0.45],
    [0.45, 0.75],
    [0.75, 1],
  ];
  /** A quarter disc of radius r at corner (cx, cy), opening toward (dx, dy) = ±1. */
  const quarter = (cx: number, cy: number, r: number, dx: number, dy: number) => {
    for (const [s0, s1] of STEPS) {
      const reach = r * Math.sqrt(1 - s0 * s0);
      const [a, b] = [cy + dy * r * s0, cy + dy * r * s1];
      holes.push([Math.min(cx, cx + dx * reach), Math.min(a, b), Math.max(cx, cx + dx * reach), Math.max(a, b)]);
    }
  };
  /** The same with x and y swapped (steps run along x). */
  const quarterX = (cx: number, cy: number, r: number, dx: number, dy: number) => {
    for (const [s0, s1] of STEPS) {
      const reach = r * Math.sqrt(1 - s0 * s0);
      const [a, b] = [cx + dx * r * s0, cx + dx * r * s1];
      holes.push([Math.min(a, b), Math.min(cy, cy + dy * reach), Math.max(a, b), Math.max(cy, cy + dy * reach)]);
    }
  };
  for (const n of notches) {
    const r = n.radius;
    // Two quarter discs make the notch; the strip under a patterned edge goes too.
    if (n.side === 'left') {
      quarter(x0, n.at, r, 1, -1);
      quarter(x0, n.at, r, 1, 1);
      holes.push([0, n.at - r, x0, n.at + r]);
    } else if (n.side === 'right') {
      quarter(x1, n.at, r, -1, -1);
      quarter(x1, n.at, r, -1, 1);
      holes.push([x1, n.at - r, w, n.at + r]);
    } else if (n.side === 'top') {
      quarterX(n.at, y0, r, -1, 1);
      quarterX(n.at, y0, r, 1, 1);
      holes.push([n.at - r, 0, n.at + r, y0]);
    } else {
      quarterX(n.at, y1, r, -1, -1);
      quarterX(n.at, y1, r, 1, -1);
      holes.push([n.at - r, y1, n.at + r, h]);
    }
  }
  if (tl < 0) quarter(0, 0, -tl, 1, 1);
  if (tr < 0) quarter(w, 0, -tr, -1, 1);
  if (br < 0) quarter(w, h, -br, -1, -1);
  if (bl < 0) quarter(0, h, -bl, 1, -1);
  // Every edge on the device pixel grid (holes grow outward): neighbouring windows then meet
  // exactly, so a blended reflection shows no hairline seams where they join.
  const px = PixelRatio.get();
  const down = (v: number) => Math.floor(v * px) / px;
  const up = (v: number) => Math.ceil(v * px) / px;
  const near = (v: number) => Math.round(v * px) / px;
  for (const hole of holes) [hole[0], hole[1], hole[2], hole[3]] = [down(hole[0]), down(hole[1]), up(hole[2]), up(hole[3])];

  const cuts = (lo: number, hi: number, more: number[]) => [...new Set([lo, hi, ...more])].filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
  /** Each neighbouring pair of sorted cuts: [v0, v1], [v1, v2], … */
  const bands = (v: number[]) => v.slice(1).map((b, i): [number, number] => [v[i] ?? b, b]);
  const xs = cuts(near(x0), near(x1), holes.flatMap(([a, , c]) => [a, c]));
  const ys = cuts(near(y0), near(y1), holes.flatMap(([, b, , d]) => [b, d]));
  const rows: { y: number; h: number; spans: [number, number][] }[] = [];
  // Every cut is on the pixel grid, so anything thinner than half a pixel is a rounding twin; a
  // one-pixel row (where two stepped holes overlap) must stay, or the reflection shows a gap there.
  const thin = 0.5 / px;
  for (const [ya, yb] of bands(ys)) {
    if (yb - ya < thin) continue;
    const spans: [number, number][] = [];
    for (const [xa, xb] of bands(xs)) {
      if (xb - xa < thin || holes.some(([hx0, hy0, hx1, hy1]) => xa < hx1 && xb > hx0 && ya < hy1 && yb > hy0)) continue;
      const last = spans[spans.length - 1];
      if (last && Math.abs(last[1] - xa) < 0.01) last[1] = xb;
      else spans.push([xa, xb]);
    }
    const prev = rows[rows.length - 1];
    const same = prev && prev.spans.length === spans.length && prev.spans.every((s, i) => s[0] === spans[i]?.[0] && s[1] === spans[i]?.[1]);
    if (prev && same && Math.abs(prev.y + prev.h - ya) < 0.01) prev.h += yb - ya;
    else rows.push({ y: ya, h: yb - ya, spans });
  }
  return rows.flatMap((r) => r.spans.map(([a, b]) => ({ x: a + offset.x, y: r.y + offset.y, width: b - a, height: r.h })));
}

/** A small, stable random sequence from a string. */
function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const CONFETTI = ['#ffd23f', '#ff5fa2', '#3ddcff', '#7dff7a', '#ffffff'];

/** A rubber stamp ("USED", "CHECKED IN") that thumps down whenever its text changes. */
export function TicketStamp({ text, color, size = 17, style }: { text: string; color: string; size?: number | undefined; style?: StyleProp<ViewStyle> | undefined }) {
  const [thump] = useState(() => new Animated.Value(0));
  useEffect(() => {
    thump.setValue(0);
    Animated.spring(thump, { toValue: 1, ...motion.bouncy, useNativeDriver: true }).start();
  }, [text, thump]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          opacity: thump.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0.92] }),
          transform: [{ rotate: '-13deg' }, { scale: thump.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] }) }],
        },
        style,
      ]}
    >
      <View style={{ borderWidth: 2.5, borderRadius: 9, padding: 3, borderColor: color }}>
        <View style={{ borderWidth: 1, borderRadius: 6, paddingHorizontal: size * 0.7, paddingVertical: size * 0.22, borderColor: alpha(color, 0.55) }}>
          <Text style={{ color, fontSize: size, fontWeight: '900', letterSpacing: size * 0.13 }}>{text.toUpperCase()}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** A QR-style matrix (finder squares, timing lines, data) drawn as one path — a look-alike, not a real code. */
export function QrLike({ code, size, color = '#111111' }: { code: string; size: number; color?: string | undefined }) {
  const d = useMemo(() => {
    const N = 25;
    const next = random(code + '|qr');
    const finder = (x: number, y: number) => {
      const corners: [number, number][] = [
        [0, 0],
        [N - 7, 0],
        [0, N - 7],
      ];
      for (const [fx, fy] of corners) {
        const [u, v] = [x - fx, y - fy];
        if (u >= -1 && u <= 7 && v >= -1 && v <= 7) {
          if (u < 0 || v < 0 || u > 6 || v > 6) return 0; // the white ring around a finder
          return u === 0 || v === 0 || u === 6 || v === 6 || (u >= 2 && u <= 4 && v >= 2 && v <= 4) ? 1 : 0;
        }
      }
      return -1;
    };
    let out = '';
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const f = finder(x, y);
        const on = f >= 0 ? f === 1 : x === 6 || y === 6 ? (x + y) % 2 === 0 : next() < 0.47;
        if (on) out += `M${x} ${y}h1v1h-1z`;
      }
    return out;
  }, [code]);
  return (
    <Svg width={size} height={size} viewBox="0 0 25 25">
      <Path d={d} fill={color} />
    </Svg>
  );
}

/** A Code 128-style barcode drawn as one path — a look-alike. `vertical` turns it on its side. */
export function BarcodeLike({ code, width, height, color = '#111111', vertical = false }: { code: string; width: number; height: number; color?: string | undefined; vertical?: boolean | undefined }) {
  const { d, units } = useMemo(() => {
    const next = random(code + '|bars');
    const bars: [number, number][] = [];
    let u = 0;
    const push = (bar: number, gap: number) => {
      bars.push([u, bar]);
      u += bar + gap;
    };
    push(2, 1);
    push(1, 1);
    for (let i = 0; i < 34; i++) push(1 + Math.floor(next() * 4), 1 + Math.floor(next() * 3));
    push(2, 1);
    push(1, 1);
    push(2, 0);
    return { d: bars.map(([at, w]) => (vertical ? `M0 ${at}h1v${w}h-1z` : `M${at} 0h${w}v1h-${w}z`)).join(''), units: u };
  }, [code, vertical]);
  return (
    <Svg width={width} height={height} viewBox={vertical ? `0 0 1 ${units}` : `0 0 ${units} 1`} preserveAspectRatio="none">
      <Path d={d} fill={color} />
    </Svg>
  );
}

export interface TicketShapeProps extends Omit<TicketGeometry, 'width' | 'height'> {
  children?: React.ReactNode | undefined;
  /** A colour, or 2+ colours for a gradient (default white). */
  fill?: string | readonly string[] | undefined;
  /** Gradient direction in degrees: 0 runs left → right, 90 top → bottom (default 125). */
  angle?: number | undefined;
  /** Photo painted inside the outline (cover), over the fill (`require()` or `{ uri }`). */
  image?: ImageSourcePropType | undefined;
  imageOpacity?: number | undefined;
  /** Darkens the paint toward the bottom (0 – 1) so white text reads on a photo — inside the outline only. */
  shade?: number | undefined;
  /** Texture over the fill. */
  pattern?: TicketPattern | undefined;
  /** Pattern ink (default: white or black at low opacity, whichever suits the fill; confetti is multicolour). */
  patternColor?: string | undefined;
  /** Keeps the confetti scatter the same on every render (e.g. the coupon code). */
  seed?: string | undefined;
  /** Outline colour. */
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  /** Dash the outline — a "cut here" coupon. */
  dashed?: boolean | undefined;
  /** Dashed tear line along this side. */
  tear?: TicketSide | undefined;
  tearColor?: string | undefined;
  /**
   * Paint as one piece of a bigger ticket: that ticket's rect in this shape's points. Gradients,
   * patterns and photos then line up across the pieces.
   */
  frame?: TicketRect | undefined;
  /** Reports the measured size after layout. */
  onSize?: ((size: { width: number; height: number }) => void) | undefined;
  /** Padding, width, margins… — the shape takes its size from this box. */
  style?: StyleProp<ViewStyle> | undefined;
}

/**
 * A View painted as a ticket: notches, cut-in corners and patterned edges are real holes (the
 * screen behind shows through), and the fill can be a colour, a gradient, a texture or a photo.
 * Children sit on top; pad them away from patterned edges.
 */
export function TicketShape({
  children,
  corners,
  notches,
  edges,
  edgeSize = 5,
  fill = '#ffffff',
  angle = 125,
  image,
  imageOpacity = 1,
  shade = 0,
  pattern = 'none',
  patternColor,
  seed = 'ticket',
  stroke,
  strokeWidth = 1.5,
  dashed = false,
  tear,
  tearColor,
  frame: frameProp,
  onSize,
  style,
}: TicketShapeProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const id = 'ts' + useId().replace(/[^A-Za-z0-9_-]/g, '');
  const { w, h } = size;
  const colors = typeof fill === 'string' ? [fill] : fill.length ? fill : ['#ffffff'];
  const ink = readableOn(colors[Math.floor((colors.length - 1) / 2)] ?? '#ffffff');
  const d = ticketPath({ width: w, height: h, corners, notches, edges, edgeSize });
  const f = frameProp ?? { x: 0, y: 0, width: w, height: h };

  let paint: React.ReactNode = null;
  if (w && h) {
    // CSS-style gradient line: the first and last colours land exactly on opposite corners.
    const a = (angle * Math.PI) / 180;
    const half = (Math.abs(f.width * Math.cos(a)) + Math.abs(f.height * Math.sin(a))) / 2;
    const [cx, cy] = [f.x + f.width / 2, f.y + f.height / 2];
    const pc = patternColor ?? alpha(ink, 0.13);
    const clip = `url(#${id}-clip)`;
    const corner = cornerList(corners);
    const [s0, s1] = tear === 'top' || tear === 'bottom' ? (tear === 'top' ? [corner[0], corner[1]] : [corner[3], corner[2]]) : tear === 'left' ? [corner[0], corner[3]] : [corner[1], corner[2]];
    const inset: [number, number] = [Math.abs(s0) + 7, Math.abs(s1) + 7];
    const tearLine =
      tear === 'top' || tear === 'bottom'
        ? { x1: inset[0], x2: w - inset[1], y1: tear === 'top' ? 0.75 : h - 0.75, y2: tear === 'top' ? 0.75 : h - 0.75 }
        : { y1: inset[0], y2: h - inset[1], x1: tear === 'left' ? 0.75 : w - 0.75, x2: tear === 'left' ? 0.75 : w - 0.75 };

    let texture: React.ReactNode = null;
    if (pattern === 'sunburst') {
      const R = Math.hypot(f.width, f.height);
      const n = 18;
      let rays = '';
      for (let i = 0; i < n; i++) {
        const t0 = (i * 2 * Math.PI) / n;
        const t1 = t0 + Math.PI / n;
        rays += `M ${r2(cx)} ${r2(cy)} L ${r2(cx + R * Math.cos(t0))} ${r2(cy + R * Math.sin(t0))} L ${r2(cx + R * Math.cos(t1))} ${r2(cy + R * Math.sin(t1))} Z `;
      }
      texture = <Path d={rays} fill={patternColor ?? alpha(ink, 0.08)} />;
    } else if (pattern === 'confetti') {
      const rnd = random(seed);
      const count = Math.max(10, Math.min(46, Math.round((f.width * f.height) / 1500)));
      texture = Array.from({ length: count }, (_, i) => {
        const x = f.x + rnd() * f.width;
        const y = f.y + rnd() * f.height;
        const turn = Math.round(rnd() * 180);
        const color = patternColor ?? CONFETTI[Math.floor(rnd() * CONFETTI.length)] ?? '#ffffff';
        const o = 0.35 + rnd() * 0.4;
        return rnd() < 0.55 ? (
          <Rect key={i} x={x - 1.6} y={y - 4.5} width={3.2} height={9} rx={1} fill={color} opacity={o} transform={`rotate(${turn} ${r2(x)} ${r2(y)})`} />
        ) : (
          <Circle key={i} cx={x} cy={y} r={2.1} fill={color} opacity={o} />
        );
      });
    } else if (pattern !== 'none') {
      texture = <Rect width={w} height={h} fill={`url(#${id}-pattern)`} />;
    }

    const fillDefs =
      colors.length > 1 ? (
        <LinearGradient
          id={`${id}-fill`}
          gradientUnits="userSpaceOnUse"
          x1={cx - Math.cos(a) * half}
          y1={cy - Math.sin(a) * half}
          x2={cx + Math.cos(a) * half}
          y2={cy + Math.sin(a) * half}
        >
          {colors.map((c, i) => (
            <Stop key={i} offset={i / (colors.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      ) : null;
    const fillPath = <Path d={d} fill={colors.length > 1 ? `url(#${id}-fill)` : (colors[0] ?? '#ffffff')} />;
    const overlayDefs = (
      <>
        <ClipPath id={`${id}-clip`}>
          <Path d={d} />
        </ClipPath>
        {shade > 0 ? (
          <LinearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={shade * 0.45} />
            <Stop offset="0.42" stopColor="#000000" stopOpacity={shade * 0.12} />
            <Stop offset="1" stopColor="#000000" stopOpacity={shade} />
          </LinearGradient>
        ) : null}
        {pattern === 'dots' ? (
          <Pattern id={`${id}-pattern`} patternUnits="userSpaceOnUse" x={f.x} y={f.y} width={14} height={14}>
            <Circle cx={7} cy={7} r={1.7} fill={pc} />
          </Pattern>
        ) : pattern === 'stripes' ? (
          <Pattern id={`${id}-pattern`} patternUnits="userSpaceOnUse" x={f.x} y={f.y} width={12} height={12} patternTransform="rotate(-35)">
            <Rect width={5} height={12} fill={pc} />
          </Pattern>
        ) : pattern === 'grid' ? (
          <Pattern id={`${id}-pattern`} patternUnits="userSpaceOnUse" x={f.x} y={f.y} width={16} height={16}>
            <Path d="M 16 0 L 0 0 0 16" fill="none" stroke={pc} strokeWidth={1} />
          </Pattern>
        ) : pattern === 'waves' ? (
          <Pattern id={`${id}-pattern`} patternUnits="userSpaceOnUse" x={f.x} y={f.y} width={24} height={12}>
            <Path d="M 0 6 Q 6 0 12 6 T 24 6" fill="none" stroke={pc} strokeWidth={1.4} />
          </Pattern>
        ) : null}
      </>
    );
    const overlays = (
      <>
        {shade > 0 ? <Rect width={w} height={h} fill={`url(#${id}-shade)`} clipPath={clip} /> : null}
        {texture ? <G clipPath={clip}>{texture}</G> : null}
        {stroke ? <Path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} {...(dashed ? { strokeDasharray: [7, 5] } : null)} strokeLinecap="round" /> : null}
        {tear ? <Line {...tearLine} stroke={tearColor ?? alpha(ink, 0.28)} strokeWidth={1.6} strokeDasharray={[6, 5]} strokeLinecap="round" /> : null}
      </>
    );
    // A photo is an ordinary <Image> (it loads and caches like any other image on every platform),
    // shown through windows that cover the outline but none of its holes; the fill sits under it and
    // the shade, texture and lines go on top in a second layer.
    const windows = image ? ticketSafeRects({ width: w, height: h, corners, notches, edges, edgeSize }) : null;
    // Both layers are sized "100%": react-native-svg truncates a numeric width (317.7 → 317), which
    // would leave a sliver of the card unpainted along the right and bottom edges.
    paint = (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%">
          <Defs>
            {fillDefs}
            {windows ? null : overlayDefs}
          </Defs>
          {fillPath}
          {windows ? null : overlays}
        </Svg>
        {windows ? (
          <>
            {windows.map((r, i) => (
              <View key={i} style={{ position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, overflow: 'hidden' }}>
                <Image
                  alt=""
                  source={image!}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  style={{ position: 'absolute', left: f.x - r.x, top: f.y - r.y, width: f.width, height: f.height, opacity: imageOpacity }}
                />
              </View>
            ))}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>{overlayDefs}</Defs>
              {overlays}
            </Svg>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== w || height !== h) {
          setSize({ w: width, h: height });
          onSize?.({ width, height });
        }
      }}
    >
      {paint}
      {children}
    </View>
  );
}
