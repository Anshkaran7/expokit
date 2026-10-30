import * as Haptics from 'expo-haptics';
import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { alpha, motion, readableOn, useKit, type Colors } from '@/lib/kit';

// ─── Store ────────────────────────────────────────────────────────────────────

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  /** Reuse an id to update a toast in place (e.g. loading → success). */
  id?: string | undefined;

  description?: string | undefined;

  /** Milliseconds before it auto-dismisses. `Infinity` keeps it until dismissed. */
  duration?: number | undefined;

  action?: ToastAction | undefined;

  /** Replace the type icon (or `false` for none). */
  icon?: React.ReactNode | false | undefined;

  /** Send to the `<Toaster id="…">` with this id. Toasts without one go to the Toaster without an id. */
  toaster?: string | undefined;

}

export interface ToastData extends ToastOptions {
  id: string;
  type: ToastType;
  title: string;
  /** Bumped on every update, restarts the timer. */
  updatedAt: number;
  dismissed?: boolean | undefined;

}

type Message<T> = string | ((value: T) => string);

export type ToastApi = ((title: string, opts?: ToastOptions) => string) & {
  success: (title: string, opts?: ToastOptions) => string;
  error: (title: string, opts?: ToastOptions) => string;
  warning: (title: string, opts?: ToastOptions) => string;
  info: (title: string, opts?: ToastOptions) => string;
  loading: (title: string, opts?: ToastOptions) => string;
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    msgs: { loading: string; success: Message<T>; error: Message<unknown> },
    opts?: ToastOptions,
  ) => Promise<T>;
  dismiss: (id?: string) => void;
};

interface ToastStore {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => ToastData[];
  toast: ToastApi;
  remove: (id: string) => void;
}

function createToastStore(): ToastStore {
  let toasts: ToastData[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const snapshot = () => toasts;

  function upsert(type: ToastType, title: string, opts: ToastOptions = {}) {
    const id = opts.id ?? `t${++counter}`;
    const next: ToastData = { ...opts, id, type, title, updatedAt: Date.now() + Math.random(), dismissed: false };
    const exists = toasts.some((t) => t.id === id);
    toasts = exists ? toasts.map((t) => (t.id === id ? { ...t, ...next } : t)) : [next, ...toasts];
    emit();
    return id;
  }

  function remove(id: string) {
    if (!toasts.some((t) => t.id === id)) return;
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }

  const toastApi = Object.assign((title: string, opts?: ToastOptions) => upsert('default', title, opts), {
    success: (title: string, opts?: ToastOptions) => upsert('success', title, opts),
    error: (title: string, opts?: ToastOptions) => upsert('error', title, opts),
    warning: (title: string, opts?: ToastOptions) => upsert('warning', title, opts),
    info: (title: string, opts?: ToastOptions) => upsert('info', title, opts),
    loading: (title: string, opts?: ToastOptions) => upsert('loading', title, opts),
    promise<T>(
      promise: Promise<T> | (() => Promise<T>),
      msgs: { loading: string; success: Message<T>; error: Message<unknown> },
      opts?: ToastOptions,
    ): Promise<T> {
      const id = upsert('loading', msgs.loading, opts);
      const p = typeof promise === 'function' ? promise() : promise;
      p.then(
        (v) => upsert('success', typeof msgs.success === 'function' ? msgs.success(v) : msgs.success, { ...opts, id }),
        (e) => upsert('error', typeof msgs.error === 'function' ? msgs.error(e) : msgs.error, { ...opts, id }),
      );
      return p;
    },
    dismiss(id?: string) {
      toasts = toasts.map((t) => (id === undefined || t.id === id ? { ...t, dismissed: true } : t));
      emit();
    },
  }) as ToastApi;

  return { subscribe, snapshot, toast: toastApi, remove };
}

const globalStore = createToastStore();

/**
 * Show a toast from anywhere — no hooks. Render one `<Toaster />` near the root.
 * Prefer `useToast()` inside a `<ToastProvider>` when you need an isolated stack (e.g. demos).
 *
 *   toast('Event created')
 *   toast.success('Saved', { description: 'All changes synced.' })
 *   toast.promise(upload(), { loading: 'Uploading…', success: 'Uploaded', error: 'Upload failed' })
 */
export const toast = globalStore.toast;

const ToastStoreContext = createContext<ToastStore | null>(null);

/** Scoped toast queue — nest a `<Toaster />` (and `useToast()`) inside so demos / sheets don't share the global store. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => createToastStore(), []);
  return <ToastStoreContext.Provider value={store}>{children}</ToastStoreContext.Provider>;
}

/** Toast API for the nearest `ToastProvider`, or the global `toast` if none. */
export function useToast(): ToastApi {
  return useContext(ToastStoreContext)?.toast ?? globalStore.toast;
}

function useToastStore(): ToastStore {
  return useContext(ToastStoreContext) ?? globalStore;
}

// ─── Shared behaviour ─────────────────────────────────────────────────────────

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

/** Toasts handle Reduce Motion themselves, so Reanimated must not also skip their animations. */
const KEEP = ReduceMotion.Never;
const SNAPPY = { ...motion.snappy, reduceMotion: KEEP };
const BOUNCY = { ...motion.bouncy, reduceMotion: KEEP };

const HAPTIC: Partial<Record<ToastType, Haptics.NotificationFeedbackType>> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/** One notification tap when a toast appears or changes tone. After a spinner, it lands as the circle closes. */
function useToneHaptic(id: string | undefined, type: ToastType | undefined, enabled: boolean) {
  const prev = useRef<{ id?: string | undefined; type?: ToastType | undefined }>({});
  useEffect(() => {
    const from = prev.current;
    prev.current = { id, type };
    if (!enabled || !id || !type || (from.id === id && from.type === type)) return;
    const kind = HAPTIC[type];
    if (kind === undefined) return;
    const t = setTimeout(
      () => Haptics.notificationAsync(kind).catch(() => {}),
      from.id === id && from.type === 'loading' ? 380 : 0,
    );
    return () => clearTimeout(t);
  }, [id, type, enabled]);
}

/**
 * Auto-dismiss clock. Drives a UI-thread 1 → 0 `life` value (the drain bar) and fires `onDone`.
 * Both freeze while `paused` and resume where they stopped.
 */
function useLifetime(key: number | undefined, duration: number, running: boolean, onDone: () => void) {
  const life = useSharedValue(1);
  const remaining = useRef(duration);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    remaining.current = duration;
    life.set(1);
  }, [key, duration, life]);
  useEffect(() => {
    if (!running || !Number.isFinite(duration) || duration <= 0) return;
    const startedAt = Date.now();
    life.set(Math.max(0, remaining.current / duration));
    // The drain is a clock, not decoration: it runs at full length even with Reduce Motion on.
    life.set(withTiming(0, { duration: Math.max(0, remaining.current), easing: Easing.linear, reduceMotion: KEEP }));
    const timer = setTimeout(() => done.current(), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      cancelAnimation(life);
      remaining.current -= Date.now() - startedAt;
      life.set(Math.max(0, remaining.current / duration));
    };
  }, [key, duration, running, life]);
  return life;
}

