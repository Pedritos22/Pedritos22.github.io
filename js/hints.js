// Hints dialog. Owner: HUD/overlays workstream (C).
// Phase-0: original overlay logic; C converts it to a native <dialog>.
import { sfx } from "./sfx.js";

let hintOverlay = null;
let hintClose = null;
let opener = null;

export function isHintsOpen() {
  return Boolean(hintOverlay && !hintOverlay.hidden);
}

export function openHints(trigger = null) {
  if (!hintOverlay) return;
  opener = trigger;
  hintOverlay.hidden = false;
  opener?.setAttribute("aria-expanded", "true");
  hintClose?.focus();
}

export function closeHints() {
  if (!hintOverlay) return;
  hintOverlay.hidden = true;
  opener?.setAttribute("aria-expanded", "false");
  opener?.focus();
}

export function init() {
  hintOverlay = document.querySelector(".hint-overlay");
  hintClose = document.querySelector(".hint-close");

  hintClose?.addEventListener("click", () => {
    sfx.click();
    closeHints();
  });

  hintOverlay?.addEventListener("click", (event) => {
    if (event.target === hintOverlay) closeHints();
  });

  // Capture phase so Escape closes the dialog without also resetting the nameplate.
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && isHintsOpen()) {
        event.stopImmediatePropagation();
        closeHints();
      }
    },
    true
  );
}
