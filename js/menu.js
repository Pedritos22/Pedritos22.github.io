// Main menu: one shared cursor plate, the active marker, roving tabindex, keyboard and
// pointer handling, hover jitter and the entrance of the identity column.
// Owner: menu/panel workstream (B).
//
// Two shared plates live inside <nav class="menu">, painted under the items:
//   .menu-marker  electric-blue plate that sits (offset) behind the ACTIVE item
//   .menu-cursor  hot plate that springs to the hovered / focused item and rests on the active one
// Both are parallelograms leaning at -8deg, drawn with a px clip-path so the angle never
// changes with the width; only transform and clip-path are animated.
import { EVT, emit, on, afterIntro, isMobileLayout, onLayoutChange, prefersReducedMotion } from "./core.js";
import { gsap, SplitText, DUR, EASE, STAGGER } from "./motion.js";
import { showSection } from "./sections.js";
import { sfx } from "./sfx.js";

const TAN8 = Math.tan((8 * Math.PI) / 180);
const BLEED = 64; // the plates extend this far left of the nav box (see .menu-cursor in menu.css)
const PAD_L = 18;
const PAD_R = 26;
const MARKER_OFFSET = 7;
const ACTIVE_PUSH = 14; // keep in sync with --menu-push in menu.css
const ACTIVE_SCALE = 1.03; // keep in sync with --menu-scale in menu.css
const COMMIT_DELAY = 170; // ms after the last arrow key before the card follows

let nav = null;
let cursor = null;
let marker = null;
let items = [];
let activeIndex = -1; // item whose section is open (-1: home)
let cursorIndex = -1; // item the cursor is on (-1: hidden)
let hoverIndex = -1;
let commitTimer = 0;
let ready = false; // entrance finished: plates may show
let geometryFrame = 0;
const jitters = new Map();

const dialogOpen = () => Boolean(document.querySelector("dialog[open], .hint-overlay:not([hidden])"));
const isEnabled = (item) => item && !item.disabled && !item.classList.contains("is-shattered");

/* ============================================================= geometry */

function plateRect(index, { forMarker = false } = {}) {
  const item = items[index];
  const label = item.querySelector(".menu-label") ?? item;
  let x = item.offsetLeft + label.offsetLeft;
  let w = label.offsetWidth;
  const y = item.offsetTop + label.offsetTop;
  const h = label.offsetHeight;
  if (index === activeIndex) {
    x += ACTIVE_PUSH;
    w *= ACTIVE_SCALE;
  }
  const x0 = x - PAD_L + BLEED + (forMarker ? MARKER_OFFSET : 0);
  const x1 = x + w + PAD_R + BLEED + (forMarker ? MARKER_OFFSET : 0);
  return { x0, x1, y: y + (forMarker ? MARKER_OFFSET : 0), h };
}

function polygon({ x0, x1, h }, open = true) {
  const s = h * TAN8;
  const right = open ? x1 : x0;
  const p = (n) => `${Math.round(n * 10) / 10}px`;
  return `polygon(${p(x0 + s)} 0px, ${p(right + s)} 0px, ${p(right)} ${p(h)}, ${p(x0)} ${p(h)})`;
}

function collapsedLike(element) {
  // Keep the current left edge and close the plate onto it.
  const current = element._rect;
  return current ? polygon(current, false) : "polygon(0px 0px, 0px 0px, 0px 0px, 0px 0px)";
}

/* =============================================================== plates */

function placePlate(element, index, { ease, duration, forMarker = false, immediate = false }) {
  if (!element) return;
  if (index < 0 || !items[index] || !isEnabled(items[index]) || !ready) {
    if (element._shown) {
      element._shown = false;
      gsap.to(element, {
        clipPath: collapsedLike(element),
        duration: immediate ? 0 : DUR.micro,
        ease: EASE.in,
        overwrite: "auto"
      });
    }
    return;
  }

  const rect = plateRect(index, { forMarker });
  element.style.setProperty("--plate-h", `${rect.h}px`);
  const wasShown = element._shown;
  element._rect = rect;
  element._shown = true;

  if (immediate || prefersReducedMotion()) {
    gsap.killTweensOf(element);
    gsap.set(element, { y: rect.y, clipPath: polygon(rect) });
    return;
  }

  if (!wasShown) {
    // Appear: jump to the row, then swipe open from the left edge.
    gsap.killTweensOf(element);
    gsap.set(element, { y: rect.y, clipPath: polygon(rect, false) });
    gsap.to(element, { clipPath: polygon(rect), duration: DUR.ui, ease: EASE.out });
    return;
  }

  gsap.to(element, { y: rect.y, clipPath: polygon(rect), duration, ease, overwrite: "auto" });
}

