// The descent: the whole site under the title screen, one chapter per menu item, going
// deeper into the water: About, Experience (with HackNation as its second scene), Projects,
// Skills, Education, Contact, and the Depths at the bottom. The menu on the title screen and
// the chapter rail are its table of contents; choosing an item cuts (js/cut.js) to the
// chapter. Owner: menu/panel workstream (B).
//
// Scroll engine. Pinned scenes ([data-scene]) are tall boxes whose .scene sticks to the
// viewport; their progress p (0..1 while pinned) goes to CSS as --p, and CSS does the motion
// with transform and opacity only. Offsets are measured on resize, never on scroll. <html>
// carries --hero (the title screen leaving, 0..1 over the first screen) and --descent.
//
// Static mode (html[data-story-static]: phones and reduced motion): nothing pins, every
// scene is drawn at its final state, chapters simply stack.
//
// Navigation contract: goTo(id, { history }) where id is a section id, "hacknation",
// "depths" or "home" (the title screen). It emits SECTION_WILL_CHANGE, cuts, lands, and the
// chapter in view is reported with SECTION_CHANGED {from, to, index, history}; history is
// "push" for deliberate moves, "replace" while scrolling, "none" for Back/Forward.
import { EVT, emit, on, state, prefersReducedMotion, isMobileLayout, onLayoutChange, onReducedMotionChange, escapeHtml as esc, clamp } from "./core.js";
import { STORY, SECTIONS, SECTION_MAP, PROJECT_NOTES, FEATURED_PROJECTS, SCHOOLING, PROFILE, DEPTHS } from "./content.js";
import { t, onLang, formatPeriod, formatMonth, locale } from "./i18n.js";
import { renderSigil } from "./sigils.js";
import { chronoMarkup, scrubChrono, chronoNow } from "./chrono.js";
import { arcanaMarkup, foolChipMarkup, dealIn, drawSigils } from "./arcana.js";
import { contactMarkup, questListMarkup, hydrate } from "./sections.js";
import { glyph } from "./glyphs.js";
import { cut } from "./cut.js";
import { sfx } from "./sfx.js";

const html = document.documentElement;
const ORDER = ["home", ...SECTIONS.map((section) => section.id), "depths"];
/** Where a jump lands inside a pinned scene (its progress): the scene's finished state. */
const LAND = { about: 0.94, experience: 0.97, hacknation: 0.92, projects: 0 };

let story = null;
let rail = null;
let cue = null;
let scenes = [];
let chapters = [];
let depthsTop = Infinity;
let docH = 0;
let vh = 0;
let frame = 0;
let measured = false;
let lastDepth = -1;
let under = false;
let current = "home";
let pendingHistory = null;
let dealt = false;

const isStatic = () => html.hasAttribute("data-story-static");
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ================================================================ markup */

/** Words of the manifesto, *starred* ones lit; each knows its index for the reveal. */
function manifestoMarkup(text) {
  let accent = false;
  const words = String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((raw, i) => {
      let word = raw;
      if (word.startsWith("*")) {
        accent = true;
        word = word.slice(1);
      }
      const closes = /\*[.,;:!?]?$/.test(word);
      word = word.replace(/\*([.,;:!?]?)$/, "$1");
      const lit = accent;
      if (closes) accent = false;
      return `<span class="w${lit ? " w--lit" : ""}" style="--i:${i}">${esc(word)}</span>`;
    });
  return { html: words.join(" "), count: words.length };
}

/** The kicker of a chapter; story.js writes its depth in metres into the last span. */
function kicker(text) {
  return `<p class="kicker"><span>${esc(text)}</span><span class="kicker__m" aria-hidden="true"></span></p>`;
}

/** The seam between two chapters: the cut's thin bands, lying on the half major angle. */
const SEAM = `<div class="seam" aria-hidden="true"><i class="seam__streak"></i><i class="seam__cyan"></i><i class="seam__blue"></i></div>`;

/** The water surface between the title screen and the first chapter. */
const WATERLINE = `<div class="waterline" aria-hidden="true">
    <span class="waterline__glow"></span>
    <svg class="waterline__wave" viewBox="0 0 2400 40" preserveAspectRatio="none" focusable="false">
      <path class="waterline__halo" d="M0 20 Q150 6 300 20 T600 20 T900 20 T1200 20 T1500 20 T1800 20 T2100 20 T2400 20" />
      <path class="waterline__line" d="M0 20 Q150 6 300 20 T600 20 T900 20 T1200 20 T1500 20 T1800 20 T2100 20 T2400 20" />
    </svg>
  </div>`;

