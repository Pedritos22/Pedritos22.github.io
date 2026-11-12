import test from "node:test";
import assert from "node:assert/strict";
import {
  laneFor, chartBar, judge, closestNote, points, accuracy, sessionRank, MIN_GAP, WINDOWS
} from "../js/rhythm-logic.js";

test("lanes: kick D, snare F, melody J/K by pitch; the rest is not charted", () => {
  assert.equal(laneFor({ type: "kick", step: 0 }), 0);
  assert.equal(laneFor({ type: "snare", step: 4 }), 1);
  assert.equal(laneFor({ type: "melody", step: 2, midi: 72 }), 2);
  assert.equal(laneFor({ type: "melody", step: 2, midi: 79 }), 3);
  for (const type of ["hat", "ghost", "bass", "chord"]) assert.equal(laneFor({ type, step: 0 }), -1);
});

test("easy keeps kicks and melody on the beat only", () => {
  assert.equal(laneFor({ type: "kick", step: 10 }, "easy"), -1);
  assert.equal(laneFor({ type: "kick", step: 8 }, "easy"), 0);
  assert.equal(laneFor({ type: "melody", step: 6, midi: 70 }, "easy"), -1);
  assert.equal(laneFor({ type: "snare", step: 12 }, "easy"), 1);
});

test("chartBar sorts, thins each lane and carries the gap across bars", () => {
  const lastTimes = [-Infinity, -Infinity, -Infinity, -Infinity];
  const notes = chartBar(
    [
      { type: "snare", step: 4, time: 1.0 },
      { type: "kick", step: 0, time: 0.25 },
      { type: "kick", step: 1, time: 0.3 }, // too close to the previous kick
      { type: "hat", step: 0, time: 0.25 },
      { type: "melody", step: 2, time: 0.5, midi: 80 }
    ],
    { lastTimes }
  );
  assert.deepEqual(notes.map((n) => [n.lane, n.time]), [[0, 0.25], [3, 0.5], [1, 1.0]]);
  const next = chartBar([{ type: "snare", step: 0, time: 1.0 + MIN_GAP / 2 }], { lastTimes });
  assert.equal(next.length, 0);
});

test("judge windows", () => {
  assert.equal(judge(0), "perfect");
  assert.equal(judge(-WINDOWS.perfect), "perfect");
  assert.equal(judge(0.06), "great");
  assert.equal(judge(-0.09), "great");
  assert.equal(judge(0.1), null);
});

test("closestNote picks the nearest unjudged note in the lane", () => {
  const notes = [
    { lane: 1, time: 1.0 },
    { lane: 1, time: 1.08, result: "great" },
    { lane: 1, time: 1.06 },
    { lane: 2, time: 1.05 }
  ];
  assert.equal(closestNote(notes, 1, 1.05), notes[2]);
  assert.equal(closestNote(notes, 1, 1.5), null);
  assert.equal(closestNote(notes, 3, 1.05), null);
});

test("points, accuracy, rank", () => {
  assert.equal(points("perfect", 0), 300);
  assert.equal(points("great", 25), 180);
  assert.equal(points("perfect", 200), 600);
  assert.equal(points(null, 5), 0);
  assert.equal(accuracy({ perfect: 8, great: 2, miss: 0 }), 0.9);
  assert.equal(accuracy({}), 0);
  assert.equal(sessionRank(0.96), "S");
  assert.equal(sessionRank(0.9), "A");
  assert.equal(sessionRank(0.75), "B");
  assert.equal(sessionRank(0.2), "C");
});
