// Bootstrap: load every feature module independently and init() them in order.
// A module that fails to load or init is logged and skipped; the rest of the site still works.
//
// Two groups:
//   MODULES   the page itself (scenery, card, menu, HUD, intro): loaded on first paint.
//   DEFERRED  the side requests (Debug Battle, Night Session, the console, extras):
//             about a quarter of the code, loaded once the intro is done and the browser is
//             idle, or at once on the first gesture that needs one of them (that gesture is
//             replayed when it was a click on a [data-*] trigger or the ~ key).
import "./motion.js";
import { afterIntro } from "./core.js";

const MODULES = [
  // Foundations
  "i18n",
  "sfx",
  "lofi",
  "darkhour",
  "toast",
  // Scenery (behind everything)
  "background",
  "skyline",
  "butterflies",
  "emblem",
  "timedial",
  // Content + interaction
  "shatter",
  "sections",
  "chrono",
  "story",
  "dive",
  "menu",
  "router",
  "objection",
  "name-drag",
  "hints",
  "hud",
  "projects",
  "pwa",
  // Last: the intro emits intro:done once everything above has subscribed.
  "intro"
];

const DEFERRED = ["battle", "rhythm", "terminal", "extras"];

// QA only: frame-time probe for section transitions (see js/perfprobe.js).
if (new URLSearchParams(window.location.search).has("perfprobe")) DEFERRED.push("perfprobe");

async function boot(names) {
  const loaded = await Promise.allSettled(names.map((name) => import(`./${name}.js`)));
  loaded.forEach((result, index) => {
    const name = names[index];
    if (result.status === "rejected") {
      console.error(`[main] failed to load ${name}.js`, result.reason);
      return;
    }
    try {
      result.value.init?.();
    } catch (error) {
      console.error(`[main] ${name}.init() failed`, error);
    }
  });
}

await boot(MODULES);
document.documentElement.classList.add("is-ready");

/* ---------------------------------------------------------- deferred group */

const TRIGGERS = "[data-battle], [data-session], [data-console]";
let deferred = null;

function loadDeferred() {
  deferred ??= boot(DEFERRED).then(() => {
    document.documentElement.classList.add("is-complete");
    window.removeEventListener("click", onEarlyClick, true);
    window.removeEventListener("keydown", onEarlyKey, true);
  });
  return deferred;
}

/** A trigger clicked before its module arrived: hold the click and replay it. */
function onEarlyClick(event) {
  const trigger = event.target.closest?.(TRIGGERS);
  if (!trigger) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  loadDeferred().then(() => trigger.click());
}

/** The console key pressed before the console arrived: replay it. */
function onEarlyKey(event) {
  if (event.code !== "Backquote" || event.repeat) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const { key, code, shiftKey } = event;
  loadDeferred().then(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, code, shiftKey, bubbles: true })));
}

window.addEventListener("click", onEarlyClick, true);
window.addEventListener("keydown", onEarlyKey, true);
// Any first gesture starts the download (the rhythm game listens to a long press on the lo-fi
// button).
["pointerdown", "keydown", "wheel", "touchstart"].forEach((type) =>
  window.addEventListener(type, () => loadDeferred(), { once: true, passive: true, capture: true })
);

afterIntro(() => {
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 300));
  idle(() => loadDeferred(), { timeout: 1500 });
});
