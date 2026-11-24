// Deep links and history over the descent (js/story.js). Every chapter has a URL: #about,
// #experience (#hacknation for its second scene), #projects, #skills, #education, #contact
// and #depths; the bare URL is the title screen. Old links (#section-about from the phone
// stack, #chapter-about) still land.
//
// Deliberate moves (the menu, the rail, the name, the console's cd) push a history entry;
// scrolling only replaces the current one, so the address follows the reader without filling
// the history. Back and Forward cut to the entry's chapter. The browser's own scroll
// restoration is off: a reload with a hash lands on that chapter instead.
// Owner: menu/panel workstream (B).
import { EVT, on, state } from "./core.js";
import { SECTION_MAP, DEPTHS } from "./content.js";
import { t, onLang } from "./i18n.js";
import { goTo } from "./story.js";

const EXTRA = new Set(["depths", "hacknation"]);

/** Chapter id for a location hash, "home" for none, or null for an in-page anchor (#main). */
export function chapterFromHash(hash) {
  const id = String(hash || "").replace(/^#/, "").replace(/^(section|chapter)-/, "");
  if (!id || id === "home") return "home";
  return SECTION_MAP[id] || EXTRA.has(id) ? id : null;
}

function urlFor(id) {
  const url = new URL(window.location.href);
  url.hash = id && id !== "home" ? id : "";
  return url.href.replace(/#$/, "");
}

function updateTitle(id) {
  const name = id === "depths" ? DEPTHS.stamp : SECTION_MAP[id === "hacknation" ? "experience" : id]?.menu;
  document.title = !name || id === "home" ? t("title.base") : t("title.section", { section: name });
}

function onChanged({ to, history }) {
  updateTitle(to);
  if (history === "none") return;
  const next = urlFor(to);
  if (next === window.location.href) return;
  if (history === "push") window.history.pushState({ chapter: to }, "", next);
  else window.history.replaceState({ chapter: to }, "", next);
}

function onPopState() {
  const id = chapterFromHash(window.location.hash);
  // In-page anchors that are not chapters (the skip link's #main) are not navigation.
  if (id === null) return;
  goTo(id, { history: "none" });
}

/** A deep link lands once the chapters are laid out, and again after the fonts settle. */
function landInitial(id) {
  let moved = false;
  const stop = () => {
    moved = true;
  };
  window.addEventListener("wheel", stop, { once: true, passive: true });
  window.addEventListener("touchstart", stop, { once: true, passive: true });
  window.addEventListener("keydown", stop, { once: true });
  const land = () => {
    if (!moved) goTo(id, { history: "none", animate: false });
  };
  requestAnimationFrame(() => requestAnimationFrame(land));
  document.fonts?.ready?.then(() => requestAnimationFrame(land));
}

export function init() {
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  const initial = chapterFromHash(window.location.hash);
  if (initial && initial !== "home") {
    // Normalise #section-about and #chapter-about to #about, without a history entry.
    if (window.location.hash !== `#${initial}`) window.history.replaceState({ chapter: initial }, "", urlFor(initial));
    landInitial(initial);
  }
  updateTitle(initial ?? "home");
  on(EVT.SECTION_CHANGED, onChanged);
  window.addEventListener("popstate", onPopState);
  onLang(() => updateTitle(state.section));
}
