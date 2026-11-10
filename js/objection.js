// "Objection!" burst overlay. Owner: HUD/overlays workstream (C).
import { EVT, emit } from "./core.js";
import { sfx } from "./sfx.js";

let overlay = null;
let hideTimer = null;

export function showObjection() {
  if (!overlay) return;
  sfx.objection();
  overlay.classList.remove("is-visible");
  void overlay.offsetWidth;
  overlay.classList.add("is-visible");
  emit(EVT.OBJECTION, {});

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    overlay.classList.remove("is-visible");
  }, 1450);
}

export function init() {
  overlay = document.querySelector(".objection-overlay");
}