function chapterHead(id, kick, title, lead) {
  return `<header class="chapter-head">
      ${kicker(kick)}
      ${title ? `<h2 class="chapter-title" id="${id}-title">${esc(title)}</h2>` : ""}
      ${lead ? `<p class="chapter-lead">${esc(lead)}</p>` : ""}
    </header>`;
}

/** The card's details at full-screen size: the watermark word and the outlined number. */
function deco(section) {
  return `<span class="chapter-deco" aria-hidden="true"><span class="chapter-stamp">${esc(section.stamp)}</span><span class="chapter-num">${esc(section.code)}</span></span>`;
}

function aboutMarkup() {
  const section = SECTION_MAP.about;
  const words = manifestoMarkup(STORY.about.manifesto);
  const tiles = (section.status ?? [])
    .map(
      (tile, i) => `<li class="status-tile who-tile" data-key="${esc(tile.key)}" style="--i:${i}">
          <span class="status-tile__glyph" aria-hidden="true">${glyph(tile.glyph)}</span>
          <span class="status-tile__label">${esc(tile.label)}</span>
          <strong class="status-tile__value">${esc(tile.value)}</strong>
          <span class="status-tile__sub">${esc(tile.sub)}</span>
        </li>`
    )
    .join("");
  return `<section class="chapter chapter--about" id="about" data-scene="about" data-chapter="about" style="--len:2.6" aria-labelledby="about-title">
      <div class="scene">
        ${deco(section)}
        <div class="who-copy">
          ${kicker(STORY.about.kicker)}
          <h2 class="visually-hidden" id="about-title">${esc(section.menu)}</h2>
          <p class="manifesto" style="--n:${words.count}">${words.html}</p>
          <ul class="who-tiles" role="list">${tiles}</ul>
        </div>
        <div class="who-crest" aria-hidden="true">
          <span class="who-crest__orbit"></span>
          <span class="who-crest__orbit who-crest__orbit--inner"></span>
          ${renderSigil(PROFILE.name, { hub: true, className: "who-sigil" })}
          <span class="who-crest__initials">${esc(PROFILE.initials)}</span>
        </div>
      </div>
    </section>`;
}

function experienceMarkup() {
  const section = SECTION_MAP.experience;
  const chrono = chronoMarkup().replace('<div class="chrono"', '<div class="chrono chrono--story" data-scrub');
  return `<section class="chapter chapter--quests" id="experience" data-scene="experience" data-chapter="experience" style="--len:3" aria-labelledby="experience-title">
      <div class="scene">
        ${deco(section)}
        <p class="quests-year" aria-hidden="true"></p>
        ${chapterHead("experience", STORY.experience.kicker, STORY.experience.title, STORY.experience.lead)}
        <div class="quests-plot">${chrono}${questListMarkup()}</div>
      </div>
    </section>`;
}

