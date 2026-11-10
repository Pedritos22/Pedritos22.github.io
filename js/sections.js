// Card rendering, section transitions and the mobile stack.
// Owner: menu/panel workstream (B).
import { HOME, SECTIONS, SECTION_MAP } from "./content.js";
import { EVT, emit, on, state, isMobileLayout, onLayoutChange } from "./core.js";
import { makeFracturable } from "./shatter.js";

let card = null;
let mobileStack = null;
let shell = null;

const ORDER = [HOME.id, ...SECTIONS.map((section) => section.id)];

export function getSectionNames() {
  return SECTIONS.map((section) => section.id);
}

function buildSectionMarkup(section) {
  const details = section.details
    ? `<ul class="detail-list">${section.details.map(([label, value]) => `<li><span>${label}</span><strong>${value}</strong></li>`).join("")}</ul>`
    : "";

  const skills = section.skills
    ? `<div class="skill-grid">${section.skills.map(([name, value]) => `<div class="skill"><b>${name}</b><span>${value}</span></div>`).join("")}</div>`
    : "";

  const actions = section.actions
    ? `<div class="actions">${section.actions.map(([label, href, className]) => `<a class="action-link ${className}" href="${href}">${label}</a>`).join("")}</div>`
    : "";

  const custom = section.render ? `<div class="section-custom" data-render="${section.id}"></div>` : "";

  return `
    <p class="section-kicker">${section.label}</p>
    <h2>${section.title}</h2>
    <p>${section.copy}</p>
    ${details}
    ${skills}
    ${custom}
    ${actions}
  `;
}

/** Run custom render() hooks for sections that define one. */
function hydrateCustom(root) {
  root.querySelectorAll("[data-render]").forEach((container) => {
    const section = SECTION_MAP[container.dataset.render];
    try {
      section?.render?.(container);
    } catch (error) {
      console.error(`[sections] render hook failed for ${container.dataset.render}`, error);
    }
  });
}

function renderSection(sectionName) {
  const section = SECTION_MAP[sectionName];
  if (!section || !card) return;

  const from = state.section;
  const fromIndex = ORDER.indexOf(from);
  const toIndex = ORDER.indexOf(sectionName);
  emit(EVT.SECTION_WILL_CHANGE, { from, to: sectionName, index: toIndex, direction: toIndex >= fromIndex ? 1 : -1 });

  card.dataset.section = section.stamp;
  card.animate(
    [
      { opacity: 0.58, transform: "translateX(18px) skewX(-1deg)" },
      { opacity: 1, transform: "translateX(0) skewX(0)" }
    ],
    { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
  );

  card.innerHTML = buildSectionMarkup(section);
  hydrateCustom(card);
  makeFracturable(card);

  state.section = sectionName;
  emit(EVT.SECTION_CHANGED, { from, to: sectionName, index: toIndex });
}

function renderMobileSections() {
  if (!mobileStack) return;

  mobileStack.innerHTML = ORDER
    .map((sectionName) => {
      const section = SECTION_MAP[sectionName];
      return `<article class="content-card" id="section-${sectionName}" data-section="${section.stamp}">${buildSectionMarkup(section)}</article>`;
    })
    .join("");

  hydrateCustom(mobileStack);
  makeFracturable(mobileStack);
}

function scrollToMobileSection(sectionName) {
  const target = document.getElementById(`section-${sectionName}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Show a section (desktop: re-render the card; mobile: scroll to it). */
export function showSection(sectionName) {
  if (isMobileLayout()) {
    scrollToMobileSection(sectionName);
    const from = state.section;
    state.section = sectionName;
    emit(EVT.SECTION_CHANGED, { from, to: sectionName, index: ORDER.indexOf(sectionName) });
    return;
  }

  if (shell) shell.scrollTop = 0;
  renderSection(sectionName);
}

export function showHome() {
  showSection(HOME.id);
}

export function init() {
  card = document.querySelector(".panel-wrap > .content-card");
  mobileStack = document.querySelector(".mobile-section-stack");
  shell = document.querySelector(".shell");

  renderMobileSections();
  if (card) makeFracturable(card);

  onLayoutChange((mobile) => {
    if (mobile) {
      renderMobileSections();
    } else {
      renderSection(HOME.id);
    }
    const from = state.section;
    state.section = HOME.id;
    emit(EVT.SECTION_CHANGED, { from, to: HOME.id, index: 0 });
  });

  on(EVT.RESET, () => {
    if (!isMobileLayout()) {
      renderSection(HOME.id);
    } else {
      const from = state.section;
      state.section = HOME.id;
      emit(EVT.SECTION_CHANGED, { from, to: HOME.id, index: 0 });
    }
  });
}
