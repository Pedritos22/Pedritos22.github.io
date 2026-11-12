// Card rendering, section transitions and the mobile stack.
// Owner: menu/panel workstream (B).
//
// Desktop: one persistent card (.content-card) whose decoration (plates, watermark, number,
// pager, wipe layer) stays in place while the content nodes are swapped under a diagonal
// wipe. Mobile (<= 920px): every section is rendered as its own card in
// .mobile-section-stack and revealed on scroll.
//
// Transition anatomy (desktop, full motion):
//   0ms      SECTION_WILL_CHANGE + whoosh. A "train" of bands enters from the direction side:
//            a cyan leading edge, the navy cover body, then electric blue, cyan and a thin
//            white streak trailing behind it. All bands lean at -8deg.
//   ~220ms   the navy body covers the card: content swap, SECTION_CHANGED.
//   ~240ms+  the train exits; the trailing bands uncover the new content while it cascades in
//            (kicker, title letters, lead, rows/cards, watermark, number).
// The train, the cascade and the sigils are Web Animations (compositor-driven), so the swap
// on the covered frame cannot stall them; card content comes from pre-parsed templates with
// the title already split into letters.
// Interrupting: the running animations are cancelled. A train that had not covered the card
// yet is parked over it (the next train removes it when that one covers); a train that was
// already leaving finishes leaving. The title goes back to plain text every time.
import { HOME, SECTIONS, SECTION_MAP, ROMAN } from "./content.js";
import {
  EVT,
  emit,
  on,
  state,
  afterIntro,
  isMobileLayout,
  onLayoutChange,
  prefersReducedMotion,
  escapeHtml as esc
} from "./core.js";
import { gsap, DUR, EASE, STAGGER, animate, enterFrom, allFinished, hasWaapi } from "./motion.js";
import { makeFracturable } from "./shatter.js";
import { renderSigil } from "./sigils.js";
import { glyph } from "./glyphs.js";
import { sfx } from "./sfx.js";

const ORDER = [HOME.id, ...SECTIONS.map((section) => section.id)];
const TOTAL = SECTIONS.length;
const TAN8 = Math.tan((8 * Math.PI) / 180);
const COPY_RESET_MS = 1800;

let card = null;
let stage = null;
let wipe = null;
let watermark = null;
let numberEl = null;
let backPlate = null;
let pager = null;
let announcer = null;
let mobileStack = null;

let target = HOME.id; // last requested section on desktop
let tl = null; // GSAP timeline of the entrance or the reduced-motion crossfade
let run = null; // running wipe: { train, swapped }
let token = 0; // bumped by every transition and interruption; stale callbacks compare it
let reveal = []; // WAAPI animations of the running content reveal (desktop card)
let cardSize = null; // border box of the desktop card, kept by a ResizeObserver
const templates = new Map(); // section id -> <template> of its desktop card content
let entrancePending = false;
let mobileBuilt = false;
let mobileObserver = null;
let resizeFrame = 0;

export function getSectionNames() {
  return SECTIONS.map((section) => section.id);
}

/* ================================================================ markup */

function rowMarkup([label, value, glyphName]) {
  const swatches =
    glyphName === "swatch"
      ? `<span class="swatches" aria-hidden="true"><i class="swatch swatch--blue"></i><i class="swatch swatch--navy"></i></span>`
      : "";
  return `<li class="row">
      <span class="row-glyph" aria-hidden="true">${glyph(glyphName)}</span>
      <span class="row-label">${esc(label)}</span>
      <strong class="row-value">${esc(value)}${swatches}</strong>
    </li>`;
}

function rowsMarkup(details, modifier) {
  return `<ul class="detail-list detail-list--${modifier}" role="list">${details.map(rowMarkup).join("")}</ul>`;
}

function archiveMarkup(section) {
  const cells = (section.focus || [])
    .map(
      (label, i) => `<li class="cal-cell">
        <span class="cal-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="cal-label">${esc(label)}</span>
      </li>`
    )
    .join("");
  return `
    ${rowsMarkup(section.details, "record")}
    <div class="archive-cal">
      <p class="archive-caption"><span>Focus areas</span></p>
      <span class="cal-rings" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <ol class="cal-grid" role="list">${cells}</ol>
    </div>`;
}

