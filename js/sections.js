// The title screen's card ("Press start") and the blocks shared with the descent.
// Owner: menu/panel workstream (B).
//
// The card no longer swaps sections: the site is one document (js/story.js), the menu is its
// table of contents and choosing an item cuts to the chapter. The card stays as the welcome
// plate of the title screen: its kicker, title, lead, the latest highlight (a link into the
// Experience chapter) and the fun facts. Desktop: it is cut in along the diagonal after the
// intro and its content cascades. Phones: the same card sits under the menu in
// .mobile-section-stack.
//
// Shared with story.js: contactMarkup() (the Contact chapter), questListMarkup() (the
// Experience list on phones) and hydrate() (copy buttons, glass, the deck, the chronograph,
// the local time, the hello chip).
import { HOME, HIGHLIGHTS, QUESTS, SECTION_MAP } from "./content.js";
import { t, onLang, formatPeriod, locale } from "./i18n.js";
import { afterIntro, isMobileLayout, onLayoutChange, prefersReducedMotion, escapeHtml as esc } from "./core.js";
import { gsap, DUR, EASE, STAGGER, animate, enterFrom, allFinished, hasWaapi } from "./motion.js";
import { makeFracturable } from "./shatter.js";
import { bindArcana } from "./arcana.js";
import { bindChrono } from "./chrono.js";
import { glyph } from "./glyphs.js";
import { sfx } from "./sfx.js";

const COPY_RESET_MS = 1800;
const CYCLE_MS = 2400;

let card = null;
let watermark = null;
let numberEl = null;
let backPlate = null;
let mobileStack = null;
let reveal = [];
let entrancePending = false;
let mobileObserver = null;
let resizeFrame = 0;

/* ================================================================ markup */

/** Decorative chip that rotates through `words` (bindCycles); the row value says it all. */
function cycleMarkup(words) {
  if (!words?.length) return "";
  return ` <span class="cycle-chip" aria-hidden="true" data-cycle="${esc(words.join("|"))}"><span>${esc(words[0])}</span></span>`;
}

function rowMarkup([label, value, glyphName, cycle]) {
  const swatches =
    glyphName === "swatch"
      ? `<span class="swatches" aria-hidden="true"><i class="swatch swatch--blue"></i><i class="swatch swatch--navy"></i></span>`
      : "";
  return `<li class="row">
      <span class="row-glyph" aria-hidden="true">${glyph(glyphName)}</span>
      <span class="row-label">${esc(label)}${cycleMarkup(cycle)}</span>
      <strong class="row-value">${esc(value)}${swatches}</strong>
    </li>`;
}

function rowsMarkup(details, modifier) {
  return `<ul class="detail-list detail-list--${modifier}" role="list">${details.map(rowMarkup).join("")}</ul>`;
}

