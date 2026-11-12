// Night Session rules: turning the lo-fi engine's bar plans into a four-lane chart, judging
// hits, scoring. Pure (no DOM, no audio), tested in tests/rhythm.test.mjs. The UI lives in
// js/rhythm.js; the plans come from lofi.onPlan().

export const LANES = ["D", "F", "J", "K"];
export const KEY_TO_LANE = { d: 0, f: 1, j: 2, k: 3 };

/** Judgement windows in seconds (either side of the note). */
export const WINDOWS = Object.freeze({ perfect: 0.045, great: 0.09 });

/** No two notes in one lane closer than this (seconds): keeps the chart playable. */
export const MIN_GAP = 0.15;

/** Melody notes at or above this MIDI pitch go to the K lane, lower ones to J. */
export const HIGH_NOTE = 76;

/**
 * Lane for a lo-fi event, or -1 when the event is not charted.
 * Kick -> D, snare -> F, melody -> J (low) / K (high). Hats, ghosts, bass and chords stay
 * in the music only.
 */
export function laneFor(event, difficulty = "normal") {
  if (event.type === "kick") {
    // Easy keeps only the kicks on the beat.
    if (difficulty === "easy" && event.step % 4 !== 0) return -1;
    return 0;
  }
  if (event.type === "snare") return 1;
  if (event.type === "melody") {
    if (difficulty === "easy" && event.step % 4 !== 0) return -1;
    return (event.midi ?? 0) >= HIGH_NOTE ? 3 : 2;
  }
  return -1;
}

/**
 * Notes for one bar: [{ lane, time }] sorted by time. `lastTimes` (one per lane) carries the
 * previous note time across bars for the minimum gap and is updated in place.
 */
export function chartBar(events, { difficulty = "normal", lastTimes = [-Infinity, -Infinity, -Infinity, -Infinity] } = {}) {
  const notes = [];
  events
    .slice()
    .sort((a, b) => a.time - b.time)
    .forEach((event) => {
      const lane = laneFor(event, difficulty);
      if (lane < 0) return;
      if (event.time - lastTimes[lane] < MIN_GAP) return;
      lastTimes[lane] = event.time;
      notes.push({ lane, time: event.time });
    });
  return notes;
}

/** "perfect" | "great" | null for a hit `dt` seconds off its note. */
export function judge(dt) {
  const off = Math.abs(dt);
  if (off <= WINDOWS.perfect) return "perfect";
  if (off <= WINDOWS.great) return "great";
  return null;
}

/** The closest unjudged note in `lane` within the great window of `time`, or null. */
export function closestNote(notes, lane, time) {
  let best = null;
  let bestOff = Infinity;
  for (const note of notes) {
    if (note.lane !== lane || note.result) continue;
    const off = Math.abs(note.time - time);
    if (off <= WINDOWS.great && off < bestOff) {
      best = note;
      bestOff = off;
    }
  }
  return best;
}

/** Points for a judgement at a combo: perfect 300 / great 150, +10% per 10 combo (max x2). */
export function points(judgement, combo) {
  const base = judgement === "perfect" ? 300 : judgement === "great" ? 150 : 0;
  const multiplier = Math.min(2, 1 + Math.floor(combo / 10) * 0.1);
  return Math.round(base * multiplier);
}

/** Accuracy 0..1: perfect counts fully, great half. */
export function accuracy({ perfect = 0, great = 0, miss = 0 }) {
  const total = perfect + great + miss;
  return total ? (perfect + great * 0.5) / total : 0;
}

export function sessionRank(acc) {
  if (acc >= 0.95) return "S";
  if (acc >= 0.85) return "A";
  if (acc >= 0.7) return "B";
  return "C";
}