function arcanaMarkup(section) {
  return `<ul class="arcana-grid" role="list">${section.skills
    .map(([name, description], i) => {
      const numeral = ROMAN[i] ?? String(i + 1);
      return `<li class="arcana-slot">
        <button class="skill arcana" type="button" aria-pressed="false" data-numeral="${numeral}">
          <span class="arcana-inner">
            <span class="arcana-face arcana-front">
              <span class="arcana-numeral" aria-hidden="true">${numeral}</span>
              <span class="arcana-sigil">${renderSigil(name)}</span>
              <span class="arcana-name">${esc(name)}</span>
            </span>
            <span class="arcana-face arcana-back">
              <span class="arcana-back-head" aria-hidden="true"><span>${numeral}</span><span>${esc(name)}</span></span>
              <span class="arcana-desc">${esc(description)}</span>
              <span class="arcana-ghost" aria-hidden="true">${renderSigil(name)}</span>
            </span>
          </span>
        </button>
      </li>`;
    })
    .join("")}</ul>`;
}

/** Optional card action (section.action = [label, data-attribute]), in the card's footer strip. */
function actionMarkup(section) {
  if (!section.action) return "";
  const [label, hook] = section.action;
  return `<div class="card-action"><button class="action-link" type="button" data-${esc(hook)}><span>${esc(label)}</span></button></div>`;
}

/** Escaped text with soft break opportunities after "/" and before "@" (long URLs on phones). */
function breakable(text) {
  return esc(text).replace(/\//g, "/<wbr>").replace(/@/g, "<wbr>@");
}

function contactMarkup(section) {
  const rows = section.links
    .map((link) => {
      const external = link.external ? ` target="_blank" rel="noopener noreferrer"` : "";
      const trail = link.copy
        ? `<button class="copy-btn" type="button" data-copy="${esc(link.value)}" aria-label="Copy ${esc(link.label.toLowerCase())} address">
            <span class="copy-glyph copy-glyph--idle">${glyph("copy")}</span>
            <span class="copy-glyph copy-glyph--done">${glyph("check")}</span>
            <span class="copy-text" aria-live="polite">Copy</span>
          </button>`
        : "";
      return `<li class="row link-row${link.copy ? " has-copy" : ""}">
        <a class="link-main" href="${esc(link.href)}"${external}>
          <span class="row-glyph" aria-hidden="true">${glyph(link.glyph)}</span>
          <span class="row-label">${esc(link.label)}</span>
          <span class="row-value">${breakable(link.value)}</span>
          ${link.external ? `<span class="link-ext" aria-hidden="true">${glyph("external")}</span><span class="visually-hidden"> (opens in a new tab)</span>` : ""}
        </a>
        ${trail}
      </li>`;
    })
    .join("");

  const actions = (section.actions || [])
    .map(([label, href, variant]) => {
      const external = /^https?:/.test(href) ? ` target="_blank" rel="noopener noreferrer"` : "";
      return `<a class="action-link ${variant}" href="${esc(href)}"${external}><span>${esc(label)}</span></a>`;
    })
    .join("");

  return `<ul class="detail-list detail-list--links" role="list">${rows}</ul>
    ${actions ? `<div class="actions">${actions}</div>` : ""}`;
}

/** Quick-start tiles: shortcuts into the menu (desktop home card). */
function startMarkup(section) {
  if (!section.start?.length) return "";
  const tiles = section.start
    .map(([id, caption]) => {
      const target = SECTION_MAP[id];
      if (!target) return "";
      return `<li><button class="quick-tile" type="button" data-goto="${esc(id)}">
          <span class="quick-tile__code">${esc(target.code)}</span>
          <span class="quick-tile__name">${esc(target.menu)}</span>
          <span class="quick-tile__hint">${esc(caption)}</span>
          <span class="quick-tile__arrow" aria-hidden="true">${glyph("external")}</span>
        </button></li>`;
    })
    .join("");
  return `<nav class="quick-start" aria-label="Quick start">
      <p class="quick-start__label"><span>Start here</span></p>
      <ul class="quick-start__grid" role="list">${tiles}</ul>
    </nav>`;
}

function bodyMarkup(section) {
  switch (section.kind) {
    case "facts":
      return rowsMarkup(section.details, "facts") + startMarkup(section);
    case "profile":
      return rowsMarkup(section.details, "profile");
    case "archive":
      return archiveMarkup(section);
    case "arcana":
      return arcanaMarkup(section);
    case "contact":
      return contactMarkup(section);
    case "custom":
      return `<div class="section-custom" data-render="${esc(section.id)}"></div>`;
    default:
      return section.details ? rowsMarkup(section.details, "profile") : "";
  }
}

/**
 * Title split into words and letters for the reveal, already in the markup so no runtime
 * splitting (and its layout pass) lands on the swap frame. Screen readers get the plain
 * text; unsplitTitles() restores it once the letters have landed (kerning comes back).
 */
function splitTitleMarkup(text) {
  const words = String(text)
    .split(/(\s+)/)
    .map((part) => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return " ";
      const letters = Array.from(part).map((letter) => `<span class="split-char">${esc(letter)}</span>`).join("");
      return `<span class="split-word">${letters}</span>`;
    })
    .join("");
  return `<span class="visually-hidden">${esc(text)}</span><span class="split-text" aria-hidden="true">${words}</span>`;
}

