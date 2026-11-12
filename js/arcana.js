// Skills card: the arcana cards' markup and everything they do beyond flipping.
// Owner: menu/panel workstream (B).
//
//   - Markup: front (numeral, sigil with a medallion and the technology mark, name) and back
//     (name, description, a one-line "spell" that types itself out when the card turns).
//   - Deal: on entrance the cards fly out of a deck on the first slot of the last row.
//   - Holo: a foil sheen crosses a card as it lands, when its back turns up, and now and
//     then on one face-down card while the grid is on screen.
//   - Card 0, The Fool: once every card has been turned over in this visit, a hidden card is
//     dealt over the grid. Putting it away leaves a "0" chip next to the battle button that
//     calls it back; the chip stays on later visits (localStorage p3:arcana:fool).
// sections.js renders the grid (arcanaMarkup), binds it (bindArcana) and runs the entrance
// (dealIn + drawSigils) inside its own reveal.
import { ROMAN } from "./content.js";
import { prefersReducedMotion, isMobileLayout, escapeHtml as esc } from "./core.js";
import { DUR, STAGGER, animate, enterFrom } from "./motion.js";
import { renderSigil } from "./sigils.js";
import { mark, tint } from "./marks.js";
import { sfx } from "./sfx.js";

const FOOL_KEY = "p3:arcana:fool";
const TURN_DWELL_MS = 220; // a hover has to rest this long before the card counts as turned
const IDLE_MIN_MS = 5200;
const IDLE_SPREAD_MS = 3600;

const hoverQuery = window.matchMedia("(hover: hover)");
const turned = new Set(); // skill names whose back has been seen this visit
let deckSize = 0;
let foolDealt = false; // dealt by turning the whole deck (once per visit)
let foolFound = readFound();
let announcer = null;
let idleTimer = 0;
let gridObserver = null;
const visibleGrids = new Set();

/* ================================================================ markup */

function spellMarkup(spell) {
  const chars = Array.from(String(spell))
    .map((char, i) => `<i style="--i:${i}">${esc(char)}</i>`)
    .join("");
  // The caret hangs off the last character, so it never wraps onto a line of its own.
  return `<span class="arcana-spell" aria-hidden="true"><b>&gt;</b> <span class="arcana-spell-text">${chars}</span></span>`;
}

// First child of each face: the band passes over the card's background but under its
// ink (sigil, text), so the type stays crisp, like light behind the print.
const foil = `<span class="arcana-foil" aria-hidden="true"><i></i></span>`;

/** One card (a toggle button). `numeral` is "I".."VIII", or "0" for the Fool. */
export function cardMarkup(skill, numeral, extraClass = "") {
  const name = esc(skill.name);
  return `<button class="skill arcana${extraClass}" type="button" aria-pressed="false" data-numeral="${numeral}" data-skill="${name}" style="--tint:${tint(skill.mark)}">
      <span class="arcana-inner">
        <span class="arcana-face arcana-front">
          ${foil}
          <span class="arcana-numeral" aria-hidden="true">${numeral}</span>
          <span class="arcana-sigil">${renderSigil(skill.name, { hub: true })}<span class="arcana-mark">${mark(skill.mark)}</span></span>
          <span class="arcana-name">${name}</span>
        </span>
        <span class="arcana-face arcana-back">
          ${foil}
          <span class="arcana-back-head" aria-hidden="true"><span>${numeral}</span><span>${name}</span></span>
          <span class="arcana-desc">${esc(skill.desc)}</span>
          ${spellMarkup(skill.spell)}
          <span class="arcana-ghost" aria-hidden="true">${mark(skill.mark)}</span>
        </span>
      </span>
    </button>`;
}

/** The grid of cards, plus the (hidden) stage card 0 is dealt onto. */
export function arcanaMarkup(section) {
  const cards = section.skills
    .map((skill, i) => `<li class="arcana-slot">${cardMarkup(skill, ROMAN[i] ?? String(i + 1))}</li>`)
    .join("");
  const fool = section.fool
    ? `<div class="fool-stage" hidden>${cardMarkup(section.fool, "0", " arcana--fool")}</div>`
    : "";
  return `<ul class="arcana-grid" role="list">${cards}</ul>${fool}`;
}