// ─── Toaster ──────────────────────────────────────────────────────────────────

export type ToasterPosition = 'top' | 'bottom';
export type ToasterVariant = 'default' | 'rich' | 'minimal' | 'island';

export interface ToasterProps {
  /** Only show toasts sent with `{ toaster: id }`. */
  id?: string | undefined;

  /** Edge the stack sits on. Ignored by `variant="island"`, which always lives at the top centre. */
  position?: ToasterPosition | undefined;

  /**
   * 'default' cards with a tone glow · 'rich' cards filled with the tone · 'minimal' compact inverted pills
   * (a second line for the description when there is one) ·
   * 'island' a black capsule at the top centre that springs open like the iPhone Dynamic Island.
   */
  variant?: ToasterVariant | undefined;

  /** Default auto-dismiss time in ms (default 4000). */
  duration?: number | undefined;

  /** How many cards peek out of the stack (default 3). */
  visibleToasts?: number | undefined;

  /** Always show the stack fanned out instead of collapsed. */
  expand?: boolean | undefined;

  /** Distance from the top / bottom edge (default 16, island 10), added to `safeArea` and `bottomInset`. */
  offset?: number | undefined;

  /**
   * Keep clear of the notch / Dynamic Island and the home indicator: adds the safe-area insets from
   * react-native-safe-area-context when the app has it (every Expo Router app does). Without it, insets are 0.
   */
  safeArea?: boolean | undefined;

  /**
   * Extra space below a bottom stack, for UI that covers the screen's foot — a tab bar, a composer.
   * With a tab bar: `<Toaster safeArea bottomInset={49} />` (49 = the standard bar above the home indicator).
   */
  bottomInset?: number | undefined;

  /** Space between fanned-out cards (default 10). */
  gap?: number | undefined;

  /** Show a ✕ on every toast. */
  closeButton?: boolean | undefined;

  /** Success / warning / error toasts tap the matching notification haptic (default true). */
  haptics?: boolean | undefined;

  style?: StyleProp<ViewStyle> | undefined;

}

interface Insets {
  top: number;
  bottom: number;
}

const NO_INSETS: Insets = { top: 0, bottom: 0 };

declare const require: (id: string) => unknown;

/** react-native-safe-area-context when installed (Expo's Metro allows a missing optional require), else null. */
const safeAreaLib = (() => {
  try {
    return require('react-native-safe-area-context') as {
      SafeAreaInsetsContext?: React.Context<Insets | null>;
      initialWindowMetrics?: { insets: Insets } | null;
    };
  } catch {
    return null;
  }
})();
const InsetsContext = safeAreaLib?.SafeAreaInsetsContext ?? createContext<Insets | null>(null);

/** The screen's safe-area insets when `on` (from SafeAreaProvider, else the launch metrics), else 0. */
function useSafeInsets(on: boolean): Insets {
  const fromProvider = useContext(InsetsContext);
  if (!on) return NO_INSETS;
  return fromProvider ?? safeAreaLib?.initialWindowMetrics?.insets ?? NO_INSETS;
}

const PEEK = 12;
const GUESS_HEIGHT = 64;
// Controls stop growing at iOS's largest standard text size (xxxL ≈ 1.35×) so they keep their shape;
// content text scales all the way.
const FONT_CAP = 1.35;

/**
 * Hosts the toasts. It fills its parent absolutely (touches pass through), so drop it at the
 * root of your app — or inside any container to scope it there. Toasts stack like cards, fan out
 * when tapped, swipe away sideways or toward the edge, and pause their timers (and the draining
 * time line) while you touch them. `variant="island"` turns it into a Dynamic Island.
 */
