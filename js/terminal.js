// System console: press ~ (the ` key) and a console drops from the top of the screen.
// It is not modal: the scene stays live under it, so `darkhour`, `time 00:15` or `cd skills`
// visibly change the world while you type. The commands and the parsing live in
// js/terminal-logic.js (pure, tested); this file is the UI and the browser context.
// Owner: HUD/overlays workstream (C).
import { EVT, emit, on, state, now as worldNow, moonPhase, isVirtualTime, setVirtualTime, prefersReducedMotion } from "./core.js";
import { gsap, DUR, EASE } from "./motion.js";
import { sfx } from "./sfx.js";
import { lofi } from "./lofi.js";
import { PROFILE, HOME, SECTIONS, SECTION_MAP, FEATURED_PROJECTS, ROMAN } from "./content.js";
import { showSection, showHome } from "./sections.js";
import { setDarkHour } from "./darkhour.js";
import { returnToNow } from "./timedial.js";
import { openBattle } from "./battle.js";
import { openSession } from "./rhythm.js";
import { showObjection } from "./objection.js";
import { openHints, closeHints, isHintsOpen } from "./hints.js";
import { shatter } from "./shatter.js";
import { timeOfDay } from "./hud.js";
import { toast } from "./toast.js";
import { dive, surface, canDive } from "./dive.js";
import { execute, expandHistory, pushHistory, completeLine, out, MAX_HISTORY } from "./terminal-logic.js";

const HISTORY_KEY = "p3:console:history";
const FOOL_KEY = "p3:arcana:fool";
const MAX_LINES = 300;
const USER = "guest@dark-hour";

let root = null;
let els = {};
let ctx = null;
let tl = null;
let opener = null;
let closing = false;
let greeted = false;
let history = readHistory();
let cursor = history.length;
let draft = "";
let lastTab = { value: null, at: 0 };
const shell = { mode: null };

/* ----------------------------------------------------------------- storage */

function readHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string").slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Private mode: the history lasts for this visit.
  }
}

function foolFound() {
  try {
    return window.localStorage.getItem(FOOL_KEY) === "1";
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- context */

/** Run `fn` at the surface: come up first when the camera is under the water. */
function atSurface(fn) {
  if (!state.depths) {
    fn();
    return;
  }
  surface();
  window.setTimeout(fn, DUR.panel * 1000 + 60);
}

/**
 * Close the console and hand over to a modal (it takes focus; its opener gets it back).
 * The modal covers the screen, so the console simply goes: no exit to watch.
 */
function handOff(fn) {
  const from = opener && opener !== document.body && opener.isConnected ? opener : null;
  closeConsole({ returnFocus: false, instant: true });
  fn(from);
}

/** Shatter the menu labels one by one, then the card. */
function shatterAll() {
  const labels = Array.from(document.querySelectorAll(".menu-item:not(.is-shattered) .menu-label"));
  const card = document.querySelector(".panel-wrap .card-stage > .content-card");
  const targets = [...labels, card].filter((el) => el && el.getClientRects().length);
  targets.forEach((el, i) => window.setTimeout(() => shatter(el), 300 + i * 120));
}

async function copyEmail() {
  let ok = false;
  try {
    await navigator.clipboard.writeText(PROFILE.email);
    ok = true;
  } catch {
    ok = false;
  }
  toast(ok ? PROFILE.email : "Select it from the console instead.", { kicker: ok ? "Copied" : "Copy failed" });
}

function openUrl(href) {
  if (href.startsWith("mailto:")) window.location.href = href;
  else window.open(href, "_blank", "noopener");
}

function buildContext() {
  const skillsSection = SECTION_MAP.skills ?? {};
  const greetings = HOME.details?.find((row) => Array.isArray(row[3]))?.[3] ?? ["Hello"];
  return {
    profile: PROFILE,
    sections: [HOME, ...SECTIONS].map(({ id, menu, code, title, copy }) => ({ id, menu, code, title, copy })),
    skills: (skillsSection.skills ?? []).map(({ name, spell }) => ({ name, spell })),
    fool: skillsSection.fool ?? null,
    roman: ROMAN,
    projects: FEATURED_PROJECTS,
    greetings,
    history,
    shell,
    host: window.location.host,
    random: Math.random,
    now: () => worldNow(),
    moon: () => moonPhase(worldNow()),
    timeOfDay: () => timeOfDay(worldNow(), state.darkhour),
    viewport: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100
    }),
    uptime: () => performance.now(),
    section: () => state.section,
    isVirtual: () => isVirtualTime(),
    isDarkHour: () => state.darkhour,
    isDepths: () => state.depths,
    isPlaying: () => Boolean(lofi.isPlaying?.()),
    canDive: () => canDive({ ignoreConsole: true }),
    foolFound,
    brokenCount: () => document.querySelectorAll(".glass-broken").length,
    showSection: (id) => atSurface(() => showSection(id)),
    showHome: () => atSurface(() => showHome()),
    setDarkHour: (active) => setDarkHour(active),
    setTime: (h, m) => {
      const date = new Date();
      date.setHours(h, m, 0, 0);
      setVirtualTime(date);
    },
    timeNow: () => returnToNow(),
    play: () => {
      sfx.unlock();
      lofi.start();
    },
    stop: () => lofi.stop(),
    dive: () => dive(),
    surface: () => surface(),
    reset: () => {
      sfx.back();
      emit(EVT.RESET, {});
    },
    battle: () => handOff((from) => openBattle({ from })),
    nightSession: () => handOff((from) => openSession({ from })),
    objection: () => showObjection(),
    hints: () => handOff(() => openHints(document.querySelector(".help-toggle"))),
    copyEmail,
    openUrl,
    shatterAll,
    clear,
    close: () => window.setTimeout(() => closeConsole(), 160)
  };
}

