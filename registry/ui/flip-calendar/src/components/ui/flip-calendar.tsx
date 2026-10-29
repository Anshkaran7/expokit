import * as Haptics from 'expo-haptics';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion, readableOn, shadowFor, useKit } from '@/lib/kit';

export interface FlipCalendarProps {
  /** Controlled date (its time of day is kept on every change). */
  value?: Date;
  /** Initial date when uncontrolled (default today). */
  defaultValue?: Date;
  /** Called when a page is flipped over (next day) or flipped back (previous day). */
  onChange?: (date: Date) => void;
  /** Earliest day; flipping back past it only nudges the page. */
  minDate?: Date;
  /** Latest day; flipping forward past it only lifts the page a little. */
  maxDate?: Date;
  /** BCP 47 tag for weekday and month names (default: device). */
  locale?: string;
  /** Month band and Sunday colour (default theme accent). */
  accent?: string;
  /** Widest the pad grows (default 300). */
  maxWidth?: number;
  /** A tick when a page passes upright and a soft thud when it lands (default true). */
  haptics?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A calendar day without a time: `{ y, m: 0–11, d: 1–31 }`. */
export interface Day {
  y: number;
  m: number;
  d: number;
}

const MS_DAY = 86400000;
// Where the pages hang from: the board behind them, and how far down the first page starts.
const BOARD_H = 26;
const PAGE_TOP = 16;
// A page turning on its own (after you let go, or in a fling) eases out like paper settling.
const TURN = { duration: 420, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true };
const QUICK = { duration: 240, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true };
const MAX_CHAIN = 6;

export const dayOf = (date: Date): Day => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
const utc = (t: Day) => Date.UTC(t.y, t.m, t.d);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The day `n` days after `base` (negative for before). */
export function addDays(base: Day, n: number): Day {
  const t = new Date(utc(base) + n * MS_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

/** Whole days from `a` to `b`, immune to daylight-saving shifts. */
export function daysBetween(a: Day, b: Day) {
  return Math.round((utc(b) - utc(a)) / MS_DAY);
}

/** 1 for 1 January … 365 / 366 for 31 December. */
export function dayOfYear(t: Day) {
  return daysBetween({ y: t.y, m: 0, d: 1 }, t) + 1;
}

/** ISO-8601 week number (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeek(t: Day) {
  const wd = (new Date(utc(t)).getUTCDay() + 6) % 7; // Monday = 0
  return Math.floor((dayOfYear(addDays(t, 3 - wd)) - 1) / 7) + 1;
}

/**
 * Where a point of a turning page is. The page hangs from its hinge (y = 0) down to length L; it is
 * turned as far as `p` (0 = lying flat, 1 = turned over the top). Paper doesn't hinge stiffly: the
 * part above the fold line stays flat on the pad, the paper rolls round a cylinder of radius R
 * toward you, and the rest comes back up over the top with its back showing. `s` is the distance
 * along the paper from the hinge; returns y (down the pad) and z (toward you).
 */
export function curlPoint(s: number, p: number, L: number, R: number) {
  const fold = L * (1 - p);
  if (s <= fold) return { y: s, z: 0 };
  const d = s - fold;
  if (d <= Math.PI * R) {
    const a = d / R;
    return { y: fold + R * Math.sin(a), z: R * (1 - Math.cos(a)) };
  }
  return { y: fold - (d - Math.PI * R), z: 2 * R };
}

/**
 * How far the page must be turned so the point `s` along the paper sits at `y` (where the finger
 * is). A point only ever moves up as the page turns, so this is a simple bisection.
 */
export function progressUnderFinger(s: number, y: number, L: number, R: number) {
  if (y >= curlPoint(s, 0, L, R).y) return 0;
  if (y <= curlPoint(s, 1, L, R).y) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curlPoint(s, mid, L, R).y > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const yearLength = (y: number) => daysBetween({ y, m: 0, d: 1 }, { y: y + 1, m: 0, d: 1 });

type Names = { days: string[]; months: string[] };
const nameCache = new Map<string, Names>();
const EN: Names = {
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** Weekday and month names for a locale, falling back to English where Intl isn't available. */
function namesFor(locale?: string): Names {
  const key = locale ?? '';
  const hit = nameCache.get(key);
  if (hit) return hit;
  let names = EN;
  try {
    const wd = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    const mo = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    names = {
      days: EN.days.map((_, i) => wd.format(new Date(Date.UTC(2023, 0, 1 + i)))), // 1 Jan 2023 was a Sunday
      months: EN.months.map((_, i) => mo.format(new Date(Date.UTC(2023, i, 15)))),
    };
  } catch {
    // Keep the English names.
  }
  nameCache.set(key, names);
  return names;
}

interface PageValues {
  /** 0 = lying on the pad, 180 = flipped over the top (hidden behind the pad). */
  flip: Animated.Value;
  /** A small downward nudge when there's no earlier page to bring back. */
  nudge: Animated.Value;
}

/**
 * A top-bound desk calendar as a date picker. Lift a page and it turns up over the rings toward
 * you, its back showing as it passes upright, and the next day is underneath; pull down and
 * yesterday's page swings back over the top onto the pad. The page follows your finger the whole
 * way, a flick finishes the turn, and a hard flick turns several days.
 */
export function FlipCalendar({
  value,
  defaultValue,
  onChange,
  minDate,
  maxDate,
  locale,
  accent,
  maxWidth = 300,
  haptics = true,
  accessibilityLabel,
  style,
}: FlipCalendarProps) {
  const { colors, radius, dark } = useKit();
  const reduce = useReduceMotion();
  const tint = accent ?? colors.accent;

  const start = useRef(value ?? defaultValue ?? new Date()).current;
  const clock = useRef({ h: start.getHours(), min: start.getMinutes() });
  const [day, setDay] = useState(() => dayOf(start));

  // Animated values per page, keyed by its date. A page keeps its angle when its role changes, so a
  // page turned over (180) is already yesterday's page, and the one under it is already lying flat.
  const pages = useRef(new Map<number, PageValues>());
  const valuesFor = (t: Day, flipped: boolean) => {
    const k = utc(t);
    let v = pages.current.get(k);
    if (!v) pages.current.set(k, (v = { flip: new Animated.Value(flipped ? 180 : 0), nudge: new Animated.Value(0) }));
    return v;
  };

  const minKey = minDate ? utc(dayOf(minDate)) : -Infinity;
  const maxKey = maxDate ? utc(dayOf(maxDate)) : Infinity;
  const live = useRef({ day, onChange, haptics, reduce, minKey, maxKey });
  live.current = { day, onChange, haptics, reduce, minKey, maxKey };
  const canNext = () => utc(addDays(live.current.day, 1)) <= live.current.maxKey;
  const canPrev = () => utc(addDays(live.current.day, -1)) >= live.current.minKey;

  const busy = useRef(false);
  const chain = useRef(0);
  const pending = useRef(false);

  const commit = (delta: 1 | -1) => {
    const next = addDays(live.current.day, delta);
    live.current.day = next;
    pending.current = true;
    setDay(next);
    if (live.current.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    live.current.onChange?.(new Date(next.y, next.m, next.d, clock.current.h, clock.current.min));
  };

  /** Turns the top page over the rings (to the next day). */
  function flipOver(quick = false) {
    if (busy.current || !canNext()) return;
    busy.current = true;
    const v = valuesFor(live.current.day, false);
    if (live.current.reduce) {
      v.flip.setValue(180);
      return commit(1);
    }
    Animated.timing(v.flip, { toValue: 180, ...(quick ? QUICK : TURN) }).start(({ finished }) => {
      if (finished) commit(1);
      else busy.current = false;
    });
  }

  /** Brings yesterday's page back over the rings onto the pad. */
  function flipBack(quick = false) {
    if (busy.current || !canPrev()) return;
    busy.current = true;
    const v = valuesFor(addDays(live.current.day, -1), true);
    if (live.current.reduce) {
      v.flip.setValue(0);
      return commit(-1);
    }
    Animated.timing(v.flip, { toValue: 0, ...(quick ? QUICK : TURN) }).start(({ finished }) => {
      if (finished) commit(-1);
      else busy.current = false;
    });
  }
  const actions = useRef({ flipOver, flipBack });
  actions.current = { flipOver, flipBack };

  // After a page change: forget pages that left the pad, then keep turning if a fling asked.
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const keep = new Set([-1, 0, 1].map((n) => utc(addDays(day, n))));
    for (const k of pages.current.keys()) if (!keep.has(k)) pages.current.delete(k);
    busy.current = false;
    if (chain.current !== 0) {
      const forward = chain.current > 0;
      chain.current -= forward ? 1 : -1;
      if (forward ? canNext() : canPrev()) {
        if (forward) flipOver(true);
        else flipBack(true);
      } else chain.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // A controlled value that isn't our own echo jumps straight there.
  const external = value ? utc(dayOf(value)) : null;
  useEffect(() => {
    if (external === null || external === utc(live.current.day) || !value) return;
    clock.current = { h: value.getHours(), min: value.getMinutes() };
    chain.current = 0;
    busy.current = false;
    pages.current.clear();
    setDay(dayOf(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);

  const [width, setWidth] = useState(0);
  const W = Math.min(width, maxWidth);
  const H = Math.round(W * 1.08);

  // The page a drag turns, where it was grabbed, and whether it has passed upright.
  // The direction is only known once the finger has moved (the drag is claimed before that), so the
  // page is picked on the first move.
  const grip = useRef<{ started: boolean; y0: number; y: number; page: PageValues | null; back: boolean; r: number; over: boolean }>({
    started: false,
    y0: 0,
    y: 0,
    page: null,
    back: false,
    r: 1,
    over: false,
  });
  const pan = useMemo(() => {
    const g0 = grip.current;
    const spring = (v: Animated.Value, to: number) => Animated.spring(v, { toValue: to, useNativeDriver: true, ...motion.snappy }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !busy.current && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => {
        chain.current = 0;
        g0.started = false;
        g0.page = null;
        // Where the touch came down, in the pad.
        g0.y0 = e.nativeEvent.locationY - g.dy;
      },
      onPanResponderMove: (_, g) => {
        if (!g0.started) {
          if (Math.abs(g.dy) < 3) return;
          g0.started = true;
          // Lifting turns today's page; pulling down brings yesterday's back (which starts over the top).
          g0.back = g.dy > 0;
          g0.over = g0.back;
          g0.page = g0.back ? (canPrev() ? valuesFor(addDays(live.current.day, -1), true) : null) : valuesFor(live.current.day, false);
          // The point of the paper under the finger: where you grabbed today's page (at least halfway
          // down, so a grab near the rings still turns it), or near the free end of yesterday's.
          g0.r = g0.back ? H * 0.9 : clamp(g0.y0 - PAGE_TOP, H * 0.55, H);
          g0.y = curlPoint(g0.r, g0.back ? 1 : 0, H, curlRadius(H)).y;
        }
        const top = valuesFor(live.current.day, false);
        if (!g0.page) {
          // Nothing earlier to bring back: today's page only gives a little.
          top.nudge.setValue(Math.max(0, g.dy) * 0.18);
          return;
        }
        const angle = progressUnderFinger(g0.r, g0.y + g.dy, H, curlRadius(H)) * 180;
        // At the last day the page only lifts a little.
        g0.page.flip.setValue(!g0.back && !canNext() ? Math.min(angle * 0.25, 24) : angle);
        const over = angle > 90;
        if (over !== g0.over) {
          g0.over = over;
          if (live.current.haptics) Haptics.selectionAsync().catch(() => {});
        }
      },
      onPanResponderRelease: (_, g) => {
        const top = valuesFor(live.current.day, false);
        spring(top.nudge, 0);
        const page = g0.page;
        if (!page) return;
        if (g0.back) {
          // Past upright, or flicked down: it lands; a hard flick brings back a few more.
          if (!g0.over || g.vy > 0.5) {
            chain.current = -clamp(Math.floor((g.vy - 1.2) * 3), 0, MAX_CHAIN);
            actions.current.flipBack();
          } else spring(page.flip, 180);
        } else if (canNext() && (g0.over || g.vy < -0.5)) {
          chain.current = clamp(Math.floor((-g.vy - 1.2) * 3), 0, MAX_CHAIN);
          actions.current.flipOver();
        } else spring(page.flip, 0);
      },
      onPanResponderTerminate: () => {
        spring(valuesFor(live.current.day, false).nudge, 0);
        if (g0.page) spring(g0.page.flip, g0.back ? 180 : 0);
      },
    });
  }, [H]);

  const names = namesFor(locale);
  const spoken = (t: Day) => `${names.days[new Date(utc(t)).getUTCDay()]}, ${t.d} ${names.months[t.m]} ${t.y}`;
  const prevDay = addDays(day, -1);
  const nextDay = addDays(day, 1);
  const corner = radius.scale(14);
  const pageProps = { W, H, tint, names, colors, corner };
  const top = valuesFor(day, false);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? 'Date'}
      accessibilityValue={{ text: spoken(day) }}
      accessibilityHint="Swipe up to turn to the next day, down for the previous one."
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? flipOver() : flipBack())}
      style={[styles.root, style]}
    >
      {W > 0 ? (
        <View style={[styles.pad, styles.grab, { width: W, height: H + PAGE_TOP + 14 }]} {...pan.panHandlers}>
          {/* The board the pages hang from, and page edges stacked under them for thickness. */}
          <View style={[styles.board, { backgroundColor: colors.foreground, borderRadius: radius.scale(8) }]} />
          {[2, 1].map((n) => (
            <View
              key={n}
              style={[
                styles.edge,
                { top: PAGE_TOP + n * 5, height: H, left: n * 4, right: n * 4, backgroundColor: colors.card, borderColor: colors.border, borderRadius: corner },
                n === 2 && shadowFor('md', dark),
              ]}
            />
          ))}
          {/* Pages sit in their own 3D layer (iOS slices 3D siblings otherwise). */}
          <View collapsable={false} style={[StyleSheet.absoluteFill, { top: PAGE_TOP }]}>
            <Page key={utc(nextDay)} day={nextDay} values={valuesFor(nextDay, false)} under shadowFrom={top.flip} {...pageProps} />
            <Animated.View style={{ transform: [{ translateY: top.nudge }] }}>
              <Page key={utc(day)} day={day} values={top} {...pageProps} />
            </Animated.View>
            {canPrev() ? <Page key={utc(prevDay)} day={prevDay} values={valuesFor(prevDay, true)} {...pageProps} /> : null}
          </View>
          <Rings width={W} color={colors.mutedForeground} hole={colors.foreground} />
        </View>
      ) : null}
    </View>
  );
}

interface PageProps {
  day: Day;
  values: PageValues;
  /** The next day, lying under today's page: it doesn't turn, it only darkens under the lifted page. */
  under?: boolean;
  /** Today's page angle, for the shadow it casts on the page underneath. */
  shadowFrom?: Animated.Value;
  W: number;
  H: number;
  tint: string;
  names: Names;
  colors: ReturnType<typeof useKit>['colors'];
  corner: number;
}

// The page is cut into thin strips across its height; each one is placed and tilted where the curl
// model puts that slice of paper, so the page bends instead of swinging stiffly.
const STRIPS = 26;
// Samples of the turn (every 3°), precomputed per strip and handed to native-driver interpolations.
const SAMPLES = 61;
const PERSPECTIVE = 900;
const curlRadius = (H: number) => Math.min(48, H * 0.16);

type StripTrack = { input: number[]; y: number[]; rot: string[]; sx: number[]; front: number[]; frontShade: number[]; backShade: number[] };

/** Per strip, the translate / tilt / width / shading at every sampled angle. */
function stripTracks(H: number): StripTrack[] {
  const h = H / STRIPS;
  const R = curlRadius(H);
  return Array.from({ length: STRIPS }, (_, i) => {
    const t: StripTrack = { input: [], y: [], rot: [], sx: [], front: [], frontShade: [], backShade: [] };
    for (let k = 0; k < SAMPLES; k++) {
      const p = k / (SAMPLES - 1);
      const a = curlPoint(i * h, p, H, R);
      const b = curlPoint((i + 1) * h, p, H, R);
      const theta = Math.atan2(b.z - a.z, b.y - a.y); // 0 = flat, π/2 = facing up, π = turned over
      const c = Math.cos(theta);
      t.input.push(p * 180);
      // The strip turns about its centre, so its centre goes to the middle of its slice of paper;
      // squeezed neighbours then meet edge to edge whatever the transform origin.
      t.y.push((a.y + b.y) / 2 - (i * h + h / 2));
      t.rot.push(`${(theta * 180) / Math.PI}deg`);
      // Closer to you looks a touch wider.
      t.sx.push(PERSPECTIVE / (PERSPECTIVE - (a.z + b.z) / 2));
      t.front.push(theta < Math.PI / 2 ? 1 : 0);
      // Lit from the front: paper turning away darkens; the back brightens as it comes round.
      t.frontShade.push(Math.max(0, 1 - c) * 0.45);
      t.backShade.push(Math.max(0, 1 + c) * 0.4 + 0.04);
    }
    return t;
  });
}

/**
 * One calendar page hanging from the rings. At rest it's flat; turning, it bends like paper: strips
 * near the fold roll toward you and darken or catch the light as they turn, and past the fold the
 * plain back comes up over the top.
 */
const Page = React.memo(function Page({ day, values, under, shadowFrom, W, H, tint, names, colors, corner }: PageProps) {
  const { flip } = values;
  const h = H / STRIPS;
  const strips = useMemo(() => {
    if (under) return null;
    return stripTracks(H).map((t) => {
      const at = (out: number[] | string[]) => flip.interpolate({ inputRange: t.input, outputRange: out as number[], extrapolate: 'clamp' });
      return {
        // No per-strip perspective: each strip is already placed on the curve, and a perspective per
        // strip would project neighbours differently and open gaps between them.
        transform: [{ translateY: at(t.y) }, { rotateX: at(t.rot) }, { scaleX: at(t.sx) }],
        front: at(t.front),
        back: at(t.front.map((f) => 1 - f)),
        frontShade: at(t.frontShade),
        backShade: at(t.backShade),
      };
    });
  }, [flip, under, H]);
  // Going over the top, the page fades out (it hangs behind the pad); fully over it also collapses,
  // since a faded view's shadow can still draw a faint outline above the pad.
  const gone = useMemo(
    () => ({
      opacity: flip.interpolate({ inputRange: [0, 150, 176], outputRange: [1, 1, 0], extrapolate: 'clamp' }),
      transform: [{ scale: flip.interpolate({ inputRange: [0, 179, 180], outputRange: [1, 1, 0.001], extrapolate: 'clamp' }) }],
    }),
    [flip],
  );

  const sheet = { width: W, height: H, backgroundColor: colors.card, borderColor: colors.border, borderRadius: corner };
  const face = <Face day={day} W={W} tint={tint} names={names} colors={colors} sheet={sheet} />;

  if (under || !strips) {
    return (
      <View pointerEvents="none" style={[styles.page, { width: W, height: H }]}>
        {face}
        {shadowFrom ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: corner,
                backgroundColor: colors.overlay,
                opacity: shadowFrom.interpolate({ inputRange: [0, 30, 120, 180], outputRange: [0, 0.22, 0.1, 0], extrapolate: 'clamp' }),
              },
            ]}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.page, { width: W, height: H }, gone]}>
      {strips.map((st, i) => (
        // Each tilted strip sits in its own flat layer: iOS intersects sibling layers that have 3D
        // transforms, which would slice the strips into bands; flat wrappers just stack in order.
        <View key={i} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.strip, { top: i * h - 0.5, width: W, height: h + 1, transform: st.transform }]}>
            {/* The front: the whole page, shifted so this strip shows its own slice. */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.clip, { opacity: st.front }]}>
              <View style={{ position: 'absolute', top: -i * h + 0.5, left: 0 }}>{face}</View>
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: st.frontShade }]} />
            </Animated.View>
            {/* The back: plain paper. */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.clip, { opacity: st.back, backgroundColor: colors.card }]}>
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: st.backShade }]} />
            </Animated.View>
          </Animated.View>
        </View>
      ))}
    </Animated.View>
  );
});

