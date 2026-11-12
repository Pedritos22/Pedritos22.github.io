// Projects section: a "request board" of public GitHub repositories.
// Owner: audio/projects workstream (D).
//
// renderProjects(container) is called by the sections render() hook: on desktop every
// time the Projects card is shown, on mobile once in the stacked layout. It is
// idempotent and instant on re-render (memory cache + localStorage with a 6 h TTL), and
// it makes at most one network request per page load (concurrent calls share it).
import { escapeHtml, prefersReducedMotion, isMobileLayout } from "./core.js";
import { DUR, STAGGER, animate, allFinished } from "./motion.js";
import { FEATURED_PROJECTS, HIDDEN_PROJECTS, PROFILE } from "./content.js";
import { sfx } from "./sfx.js";

const USER = "pedritos22";
const API_URL = `https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`;
const CACHE_KEY = "p3:repos:v2"; // v2: HIDDEN_PROJECTS filtered at fetch time
const TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;
const SHOW = 6;
const FIT_MIN = 200; // never cap the desktop list below this (px)

const githubUrl = () => PROFILE?.github || `https://github.com/${USER}`;

/** GitHub-like language colours (data, applied through a CSS variable). */
const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  Java: "#b07219",
  Kotlin: "#a97bff",
  C: "#8a8f98", // GitHub uses #555; lifted so the diamond reads on deep blue
  "C++": "#f34b7d",
  "C#": "#178600",
  Go: "#00add8",
  Rust: "#dea584",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  PHP: "#4f5d95",
  Ruby: "#cc342d",
  Swift: "#f05138",
  Dart: "#00b4ab",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#6b7cff",
  "Jupyter Notebook": "#da5b0b",
  Dockerfile: "#5f8fa8",
  Haskell: "#5e5086",
  Scala: "#c22d40",
  R: "#198ce7",
  MATLAB: "#e16737",
  TeX: "#3d9970",
  Assembly: "#a0794a",
  Makefile: "#427819",
  Elixir: "#9b6fb0",
  "Objective-C": "#438eff"
};