/** The chip that calls card 0 back (lives in the card's action strip). */
export function foolChipMarkup(section) {
  if (!section.fool) return "";
  return `<button class="fool-chip" type="button" data-fool hidden aria-label="Card 0, ${esc(section.fool.name)}" data-tip="${esc(section.fool.name)}">
      <span aria-hidden="true">0</span>
    </button>`;
}

/* ============================================================= animation */

/** Draw every sigil in (a short offset per card), then pop its technology mark in. */
export function drawSigils(sigils, delay) {
  const animations = [];
  sigils.forEach((svg, i) => {
    const at = delay + i * STAGGER;
    const strokes = svg.querySelectorAll(".sg-draw");
    const strokeStep = strokes.length > 1 ? 0.16 / (strokes.length - 1) : 0;
    strokes.forEach((stroke, j) => {
      animations.push(
        animate(
          stroke,
          [
            { strokeDasharray: "1 1", strokeDashoffset: 1 },
            { strokeDasharray: "1 1", strokeDashoffset: 0 }
          ],
          { duration: DUR.panel, delay: at + j * strokeStep, ease: "power2InOut" }
        )
      );
    });
    svg.querySelectorAll(".sg-dash").forEach((dash) => {
      animations.push(enterFrom(dash, {}, { duration: DUR.ui, delay: at + 0.12 }));
    });
    const dots = svg.querySelectorAll(".sg-dot");
    const dotStep = dots.length > 1 ? 0.1 / (dots.length - 1) : 0;
    dots.forEach((dot, j) => {
      animations.push(enterFrom(dot, { scale: 0 }, { duration: DUR.ui, delay: at + 0.3 + j * dotStep, ease: "spring" }));
    });
    const markEl = svg.parentElement?.querySelector(".arcana-mark");
    if (markEl) animations.push(enterFrom(markEl, { scale: 0.6 }, { duration: DUR.ui, delay: at + 0.26, ease: "spring" }));
  });
  return animations.filter(Boolean);
}

/** A foil sheen across one card face. Fire and forget. */
function sheen(face, delay = 0) {
  if (prefersReducedMotion()) return;
  const band = face?.querySelector(":scope > .arcana-foil > i");
  if (!band) return;
  animate(
    band,
    [
      { translate: "-110% 0", opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { opacity: 1, offset: 0.75 },
      { translate: "220% 0", opacity: 0 }
    ],
    { duration: 0.8, delay, ease: "out", fill: "none" }
  );
}

/**
 * Deal the cards out of a deck sitting on the first slot of the last row. Offsets are in
 * percent of a slot (plus the grid gaps), so nothing is measured on the swap frame.
 * Returns the animations (already hiding the cards, like enterFrom).
 */
export function dealIn(slots, delay = 0) {
  const list = Array.from(slots);
  if (!list.length) return [];
  const mobile = isMobileLayout();
  const columns = mobile ? 2 : 4;
  const colGap = mobile ? 16 : 24;
  const rowGap = mobile ? 24 : 16;
  const rows = Math.ceil(list.length / columns);
  return list
    .map((slot, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const dx = -col;
      const dy = rows - 1 - row;
      const at = delay + i * STAGGER;
      sheen(slot.querySelector(".arcana-front"), at + 0.3);
      return animate(
        slot,
        [
          {
            offset: 0,
            opacity: 0,
            rotate: "-8deg",
            translate: `calc(${dx * 100}% + ${dx * colGap}px) calc(${dy * 100}% + ${dy * rowGap}px)`
          },
          { offset: 0.3, opacity: 1 }
        ],
        { duration: DUR.panel, delay: at, ease: "spring" }
      );
    })
    .filter(Boolean);
}

/* ================================================================ state */

function readFound() {
  try {
    return window.localStorage.getItem(FOOL_KEY) === "1";
  } catch {
    return false;
  }
}

function saveFound() {
  foolFound = true;
  try {
    window.localStorage.setItem(FOOL_KEY, "1");
  } catch {
    // Private mode: the chip lasts for this visit.
  }
}

function syncChips() {
  document.querySelectorAll(".fool-chip").forEach((chip) => {
    chip.hidden = !foolFound;
  });
}

function say(text) {
  if (!announcer) {
    announcer = document.createElement("p");
    announcer.className = "visually-hidden";
    announcer.setAttribute("aria-live", "polite");
    document.body.append(announcer);
  }
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = text;
  }, 60);
}