function moveCursor(index, { immediate = false } = {}) {
  const changed = index !== cursorIndex;
  cursorIndex = index;
  items.forEach((item, i) => item.classList.toggle("is-cursor", i === index && ready));
  placePlate(cursor, index, { ease: EASE.spring, duration: DUR.ui, immediate });
  if (changed && index >= 0 && ready) {
    gsap.fromTo(cursor, { scaleY: 0.78 }, { scaleY: 1, duration: DUR.ui, ease: EASE.spring, overwrite: false });
  }
}

function moveMarker({ immediate = false } = {}) {
  placePlate(marker, activeIndex, { ease: EASE.snap, duration: DUR.ui, forMarker: true, immediate });
}

/** Where the cursor rests when the pointer is not over the menu. */
function restingIndex() {
  const focused = items.indexOf(document.activeElement);
  if (focused >= 0 && document.activeElement.matches(":focus-visible")) return focused;
  return isEnabled(items[activeIndex]) ? activeIndex : -1;
}

function refreshGeometry() {
  cancelAnimationFrame(geometryFrame);
  geometryFrame = requestAnimationFrame(() => {
    moveMarker({ immediate: true });
    placePlate(cursor, cursorIndex, { immediate: true });
  });
}

/* ========================================================= active state */

function updateTabStops() {
  const focused = items.indexOf(document.activeElement);
  let stop = focused >= 0 && isEnabled(items[focused]) ? focused : -1;
  if (stop < 0 && isEnabled(items[activeIndex])) stop = activeIndex;
  if (stop < 0) stop = items.findIndex(isEnabled);
  items.forEach((item, i) => {
    item.tabIndex = i === stop ? 0 : -1;
  });
}

function setActive(index) {
  activeIndex = index;
  items.forEach((item, i) => {
    const active = i === index && isEnabled(item);
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
    // shatter.js marks broken items aria-pressed="false"; this menu uses aria-current only.
    item.removeAttribute("aria-pressed");
  });
  updateTabStops();
  moveMarker();
  // The active item is pushed right, so the cursor re-measures it.
  if (hoverIndex < 0) moveCursor(restingIndex());
  else moveCursor(cursorIndex);
}

function indexOfSection(sectionId) {
  return items.findIndex((item) => item.dataset.section === sectionId);
}

/* ================================================================ jitter */

function jitter(index) {
  if (prefersReducedMotion() || !SplitText) return;
  const item = items[index];
  const text = item?.querySelector(".menu-text");
  if (!text || !isEnabled(item)) return;

  let entry = jitters.get(text);
  if (entry) {
    entry.tween.kill();
    entry.split.revert();
  }
  const split = new SplitText(text, { type: "chars", charsClass: "menu-char" });
  const tween = gsap.fromTo(
    split.chars,
    { y: (i) => (i % 2 ? 4 : -4), x: (i) => (i % 3 === 0 ? 1.5 : -1) },
    {
      y: 0,
      x: 0,
      duration: DUR.ui,
      ease: EASE.spring,
      stagger: 0.012,
      onComplete: () => {
        split.revert();
        jitters.delete(text);
      }
    }
  );
  entry = { split, tween };
  jitters.set(text, entry);
}

function pulse(index) {
  const label = items[index]?.querySelector(".menu-label");
  if (!label || prefersReducedMotion()) return;
  gsap.fromTo(label, { x: 10 }, { x: 0, duration: DUR.ui, ease: EASE.spring, clearProps: "transform" });
}

/* =============================================================== actions */

function select(index) {
  const item = items[index];
  if (!isEnabled(item)) return;
  window.clearTimeout(commitTimer);
  const section = item.dataset.section;
  if (index !== activeIndex) setActive(index);
  sfx.confirm();
  pulse(index);
  showSection(section);
}

function preview(index, { sound = true } = {}) {
  if (!isEnabled(items[index]) || !ready) return;
  if (index === cursorIndex) return;
  moveCursor(index);
  jitter(index);
  if (sound) sfx.hover();
  emit(EVT.MENU_HOVER, { index, section: items[index].dataset.section });
}

/* ============================================================== handlers */

function onKeydown(event) {
  if (dialogOpen()) return;
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;

  const enabled = items.map((item, i) => (isEnabled(item) ? i : -1)).filter((i) => i >= 0);
  if (!enabled.length) return;
  const current = items.indexOf(document.activeElement);
  const position = enabled.indexOf(current);
  let next;

  if (event.key === "Home") next = enabled[0];
  else if (event.key === "End") next = enabled[enabled.length - 1];
  else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    next = enabled[(position <= 0 ? enabled.length : position) - 1];
  } else {
    next = enabled[(position + 1) % enabled.length];
  }

  event.preventDefault();
  items[next].focus(); // focus handler moves the cursor and plays the hover sound

  // Arrows also move the selection on desktop, once the key presses settle.
  if (!isMobileLayout()) {
    window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(() => {
      if (items.indexOf(document.activeElement) === next) select(next);
    }, COMMIT_DELAY);
  }
}