/** The swappable nodes: kicker, title, lead and body. */
function contentMarkup(section, titleId, { splitTitle = false } = {}) {
  const title = splitTitle
    ? `<h2 id="${titleId}" data-split>${splitTitleMarkup(section.title)}</h2>`
    : `<h2 id="${titleId}">${esc(section.title)}</h2>`;
  return `<p class="section-kicker">${esc(section.label)}</p>
    ${title}
    <p class="card-lead">${esc(section.copy)}</p>
    <div class="card-body" data-kind="${esc(section.kind)}">${bodyMarkup(section)}</div>
    ${actionMarkup(section)}`;
}

/** Put split titles back to plain text (one text node: proper kerning, clean copy/paste). */
function unsplitTitles(root) {
  root?.querySelectorAll("h2[data-split]").forEach((title) => {
    const text = title.querySelector(".visually-hidden")?.textContent ?? title.textContent;
    title.textContent = text;
    title.removeAttribute("data-split");
  });
}

/** Desktop card content for a section, parsed once and cloned on every visit. */
function contentFragment(section) {
  let template = templates.get(section.id);
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = contentMarkup(section, "card-title", { splitTitle: true });
    templates.set(section.id, template);
  }
  return template.content.cloneNode(true);
}

/** Persistent decoration: back plate + main plate with watermark, number and hairlines. */
function decoMarkup(section) {
  return `<span class="card-back" aria-hidden="true"></span>
    <span class="card-plate" aria-hidden="true">
      <span class="card-hair card-hair--top"></span>
      <span class="card-hair card-hair--cross"></span>
      <span class="card-watermark">${esc(section.stamp)}</span>
      <span class="card-num">${esc(section.code)}</span>
    </span>`;
}

function pagerMarkup() {
  const pips = SECTIONS.map(() => "<i></i>").join("");
  return `<span class="card-pager" aria-hidden="true">
      <span class="pager-pips">${pips}</span>
      <span class="pager-count"><b>00</b><span>/ ${String(TOTAL).padStart(2, "0")}</span></span>
    </span>`;
}

/* ============================================================ hydration */