/* ============================================================ card 0 */

function stageOf(root) {
  return root?.querySelector?.(".fool-stage") ?? null;
}

function setFlipped(button, flipped) {
  button.classList.toggle("is-flipped", flipped);
  button.setAttribute("aria-pressed", String(flipped));
}

function summonFool(stage) {
  if (!stage || !stage.hidden) return;
  const card = stage.querySelector(".arcana--fool");
  const grid = stage.parentElement?.querySelector(".arcana-grid");
  if (!card) return;
  stage.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
  setFlipped(card, false);
  stage.hidden = false;
  grid?.classList.add("is-dimmed");

  if (prefersReducedMotion()) {
    animate(card, [{ opacity: 0 }, { opacity: 1 }], { duration: 0.2, ease: "linear" });
    sfx.bell();
  } else {
    animate(
      card,
      [
        { offset: 0, opacity: 0, rotate: "-8deg", translate: "120% -90%" },
        { offset: 0.25, opacity: 1 }
      ],
      { duration: DUR.panel, ease: "spring" }
    );
    animate(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.ui, ease: "linear" });
    drawSigils([card.querySelector(".arcana-front .sigil")].filter(Boolean), 0.16);
    sheen(card.querySelector(".arcana-front"), 0.5);
    // The bell lands with the card (the spring reaches its spot at about a third of the move).
    window.setTimeout(() => sfx.bell(), DUR.panel * 1000 * 0.32);
  }
  saveFound();
  card.focus({ preventScroll: true });
  say("Hidden card dealt: 0, The Fool.");
}

function dismissFool(stage) {
  if (!stage || stage.hidden || stage.dataset.leaving) return;
  const card = stage.querySelector(".arcana--fool");
  const grid = stage.parentElement?.querySelector(".arcana-grid");
  const hadFocus = stage.contains(document.activeElement);
  stage.dataset.leaving = "true";
  syncChips();
  sfx.back();

  const done = () => {
    stage.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
    stage.hidden = true;
    delete stage.dataset.leaving;
    setFlipped(card, false);
  };
  grid?.classList.remove("is-dimmed");
  const chip = stage.closest(".content-card")?.querySelector(".fool-chip");
  if (hadFocus && chip && !chip.hidden) chip.focus({ preventScroll: true });

  const leave = prefersReducedMotion()
    ? animate(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 0.12, ease: "linear", fill: "forwards" })
    : animate(
        card,
        [
          { opacity: 1, translate: "0 0", scale: "1" },
          { opacity: 0, translate: "90% 60%", scale: "0.5" }
        ],
        { duration: DUR.ui, ease: "in", fill: "forwards" }
      );
  if (leave) leave.finished.then(done, done);
  else done();
}

function onFoolClick(event) {
  const card = event.currentTarget;
  if (event.defaultPrevented) return;
  if (card.classList.contains("is-flipped")) {
    dismissFool(card.closest(".fool-stage"));
    return;
  }
  setFlipped(card, true);
  sheen(card.querySelector(".arcana-back"), 0.12);
  sfx.click();
}

function onChipClick(event) {
  const chip = event.currentTarget;
  const stage = stageOf(chip.closest(".content-card"));
  if (!stage) return;
  if (stage.hidden) summonFool(stage);
  else dismissFool(stage);
}