function formatMetric(value, { decimals = 0, prefix = "", suffix = "" } = {}) {
  const number = new Intl.NumberFormat(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return `${prefix}${number}${suffix}`;
}

function hackathonMarkup() {
  const h = STORY.hackathon;
  const steps = h.pipeline
    .map(
      (step, i) => `<li class="pipe-step" style="--i:${i}">
          <span class="pipe-step__no" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
          <span class="pipe-step__node" aria-hidden="true"></span>
          <strong class="pipe-step__name">${esc(step.name)}</strong>
          <span class="pipe-step__sub">${esc(step.sub)}</span>
        </li>`
    )
    .join("");
  const metrics = h.metrics
    .map(
      (metric, i) => `<div class="metric" style="--i:${i}">
          <dt class="metric__label">${esc(metric.label)}</dt>
          <dd class="metric__value" data-count="${metric.value}" data-decimals="${metric.decimals ?? 0}" data-prefix="${esc(metric.prefix ?? "")}" data-suffix="${esc(metric.suffix ?? "")}">${esc(formatMetric(metric.value, metric))}</dd>
        </div>`
    )
    .join("");
  return `<section class="chapter chapter--hack" id="hacknation" data-scene="hacknation" data-chapter="experience" style="--len:2.8" aria-labelledby="hacknation-title">
      <div class="scene">
        <span class="hack-star" aria-hidden="true"></span>
        ${chapterHead("hacknation", h.kicker, h.title, h.lead)}
        <ol class="pipeline" role="list" style="--n:${h.pipeline.length}">
          <span class="pipeline__rail" aria-hidden="true"><i></i></span>
          ${steps}
        </ol>
        <dl class="metrics">${metrics}</dl>
        <p class="hack-role">${esc(h.role)}</p>
      </div>
    </section>`;
}

function projectsMarkup() {
  const section = SECTION_MAP.projects;
  const p = STORY.projects;
  const notes = FEATURED_PROJECTS.map((name) => [name, PROJECT_NOTES[name]]).filter(([, note]) => note);
  const count = notes.length + 1;
  const panels = notes.map(([name, note], i) => {
    const points = note.points?.length ? `<ul class="reel-panel__points">${note.points.map((point) => `<li>${esc(point)}</li>`).join("")}</ul>` : "";
    const media = (note.media || [])
      .map(([label, href]) => `<a class="reel-panel__link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden">${esc(t("card.newTab"))}</span></a>`)
      .join("");
    return `<li class="reel-panel" style="--i:${i}" data-no="${String(i + 1).padStart(2, "0")}" data-repo="${esc(name)}">
        <p class="reel-panel__no"><b>${String(i + 1).padStart(2, "0")}</b> / ${String(count).padStart(2, "0")}</p>
        <h3 class="reel-panel__name">${esc(note.title)}</h3>
        <p class="reel-panel__live"></p>
        <p class="reel-panel__summary">${esc(note.summary)}</p>
        ${points}
        <ul class="reel-panel__stack" role="list">${note.stack.map((tech) => `<li>${esc(tech)}</li>`).join("")}</ul>
        <p class="reel-panel__links">
          <a class="reel-panel__link" href="https://github.com/Pedritos22/${esc(name)}" target="_blank" rel="noopener noreferrer">${esc(p.code)}<span class="visually-hidden">: ${esc(note.title)}${esc(t("card.newTab"))}</span></a>
          ${media}
        </p>
      </li>`;
  });
  const more = `<li class="reel-panel reel-panel--more" style="--i:${notes.length}" data-no="${String(count).padStart(2, "0")}">
      <p class="reel-panel__no"><b>${String(count).padStart(2, "0")}</b> / ${String(count).padStart(2, "0")}</p>
      <h3 class="reel-panel__name">${esc(p.more)}</h3>
      <p class="reel-panel__summary">${esc(p.moreLead)}</p>
      <p class="reel-panel__live reel-panel__live--total"></p>
      <p class="reel-panel__links">
        <a class="reel-panel__link" href="${esc(PROFILE.github)}?tab=repositories" target="_blank" rel="noopener noreferrer">${esc(p.all)}<span class="visually-hidden">${esc(t("card.newTab"))}</span></a>
      </p>
    </li>`;
  return `<section class="chapter chapter--work" id="projects" data-scene="projects" data-chapter="projects" style="--len:${Math.max(2, count * 0.8)}" aria-labelledby="projects-title">
      <div class="scene">
        ${deco(section)}
        <div class="work-head">${chapterHead("projects", p.kicker, section.title, section.copy)}</div>
        <div class="reel"><ol class="reel-track" role="list">${panels.join("")}${more}</ol></div>
        <div class="reel-progress" aria-hidden="true"><i></i></div>
      </div>
    </section>`;
}

function skillsMarkup() {
  const section = SECTION_MAP.skills;
  const [label, hook] = section.action ?? [];
  return `<section class="chapter chapter--skills" id="skills" data-reveal data-chapter="skills" data-deck aria-labelledby="skills-title">
      ${deco(section)}
      ${chapterHead("skills", STORY.skills.kicker, section.title, section.copy)}
      <div class="deck">${arcanaMarkup(section)}</div>
      ${label ? `<div class="card-action deck-action">${foolChipMarkup(section)}<button class="action-link primary" type="button" data-${esc(hook)}><span>${esc(label)}</span></button></div>` : ""}
    </section>`;
}

function educationMarkup() {
  const section = SECTION_MAP.education;
  const school = SCHOOLING;
  const cert = school.certificates[0];
  const entries = [
    { when: formatPeriod(school.university.from, school.university.to), title: school.university.name, meta: school.university.program, note: school.university.activities },
    cert && { when: formatMonth(cert.date), title: cert.name, meta: cert.issuer, note: cert.skills.join(" · ") },
    { when: school.school.years, title: school.school.name, meta: school.school.program, note: school.school.activities }
  ]
    .filter(Boolean)
    .map(
      (entry, i) => `<li class="school-entry" style="--i:${i}">
          <p class="school-entry__when">${esc(entry.when)}</p>
          <h3 class="school-entry__title">${esc(entry.title)}</h3>
          <p class="school-entry__meta">${esc(entry.meta)}</p>
          <p class="school-entry__note">${esc(entry.note)}</p>
        </li>`
    )
    .join("");
  const focus = (section.focus || []).map((item, i) => `<li style="--i:${i}">${esc(item)}</li>`).join("");
  return `<section class="chapter chapter--school" id="education" data-reveal data-chapter="education" aria-labelledby="education-title">
      ${deco(section)}
      ${chapterHead("education", STORY.education.kicker, STORY.education.title, section.copy)}
      <ol class="school-list" role="list">${entries}</ol>
      <ul class="school-focus" role="list" aria-label="${esc(t("card.focusAreas"))}">${focus}</ul>
    </section>`;
}

function contactChapterMarkup() {
  const section = SECTION_MAP.contact;
  return `<section class="chapter chapter--signal" id="contact" data-reveal data-chapter="contact" aria-labelledby="contact-title">
      ${deco(section)}
      ${kicker(STORY.contact.kicker)}
      <h2 class="signal-title" id="contact-title">${esc(section.title)}</h2>
      <p class="chapter-lead">${esc(section.copy)}</p>
      <div class="signal-body">${contactMarkup(section)}</div>
    </section>`;
}

/** The rail: the menu folded down (same labels, same numbers) and a depth gauge. */
function railMarkup() {
  const items = [...SECTIONS.map((section) => [section.id, section.code, section.menu]), ["depths", "07", DEPTHS.stamp]]
    .map(
      ([id, code, name], i) => `<li style="--i:${i}"><a class="story-rail__link" href="#${id}" data-goto="${id}">
          <span class="story-rail__no">${esc(code)}</span>
          <span class="story-rail__name">${esc(name)}</span>
        </a></li>`
    )
    .join("");
  return `<p class="story-rail__depth" aria-hidden="true"></p>
    <span class="story-rail__gauge" aria-hidden="true"><i></i></span>
    <ol role="list">${items}</ol>
    <button class="story-rail__top" type="button" data-goto="home"><span aria-hidden="true">↑</span> ${esc(STORY.menu)}</button>`;
}

/* ================================================================= build */

function build() {
  const chaptersMarkup = [aboutMarkup(), experienceMarkup(), hackathonMarkup(), projectsMarkup(), skillsMarkup(), educationMarkup(), contactChapterMarkup()];
  // The Depths follow the last seam (they are outside .story, see index.html).
  story.innerHTML = `${WATERLINE}${chaptersMarkup.join(SEAM)}${SEAM}`;
  story.setAttribute("aria-label", STORY.rail);
  rail.innerHTML = railMarkup();
  rail.setAttribute("aria-label", STORY.rail);
  if (cue) cue.querySelector(".dive-cue__text").textContent = STORY.cue;
  hydrate(story);
  dealt = false;

  // Reveal blocks fade in once, the first time they are in view; the deck deals its cards.
  const reveal = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        reveal.unobserve(entry.target);
        if (entry.target.id === "skills") deal(entry.target);
      }),
    { rootMargin: "0px 0px -18% 0px" }
  );
  story.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));
  fillLiveFacts();
  railActive();
  measured = false;
  schedule();
}