/** Run custom render() hooks for sections that define one. */
function hydrateCustom(root) {
  root.querySelectorAll("[data-render]").forEach((container) => {
    if (container.dataset.rendered === "true") return;
    container.dataset.rendered = "true";
    const section = SECTION_MAP[container.dataset.render];
    try {
      section?.render?.(container);
    } catch (error) {
      console.error(`[sections] render hook failed for ${container.dataset.render}`, error);
    }
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function onCopyClick(event) {
  const button = event.currentTarget;
  // The glass engine swallows rapid clicks (it calls preventDefault once a row cracks).
  if (event.defaultPrevented) return;
  const label = button.querySelector(".copy-text");
  copyText(button.dataset.copy).then((ok) => {
    window.clearTimeout(button._copyTimer);
    button.classList.toggle("is-copied", ok);
    button.classList.toggle("is-failed", !ok);
    if (label) label.textContent = ok ? "Copied" : "Copy failed";
    if (ok) sfx.confirm();
    else sfx.back();
    button._copyTimer = window.setTimeout(() => {
      button.classList.remove("is-copied", "is-failed");
      if (label) label.textContent = "Copy";
    }, COPY_RESET_MS);
  });
}

function onArcanaClick(event) {
  const button = event.currentTarget;
  if (event.defaultPrevented) return;
  const flipped = !button.classList.contains("is-flipped");
  button.classList.toggle("is-flipped", flipped);
  button.setAttribute("aria-pressed", String(flipped));
  sfx.click();
}

/** Bind interactive bits once per element. Call after makeFracturable so glass runs first. */
function bindInteractions(root) {
  root.querySelectorAll(".copy-btn").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", onCopyClick);
  });
  root.querySelectorAll(".skill.arcana").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", onArcanaClick);
  });
}

function hydrate(root) {
  hydrateCustom(root);
  makeFracturable(root);
  bindInteractions(root);
}

/* ======================================================= desktop: state */

function contentNodes() {
  if (!card) return [];
  return Array.from(card.querySelectorAll(":scope > .section-kicker, :scope > h2, :scope > .card-lead, :scope > .card-body, :scope > .card-action"));
}

function revealTargets(root) {
  const body = root.querySelector(".card-body");
  const action = root.querySelector(".card-action");
  return {
    kicker: root.querySelector(".section-kicker"),
    title: root.querySelector("h2"),
    lead: root.querySelector(".card-lead"),
    items: [
      ...(body
        ? body.querySelectorAll(
            ".detail-list > li, .archive-caption, .cal-rings, .cal-cell, .arcana-slot, .actions > *, .section-custom, .quick-start__label, .quick-start__grid > li"
          )
        : []),
      ...(action ? [action] : [])
    ],
    sigils: body ? Array.from(body.querySelectorAll(".arcana-front .sigil")) : []
  };
}

function updatePager(index) {
  if (!pager) return;
  pager.querySelectorAll(".pager-pips i").forEach((pip, i) => pip.classList.toggle("is-on", i + 1 === index));
  const count = pager.querySelector(".pager-count b");
  if (count) count.textContent = String(index).padStart(2, "0");
}

function announce(section) {
  if (announcer) announcer.textContent = `${section.menu}: ${section.title}`;
}

/** Track whether the card body needs to scroll (shows a fade at the bottom edge). */
function updateOverflow(root = card) {
  root?.querySelectorAll(".card-body").forEach((body) => {
    body.classList.toggle("is-overflowing", body.scrollHeight > body.clientHeight + 2);
  });
}

/**
 * Swap the card content (runs on the covered frame, so it stays lean: a cloned fragment,
 * no layout reads; updateOverflow() waits for the end of the transition).
 */
function swapContent(section) {
  contentNodes().forEach((node) => {
    gsap.killTweensOf(node);
    gsap.killTweensOf(node.querySelectorAll("*"));
    node.remove();
  });

  card.insertBefore(contentFragment(section), pager);

  card.dataset.section = section.stamp;
  card.dataset.kind = section.kind;
  if (watermark) watermark.textContent = section.stamp;
  if (numberEl) numberEl.textContent = section.code;
  const index = ORDER.indexOf(section.id);
  updatePager(index);

  hydrate(card);
  const body = card.querySelector(".card-body");
  if (body) body.scrollTop = 0;

  const from = state.section;
  state.section = section.id;
  announce(section);
  emit(EVT.SECTION_CHANGED, { from, to: section.id, index });
}

function cancelReveal() {
  reveal.forEach((animation) => animation.cancel());
  reveal = [];
}

