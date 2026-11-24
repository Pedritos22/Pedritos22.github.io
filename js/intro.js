// Intro: surfacing. The visit starts deep under the water, the mirror of the descent below
// the menu: the real water shader at full depth, bubbles rising past, light coming down from
// far above, and a depth gauge counting from 400 m to the surface. At 0 m the waterline
// sweeps down the screen and the pause menu comes up behind it.
// Plays once per session (about 3 s); any click, key or scroll skips it.
// Owner: HUD/overlays workstream (C).
import { EVT, emit, state, flags, prefersReducedMotion } from "./core.js";
import { gsap } from "./motion.js";
import { sfx } from "./sfx.js";
import { t } from "./i18n.js";

const SEEN_KEY = "p3:intro-seen";
const START_DEPTH_M = 400;
const ASCENT_S = 2.2;
const SWEEP_S = 0.8;
const root = document.documentElement;

function shouldPlay() {
  if (flags.nointro) return false;
  if (flags.intro) return true;
  // A deep link (#projects) is someone who came for that section: no intro.
  if (window.location.hash.length > 1) return false;
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
let timeline = null;
let surfaced = false;
const ascent = { d: 1 }; // 1 = 400 m down, 0 = the surface

function finish() {
  root.classList.remove("intro-pending", "intro-playing", "intro-deep");
  if (state.introDone) return;
  state.introDone = true;
  emit(EVT.INTRO_DONE, {});
}

/* ------------------------------------------------------------------ markup */

function bubblesMarkup(count) {
  // Fixed pseudo-random spread (the intro is the same every time; no Math.random needed).
  return Array.from({ length: count }, (_, i) => {
    const x = (i * 37 + 11) % 100;
    const size = 3 + ((i * 7) % 9);
    const dur = 2.6 + ((i * 13) % 17) / 10;
    const delay = -((i * 29) % 30) / 10;
    const drift = ((i % 2 ? 1 : -1) * (6 + ((i * 5) % 14)));
    return `<i style="--x:${x}%;--size:${size}px;--dur:${dur}s;--delay:${delay}s;--drift:${drift}px"></i>`;
  }).join("");
}

function scaleMarkup() {
  const marks = [];
  for (let m = 0; m <= START_DEPTH_M; m += 25) {
    marks.push(`<li class="${m % 100 === 0 ? "is-major" : ""}" style="--m:${m}">${m % 100 === 0 ? `<span>${m}</span>` : ""}</li>`);
  }
  return `<ol class="intro-scale" role="list">${marks.join("")}</ol>`;
}

function buildOverlay() {
  const el = document.createElement("div");
  el.className = "intro";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="intro-water">
      <div class="intro-tint"></div>
      <div class="intro-rays"><i></i><i></i><i></i><i></i></div>
      <div class="intro-bubbles">${bubblesMarkup(22)}</div>
      ${scaleMarkup()}
      <div class="intro-gauge">
        <p class="intro-kicker"><span class="intro-kicker__text">${t("intro.surfacing")}</span></p>
        <p class="intro-depth"><span class="intro-depth__value">${START_DEPTH_M}</span><span class="intro-depth__unit">m</span></p>
        <span class="intro-meter"><i></i></span>
      </div>
      <p class="intro-skip">${t("intro.skip")}</p>
    </div>
    <svg class="intro-line" aria-hidden="true" focusable="false" preserveAspectRatio="none"><path /></svg>`;
  return el;
}

/* ----------------------------------------------------------------- playback */

/** Everything that follows the depth: the shader, the tint, the light, the gauge. */
function applyDepth() {
  const d = ascent.d;
  emit(EVT.DIVE, { depth: d, preview: true });
  if (!overlay) return;
  overlay.style.setProperty("--d", d.toFixed(4));
  const value = overlay.querySelector(".intro-depth__value");
  const metres = String(Math.round(START_DEPTH_M * d));
  if (value && value.textContent !== metres) value.textContent = metres;
}

/**
 * The waterline at `cut` (0..1 of the screen height): a wave across the screen. Below it is
 * still water (the overlay), above it the air (the page). Returns the polygon for the clip.
 */
function waterline(cut, phase) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const amp = Math.min(12, h * 0.015) * (1 - Math.abs(cut - 0.5));
  const steps = 32;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * w;
    // The line leans on the counter angle (tan 4deg ~ 0.07), like every plate on the page.
    const tilt = -(x - w / 2) * 0.07;
    const y = cut * h + tilt + Math.sin(i * 0.55 + phase) * amp + Math.sin(i * 0.21 - phase * 0.7) * amp * 0.6;
    points.push([x, y]);
  }
  const line = overlay?.querySelector(".intro-line");
  if (line) {
    line.setAttribute("viewBox", `0 0 ${w} ${h}`);
    line.querySelector("path").setAttribute("d", `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`);
  }
  const poly = [...points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`), `${w}px ${h}px`, `0px ${h}px`];
  return `polygon(${poly.join(", ")})`;
}