function deal(root) {
  if (dealt || prefersReducedMotion()) return;
  dealt = true;
  dealIn(Array.from(root.querySelectorAll(".arcana-slot")), 0.1);
  drawSigils(Array.from(root.querySelectorAll(".arcana-slot .arcana-front .sigil")), 0.3);
}

/** Stars, language and last push on each project panel, from the board's shared data. */
function fillLiveFacts() {
  import("./projects.js")
    .then((module) => module.boardFacts())
    .then((facts) => {
      story.querySelectorAll(".reel-panel[data-repo]").forEach((panel) => {
        const repo = facts.repos[panel.dataset.repo];
        const live = panel.querySelector(".reel-panel__live");
        if (!repo || !live) return;
        live.innerHTML = [
          repo.language ? `<span class="reel-live__lang" style="--lang:${esc(repo.color)}">${esc(repo.language)}</span>` : "",
          repo.stars ? `<span>★ ${repo.stars}</span>` : "",
          repo.updated ? `<span>${esc(repo.updated)}</span>` : ""
        ].join("");
      });
      const total = story.querySelector(".reel-panel__live--total");
      if (total) total.innerHTML = `<span>${esc(String(facts.total))} repos</span>${facts.updated ? `<span>${esc(facts.updated)}</span>` : ""}`;
    })
    .catch(() => {});
}