/** Snap every animated element to its resting state and drop inline styles. */
function cleanupReveal() {
  cancelReveal();
  if (!card) return;
  unsplitTitles(card);
  const nodes = [...contentNodes(), watermark, numberEl, backPlate, card].filter(Boolean);
  gsap.killTweensOf(nodes);
  gsap.set(nodes, { clearProps: "transform,opacity,visibility,clipPath" });
}

/* ================================================== desktop: animation */

/** Draw every sigil in, all cards in parallel (a short offset per card). */
function drawSigils(sigils, delay) {
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
  });
  return animations;
}

/**
 * Cascade the content of `root` in: kicker, title letters, lead, rows/cards, sigils.
 * Web Animations that start `delay` seconds from now; returns them (already hiding the
 * targets, like GSAP from-tweens).
 */
function startReveal(root, { direction = 1, delay = 0 } = {}) {
  const { kicker, title, lead, items, sigils } = revealTargets(root);
  const animations = [];
  const at = (offset) => ({ duration: DUR.panel, delay: delay + offset, ease: "out" });

  if (kicker) animations.push(enterFrom(kicker, { x: -28 * direction }, at(0)));

  if (title) {
    const letters = title.querySelectorAll(".split-char");
    if (letters.length) {
      const amount = Math.min(0.22, letters.length * 0.012);
      const step = letters.length > 1 ? amount / (letters.length - 1) : 0;
      letters.forEach((letter, i) => animations.push(enterFrom(letter, { y: "62%" }, at(0.02 + i * step))));
    } else {
      animations.push(enterFrom(title, { y: 18 }, at(0.02)));
    }
  }

  if (lead) animations.push(enterFrom(lead, { y: 12 }, at(0.08)));
  items.forEach((item, i) => animations.push(enterFrom(item, { x: 22 * direction }, at(0.12 + i * STAGGER))));
  if (sigils.length) animations.push(...drawSigils(sigils, delay + 0.22));
  return animations.filter(Boolean);
}

/** Watermark slides along its own -8deg baseline; the big number rises. */
function startWatermark(direction, delay = 0) {
  const animations = [];
  if (watermark) {
    const distance = 120 * direction;
    animations.push(
      enterFrom(
        watermark,
        { x: distance * Math.cos(0.1396), y: -distance * Math.sin(0.1396) },
        { duration: DUR.scene, delay, ease: "out" }
      )
    );
  }
  if (numberEl) {
    animations.push(enterFrom(numberEl, { y: "36%" }, { duration: DUR.panel, delay: delay + 0.08, ease: "out" }));
  }
  return animations.filter(Boolean);
}

/** Geometry of a wipe train for a card of size w x h. */
function trainGeometry(w, h, direction) {
  const bleed = 24;
  const overhang = Math.ceil(((h + bleed * 2) / 2) * TAN8) + 8;
  const trail = 4 + 10 + 18 + 40; // streak + gap + cyan + blue, in px (see .wb-* in panel.css)
  const lead = 3;
  const navy = Math.ceil(w + overhang * 2 + 32);
  const length = trail + navy + lead;
  // Positions of the train's left edge for a left-to-right sweep.
  let start = -(length + overhang + 8);
  let cover = -overhang - 16 - trail;
  let end = w + overhang + 8;
  if (direction < 0) {
    // Mirror: x' = w - (x + length)
    start = w - (start + length);
    cover = w - (cover + length);
    end = w - (end + length);
  }
  return { bleed, navy, length, start, cover, end };
}

const trainTransform = (x) => `translateX(${Math.round(x * 10) / 10}px) skewX(-8deg)`;

/** Current x of a train, read from its computed (possibly animated) transform. */
function trainX(train) {
  try {
    return new DOMMatrixReadOnly(getComputedStyle(train).transform).e;
  } catch {
    return train._geo.cover;
  }
}

/** Move a train between two x positions on the compositor; it holds the end position. */
function moveTrain(train, from, to, { duration, ease, delay = 0 }) {
  train.style.transform = trainTransform(from);
  return animate(train, [{ transform: trainTransform(from) }, { transform: trainTransform(to) }], {
    duration,
    delay,
    ease,
    fill: "both"
  });
}