export function Toaster({
  id,
  position = 'bottom',
  variant = 'default',
  duration = 4000,
  visibleToasts = 3,
  expand = false,
  offset,
  safeArea = false,
  bottomInset = 0,
  gap = 10,
  closeButton = false,
  haptics = true,
  style,
}: ToasterProps) {
  const store = useToastStore();
  const insets = useSafeInsets(safeArea);
  const all = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  // Inside ToastProvider, show the whole scoped stack (id filter is for the global store only).
  const mine = store === globalStore ? all.filter((t) => t.toaster === id) : all;
  const reduceMotion = useReduceMotion();

  const active = mine.filter((t) => !t.dismissed);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const expanded = expand || (open && active.length > 1);
  const s = position === 'bottom' ? -1 : 1; // direction the stack grows in

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse once the stack is down to one card
    if (active.length <= 1 && open) setOpen(false);
  }, [active.length, open]);

  if (variant === 'island') {
    return (
      <IslandToaster
        store={store}
        toasts={mine}
        duration={duration}
        offset={(offset ?? 10) + insets.top}
        haptics={haptics}
        reduceMotion={reduceMotion}
        style={style}
      />
    );
  }

  const frontId = active[0]?.id;
  const frontH = (frontId === undefined ? undefined : heights[frontId]) ?? GUESS_HEIGHT;
  const layout: Record<string, StackLayout> = {};
  let acc = 0;
  active.forEach((t, i) => {
    const h = heights[t.id] ?? GUESS_HEIGHT;
    if (expanded) {
      layout[t.id] = { y: s * acc, scale: 1, hidden: i >= visibleToasts, faded: false };
    } else {
      const clamped = Math.min(h, frontH);
      layout[t.id] = {
        // Line up the far edges, then let each older card peek out a little further.
        y: s * (frontH - clamped + PEEK * i),
        scale: 1 - 0.05 * i,
        hidden: i >= visibleToasts,
        clamp: i > 0 ? frontH : undefined,
        faded: i > 0,
      };
    }
    acc += h + gap;
  });

  return (
    <GestureHandlerRootView pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, style]}>
      {[...mine].reverse().map((t) => (
        <ToastItem
          key={t.id}
          data={t}
          layout={layout[t.id]}
          edge={position}
          edgeOffset={(offset ?? 16) + (position === 'bottom' ? insets.bottom + bottomInset : insets.top)}
          variant={variant}
          duration={t.duration ?? (t.type === 'loading' ? Infinity : duration)}
          paused={expanded}
          closeButton={closeButton}
          haptics={haptics}
          reduceMotion={reduceMotion}
          onHeight={(h) => setHeights((prev) => (prev[t.id] === h ? prev : { ...prev, [t.id]: h }))}
          onPress={() => active.length > 1 && !expand && setOpen((o) => !o)}
          onRemoved={() => {
            store.remove(t.id);
            setHeights(({ [t.id]: _, ...rest }) => rest);
          }}
        />
      ))}
    </GestureHandlerRootView>
  );
}

// ─── Toast card ───────────────────────────────────────────────────────────────

interface StackLayout {
  y: number;
  scale: number;
  hidden: boolean;
  clamp?: number | undefined;

  faded: boolean;
}

const sameLayout = (a: StackLayout, b: StackLayout) =>
  a.y === b.y && a.scale === b.scale && a.hidden === b.hidden && a.clamp === b.clamp && a.faded === b.faded;

interface ToastItemProps {
  data: ToastData;
  /** Undefined while the toast is leaving. */
  layout?: StackLayout | undefined;

  edge: ToasterPosition;
  edgeOffset: number;
  variant: Exclude<ToasterVariant, 'island'>;
  duration: number;
  paused: boolean;
  closeButton: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  onHeight: (h: number) => void;
  onPress: () => void;
  onRemoved: () => void;
}

function rubber(d: number) {
  'worklet';
  return (d * 40) / (40 + d);
}

