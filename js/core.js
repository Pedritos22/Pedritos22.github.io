// Shared runtime contracts: event bus, global state, flags, media queries, moon phase.
// Every feature module talks to the others through this file instead of importing
// each other's internals.
import { hashString, dateKey } from "./proc/rng.js";

/* ------------------------------------------------------------------ events */

/**
 * Event names (detail payload in comments). Prefer these constants over strings.
 */
export const EVT = Object.freeze({
  INTRO_DONE: "intro:done",                 // {}            intro finished or skipped
  SECTION_WILL_CHANGE: "section:will-change", // {from, to, direction: 1 | -1, index}
  SECTION_CHANGED: "section:changed",       // {from, to, index}
  MENU_HOVER: "menu:hover",                 // {index, section}
  DARKHOUR: "darkhour",                     // {active}
  LOFI: "lofi",                             // {playing}
  GLASS_CRACK: "glass:crack",               // {element, stage: 1 | 2 | 3}
  GLASS_BREAK: "glass:break",               // {element, x, y}
  OBJECTION: "objection",                   // {}
  RESET: "reset"                            // {}  user pressed the reset button
});

const bus = new EventTarget();

export function emit(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Subscribe; returns an unsubscribe function. */
export function on(type, handler) {
  const listener = (event) => handler(event.detail);
  bus.addEventListener(type, listener);
  return () => bus.removeEventListener(type, listener);
}

export function once(type, handler) {
  const off = on(type, (detail) => {
    off();
    handler(detail);
  });
  return off;
}

/* ------------------------------------------------------------------- state */

/**
 * Small shared state. Owners write, everyone may read.
 *   introDone  -> intro.js       section   -> sections.js
 *   darkhour   -> darkhour.js
 */
export const state = {
  introDone: false,
  section: "home",
  darkhour: false
};

/** Run `handler` once the intro is done (immediately if it already is). */
export function afterIntro(handler) {
  if (state.introDone) {
    handler();
    return () => {};
  }
  return once(EVT.INTRO_DONE, handler);
}

/* ------------------------------------------------------------------- flags */

export const params = new URLSearchParams(window.location.search);

/**
 * Debug / QA flags:
 *   ?nointro   skip the intro        ?intro    force the intro
 *   ?darkhour  force Dark Hour       ?nofx     disable heavy background effects
 *   ?seed=abc  override the daily procedural seed
 */
export const flags = Object.freeze({
  nointro: params.has("nointro"),
  intro: params.has("intro"),
  darkhour: params.has("darkhour"),
  nofx: params.has("nofx"),
  seed: params.get("seed")
});

/* ----------------------------------------------------------- media queries */

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileQuery = window.matchMedia("(max-width: 920px)");

export const prefersReducedMotion = () => reducedQuery.matches;
export const isMobileLayout = () => mobileQuery.matches;

export function onReducedMotionChange(handler) {
  const listener = () => handler(reducedQuery.matches);
  reducedQuery.addEventListener("change", listener);
  return () => reducedQuery.removeEventListener("change", listener);
}

export function onLayoutChange(handler) {
  const listener = () => handler(mobileQuery.matches);
  mobileQuery.addEventListener("change", listener);
  return () => mobileQuery.removeEventListener("change", listener);
}

/* ------------------------------------------------------------------- seeds */

/** Daily seed (or ?seed= override) mixed with a label, for procedural content. */
export function daySeed(label = "") {
  const base = flags.seed ?? dateKey(new Date());
  return hashString(`${base}:${label}`);
}

/* -------------------------------------------------------------- moon phase */

const SYNODIC_MONTH = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const PHASE_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
];

/**
 * Astronomical moon phase for a date (accurate to well under a day).
 * phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
 * illumination: lit fraction 0..1. waxing: true while growing toward full.
 */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const phase = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const index = Math.floor(phase * 8 + 0.5) % 8;
  const daysToFull = ((0.5 - phase + 1) % 1) * SYNODIC_MONTH;
  const daysToNew = ((1 - phase) % 1) * SYNODIC_MONTH;
  return {
    phase,
    age,
    illumination,
    waxing: phase < 0.5,
    name: PHASE_NAMES[index],
    index,
    daysToFull,
    daysToNew
  };
}

/* ----------------------------------------------------------------- helpers */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Escape text for safe interpolation into innerHTML. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** requestAnimationFrame loop that pauses while the tab is hidden. Returns stop(). */
export function rafLoop(tick) {
  let frame = 0;
  let last = performance.now();
  let running = true;

  const step = (now) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick(dt, now / 1000);
    frame = requestAnimationFrame(step);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else if (running) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(step);

  return () => {
    running = false;
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