function makeTrain(section, direction) {
  // The ResizeObserver keeps the size, so the click handler never forces a layout.
  const w = cardSize?.w ?? card.offsetWidth;
  const h = cardSize?.h ?? card.offsetHeight;
  const geo = trainGeometry(w, h, direction);
  const train = document.createElement("span");
  train.className = "wipe-train";
  train.dataset.dir = String(direction);
  train.style.setProperty("--navy-w", `${geo.navy}px`);
  train.style.setProperty("--wipe-bleed", `${geo.bleed}px`);
  train.style.transform = trainTransform(geo.start);
  train.innerHTML = `<i class="wb wb-streak"></i><i class="wb wb-gap"></i><i class="wb wb-cyan"></i><i class="wb wb-blue"></i><i class="wb wb-navy"><span class="wb-label">${esc(section.code)}</span></i><i class="wb wb-edge"></i>`;
  train._geo = geo;
  wipe.appendChild(train);
  return train;
}

function removeOtherTrains(keep) {
  wipe?.querySelectorAll(".wipe-train").forEach((train) => {
    if (train === keep) return;
    train.getAnimations?.().forEach((animation) => animation.cancel());
    train.remove();
  });
}

function finishTransition() {
  cleanupReveal();
  run?.train.remove();
  run = null;
  removeOtherTrains(null);
  tl = null;
  updateOverflow();
}

/** Kill the running transition and leave everything in a clean, resting state. */
function interruptCurrent() {
  token += 1;
  if (!tl && !run && !reveal.length) return;
  const current = run;
  tl?.kill();
  tl = null;
  run = null;
  cleanupReveal();
  if (!current) return;
  const { train, swapped } = current;
  const x = trainX(train);
  train.getAnimations?.().forEach((animation) => animation.cancel());
  if (!swapped) {
    // Park it over the card; the next train removes it once that one covers the card.
    moveTrain(train, x, train._geo.cover, { duration: DUR.micro, ease: "out" });
  } else {
    const leave = moveTrain(train, x, train._geo.end, { duration: DUR.ui * 0.8, ease: "in" });
    if (leave) leave.finished.then(() => train.remove(), () => {});
    else train.remove();
  }
}

