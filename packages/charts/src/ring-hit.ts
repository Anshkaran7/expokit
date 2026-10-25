const TAU = Math.PI * 2;

export interface RingGeometry {
  cx: number;
  cy: number;
  inner: number;
  outer: number;
  /** Extra reach past the outer edge (slice pop-out plus finger slop). */
  slack: number;
  /** Radians clockwise from 12 o'clock. */
  start: number;
  sweep: number;
}

/**
 * Is (x, y) on a pie / donut's touchable band? Touches there lock the page scroll so a drag
 * around the ring isn't stolen by a parent ScrollView; the hole and the card around it don't.
 */
export function onRing(x: number, y: number, ring: RingGeometry): boolean {
  const dist = Math.hypot(x - ring.cx, y - ring.cy);
  if (!(dist >= ring.inner * 0.7 && dist <= ring.outer + ring.slack)) return false;
  if (ring.sweep >= TAU) return true;
  let a = Math.atan2(x - ring.cx, ring.cy - y) - ring.start;
  a = ((a % TAU) + TAU) % TAU;
  return a <= ring.sweep;
}
