// The chronograph: the quest log (Experience) on a time axis.
// Owner: menu/panel workstream (B).
//
// Three lanes (work, university, events) over the months from just before the first entry
// to a few months past today. Every entry is a button: a bar for a span (one segment per
// role, the newest brightest) or a marker for a one-month event (a diamond; a star for the
// highlight). The NOW line reads the world clock (core.js now()), so the time dial moves it
// and the bars of current roles with it: CSS does the geometry from --now, set here on
// EVT.TIME. Entries that start after NOW fade out as "not yet".
//
// Desktop: the selected entry fills the detail plate under the axis (hover / focus preview,
// click or Enter selects, arrow keys walk the entries in time order). Mobile: the axis is an
// overview and the full list (sections.js questsMarkup) follows; a tap scrolls to the entry.
import { EVT, on, now, escapeHtml as esc, prefersReducedMotion, isMobileLayout } from "./core.js";
import { QUESTS } from "./content.js";
import { t, formatPeriod, formatMonth } from "./i18n.js";
import { DUR, STAGGER, animate, enterFrom } from "./motion.js";
import { sfx } from "./sfx.js";

const LEAD_MONTHS = 3; // axis starts this many months before the first entry
const TAIL_MONTHS = 4; // and ends this many after the real today (the dial reaches +-2)

const monthIndex = (ym) => {
  const [year, month] = String(ym).split("-").map(Number);
  return year * 12 + (month - 1);
};

/** Fractional month index of a date (mid-month = .5). */
const dateIndex = (date) => date.getFullYear() * 12 + date.getMonth() + (date.getDate() - 1) / 31;

const isEvent = (quest) => quest.roles.every((role) => role.to && role.to === role.from);

/** Lane of an entry: events (one-month roles), work, or the university (everything else). */
function laneOf(quest) {
  if (isEvent(quest)) return quest.group === "highlight" ? "highlight" : "events";
  return quest.group === "work" ? "work" : "uni";
}

/** Axis range in month indices: [start, end). The end follows the real clock, not the dial. */
function axis() {
  const starts = (QUESTS || []).flatMap((quest) => quest.roles.map((role) => monthIndex(role.from)));
  const start = Math.min(...starts) - LEAD_MONTHS;
  const end = Math.ceil(dateIndex(new Date())) + TAIL_MONTHS;
  return { start, end, span: end - start };
}

/** Greedy row packing so overlapping spans in one lane get their own rows. */
function pack(spans) {
  const rows = [];
  spans
    .slice()
    .sort((a, b) => a.from - b.from)
    .forEach((span) => {
      let row = rows.findIndex((last) => last < span.from);
      if (row === -1) {
        row = rows.length;
        rows.push(0);
      }
      rows[row] = span.to ?? Infinity;
      span.row = row;
    });
  return Math.max(1, rows.length);
}

function spanOf(quest, range) {
  const roles = quest.roles.slice().reverse(); // oldest first
  const from = Math.min(...roles.map((role) => monthIndex(role.from))) - range.start;
  const current = roles.some((role) => role.to === null);
  const to = current ? null : Math.max(...roles.map((role) => monthIndex(role.to) + 1)) - range.start;
  return { quest, from, to, current, roles };
}

/* ================================================================ markup */

function ariaLabel(quest) {
  const [latest] = quest.roles;
  return `${latest.title}, ${quest.org}, ${formatPeriod(latest.from, latest.to)}`;
}

function barMarkup(span, range) {
  const { quest, from, to, current, roles } = span;
  const months = (to ?? Math.ceil(dateIndex(now())) - range.start) - from;
  // Long bars carry their name inside; short ones beside them (before, near the right edge).
  const place = months >= 9 ? "inside" : from + months > range.span * 0.72 ? "before" : "after";
  const segments = roles
    .map((role, i) => {
      const sFrom = monthIndex(role.from) - range.start;
      const sTo = role.to === null ? "var(--now)" : monthIndex(role.to) + 1 - range.start;
      return `<i class="chrono-seg${i === roles.length - 1 ? " is-newest" : ""}" style="--s-from:${sFrom};--s-to:${sTo}"></i>`;
    })
    .join("");
  const label = quest.short ?? quest.org;
  return `<button class="chrono-item chrono-bar${current ? " is-current" : ""}" type="button" data-quest="${esc(quest.id)}"
      data-from="${from}" data-place="${place}" aria-pressed="false" aria-label="${esc(ariaLabel(quest))}"
      style="--from:${from};--to:${to ?? "var(--now)"};--row:${span.row}">
      <span class="chrono-track" aria-hidden="true">${segments}</span>
      <span class="chrono-label" aria-hidden="true">${esc(label)}</span>
    </button>`;
}