/* =============================================================== measure */

function measure() {
  const y = window.scrollY;
  vh = window.innerHeight;
  docH = document.documentElement.scrollHeight;
  scenes = Array.from(story.querySelectorAll("[data-scene]")).map((el) => {
    const rect = el.getBoundingClientRect();
    const reel = el.querySelector(".reel");
    const track = el.querySelector(".reel-track");
    if (reel && track && !isStatic()) el.style.setProperty("--shift", String(Math.max(0, track.scrollWidth - reel.clientWidth)));
    return { el, id: el.dataset.scene, top: rect.top + y, height: rect.height, last: -1 };
  });
  chapters = Array.from(document.querySelectorAll("[data-chapter], .depths:not([hidden])")).map((el) => ({
    id: el.dataset.chapter ?? "depths",
    top: el.getBoundingClientRect().top + y
  }));
  const depths = document.querySelector(".depths:not([hidden])");
  depthsTop = depths ? depths.getBoundingClientRect().top + y : Infinity;
  // Each chapter's kicker reads its depth, on the same 0-400 m scale as the intro and the rail.
  const range = Math.max(1, docH - vh);
  story.querySelectorAll("[data-chapter]").forEach((el) => {
    const slot = el.querySelector(".kicker__m");
    if (!slot) return;
    const top = el.getBoundingClientRect().top + y;
    slot.textContent = `${Math.round(clamp(top / range, 0, 1) * 400)} m`;
  });
  // The fold is measured on the first frame the title screen moves: by then the menu's own
  // entrance (its items slide in) has finished.
  flightsStale = true;
  measured = true;
}

/* ================================================================== fold */

// The menu folds into the rail: while the title screen leaves (--hero 0.25..0.8), each rail
// link flies from where its menu item is to its slot on the rail, shrinking to rail size.
// Rest geometry is measured on resize; a frame is arithmetic and two style writes per link.
// Both lists lean on the same counter angle (-4deg), so the flight is a translate (rotated
// into the rail's local axes) and a scale about the start of the label.
const FOLD_FROM = 0.25;
const FOLD_TO = 0.8;
const COS4 = Math.cos((4 * Math.PI) / 180);
const SIN4 = Math.sin((4 * Math.PI) / 180);
let flights = [];
let flightsStale = true;
let lastFold = -1;

/** Left-centre of a label that leans -4deg, from its bounding box and unrotated width. */
function leftCentre(el, y) {
  const rect = el.getBoundingClientRect();
  const half = el.offsetWidth / 2;
  return { x: rect.left + rect.width / 2 - half * COS4, y: rect.top + rect.height / 2 + half * SIN4 + y };
}

function measureFold(y) {
  flights = [];
  lastFold = -1;
  if (isStatic() || !rail) return;
  const links = Array.from(rail.querySelectorAll(".story-rail__link"));
  links.forEach((link) => {
    link.style.translate = "";
    link.style.scale = "";
  });
  links.forEach((link) => {
    const item = document.querySelector(`.menu-item[data-section="${CSS.escape(link.dataset.goto)}"] .menu-text`);
    const name = link.querySelector(".story-rail__name");
    if (!item || !name) return;
    link.style.transformOrigin = `${name.offsetLeft}px 50%`;
    const from = leftCentre(item, y);
    const to = leftCentre(name, 0);
    const ratio = parseFloat(getComputedStyle(item).fontSize) / parseFloat(getComputedStyle(name).fontSize) || 1;
    flights.push({ link, from, to, ratio });
  });
}