function crossfadeTo(section) {
  const nodes = contentNodes();
  tl = gsap.timeline({ onComplete: finishTransition });
  tl.to(nodes, { opacity: 0, duration: 0.08, ease: "none" });
  tl.add(() => {
    swapContent(section);
    unsplitTitles(card); // no letter cascade here
    tl.fromTo(contentNodes(), { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, tl.time());
  });
}

// Wipe timing (seconds): cover fast (decelerating into place), swap, then peel off
// accelerating so the trailing bands sweep the new content in from the direction side.
// Keep the covered hold short: a long still navy frame reads as lag.
const COVER_S = 0.18;
const HOLD_S = 0.02;
const EXIT_S = 0.3;

function transitionTo(sectionName, direction) {
  const section = SECTION_MAP[sectionName];
  interruptCurrent();

  if (prefersReducedMotion() || !hasWaapi) {
    crossfadeTo(section);
    return;
  }

  const id = token;
  const train = makeTrain(section, direction);
  const geo = train._geo;
  run = { train, swapped: false };

  const cover = moveTrain(train, geo.start, geo.cover, { duration: COVER_S, ease: "power2Out" });
  cover.finished.then(
    () => {
      if (id !== token) return;
      run.swapped = true;
      removeOtherTrains(train);
      swapContent(section);
      // All of these run on the compositor: the swap's style and layout work cannot stall them.
      const exit = moveTrain(train, geo.cover, geo.end, { duration: EXIT_S, delay: HOLD_S, ease: "power1In" });
      reveal.push(...startWatermark(direction, 0.04), ...startReveal(card, { direction, delay: 0.06 }));
      allFinished([exit, ...reveal]).then(() => {
        if (id === token) finishTransition();
      });
    },
    () => {} // cancelled by an interruption
  );
}

/** Desktop entrance after the intro: the card is cut in along the diagonal, then content cascades. */
function playEntrance() {
  if (!entrancePending || !card) return;
  entrancePending = false;
  interruptCurrent();

  if (prefersReducedMotion() || !hasWaapi) {
    tl = gsap.timeline({ onComplete: finishTransition });
    tl.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none", clearProps: "opacity" });
    return;
  }

  const id = token;
  const delay = 0.12;
  const cut = new Promise((resolve) => {
    tl = gsap.timeline({ delay, onComplete: resolve });
  });
  tl.fromTo(
    card,
    { clipPath: "polygon(0% -6%, 0% -6%, -16% 106%, -16% 106%)" },
    {
      clipPath: "polygon(0% -6%, 118% -6%, 102% 106%, -16% 106%)",
      duration: DUR.scene,
      ease: EASE.snap,
      clearProps: "clipPath"
    },
    0
  );
  if (backPlate) {
    tl.fromTo(
      backPlate,
      { x: -12, y: -12 },
      { x: 0, y: 0, duration: DUR.panel, ease: EASE.spring, clearProps: "transform" },
      DUR.scene - 0.06
    );
  }
  reveal.push(...startWatermark(1, delay + 0.3), ...startReveal(card, { direction: 1, delay: delay + 0.34 }));
  Promise.all([cut, allFinished(reveal)]).then(() => {
    if (id === token) finishTransition();
  });
}

/* ================================================================ mobile */

function mobileCardMarkup(section) {
  return `<article class="content-card" id="section-${esc(section.id)}" data-section="${esc(section.stamp)}" data-kind="${esc(section.kind)}" aria-labelledby="title-${esc(section.id)}">
      ${decoMarkup(section)}
      ${contentMarkup(section, `title-${section.id}`)}
    </article>`;
}

function revealMobileCard(element) {
  gsap.to(element, { y: 0, opacity: 1, duration: DUR.scene, ease: EASE.out, clearProps: "transform,opacity" });
  startReveal(element, { direction: 1, delay: 0.12 });
  const mark = element.querySelector(".card-watermark");
  if (mark) enterFrom(mark, { x: 60, y: -8 }, { duration: DUR.scene, delay: 0.1, ease: "out" });
}

function setupMobileReveal() {
  if (!mobileStack) return;
  const cards = Array.from(mobileStack.querySelectorAll(".content-card"));
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;

  gsap.set(cards, { y: 48, opacity: 0 });
  afterIntro(() => {
    mobileObserver?.disconnect();
    mobileObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          mobileObserver.unobserve(entry.target);
          revealMobileCard(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );
    cards.forEach((element) => mobileObserver.observe(element));
  });
}

function buildMobile() {
  if (!mobileStack || mobileBuilt) return;
  mobileBuilt = true;
  mobileStack.innerHTML = ORDER.map((id) => mobileCardMarkup(SECTION_MAP[id])).join("");
  hydrate(mobileStack);
  setupMobileReveal();
}

function scrollToMobileSection(sectionName) {
  const element = document.getElementById(`section-${sectionName}`);
  if (!element) return;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

/* ================================================================== API */

/** Show a section (desktop: wipe the card over; mobile: scroll to it). */
export function showSection(sectionName) {
  if (!SECTION_MAP[sectionName]) return;

  if (isMobileLayout()) {
    buildMobile();
    scrollToMobileSection(sectionName);
    const from = state.section;
    target = sectionName;
    state.section = sectionName;
    emit(EVT.SECTION_CHANGED, { from, to: sectionName, index: ORDER.indexOf(sectionName) });
    return;
  }

  if (!card || sectionName === target) return;

  const from = target;
  const fromIndex = ORDER.indexOf(from);
  const toIndex = ORDER.indexOf(sectionName);
  const direction = toIndex >= fromIndex ? 1 : -1;
  target = sectionName;

  emit(EVT.SECTION_WILL_CHANGE, { from, to: sectionName, direction, index: toIndex });
  sfx.whoosh();
  transitionTo(sectionName, direction);
}

export function showHome() {
  showSection(HOME.id);
}

/** The section the desktop card is showing or heading to. */
export function getTargetSection() {
  return target;
}

/** Render `sectionName` into the desktop card immediately, without a transition. */
function renderInstant(sectionName) {
  interruptCurrent();
  removeOtherTrains(null);
  swapContent(SECTION_MAP[sectionName] ?? HOME);
  unsplitTitles(card);
  updateOverflow();
  target = state.section;
}

/** Parse every section's card content ahead of time, while the page is idle. */
function prewarmTemplates() {
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 200));
  const queue = SECTIONS.slice();
  const next = (deadline) => {
    while (queue.length && (!deadline?.timeRemaining || deadline.timeRemaining() > 4)) {
      contentFragment(queue.shift());
    }
    if (queue.length) idle(next, { timeout: 2000 });
  };
  idle(next, { timeout: 2000 });
}

