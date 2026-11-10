// HUD + tool buttons (help, reset) + audio controls UI.
// Owner: HUD/overlays workstream (C). Audio logic lives behind the lofi/sfx APIs (D).
import { EVT, emit, on } from "./core.js";
import { sfx } from "./sfx.js";
import { lofi } from "./lofi.js";
import { openHints } from "./hints.js";

export function init() {
  const helpToggle = document.querySelector(".help-toggle");
  const resetToggle = document.querySelector(".reset-toggle");
  const audioToggle = document.querySelector(".audio-toggle");
  const volumeSlider = document.querySelector(".volume-slider");

  helpToggle?.addEventListener("click", () => {
    sfx.click();
    openHints(helpToggle);
  });

  resetToggle?.addEventListener("click", () => {
    sfx.click();
    emit(EVT.RESET, {});
  });

  if (volumeSlider) {
    volumeSlider.value = String(Math.round(lofi.getVolume() * 100));
    volumeSlider.addEventListener("input", () => lofi.setVolume(Number(volumeSlider.value) / 100));
  }

  audioToggle?.addEventListener("click", () => {
    sfx.click();
    if (volumeSlider) lofi.setVolume(Number(volumeSlider.value) / 100);
    lofi.toggle();
  });

  on(EVT.LOFI, ({ playing }) => {
    if (!audioToggle) return;
    audioToggle.classList.toggle("is-on", playing);
    audioToggle.setAttribute("aria-pressed", String(playing));
    audioToggle.textContent = playing ? "Lo-fi: on" : "Lo-fi: off";
  });

  // Links inside cards stop propagation (glass engine), so listen in the capture phase.
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest?.(".action-link")) sfx.click();
    },
    true
  );
}
