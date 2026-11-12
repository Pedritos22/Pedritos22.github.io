// Toasts: one short slanted plate in the lower left, announced politely to screen readers.
// A new toast replaces the one on screen. Used by the Konami code and the system console.
// Owner: HUD/overlays workstream (C).
import { prefersReducedMotion } from "./core.js";
import { gsap, DUR, EASE } from "./motion.js";
import { sfx } from "./sfx.js";

const SHOW_S = 2.6;

let region = null;
let current = null;
let tl = null;

function ensureRegion() {
  if (region) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  return region;
}

/** Show a toast: `text` on the plate, `kicker` above it. Returns nothing. */
export function toast(text, { kicker = "Notice", sound = true } = {}) {
  if (!document.body) return;
  ensureRegion();
  tl?.kill();
  current?.remove();

  const el = document.createElement("div");
  el.className = "toast";
  const top = document.createElement("span");
  top.className = "toast-kicker";
  top.textContent = kicker;
  const line = document.createElement("span");
  line.className = "toast-text";
  line.textContent = text;
  el.append(top, line);
  region.append(el);
  current = el;
  if (sound) sfx.toast();

  const remove = () => {
    if (current === el) current = null;
    el.remove();
  };

  if (prefersReducedMotion()) {
    tl = gsap.timeline({ onComplete: remove });
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "none" })
      .to(el, { opacity: 0, duration: 0.16, ease: "none" }, `+=${SHOW_S}`);
    return;
  }

  tl = gsap.timeline({ onComplete: remove });
  tl.fromTo(el, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: DUR.ui, ease: EASE.out })
    .fromTo(line, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: DUR.ui, ease: EASE.out }, 0.06)
    .to(el, { opacity: 0, x: -24, duration: DUR.ui * 0.6, ease: EASE.in }, `+=${SHOW_S}`);
}

export function init() {
  ensureRegion();
}
