// Intro: a clock ticks down to midnight, the hidden hour flashes green, the screen cracks
// from the centre and shatters into Voronoi shards that fall away to reveal the site.
// Plays once per session, skippable with any click, tap or key.
// Owner: HUD/overlays workstream (C).
import { EVT, emit, state, flags, prefersReducedMotion, isMobileLayout } from "./core.js";
import { gsap, EASE } from "./motion.js";
import { sfx } from "./sfx.js";
import { createCracks, shatterSurface } from "./shatter.js";

const SEEN_KEY = "p3:intro-seen";
const root = document.documentElement;

function shouldPlay() {
  if (flags.nointro) return false;
  if (flags.intro) return true;
  try {
    return !window.sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

const playing = shouldPlay();
// Defensive: cover the page as early as this module runs (the inline <head> script
// normally did this before first paint already).
if (playing) root.classList.add("intro-pending");

let overlay = null;
let surface = null;
let timeline = null;
let shards = null;
let cracks = null;
let broken = false;
let skipped = false;

function finish() {
  root.classList.remove("intro-pending");
  if (state.introDone) return;
  state.introDone = true;
  emit(EVT.INTRO_DONE, {});
}

/* ------------------------------------------------------------------ markup */

function dialMarkup() {
  let minor = "";
  let major = "";
  for (let i = 0; i < 60; i += 1) {
    const a = (i * Math.PI) / 30;
    const sin = Math.sin(a);
    const cos = -Math.cos(a);
    const isMajor = i % 5 === 0;
    const r0 = isMajor ? 84 : 89;
    const r1 = 94;
    const seg = `M${(sin * r0).toFixed(2)} ${(cos * r0).toFixed(2)} L${(sin * r1).toFixed(2)} ${(cos * r1).toFixed(2)} `;
    if (isMajor) major += seg;
    else minor += seg;
  }
  return `
    <svg class="intro-dial" viewBox="-120 -120 240 240" aria-hidden="true" focusable="false">
      <circle class="intro-halo" r="112" />
      <circle class="intro-ring" r="100" pathLength="1" />
      <circle class="intro-ring-inner" r="78" />
      <path class="intro-ticks-minor" d="${minor}" />
      <path class="intro-ticks-major" d="${major}" />
      <path class="intro-marker" d="M0 -104 L4.5 -111 L0 -118 L-4.5 -111 Z" />
      <g class="intro-hand intro-hand--hour"><path d="M-2.6 8 L-1.6 -46 L0 -50 L1.6 -46 L2.6 8 Z" /></g>
      <g class="intro-hand intro-hand--minute"><path d="M-1.6 10 L-0.9 -72 L0 -76 L0.9 -72 L1.6 10 Z" /></g>
      <g class="intro-hand intro-hand--second"><path d="M-0.7 20 L-0.45 -90 L0 -94 L0.45 -90 L0.7 20 Z" /><circle cy="14" r="3.2" /></g>
      <circle class="intro-pivot" r="4.2" />
      <circle class="intro-pivot-core" r="1.6" />
    </svg>`;
}

function buildOverlay({ reduced }) {
  const el = document.createElement("div");
  el.className = reduced ? "intro intro--reduced" : "intro";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="intro-surface">
      <div class="intro-clock">
        ${dialMarkup()}
        <p class="intro-readout"><span class="intro-hh">23</span><i>:</i><span class="intro-mm">59</span><i>:</i><span class="intro-ss">55</span></p>
      </div>
      ${reduced ? "" : '<p class="intro-skip">Press any key</p>'}
    </div>
    <div class="intro-flash"></div>`;
  return el;
}

/* ----------------------------------------------------------------- playback */

function setReadout(seconds) {
  const midnight = seconds >= 60;
  const set = (cls, value) => {
    const node = overlay?.querySelector(cls);
    if (node) node.textContent = value;
  };
  set(".intro-hh", midnight ? "00" : "23");
  set(".intro-mm", midnight ? "00" : "59");
  set(".intro-ss", String(midnight ? 0 : seconds).padStart(2, "0"));
}

function cleanup() {
  timeline?.kill();
  timeline = null;
  window.removeEventListener("pointerdown", onSkipPointer, true);
  window.removeEventListener("keydown", onSkipKey, true);
  overlay?.remove();
  overlay = null;
  surface = null;
}

function breakGlass({ fast = false } = {}) {
  if (broken || !overlay) return;
  broken = true;
  timeline?.kill();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const impact = [w / 2, h / 2 - (isMobileLayout() ? 0 : h * 0.02)];
  if (!cracks) {
    cracks = createCracks({ width: w, height: h, impact, count: isMobileLayout() ? 24 : 40, large: true, weight: 1.5 });
    surface.appendChild(cracks.svg);
  }
  cracks.showAll();
  cracks.flatten();

  shards = shatterSurface(surface, {
    cells: cracks.cells,
    impact: [...cracks.impact],
    zIndex: "var(--z-intro)",
    power: 1.35,
    gravity: 3000,
    life: 1.2,
    ripple: 0.2,
    baseSpeed: 260
  });
  // The live overlay disappears on the same frame the shards appear.
  overlay.classList.add("is-broken");
  gsap.set(overlay.querySelector(".intro-flash"), { opacity: 0 });
  sfx.glass();
  if (fast) shards.hurry(4.5);
  shards.done.then(cleanup);
  window.setTimeout(finish, fast ? 0 : 140);
}

function skip() {
  if (skipped) return;
  skipped = true;
  sfx.unlock?.();
  if (broken) shards?.hurry(4.5);
  else breakGlass({ fast: true });
  finish();
}

function onSkipPointer() {
  skip();
}

function onSkipKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return; // browser shortcuts
  event.preventDefault();
  event.stopPropagation();
  skip();
}

function play() {
  overlay = buildOverlay({ reduced: false });
  surface = overlay.querySelector(".intro-surface");
  document.body.appendChild(overlay);
  root.classList.remove("intro-pending");

  const q = (sel) => overlay.querySelector(sel);
  const ring = q(".intro-ring");
  const second = q(".intro-hand--second");
  const hour = q(".intro-hand--hour");
  const minute = q(".intro-hand--minute");
  const flash = q(".intro-flash");
  const clock = q(".intro-clock");

  gsap.set([hour], { rotation: -0.4, svgOrigin: "0 0" });
  gsap.set([minute], { rotation: -3, svgOrigin: "0 0" });
  gsap.set(second, { rotation: 330, svgOrigin: "0 0" });

  window.addEventListener("pointerdown", onSkipPointer, true);
  window.addEventListener("keydown", onSkipKey, true);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const impact = [w / 2, h / 2 - (isMobileLayout() ? 0 : h * 0.02)];

  const tl = gsap.timeline({ defaults: { ease: EASE.out } });
  timeline = tl;

  // 1. The dial assembles out of the dark.
  tl.fromTo(ring, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, ease: "power3.out" }, 0);
  tl.fromTo(q(".intro-ring-inner"), { opacity: 0, scale: 0.86, svgOrigin: "0 0" }, { opacity: 1, scale: 1, duration: 0.45 }, 0.08);
  tl.fromTo([q(".intro-ticks-minor"), q(".intro-ticks-major"), q(".intro-marker")], { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.05 }, 0.1);
  tl.fromTo([hour, minute, second, q(".intro-pivot"), q(".intro-pivot-core")], { opacity: 0 }, { opacity: 1, duration: 0.24, stagger: 0.035 }, 0.18);
  tl.fromTo(q(".intro-readout"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.32 }, 0.2);
  tl.fromTo(q(".intro-skip"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.35);

  // 2. Five ticks, each a little faster than the last, closing in on 0:00.
  const ticks = [0.52, 0.69, 0.84, 0.97, 1.08];
  ticks.forEach((t, i) => {
    tl.call(() => {
      sfx.tick();
      setReadout(56 + i);
    }, null, t);
    tl.to(second, { rotation: 336 + i * 6, duration: 0.1, ease: "back.out(3.2)", svgOrigin: "0 0" }, t);
  });
  tl.to(minute, { rotation: 0, duration: 0.1, ease: "back.out(3)", svgOrigin: "0 0" }, ticks[4]);
  tl.to(hour, { rotation: 0, duration: 0.1, ease: "back.out(3)", svgOrigin: "0 0" }, ticks[4]);

  // 3. Midnight: the hidden hour flashes green.
  const midnight = ticks[4];
  tl.call(() => {
    overlay?.classList.add("is-midnight");
    sfx.bell();
  }, null, midnight);
  tl.fromTo(flash, { opacity: 0 }, { opacity: 0.72, duration: 0.03, ease: "none" }, midnight);
  tl.to(flash, { opacity: 0, duration: 0.42, ease: "power2.out" }, midnight + 0.05);
  tl.fromTo(clock, { scale: 1 }, { scale: 1.04, duration: 0.07, ease: "power2.out", yoyo: true, repeat: 1 }, midnight);
  tl.to(q(".intro-skip"), { opacity: 0, duration: 0.2 }, midnight);

  // 4. Cracks run outward from the centre of the dial.
  tl.call(() => {
    cracks = createCracks({ width: w, height: h, impact, count: isMobileLayout() ? 24 : 40, large: true, weight: 1.5 });
    surface?.appendChild(cracks.svg);
    cracks.reveal(0.3, { duration: 0.16, spread: 0.12, glints: 2 });
    sfx.crack(2);
  }, null, midnight + 0.18);
  tl.call(() => {
    cracks?.reveal(1, { duration: 0.17, spread: 0.2, glints: 5 });
    sfx.crack(3);
  }, null, midnight + 0.34);

  // 5. The glass gives way.
  tl.call(() => breakGlass(), null, midnight + 0.82);
}

function playReduced() {
  overlay = buildOverlay({ reduced: true });
  surface = overlay.querySelector(".intro-surface");
  overlay.classList.add("is-midnight");
  setReadout(60);
  document.body.appendChild(overlay);
  root.classList.remove("intro-pending");
  finish();
  timeline = gsap.timeline();
  timeline.to(overlay, { opacity: 0, duration: 0.4, ease: "power1.out", delay: 0.12, onComplete: cleanup });
}

export function init() {
  // Called last by main.js, after every other module subscribed to INTRO_DONE.
  if (!playing) {
    root.classList.remove("intro-pending");
    requestAnimationFrame(finish);
    return;
  }
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the intro simply plays on this load.
  }
  try {
    if (prefersReducedMotion()) playReduced();
    else play();
  } catch (error) {
    console.error("[intro] failed, skipping", error);
    cleanup();
    finish();
  }
}
