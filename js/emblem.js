// Atmosphere workstream (A): the moon clock emblem rendered into .emblem-mount.
// A real-phase moon at the centre, procedural clock rings around it and real-time hands.
// Every moving part is its own element so rotation stays on the compositor:
//   - hands: Web Animations synced to the wall clock (no per-frame JS),
//   - bezel: a very slow idle spin,
//   - rings: GSAP snap-rotations to a dial position per section.
import {
  EVT, on, state, afterIntro, params, prefersReducedMotion, onReducedMotionChange,
  daySeed, moonPhase, clamp
} from "./core.js";
import { gsap, DUR, EASE, STAGGER } from "./motion.js";
import { moonSvg } from "./fx/moon-art.js";
import { MOON_R, outerRingSvg, bezelSvg, dialSvg, innerRingSvg, handSvg } from "./fx/dial-art.js";

/** Dial position (degrees) of each snapping ring, per section index (home, about, ...). */
const SNAP = {
  outer: [0, 34, -48, 72, -20, 104],
  bezel: [0, -56, 40, -112, 76, -150],
  inner: [0, 24, -48, 72, -24, 120]
};
const PERIOD = { second: 60, minute: 3600, hour: 43200 }; // seconds per revolution
const BEZEL_SPIN = 240; // seconds per idle revolution

let mount = null;
let root = null;
const parts = {};
const handAnims = {};
let bezelSpin = null;
let reduced = false;
let entered = false;
let darkActive = false;
let sectionIndex = 0;
let phaseValue = 0;
let phaseTimer = 0;

/* ------------------------------------------------------------------- build */

function layer(className, html = "") {
  const div = document.createElement("div");
  div.className = `emb-layer ${className}`;
  div.innerHTML = html;
  root.append(div);
  return div;
}

function currentPhase() {
  const override = Number.parseFloat(params.get("moonphase"));
  return Number.isFinite(override) ? ((override % 1) + 1) % 1 : moonPhase().phase;
}

function build() {
  const seed = daySeed("emblem");
  root = document.createElement("div");
  root.className = "emblem";
  mount.replaceChildren(root);

  parts.halo = layer("emb-halo");
  parts.outer = layer("emb-ring emb-ring--outer", outerRingSvg(seed));
  parts.bezel = layer("emb-ring emb-ring--bezel", `<div class="emb-spin">${bezelSvg(seed)}</div>`);
  parts.spin = parts.bezel.firstElementChild;
  parts.dial = layer("emb-ring emb-ring--dial", dialSvg(seed));
  parts.inner = layer("emb-ring emb-ring--inner", innerRingSvg(seed));

  phaseValue = currentPhase();
  parts.moon = layer("emb-moon");
  parts.moonDay = document.createElement("div");
  parts.moonDay.className = "emb-moon__face emb-moon__face--day";
  parts.moonDay.innerHTML = moonSvg({ phase: phaseValue, R: MOON_R, uid: "emb-day" });
  parts.moonDark = document.createElement("div");
  parts.moonDark.className = "emb-moon__face emb-moon__face--dark";
  parts.moonDark.innerHTML = moonSvg({ phase: 0.5, R: MOON_R, variant: "dark", uid: "emb-dark" });
  parts.moon.append(parts.moonDay, parts.moonDark);

  ["hour", "minute", "second"].forEach((kind) => {
    const pivot = document.createElement("div");
    pivot.className = `emb-pivot emb-pivot--${kind}`;
    const hand = document.createElement("div");
    hand.className = `emb-hand emb-hand--${kind}`;
    hand.innerHTML = handSvg(kind);
    pivot.append(hand);
    root.append(pivot);
    parts[`${kind}Pivot`] = pivot;
    parts[`${kind}Hand`] = hand;
  });
}

/* ------------------------------------------------------------------- clock */

/** Seconds elapsed in each hand's revolution, from local wall-clock time. */
function clockSeconds(now = new Date()) {
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  return { second: s, minute: m * 60, hour: h * 3600 };
}

function handAngle(kind) {
  const secs = clockSeconds();
  return (secs[kind] / PERIOD[kind]) * 360;
}

function startHands() {
  const secs = clockSeconds();
  ["hour", "minute", "second"].forEach((kind) => {
    handAnims[kind]?.cancel();
    const anim = parts[`${kind}Hand`].animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: PERIOD[kind] * 1000, iterations: Infinity, easing: "linear" }
    );
    anim.currentTime = secs[kind] * 1000;
    if (darkActive) anim.pause();
    handAnims[kind] = anim;
  });
}

/** Re-align the running hand animations with the wall clock (tab wake, DST, sleep). */
function resyncHands() {
  if (darkActive) return;
  const secs = clockSeconds();
  Object.entries(handAnims).forEach(([kind, anim]) => {
    if (anim) anim.currentTime = secs[kind] * 1000;
  });
}

function startBezelSpin() {
  bezelSpin?.cancel();
  bezelSpin = null;
  if (reduced) return;
  bezelSpin = parts.spin.animate(
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    { duration: BEZEL_SPIN * 1000, iterations: Infinity, easing: "linear" }
  );
  if (darkActive) bezelSpin.pause();
}

/** Re-render the moon face when the phase moved enough to show (checked hourly). */
function refreshPhase() {
  const next = currentPhase();
  if (Math.abs(next - phaseValue) < 0.004) return;
  phaseValue = next;
  parts.moonDay.innerHTML = moonSvg({ phase: phaseValue, R: MOON_R, uid: "emb-day" });
}

/* ---------------------------------------------------------------- entrance */