function languageColor(language) {
  if (LANGUAGE_COLORS[language]) return LANGUAGE_COLORS[language];
  let hash = 0;
  for (const char of language) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 62%)`;
}

/* ------------------------------------------------------------------- icons */

const ICON_ARROW = '<svg class="projects-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 9 9 3M4.2 3H9v4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>';
const ICON_STAR = '<svg class="projects-icon projects-icon--star" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 .8 7.6 4.2l3.7.4-2.8 2.5.8 3.7L6 8.9 2.7 10.8l.8-3.7L.7 4.6l3.7-.4Z" fill="currentColor"/></svg>';
const ICON_SIGNAL = '<svg class="projects-notice__glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 4 44 24 24 44 4 24Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 13v13" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><path d="M24 31.5v3.5" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><path d="M8 40 40 8" stroke="var(--red)" stroke-width="2"/></svg>';

/* -------------------------------------------------------------------- data */

let memory = null;   // { repos, total, at, stale? }
let loading = null;  // the single network request of this page load

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.repos) || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the memory cache still serves this visit.
  }
}

const hidden = new Set((Array.isArray(HIDDEN_PROJECTS) ? HIDDEN_PROJECTS : []).map((name) => String(name).toLowerCase()));

/** Keep only what the board shows; drop forks, archived and hidden repos, and the site itself. */
function normalize(list) {
  return list
    .filter((repo) => repo && !repo.fork && !repo.archived && !/\.github\.io$/i.test(repo.name || ""))
    .filter((repo) => !hidden.has(String(repo.name || "").toLowerCase()))
    .map((repo) => ({
      name: String(repo.name || ""),
      description: repo.description ? String(repo.description) : "",
      language: repo.language ? String(repo.language) : "",
      stars: Number(repo.stargazers_count) || 0,
      pushedAt: repo.pushed_at || repo.updated_at || null,
      url: String(repo.html_url || ""),
      homepage: repo.homepage ? String(repo.homepage) : ""
    }));
}

class BoardError extends Error {
  constructor(kind, { status = 0, resetAt = null } = {}) {
    super(kind);
    this.kind = kind;
    this.status = status;
    this.resetAt = resetAt;
  }
}

async function fetchRepos() {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  let response;
  try {
    response = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller?.signal
    });
  } catch {
    throw new BoardError("network");
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (response.status === 429 || (response.status === 403 && remaining === "0")) {
      throw new BoardError("rate", { status: response.status, resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null });
    }
    throw new BoardError(response.status === 403 ? "rate" : "http", { status: response.status });
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new BoardError("http", { status: response.status });
  }
  if (!Array.isArray(json)) throw new BoardError("http", { status: response.status });
  const repos = normalize(json);
  return { repos, total: repos.length, at: Date.now() };
}

/** Fresh data if we already have it (memory or a cache younger than the TTL). */
function peek() {
  if (memory) return memory;
  const cached = readCache();
  if (cached && Date.now() - cached.at < TTL_MS) {
    memory = cached;
    return memory;
  }
  return null;
}

/** Shared loader: one request per page load; falls back to a stale cache on failure. */
function load() {
  const ready = peek();
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = fetchRepos()
      .then((data) => {
        memory = data;
        writeCache(data);
        return data;
      })
      .catch((error) => {
        const stale = readCache();
        if (stale) {
          memory = { ...stale, stale: true };
          return memory;
        }
        throw error;
      });
  }
  return loading;
}

/** Featured first (in FEATURED_PROJECTS order), then stars, then most recent push. */
function rank(repos) {
  const featured = (Array.isArray(FEATURED_PROJECTS) ? FEATURED_PROJECTS : []).map((name) => String(name).toLowerCase());
  const featuredIndex = (repo) => {
    const index = featured.indexOf(repo.name.toLowerCase());
    return index === -1 ? Infinity : index;
  };
  return repos
    .slice()
    .sort((a, b) => {
      const fa = featuredIndex(a);
      const fb = featuredIndex(b);
      if (fa !== fb) return fa - fb;
      if (a.stars !== b.stars) return b.stars - a.stars;
      return (Date.parse(b.pushedAt) || 0) - (Date.parse(a.pushedAt) || 0);
    })
    .map((repo) => ({ ...repo, featured: featuredIndex(repo) !== Infinity }));
}

/* ---------------------------------------------------------------- helpers */

/** "my-cool_repoName" -> "my cool repo Name" (CSS uppercases it). */
function prettify(name) {
  return name
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || name;
}

/** Only http(s) URLs; bare domains get https://. Returns "" when unusable. */
function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const relative = typeof Intl !== "undefined" && Intl.RelativeTimeFormat
  ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  : null;

function updatedLabel(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const seconds = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];
  if (!relative) return `Updated ${new Date(time).toLocaleDateString("en")}`;
  for (const [unit, size] of units) {
    if (abs >= size) return `Updated ${relative.format(Math.round(seconds / size), unit)}`;
  }
  return "Updated just now";
}

const pad = (value) => String(value).padStart(2, "0");

/* -------------------------------------------------------------- templates */

function cardMarkup(repo, index) {
  const name = escapeHtml(prettify(repo.name));
  const original = escapeHtml(repo.name);
  const url = safeUrl(repo.url) || `${githubUrl()}/${encodeURIComponent(repo.name)}`;
  const homepage = safeUrl(repo.homepage);
  const description = repo.description
    ? `<p class="project-card__desc">${escapeHtml(repo.description)}</p>`
    : '<p class="project-card__desc is-empty">No description yet.</p>';
  const language = repo.language
    ? `<span class="project-card__lang"><span class="project-card__diamond" style="--lang: ${escapeHtml(languageColor(repo.language))}" aria-hidden="true"></span>${escapeHtml(repo.language)}</span>`
    : "";
  const stars = repo.stars > 0
    ? `<span class="project-card__stars">${ICON_STAR}<span>${repo.stars}</span><span class="visually-hidden"> ${repo.stars === 1 ? "star" : "stars"}</span></span>`
    : "";
  const updated = repo.pushedAt
    ? `<time class="project-card__time" datetime="${escapeHtml(repo.pushedAt)}" title="${escapeHtml(new Date(repo.pushedAt).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" }))}">${escapeHtml(updatedLabel(repo.pushedAt))}</time>`
    : "";
  const live = homepage
    ? `<a class="project-card__live" href="${escapeHtml(homepage)}" target="_blank" rel="noopener">Live<span class="visually-hidden"> site of ${name}</span>${ICON_ARROW}</a>`
    : "";
  const tag = repo.featured ? '<span class="project-card__tag">Featured</span>' : "";

  return `
    <li class="project-card${repo.featured ? " is-featured" : ""}">
      <div class="project-card__head">
        <span class="project-card__no">No.${pad(index + 1)}${tag}</span>
        ${language}
      </div>
      <h3 class="project-card__name">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${original}"><span class="project-card__label">${name}</span>${ICON_ARROW}</a>
      </h3>
      ${description}
      <div class="project-card__meta">
        ${stars}
        ${updated}
        ${live}
      </div>
    </li>`;
}

