// The red diagonal slash and the section-change light sweep (DOM layer in .fx-root).
// Crisp, transform/opacity-only animation, fired on SECTION_WILL_CHANGE in sync with the
// panel wipe (same duration and easing, DUR.panel / EASE.snap).
import { EVT, on, prefersReducedMotion } from "../core.js";
import { gsap, DUR, EASE } from "../motion.js";

let slash = null;
let sweep = null;
let timeline = null;

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
  const vw = window.innerWidth;
  const bar = slash.querySelector(".fx-slash__bar");
  const glint = slash.querySelector(".fx-slash__glint");
  const echo = slash.querySelector(".fx-slash__echo");
  const sweepTrail = sweep.querySelector(".fx-sweep__trail");

  timeline?.kill();
  // Travel well past both edges: the band is rotated, so add its projected width.
  const fromX = dir > 0 ? -0.45 * vw : 1.15 * vw;
  const toX = dir > 0 ? 1.15 * vw : -0.45 * vw;

  timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
  timeline
    .set(sweep, { x: fromX, autoAlpha: 1, attr: { "data-dir": dir } })
    .to(sweep, { x: toX, duration: DUR.panel * 1.15, ease: EASE.snap }, 0)
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
