// The Depths: the last screen of the descent (js/story.js), under all the chapters. On
// desktop the page scrolls down into the water, and this is the bottom: how the site is built
// and a save file of this visit. dive() cuts down to it, surface() back to the top (js/cut.js); the
// state (state.depths, html[data-depths]) and the shader depth follow the scroll in story.js.
// Owner: atmosphere workstream (A).
import { EVT, on, state, escapeHtml } from "./core.js";
import { sfx } from "./sfx.js";
import { DEPTHS } from "./content.js";
import { BUGS } from "./battle-logic.js";
import { formatDuration } from "./terminal-logic.js";
import { closeHints, isHintsOpen } from "./hints.js";
import { t, onLang } from "./i18n.js";
import { goTo } from "./story.js";

const KNOWN_KEY = "p3:battle:known";
const FOOL_KEY = "p3:arcana:fool";
const HISTORY_KEY = "p3:console:history";

let layer = null;
let surfaceButton = null;
let saveList = null;
let broken = 0;

/* ----------------------------------------------------------------- guards */

/** True when the Depths can be reached now (after the intro, nothing modal open). */
export function canDive({ ignoreConsole = false } = {}) {
  return Boolean(layer) && state.introDone
    && (ignoreConsole || !state.console) && !document.querySelector("dialog[open]");
}

/** Cut down to the Depths. Returns false when they are not there. */
export function dive() {
  if (!canDive({ ignoreConsole: true })) return false;
  return goTo("depths");
}

/** Cut back up to the title screen. */
export function surface({ instant = false } = {}) {
  if (window.scrollY <= 0) return false;
  if (!instant) sfx.back();
  return goTo("home", { animate: !instant });
}

/* ----------------------------------------------------------------- render */

const esc = escapeHtml;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

const rowMarkup = (label, value) =>
  `<li class="depths-row"><span class="depths-row-label">${esc(label)}</span><strong class="depths-row-value">${esc(value)}</strong></li>`;

function renderSave() {
  if (!saveList) return;
  const known = readJson(KNOWN_KEY, {});
  const weak = Object.values(known && typeof known === "object" ? known : {})
    .reduce((n, memory) => n + Object.values(memory || {}).filter((kind) => kind === "weak").length, 0);
  const typed = readJson(HISTORY_KEY, []);
  const rows = [
    [t("depths.time"), formatDuration(performance.now())],
    [t("depths.panes"), broken ? t("depths.panesN", { n: broken }) : t("depths.none")],
    [t("depths.weak"), `${Math.min(weak, BUGS.length)} / ${BUGS.length}`],
    [t("depths.card0"), readFlag(FOOL_KEY) ? t("depths.found") : t("depths.inDeck")],
    [t("depths.typed"), Array.isArray(typed) && typed.length ? String(typed.length) : t("depths.noneTyped")]
  ];
  saveList.innerHTML = rows.map(([label, value]) => rowMarkup(label, value)).join("");
}

function engravingMarkup(text) {
  const [before, after] = String(text).split("~");
  if (after === undefined) return esc(text);
  return `${esc(before)}<kbd class="depths-key">~</kbd>${esc(after)}`;
}

function render() {
  const d = DEPTHS;
  layer.innerHTML = `
    <div class="depths-light" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="depths-bubbles" aria-hidden="true">${"<i></i>".repeat(9)}</div>
    <p class="depths-stamp" aria-hidden="true">${esc(d.stamp)}</p>
    <button class="depths-surface" type="button" data-surface>
      <span class="depths-surface-arrow" aria-hidden="true">↑</span>
      <span>${esc(t("depths.surface"))}</span>
      <span class="depths-key" aria-hidden="true">Home</span>
    </button>
    <div class="depths-inner">
      <p class="depths-kicker">${esc(d.kicker)}</p>
      <h2 class="depths-title" id="depths-title">${esc(d.title)}</h2>
      <p class="depths-lead">${esc(d.copy)}</p>
      <div class="depths-plates">
        <section class="depths-plate" aria-labelledby="depths-built">
          <h3 class="depths-plate-title" id="depths-built">${esc(d.colophonTitle)}</h3>
          <ul class="depths-rows" role="list">${d.colophon.map(([label, value]) => rowMarkup(label, value)).join("")}</ul>
        </section>
        <section class="depths-plate depths-plate--save" aria-labelledby="depths-save">
          <h3 class="depths-plate-title" id="depths-save">${esc(d.saveTitle)}</h3>
          <ul class="depths-rows" role="list" data-save></ul>
        </section>
      </div>
      <button class="depths-engraving" type="button" data-console>${engravingMarkup(d.engraving)}</button>
    </div>`;
  surfaceButton = layer.querySelector("[data-surface]");
  saveList = layer.querySelector("[data-save]");
  surfaceButton?.addEventListener("click", () => surface());
  renderSave();
}

/* ------------------------------------------------------------------- init */

export function init() {
  layer = document.querySelector(".depths");
  if (!layer) return;
  render();
  layer.hidden = false;
  layer.id = "depths";

  // The save file is read fresh every time the reader arrives at the bottom.
  on(EVT.DIVE, ({ preview }) => {
    if (!preview && state.depths) renderSave();
  });
  onLang(() => {
    render();
    if (state.depths) renderSave();
  });

  // "Dive now" in the side requests: close them, then go down.
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-dive]");
    if (!trigger) return;
    const hints = trigger.closest("dialog");
    if (hints && isHintsOpen()) {
      hints.addEventListener("close", () => dive(), { once: true });
      closeHints();
    } else {
      dive();
    }
  });

  on(EVT.GLASS_BREAK, () => {
    broken += 1;
  });
}