/** Escaped text with soft break opportunities after "/" and before "@" (long URLs on phones). */
function breakable(text) {
  return esc(text).replace(/\//g, "/<wbr>").replace(/@/g, "<wbr>@");
}

/**
 * Contact: the address itself is the call to action (big, linked, with a copy button), then
 * one tile per channel, then the local time in Kraków for visitors in other time zones.
 */
export function contactMarkup(section) {
  const reach = section.reach ?? {};
  const email = section.links?.find((link) => link.id === "email");
  const hero = email
    ? `<div class="reach-hero">
        <p class="reach-hero__label"><span>${esc(reach.cta ?? email.label)}</span></p>
        <a class="reach-hero__mail" href="${esc(email.href)}">${breakable(email.value)}</a>
        <button class="copy-btn reach-copy" type="button" data-copy="${esc(email.value)}" aria-label="${esc(t("card.copyAria", { what: email.label.toLowerCase() }))}">
          <span class="copy-glyph copy-glyph--idle">${glyph("copy")}</span>
          <span class="copy-glyph copy-glyph--done">${glyph("check")}</span>
          <span class="copy-text" aria-live="polite">${esc(t("card.copy"))}</span>
        </button>
      </div>`
    : "";
  const tiles = (reach.tiles ?? [])
    .map((tile) => {
      const external = tile.external ? ` target="_blank" rel="noopener noreferrer"` : "";
      return `<li><a class="reach-tile" href="${esc(tile.href)}"${external}>
          <span class="reach-tile__glyph" aria-hidden="true">${glyph(tile.glyph)}</span>
          <span class="reach-tile__label">${esc(tile.label)}</span>
          <span class="reach-tile__value">${esc(tile.value)}</span>
          <span class="reach-tile__arrow" aria-hidden="true">${glyph("external")}</span>
          ${tile.external ? `<span class="visually-hidden">${esc(t("card.newTab"))}</span>` : ""}
        </a></li>`;
    })
    .join("");
  const clock = reach.localTime
    ? `<p class="reach-clock"><span class="reach-clock__label">${esc(reach.localTime)}</span> <time class="reach-clock__time" data-local-time></time></p>`
    : "";
  return `${hero}<ul class="reach-grid" role="list">${tiles}</ul>${clock}`;
}

/** The latest highlight (HackNation): a slanted plate that cuts into the Experience chapter. */
function highlightMarkup() {
  const item = HIGHLIGHTS?.[0];
  if (!item) return "";
  return `<a class="card-highlight" href="#hacknation" data-goto="hacknation">
      <span class="card-highlight__label">${esc(item.label)}</span>
      <span class="card-highlight__title">${esc(item.title)}</span>
      <span class="card-highlight__where">${esc(item.meta)}</span>
    </a>`;
}

/**
 * The quest list (the Experience chapter on phones, under the chronograph): one plate per entry. The period and a type chip on the
 * left, the newest role, the organisation and a one-line note on the right; earlier roles
 * at the same place follow as a small line. Current entries carry a "Now" chip.
 */
export function questListMarkup() {
  const items = (QUESTS || [])
    .map((quest) => {
      const [latest, ...earlier] = quest.roles;
      const current = latest.to === null;
      const place = quest.place ? ` · ${esc(quest.place)}` : "";
      const before = earlier.length
        ? `<p class="quest__earlier"><span>${esc(t("quest.earlier"))}</span> ${earlier
            .map((role) => `${esc(role.title)} (${esc(formatPeriod(role.from, role.to))})`)
            .join("; ")}</p>`
        : "";
      return `<li class="quest${current ? " is-current" : ""}" data-type="${esc(quest.group)}" data-quest="${esc(quest.id)}">
          <p class="quest__side">
            <span class="quest__when">${esc(formatPeriod(latest.from, latest.to))}</span>
            <span class="quest__type">${esc(quest.type)}</span>
            ${current ? `<span class="quest__now">${esc(t("quest.current"))}</span>` : ""}
          </p>
          <div class="quest__main">
            <h3 class="quest__title">${esc(latest.title)}</h3>
            <p class="quest__org">${esc(quest.org)}${place}</p>
            <p class="quest__note">${esc(quest.note)}</p>
            ${before}
          </div>
        </li>`;
    })
    .join("");
  return `<ol class="quest-log" role="list">${items}</ol>`;
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

/** The card's content: kicker, title (split into letters for the cascade), lead, body. */
function contentMarkup(section, titleId, { splitTitle = false } = {}) {
  const title = splitTitle
    ? `<h2 id="${titleId}" data-split>${splitTitleMarkup(section.title)}</h2>`
    : `<h2 id="${titleId}">${esc(section.title)}</h2>`;
  return `<p class="section-kicker">${esc(section.label)}</p>
    ${title}
    <p class="card-lead">${esc(section.copy)}</p>
    <div class="card-body" data-kind="${esc(section.kind)}">${highlightMarkup()}${rowsMarkup(section.details, "facts")}</div>`;
}

/** Put split titles back to plain text (one text node: proper kerning, clean copy/paste). */
function unsplitTitles(root) {
  root?.querySelectorAll("h2[data-split]").forEach((title) => {
    const text = title.querySelector(".visually-hidden")?.textContent ?? title.textContent;
    title.textContent = text;
    title.removeAttribute("data-split");
  });
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
    if (label) label.textContent = ok ? t("card.copied") : t("card.copyFailed");
    if (ok) sfx.confirm();
    else sfx.back();
    button._copyTimer = window.setTimeout(() => {
      button.classList.remove("is-copied", "is-failed");
      if (label) label.textContent = t("card.copy");
    }, COPY_RESET_MS);
  });
}