/**
 * Markers of a one-month quest: one per role (a recurring event gets a dashed link between
 * its editions and a single label, on the oldest marker).
 */
function markersMarkup(quest, range, row, highlight) {
  const ats = quest.roles.map((role) => monthIndex(role.from) - range.start);
  const oldest = Math.min(...ats);
  const newest = Math.max(...ats);
  const link = ats.length > 1
    ? `<span class="chrono-link" aria-hidden="true" style="--from:${oldest + 0.5};--to:${newest + 0.5};--row:${row}"></span>`
    : "";
  const buttons = quest.roles
    .map((role, i) => {
      const at = ats[i];
      const labelled = at === oldest;
      const place = at > range.span * 0.72 ? "before" : "after";
      return `<button class="chrono-item chrono-marker${highlight ? " is-highlight" : ""}" type="button" data-quest="${esc(quest.id)}"
          data-from="${at}" data-place="${place}" aria-pressed="false" aria-label="${esc(`${role.title}, ${quest.org}, ${formatMonth(role.from)}`)}"
          style="--at:${at};--row:${row}">
          <span class="chrono-glyph" aria-hidden="true"></span>
          ${labelled ? `<span class="chrono-label" aria-hidden="true">${esc(quest.short ?? quest.org)}</span>` : ""}
        </button>`;
    })
    .join("");
  return link + buttons;
}

function ticksMarkup(range) {
  const years = [];
  for (let index = range.start; index < range.end; index += 1) {
    if (index % 12 !== 0) continue;
    const edge = range.end - index < 4 ? " is-edge" : ""; // too close to the end for a label on phones
    years.push(`<span class="chrono-year${edge}" style="--at:${index - range.start}">${Math.floor(index / 12)}</span>`);
  }
  return years.join("");
}

/** The chronograph for the Experience card (sections.js renders it into the card body). */
export function chronoMarkup() {
  if (!QUESTS?.length) return "";
  const range = axis();
  const lanes = { work: [], uni: [], events: [], highlight: [] };
  QUESTS.forEach((quest) => lanes[laneOf(quest)].push(quest));

  const work = lanes.work.map((quest) => spanOf(quest, range));
  const uni = lanes.uni.map((quest) => spanOf(quest, range));
  const workRows = pack(work);
  const uniRows = pack(uni);
  const markers = [
    ...lanes.highlight.map((quest) => markersMarkup(quest, range, 0, true)),
    ...lanes.events.map((quest) => markersMarkup(quest, range, lanes.highlight.length ? 1 : 0, false))
  ];
  const eventRows = (lanes.highlight.length ? 1 : 0) + (lanes.events.length ? 1 : 0) || 1;

  const lane = (id, rows, items) => `<div class="chrono-lane" data-lane="${id}" style="--rows:${rows}">
      <p class="chrono-lane__name" aria-hidden="true">${esc(t(`chrono.${id}`))}</p>
      <div class="chrono-lane__track">${items}</div>
    </div>`;

  return `<div class="chrono" role="group" aria-label="${esc(t("chrono.aria"))}" data-start="${range.start}" style="--span:${range.span};--now:${(dateIndex(now()) - range.start).toFixed(2)}">
      <div class="chrono-plot">
        <div class="chrono-axis" aria-hidden="true">${ticksMarkup(range)}</div>
        <div class="chrono-grid" aria-hidden="true"></div>
        <div class="chrono-future" aria-hidden="true"></div>
        ${lane("work", workRows, work.map((span) => barMarkup(span, range)).join(""))}
        ${lane("uni", uniRows, uni.map((span) => barMarkup(span, range)).join(""))}
        ${lane("events", eventRows, markers.join(""))}
        <div class="chrono-now" aria-hidden="true"><span class="chrono-now__chip"></span></div>
      </div>
      <section class="chrono-detail" aria-live="polite" aria-label="${esc(t("chrono.detail"))}"></section>
    </div>`;
}

/* ================================================================ detail */

/**
 * The detail plate for a quest. `asOf` (months from the axis start, the scrubbed clock):
 * only the roles started by then count, so the plate never tells the future.
 */