/* ------------------------------------------------------------------ output */

function lineElement(line) {
  const row = document.createElement("div");
  row.className = "console-line";
  row.dataset.tone = line.tone ?? "out";
  line.parts.forEach((part) => {
    let node;
    if (part.href) {
      node = document.createElement("a");
      node.href = part.href;
      if (/^https?:/.test(part.href)) {
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      }
    } else {
      node = document.createElement("span");
    }
    if (part.tone) node.dataset.tone = part.tone;
    node.textContent = part.text;
    row.append(node);
  });
  return row;
}

function print(lines) {
  if (!lines?.length) return;
  const fragment = document.createDocumentFragment();
  lines.forEach((line) => fragment.append(lineElement(line)));
  els.log.append(fragment);
  while (els.log.childElementCount > MAX_LINES) els.log.firstElementChild.remove();
  els.log.scrollTop = els.log.scrollHeight;
}

/** The typed line, after the prompt. */
function echo(text) {
  const row = document.createElement("div");
  row.className = "console-line console-line--cmd";
  const ps1 = document.createElement("span");
  ps1.className = "console-ps1";
  ps1.textContent = promptText();
  const typed = document.createElement("span");
  typed.textContent = text;
  row.append(ps1, " ", typed);
  els.log.append(row);
}

function clear() {
  els.log.replaceChildren();
}

function banner() {
  greeted = true;
  print([
    out("DARK HOUR OS 0.0 · tty1", "accent"),
    out("Type help and press Enter. Tab completes, Esc closes.", "dim")
  ]);
}

/* ------------------------------------------------------------------ prompt */

function promptText() {
  if (shell.mode === "vim") return "-- VIM --";
  const where = state.depths ? "~/.depths" : state.section && state.section !== "home" ? `~/${state.section}` : "~";
  return `${USER}:${where}$`;
}

function updatePrompt() {
  if (els.ps1) els.ps1.textContent = promptText();
}

function moveCaretToEnd() {
  const end = els.input.value.length;
  els.input.setSelectionRange(end, end);
}

