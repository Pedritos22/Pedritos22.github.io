// Motion system: GSAP (vendored UMD build, loaded by index.html before the modules)
// plus the named easings and durations from DESIGN.md. Import from here, never from window.
const { gsap, SplitText, CustomEase } = window;

if (!gsap) {
  throw new Error("GSAP failed to load (vendor/gsap/gsap.min.js)");
}

gsap.registerPlugin(SplitText, CustomEase);

/** Durations in seconds (mirror --dur-1..4 in css/base.css). */
export const DUR = Object.freeze({
  micro: 0.12, // hover, press
  ui: 0.24,    // small UI changes, menus
  panel: 0.42, // section transitions, panels
  scene: 0.7   // hero entrances, intro beats
});

/** Named easings (mirror --ease-* in css/base.css). */
CustomEase.create("p3.snap", "0.86, 0, 0.07, 1");
CustomEase.create("p3.out", "0.16, 1, 0.3, 1");
CustomEase.create("p3.in", "0.7, 0, 0.84, 0");

export const EASE = Object.freeze({
  snap: "p3.snap",            // wipes, slams, things that cut across the screen
  out: "p3.out",              // entrances (expo-out)
  in: "p3.in",                // exits
  spring: "back.out(1.7)",    // playful overshoot: cursor, cards settling
  elastic: "elastic.out(1, 0.55)"
});

/** Stagger between cascaded items (seconds). */
export const STAGGER = 0.035;

gsap.defaults({ ease: EASE.out, duration: DUR.ui, overwrite: "auto" });

export { gsap, SplitText, CustomEase };

/* ------------------------------------------------------- Web Animations */

// Section transitions run on the Web Animations API: transform and opacity animations then
// run on the compositor (Firefox and Chromium), so the main-thread work of a content swap
// cannot stall them. GSAP stays for everything else.

const springCss = "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938, 1.077 20.4%, 1.121, 1.149 24.3%, 1.159, 1.163 27%, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991 46.9%, 0.977 50.1%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)";

function supportsEasing(easing) {
  try {
    document.createElement("i").animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, easing }).cancel();
    return true;
  } catch {
    return false;
  }
}

/** CSS easings for element.animate() (mirror --ease-* in css/base.css; power* match GSAP). */
export const CSS_EASE = Object.freeze({
  snap: "cubic-bezier(0.86, 0, 0.07, 1)",
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "cubic-bezier(0.7, 0, 0.84, 0)",
  // linear() needs Firefox 112 / Chrome 113 / Safari 17.2; back-out is the closest fallback.
  spring: supportsEasing(springCss) ? springCss : "cubic-bezier(0.34, 1.56, 0.64, 1)",
  power1In: "cubic-bezier(0.11, 0, 0.5, 0)",
  power2Out: "cubic-bezier(0.33, 1, 0.68, 1)",
  power2InOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  linear: "linear"
});

const canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

/** True when element.animate() exists (every current browser). */
export const hasWaapi = canAnimate;

/**
 * element.animate() with the site's units: `duration`/`delay` in seconds, `ease` a CSS_EASE
 * name (or any CSS easing). Returns the Animation, or null when WAAPI is missing.
 */
export function animate(element, keyframes, { duration = DUR.ui, delay = 0, ease = "out", fill = "backwards", ...rest } = {}) {
  if (!canAnimate || !element) return null;
  return element.animate(keyframes, {
    duration: Math.max(0, duration * 1000),
    delay: delay * 1000,
    easing: CSS_EASE[ease] ?? ease,
    fill,
    ...rest
  });
}

/**
 * Entrance "from" a state: one keyframe at offset 0, so the animation ends on whatever the
 * element shows at rest (opacity 0.6 stays 0.6). Moves use the individual `translate` and
 * `scale` properties, which stack under an element's own CSS transform (the -8deg watermark
 * keeps its rotation). `fill: backwards` hides it during the delay, and nothing is left
 * behind when it finishes.
 */
export function enterFrom(element, { x = 0, y = 0, opacity = 0, scale = null } = {}, timing = {}) {
  const from = { offset: 0, opacity };
  const tx = typeof x === "number" ? `${x}px` : x;
  const ty = typeof y === "number" ? `${y}px` : y;
  if (x || y) from.translate = `${tx} ${ty}`;
  if (scale !== null) from.scale = String(scale);
  return animate(element, [from], timing);
}

/** Resolves once every animation has finished; never rejects (cancelled ones count as done). */
export function allFinished(animations) {
  return Promise.all(animations.filter(Boolean).map((a) => a.finished.catch(() => null)));
}
