// Bootstrap: load every feature module independently and init() them in order.
// A module that fails to load or init is logged and skipped; the rest of the site still works.
import "./motion.js";

const MODULES = [
  // Foundations
  "sfx",
  "lofi",
  "darkhour",
  // Scenery (behind everything)
  "background",
  "skyline",
  "butterflies",
  "emblem",
  // Content + interaction
  "shatter",
  "sections",
  "menu",
  "objection",
  "name-drag",
  "hints",
  "hud",
  "projects",
  // Last: the intro emits intro:done once everything above has subscribed.
  "intro"
];

const loaded = await Promise.allSettled(MODULES.map((name) => import(`./${name}.js`)));

loaded.forEach((result, index) => {
  const name = MODULES[index];
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

document.documentElement.classList.add("is-ready");