function submit() {
  const raw = els.input.value;
  els.input.value = "";
  echo(raw);
  let line = raw.trim();

  if (!shell.mode) {
    const expansion = expandHistory(line, history);
    if (expansion.error) {
      print([out(expansion.error, "error")]);
      els.log.scrollTop = els.log.scrollHeight;
      return;
    }
    line = expansion.line;
    if (expansion.expanded) print([out(line, "dim")]);
    history = pushHistory(history, line);
    ctx.history = history;
    saveHistory();
  }
  cursor = history.length;
  draft = "";
  lastTab = { value: null, at: 0 };

  let lines;
  try {
    lines = execute(line, ctx);
  } catch (error) {
    console.warn("[terminal]", error);
    lines = [out("Something broke in there. Try again?", "error")];
  }
  print(lines);
  els.log.scrollTop = els.log.scrollHeight;
  updatePrompt();
}

function browse(step) {
  if (!history.length) return;
  if (cursor === history.length) draft = els.input.value;
  cursor = Math.max(0, Math.min(history.length, cursor + step));
  els.input.value = cursor === history.length ? draft : history[cursor];
  requestAnimationFrame(moveCaretToEnd);
}

function tab() {
  const value = els.input.value;
  const { line, matches } = completeLine(value, ctx);
  const at = performance.now();
  if (matches.length > 1 && line === value) {
    // A second Tab on the same line lists the options.
    if (lastTab.value === value && at - lastTab.at < 1200) {
      echo(value);
      print([out(matches.join("   "), "dim")]);
      lastTab = { value: null, at: 0 };
      return;
    }
    lastTab = { value, at };
    return;
  }
  els.input.value = line;
  lastTab = { value: line, at };
  moveCaretToEnd();
}

/* ------------------------------------------------------------------ keys */

const isToggleKey = (event) => event.code === "Backquote" || event.key === "`" || event.key === "~";
const plainKey = (event) => !event.ctrlKey && !event.metaKey && !event.altKey;

function isEditable(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

function onConsoleKey(event) {
  // Keep the page's shortcuts (nameplate Escape, Konami, the dive keys) out of the console.
  event.stopPropagation();
  // The ~ key closes the console from an empty prompt; mid-command it types (cd ~).
  const typing = event.target === els.input && els.input.value !== "";
  if ((isToggleKey(event) && plainKey(event) && !typing) || event.key === "Escape") {
    event.preventDefault();
    closeConsole();
    return;
  }
  if (event.target !== els.input) return;
  const key = event.key;
  if (key === "Enter") {
    if (event.isComposing) return;
    event.preventDefault();
    submit();
  } else if (key === "ArrowUp") {
    event.preventDefault();
    browse(-1);
  } else if (key === "ArrowDown") {
    event.preventDefault();
    browse(1);
  } else if (key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    tab();
  } else if (event.ctrlKey && key.toLowerCase() === "l") {
    event.preventDefault();
    clear();
  } else if (event.ctrlKey && key.toLowerCase() === "u") {
    event.preventDefault();
    els.input.value = "";
  } else if (event.ctrlKey && !event.metaKey && key.toLowerCase() === "c") {
    const input = els.input;
    const selected = input.selectionStart !== input.selectionEnd || !window.getSelection()?.isCollapsed;
    if (selected) return; // a real copy
    event.preventDefault();
    echo(`${input.value}^C`);
    input.value = "";
    if (shell.mode === "vim") print([out("Type  :q  and press Enter to exit Vim", "dim")]);
    els.log.scrollTop = els.log.scrollHeight;
  }
}

function onGlobalKey(event) {
  if (!isToggleKey(event) || !plainKey(event) || event.defaultPrevented) return;
  if (isConsoleOpen()) {
    event.preventDefault();
    closeConsole();
    return;
  }
  if (!state.introDone || document.querySelector("dialog[open]") || isEditable(event.target)) return;
  event.preventDefault();
  openConsole();
}

/* ------------------------------------------------------------- open / close */

function build() {
  if (root) return true;
  root = document.querySelector(".console");
  if (!root) return false;
  els = {
    plate: root.querySelector(".console-plate"),
    head: root.querySelector(".console-head"),
    log: root.querySelector(".console-log"),
    form: root.querySelector(".console-prompt"),
    ps1: root.querySelector(".console-prompt .console-ps1"),
    input: root.querySelector(".console-input"),
    close: root.querySelector(".console-close")
  };
  ctx = buildContext();
  root.addEventListener("keydown", onConsoleKey);
  els.form?.addEventListener("submit", (event) => event.preventDefault());
  els.close?.addEventListener("click", () => closeConsole());
  // Clicking the screen (not a link, not a selection) puts the caret back in the prompt.
  els.log.addEventListener("click", (event) => {
    if (event.target.closest("a") || !window.getSelection()?.isCollapsed) return;
    els.input.focus({ preventScroll: true });
  });
  return true;
}

export function isConsoleOpen() {
  return Boolean(root && !root.hidden && !closing);
}

/** Open the console. `from`: where focus goes back on close (defaults to the focused element). */
export function openConsole({ from = null } = {}) {
  if (!build() || !state.introDone) return;
  if (isConsoleOpen()) {
    els.input.focus({ preventScroll: true });
    return;
  }
  tl?.kill();
  closing = false;
  opener = from ?? document.activeElement;
  root.hidden = false;
  state.console = true;
  emit(EVT.CONSOLE, { open: true });
  sfx.dialog(true);
  updatePrompt();
  if (!greeted) banner();
  els.input.focus({ preventScroll: true });
  els.log.scrollTop = els.log.scrollHeight;

  const parts = [els.head, els.log, els.form].filter(Boolean);
  if (prefersReducedMotion()) {
    tl = gsap.timeline();
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none", clearProps: "opacity" });
    return;
  }
  tl = gsap.timeline();
  tl.fromTo(root, { yPercent: -105 }, { yPercent: 0, duration: DUR.panel, ease: EASE.snap }, 0)
    .fromTo(parts, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: DUR.ui, ease: EASE.out, stagger: 0.035 }, 0.14)
    .set([root, ...parts], { clearProps: "transform,opacity" });
}

