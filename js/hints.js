// Hints dialog: a native <dialog> styled as a list of side requests.
// Opens with a slam at the major angle, closes faster. Escape and backdrop clicks close it.
// Owner: HUD/overlays workstream (C).
import { prefersReducedMotion } from "./core.js";
import { gsap, DUR, EASE, STAGGER } from "./motion.js";
import { sfx } from "./sfx.js";

let dialog = null;
let panel = null;
let backdrop = null;
let opener = null;
let tl = null;
let closing = false;

export function isHintsOpen() {
  return Boolean(dialog?.open);
}

function animateOpen() {
  tl?.kill();
  const items = dialog.querySelectorAll(".hint");
  const head = dialog.querySelectorAll(".hints-head > *");
  if (prefersReducedMotion()) {
    tl = gsap.timeline();
    tl.fromTo([backdrop, panel], { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "none" });
    return;
  }
  tl = gsap.timeline({ defaults: { ease: EASE.out } });
  tl.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: DUR.ui, ease: "none" }, 0);
  tl.fromTo(
    panel,
    { opacity: 0, xPercent: -14, yPercent: 6, rotation: -8, scale: 1.06 },
    { opacity: 1, xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: DUR.panel, ease: EASE.snap },
    0
  );
  tl.fromTo(head, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: DUR.ui, stagger: STAGGER }, 0.16);
  tl.fromTo(items, { opacity: 0, x: 36 }, { opacity: 1, x: 0, duration: DUR.ui, stagger: STAGGER }, 0.2);
  tl.set([panel, head, items], { clearProps: "transform,opacity" });
}

export function openHints(trigger = null) {
  if (!dialog || dialog.open) return;
  opener = trigger ?? document.activeElement;
  closing = false;
  dialog.showModal();
  opener?.setAttribute?.("aria-expanded", "true");
  sfx.dialog(true);
  animateOpen();
  dialog.querySelector(".hints-close")?.focus({ preventScroll: true });
  dialog.scrollTop = 0;
}

export function closeHints() {
  if (!dialog || !dialog.open || closing) return;
  closing = true;
  sfx.dialog(false);
  tl?.kill();
  const done = () => {
    closing = false;
    if (dialog.open) dialog.close();
  };
  if (prefersReducedMotion()) {
    tl = gsap.timeline({ onComplete: done });
    tl.to([backdrop, panel], { opacity: 0, duration: 0.12, ease: "none" });
    return;
  }
  // Exit at ~60 % of the entrance.
  tl = gsap.timeline({ onComplete: done });
  tl.to(panel, { opacity: 0, xPercent: 10, yPercent: -4, rotation: 2, duration: 0.24, ease: EASE.in }, 0);
  tl.to(backdrop, { opacity: 0, duration: 0.22, ease: "none" }, 0.04);
}

export function init() {
  dialog = document.querySelector(".hints-dialog");
  if (!dialog) return;
  panel = dialog.querySelector(".hints-panel");
  backdrop = dialog.querySelector(".hints-backdrop");

  // Native Escape: play the exit instead of vanishing.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHints();
  });

  dialog.addEventListener("close", () => {
    tl?.kill();
    gsap.set([panel, backdrop], { clearProps: "transform,opacity" });
    closing = false;
    opener?.setAttribute?.("aria-expanded", "false");
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });

  // Backdrop + close button.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close]")) closeHints();
  });

  // Keep global shortcuts (menu arrows, nameplate Escape) out of the dialog.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") event.stopPropagation();
  });
}