function enter() {
  if (entered || !root) return;
  entered = true;
  const rings = [parts.outer, parts.bezel, parts.dial, parts.inner];

  if (reduced) {
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "none" });
    return;
  }

  const pivots = [parts.hourPivot, parts.minutePivot, parts.secondPivot];
  const tl = gsap.timeline({ defaults: { ease: EASE.out } });
  tl.set(root, { autoAlpha: 1 })
    .fromTo(parts.halo, { autoAlpha: 0, scale: 0.55 }, { autoAlpha: 1, scale: darkActive ? 1.28 : 1, duration: DUR.scene * 1.6 }, 0)
    .fromTo(parts.moon, { autoAlpha: 0, scale: 0.82 }, { autoAlpha: 1, scale: darkActive ? 1.2 : 1, duration: DUR.scene * 1.3 }, 0.05)
    .fromTo(
      rings,
      { autoAlpha: 0, scale: 1.08, rotation: (i) => (i % 2 ? 40 : -40) },
      {
        autoAlpha: 1,
        scale: 1,
        rotation: (i) => (i === 2 ? 0 : SNAP[["outer", "bezel", "", "inner"][i]]?.[sectionIndex] ?? 0),
        duration: DUR.scene * 1.4,
        stagger: STAGGER * 2.4
      },
      0.12
    )
    .fromTo(pivots, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.ui, stagger: STAGGER }, 0.3);

  // Hands sweep in from XII to the real time (or stay on XII in the Dark Hour).
  if (!darkActive) {
    pivots.forEach((pivot, i) => {
      const kind = ["hour", "minute", "second"][i];
      tl.fromTo(pivot, { rotation: -handAngle(kind) }, { rotation: 0, duration: DUR.scene * 1.8, ease: EASE.snap }, 0.3 + i * STAGGER);
    });
  }
}

/* --------------------------------------------------------------- reactions */

function onSectionWillChange({ index = 0, direction = 1 } = {}) {
  sectionIndex = clamp(index | 0, 0, SNAP.outer.length - 1);
  if (!entered || !root) return;
  const set = (target, angle) => {
    if (reduced) gsap.set(target, { rotation: angle });
    else gsap.to(target, { rotation: angle, duration: DUR.panel * 1.35, ease: EASE.snap, overwrite: "auto" });
  };
  set(parts.outer, SNAP.outer[sectionIndex]);
  set(parts.bezel, SNAP.bezel[sectionIndex]);
  set(parts.inner, SNAP.inner[sectionIndex]);
  if (!reduced) {
    // A small mechanical kick on the dial face, in the direction of travel.
    gsap.fromTo(parts.dial, { rotation: 2 * direction }, { rotation: 0, duration: DUR.panel, ease: EASE.spring, overwrite: "auto" });
  }
}

function setDark(active, animate = true) {
  darkActive = active;
  if (!root) return;
  root.classList.toggle("is-dark", active);
  const instant = !animate || reduced || !entered;
  const dur = instant ? 0 : 1;

  gsap.to(parts.moonDark, { autoAlpha: active ? 1 : 0, duration: instant ? 0 : (reduced ? 0.2 : DUR.scene * 1.4), ease: "none", overwrite: "auto" });
  gsap.to(parts.moonDay, { autoAlpha: active ? 0 : 1, duration: instant ? 0 : (reduced ? 0.2 : DUR.scene * 1.4), ease: "none", overwrite: "auto" });
  if (!reduced) {
    gsap.to(parts.moon, { scale: active ? 1.2 : 1, duration: dur * 2.2, ease: EASE.out, overwrite: "auto" });
    gsap.to(parts.halo, { scale: active ? 1.28 : 1, duration: dur * 2.4, ease: EASE.out, overwrite: "auto" });
  }

  const kinds = ["hour", "minute", "second"];
  if (active) {
    // Time stops: every hand rushes forward to XII and freezes there.
    bezelSpin?.pause();
    kinds.forEach((kind, i) => {
      handAnims[kind]?.pause();
      const angle = handAngle(kind);
      const pivot = parts[`${kind}Pivot`];
      const target = 360 - angle;
      if (instant) gsap.set(pivot, { rotation: target });
      else gsap.to(pivot, { rotation: target, duration: 1.6 + i * 0.12, ease: EASE.snap, overwrite: "auto" });
    });
  } else {
    // Time resumes: hands sweep from XII back to the real time.
    if (!reduced) bezelSpin?.play();
    startHands();
    kinds.forEach((kind, i) => {
      const pivot = parts[`${kind}Pivot`];
      if (instant) gsap.set(pivot, { rotation: 0 });
      else gsap.fromTo(pivot, { rotation: -handAngle(kind) }, { rotation: 0, duration: 1.4 + i * 0.1, ease: EASE.snap, overwrite: "auto" });
    });
  }
}

/* ---------------------------------------------------------------- lifecycle */

export function init() {
  mount = document.querySelector(".emblem-mount");
  if (!mount) return;
  reduced = prefersReducedMotion();
  build();
  gsap.set(root, { autoAlpha: 0 });

  darkActive = state.darkhour;
  startHands();
  startBezelSpin();
  if (darkActive) setDark(true, false);
  root.classList.toggle("is-reduced", reduced);

  afterIntro(enter);

  on(EVT.SECTION_WILL_CHANGE, onSectionWillChange);
  on(EVT.DARKHOUR, ({ active }) => {
    if (Boolean(active) !== darkActive) setDark(Boolean(active), true);
  });
  onReducedMotionChange((value) => {
    reduced = value;
    root.classList.toggle("is-reduced", reduced);
    startBezelSpin();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      resyncHands();
      refreshPhase();
    }
  });
  window.clearInterval(phaseTimer);
  phaseTimer = window.setInterval(refreshPhase, 3600 * 1000);
}