/** Bind interactive bits once per element. Call after makeFracturable so glass runs first. */
function bindInteractions(root) {
  root.querySelectorAll(".copy-btn").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", onCopyClick);
  });
  bindArcana(root);
  bindChrono(root);
  bindLocalTime(root);
  bindCycles(root);
}

/** The local time in Kraków on the contact card (real time, not the dialled world clock). */
let localTimer = 0;
function paintLocalTime() {
  const nodes = document.querySelectorAll("[data-local-time]");
  if (!nodes.length) return;
  const date = new Date();
  const text = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw", timeZoneName: "short" }).format(date);
  nodes.forEach((node) => {
    node.textContent = text;
    node.dateTime = date.toISOString();
  });
}

function bindLocalTime(root) {
  if (!root.querySelector("[data-local-time]")) return;
  paintLocalTime();
  if (!localTimer) localTimer = window.setInterval(paintLocalTime, 30000);
}

/** Rotate the words of every cycle chip under `root` (Home: hello in each language). */
function bindCycles(root) {
  root.querySelectorAll(".cycle-chip[data-cycle]").forEach((chip) => {
    if (chip.dataset.bound) return;
    chip.dataset.bound = "true";
    const words = chip.dataset.cycle.split("|");
    if (words.length < 2) return;
    let index = 0;
    const timer = window.setInterval(() => {
      if (!chip.isConnected) {
        window.clearInterval(timer);
        return;
      }
      if (document.hidden || prefersReducedMotion()) return;
      index = (index + 1) % words.length;
      const word = chip.firstElementChild;
      const swap = () => {
        word.textContent = words[index];
        animate(word, [{ opacity: 0, translate: "0 60%" }, { opacity: 1, translate: "0 0" }], { duration: DUR.ui, ease: "out" });
      };
      const out = animate(word, [{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 -60%" }], {
        duration: DUR.micro,
        ease: "in",
        fill: "forwards"
      });
      if (out) out.finished.then(() => { out.cancel(); swap(); }, () => {});
      else swap();
    }, CYCLE_MS);
  });
}

/** Bind everything interactive under `root` (copy buttons, glass, cards...). Also used by story.js. */
export function hydrate(root) {
  hydrateCustom(root);
  makeFracturable(root);
  bindInteractions(root);
}

/* ======================================================= desktop: card */

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
    items: body ? Array.from(body.querySelectorAll(".card-highlight, .detail-list > li")) : []
  };
}

/** Snap every animated element to its resting state and drop inline styles. */
function cleanupReveal() {
  reveal.forEach((animation) => animation.cancel());
  reveal = [];
  if (!card) return;
  unsplitTitles(card);
  const nodes = [...contentNodes(), watermark, numberEl, backPlate, card].filter(Boolean);
  gsap.killTweensOf(nodes);
  gsap.set(nodes, { clearProps: "transform,opacity,visibility,clipPath" });
}

/**
 * Track whether the card body needs to scroll (shows a fade at the bottom edge). A body that
 * scrolls joins the tab order, so keyboard users can scroll it too (it may hold no links).
 */
function updateOverflow(root = card) {
  root?.querySelectorAll(".card-body").forEach((body) => {
    const overflowing = body.scrollHeight > body.clientHeight + 2;
    body.classList.toggle("is-overflowing", overflowing);
    if (overflowing) {
      body.tabIndex = 0;
      body.setAttribute("role", "region");
      const title = body.closest(".content-card")?.querySelector("h2")?.textContent ?? "";
      body.setAttribute("aria-label", t("card.scrollable", { section: title.trim() }));
    } else {
      body.removeAttribute("tabindex");
      body.removeAttribute("role");
      body.removeAttribute("aria-label");
    }
  });
}

/* ================================================== desktop: animation */