function applyFold(hero, y) {
  if (flightsStale && hero > 0) {
    // Until the menu's entrance has finished its items are still moving: measure every frame.
    flightsStale = !html.classList.contains("menu-ready");
    measureFold(y);
  }
  if (!flights.length) {
    html.removeAttribute("data-fold");
    return;
  }
  const f = clamp((hero - FOLD_FROM) / (FOLD_TO - FOLD_FROM), 0, 1);
  if (Math.abs(f - lastFold) < 0.0005 && f !== 0 && f !== 1) return;
  lastFold = f;
  html.toggleAttribute("data-fold", f > 0);
  html.toggleAttribute("data-folded", f >= 1);
  rail.style.setProperty("--fold", f.toFixed(4));
  const e = ease(f);
  flights.forEach(({ link, from, to, ratio }) => {
    if (e >= 1) {
      link.style.translate = "";
      link.style.scale = "";
      return;
    }
    // Viewport delta (the menu item scrolls with the page), turned into the rail's axes.
    const dx = (from.x - to.x) * (1 - e);
    const dy = (from.y - y - to.y) * (1 - e);
    const lx = dx * COS4 - dy * SIN4;
    const ly = dx * SIN4 + dy * COS4;
    link.style.translate = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
    link.style.scale = String((ratio + (1 - ratio) * e).toFixed(4));
  });
}

/** Scroll position a jump to `id` lands on. */
function landing(id) {
  if (id === "home") return 0;
  if (!measured) measure();
  const scene = scenes.find((s) => s.id === id);
  if (scene && !isStatic()) return Math.round(scene.top + (scene.height - vh) * (LAND[id] ?? 0));
  const el = id === "depths" ? document.querySelector(".depths:not([hidden])") : document.getElementById(id);
  if (!el) return null;
  return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY));
}

/* ================================================================= frame */

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    update();
  });
}