function onResize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => updateOverflow());
}

export function init() {
  stage = document.querySelector(".panel-wrap > .card-stage");
  card = stage?.querySelector(".content-card") ?? document.querySelector(".panel-wrap > .content-card");
  mobileStack = document.querySelector(".mobile-section-stack");
  announcer = document.querySelector("[data-section-announcer]");

  if (card) {
    // The title arrives split when the entrance will cascade its letters in.
    const splitTitle = !isMobileLayout() && !prefersReducedMotion();
    card.innerHTML = `${decoMarkup(HOME)}${contentMarkup(HOME, "card-title", { splitTitle })}${pagerMarkup()}<span class="card-wipe" aria-hidden="true"></span>`;
    card.setAttribute("aria-labelledby", "card-title");
    card.dataset.section = HOME.stamp;
    card.dataset.kind = HOME.kind;
    watermark = card.querySelector(".card-watermark");
    numberEl = card.querySelector(".card-num");
    backPlate = card.querySelector(".card-back");
    pager = card.querySelector(".card-pager");
    wipe = card.querySelector(".card-wipe");
    updatePager(0);
    hydrate(card);
    state.section = HOME.id;
    target = HOME.id;

    if ("ResizeObserver" in window) {
      new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0];
        cardSize = box ? { w: box.inlineSize, h: box.blockSize } : { w: card.offsetWidth, h: card.offsetHeight };
      }).observe(card);
    }

    if (!isMobileLayout()) {
      entrancePending = true;
      if (prefersReducedMotion()) gsap.set(card, { opacity: 0 });
      else gsap.set(card, { clipPath: "polygon(0% -6%, 0% -6%, -16% 106%, -16% 106%)" });
    }
  }

  if (isMobileLayout()) buildMobile();

  afterIntro(() => {
    const cascades = entrancePending; // the entrance unsplits the title when it finishes
    playEntrance();
    if (!cascades) unsplitTitles(card);
    requestAnimationFrame(() => updateOverflow());
    prewarmTemplates();
  });
  document.fonts?.ready?.then(() => updateOverflow());
  window.addEventListener("resize", onResize, { passive: true });

  onLayoutChange((mobile) => {
    if (mobile) {
      interruptCurrent();
      buildMobile();
      return;
    }
    // Back to desktop: make sure the card is visible and shows the current section.
    if (entrancePending) {
      entrancePending = false;
      gsap.set(card, { clearProps: "clipPath,opacity" });
      unsplitTitles(card);
    }
    if (card && state.section !== target) renderInstant(state.section);
    else updateOverflow();
  });

  // Quick-start tiles go through the menu, so the cursor, marker and sounds stay in sync.
  // Capture phase: the glass engine stops click propagation inside the card.
  document.addEventListener(
    "click",
    (event) => {
      const tile = event.target.closest?.("[data-goto]");
      if (!tile) return;
      event.stopPropagation(); // a shortcut press is not a knock on the glass
      const item =document.querySelector(`.menu-item[data-section="${CSS.escape(tile.dataset.goto)}"]`);
      if (item && !item.disabled) item.click();
      else showSection(tile.dataset.goto);
    },
    true
  );

  on(EVT.RESET, () => {
    // shatter.js repairs the glass first; re-measure in case broken pieces changed sizes.
    requestAnimationFrame(() => updateOverflow());
  });
}