function detailMarkup(quest, asOf = null, start = 0) {
  const reached = asOf === null ? quest.roles : quest.roles.filter((role) => monthIndex(role.from) - start <= asOf);
  const [latest, ...earlier] = reached.length ? reached : quest.roles;
  const worldNow = now();
  const future = monthIndex(latest.from) > dateIndex(worldNow);
  const current = latest.to === null && !future;
  const stack = quest.stack?.length
    ? `<ul class="chrono-detail__stack" role="list">${quest.stack.map((tech) => `<li>${esc(tech)}</li>`).join("")}</ul>`
    : "";
  const before = earlier.length
    ? `<p class="chrono-detail__earlier"><span>${esc(t("quest.earlier"))}</span> ${earlier
        .map((role) => `${esc(role.title)} · ${esc(formatPeriod(role.from, role.to))}`)
        .join("; ")}</p>`
    : "";
  return `<p class="chrono-detail__meta">
      <span class="chrono-detail__type" data-lane="${esc(laneOf(quest))}">${esc(quest.type)}</span>
      <span class="chrono-detail__period">${esc(formatPeriod(latest.from, latest.to))}</span>
      ${current ? `<span class="chrono-detail__now">${esc(t("quest.current"))}</span>` : ""}
      ${future ? `<span class="chrono-detail__future">${esc(t("chrono.future"))}</span>` : ""}
    </p>
    <h3 class="chrono-detail__title">${esc(latest.title)}</h3>
    <p class="chrono-detail__org">${esc(quest.org)}${quest.place ? ` · ${esc(quest.place)}` : ""}</p>
    <p class="chrono-detail__note">${esc(latest === quest.roles[0] ? quest.note : latest.note ?? quest.note)}</p>
    ${stack}
    ${before}`;
}

function questById(id) {
  return (QUESTS || []).find((quest) => quest.id === id);
}

/** Show `id` in the detail plate (desktop). `commit`: it becomes the selection. */
function show(root, id, { commit = false, animate: shouldAnimate = true, asOf = null } = {}) {
  const quest = questById(id);
  const detail = root.querySelector(".chrono-detail");
  if (!quest || !detail) return;
  if (commit) {
    root.dataset.selected = id;
    root.querySelectorAll(".chrono-item").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.quest === id)));
  }
  root.querySelectorAll(".chrono-item").forEach((item) => item.classList.toggle("is-shown", item.dataset.quest === id));
  const key = asOf === null ? id : `${id}@${quest.roles.filter((role) => monthIndex(role.from) - Number(root.dataset.start) <= asOf).length}`;
  if (detail.dataset.quest === id && detail.dataset.key === key) return;
  detail.dataset.quest = id;
  detail.dataset.key = key;
  detail.innerHTML = detailMarkup(quest, asOf, Number(root.dataset.start));
  if (shouldAnimate && !prefersReducedMotion()) {
    Array.from(detail.children).forEach((child, i) =>
      enterFrom(child, { x: -14 }, { duration: DUR.ui, delay: i * 0.025, ease: "out" })
    );
  }
}

/* ================================================================== time */

/** Move the NOW line (and the ends of current bars) to the world clock; dim what is to come. */
function syncTime(root) {
  const span = Number(root.style.getPropertyValue("--span")) || 1;
  const rangeStart = Number(root.dataset.start);
  const worldNow = now();
  const position = Math.max(0, Math.min(span, dateIndex(worldNow) - rangeStart));
  root.style.setProperty("--now", position.toFixed(2));
  const chip = root.querySelector(".chrono-now__chip");
  if (chip) chip.textContent = `${t("chrono.now")} · ${formatMonth(`${worldNow.getFullYear()}-${String(worldNow.getMonth() + 1).padStart(2, "0")}`)}`;
  chip?.classList.toggle("is-flipped", position > span - 9);
  root.querySelectorAll(".chrono-item").forEach((item) => {
    item.classList.toggle("is-future", Number(item.dataset.from) > position);
  });
  // The detail's "Now" / "Not yet" chips follow the clock too.
  const detail = root.querySelector(".chrono-detail");
  if (detail?.dataset.quest) {
    const id = detail.dataset.quest;
    delete detail.dataset.quest;
    show(root, id, { animate: false });
  }
}

/* ============================================================== binding */

function items(root) {
  return Array.from(root.querySelectorAll(".chrono-item")).sort((a, b) => Number(a.dataset.from) - Number(b.dataset.from));
}

