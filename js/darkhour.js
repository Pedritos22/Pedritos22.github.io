// Dark Hour: the hidden hour between one day and the next. On automatically from 00:00
// to 00:59 local time, forced by ?darkhour, toggled by knocking on the HUD clock three
// times. Entering and leaving play a green flash + tint sweep across the screen.
// Owner: HUD/overlays workstream (C).
import { EVT, emit, on, flags, state, prefersReducedMotion, now as worldNow } from "./core.js";
import { gsap, EASE } from "./motion.js";
import { sfx } from "./sfx.js";

const CHECK_MS = 30000;
const KNOCKS = 3;
const KNOCK_WINDOW_MS = 1500;

let manual = null; // null = follow the clock; true / false = user override
let scheduled = false;
let knocks = [];
let sweep = null;
let sweepTl = null;

// The world clock: real time, or wherever the time dial has moved it.
const isScheduledNow = (date = worldNow()) => date.getHours() === 0;

function apply(active, { animate = true } = {}) {
  const next = Boolean(active);
  if (state.darkhour === next) return;
  if (animate && document.body) playSweep(next);
  state.darkhour = next;
  document.documentElement.toggleAttribute("data-darkhour", next);
  emit(EVT.DARKHOUR, { active: next });
}

function resolve(options) {
  apply(manual ?? scheduled, options);
}

/* ------------------------------------------------------------------- sweep */

function ensureSweep() {
  if (sweep) return sweep;
  sweep = document.createElement("div");
  sweep.className = "dh-sweep";
  sweep.setAttribute("aria-hidden", "true");
  sweep.innerHTML = '<div class="dh-sweep-flash"></div><div class="dh-sweep-band"></div>';
  document.body.appendChild(sweep);
  return sweep;
}

function playSweep(entering) {
  const el = ensureSweep();
  const flash = el.firstElementChild;
  const band = el.lastElementChild;
  sweepTl?.kill();
  el.classList.toggle("is-leaving", !entering);

  if (prefersReducedMotion()) {
    sweepTl = gsap.timeline({ onComplete: () => gsap.set(el, { autoAlpha: 0 }) });
    sweepTl.set(el, { autoAlpha: 1 }).set(band, { autoAlpha: 0 });
    sweepTl.fromTo(flash, { opacity: 0.35 }, { opacity: 0, duration: 0.2, ease: "none" });
    return;
  }

  // Enter sweeps left -> right, leave sweeps back right -> left.
  const from = entering ? -1 : 1;
  sweepTl = gsap.timeline({ onComplete: () => gsap.set(el, { autoAlpha: 0 }) });
  sweepTl.set(el, { autoAlpha: 1 });
  sweepTl.fromTo(flash, { opacity: 0 }, { opacity: entering ? 0.62 : 0.4, duration: 0.05, ease: "none" }, 0);
  sweepTl.to(flash, { opacity: 0, duration: 0.55, ease: "power2.out" }, 0.07);
  sweepTl.fromTo(band, { xPercent: from * 140, autoAlpha: 1 }, { xPercent: -from * 140, duration: 0.7, ease: EASE.snap }, 0);
}

/* ---------------------------------------------------------------- triggers */

/** Toggle Dark Hour by hand (the secret trigger, or tools). */
export function setDarkHour(active) {
  manual = Boolean(active);
  resolve();
}

export function isDarkHour() {
  return state.darkhour;
}

/**
 * One knock on the HUD clock. Three knocks within 1.5 s toggle the Dark Hour.
 * Returns true when this knock flipped it.
 */
export function knock() {
  const now = performance.now();
  knocks = knocks.filter((t) => now - t < KNOCK_WINDOW_MS);
  knocks.push(now);
  if (knocks.length < KNOCKS) return false;
  knocks = [];
  sfx.bell();
  setDarkHour(!state.darkhour);
  return true;
}

function checkClock() {
  const now = isScheduledNow();
  if (now === scheduled) return;
  scheduled = now;
  // Crossing 00:00 or 01:00 hands control back to the clock.
  manual = null;
  if (now) sfx.bell();
  resolve();
}

export function init() {
  scheduled = isScheduledNow();
  if (flags.darkhour) manual = true;
  // Already true at load: no flash, the page simply opens in the Dark Hour.
  resolve({ animate: false });

  window.setInterval(checkClock, CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkClock();
  });

  on(EVT.RESET, () => {
    manual = null;
    knocks = [];
    resolve();
  });
  // Dialling the clock into (or out of) the hidden hour opens (or closes) it.
  on(EVT.TIME, ({ transient }) => {
    if (!transient) checkClock();
  });
}