interface FaceProps {
  day: Day;
  W: number;
  tint: string;
  names: Names;
  colors: ReturnType<typeof useKit>['colors'];
  sheet: ViewStyle;
}

/** The printed side of a page: perforation, month band, the day, weekday and a footer. */
const Face = React.memo(function Face({ day, W, tint, names, colors, sheet }: FaceProps) {
  const wd = new Date(utc(day)).getUTCDay();
  const ink = wd === 0 ? tint : colors.foreground;
  const band = readableOn(tint);
  const left = yearLength(day.y) - dayOfYear(day);
  return (
    <View style={[styles.face, sheet]}>
      <View style={[styles.perforation, { borderBottomColor: colors.border }]} />
      <View style={[styles.band, { backgroundColor: tint }]}>
        <Text numberOfLines={1} style={[styles.month, { color: band }]}>{names.months[day.m].toUpperCase()}</Text>
        <Text style={[styles.year, { color: band }]}>{day.y}</Text>
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.day, { color: ink, fontSize: W * 0.5, lineHeight: W * 0.56 }]}>
          {day.d}
        </Text>
        <Text numberOfLines={1} style={[styles.weekday, { color: ink }]}>{names.days[wd].toUpperCase()}</Text>
      </View>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Day {dayOfYear(day)} · Week {isoWeek(day)}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{left} left</Text>
      </View>
    </View>
  );
});

