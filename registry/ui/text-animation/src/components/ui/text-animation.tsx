import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useKit } from '@/lib/kit';

export type AnimatedTextVariant = 'reveal' | 'shimmer' | 'cascade' | 'scramble' | 'typewriter';
/** 'mount' animates once when shown; 'change' also replays whenever the text changes. */
export type AnimatedTextTrigger = 'mount' | 'change';

export interface AnimatedTextProps {
  /** The text to animate. */
  children: string;
  variant?: AnimatedTextVariant;
  /** Default 'change' for cascade and typewriter (typewriter keeps typing when the new text extends the old), 'mount' otherwise. */
  trigger?: AnimatedTextTrigger;
  /** Wait before the first animation, in ms. */
  delay?: number;
  /** Time between words (reveal) or letters (everything else), in ms. Shimmer: ms of sweep per letter. */
  stagger?: number;
  /** Speed multiplier: 2 plays twice as fast. */
  speed?: number;
  /** Text colour (default: theme foreground). */
  color?: string;
  /** Blinking caret for `typewriter` (default true). */
  caret?: boolean;
  /** Change it to replay the animation. */
  replayKey?: string | number;
  /** Called when an animation finishes (never for the looping shimmer). */
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  /** fontSize, fontWeight, lineHeight, letterSpacing, textAlign… applied to every letter. */
  textStyle?: StyleProp<TextStyle>;
}

const STAGGER: Record<AnimatedTextVariant, number> = { reveal: 70, shimmer: 80, cascade: 28, scramble: 45, typewriter: 32 };
/** Clock value that puts every letter at rest, past the end of any timeline. */
const END = 1e6;

// Scripts whose letters join or reorder (Arabic, Hebrew, Indic, Thai, Lao, Tibetan, Myanmar, Khmer):
// splitting them into separate views breaks shaping, so they animate a word at a time.
const CONNECTED = /[֐-ࣿऀ-෿฀-໿ༀ-࿿က-႟ក-៿יִ-﷿ﹰ-﻿]/;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
// Combining marks, emoji joiners / variation selectors and skin tones: keep those words whole too.
const CLUSTER = /[̀-ͯ᪰-᫿⃐-⃿‍︎️]|\uD83C[\uDFFB-\uDFFF]/;

interface Unit {
  ch: string;
  /** Index across the whole text, for staggering. */
  i: number;
  /** A whole word of a connected script (animated as one piece). */
  whole: boolean;
}
interface Word {
  text: string;
  units: Unit[];
  w: number;
}
interface Layout {
  lines: Word[][];
  count: number;
  words: number;
  rtl: boolean;
}

function tokenize(text: string): Layout {
  let i = 0;
  let w = 0;
  const lines = text.split('\n').map((line) =>
    line
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const whole = CONNECTED.test(word) || CLUSTER.test(word);
        const parts = whole ? [word] : Array.from(word);
        return { text: word, units: parts.map((ch) => ({ ch, i: i++, whole })), w: w++ };
      }),
  );
  return { lines, count: i, words: w, rtl: RTL.test(text) };
}

/** End index of the next typed step: one letter (with its marks / emoji joiners), or a whole word in connected scripts. */
function nextStop(text: string, from: number) {
  if (CONNECTED.test(text)) {
    const m = /^\s*\S+/.exec(text.slice(from));
    return from + (m ? m[0].length : text.length - from);
  }
  let i = from;
  const step = () => {
    const code = text.codePointAt(i) ?? 0;
    i += code > 0xffff ? 2 : 1;
  };
  step();
  for (;;) {
    const rest = text.slice(i, i + 2);
    if (/^[̀-ͯ᪰-᫿⃐-⃿︎️]/.test(rest) || /^\uD83C[\uDFFB-\uDFFF]/.test(rest)) step();
    else if (rest.startsWith('‍')) {
      i += 1;
      if (i < text.length) step();
    } else break;
  }
  return Math.min(i, text.length);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** A soft, critically damped settle (no overshoot), sampled as a curve so it runs on the native driver. */
const soft = (t: number) => 1 - Math.exp(-7 * t) * (1 + 7 * t);
/** A firmer settle, also without overshoot. */
const settle = (t: number) => 1 - Math.exp(-8 * t) * (1 + 8 * t);

/**
 * Maps a millisecond clock onto `from → to` between `start` and `start + dur` through `ease`.
 * Pre-sampled, because the native driver doesn't support `easing` on interpolations.
 */
function track(clock: Animated.Value, start: number, dur: number, from: number, to: number, ease: (t: number) => number, steps = 14) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    inputRange.push(start + dur * t);
    outputRange.push(k === steps ? to : from + (to - from) * ease(t));
  }
  return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

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

