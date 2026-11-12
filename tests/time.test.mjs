import test from "node:test";
import assert from "node:assert/strict";
import {
  HOUR, MINUTE, DAY, hourOf, angleDelta, dialAngle, dragShift, snapShift, clampShift,
  formatShift, windowShare, windowLit, twilight, daylight
} from "../js/time-math.js";

test("dialAngle is clockwise from 12 o'clock (y down)", () => {
  assert.equal(dialAngle(0, -1), 0);
  assert.equal(dialAngle(1, 0), 90);
  assert.equal(dialAngle(0, 1), 180);
  assert.equal(dialAngle(-1, 0), 270);
});

test("angleDelta takes the short way round", () => {
  assert.equal(angleDelta(350, 10), 20);
  assert.equal(angleDelta(10, 350), -20);
  assert.equal(angleDelta(0, 180), 180);
  assert.equal(angleDelta(90, 90), 0);
});

test("dragShift: a hand turn is 12 hours, a bezel turn is 30 days", () => {
  assert.equal(dragShift(360, "time"), 12 * HOUR);
  assert.equal(dragShift(30, "time"), HOUR);
  assert.equal(dragShift(360, "days"), 30 * DAY);
  assert.equal(dragShift(-12, "days"), -DAY);
});

test("snapShift lands on 5-minute steps and full hours", () => {
  const base = new Date(2026, 10, 12, 15, 0, 0);
  const at = (shift) => new Date(base.getTime() + snapShift(shift, base));
  assert.equal(at(17 * MINUTE).getMinutes(), 15);
  assert.equal(at(18 * MINUTE).getMinutes(), 20);
  const nearHour = at(3 * HOUR + 4 * MINUTE);
  assert.equal(nearHour.getHours(), 18);
  assert.equal(nearHour.getMinutes(), 0);
  const beforeHour = at(2 * HOUR + 56 * MINUTE);
  assert.equal(beforeHour.getHours(), 18);
  assert.equal(beforeHour.getMinutes(), 0);
  // Keyboard steps skip the magnet: 5 minutes past the hour stays 5 minutes past.
  const free = new Date(base.getTime() + snapShift(5 * MINUTE, base, { magnet: false }));
  assert.equal(free.getMinutes(), 5);
  // Whole minutes: the dialled clock keeps the real seconds.
  const odd = new Date(2026, 10, 12, 15, 0, 37);
  assert.equal(snapShift(17 * MINUTE + 1234, odd) % MINUTE, 0);
});

test("clampShift and formatShift", () => {
  assert.equal(clampShift(100 * DAY), 60 * DAY);
  assert.equal(formatShift(0), "now");
  assert.equal(formatShift(2 * HOUR + 40 * MINUTE), "+2h 40m");
  assert.equal(formatShift(-(3 * DAY + HOUR)), "-3 days 1h");
  assert.equal(formatShift(-DAY), "-1 day");
});

test("hourOf", () => {
  assert.equal(hourOf(new Date(2026, 0, 1, 13, 30)), 13.5);
});

test("scenery curves stay in range and peak where expected", () => {
  for (let h = 0; h < 24; h += 0.25) {
    for (const value of [windowShare(h), twilight(h), daylight(h)]) {
      assert.ok(value >= 0 && value <= 1, `out of range at ${h}: ${value}`);
    }
  }
  assert.ok(windowShare(21) > windowShare(3));
  assert.ok(twilight(6.2) > 0.99 && twilight(19.2) > 0.99);
  assert.ok(twilight(13) < 0.01 && twilight(0.5) < 0.01);
  assert.equal(daylight(13), 1);
  assert.equal(daylight(2), 0);
  assert.equal(windowLit(0.2, 0.9), 1);
  assert.equal(windowLit(0.95, 0.3), 0);
});