function ToastItem({
  data,
  layout,
  edge,
  edgeOffset,
  variant,
  duration,
  paused,
  closeButton,
  haptics,
  reduceMotion,
  onHeight,
  onPress,
  onRemoved,
}: ToastItemProps) {
  const toast = useToast();
  const { colors, radius, dark, font, labels } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const toward = edge === 'bottom' ? 1 : -1; // swipe direction that dismisses toward the edge
  // The last layout the stack gave this toast: it keeps its place while it leaves (layout turns undefined).
  const [lastLayout, setLastLayout] = useState<StackLayout>(layout ?? { y: 0, scale: 1, hidden: false, faded: false });
  if (layout && !sameLayout(layout, lastLayout)) setLastLayout(layout);
  const L = layout ?? lastLayout;

  // Every value here lives on the UI thread and ends up in transform / opacity.
  const enter = useSharedValue(0);
  const y = useSharedValue(L.y);
  const scale = useSharedValue(L.scale);
  const vis = useSharedValue(L.hidden ? 0 : 1);
  const content = useSharedValue(L.faded ? 0 : 1);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const axis = useSharedValue<'x' | 'y' | null>(null);
  const gone = useSharedValue(false);
  const [pressing, setPressing] = useState(false);
  const [dragging, setDragging] = useState(false);

  useToneHaptic(data.id, data.type, haptics && !data.dismissed);

  useEffect(() => {
    enter.set(withSpring(1, SNAPPY));
  }, [enter]);

  const target = layout ?? L;
  useEffect(() => {
    if (!layout || data.dismissed) return;
    y.set(withSpring(target.y, SNAPPY));
    scale.set(withSpring(target.scale, SNAPPY));
    vis.set(withTiming(target.hidden ? 0 : 1, { duration: 200, reduceMotion: KEEP }));
    content.set(withTiming(target.faded ? 0 : 1, { duration: 200, reduceMotion: KEEP }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on the numbers, not the object identity
  }, [target.y, target.scale, target.hidden, target.faded, data.dismissed]);

  // Leave: fade + slide toward the edge, then drop out of the store.
  useEffect(() => {
    if (!data.dismissed || gone.get()) return;
    gone.set(true);
    enter.set(
      withTiming(0, { duration: 200, easing: Easing.in(Easing.quad), reduceMotion: KEEP }, () => {
        scheduleOnRN(onRemoved);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.dismissed]);

  // Auto-dismiss timer + drain line; both pause while the stack is open or a finger is down.
  const life = useLifetime(data.updatedAt, duration, !data.dismissed && !paused && !pressing && !dragging, () => toast.dismiss(data.id));

  const flyOut = (along: 'x' | 'y', to: number) => {
    'worklet';
    gone.set(true);
    (along === 'x' ? dragX : dragY).set(withTiming(to, { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: KEEP }));
    enter.set(
      withTiming(0, { duration: 180, reduceMotion: KEEP }, () => {
        scheduleOnRN(onRemoved);
      }),
    );
  };

  // Swipe sideways, or toward the edge, to dismiss. Runs on the UI thread.
  const pan = usePanGesture({
    minDistance: 6,
    onActivate: () => {
      axis.set(null);
      scheduleOnRN(setDragging, true);
    },
    onUpdate: (e) => {
      if (!axis.get()) axis.set(Math.abs(e.translationX) > Math.abs(e.translationY) ? 'x' : 'y');
      if (axis.get() === 'x') dragX.set(e.translationX);
      else {
        const d = e.translationY * toward;
        dragY.set(d >= 0 ? e.translationY : -toward * rubber(-d));
      }
    },
    onDeactivate: (e) => {
      // Velocities arrive in points per second.
      const { translationX: dx, translationY: dy, velocityX: vx, velocityY: vy } = e;
      if (!e.canceled && axis.get() === 'x' && (Math.abs(dx) > 90 || Math.abs(vx) > 700)) return flyOut('x', Math.sign(dx || vx) * 520);
      if (!e.canceled && axis.get() === 'y' && (dy * toward > 36 || vy * toward > 600)) return flyOut('y', toward * 140);
      dragX.set(withSpring(0, SNAPPY));
      dragY.set(withSpring(0, SNAPPY));
    },
    onFinalize: () => {
      scheduleOnRN(setDragging, false);
    },
  });

  const laneStyle = useAnimatedStyle(() => ({
    opacity: enter.get() * vis.get() * interpolate(dragX.get(), [-260, 0, 260], [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: y.get() + dragY.get() + toward * 28 * (1 - enter.get()) },
      { translateX: dragX.get() },
      { scale: scale.get() * (0.96 + 0.04 * enter.get()) },
    ],
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: content.get() }));
  const barStyle = useAnimatedStyle(() => ({ opacity: content.get(), transform: [{ scaleX: life.get() }] }));

  const look = theme(variant, data.type, colors, dark);
  const minimal = variant === 'minimal';
  // A one-line pill stays a capsule; with a description it becomes a soft rounded card.
  const r = minimal ? (data.description ? radius.scale(20) : radius.capsule(44)) : radius.lg;

  const typed = data.type !== 'default';
  const icon =
    data.icon === false ? null : (data.icon ??
      (typed ? <LivingIcon type={data.type} color={look.icon} halo={!minimal} reduceMotion={reduceMotion} /> : null));
  const showGlow = !minimal && typed && data.icon !== false && look.glow > 0;
  const showBar = !minimal && Number.isFinite(duration);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.lane,
        edge === 'bottom' ? { bottom: edgeOffset } : { top: edgeOffset },
        { transformOrigin: edge === 'bottom' ? 'center top' : 'center bottom' },
        laneStyle,
      ]}
    >
      {/* Shadow layer (unclipped) */}
      <GestureDetector gesture={pan}>
        <View
          style={[
            minimal ? styles.cardMinimal : styles.cardFull,
            { borderRadius: r, backgroundColor: look.bg, maxHeight: L.clamp, boxShadow: shadowFor(dark, minimal) },
          ]}
        >
          {/* Surface (clips the glow and drain line to the corners) */}
          <View style={[styles.clip, { borderRadius: r, borderColor: look.border, maxHeight: L.clamp }]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, contentStyle]}>
              {showGlow ? <Glow color={look.glowColor} strength={look.glow} x={32} y={32} /> : null}
            </Animated.View>
            <Pressable
              onPress={onPress}
              onPressIn={() => setPressing(true)}
              onPressOut={() => setPressing(false)}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityLabel={[data.title, data.description].filter(Boolean).join('. ')}
              onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}
            >
              <Animated.View style={[styles.row, minimal ? styles.padMinimal : icon ? styles.padIcon : styles.pad, contentStyle]}>
                {icon ? <View style={!minimal && data.description ? styles.iconTop : null}>{icon}</View> : null}
                <View style={minimal ? styles.textMinimal : styles.text}>
                  <Text numberOfLines={minimal ? 1 : 3} style={[styles.title, ff, { color: look.title }]}>
                    {data.title}
                  </Text>
                  {data.description ? (
                    <Text numberOfLines={minimal ? 2 : 4} style={[styles.desc, minimal && styles.descMinimal, ff, { color: look.desc }]}>
                      {data.description}
                    </Text>
                  ) : null}
                </View>
                {data.action ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      data.action?.onPress();
                      toast.dismiss(data.id);
                    }}
                    style={({ pressed }) => [
                      styles.action,
                      { borderRadius: radius.capsule(32), backgroundColor: look.actionBg, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.actionText, ff, { color: look.actionFg }]}>
                      {data.action.label}
                    </Text>
                  </Pressable>
                ) : null}
                {closeButton ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.dismiss}
                    hitSlop={12}
                    onPress={() => toast.dismiss(data.id)}
                    style={styles.close}
                  >
                    <Svg width={14} height={14} viewBox="0 0 24 24">
                      <Path d="M6 6l12 12M18 6L6 18" stroke={look.desc} strokeWidth={2.4} strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                ) : null}
              </Animated.View>
            </Pressable>
            {showBar ? (
              <Animated.View pointerEvents="none" style={[styles.bar, { backgroundColor: look.bar }, barStyle]} />
            ) : null}
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

// ─── Island ───────────────────────────────────────────────────────────────────

const CAP_W = 124;
const CAP_H = 36;
type Stage = 'hidden' | 'capsule' | 'open';

interface IslandToasterProps {
  store: ToastStore;
  toasts: ToastData[];
  duration: number;
  offset: number;
  haptics: boolean;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle> | undefined;

}

/**
 * Dynamic-Island host: one black capsule at the top centre. It widens, then grows taller into a card,
 * holds, and folds back into the capsule. A newer toast squashes the island and swaps its content in place.
 *
 * Everything animates on the UI thread: `w` / `h` (size, corner) on `frame` + `clip`; presence, squash,
 * drag and content fade on their own wrapper views.
 */