interface Ctx {
  glyph: StyleProp<TextStyle>;
  /** Line height as rendered (after the user's text size). */
  lh: number;
  space: number;
  justify: ViewStyle['justifyContent'];
  reduce: boolean;
  /** Latest timing props, read when an animation starts (so re-renders never restart one). */
  live: React.RefObject<{ delay: number; speed: number; stagger: number }>;
  done: () => void;
}

/** Words laid out in a wrapping row; each line of the text starts a new row. */
function Flow({ layout, ctx, children }: { layout: Layout; ctx: Ctx; children: (word: Word) => React.ReactNode }) {
  return (
    <View
      style={[
        styles.flow,
        { columnGap: ctx.space, justifyContent: ctx.justify, flexDirection: layout.rtl ? 'row-reverse' : 'row' },
      ]}
    >
      {layout.lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <View style={styles.break} /> : null}
          {line.map(children)}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Words rise and fade in on a soft spring, one after another. */
function Reveal({ layout, ctx }: { layout: Layout; ctx: Ctx }) {
  const { reduce, live, done, lh } = ctx;
  const [clock] = useState(() => new Animated.Value(0));
  const words = useRef(layout.words);
  words.current = layout.words;
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    if (reduce) {
      played.current = true;
      clock.setValue(END);
      done();
      return;
    }
    const { delay, speed, stagger } = live.current;
    const total = Math.max(0, words.current - 1) * stagger + 720;
    const anim = Animated.timing(clock, { toValue: total, duration: total / speed, delay, easing: Easing.linear, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (!finished) return;
      played.current = true;
      clock.setValue(END);
      done();
    });
    return () => anim.stop();
  }, [reduce, clock, live, done]);

  const stagger = live.current.stagger;
  const anims = useMemo(
    () =>
      layout.lines.flat().map((word) => {
        const start = word.w * stagger;
        return {
          opacity: track(clock, start, 400, 0, 1, easeOut),
          translateY: track(clock, start, 720, lh * 0.6, 0, soft, 18),
        };
      }),
    [layout, clock, lh, stagger],
  );

  return (
    <Flow layout={layout} ctx={ctx}>
      {(word) => {
        const a = anims[word.w];
        return (
          <Animated.Text key={word.w} style={[ctx.glyph, { opacity: a.opacity, transform: [{ translateY: a.translateY }] }]}>
            {word.text}
          </Animated.Text>
        );
      }}
    </Flow>
  );
}

/** A band of light sweeps across the letters on a loop — one native-driven clock, a per-letter opacity wave. */
function Shimmer({ layout, ctx }: { layout: Layout; ctx: Ctx }) {
  const { reduce, live } = ctx;
  const [clock] = useState(() => new Animated.Value(0));
  const n = layout.count;
  const stagger = live.current.stagger;
  const sweep = Math.min(2400, Math.max(900, n * stagger));
  const period = sweep + 650;

  useEffect(() => {
    if (reduce) return;
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, { toValue: period, duration: period / live.current.speed, easing: Easing.linear, useNativeDriver: true }),
    );
    const id = setTimeout(() => loop.start(), live.current.delay);
    return () => {
      clearTimeout(id);
      loop.stop();
    };
  }, [reduce, clock, period, live]);

  const opacities = useMemo(() => {
    const band = Math.min(0.5, Math.max(0.16, 2.6 / Math.max(1, n)));
    const base = 0.36;
    const S = 36;
    return Array.from({ length: n }, (_, i) => {
      const x = n > 1 ? i / (n - 1) : 0.5;
      const inputRange: number[] = [];
      const outputRange: number[] = [];
      for (let k = 0; k <= S; k++) {
        const p = -band + (k / S) * (1 + 2 * band);
        const d = (p - x) / band;
        inputRange.push((sweep * k) / S);
        outputRange.push(Math.abs(d) < 1 ? base + (1 - base) * (0.5 + 0.5 * Math.cos(Math.PI * d)) : base);
      }
      inputRange.push(period);
      outputRange.push(base);
      return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
    });
  }, [n, sweep, period, clock]);

  return (
    <Flow layout={layout} ctx={ctx}>
      {(word) => (
        <View key={word.w} style={styles.word}>
          {word.units.map((u) => (
            <Animated.Text key={u.i} style={[ctx.glyph, !reduce && { opacity: opacities[u.i] }]}>
              {u.ch}
            </Animated.Text>
          ))}
        </View>
      )}
    </Flow>
  );
}

