// The red diagonal slash and the section-change light sweep (DOM layer in .fx-root).
// Crisp, transform/opacity-only animation, fired on SECTION_WILL_CHANGE in sync with the
// panel wipe (same duration and easing, DUR.panel / EASE.snap). Web Animations, so the
// full-screen band keeps moving on the compositor while the card swaps its content.
import { EVT, on, prefersReducedMotion } from "../core.js";
import { DUR, animate } from "../motion.js";

let slash = null;
let sweep = null;
let running = [];

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

  running.forEach((animation) => animation.cancel());
  const { from: fromX, to: toX } = sweepPath(dir);
  sweep.dataset.dir = String(dir);
  const kick = DUR.panel * 0.38;

  running = [
    // The sweep is visible only while it runs (hidden in CSS at rest).
    animate(
      sweep,
      [
        { transform: `translateX(${fromX}px)`, visibility: "visible" },
        { transform: `translateX(${toX}px)`, visibility: "visible" }
      ],
      { duration: SWEEP_DURATION, ease: "snap", fill: "none" }
    ),
    animate(sweepTrail, [{ scale: "0.2 1" }, { scale: "1 1" }], { duration: DUR.panel * 0.6, ease: "out", fill: "none" }),
    // The slash itself: a hot glint runs down the blade, the blade kicks and leaves an echo.
    animate(
      glint,
      [
        { translate: "0 -120%", opacity: 1, visibility: "visible" },
        { translate: "0 520%", opacity: 1, visibility: "visible" }
      ],
      { duration: DUR.panel * 0.8, delay: 0.04, ease: "snap", fill: "none" }
    ),
    animate(bar, [{ scale: "2 1" }, { scale: "1 1" }], { duration: DUR.scene * 0.5, delay: kick, ease: "out", fill: "none" }),
    animate(
      echo,
      [
        { translate: "0 0", opacity: 0.7 },
        { translate: `${26 * dir}px 0`, opacity: 0 }
      ],
      { duration: DUR.panel * 1.1, delay: kick, ease: "out", fill: "none" }
    )
  ].filter(Boolean);
}

export function initSlash(root) {
  if (!root || slash) return;
  build(root);
  on(EVT.SECTION_WILL_CHANGE, play);
}