/**
 * Cascade the content of `root` in: kicker, title letters, lead, rows, dealt cards, sigils.
 * Web Animations that start `delay` seconds from now; returns them (already hiding the
 * targets, like GSAP from-tweens).
 */
function startReveal(root, { direction = 1, delay = 0 } = {}) {
  const { kicker, title, lead, items } = revealTargets(root);
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

/** After the intro: the card is cut in along the diagonal, then its content cascades. */
function playEntrance() {
  if (!entrancePending || !card) return;
  entrancePending = false;
  if (prefersReducedMotion() || !hasWaapi) {
    gsap.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none", clearProps: "opacity" });
    return;
  }
  const delay = 0.12;
  const cutIn = new Promise((resolve) => {
    const tl = gsap.timeline({ delay, onComplete: resolve });
    tl.fromTo(
      card,
      { clipPath: "polygon(0% -6%, 0% -6%, -16% 106%, -16% 106%)" },
      { clipPath: "polygon(0% -6%, 118% -6%, 102% 106%, -16% 106%)", duration: DUR.scene, ease: EASE.snap, clearProps: "clipPath" },
      0
    );
    if (backPlate) {
      tl.fromTo(backPlate, { x: -12, y: -12 }, { x: 0, y: 0, duration: DUR.panel, ease: EASE.spring, clearProps: "transform" }, DUR.scene - 0.06);
    }
  });
  reveal.push(...startWatermark(1, delay + 0.3), ...startReveal(card, { direction: 1, delay: delay + 0.34 }));
  Promise.all([cutIn, allFinished(reveal)]).then(() => {
    cleanupReveal();
    updateOverflow();
  });
}

/* ================================================================ mobile */

function mobileCardMarkup(section) {
  return `<article class="content-card" id="welcome" data-section="${esc(section.id)}" data-kind="${esc(section.kind)}" aria-labelledby="title-${esc(section.id)}">
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

/** Phones: the welcome card sits under the menu (the chapters follow in the descent). */
function buildMobile() {
  if (!mobileStack) return;
  mobileObserver?.disconnect();
  mobileStack.innerHTML = mobileCardMarkup(HOME);
  hydrate(mobileStack);
  setupMobileReveal();
}

/* ================================================================== init */

function renderCard(splitTitle) {
  card.innerHTML = `${decoMarkup(HOME)}${contentMarkup(HOME, "card-title", { splitTitle })}`;
  card.setAttribute("aria-labelledby", "card-title");
  card.dataset.section = HOME.id;
  card.dataset.kind = HOME.kind;
  watermark = card.querySelector(".card-watermark");
  numberEl = card.querySelector(".card-num");
  backPlate = card.querySelector(".card-back");
  hydrate(card);
}

export function init() {
  card = document.querySelector(".panel-wrap > .card-stage > .content-card");
  mobileStack = document.querySelector(".mobile-section-stack");

  if (card) {
    // The title arrives split when the entrance will cascade its letters in.
    const splitTitle = !isMobileLayout() && !prefersReducedMotion();
    renderCard(splitTitle);
    if (!isMobileLayout()) {
      entrancePending = true;
      if (prefersReducedMotion()) gsap.set(card, { opacity: 0 });
      else gsap.set(card, { clipPath: "polygon(0% -6%, 0% -6%, -16% 106%, -16% 106%)" });
    }
  }
  buildMobile();

  afterIntro(() => {
    const cascades = entrancePending; // the entrance unsplits the title when it finishes
    playEntrance();
    if (!cascades) unsplitTitles(card);
    requestAnimationFrame(() => updateOverflow());
  });

  onLang(() => {
    if (card) {
      cleanupReveal();
      renderCard(false);
      updateOverflow();
    }
    buildMobile();
  });
  document.fonts?.ready?.then(() => updateOverflow());
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => updateOverflow());
  }, { passive: true });
  onLayoutChange((mobile) => {
    if (!mobile && entrancePending) {
      entrancePending = false;
      gsap.set(card, { clearProps: "clipPath,opacity" });
      unsplitTitles(card);
    }
    updateOverflow();
  });
}