function onKey(event) {
  const root = event.currentTarget;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const list = items(root);
  const index = list.indexOf(document.activeElement);
  if (index === -1) return;
  event.preventDefault();
  const next =
    event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : Math.max(0, Math.min(list.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
  list[next].focus();
}

/** Wire every chronograph under `root` (once per element). */
export function bindChrono(root) {
  root.querySelectorAll(".chrono").forEach((chrono) => {
    if (chrono.dataset.bound) return;
    chrono.dataset.bound = "true";
    syncTime(chrono);

    const current = (QUESTS || []).find((quest) => quest.group === "work" && quest.roles[0].to === null) ?? QUESTS?.[0];
    if (current) show(chrono, current.id, { commit: true, animate: false });

    chrono.addEventListener("pointerover", (event) => {
      const item = event.target.closest?.(".chrono-item");
      if (!item || item.contains(event.relatedTarget) || isMobileLayout()) return;
      if (!item.classList.contains("is-shown")) sfx.hover();
      show(chrono, item.dataset.quest);
    });
    chrono.addEventListener("pointerleave", () => {
      if (chrono.dataset.selected) show(chrono, chrono.dataset.selected);
    });
    chrono.addEventListener("focusin", (event) => {
      const item = event.target.closest?.(".chrono-item");
      if (item) show(chrono, item.dataset.quest);
    });
    chrono.addEventListener("focusout", (event) => {
      if (!chrono.contains(event.relatedTarget) && chrono.dataset.selected) show(chrono, chrono.dataset.selected);
    });
    chrono.addEventListener("click", (event) => {
      const item = event.target.closest?.(".chrono-item");
      if (!item) return;
      sfx.click();
      if (isMobileLayout()) {
        // Mobile: the list under the axis holds the details.
        const target = chrono.closest(".card-body")?.querySelector(`.quest[data-quest="${CSS.escape(item.dataset.quest)}"]`);
        target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        return;
      }
      show(chrono, item.dataset.quest, { commit: true });
    });
    chrono.addEventListener("keydown", onKey);
  });
}

/**
 * Entrance (Web Animations, sections.js adds them to its reveal): lanes slide in, bars grow
 * from their start along the axis in time order, markers pop, the NOW line drops in.
 */
export function chronoReveal(root, delay = 0) {
  const chrono = root.querySelector(".chrono");
  if (!chrono || prefersReducedMotion()) return [];
  const animations = [];
  chrono.querySelectorAll(".chrono-lane__name, .chrono-axis").forEach((el, i) =>
    animations.push(enterFrom(el, { x: -16 }, { duration: DUR.panel, delay: delay + i * STAGGER, ease: "out" }))
  );
  items(chrono).forEach((item, i) => {
    const at = delay + 0.1 + i * 0.045;
    if (item.classList.contains("chrono-bar")) {
      animations.push(animate(item.querySelector(".chrono-track"), [{ scale: "0 1" }, { scale: "1 1" }], { duration: DUR.panel, delay: at, ease: "out" }));
      animations.push(enterFrom(item.querySelector(".chrono-label"), { x: -8 }, { duration: DUR.ui, delay: at + 0.12, ease: "out" }));
    } else {
      animations.push(enterFrom(item, { scale: 0.2 }, { duration: DUR.ui, delay: at, ease: "spring" }));
    }
  });
  const nowLine = chrono.querySelector(".chrono-now");
  if (nowLine) animations.push(animate(nowLine, [{ scale: "1 0", opacity: 0 }, { scale: "1 1", opacity: 1 }], { duration: DUR.panel, delay: delay + 0.2, ease: "out" }));
  const detail = chrono.querySelector(".chrono-detail");
  if (detail) animations.push(enterFrom(detail, { y: 14 }, { duration: DUR.panel, delay: delay + 0.28, ease: "out" }));
  return animations.filter(Boolean);
}

/* ================================================================= scrub */

/** Months from the axis start to the world clock: where NOW sits on this chronograph. */
export function chronoNow(root) {
  return Math.max(0, dateIndex(now()) - Number(root.dataset.start));
}

/**
 * The descent (story.js) drives a chronograph with the scroll instead of the clock: the NOW
 * line sits at `position` (months from the axis start), bars grow up to it, what starts
 * after it waits, and the detail shows the entry the line passed last. Returns that id.
 */
export function scrubChrono(root, position) {
  root.style.setProperty("--now", position.toFixed(2));
  const list = items(root);
  let last = null;
  list.forEach((item) => {
    const future = Number(item.dataset.from) > position;
    item.classList.toggle("is-future", future);
    if (!future) last = item;
  });
  const chip = root.querySelector(".chrono-now__chip");
  if (chip) {
    const index = Number(root.dataset.start) + Math.floor(position);
    const ym = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    const text = formatMonth(ym);
    if (chip.textContent !== text) chip.textContent = text;
    chip.classList.toggle("is-flipped", position > (Number(root.style.getPropertyValue("--span")) || 1) - 9);
  }
  const id = last?.dataset.quest ?? null;
  if (id) show(root, id, { commit: true, asOf: position });
  return id;
}

export function init() {
  // The time dial moves the world clock: follow it at most once per frame. Scrubbed
  // chronographs (the descent) follow the scroll instead.
  let frame = 0;
  on(EVT.TIME, () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => document.querySelectorAll(".chrono:not([data-scrub])").forEach(syncTime));
  });
}