/* ======================================================= turning cards */

function markTurned(button) {
  const name = button.dataset.skill;
  if (!name || turned.has(name)) return;
  turned.add(name);
  if (foolDealt || !deckSize || turned.size < deckSize) return;
  foolDealt = true;
  const stage = stageOf(button.closest(".card-body"));
  // Let the last card finish turning before the hidden one arrives.
  window.setTimeout(() => summonFool(stage), prefersReducedMotion() ? 0 : DUR.panel * 1000);
}

function onCardClick(event) {
  const button = event.currentTarget;
  if (event.defaultPrevented) return;
  const flipped = !button.classList.contains("is-flipped");
  setFlipped(button, flipped);
  sfx.click();
  if (flipped) {
    sheen(button.querySelector(".arcana-back"), 0.12);
    markTurned(button);
  }
}

function onCardEnter(event) {
  const button = event.currentTarget;
  if (!hoverQuery.matches || event.pointerType === "touch") return;
  sheen(button.querySelector(".arcana-back"), 0.12);
  window.clearTimeout(button._turnTimer);
  button._turnTimer = window.setTimeout(() => markTurned(button), TURN_DWELL_MS);
}

function onCardLeave(event) {
  window.clearTimeout(event.currentTarget._turnTimer);
}

function onCardFocus(event) {
  const button = event.currentTarget;
  if (button.matches(":focus-visible")) markTurned(button);
}

/* ================================================================ idle */

function idleTick() {
  scheduleIdle();
  if (document.hidden || prefersReducedMotion()) return;
  const grids = Array.from(visibleGrids).filter((grid) => grid.isConnected && !grid.classList.contains("is-dimmed"));
  if (!grids.length) return;
  const grid = grids[Math.floor(Math.random() * grids.length)];
  const resting = Array.from(grid.querySelectorAll(".skill.arcana:not(.is-flipped)")).filter(
    (button) => !button.matches(":hover, :focus-visible")
  );
  if (!resting.length) return;
  sheen(resting[Math.floor(Math.random() * resting.length)].querySelector(".arcana-front"));
}

function scheduleIdle() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(idleTick, IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS);
}

function watchGrid(grid) {
  if (!("IntersectionObserver" in window)) return;
  if (!gridObserver) {
    gridObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleGrids.add(entry.target);
        else visibleGrids.delete(entry.target);
      });
    });
    scheduleIdle();
  }
  visibleGrids.forEach((known) => {
    if (!known.isConnected) {
      visibleGrids.delete(known);
      gridObserver.unobserve(known);
    }
  });
  gridObserver.observe(grid);
}

/* ================================================================ bind */

/** Wire up every arcana grid under `root` (idempotent; call after makeFracturable). */
export function bindArcana(root) {
  root.querySelectorAll(".arcana-grid").forEach((grid) => {
    if (grid.dataset.bound) return;
    grid.dataset.bound = "true";
    deckSize = grid.querySelectorAll(".skill.arcana").length;
    grid.querySelectorAll(".skill.arcana").forEach((button) => {
      button.addEventListener("click", onCardClick);
      button.addEventListener("pointerenter", onCardEnter);
      button.addEventListener("pointerleave", onCardLeave);
      button.addEventListener("focus", onCardFocus);
    });
    watchGrid(grid);
  });

  root.querySelectorAll(".fool-stage").forEach((stage) => {
    if (stage.dataset.bound) return;
    stage.dataset.bound = "true";
    stage.querySelector(".arcana--fool")?.addEventListener("click", onFoolClick);
    // A click on the dimmed grid around the card puts it away.
    stage.addEventListener("click", (event) => {
      if (event.target === stage) dismissFool(stage);
    });
    stage.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissFool(stage);
    });
  });

  root.querySelectorAll(".fool-chip").forEach((chip) => {
    if (chip.dataset.bound) return;
    chip.dataset.bound = "true";
    chip.hidden = !foolFound;
    chip.addEventListener("click", onChipClick);
  });
}