type RollAnim = { opacity: Animated.AnimatedInterpolation<number>; translateY: Animated.AnimatedInterpolation<number> };

/** One word of a cascade: every letter clipped to a single line so it can roll through it. */
function RollWord({ word, anims, glyph, lh }: { word: Word; anims: RollAnim[]; glyph: StyleProp<TextStyle>; lh: number }) {
  return (
    <View style={styles.word}>
      {word.units.map((u) => (
        <View key={u.i} style={{ height: lh, overflow: 'hidden' }}>
          <Animated.Text style={[glyph, { opacity: anims[u.i].opacity, transform: [{ translateY: anims[u.i].translateY }] }]}>
            {u.ch}
          </Animated.Text>
        </View>
      ))}
    </View>
  );
}

interface Roll {
  text: string;
  prev: string | null;
  /** Width the previous text was laid out at, so it wraps the same while it leaves. */
  prevWidth: number;
  animated: boolean;
  id: number;
}

/** Old letters roll up and out while the new text's letters roll in from below, left to right. */
function Cascade({ text, ctx, changes }: { text: string; ctx: Ctx; changes: boolean }) {
  const { reduce, live, done, lh, glyph } = ctx;
  const width = useRef(0);
  const [roll, setRoll] = useState<Roll>({ text, prev: null, prevWidth: 0, animated: true, id: 0 });
  if (roll.text !== text) {
    setRoll({ text, prev: changes ? roll.text : null, prevWidth: width.current, animated: changes, id: roll.id + 1 });
  }

  // A fresh clock per roll, created at 0 so the first frame of a change is already in place.
  const clockRef = useRef<{ id: number; v: Animated.Value } | null>(null);
  if (!clockRef.current || clockRef.current.id !== roll.id) {
    clockRef.current = { id: roll.id, v: new Animated.Value(roll.animated ? 0 : END) };
  }
  const clock = clockRef.current.v;

  const layout = useMemo(() => tokenize(roll.text), [roll.text]);
  const prevLayout = useMemo(() => (roll.prev ? tokenize(roll.prev) : null), [roll.prev]);
  const counts = useRef({ next: 0, prev: 0, animated: true, text });
  counts.current = { next: layout.count, prev: prevLayout?.count ?? 0, animated: roll.animated, text: roll.text };

  const id = roll.id;
  const played = useRef(-1);
  useEffect(() => {
    if (played.current === id) return;
    const { next, prev, animated } = counts.current;
    if (id > 0 && animated) AccessibilityInfo.announceForAccessibility(counts.current.text);
    if (!animated || reduce) {
      played.current = id;
      clock.setValue(END);
      if (animated) done();
      return;
    }
    const { delay, speed, stagger } = live.current;
    const total = Math.max(next, prev) * stagger + 90 + 650;
    const anim = Animated.timing(clock, {
      toValue: total,
      duration: total / speed,
      delay: id === 0 ? delay : 0,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      played.current = id;
      clock.setValue(END);
      setRoll((r) => (r.id === id ? { ...r, prev: null } : r));
      done();
    });
    return () => anim.stop();
  }, [id, reduce, clock, live, done]);

  const stagger = live.current.stagger;
  const enter = useMemo(
    () =>
      Array.from({ length: layout.count }, (_, i) => ({
        opacity: track(clock, i * stagger + 90, 260, 0, 1, easeOut),
        translateY: track(clock, i * stagger + 90, 650, lh, 0, settle, 18),
      })),
    [layout, clock, lh, stagger],
  );
  const exit = useMemo(
    () =>
      Array.from({ length: prevLayout?.count ?? 0 }, (_, i) => ({
        opacity: track(clock, i * stagger + 160, 260, 1, 0, easeOut),
        translateY: track(clock, i * stagger, 420, 0, -lh, easeInOut),
      })),
    [prevLayout, clock, lh, stagger],
  );


  const pw = roll.prevWidth;
  const end = layout.rtl ? ctx.justify === 'flex-start' : ctx.justify === 'flex-end';
  const overlayPos: ViewStyle =
    ctx.justify === 'center' && pw > 0
      ? { left: '50%', marginLeft: -pw / 2, width: pw }
      : end
        ? { right: 0, width: pw || undefined }
        : { left: 0, width: pw || undefined };

  return (
    <View onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}>
      <Flow layout={layout} ctx={ctx}>
        {(word) => <RollWord key={word.w} word={word} anims={enter} glyph={glyph} lh={lh} />}
      </Flow>
      {prevLayout && !reduce ? (
        <View pointerEvents="none" style={[styles.overlay, overlayPos]}>
          <Flow layout={prevLayout} ctx={ctx}>
            {(word) => <RollWord key={word.w} word={word} anims={exit} glyph={glyph} lh={lh} />}
          </Flow>
        </View>
      ) : null}
    </View>
  );
}

