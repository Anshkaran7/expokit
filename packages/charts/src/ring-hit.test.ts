import assert from "node:assert/strict";
import { test } from "node:test";
import { onRing } from "./ring-hit";

// A 260pt donut like the docs card: centre (130, 130), ring 73–122, 32pt of slack outside.
const donut = { cx: 130, cy: 130, inner: 73, outer: 122, slack: 32, start: 0, sweep: Math.PI * 2 };

test("touches on the ring are claimed all the way round", () => {
  for (let deg = 0; deg < 360; deg += 15) {
    const a = (deg * Math.PI) / 180;
    const r = 100;
    assert.equal(onRing(130 + r * Math.sin(a), 130 - r * Math.cos(a), donut), true, `${deg}°`);
  }
});

test("the slack just outside the ring still counts (a finger is wider than the stroke)", () => {
  assert.equal(onRing(130, 130 - 122 - 30, donut), true);
  assert.equal(onRing(130, 130 - 122 - 33, donut), false);
});

test("the hole and the card around the ring pass through to the page scroll", () => {
  assert.equal(onRing(130, 130, donut), false);
  assert.equal(onRing(130 + 50, 130, donut), false);
  assert.equal(onRing(0, 0, donut), false);
});

test("a pie (no hole) claims the centre too", () => {
  assert.equal(onRing(130, 130, { ...donut, inner: 0 }), true);
});

test("a semicircle only claims its drawn half", () => {
  const semi = { ...donut, start: -Math.PI / 2, sweep: Math.PI };
  assert.equal(onRing(130, 130 - 100, semi), true); // 12 o'clock
  assert.equal(onRing(130 - 100, 130, semi), true); // 9 o'clock, the start edge
  assert.equal(onRing(130, 130 + 100, semi), false); // 6 o'clock, not drawn
});

test("NaN or degenerate geometry never claims the gesture", () => {
  assert.equal(onRing(Number.NaN, 10, donut), false);
  assert.equal(onRing(130, 30, { ...donut, outer: 0, slack: 0 }), false);
});
