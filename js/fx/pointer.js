// Shared pointer state for the atmosphere layers (background, skyline, butterflies).
// One passive listener; consumers ease toward `pointer.tx/ty` themselves.
// Coordinates are normalized to [-1, 1] with (0, 0) at the viewport centre.

export const pointer = {
  tx: 0,
  ty: 0,
  /** clientX/Y in CSS px, or null before the first move. */
  x: null,
  y: null,
  /** True once a real mouse/pen moved (touch never drives parallax). */
  active: false
};

let installed = false;

export function installPointer() {
  if (installed) return;
  installed = true;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.tx = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointer.ty = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    },
    { passive: true }
  );
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.tx = 0;
    pointer.ty = 0;
  });
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}
