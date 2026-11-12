// The dive. On desktop the page is exactly one screen, so scrolling down past it takes the
// camera under the water: the menu, the card and the city float up and away, the shader turns
// into deep water lit from above (uDepth), and a hidden layer, the Depths, rises into view.
// Scrolling back up, PageUp, Home, Esc or the Surface button come back up.
//
// Before the threshold the page gives a little (a preview), so a scroll always answers; past
// it the dive commits and the wheel rests for a moment, so trackpad inertia cannot bounce it.
// Rest positions live in css/dive.css (html[data-depths]); a transition animates from wherever
// things are (mid-preview, mid-transition) to the new rest, so it can always be interrupted.
// Owner: atmosphere workstream (A).
import { EVT, emit, on, state, isMobileLayout, onLayoutChange, prefersReducedMotion, escapeHtml } from "./core.js";
import { gsap, DUR, animate } from "./motion.js";
import { sfx } from "./sfx.js";
import { DEPTHS } from "./content.js";
import { BUGS } from "./battle-logic.js";
import { formatDuration } from "./terminal-logic.js";
import { restoreNamePosition } from "./name-drag.js";
import { closeHints, isHintsOpen } from "./hints.js";

const THRESHOLD = 260;      // px of wheel travel that commit a dive
const PREVIEW_PX = 24;      // how far the page gives before the threshold
const PREVIEW_DEPTH = 0.08; // how far the water lifts in the preview
const DECAY_MS = 300;       // a pause this long lets the preview spring back
const COOLDOWN_MS = 900;    // the wheel rests this long after a commit
const SWIPE_PX = 90;

const KNOWN_KEY = "p3:battle:known";
const FOOL_KEY = "p3:arcana:fool";
const HISTORY_KEY = "p3:console:history";

let html = null;
let shell = null;
let footer = null;
let layer = null;
let surfaceButton = null;
let saveList = null;
let anims = [];
let pending = null;
let acc = 0;
let decayTimer = 0;
let lockUntil = 0;
let gestureBlocked = false;
let gestureTimer = 0;
let touch = null;
let broken = 0;
const preview = { p: 0 };
let previewTween = null;

/* ----------------------------------------------------------------- guards */

/** True when the dive can happen now (desktop, after the intro, nothing modal in the way). */
export function canDive({ ignoreConsole = false } = {}) {
  return Boolean(layer) && !isMobileLayout() && state.introDone
    && (ignoreConsole || !state.console) && !document.querySelector("dialog[open]");
}

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

/**
 * True when something between `target` and the page can still scroll in `dir` (+1 down,
 * -1 up, 0 either way): the wheel belongs to it, not to the dive.
 */