const POOLS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghjkmnpqrstuvwxyz',
  digit: '0123456789',
  other: '#%&*+=?@$<>/',
};
function poolFor(ch: string) {
  if (/[0-9]/.test(ch)) return POOLS.digit;
  if (/[A-Z]/.test(ch)) return POOLS.upper;
  if (/[a-z]/.test(ch)) return POOLS.lower;
  return POOLS.other;
}

/** Each letter cycles through random glyphs, then settles in place, left to right. */
function Scramble({ text, layout, ctx }: { text: string; layout: Layout; ctx: Ctx }) {
  const { reduce, live, done, glyph } = ctx;
  const units = useMemo(() => layout.lines.flat().flatMap((w) => w.units), [layout]);
  // Glyph per letter: null = settled, '' = hidden (whole words of connected scripts fade in instead).
  const [frame, setFrame] = useState<{ text: string; glyphs: (string | null)[] } | null>(() => ({
    text,
    glyphs: units.map((u, k) => (u.whole ? '' : poolFor(u.ch)[(k * 7 + 3) % poolFor(u.ch).length])),
  }));
  const latest = useRef({ text, units });
  latest.current = { text, units };
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    if (reduce) {
      played.current = true;
      done();
      return;
    }
    const { delay, speed, stagger } = live.current;
    const lead = 320;
    const start = Date.now() + delay;
    const id = setInterval(() => {
      const t = (Date.now() - start) * speed;
      if (t < 0) return;
      const { text: now, units: list } = latest.current;
      let pending = false;
      const glyphs = list.map((u, k) => {
        if (t >= lead + k * stagger) return null;
        pending = true;
        if (u.whole) return '';
        const pool = poolFor(u.ch);
        return pool[Math.floor(Math.random() * pool.length)];
      });
      setFrame(pending ? { text: now, glyphs } : null);
      if (!pending) {
        played.current = true;
        clearInterval(id);
        done();
      }
    }, 50);
    return () => clearInterval(id);
  }, [reduce, live, done]);

  const active = !reduce && frame && frame.text === text ? frame.glyphs : null;

  return (
    <Flow layout={layout} ctx={ctx}>
      {(word) => (
        <View key={word.w} style={styles.word}>
          {word.units.map((u) => {
            const g = active ? active[u.i] : null;
            if (g === null || g === undefined) {
              return (
                <Text key={u.i} style={[glyph, styles.tabular]}>
                  {u.ch}
                </Text>
              );
            }
            // The real letter holds the cell's width (invisible); the random glyph sits centred over it.
            return (
              <View key={u.i}>
                <Text style={[glyph, styles.tabular, styles.hidden]}>{u.ch}</Text>
                {g ? <Text style={[glyph, styles.tabular, styles.scrambled]}>{g}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
    </Flow>
  );
}

const CARET = '▍';

/**
 * Letters appear one by one behind a caret. If the new text extends the old (streaming), typing
 * continues from where it is; otherwise it starts over (`restart`) or snaps to the new text.
 */
function Typewriter({ text, ctx, restart, caret, caretColor }: { text: string; ctx: Ctx; restart: boolean; caret: boolean; caretColor: string }) {
  const { reduce, live, done, glyph } = ctx;
  const [first] = useState(text);
  const [shown, setShown] = useState('');
  const animate = !reduce;
  const visible = !animate ? text : restart ? (text.startsWith(shown) ? shown : '') : text === first ? shown : text;
  const typing = visible.length < text.length;
  const started = useRef(false);

  useEffect(() => {
    if (!typing) return;
    const { delay, speed, stagger } = live.current;
    const last = visible.slice(-1);
    // Small human rhythm: a beat after sentences and commas, a little jitter between letters.
    let wait = stagger * (/[.!?…]/.test(last) ? 7 : /[,;:]/.test(last) ? 3.5 : 1) * (0.7 + Math.random() * 0.6);
    if (!started.current) wait += delay * speed;
    const id = setTimeout(() => {
      started.current = true;
      setShown(text.slice(0, nextStop(text, visible.length)));
    }, wait / speed);
    return () => clearTimeout(id);
  }, [typing, text, visible, live]);

  // Finished typing: report it and (after the first text) announce the new text once it has settled.
  const complete = !typing;
  useEffect(() => {
    if (!complete) return;
    done();
    if (text === first) return;
    const id = setTimeout(() => AccessibilityInfo.announceForAccessibility(text), 600);
    return () => clearTimeout(id);
  }, [complete, text, first, done]);

  const [blink, setBlink] = useState(true);
  const showCaret = caret && animate;
  useEffect(() => {
    if (typing || !showCaret) return;
    const id = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(id);
  }, [typing, showCaret]);

  return (
    <View>
      {/* Reserves the final size so surrounding layout doesn't jump while typing. */}
      <Text style={[glyph, styles.ghost]}>
        {text}
        {showCaret ? CARET : null}
      </Text>
      <Text style={[glyph, StyleSheet.absoluteFill]}>
        {visible}
        {showCaret ? <Text style={{ color: typing || blink ? caretColor : 'transparent' }}>{CARET}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * Text that animates in five ways — words rising on a spring, a looping shimmer, letters rolling
 * between values, a glyph scramble, or a typewriter with a caret. All motion is on the native driver
 * (scramble and typewriter use a JS timer), and screen readers get the whole string as one element.
 */
export function AnimatedText({
  children,
  variant = 'reveal',
  trigger,
  delay = 0,
  stagger,
  speed = 1,
  color,
  caret = true,
  replayKey,
  onComplete,
  style,
  textStyle,
}: AnimatedTextProps) {
  const { colors, font, text: type } = useKit();
  const reduce = useReduceMotion();
  // Content text: it scales all the way with the user's text size, so the one-line clip windows,
  // roll distances and word gaps (all derived from the line height) scale with it.
  const { fontScale } = useWindowDimensions();
  const text = String(children ?? '');
  const mode = trigger ?? (variant === 'cascade' || variant === 'typewriter' ? 'change' : 'mount');

  const flat = StyleSheet.flatten(textStyle) ?? {};
  const fontSize = flat.fontSize ?? type.md.fontSize ?? 16;
  const lh = flat.lineHeight ?? Math.round(fontSize * 1.3);
  const tint = color ?? (typeof flat.color === 'string' ? flat.color : colors.foreground);
  const justify: ViewStyle['justifyContent'] =
    flat.textAlign === 'center' ? 'center' : flat.textAlign === 'right' ? 'flex-end' : 'flex-start';

  const live = useRef({ delay, speed: Math.max(0.1, speed), stagger: stagger ?? STAGGER[variant] });
  live.current = { delay, speed: Math.max(0.1, speed), stagger: stagger ?? STAGGER[variant] };
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const [done] = useState(() => () => complete.current?.());

  const layout = useMemo(() => tokenize(text), [text]);
  const ctx: Ctx = {
    glyph: [styles.glyph, { fontSize, fontFamily: font.family }, textStyle, { lineHeight: lh, color: tint }],
    lh: lh * fontScale,
    space: fontSize * 0.28 * fontScale,
    justify,
    reduce,
    live,
    done,
  };

  const replay = String(replayKey ?? '');
  let body: React.ReactNode;
  if (variant === 'shimmer') body = <Shimmer key={replay} layout={layout} ctx={ctx} />;
  else if (variant === 'cascade') body = <Cascade key={replay} text={text} ctx={ctx} changes={mode === 'change'} />;
  else if (variant === 'typewriter')
    body = <Typewriter key={replay} text={text} ctx={ctx} restart={mode === 'change'} caret={caret} caretColor={tint} />;
  else {
    // Remounting replays: on `replayKey`, and on every text change when trigger is 'change'.
    const key = `${replay}|${mode === 'change' ? text : ''}`;
    body =
      variant === 'scramble' ? (
        <Scramble key={key} text={text} layout={layout} ctx={ctx} />
      ) : (
        <Reveal key={key} layout={layout} ctx={ctx} />
      );
  }

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} style={style}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { flexWrap: 'wrap', alignItems: 'flex-start' },
  break: { flexBasis: '100%', height: 0 },
  word: { flexDirection: 'row' },
  glyph: { includeFontPadding: false },
  tabular: { fontVariant: ['tabular-nums'] },
  hidden: { opacity: 0 },
  scrambled: { position: 'absolute', top: 0, left: -24, right: -24, textAlign: 'center', opacity: 0.45 },
  ghost: { color: 'transparent' },
  overlay: { position: 'absolute', top: 0 },
});
