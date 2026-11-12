// Small secrets, deliberately left out of the hints:
//   - the Konami code (↑ ↑ ↓ ↓ ← → ← → B A): a flock of butterflies, and God mode for the
//     next battle test
//   - a different tab title (and a sleeping moon for a favicon) while the visitor is away
//   - a greeting in DevTools, with terminal() to open the system console from there
// Owner: HUD/overlays workstream (C).
import { state } from "./core.js";
import { lofi } from "./lofi.js";
import { toast } from "./toast.js";
import { swarm } from "./butterflies.js";
import { armGodMode } from "./battle.js";
import { openConsole } from "./terminal.js";
import { NORMAL, rgba } from "./fx/palette.js";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const AWAY_ICON = "assets/favicon-away.svg";

/* ------------------------------------------------------------------ konami */

let keys = [];

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

function onKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (!state.introDone || state.console || isEditable(event.target)) {
    keys = [];
    return;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.push(key);
  if (keys.length > KONAMI.length) keys.shift();
  if (keys.length === KONAMI.length && keys.every((k, i) => k === KONAMI[i])) {
    keys = [];
    cheat();
  }
}

function cheat() {
  armGodMode();
  swarm(10);
  toast("God mode for your next battle test.", { kicker: "Cheat accepted" });
}

/* --------------------------------------------------------------- tab title */

let away = false;
let homeTitle = "";
let icons = [];

function awayTitle() {
  if (lofi.isPlaying?.()) return "♪ Lo-fi still playing…";
  if (state.depths) return "Still down here…";
  if (state.darkhour) return "The hidden hour isn't over…";
  return "Come back… the moon is waiting";
}

function onVisibility() {
  if (document.hidden) {
    if (away) return;
    away = true;
    homeTitle = document.title;
    document.title = awayTitle();
    icons.forEach(({ link }) => {
      link.setAttribute("href", AWAY_ICON);
      link.setAttribute("type", "image/svg+xml");
    });
    return;
  }
  if (!away) return;
  away = false;
  document.title = homeTitle;
  icons.forEach(({ link, href, type }) => {
    link.setAttribute("href", href);
    if (type) link.setAttribute("type", type);
    else link.removeAttribute("type");
  });
}

/* ---------------------------------------------------------------- devtools */

function greet() {
  const art = [
    "    .-\"\"-.",
    "  .'  .--'",
    " /   /       DARK HOUR OS 0.0",
    "|   |        Hand-built: no framework, no build step.",
    " \\   \\       Psst: press ~ on the page, or type terminal() here.",
    "  '.  '--.",
    "    '-..-'"
  ].join("\n");
  const style = [
    `color: ${rgba(NORMAL.cyan)}`,
    `background: ${rgba(NORMAL.ink)}`,
    "font: 600 12px/1.45 ui-monospace, Menlo, Consolas, monospace",
    "padding: 10px 16px"
  ].join("; ");
  console.log(`%c${art}`, style);
}

/* -------------------------------------------------------------------- init */

export function init() {
  window.addEventListener("keydown", onKey);

  icons = Array.from(document.querySelectorAll('link[rel~="icon"]')).map((link) => ({
    link,
    href: link.getAttribute("href"),
    type: link.getAttribute("type")
  }));
  document.addEventListener("visibilitychange", onVisibility);

  window.terminal = () => {
    openConsole();
    return "Opening the console…";
  };
  greet();
}