function IslandToaster({ store, toasts, duration, offset, haptics, reduceMotion, style }: IslandToasterProps) {
  const { colors, radius, dark, font, labels } = useKit();
  const ff = font.family ? { fontFamily: font.family } : null;
  const active = toasts.filter((t) => !t.dismissed);
  const front = active[0];

  const [stage, setStageState] = useState<Stage>('hidden');
  const stageRef = useRef<Stage>('hidden');
  const [shownId, setShownIdState] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const [lastShown, setLastShown] = useState<ToastData | null>(null);
  const [laneW, setLaneW] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const live = shownId ? toasts.find((t) => t.id === shownId) : undefined;
  // Keep showing the last version of a toast after the store drops it, while the island closes.
  if (live && live !== lastShown) setLastShown(live);
  const shown = live ?? (shownId ? lastShown : null);

  const w = useSharedValue(CAP_W);
  const h = useSharedValue(CAP_H);
  const presence = useSharedValue(0);
  const sqX = useSharedValue(1);
  const sqY = useSharedValue(1);
  const dragY = useSharedValue(0);
  const content = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearLater = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  };
  const setShown = (id: string | null) => {
    shownRef.current = id;
    setShownIdState(id);
  };

  const squash = () => {
    if (reduceMotion) return;
    const press = { duration: 90, easing: Easing.out(Easing.quad), reduceMotion: KEEP };
    sqX.set(withSequence(withTiming(1.05, press), withSpring(1, BOUNCY)));
    sqY.set(withSequence(withTiming(0.9, press), withSpring(1, BOUNCY)));
  };

  // Swap the island's content to another toast once the old content has faded out.
  const swapTo = (id: string) => {
    setShown(id);
    setExpanded(false);
    squash();
    content.set(withDelay(30, withTiming(1, { duration: 200, reduceMotion: KEEP })));
  };

  // Lifecycle: react to the front toast changing.
  useEffect(() => {
    const current = shownRef.current;
    if (front) {
      if (!current || stageRef.current === 'hidden') {
        clearLater();
        dragY.set(0);
        setShown(front.id);
        setExpanded(false);
        setStage('capsule');
        later(reduceMotion ? 0 : 140, () => setStage('open'));
      } else if (front.id !== current) {
        clearLater();
        // Replace in place: older toasts are superseded.
        toasts.forEach((t) => t.id !== front.id && store.remove(t.id));
        if (stageRef.current === 'open') {
          const next = front.id;
          content.set(
            withTiming(0, { duration: 90, reduceMotion: KEEP }, () => {
              scheduleOnRN(swapTo, next);
            }),
          );
        } else {
          setShown(front.id);
          setExpanded(false);
          setStage('open');
        }
      } else if (stageRef.current !== 'open') {
        clearLater();
        setStage('open');
      }
    } else if (current && stageRef.current !== 'hidden') {
      // Fold back into the capsule, then vanish.
      clearLater();
      setExpanded(false);
      setStage('capsule');
      later(reduceMotion ? 120 : 360, () => setStage('hidden'));
      later(reduceMotion ? 300 : 620, () => {
        setShown(null);
        store.remove(current);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by the front toast only
  }, [front?.id]);

  // Same toast, new tone (loading → success): a small squash as the icon morphs.
  const shownType = shown?.type;
  const prevType = useRef(shownType);
  useEffect(() => {
    if (prevType.current && shownType && prevType.current !== shownType && stageRef.current === 'open') squash();
    prevType.current = shownType;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownType]);

  // Declarative size / presence per stage: opening widens first, closing shortens first.
  const openW = laneW ? Math.min(laneW - 24, 380) : CAP_W;
  useEffect(() => {
    const isOpen = stage === 'open';
    const tw = isOpen ? openW : CAP_W;
    const th = isOpen ? Math.max(CAP_H, contentH || 64) : CAP_H;
    const wA = withSpring(tw, isOpen ? BOUNCY : SNAPPY);
    const hA = withSpring(th, SNAPPY);
    presence.set(withSpring(stage === 'hidden' ? 0 : 1, SNAPPY));
    if (isOpen) {
      w.set(wA);
      h.set(withDelay(reduceMotion ? 0 : 90, hA));
      content.set(withDelay(reduceMotion ? 0 : 160, withTiming(1, { duration: 220, reduceMotion: KEEP })));
    } else {
      content.set(withTiming(0, { duration: 110, reduceMotion: KEEP }));
      h.set(hA);
      w.set(withDelay(reduceMotion ? 0 : 70, wA));
    }
  }, [stage, openW, contentH, reduceMotion, w, h, presence, content]);

  useToneHaptic(shown?.id, shown?.type, haptics && stage === 'open' && !shown?.dismissed);

  const dur = shown ? (shown.duration ?? (shown.type === 'loading' ? Infinity : duration)) : Infinity;
  const life = useLifetime(
    shown ? shown.updatedAt : undefined,
    dur,
    !!shown && !shown.dismissed && stage === 'open' && !pressing && !dragging && !expanded,
    () => shownRef.current && store.toast.dismiss(shownRef.current),
  );

  // After a flick: reset to a closed capsule and drop the toast.
  const flicked = () => {
    const id = shownRef.current;
    w.set(CAP_W);
    h.set(CAP_H);
    dragY.set(0);
    setExpanded(false);
    setStage('hidden');
    setShown(null);
    if (id) store.remove(id);
  };

  // Swipe up to dismiss. The drag and the flick run on the UI thread.
  const pan = usePanGesture({
    activeOffsetY: [-6, 6],
    failOffsetX: [-6, 6],
    onActivate: () => {
      scheduleOnRN(setDragging, true);
    },
    onUpdate: (e) => {
      dragY.set(e.translationY < 0 ? e.translationY : rubber(e.translationY));
    },
    onDeactivate: (e) => {
      if (!e.canceled && (e.translationY < -28 || e.velocityY < -500)) {
        scheduleOnRN(clearLater);
        dragY.set(
          withTiming(-90, { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: KEEP }, () => {
            scheduleOnRN(flicked);
          }),
        );
        presence.set(withTiming(0, { duration: 160, reduceMotion: KEEP }));
        content.set(withTiming(0, { duration: 100, reduceMotion: KEEP }));
        return;
      }
      dragY.set(withSpring(0, SNAPPY));
    },
    onFinalize: () => {
      scheduleOnRN(setDragging, false);
    },
  });

  const bg = dark ? mix('#000000', colors.foreground, 0.05) : '#000000';
  const fg = readableOn(bg);
  const tone = !shown || shown.type === 'default' || shown.type === 'loading' ? mix(fg, bg, 0.25) : toneOf(shown.type, colors, true);
  const capR = radius.capsule(CAP_H);
  const cardR = Math.max(capR, radius.scale(30));

  const outerStyle = useAnimatedStyle(() => {
    const p = 0.5 + 0.5 * presence.get();
    return {
      opacity: presence.get(),
      transform: [{ translateY: dragY.get() }, { scaleX: p * sqX.get() }, { scaleY: p * sqY.get() }],
    };
  });
  const cornerStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(h.get(), [CAP_H, CAP_H + 28], [capR, cardR], Extrapolation.CLAMP),
  }));
  const frameStyle = useAnimatedStyle(() => ({ width: w.get(), height: h.get() }));
  const placeStyle = useAnimatedStyle(() => ({ left: (w.get() - openW) * 0.5 }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: content.get(),
    transform: [{ scale: 0.92 + 0.08 * content.get() }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: life.get() }] }));

  const typed = !!shown && shown.type !== 'default';
  const icon =
    !shown || shown.icon === false
      ? null
      : (shown.icon ?? (typed ? <LivingIcon type={shown.type} color={tone} reduceMotion={reduceMotion} /> : null));
  const showBar = Number.isFinite(dur);

  return (
    <GestureHandlerRootView pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, style]}>
      <View
        pointerEvents="box-none"
        style={[styles.islandLane, { top: offset }]}
        onLayout={(e) => setLaneW(Math.round(e.nativeEvent.layout.width))}
      >
        {shown ? (
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ transformOrigin: 'center top' }, outerStyle]}>
              <Animated.View
                style={[
                  {
                    backgroundColor: bg,
                    boxShadow: dark
                      ? '0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px -6px rgba(0,0,0,0.6)'
                      : '0 2px 6px rgba(0,0,0,0.12), 0 14px 36px -8px rgba(0,0,0,0.35)',
                  },
                  frameStyle,
                  cornerStyle,
                ]}
              >
                <Animated.View style={[styles.islandClip, cornerStyle]}>
                  <Animated.View style={[styles.islandPlace, { width: openW }, placeStyle]}>
                    <Animated.View style={contentStyle} onLayout={(e) => setContentH(Math.round(e.nativeEvent.layout.height))}>
                      {typed && shown.icon !== false ? <Glow color={tone} strength={0.3} x={33} y={32} /> : null}
                      <Pressable
                        onPress={() => setExpanded((x) => !x)}
                        onPressIn={() => setPressing(true)}
                        onPressOut={() => setPressing(false)}
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={[shown.title, shown.description].filter(Boolean).join('. ')}
                        accessibilityHint={shown.description || shown.action ? (expanded ? labels.collapseNotification : labels.expandNotification) : undefined}
                        accessibilityState={{ expanded }}
                        style={[styles.row, icon ? styles.islandPadIcon : styles.islandPad]}
                      >
                        {icon ? <View style={expanded && shown.description ? styles.iconTop : null}>{icon}</View> : null}
                        <View style={styles.text}>
                          <Text numberOfLines={expanded ? 3 : 1} style={[styles.title, ff, { color: fg }]}>
                            {shown.title}
                          </Text>
                          {shown.description ? (
                            <Text numberOfLines={expanded ? undefined : 1} style={[styles.desc, ff, { color: alpha(fg, 0.62) }]}>
                              {shown.description}
                            </Text>
                          ) : null}
                        </View>
                        {!expanded && shown.action ? (
                          <View style={[styles.islandChip, { borderRadius: radius.capsule(24), backgroundColor: alpha(fg, 0.14) }]}>
                            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.islandChipText, ff, { color: fg }]}>
                              {shown.action.label}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                      {expanded && shown.action ? (
                        <View style={styles.islandActions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              shown.action?.onPress();
                              store.toast.dismiss(shown.id);
                            }}
                            style={({ pressed }) => [
                              styles.islandAction,
                              { borderRadius: radius.capsule(44), backgroundColor: alpha(fg, pressed ? 0.24 : 0.16) },
                            ]}
                          >
                            <Text maxFontSizeMultiplier={FONT_CAP} style={[styles.title, ff, { color: fg }]}>
                              {shown.action.label}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {showBar ? (
                        <View style={[styles.islandTrack, { backgroundColor: alpha(fg, 0.1) }]}>
                          <Animated.View style={[styles.islandFill, { backgroundColor: typed ? tone : alpha(fg, 0.5) }, fillStyle]} />
                        </View>
                      ) : null}
                    </Animated.View>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

// ─── Look ─────────────────────────────────────────────────────────────────────

function hex6(h: string) {
  return h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h;
}

function rgb(h: string) {
  const n = parseInt(hex6(h).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(v: number[]) {
  return '#' + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

/** Opaque blend of two #rrggbb colours (stacked cards must not see through each other). */
function mix(a: string, b: string, t: number) {
  if (!a.startsWith('#') || !b.startsWith('#')) return a;
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + ((y[i] ?? v) - v) * t));
}

function toneOf(type: ToastType, c: Colors, dark: boolean) {
  const tones: Record<ToastType, string> = {
    default: c.foreground,
    loading: c.mutedForeground,
    success: c.success,
    error: c.danger,
    warning: c.warning,
    info: dark ? '#60a5fa' : '#2563eb',
  };
  return tones[type];
}

function shadowFor(dark: boolean, minimal: boolean) {
  if (minimal) return dark ? '0 6px 20px -4px rgba(0,0,0,0.6)' : '0 6px 20px -6px rgba(0,0,0,0.3)';
  return dark
    ? '0 1px 2px rgba(0,0,0,0.5), 0 8px 20px -6px rgba(0,0,0,0.55), 0 24px 48px -16px rgba(0,0,0,0.6)'
    : '0 1px 2px rgba(0,0,0,0.05), 0 6px 14px -4px rgba(0,0,0,0.08), 0 22px 44px -14px rgba(0,0,0,0.18)';
}

interface Look {
  bg: string;
  border: string;
  title: string;
  desc: string;
  icon: string;
  glowColor: string;
  glow: number;
  bar: string;
  actionBg: string;
  actionFg: string;
}

function theme(variant: Exclude<ToasterVariant, 'island'>, type: ToastType, c: Colors, dark: boolean): Look {
  const tone = toneOf(type, c, dark);
  if (variant === 'minimal') {
    return {
      bg: c.foreground,
      border: c.foreground,
      title: c.background,
      desc: alpha(c.background, 0.7),
      icon: type === 'default' || type === 'loading' ? c.background : tone,
      glowColor: tone,
      glow: 0,
      bar: 'transparent',
      actionBg: alpha(c.background, 0.16),
      actionFg: c.background,
    };
  }
  if (variant === 'rich' && type !== 'default' && type !== 'loading') {
    // Filled: the solid tone with readable text on it; no second hue and no light-leak.
    const fg = readableOn(tone);
    return {
      bg: tone,
      border: alpha(fg, 0.12),
      title: fg,
      desc: alpha(fg, 0.78),
      icon: fg,
      glowColor: tone,
      glow: 0,
      bar: alpha(fg, 0.5),
      actionBg: alpha(fg, 0.18),
      actionFg: fg,
    };
  }
  return {
    bg: c.popover,
    border: alpha(c.foreground, dark ? 0.1 : 0.08),
    title: c.foreground,
    desc: c.mutedForeground,
    icon: tone,
    glowColor: tone,
    glow: dark ? 0.18 : 0.12,
    bar: type === 'default' || type === 'loading' ? alpha(c.foreground, 0.22) : alpha(tone, 0.6),
    actionBg: c.primary,
    actionFg: c.primaryForeground,
  };
}

/** Light leak: a radial tone glow centred on (x, y) that spills across the top-left of the surface. */
function Glow({ color, strength, x, y }: { color: string; strength: number; x: number; y: number }) {
  const id = 'gl' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = 320;
  const H = 200;
  return (
    <Svg pointerEvents="none" width={W} height={H} style={{ position: 'absolute', left: x - W / 2, top: y - H / 2 }}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="0.35" stopColor={color} stopOpacity={strength * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill={`url(#${id})`} />
    </Svg>
  );
}

// ─── Living icon ──────────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const ICON = 20;
const HALO = 30;
const HALO_OUT = 38;
const RING = 2 * Math.PI * 9; // r = 9
const TRIANGLE = 57; // perimeter of the rounded warning triangle
const ARC = 0.28; // spinner arc as a fraction of the ring

const TRIANGLE_D = 'M10.3 4.2a2 2 0 0 1 3.4 0l7.1 12.6a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3z';

type IconStroke = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

/** A glyph stroke that draws itself in as `draw` runs from `from` to `to`. */
function DrawPath({ d, len, draw, from = 0, to = 1, stroke }: { d: string; len: number; draw: SharedValue<number>; from?: number; to?: number; stroke: IconStroke }) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(draw.get(), [from, to], [len, 0], Extrapolation.CLAMP),
  }));
  return <AnimatedPath d={d} {...stroke} strokeDasharray={[len, len]} animatedProps={animatedProps} />;
}