function skeletonMarkup(count) {
  const card = `
    <li class="project-card project-card--skeleton" aria-hidden="true">
      <span class="projects-sk projects-sk--head"></span>
      <span class="projects-sk projects-sk--name"></span>
      <span class="projects-sk projects-sk--line"></span>
      <span class="projects-sk projects-sk--line projects-sk--short"></span>
      <span class="projects-sk projects-sk--meta"></span>
    </li>`;
  return Array.from({ length: count }, () => card).join("");
}

function noticeMarkup({ kind, title, text, watermark }) {
  return `
    <div class="projects-notice projects-notice--${kind}" role="status">
      <span class="projects-notice__mark" aria-hidden="true">${watermark}</span>
      ${ICON_SIGNAL}
      <p class="projects-notice__title">${title}</p>
      <p class="projects-notice__text">${text}</p>
      <a class="projects-cta" href="${escapeHtml(githubUrl())}" target="_blank" rel="noopener">View my GitHub${ICON_ARROW}</a>
    </div>`;
}

function errorCopy(error) {
  if (error?.kind === "rate") {
    const minutes = error.resetAt ? Math.max(1, Math.ceil((error.resetAt - Date.now()) / 60000)) : null;
    return {
      title: "The board is resting",
      text: minutes
        ? `GitHub's rate limit kicked in. The live feed returns in about ${minutes} min, but every project is one click away.`
        : "GitHub's rate limit kicked in. The live feed returns soon, but every project is one click away."
    };
  }
  return {
    title: "Signal lost",
    text: "GitHub isn't answering right now. The projects are still there, waiting on my profile."
  };
}

/* ---------------------------------------------------------------- painting */

const roots = new Set();

function ensureRoot(container) {
  let root = container.querySelector(":scope > .projects");
  if (!root) {
    root = document.createElement("div");
    root.className = "projects";
    container.replaceChildren(root);
  }
  roots.add(root);
  return root;
}

function isVisible(element) {
  return element.isConnected && element.getClientRects().length > 0;
}

function paintLoading(root) {
  root.dataset.state = "loading";
  root.setAttribute("aria-busy", "true");
  root.innerHTML = `
    <p class="visually-hidden">Loading projects from GitHub…</p>
    <div class="projects__bar" aria-hidden="true"><span class="projects-sk projects-sk--bar"></span></div>
    <ol class="projects__list" role="list">${skeletonMarkup(SHOW)}</ol>`;
  fit(root);
}

function paintData(root, data, { animate }) {
  const ranked = rank(data.repos).slice(0, SHOW);
  root.removeAttribute("aria-busy");

  if (!ranked.length) {
    root.dataset.state = "empty";
    root.innerHTML = noticeMarkup({
      kind: "empty",
      watermark: "Empty",
      title: "The board is empty",
      text: "No public projects yet. New requests are on their way."
    });
    reveal(root, root.querySelectorAll(".projects-notice"), animate);
    return;
  }

  root.dataset.state = "ready";
  const staleNote = data.stale ? '<span class="projects__stale">Offline copy</span>' : "";
  root.innerHTML = `
    <div class="projects__bar">
      <p class="projects__count">Showing <b>${pad(ranked.length)}</b> of <b>${pad(data.total ?? data.repos.length)}</b>${staleNote}</p>
      <a class="projects__all" href="${escapeHtml(githubUrl())}?tab=repositories" target="_blank" rel="noopener">All repositories${ICON_ARROW}</a>
    </div>
    <ol class="projects__list" role="list">${ranked.map(cardMarkup).join("")}</ol>`;

  reveal(root, root.querySelectorAll(".project-card"), animate);
  fit(root);
}

function paintError(root, error, { animate }) {
  root.removeAttribute("aria-busy");
  root.dataset.state = "error";
  const copy = errorCopy(error);
  const watermark = error?.kind === "rate" ? "Resting" : "No signal";
  root.innerHTML = noticeMarkup({ kind: "error", watermark, ...copy });
  reveal(root, root.querySelectorAll(".projects-notice"), animate);
}

/**
 * Entrance: a quick cascade sliding in along the major diagonal. Web Animations (no
 * per-frame JS), so it shares the frames of a section transition without stalling it.
 */