function scrollableFrom(target, dir) {
  for (let node = target instanceof Element ? target : null; node && node !== document.body; node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight + 1) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    const atTop = node.scrollTop <= 0;
    const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
    if (dir === 0 || (dir > 0 && !atEnd) || (dir < 0 && !atTop)) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- preview */

const easeOut = (t) => 1 - (1 - t) * (1 - t);

function applyPreview(p) {
  const px = (PREVIEW_PX * easeOut(p)).toFixed(2);
  if (state.depths) {
    // Peeking back up: the page above leans in, the Depths give way.
    shell.style.translate = p ? `0 calc(-100svh + ${px}px)` : "";
    footer.style.translate = p ? `0 calc(-100svh + ${px}px)` : "";
    layer.style.translate = p ? `0 ${px}px` : "";
  } else {
    shell.style.translate = p ? `0 ${-px}px` : "";
    footer.style.translate = p ? `0 ${-px}px` : "";
  }
  const depth = state.depths ? 1 - PREVIEW_DEPTH * p : PREVIEW_DEPTH * p;
  emit(EVT.DIVE, { depth, preview: true });
}

function setPreview(target, duration = 0.16) {
  if (prefersReducedMotion() || document.querySelector(".name-button.is-lifted")) return;
  previewTween?.kill();
  previewTween = gsap.to(preview, {
    p: target,
    duration,
    ease: "power2.out",
    overwrite: true,
    onUpdate: () => applyPreview(preview.p)
  });
}

function cancelPreview() {
  previewTween?.kill();
  previewTween = null;
  preview.p = 0;
  [shell, footer, layer].forEach((el) => el && (el.style.translate = ""));
}

/* ------------------------------------------------------------- transition */

function moversFor() {
  return [shell, footer, document.querySelector(".fx-skyline"), document.querySelector(".fx-slash"), layer].filter(Boolean);
}

function transition(toDepths, { instant = false } = {}) {
  const movers = moversFor();
  // Read where everything is right now (mid-preview or mid-transition), once.
  const from = movers.map((el) => {
    const cs = getComputedStyle(el);
    return { translate: cs.translate === "none" ? "0px 0px" : cs.translate, opacity: cs.opacity };
  });
  anims.forEach((a) => a.cancel());
  anims = [];
  cancelPreview();

  state.depths = toDepths;
  html.toggleAttribute("data-depths", toDepths);
  layer.classList.toggle("depths--solid", !document.querySelector(".fx-root--gl"));
  shell.inert = toDepths;
  layer.inert = !toDepths;
  layer.setAttribute("aria-hidden", String(!toDepths));
  if (toDepths) renderSave();
  emit(EVT.DIVE, { depth: toDepths ? 1 : 0, preview: false });
  if (instant) return;

  const reduced = prefersReducedMotion();
  const duration = reduced ? 0.2 : toDepths ? DUR.scene : DUR.panel;
  movers.forEach((el, i) => {
    const key = { offset: 0, opacity: from[i].opacity, visibility: "visible" };
    if (!reduced) key.translate = from[i].translate;
    const delay = !reduced && toDepths && el === layer ? 0.05 : 0;
    anims.push(animate(el, [key], { duration, delay, ease: reduced ? "linear" : "snap" }));
  });
}

/**
 * Focus follows the view only when it was in the part that just went inert (a keyboard
 * user): from the page to the Surface button, and back to the open menu item. A visitor
 * who scrolled with nothing focused keeps nothing focused.
 */
function settleFocus(toDepths, active) {
  if (toDepths) {
    if (active && shell.contains(active)) surfaceButton?.focus({ preventScroll: true });
  } else if (active && layer.contains(active)) {
    const target = document.querySelector(".menu-item[aria-current]") ?? document.querySelector(".name-button");
    target?.focus({ preventScroll: true });
  }
}

/** Go under the water. Returns false when the dive cannot happen now. */
export function dive() {
  if (state.depths || pending || !canDive({ ignoreConsole: true })) return false;
  // A lifted nameplate is position: fixed inside the shell; moving the shell would move it.
  if (document.querySelector(".name-button.is-lifted")) {
    restoreNamePosition();
    pending = gsap.delayedCall(0.8, () => {
      pending = null;
      dive();
    });
    return true;
  }
  const active = document.activeElement;
  sfx.whoosh();
  transition(true);
  settleFocus(true, active);
  return true;
}

/** Come back up. */
export function surface({ instant = false } = {}) {
  pending?.kill();
  pending = null;
  if (!state.depths) return false;
  const active = document.activeElement;
  if (!instant) sfx.back();
  transition(false, { instant });
  settleFocus(false, active);
  return true;
}

/* ------------------------------------------------------------------ input */

function normalise(event) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function resetGesture() {
  acc = 0;
  window.clearTimeout(decayTimer);
  if (preview.p) setPreview(0, 0.3);
}

function onWheel(event) {
  if (!canDive() || event.ctrlKey) return;
  const dy = normalise(event);
  if (Math.abs(dy) < Math.abs(event.deltaX)) return;

  // A wheel stream that started in a scrolling list stays with it until it pauses.
  if (gestureBlocked || scrollableFrom(event.target, Math.sign(dy))) {
    gestureBlocked = true;
    window.clearTimeout(gestureTimer);
    gestureTimer = window.setTimeout(() => {
      gestureBlocked = false;
    }, 250);
    resetGesture();
    return;
  }

  const now = performance.now();
  if (now < lockUntil || pending) return;
  const wanted = state.depths ? -1 : 1;
  if (Math.sign(dy) !== wanted) {
    resetGesture();
    return;
  }

  acc += Math.abs(dy);
  window.clearTimeout(decayTimer);
  decayTimer = window.setTimeout(resetGesture, DECAY_MS);
  if (acc >= THRESHOLD) {
    acc = 0;
    window.clearTimeout(decayTimer);
    lockUntil = now + COOLDOWN_MS;
    if (state.depths) surface();
    else dive();
    return;
  }
  setPreview(Math.min(1, acc / THRESHOLD));
}

function onKey(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key;
  const down = key === "PageDown" || key === "End";
  const up = key === "PageUp" || key === "Home" || (key === "Escape" && state.depths);
  if ((!down && !up) || !canDive() || isEditable(event.target)) return;
  if (key !== "Escape" && scrollableFrom(event.target, down ? 1 : -1)) return;
  if (down && !state.depths) {
    event.preventDefault();
    dive();
  } else if (up && state.depths) {
    event.preventDefault();
    surface();
  }
}

const NO_SWIPE = "button, a, input, select, textarea, [role='slider'], .name-button, .emblem-mount, .time-grip";

function onTouchStart(event) {
  touch = null;
  if (event.touches.length !== 1 || !canDive()) return;
  const target = event.target;
  if (target instanceof Element && (target.closest(NO_SWIPE) || scrollableFrom(target, 0))) return;
  const t = event.touches[0];
  touch = { x: t.clientX, y: t.clientY, at: performance.now() };
}

function onTouchEnd(event) {
  if (!touch) return;
  const t = event.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const quick = performance.now() - touch.at < 700;
  touch = null;
  if (!quick || Math.abs(dy) < SWIPE_PX || Math.abs(dx) > Math.abs(dy)) return;
  // Finger up = scroll down = dive.
  if (dy < 0 && !state.depths) dive();
  else if (dy > 0 && state.depths) surface();
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
    ["Time here", formatDuration(performance.now())],
    ["Panes broken", broken ? `${broken} this visit` : "None yet"],
    ["Weak spots found", `${Math.min(weak, BUGS.length)} / ${BUGS.length}`],
    ["Card 0", readFlag(FOOL_KEY) ? "Found" : "Still in the deck"],
    ["Commands typed", Array.isArray(typed) && typed.length ? String(typed.length) : "None. Press ~"]
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
      <span>Surface</span>
      <span class="depths-key" aria-hidden="true">PgUp</span>
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
}

/* ------------------------------------------------------------------- init */

export function init() {
  html = document.documentElement;
  shell = document.querySelector(".shell");
  footer = document.querySelector(".meta-bar");
  layer = document.querySelector(".depths");
  if (!shell || !footer || !layer) {
    layer = null;
    return;
  }
  render();
  layer.hidden = false; // css/dive.css keeps it out of sight (and inert) at the surface
  layer.inert = true;
  layer.setAttribute("aria-hidden", "true");

  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  surfaceButton?.addEventListener("click", () => surface());

  // "Dive now" in the side requests: close them, then go under.
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
  on(EVT.RESET, () => surface());
  on(EVT.SECTION_WILL_CHANGE, () => surface());
  onLayoutChange((mobile) => {
    if (mobile) surface({ instant: true });
  });
}