/** The dot of an ! or i, fading in near the end of the draw. */
function DrawDot({ cy, color, draw }: { cy: number; color: string; draw: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({ opacity: interpolate(draw.get(), [0, 0.6, 1], [0, 0, 1]) }));
  return <AnimatedCircle cx={12} cy={cy} r={1.25} fill={color} animatedProps={animatedProps} />;
}

/**
 * Tone icon that draws itself: the outline strokes in, then the glyph draws and springs. A loading
 * spinner's arc keeps turning while it closes into the success / error circle, then the mark draws in.
 */
function LivingIcon({
  type,
  color,
  halo = true,
  reduceMotion = false,
}: {
  type: ToastType;
  color: string;
  halo?: boolean | undefined;

  reduceMotion?: boolean | undefined;

}) {
  const { radius } = useKit();
  const outline = useSharedValue(0);
  const draw = useSharedValue(0);
  const pop = useSharedValue(0.5);
  const spin = useSharedValue(0);
  const spinning = useSharedValue(false);
  const ripple = useSharedValue(1);
  const prev = useRef<ToastType | null>(null);

  useEffect(() => {
    const from = prev.current;
    prev.current = type;
    const stopSpin = () => {
      'worklet';
      cancelAnimation(spin);
      spinning.set(false);
    };

    if (type === 'loading') {
      if (!spinning.get()) {
        spinning.set(true);
        spin.set(0);
        spin.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.linear, reduceMotion: KEEP }), -1, false));
      }
      draw.set(0);
      if (reduceMotion) outline.set(ARC);
      else outline.set(withTiming(ARC, { duration: 300, easing: Easing.out(Easing.cubic), reduceMotion: KEEP }));
      return;
    }

    if (reduceMotion) {
      stopSpin();
      outline.set(1);
      draw.set(1);
      pop.set(1);
      return;
    }

    const morph = from === 'loading';
    if (!morph) outline.set(0);
    draw.set(0);
    pop.set(0.5);
    // The arc keeps spinning while it closes; a full ring looks the same at any angle, so it stops invisibly.
    outline.set(
      withTiming(
        1,
        { duration: morph ? 380 : 420, easing: morph ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic), reduceMotion: KEEP },
        (finished) => {
          if (!finished) return;
          stopSpin();
          ripple.set(0);
          draw.set(withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic), reduceMotion: KEEP }));
          pop.set(withSpring(1, BOUNCY));
          ripple.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.quad), reduceMotion: KEEP }));
        },
      ),
    );
  }, [type, reduceMotion, outline, draw, pop, spin, spinning, ripple]);

  useEffect(() => () => cancelAnimation(spin), [spin]);

  const stroke: IconStroke = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  const triangle = type === 'warning';
  const per = triangle ? TRIANGLE : RING;
  const box = halo ? HALO_OUT : ICON;
  const inset = (box - ICON) / 2;
  const circle = (d: number) => ({ width: d, height: d, borderRadius: radius.full, left: (box - d) / 2, top: (box - d) / 2 });

  const outlineProps = useAnimatedProps(() => ({ strokeDashoffset: per * (1 - outline.get()) }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - ripple.get()),
    transform: [{ scale: 0.8 + 0.75 * ripple.get() }],
  }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View style={{ width: box, height: box }} importantForAccessibility="no-hide-descendants">
      {halo ? (
        <>
          <View style={[styles.abs, circle(HALO_OUT), { backgroundColor: alpha(color, 0.08) }]} />
          <View style={[styles.abs, circle(HALO), { backgroundColor: alpha(color, 0.14) }]} />
          <Animated.View style={[styles.abs, circle(HALO_OUT), { borderWidth: 1.5, borderColor: alpha(color, 0.35) }, rippleStyle]} />
        </>
      ) : null}
      <Animated.View style={[styles.abs, { left: inset, top: inset }, spinStyle]}>
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
          {triangle ? (
            <AnimatedPath d={TRIANGLE_D} {...stroke} strokeDasharray={[per, per]} animatedProps={outlineProps} />
          ) : (
            <>
              {type === 'loading' ? <Circle cx={12} cy={12} r={9} {...stroke} stroke={alpha(color, 0.2)} /> : null}
              <AnimatedCircle
                cx={12}
                cy={12}
                r={9}
                {...stroke}
                rotation={-90}
                origin="12, 12"
                strokeDasharray={[per, per]}
                animatedProps={outlineProps}
              />
            </>
          )}
        </Svg>
      </Animated.View>
      {type !== 'loading' ? (
        <Animated.View style={[styles.abs, { left: inset, top: inset }, popStyle]}>
          <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
            {type === 'success' ? <DrawPath d="M8 12.4l2.7 2.7L16.2 9.4" len={12} draw={draw} stroke={stroke} /> : null}
            {type === 'error' ? (
              <>
                <DrawPath d="M9.2 9.2l5.6 5.6" len={8} to={0.55} draw={draw} stroke={stroke} />
                <DrawPath d="M14.8 9.2l-5.6 5.6" len={8} from={0.45} draw={draw} stroke={stroke} />
              </>
            ) : null}
            {type === 'warning' ? (
              <>
                <DrawPath d="M12 9.5v4" len={4.2} draw={draw} stroke={stroke} />
                <DrawDot cy={16.6} color={color} draw={draw} />
              </>
            ) : null}
            {type === 'info' ? (
              <>
                <DrawDot cy={7.9} color={color} draw={draw} />
                <DrawPath d="M12 11v5" len={5.2} draw={draw} stroke={stroke} />
              </>
            ) : null}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { zIndex: 1000, elevation: 1000 },
  lane: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  cardFull: { width: '100%', maxWidth: 420 },
  cardMinimal: { maxWidth: 360 },
  clip: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pad: { paddingVertical: 14, paddingHorizontal: 16 },
  padIcon: { paddingVertical: 12, paddingLeft: 12, paddingRight: 16 },
  padMinimal: { paddingVertical: 10, paddingLeft: 14, paddingRight: 16, gap: 10 },
  iconTop: { alignSelf: 'flex-start' },
  text: { flex: 1, gap: 2 },
  textMinimal: { flexShrink: 1 },
  title: { fontSize: 14.5, fontWeight: '400', lineHeight: 20, letterSpacing: -0.1 },
  desc: { fontSize: 13.5, fontWeight: '400', lineHeight: 19 },
  descMinimal: { fontSize: 13, lineHeight: 17 },
  action: { paddingHorizontal: 12, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '400', includeFontPadding: false, textAlignVertical: 'center' },
  close: { alignSelf: 'flex-start', padding: 2, marginRight: -4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, transformOrigin: 'left' },
  abs: { position: 'absolute' },
  islandLane: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  islandClip: { flex: 1, overflow: 'hidden' },
  islandPlace: { position: 'absolute', top: 0 },
  islandPad: { paddingVertical: 14, paddingHorizontal: 20 },
  islandPadIcon: { paddingTop: 13, paddingBottom: 15, paddingLeft: 14, paddingRight: 18 },
  islandChip: { paddingHorizontal: 10, minHeight: 24, justifyContent: 'center' },
  islandChipText: { fontSize: 12.5, fontWeight: '400', includeFontPadding: false, textAlignVertical: 'center' },
  islandActions: { paddingHorizontal: 14, paddingBottom: 16, marginTop: -2 },
  islandAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  islandTrack: { position: 'absolute', left: 28, right: 28, bottom: 6, height: 2, borderRadius: 1, overflow: 'hidden' },
  islandFill: { flex: 1, transformOrigin: 'left' },
});