function reveal(root, items, shouldAnimate) {
  if (!items.length || !shouldAnimate || prefersReducedMotion() || !isVisible(root)) return;
  const animations = Array.from(items, (item, i) => {
    item.getAnimations?.().forEach((running) => running.cancel());
    return animate(
      item,
      [
        { opacity: 0, translate: "-22px 3px", clipPath: "inset(-10% 100% -10% -10%)" },
        { opacity: 1, translate: "0px 0px", clipPath: "inset(-10% 0% -10% -10%)" }
      ],
      { duration: DUR.panel, delay: i * STAGGER, ease: "out" }
    );
  });
  allFinished(animations).then(() => {
    if (root.isConnected) fit(root);
  });
}

/**
 * Desktop only: if the list would run past the bottom of the viewport, cap it and let
 * it scroll inside the card (the desktop shell itself does not scroll).
 */
function fit(root) {
  const list = root.querySelector(".projects__list");
  if (!list) return;
  const uncap = () => {
    list.classList.remove("is-scrollable", "is-end");
    list.style.removeProperty("max-height");
  };
  if (isMobileLayout() || !isVisible(root)) {
    uncap();
    return;
  }
  window.requestAnimationFrame(() => {
    if (!list.isConnected) return;
    // Room below the list, in document coordinates (independent of any transient scroll).
    const room = () => window.innerHeight - 72 - (list.getBoundingClientRect().top + window.scrollY);
    list.style.removeProperty("max-height");
    const natural = list.scrollHeight;
    const room0 = room();
    if (natural <= room0 + 4) {
      uncap();
      return;
    }
    // Capping shrinks the card, and a vertically centred card then moves the list, so
    // the room is linear in the cap: room(L) = a + k * L. Sample it twice (one forced
    // layout, once per render) and solve for the cap that exactly fits.
    const trial = Math.max(FIT_MIN, Math.floor(room0));
    list.style.maxHeight = `${trial}px`;
    const room1 = room();
    const k = natural !== trial ? (room0 - room1) / (natural - trial) : 0;
    const fitted = k < 0.95 ? (room1 - k * trial) / (1 - k) : room1;
    list.style.maxHeight = `${Math.max(FIT_MIN, Math.floor(Math.min(fitted, natural)))}px`;
    list.classList.add("is-scrollable");
    updateScrollEdge(list);
  });
}

function updateScrollEdge(list) {
  list.classList.toggle("is-end", list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
}

/* ------------------------------------------------------------- public API */

/** Render the board into `container` (idempotent; instant when data is cached). */
export function renderProjects(container) {
  if (!container) return;
  const root = ensureRoot(container);
  const animate = isVisible(root);
  const ready = peek();
  if (ready) {
    paintData(root, ready, { animate });
    return;
  }

  paintLoading(root);
  load()
    .then((data) => {
      if (!root.isConnected) return;
      paintData(root, data, { animate: isVisible(root) });
    })
    .catch((error) => {
      if (!root.isConnected) return;
      paintError(root, error, { animate: isVisible(root) });
    });
}

export function init() {
  // Interaction sounds for the board (delegated: cards are re-rendered often).
  document.addEventListener(
    "pointerover",
    (event) => {
      const card = event.target.closest?.(".project-card:not(.project-card--skeleton)");
      if (card && !card.contains(event.relatedTarget)) sfx.hover();
    },
    { passive: true }
  );
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest?.(".projects a")) sfx.click();
    },
    true
  );
  // Keyboard focus: mark the card (robust fallback for :has(:focus-visible)) and bring
  // the whole card into view inside a capped list.
  document.addEventListener("focusin", (event) => {
    const card = event.target.closest?.(".project-card");
    if (!card) return;
    const keyboard = event.target.matches?.(":focus-visible") ?? false;
    card.classList.toggle("is-kb-focus", keyboard);
    if (keyboard && card.closest(".projects__list.is-scrollable")) {
      card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  });
  document.addEventListener("focusout", (event) => {
    event.target.closest?.(".project-card")?.classList.remove("is-kb-focus");
  });
  document.addEventListener(
    "scroll",
    (event) => {
      const list = event.target;
      if (list instanceof Element && list.classList.contains("is-scrollable")) updateScrollEdge(list);
    },
    { capture: true, passive: true }
  );

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      roots.forEach((root) => {
        if (root.isConnected) fit(root);
        else roots.delete(root);
      });
    }, 150);
  });
}
