// Dark Hour state. Owner: HUD/overlays workstream (C).
// Phase-0: only the ?darkhour flag; C adds the 00:00-00:59 schedule and the secret trigger.
import { EVT, emit, flags, state } from "./core.js";

export function setDarkHour(active) {
  const next = Boolean(active);
  if (state.darkhour === next) return;
  state.darkhour = next;
  document.documentElement.toggleAttribute("data-darkhour", next);
  emit(EVT.DARKHOUR, { active: next });
}

export function isDarkHour() {
  return state.darkhour;
}

export function init() {
  if (flags.darkhour) setDarkHour(true);
}