function railActive() {
  rail?.querySelectorAll("[data-goto]").forEach((link) => {
    const on = link.dataset.goto === current;
    link.classList.toggle("is-active", on);
    if (on) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

function update() {
  if (!story) return;
  if (!measured) measure();
  const y = window.scrollY;
  const stat = isStatic();

  const hero = clamp(y / Math.max(1, vh), 0, 1);
  const descent = clamp(y / Math.max(1, docH - vh), 0, 1);
  html.style.setProperty("--hero", stat ? "0" : hero.toFixed(4));
  html.style.setProperty("--descent", descent.toFixed(4));
  if (!stat) applyFold(hero, y);

  // Below the title screen: butterflies rest, the rail shows.
  const nowUnder = y > vh * 0.55;
  if (nowUnder !== under) {
    under = nowUnder;
    html.toggleAttribute("data-story", under);
    emit(EVT.DIVE, { depth: under ? 1 : 0, preview: false, scroll: true });
    lastDepth = -1;
  }

  // The Depths: the last screen.
  const inDepths = y + vh * 0.5 > depthsTop;
  if (inDepths !== state.depths) {
    state.depths = inDepths;
    html.toggleAttribute("data-depths", inDepths);
    emit(EVT.DIVE, { depth: inDepths || under ? 1 : 0, preview: false, scroll: true });
    lastDepth = -1;
  }

  // The water deepens with the page: a little under the title screen, then to the bottom.
  const depth = hero < 1 ? hero * 0.28 : 0.28 + 0.72 * ease(clamp((y - vh) / Math.max(1, docH - 2 * vh), 0, 1));
  if (Math.abs(depth - lastDepth) > 0.002) {
    lastDepth = depth;
    emit(EVT.DIVE, { depth, preview: true });
    rail.style.setProperty("--gauge", descent.toFixed(4));
    const metres = rail.querySelector(".story-rail__depth");
    const text = `${t("intro.depth")} ${Math.round(descent * 400)} m`;
    if (metres && metres.textContent !== text) metres.textContent = text;
  }

  scenes.forEach((scene) => {
    const p = stat ? 1 : clamp((y - scene.top) / Math.max(1, scene.height - vh), 0, 1);
    if (Math.abs(p - scene.last) < 0.0004) return;
    scene.last = p;
    scene.el.style.setProperty("--p", p.toFixed(4));
    hooks[scene.id]?.(scene.el, p);
  });

  // The chapter in view (the title screen counts as "home").
  let id = "home";
  if (y > vh * 0.5) {
    chapters.forEach((chapter) => {
      if (chapter.top <= y + vh * 0.45) id = chapter.id;
    });
  }
  if (id !== current) {
    const from = current;
    current = id;
    state.section = id;
    const history = pendingHistory ?? "replace";
    pendingHistory = null;
    railActive();
    emit(EVT.SECTION_CHANGED, { from, to: id, index: ORDER.indexOf(id), history });
  } else if (pendingHistory) {
    // A jump inside the chapter already in view is still a history entry of its own.
    emit(EVT.SECTION_CHANGED, { from: id, to: id, index: ORDER.indexOf(id), history: pendingHistory });
    pendingHistory = null;
  }
}

/* ================================================================= hooks */

const hooks = {
  /** The chronograph's clock runs from just before the first entry to today. */
  experience(el, p) {
    const chrono = el.querySelector(".chrono");
    if (!chrono) return;
    const end = chronoNow(chrono);
    const start = 2;
    const position = start + (end - start) * ease(clamp((p - 0.04) / 0.84, 0, 1));
    scrubChrono(chrono, position);
    const year = String(Math.floor((Number(chrono.dataset.start) + position) / 12));
    const label = el.querySelector(".quests-year");
    if (label && label.textContent !== year) label.textContent = year;
  },

  /** The metrics count up once the pipeline has lit. */
  hacknation(el, p) {
    const k = clamp((p - 0.5) / 0.32, 0, 1);
    el.querySelectorAll(".metric__value").forEach((node) => {
      const value = Number(node.dataset.count) * ease(k);
      const text = formatMetric(value, { decimals: Number(node.dataset.decimals), prefix: node.dataset.prefix, suffix: node.dataset.suffix });
      if (node.textContent !== text) node.textContent = text;
    });
  }
};

/* ============================================================= navigation */

/** Cut to a chapter ("home" = the title screen). Returns false for an unknown target. */
export function goTo(id, { history = "push", animate = true } = {}) {
  if (!story) return false;
  const target = landing(id);
  if (target == null) return false;
  const chapter = id === "hacknation" ? "experience" : id;
  const direction = target >= window.scrollY ? 1 : -1;
  emit(EVT.SECTION_WILL_CHANGE, { from: current, to: chapter, direction, index: ORDER.indexOf(chapter) });
  pendingHistory = history;
  const section = SECTION_MAP[chapter];
  const jump = () => {
    measured = false;
    window.scrollTo({ top: landing(id), behavior: "instant" });
    update();
  };
  if (!animate || Math.abs(target - window.scrollY) < 2) {
    jump();
    return true;
  }
  cut(jump, {
    direction,
    code: chapter === "depths" ? "07" : section?.code ?? "",
    name: chapter === "depths" ? DEPTHS.stamp : section?.menu ?? ""
  });
  return true;
}

/** The chapter (or "home") currently in view. */
export const currentChapter = () => current;

/* ================================================================== init */

function setStatic() {
  html.toggleAttribute("data-story-static", isMobileLayout() || prefersReducedMotion());
  html.removeAttribute("data-fold");
  html.removeAttribute("data-folded");
  measured = false;
  schedule();
}

export function init() {
  const shell = document.querySelector(".shell");
  if (!shell) return;
  story = document.createElement("div");
  story.className = "story";
  story.id = "story";
  shell.after(story);
  rail = document.createElement("nav");
  rail.className = "story-rail";
  document.body.appendChild(rail);

  cue = document.createElement("a");
  cue.className = "dive-cue";
  cue.href = "#about";
  cue.dataset.goto = "about";
  cue.innerHTML = `<span class="dive-cue__text"></span><span class="dive-cue__line" aria-hidden="true"><i></i></span>`;
  shell.appendChild(cue);

  setStatic();
  build();

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    measured = false;
    schedule();
  }, { passive: true });
  document.fonts?.ready?.then(() => {
    measured = false;
    schedule();
  });
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      measured = false;
      schedule();
    });
    observer.observe(story);
    const depths = document.querySelector(".depths");
    if (depths) observer.observe(depths);
  }
  window.addEventListener("menu:ready", () => {
    flightsStale = true;
    lastFold = -1;
    schedule();
  });
  onLayoutChange(setStatic);
  onReducedMotionChange(setStatic);
  onLang(() => build());
  on(EVT.RESET, () => schedule());

  // "Skip to content": focus the heading of the chapter in view, without moving the page.
  document.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    const root = current === "home" ? document.querySelector(".shell") : document.getElementById(current === "depths" ? "depths" : current);
    const target = root?.querySelector("h1, h2") ?? root;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });

  // Every [data-goto] (menu tiles, rail, dive cue, highlight plate, "Menu") cuts instead of
  // jumping. Capture phase: the glass engine stops click propagation inside plates.
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("[data-goto]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      sfx.click();
      goTo(link.dataset.goto);
    },
    true
  );
}
