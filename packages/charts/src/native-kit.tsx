// Shared building blocks for the mobile charts (PillBarChart, TickBarChart, FanGauge, MiniRing and
// the rest of the "Mobile" family). Everything here animates with the NATIVE driver (transform /
// opacity only), so charts stay smooth on iOS and Android even while the JS thread is busy.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { clamp } from "./internal";
import { TEXT_SCALE } from "./kit";
import { useChartTheme } from "./theme";

/** Smooth ease-out, no overshoot (the kit's motion curve). */
export const EASE = Easing.bezier(0.32, 0.72, 0, 1);
export const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Blend two #rrggbb colours (t = 0 → a, 1 → b). Non-hex input returns `a`. */
export function mixColor(a: string, b: string, t: number) {
  const parse = (hex: string) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
    return m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16)) : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a;
  const k = clamp(t, 0, 1);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * One native-driven Animated.Value per target. New targets glide from where each value is now.
 * `from` seeds freshly created values ("target" = start settled, e.g. selection state).
 */
export function useNativeValues(
  targets: number[],
  { animate, duration = 650, from = "target", stagger = 0 }: { animate: boolean; duration?: number; from?: number | "target"; stagger?: number }
) {
  const values = useRef<Animated.Value[]>([]);
  if (values.current.length !== targets.length) {
    values.current = targets.map(
      (t, i) => values.current[i] ?? new Animated.Value(!animate || from === "target" ? t : from)
    );
  }
  const first = useRef(true);
  const key = targets.join("|");
  useEffect(() => {
    if (!animate) {
      values.current.forEach((v, i) => v.setValue(targets[i]));
      return;
    }
    const entering = first.current;
    first.current = false;
    const anim = Animated.parallel(
      values.current.map((v, i) =>
        Animated.timing(v, {
          toValue: targets[i],
          duration,
          // Stagger only the entrance; later updates move together.
          delay: entering ? i * stagger : 0,
          easing: EASE,
          useNativeDriver: true,
        })
      )
    );
    anim.start();
    return () => anim.stop();
  }, [key, animate]);
  return values.current;
}

/** Measured width of a View (layout-driven charts need it for touch → index). */
export function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWidth((p) => (p === w ? p : w));
  };
  return [width, onLayout] as const;
}

export function Empty({ height, text }: { height: number; text: string }) {
  const theme = useChartTheme();
  return (
    <View style={{ height, alignItems: "center", justifyContent: "center" }} accessible accessibilityLabel={text}>
      <Text maxFontSizeMultiplier={TEXT_SCALE} style={{ color: theme.mutedForeground, fontSize: 13, fontFamily: theme.fontFamily }}>
        {text}
      </Text>
    </View>
  );
}

/** Screen readers: swipe up / down steps through the items. */
export function adjustable(label: string, valueText: string | undefined, count: number, active: number | null, select: (i: number) => void) {
  return {
    accessible: true,
    accessibilityRole: "adjustable" as const,
    accessibilityLabel: label,
    accessibilityHint: "Swipe up or down to read each item.",
    accessibilityValue: valueText ? { text: valueText } : undefined,
    accessibilityActions: [{ name: "increment" as const }, { name: "decrement" as const }],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (!count) return;
      const delta = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const next = active === null ? (delta > 0 ? 0 : count - 1) : clamp(active + delta, 0, count - 1);
      if (next !== active) select(next);
    },
  };
}


/** Default cap for bar thickness: wide tablets / web never stretch capsules into lenses. */
export const MAX_BAR = 44;

/**
 * Dark value bubble with a caret that glides between items (native thread). Place it as the last child of
 * a relatively positioned chart View. `x` is the item's centre, `y` the top of the item (bubble sits above).
 */
export function Bubble({
  visible,
  x,
  y,
  width,
  lines,
  animate = true,
}: {
  visible: boolean;
  x: number;
  y: number;
  /** Chart width, keeps the bubble inside. */
  width: number;
  /** First line bold; extra lines smaller. */
  lines: string[];
  animate?: boolean;
}) {
  const theme = useChartTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const last = useRef(lines);
  if (visible) last.current = lines;
  const left = clamp(x - size.w / 2, 0, Math.max(0, width - size.w));
  const top = y - size.h - 8;
  useEffect(() => {
    if (!size.w) return;
    if (!visible) {
      shown.current = false;
      Animated.timing(op, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    if (!shown.current || !animate) {
      tx.setValue(left);
      ty.setValue(top);
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: left, duration: 240, easing: EASE, useNativeDriver: true }),
        Animated.timing(ty, { toValue: top, duration: 240, easing: EASE, useNativeDriver: true }),
      ]).start();
    }
    shown.current = true;
    Animated.timing(op, { toValue: 1, duration: animate ? 160 : 0, useNativeDriver: true }).start();
  }, [visible, left, top, size.w, size.h, animate]);
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (Math.abs(w - size.w) > 0.5 || Math.abs(h - size.h) > 0.5) setSize({ w, h });
      }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: theme.foreground,
        opacity: op,
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    >
      {last.current.map((line, i) => (
        <Text
          key={i}
          maxFontSizeMultiplier={1.2}
          style={{
            color: theme.background,
            fontFamily: theme.fontFamily,
            fontSize: i ? 11 : 13,
            fontWeight: i ? "400" : "600",
            opacity: i ? 0.8 : 1,
            fontVariant: ["tabular-nums"],
          }}
        >
          {line}
        </Text>
      ))}
      <View
        style={{
          position: "absolute",
          bottom: -3,
          left: clamp(x - left - 4, 8, Math.max(8, size.w - 16)),
          width: 8,
          height: 8,
          borderRadius: 1,
          backgroundColor: theme.foreground,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </Animated.View>
  );
}

/** Column index under x for n equal columns separated by gap. */
export const columnAt = (x: number, n: number, colW: number, gap: number) =>
  clamp(Math.floor((x + gap / 2) / Math.max(colW + gap, 1)), 0, Math.max(0, n - 1));