/** 0 m: the waterline runs down the screen and the page comes up behind it. */
function breakSurface({ fast = false } = {}) {
  if (surfaced || !overlay) return;
  surfaced = true;
  timeline?.kill();
  window.removeEventListener("pointerdown", onSkip, true);
  window.removeEventListener("keydown", onSkipKey, true);
  window.removeEventListener("wheel", onSkip, true);

  ascent.d = 0;
  applyDepth();
  root.classList.remove("intro-deep");
  overlay.classList.add("is-surfacing");
  const kicker = overlay.querySelector(".intro-kicker__text");
  if (kicker) kicker.textContent = t("intro.surface");
  sfx.whoosh();

  const water = overlay.querySelector(".intro-water");
  const sweep = { cut: 0, phase: 0 };
  timeline = gsap.timeline({ onComplete: cleanup });
  timeline.to(sweep, {
    cut: 1.12,
    phase: 5,
    duration: fast ? SWEEP_S * 0.45 : SWEEP_S,
    ease: "power2.in",
    onUpdate: () => {
      if (water) water.style.clipPath = waterline(sweep.cut, sweep.phase);
    }
  });
  timeline.to(overlay.querySelector(".intro-line"), { opacity: 0, duration: 0.2, ease: "none" }, ">-0.12");
  // The page enters as the line passes the menu.
  window.setTimeout(finish, fast ? 0 : SWEEP_S * 250);
}

function cleanup() {
  timeline?.kill();
  timeline = null;
  overlay?.remove();
  overlay = null;
}

function skip() {
  sfx.unlock?.();
  if (surfaced) {
    timeline?.timeScale(3);
    return;
  }
  breakSurface({ fast: true });
  finish();
}

function onSkip() {
  skip();
}

function onSkipKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return; // browser shortcuts
  event.preventDefault();
  event.stopPropagation();
  skip();
}

function play() {
  overlay = buildOverlay();
  document.body.appendChild(overlay);
  root.classList.add("intro-playing", "intro-deep");
  root.classList.remove("intro-pending");

  window.addEventListener("pointerdown", onSkip, true);
  window.addEventListener("keydown", onSkipKey, true);
  window.addEventListener("wheel", onSkip, { capture: true, passive: true });

  const q = (sel) => overlay.querySelector(sel);
  ascent.d = 1;
  applyDepth();

  const tl = gsap.timeline();
  timeline = tl;
  // 1. Out of the dark: the gauge, then the light far above.
  tl.fromTo(q(".intro-gauge"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.1);
  tl.fromTo(q(".intro-scale"), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "none" }, 0.2);
  tl.fromTo(q(".intro-skip"), { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "none" }, 0.5);
  // 2. The ascent: slow off the bottom, fast through the middle, easing into the light.
  tl.to(ascent, { d: 0, duration: ASCENT_S, ease: "power2.inOut", onUpdate: applyDepth }, 0.35);
  tl.to(q(".intro-skip"), { opacity: 0, duration: 0.2, ease: "none" }, 0.35 + ASCENT_S - 0.3);
  // 3. The surface.
  tl.call(() => breakSurface(), null, 0.35 + ASCENT_S);
}

function playReduced() {
  overlay = buildOverlay();
  overlay.classList.add("intro--reduced", "is-surfacing");
  document.body.appendChild(overlay);
  root.classList.remove("intro-pending");
  ascent.d = 0;
  applyDepth();
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