/** Wire loops through the page tops, drawn over the pages so a turning page passes behind them. */
const Rings = React.memo(function Rings({ width, color, hole }: { width: number; color: string; hole: string }) {
  const n = Math.max(3, Math.round(width / 60));
  return (
    <View pointerEvents="none" style={[styles.rings, { width }]}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={styles.ringSlot}>
          <View style={[styles.ringHole, { backgroundColor: hole }]} />
          <View style={[styles.ring, { borderColor: color }]} />
        </View>
      ))}
    </View>
  );
});

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', alignItems: 'center' },
  grab: Platform.OS === 'web' ? ({ userSelect: 'none', cursor: 'grab', touchAction: 'pan-x' } as object) : {},
  pad: {},
  board: { position: 'absolute', top: 0, left: 0, right: 0, height: BOARD_H },
  edge: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth },
  page: { position: 'absolute', top: 0, left: 0 },
  face: { position: 'absolute', top: 0, left: 0, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', backfaceVisibility: 'hidden' },
  // One dotted line instead of dozens of dots: every strip repeats the page, so it stays light.
  perforation: { height: 12, marginHorizontal: 6, borderBottomWidth: 2, borderStyle: 'dotted' },
  strip: { position: 'absolute', left: 0 },
  clip: { overflow: 'hidden' },
  band: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9 },
  month: { fontSize: 15, fontWeight: '800', letterSpacing: 2.5, flexShrink: 1 },
  year: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], opacity: 0.85 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2, includeFontPadding: false, textAlign: 'center' },
  weekday: { fontSize: 15, fontWeight: '700', letterSpacing: 4, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  meta: { fontSize: 11.5, fontWeight: '500', fontVariant: ['tabular-nums'] },
  rings: { position: 'absolute', top: 6, flexDirection: 'row', justifyContent: 'space-evenly' },
  ringSlot: { width: 12, height: 26, alignItems: 'center' },
  ringHole: { position: 'absolute', top: 5, width: 9, height: 9, borderRadius: 4.5 },
  ring: { position: 'absolute', top: 0, width: 7, height: 24, borderRadius: 3.5, borderWidth: 2 },
});