function bindItem(item, index) {
  item.addEventListener("click", () => {
    if (!isEnabled(item)) return;
    select(index);
  });
  item.addEventListener("pointerenter", (event) => {
    hoverIndex = index;
    preview(index, { sound: event.pointerType !== "touch" });
  });
  item.addEventListener("focus", () => {
    updateTabStops();
    if (item.matches(":focus-visible")) preview(index);
  });
}

/* ============================================================== entrance */

function entranceTargets() {
  return {
    status: document.querySelector(".identity .status-line"),
    names: Array.from(document.querySelectorAll(".name-button > span")),
    menuItems: items,
    codes: Array.from(document.querySelectorAll(".menu-code")),
    footer: document.querySelector(".meta-bar"),
    cue: document.querySelector(".scroll-cue")
  };
}

function prepareEntrance() {
  const { status, names, menuItems, footer, cue } = entranceTargets();
  const all = [status, ...names, ...menuItems, footer, cue].filter(Boolean);
  if (prefersReducedMotion()) {
    gsap.set(all, { opacity: 0 });
    return;
  }
  gsap.set(status, { opacity: 0, x: -36 });
  gsap.set(names, { opacity: 0, x: -64 });
  gsap.set(menuItems, { opacity: 0, x: -88 });
  gsap.set([footer, cue].filter(Boolean), { opacity: 0 });
}

function playEntrance() {
  const { status, names, menuItems, codes, footer, cue } = entranceTargets();
  const all = [status, ...names, ...menuItems, footer, cue].filter(Boolean);
  const done = () => {
    gsap.set(all, { clearProps: "transform,opacity" });
    ready = true;
    moveMarker();
    moveCursor(restingIndex());
  };

  if (prefersReducedMotion()) {
    gsap.to(all, { opacity: 1, duration: 0.2, ease: "none", onComplete: done });
    return;
  }

  const timeline = gsap.timeline({ onComplete: done });
  timeline.to(status, { opacity: 1, x: 0, duration: DUR.panel, ease: EASE.out }, 0);
  timeline.to(names, { opacity: 1, x: 0, duration: DUR.scene * 0.8, ease: "back.out(1.4)", stagger: 0.07 }, 0.06);
  timeline.to(menuItems, { opacity: 1, x: 0, duration: DUR.panel, ease: EASE.spring, stagger: STAGGER }, 0.2);
  if (codes.length) {
    timeline.from(codes, { opacity: 0, duration: DUR.ui, stagger: STAGGER, clearProps: "opacity" }, 0.36);
  }
  timeline.to([footer, cue].filter(Boolean), { opacity: 1, duration: DUR.panel, ease: "none" }, 0.4);
}

/* ================================================================== init */

export function init() {
  nav = document.querySelector(".menu");
  if (!nav) return;
  items = Array.from(nav.querySelectorAll(".menu-item"));
  cursor = nav.querySelector(".menu-cursor");
  marker = nav.querySelector(".menu-marker");

  items.forEach((item, index) => {
    item.removeAttribute("aria-pressed");
    bindItem(item, index);
  });
  updateTabStops();

  nav.addEventListener("keydown", onKeydown);
  nav.addEventListener("pointerleave", () => {
    hoverIndex = -1;
    moveCursor(restingIndex());
  });
  nav.addEventListener("focusout", () => {
    // Wait for focus to land so restingIndex() sees the new activeElement.
    requestAnimationFrame(() => {
      updateTabStops();
      if (hoverIndex < 0) moveCursor(restingIndex());
    });
  });

  // Keep the menu in sync with section changes from anywhere (nameplate = home, etc.).
  on(EVT.SECTION_WILL_CHANGE, ({ to }) => {
    const index = indexOfSection(to);
    if (index !== activeIndex) setActive(index);
  });
  on(EVT.SECTION_CHANGED, ({ to }) => {
    const index = indexOfSection(to);
    if (index !== activeIndex) setActive(index);
  });

  // Glass easter egg: a broken item is disabled until reset.
  on(EVT.GLASS_BREAK, ({ element }) => {
    if (!element?.closest?.(".menu-item")) return;
    setActive(activeIndex);
  });
  on(EVT.RESET, () => {
    requestAnimationFrame(() => setActive(activeIndex));
  });

  window.addEventListener("resize", refreshGeometry, { passive: true });
  onLayoutChange(refreshGeometry);
  document.fonts?.ready?.then(refreshGeometry);

  prepareEntrance();
  afterIntro(playEntrance);
}
