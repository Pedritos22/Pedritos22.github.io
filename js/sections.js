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
// Interrupting: the running timeline is killed. A train that had not covered the card yet is
// parked over it (the next train removes it when that one covers); a train that was already
// leaving finishes leaving. Split text is reverted and inline styles are cleared every time.
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
import { gsap, SplitText, DUR, EASE, STAGGER } from "./motion.js";
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
let tl = null; // running transition / entrance timeline
let swapped = false; // has the running transition swapped the content yet?
let split = null; // SplitText instance on the title while it animates in
let currentTrain = null;
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

function bodyMarkup(section) {
  switch (section.kind) {
    case "facts":
      return rowsMarkup(section.details, "facts");
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

/** The swappable nodes: kicker, title, lead and body. */
function contentMarkup(section, titleId) {
  return `<p class="section-kicker">${esc(section.label)}</p>
    <h2 id="${titleId}">${esc(section.title)}</h2>
    <p class="card-lead">${esc(section.copy)}</p>
    <div class="card-body" data-kind="${esc(section.kind)}">${bodyMarkup(section)}</div>`;
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
  return Array.from(card.querySelectorAll(":scope > .section-kicker, :scope > h2, :scope > .card-lead, :scope > .card-body"));
}

function revealTargets(root) {
  const body = root.querySelector(".card-body");
  return {
    kicker: root.querySelector(".section-kicker"),
    title: root.querySelector("h2"),
    lead: root.querySelector(".card-lead"),
    items: body
      ? Array.from(
          body.querySelectorAll(
            ".detail-list > li, .archive-caption, .cal-rings, .cal-cell, .arcana-slot, .actions > *, .section-custom"
          )
        )
      : [],
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

function swapContent(section) {
  revertSplit();
  const old = contentNodes();
  old.forEach((node) => {
    gsap.killTweensOf(node);
    gsap.killTweensOf(node.querySelectorAll("*"));
    node.remove();
  });

  const template = document.createElement("template");
  template.innerHTML = contentMarkup(section, "card-title");
  card.insertBefore(template.content, pager);

  card.dataset.section = section.stamp;
  card.dataset.kind = section.kind;
  if (watermark) watermark.textContent = section.stamp;
  if (numberEl) numberEl.textContent = section.code;
  const index = ORDER.indexOf(section.id);
  updatePager(index);

  hydrate(card);
  const body = card.querySelector(".card-body");
  if (body) body.scrollTop = 0;
  updateOverflow();

  const from = state.section;
  state.section = section.id;
  announce(section);
  emit(EVT.SECTION_CHANGED, { from, to: section.id, index });
}

function revertSplit() {
  if (split) {
    split.revert();
    split = null;
  }
}

/** Snap every animated element to its resting state and drop inline styles. */
function cleanupReveal() {
  revertSplit();
  if (!card) return;
  const { kicker, title, lead, items, sigils } = revealTargets(card);
  const nodes = [kicker, title, lead, ...items, watermark, numberEl, backPlate, card].filter(Boolean);
  gsap.killTweensOf(nodes);
  gsap.set(nodes, { clearProps: "transform,opacity,visibility,clipPath" });
  sigils.forEach(resetSigil);
}

/** Sigil parts carry no inline styles at rest; drop whatever a draw-in left behind. */
function resetSigil(svg) {
  const parts = svg.querySelectorAll(".sg-draw, .sg-dot, .sg-dash");
  gsap.killTweensOf(parts);
  parts.forEach((part) => {
    part.removeAttribute("style");
    delete part._gsap;
  });
}

/* ================================================== desktop: animation */

/** Draw every sigil in, all cards in parallel (a short offset per card). */
function drawSigils(sigils) {
  const draw = gsap.timeline();
  sigils.forEach((svg, i) => {
    const at = i * STAGGER;
    const strokes = svg.querySelectorAll(".sg-draw");
    const dots = svg.querySelectorAll(".sg-dot");
    const dashes = svg.querySelectorAll(".sg-dash");
    if (strokes.length) {
      draw.fromTo(
        strokes,
        { strokeDasharray: "1 1", strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          duration: DUR.panel,
          ease: "power2.inOut",
          stagger: { amount: 0.16 },
          clearProps: "strokeDasharray,strokeDashoffset"
        },
        at
      );
    }
    if (dashes.length) draw.from(dashes, { opacity: 0, duration: DUR.ui, ease: EASE.out, clearProps: "opacity" }, at + 0.12);
    if (dots.length) {
      draw.from(
        dots,
        {
          opacity: 0,
          scale: 0,
          transformOrigin: "50% 50%",
          duration: DUR.ui,
          ease: EASE.spring,
          stagger: { amount: 0.1 },
          clearProps: "opacity,transform,transformOrigin"
        },
        at + 0.3
      );
    }
  });
  return draw;
}

/** Cascade the content of `root` in. Returns a timeline (from-tweens render immediately). */
function buildReveal(root, { direction = 1, splitTitle = true } = {}) {
  const { kicker, title, lead, items, sigils } = revealTargets(root);
  const reveal = gsap.timeline();

  if (kicker) reveal.from(kicker, { x: -28 * direction, opacity: 0, duration: DUR.panel, ease: EASE.out }, 0);

  if (title) {
    if (splitTitle && SplitText) {
      revertSplit();
      split = new SplitText(title, { type: "words,chars", wordsClass: "split-word", charsClass: "split-char" });
      const chars = split.chars;
      reveal.from(
        chars,
        {
          yPercent: 62,
          opacity: 0,
          duration: DUR.panel,
          ease: EASE.out,
          stagger: { amount: Math.min(0.22, chars.length * 0.012) }
        },
        0.02
      );
      reveal.add(revertSplit);
    } else {
      reveal.from(title, { y: 18, opacity: 0, duration: DUR.panel, ease: EASE.out }, 0.02);
    }
  }

  if (lead) reveal.from(lead, { y: 12, opacity: 0, duration: DUR.panel, ease: EASE.out }, 0.08);

  if (items.length) {
    reveal.from(
      items,
      { x: 22 * direction, opacity: 0, duration: DUR.panel, ease: EASE.out, stagger: STAGGER },
      0.12
    );
  }

  if (sigils.length) reveal.add(drawSigils(sigils), 0.22);
  return reveal;
}

function watermarkIn(direction) {
  const group = gsap.timeline();
  if (watermark) {
    // Slide along the watermark's own -8deg baseline.
    const distance = 120 * direction;
    group.fromTo(
      watermark,
      { x: distance * Math.cos(0.1396), y: -distance * Math.sin(0.1396), opacity: 0 },
      { x: 0, y: 0, opacity: 1, duration: DUR.scene, ease: EASE.out, clearProps: "transform,opacity" },
      0
    );
  }
  if (numberEl) {
    group.fromTo(
      numberEl,
      { yPercent: 36, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: DUR.panel, ease: EASE.out, clearProps: "transform,opacity" },
      0.08
    );
  }
  return group;
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

function makeTrain(section, direction) {
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const geo = trainGeometry(w, h, direction);
  const train = document.createElement("span");
  train.className = "wipe-train";
  train.dataset.dir = String(direction);
  train.style.setProperty("--navy-w", `${geo.navy}px`);
  train.style.setProperty("--wipe-bleed", `${geo.bleed}px`);
  train.innerHTML = `<i class="wb wb-streak"></i><i class="wb wb-gap"></i><i class="wb wb-cyan"></i><i class="wb wb-blue"></i><i class="wb wb-navy"><span class="wb-label">${esc(section.code)}</span></i><i class="wb wb-edge"></i>`;
  train._geo = geo;
  wipe.appendChild(train);
  gsap.set(train, { x: geo.start, skewX: -8 });
  return train;
}

function removeOtherTrains(keep) {
  wipe?.querySelectorAll(".wipe-train").forEach((train) => {
    if (train === keep) return;
    gsap.killTweensOf(train);
    train.remove();
  });
}

function finishTransition() {
  cleanupReveal();
  if (currentTrain) {
    gsap.killTweensOf(currentTrain);
    currentTrain.remove();
    currentTrain = null;
  }
  removeOtherTrains(null);
  tl = null;
  swapped = false;
  updateOverflow();
}

/** Kill the running transition and leave everything in a clean, resting state. */
function interruptCurrent() {
  if (!tl) return;
  const train = currentTrain;
  const wasSwapped = swapped;
  tl.kill();
  tl = null;
  swapped = false;
  currentTrain = null;
  cleanupReveal();
  if (!train) return;
  gsap.killTweensOf(train);
  if (!wasSwapped) {
    // Park it over the card; the next train removes it once that one covers the card.
    gsap.to(train, { x: train._geo.cover, duration: DUR.micro, ease: EASE.out });
  } else {
    gsap.to(train, {
      x: train._geo.end,
      duration: DUR.ui * 0.8,
      ease: EASE.in,
      onComplete: () => train.remove()
    });
  }
}

function crossfadeTo(section) {
  const nodes = contentNodes();
  tl = gsap.timeline({ onComplete: finishTransition });
  tl.to(nodes, { opacity: 0, duration: 0.08, ease: "none" });
  tl.add(() => {
    swapped = true;
    swapContent(section);
    tl.fromTo(contentNodes(), { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, tl.time());
  });
}

function transitionTo(sectionName, direction) {
  const section = SECTION_MAP[sectionName];
  interruptCurrent();

  if (prefersReducedMotion()) {
    crossfadeTo(section);
    return;
  }

  const train = makeTrain(section, direction);
  currentTrain = train;
  swapped = false;

  // Cover fast (decelerating into place), swap, then peel off accelerating so the trailing
  // bands sweep the new content in from the direction side. Keep the covered hold short:
  // a long still navy frame reads as lag.
  tl = gsap.timeline({ onComplete: finishTransition });
  tl.to(train, { x: train._geo.cover, duration: 0.18, ease: "power2.out" }, 0);
  tl.add(() => {
    swapped = true;
    removeOtherTrains(train);
    swapContent(section);
    const now = tl.time();
    tl.add(buildReveal(card, { direction }), now + 0.06);
    tl.add(watermarkIn(direction), now + 0.04);
  }, ">");
  tl.to(train, { x: train._geo.end, duration: 0.3, ease: "power1.in" }, ">+0.02");
}

/** Desktop entrance after the intro: the card is cut in along the diagonal, then content cascades. */
function playEntrance() {
  if (!entrancePending || !card) return;
  entrancePending = false;
  interruptCurrent();

  if (prefersReducedMotion()) {
    tl = gsap.timeline({ onComplete: finishTransition });
    tl.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none", clearProps: "opacity" });
    return;
  }

  tl = gsap.timeline({ onComplete: finishTransition, delay: 0.12 });
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
  tl.add(watermarkIn(1), 0.3);
  tl.add(buildReveal(card, { direction: 1 }), 0.34);
}

/* ================================================================ mobile */

function mobileCardMarkup(section) {
  return `<article class="content-card" id="section-${esc(section.id)}" data-section="${esc(section.stamp)}" data-kind="${esc(section.kind)}" aria-labelledby="title-${esc(section.id)}">
      ${decoMarkup(section)}
      ${contentMarkup(section, `title-${section.id}`)}
    </article>`;
}

function revealMobileCard(element) {
  const reveal = gsap.timeline({
    onComplete: () => {
      const { kicker, title, lead, items, sigils } = revealTargets(element);
      const plates = element.querySelectorAll(".card-watermark, .card-num");
      gsap.set([element, kicker, title, lead, ...items, ...plates].filter(Boolean), {
        clearProps: "transform,opacity,visibility"
      });
      sigils.forEach(resetSigil);
    }
  });
  reveal.to(element, { y: 0, opacity: 1, duration: DUR.scene, ease: EASE.out }, 0);
  const inner = buildReveal(element, { direction: 1, splitTitle: false });
  reveal.add(inner, 0.12);
  const mark = element.querySelector(".card-watermark");
  if (mark) reveal.from(mark, { x: 60, y: -8, opacity: 0, duration: DUR.scene, ease: EASE.out }, 0.1);
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
  target = state.section;
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
    card.innerHTML = `${decoMarkup(HOME)}${contentMarkup(HOME, "card-title")}${pagerMarkup()}<span class="card-wipe" aria-hidden="true"></span>`;
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

    if (!isMobileLayout()) {
      entrancePending = true;
      if (prefersReducedMotion()) gsap.set(card, { opacity: 0 });
      else gsap.set(card, { clipPath: "polygon(0% -6%, 0% -6%, -16% 106%, -16% 106%)" });
    }
  }

  if (isMobileLayout()) buildMobile();

  afterIntro(() => {
    playEntrance();
    requestAnimationFrame(() => updateOverflow());
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
    }
    if (card && state.section !== target) renderInstant(state.section);
    else updateOverflow();
  });

  on(EVT.RESET, () => {
    // shatter.js repairs the glass first; re-measure in case broken pieces changed sizes.
    requestAnimationFrame(() => updateOverflow());
  });
}
