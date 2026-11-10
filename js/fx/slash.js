// The red diagonal slash and the section-change light sweep (DOM layer in .fx-root).
// Crisp, transform/opacity-only animation, fired on SECTION_WILL_CHANGE in sync with the
// panel wipe (same duration and easing, DUR.panel / EASE.snap).
import { EVT, on, prefersReducedMotion } from "../core.js";
import { gsap, DUR, EASE } from "../motion.js";

let slash = null;
let sweep = null;
let timeline = null;

/** Sweep timing, shared with the WebGL light band in background.js. */
export const SWEEP_DURATION = DUR.panel * 1.15;
/** Leading edge offset from the sweep's origin, as a fraction of the viewport width. */
export const SWEEP_EDGE = 0.126;

/**
 * Start/end x (px) of the sweep wrapper for a direction. The band (28vw, centred on the
 * wrapper) is rotated by the major angle, so add the projected half-height to clear both edges.
 */
export function sweepPath(dir, vw = window.innerWidth, vh = window.innerHeight) {
  const half = 0.14 * vw + Math.tan((8 * Math.PI) / 180) * 0.66 * vh + 24;
  return dir > 0 ? { from: -half, to: vw + half } : { from: vw + half, to: -half };
}

function build(root) {
  slash = document.createElement("div");
  slash.className = "fx-slash";
  slash.innerHTML = `
    <i class="fx-slash__echo"></i>
    <i class="fx-slash__bar"></i>
    <i class="fx-slash__glint"></i>
    <i class="fx-slash__hair"></i>`;

  sweep = document.createElement("div");
  sweep.className = "fx-sweep";
  sweep.innerHTML = `
    <div class="fx-sweep__inner">
      <i class="fx-sweep__trail"></i>
      <i class="fx-sweep__band"></i>
      <i class="fx-sweep__edge"></i>
    </div>`;

  root.append(sweep, slash);
}

function play(detail = {}) {
  if (!slash || prefersReducedMotion()) return;
  const dir = (detail.direction ?? 1) >= 0 ? 1 : -1;
  const bar = slash.querySelector(".fx-slash__bar");
  const glint = slash.querySelector(".fx-slash__glint");
  const echo = slash.querySelector(".fx-slash__echo");
  const sweepTrail = sweep.querySelector(".fx-sweep__trail");

  timeline?.kill();
  const { from: fromX, to: toX } = sweepPath(dir);

  timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
  timeline
    .set(sweep, { x: fromX, autoAlpha: 1, attr: { "data-dir": dir } })
    .to(sweep, { x: toX, duration: SWEEP_DURATION, ease: EASE.snap }, 0)
    .fromTo(sweepTrail, { scaleX: 0.2 }, { scaleX: 1, duration: DUR.panel * 0.6, ease: EASE.out }, 0)
    .set(sweep, { autoAlpha: 0 })
    // The slash itself: a hot glint runs down the blade, the blade kicks and leaves an echo.
    .fromTo(glint, { yPercent: -120, autoAlpha: 1 }, { yPercent: 520, duration: DUR.panel * 0.8, ease: EASE.snap }, 0.04)
    .set(glint, { autoAlpha: 0 }, 0.04 + DUR.panel * 0.8)
    // Delayed tweens must not render their "from" state before they start.
    .fromTo(bar, { scaleX: 2 }, { scaleX: 1, duration: DUR.scene * 0.5, ease: EASE.out, immediateRender: false }, DUR.panel * 0.38)
    .fromTo(
      echo,
      { x: 0, autoAlpha: 0.7 },
      { x: 26 * dir, autoAlpha: 0, duration: DUR.panel * 1.1, ease: EASE.out, immediateRender: false },
      DUR.panel * 0.38
    );
}

export function initSlash(root) {
  if (!root || slash) return;
  build(root);
  on(EVT.SECTION_WILL_CHANGE, play);
}