export function closeConsole({ returnFocus = true, instant = false } = {}) {
  if (!isConsoleOpen()) return;
  closing = true;
  state.console = false;
  emit(EVT.CONSOLE, { open: false });
  sfx.dialog(false);

  const hadFocus = root.contains(document.activeElement);
  const target = opener;
  opener = null;
  if (hadFocus) {
    if (returnFocus && target?.isConnected && target !== document.body && target.focus) target.focus({ preventScroll: true });
    else document.activeElement?.blur?.();
  }

  const done = () => {
    closing = false;
    root.hidden = true;
    gsap.set([root, els.head, els.log, els.form].filter(Boolean), { clearProps: "transform,opacity" });
  };
  tl?.kill();
  if (instant) {
    done();
    return;
  }
  if (prefersReducedMotion()) {
    tl = gsap.timeline({ onComplete: done });
    tl.to(root, { opacity: 0, duration: 0.12, ease: "none" });
    return;
  }
  // Exit at ~60 % of the entrance.
  tl = gsap.timeline({ onComplete: done });
  tl.to(root, { yPercent: -105, duration: DUR.panel * 0.6, ease: EASE.in });
}

export function toggleConsole() {
  if (isConsoleOpen()) closeConsole();
  else openConsole();
}

/* -------------------------------------------------------------------- init */

export function init() {
  if (!build()) return;
  window.addEventListener("keydown", onGlobalKey);

  // "Open now" in the side requests and the engraving in the Depths.
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-console]");
    if (!trigger) return;
    const hints = trigger.closest("dialog");
    if (hints && isHintsOpen()) {
      const from = document.querySelector(".help-toggle");
      hints.addEventListener("close", () => openConsole({ from }), { once: true });
      closeHints();
    } else {
      openConsole({ from: trigger });
    }
  });

  on(EVT.SECTION_CHANGED, updatePrompt);
  on(EVT.DIVE, ({ preview }) => {
    if (!preview) updatePrompt();
  });
}
