// Intro sequence (once per session, skippable). Owner: HUD/overlays workstream (C).
// Phase-0 stub: no intro, just signal that it is done so entrance animations can run.
import { EVT, emit, state } from "./core.js";

function finish() {
  if (state.introDone) return;
  state.introDone = true;
  emit(EVT.INTRO_DONE, {});
}

export function init() {
  // Called last by main.js, after every other module subscribed to INTRO_DONE.
  requestAnimationFrame(finish);
}
