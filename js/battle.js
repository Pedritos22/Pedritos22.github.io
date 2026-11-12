// Debug Battle: a turn-based skirmish against software bugs, fought with the skills from
// the Skills card. Every bug is weak to one skill (heavy damage + an extra turn) and
// resists another. Three bugs per run, then a rank. Weak spots you discover are remembered
// (localStorage) and shown on the commands next time.
//
// Entry points: the "Run a battle test" button on the Skills card ([data-battle]) and, in
// the Dark Hour, a bug that sometimes crawls along the bottom of the screen.
// Rules and numbers: js/battle-logic.js. Sprites: js/fx/bug-art.js.
import { EVT, on, state, prefersReducedMotion, pauseScene, escapeHtml as esc } from "./core.js";
import { DUR, animate, enterFrom } from "./motion.js";
import { sfx } from "./sfx.js";
import { SECTIONS, ROMAN } from "./content.js";
import {
  PLAYER_HP, ENEMY_HP, affinity, availableBugs, pickWaves, rollDamage, rollEnemyHit, rank
} from "./battle-logic.js";
import { bugSvg } from "./fx/bug-art.js";
import { mark } from "./marks.js";

const KNOWN_KEY = "p3:battle:known";
const ABORT = Symbol("battle-abort");
const TAGS = { weak: "Weak", resist: "Resist", normal: "Hit" };
const STAMPS = { weak: "Weak", resist: "Resist", crit: "Critical", extra: "Extra turn" };

const loadout = SECTIONS.find((section) => section.kind === "arcana")?.skills ?? [];
const skills = loadout.map((skill) => skill.name);
const spellOf = (name) => loadout.find((skill) => skill.name === name)?.spell ?? null;

let dialog = null;
let els = {};
let st = null; // the running battle
let runId = 0;
let known = readKnown();
let crawler = null;
let crawlTimer = 0;

/* ------------------------------------------------------------------ memory */

function readKnown() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KNOWN_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function learn(bugId, skill, kind) {
  known[bugId] = { ...(known[bugId] || {}), [skill]: kind };
  try {
    window.localStorage.setItem(KNOWN_KEY, JSON.stringify(known));
  } catch {
    // Private mode: the memory lasts for this visit.
  }
}

/* ------------------------------------------------------------------ timing */

const reduced = () => prefersReducedMotion();

/** Wait, then make sure this battle is still the one running (closing aborts it). */
function step(ms) {
  const id = runId;
  return new Promise((resolve, reject) => {
    window.setTimeout(() => (id === runId && st ? resolve() : reject(ABORT)), reduced() ? Math.min(ms, 220) : ms);
  });
}

const swallow = (error) => {
  if (error !== ABORT) console.error("[battle]", error);
};

/* ------------------------------------------------------------------- build */

function commandMarkup(skill, i) {
  return `<li><button class="battle__cmd" type="button" data-skill="${esc(skill.name)}">
      <span class="battle__cmd-no" aria-hidden="true">${ROMAN[i] ?? i + 1}</span>
      <span class="battle__cmd-mark" aria-hidden="true">${mark(skill.mark)}</span>
      <span class="battle__cmd-name">${esc(skill.name)}</span>
      <span class="battle__cmd-tag" data-aff="unknown">?</span>
    </button></li>`;
}

function build() {
  if (dialog) return;
  dialog = document.createElement("dialog");
  dialog.className = "battle";
  dialog.setAttribute("aria-labelledby", "battle-title");
  dialog.innerHTML = `
    <div class="battle__veil" aria-hidden="true"></div>
    <section class="battle__stage">
      <header class="battle__head">
        <p class="battle__kicker"><span>Debug session</span><b class="battle__wave">Bug 1 / 3</b></p>
        <h2 class="battle__title" id="battle-title">Battle test</h2>
        <button class="battle__flee" type="button"><span class="battle__key" aria-hidden="true">Esc</span><span>Flee</span></button>
      </header>
      <p class="battle__log" role="status" aria-live="polite"></p>
      <div class="battle__arena">
        <div class="battle__plate">
          <p class="battle__name"></p>
          <div class="battle__bar battle__bar--enemy" aria-hidden="true"><i></i></div>
          <p class="battle__hp">Integrity <b>100</b>/100</p>
        </div>
        <div class="battle__sprite" aria-hidden="true"></div>
        <div class="battle__fx" aria-hidden="true"></div>
      </div>
      <nav class="battle__commands" aria-label="Skills">
        <p class="battle__commands-label">Choose a skill <span aria-hidden="true">1-${skills.length}</span></p>
        <ul class="battle__cmd-list" role="list">${loadout.map(commandMarkup).join("")}</ul>
      </nav>
      <div class="battle__party">
        <p class="battle__party-name">Pietro</p>
        <div class="battle__bar battle__bar--focus" aria-hidden="true"><i></i></div>
        <p class="battle__hp">Focus <b>100</b>/100</p>
      </div>
      <div class="battle__result" hidden>
        <p class="battle__result-kicker"></p>
        <p class="battle__rank" aria-hidden="true"></p>
        <h3 class="battle__result-title" tabindex="-1"></h3>
        <ul class="battle__stats" role="list"></ul>
        <div class="battle__result-actions">
          <button class="action-link battle__again" type="button"><span>Run again</span></button>
          <button class="action-link secondary battle__close" type="button"><span>Close</span></button>
        </div>
      </div>
      <div class="battle__burst" aria-hidden="true">
        <svg class="battle__lines" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false"></svg>
        <p class="battle__burst-word"><span></span></p>
      </div>
    </section>`;
  document.body.append(dialog);

  const q = (sel) => dialog.querySelector(sel);
  els = {
    stage: q(".battle__stage"),
    wave: q(".battle__wave"),
    log: q(".battle__log"),
    arena: q(".battle__arena"),
    name: q(".battle__name"),
    enemyBar: q(".battle__bar--enemy > i"),
    enemyHp: q(".battle__plate .battle__hp b"),
    plate: q(".battle__plate"),
    sprite: q(".battle__sprite"),
    fx: q(".battle__fx"),
    commands: q(".battle__commands"),
    buttons: Array.from(dialog.querySelectorAll(".battle__cmd")),
    party: q(".battle__party"),
    focusBar: q(".battle__bar--focus > i"),
    focusHp: q(".battle__party .battle__hp b"),
    result: q(".battle__result"),
    resultKicker: q(".battle__result-kicker"),
    rank: q(".battle__rank"),
    resultTitle: q(".battle__result-title"),
    stats: q(".battle__stats"),
    again: q(".battle__again"),
    burst: q(".battle__burst"),
    lines: q(".battle__lines"),
    burstWord: q(".battle__burst-word span")
  };
  els.lines.innerHTML = speedLines();

  els.buttons.forEach((button) => {
    button.addEventListener("click", () => playerAct(button.dataset.skill));
    button.addEventListener("pointerenter", () => {
      if (!st?.busy) sfx.hover();
    });
  });
  els.commands.addEventListener("keydown", onCommandKey);
  dialog.addEventListener("keydown", onNumberKey);
  q(".battle__flee").addEventListener("click", () => dialog.close());
  q(".battle__close").addEventListener("click", () => dialog.close());
  els.again.addEventListener("click", () => {
    sfx.confirm();
    start(null);
  });
  dialog.addEventListener("close", onClose);
}

function speedLines() {
  let out = "";
  for (let i = 0; i < 44; i += 1) {
    const a = (i / 44) * Math.PI * 2 + (i % 3) * 0.02;
    const r0 = 150 + (i % 5) * 26;
    const r1 = 720;
    const w = 3 + (i % 4) * 2;
    const x0 = Math.cos(a) * r0;
    const y0 = Math.sin(a) * r0;
    const x1 = Math.cos(a) * r1;
    const y1 = Math.sin(a) * r1;
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    out += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${(x1 + nx).toFixed(1)} ${(y1 + ny).toFixed(1)}L${(x1 - nx).toFixed(1)} ${(y1 - ny).toFixed(1)}Z"/>`;
  }
  return out;
}

/* --------------------------------------------------------------- rendering */

function log(text) {
  els.log.textContent = text;
  if (!reduced()) enterFrom(els.log, { x: -16 }, { duration: DUR.ui, ease: "out" });
}

function setBar(bar, value, max) {
  bar.style.transform = `scaleX(${Math.max(0, value) / max})`;
}

function renderEnemy() {
  setBar(els.enemyBar, st.enemyHp, ENEMY_HP);
  els.enemyHp.textContent = String(st.enemyHp);
}

function renderParty() {
  setBar(els.focusBar, st.hp, PLAYER_HP);
  els.focusHp.textContent = String(st.hp);
  els.party.classList.toggle("is-low", st.hp <= 30);
}

function renderTags() {
  const memory = known[st.bug.id] || {};
  els.buttons.forEach((button) => {
    const kind = memory[button.dataset.skill];
    const tag = button.querySelector(".battle__cmd-tag");
    tag.dataset.aff = kind || "unknown";
    tag.textContent = kind ? TAGS[kind] : "?";
    button.setAttribute("aria-label", `${button.dataset.skill}${kind ? `, ${TAGS[kind].toLowerCase()}` : ", untested"}`);
  });
}

function lock(locked) {
  st.busy = locked;
  els.commands.classList.toggle("is-locked", locked);
  // aria-disabled, not disabled: the focused command keeps focus during the bug's turn.
  els.buttons.forEach((button) => {
    button.setAttribute("aria-disabled", String(locked));
  });
}

function focusCommand(index = 0) {
  const button = els.buttons[(index + els.buttons.length) % els.buttons.length];
  els.buttons.forEach((b) => {
    b.tabIndex = b === button ? 0 : -1;
  });
  button?.focus({ preventScroll: true });
}

function unlock() {
  if (!st) return;
  lock(false);
  focusCommand(Math.max(0, els.buttons.indexOf(st.lastButton)));
}

/* ------------------------------------------------------------------ effects */

/** A number (and optional stamp) popping out of a target, along the -8deg axis. */
function popNumber(host, value, kind) {
  const el = document.createElement("span");
  el.className = `battle__num battle__num--${kind}`;
  el.textContent = String(value);
  host.append(el);
  const done = reduced()
    ? animate(el, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 0.9, ease: "linear", fill: "both" })
    : animate(
        el,
        [
          { opacity: 0, translate: "0 18px", scale: "0.6" },
          { opacity: 1, translate: "0 0", scale: "1.08", offset: 0.18 },
          { opacity: 1, translate: "6px -10px", scale: "1", offset: 0.7 },
          { opacity: 0, translate: "10px -26px", scale: "1" }
        ],
        { duration: 1.0, ease: "out", fill: "both" }
      );
  done?.finished.then(() => el.remove(), () => el.remove());
}

function stampOn(host, kind) {
  const el = document.createElement("span");
  el.className = `battle__stamp battle__stamp--${kind}`;
  el.textContent = STAMPS[kind];
  host.append(el);
  const anim = reduced()
    ? animate(el, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1.1, ease: "linear", fill: "both" })
    : animate(
        el,
        [
          { opacity: 0, scale: "1.6" },
          { opacity: 1, scale: "1", offset: 0.12 },
          { opacity: 1, scale: "1", offset: 0.75 },
          { opacity: 0, scale: "1", translate: "0 -10px" }
        ],
        { duration: 1.15, ease: "out", fill: "both" }
      );
  anim?.finished.then(() => el.remove(), () => el.remove());
}

function shake(element, strength = 10) {
  if (reduced()) {
    animate(element, [{ opacity: 0.45 }, { opacity: 1 }], { duration: 0.18, ease: "linear", fill: "none" });
    return;
  }
  animate(
    element,
    [
      { translate: "0 0" },
      { translate: `${strength}px -2px` },
      { translate: `${-strength * 0.7}px 1px` },
      { translate: `${strength * 0.4}px 0` },
      { translate: `${-strength * 0.15}px 0` },
      { translate: "0 0" }
    ],
    { duration: 0.34, ease: "out", fill: "none" }
  );
}

function flash(element) {
  animate(element, [{ filter: "brightness(2.4)" }, { filter: "brightness(1)" }], { duration: 0.22, ease: "out", fill: "none" });
}

/** The bug's expression (bug-art.js draws them all; CSS shows this one). */
function setFace(face, holdMs = 0) {
  window.clearTimeout(st?.faceTimer);
  els.sprite.dataset.face = face;
  if (holdMs && st) {
    st.faceTimer = window.setTimeout(() => {
      if (st && st.enemyHp > 0) els.sprite.dataset.face = "idle";
    }, holdMs);
  }
}

/** A hit: the chromatic split flickers on the sprite for a moment. */
function glitchHit() {
  els.sprite.classList.add("is-hit");
  window.clearTimeout(els.sprite._hitTimer);
  els.sprite._hitTimer = window.setTimeout(() => els.sprite.classList.remove("is-hit"), reduced() ? 120 : 260);
}

/** The comic finisher: speed lines and a word on a red band at the major angle. */
async function burst(word) {
  els.burstWord.textContent = word;
  els.burst.classList.add("is-on");
  const anims = reduced()
    ? [animate(els.burst, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 0.9, ease: "linear", fill: "both" })]
    : [
        animate(els.lines, [{ opacity: 0, scale: "1.4" }, { opacity: 1, scale: "1", offset: 0.25 }, { opacity: 1, scale: "1", offset: 0.75 }, { opacity: 0, scale: "1.05" }], { duration: 1.1, ease: "out", fill: "both" }),
        animate(
          els.burstWord.parentElement,
          [
            { opacity: 0, translate: "-60% 8%", scale: "1.15" },
            { opacity: 1, translate: "0 0", scale: "1", offset: 0.22 },
            { opacity: 1, translate: "3% -0.4%", scale: "1", offset: 0.78 },
            { opacity: 0, translate: "40% -5%", scale: "1" }
          ],
          { duration: 1.1, ease: "snap", fill: "both" }
        )
      ];
  await Promise.all(anims.filter(Boolean).map((a) => a.finished.catch(() => null)));
  els.burst.classList.remove("is-on");
}

/* ------------------------------------------------------------------- battle */

function startWave(index) {
  st.wave = index;
  st.bug = st.waves[index];
  st.enemyHp = ENEMY_HP;
  els.wave.textContent = `Bug ${index + 1} / ${st.waves.length}`;
  els.name.textContent = st.bug.name;
  els.sprite.innerHTML = bugSvg(st.bug);
  els.sprite.classList.remove("is-down", "is-hit");
  els.sprite.dataset.clones = "0";
  setFace("idle");
  renderEnemy();
  renderTags();
  log(`Bug spotted: ${st.bug.name}.`);
  if (!reduced()) {
    enterFrom(els.sprite, { x: 120, y: -17 }, { duration: DUR.scene, ease: "out" });
    enterFrom(els.plate, { x: -40 }, { duration: DUR.panel, delay: 0.1, ease: "out" });
  }
}

async function playerAct(skill) {
  if (!st || st.busy || !skill) return;
  const id = runId;
  st.lastButton = els.buttons.find((b) => b.dataset.skill === skill) ?? st.lastButton;
  lock(true);
  try {
    st.turns += 1;
    const kind = affinity(st.bug, skill);
    const { amount, crit } = rollDamage(kind);
    const shown = crit ? "crit" : kind;
    const spell = spellOf(skill);
    log(spell ? `Pietro casts ${spell}` : `Pietro uses ${skill}.`);
    if (!reduced()) animate(els.party, [{ translate: "0 0" }, { translate: "-14px -4px" }, { translate: "0 0" }], { duration: 0.24, ease: "out", fill: "none" });
    await step(200);

    sfx.hit(shown);
    shake(els.sprite, kind === "resist" ? 4 : 12);
    flash(els.sprite);
    if (kind !== "resist") glitchHit();
    setFace(kind === "weak" ? "dizzy" : kind === "resist" ? "idle" : "hurt", 900);
    popNumber(els.fx, amount, shown);
    if (shown !== "normal") stampOn(els.fx, shown);
    learn(st.bug.id, skill, kind);
    renderTags();
    st.enemyHp = Math.max(0, st.enemyHp - amount);
    st.maxHit = Math.max(st.maxHit, amount);
    renderEnemy();
    if (kind === "weak") {
      st.weakHits += 1;
      log(`${st.bug.fix} Weak spot!`);
    } else if (kind === "resist") {
      log(`${st.bug.name} shrugs it off.`);
    } else if (crit) {
      log("Critical hit!");
    }
    await step(560);

    if (st.enemyHp <= 0) {
      await defeat(kind === "weak");
      return;
    }
    if (kind === "weak") {
      stampOn(els.party, "extra");
      log(`${st.bug.fix} Weak spot: extra turn!`);
      await step(260);
      if (id === runId) unlock();
      return;
    }
    await enemyTurn();
  } catch (error) {
    swallow(error);
  }
}

async function enemyTurn() {
  const line = st.bug.lines[Math.floor(Math.random() * st.bug.lines.length)];
  log(`${st.bug.name}: “${line}”`);
  setFace("idle");
  // Fork Bomb: one more copy spawns behind it every time it acts.
  if (st.bug.motif === "fork") els.sprite.dataset.clones = String(Math.min(3, Number(els.sprite.dataset.clones || 0) + 1));
  if (!reduced()) animate(els.sprite, [{ translate: "0 0" }, { translate: "-26px 4px" }, { translate: "0 0" }], { duration: 0.3, ease: "snap", fill: "none" });
  await step(240);
  const hit = rollEnemyHit();
  sfx.hurt();
  st.hp = Math.max(0, st.hp - hit);
  st.damageTaken += hit;
  renderParty();
  shake(els.party, 8);
  popNumber(els.party, hit, "hurt");
  await step(560);
  if (st.hp <= 0) {
    showResult(false);
    return;
  }
  unlock();
}

async function defeat(byWeakSpot) {
  sfx.finisher();
  setFace("down");
  els.sprite.classList.add("is-down");
  await burst(byWeakSpot ? "Patch deployed" : "Fixed");
  await step(0); // closed during the finisher? stop here
  st.fixed += 1;
  if (st.wave + 1 < st.waves.length) {
    await step(160);
    startWave(st.wave + 1);
    await step(300);
    unlock();
  } else {
    showResult(true);
  }
}

function showResult(won) {
  const grade = won ? rank({ turns: st.turns, damageTaken: st.damageTaken, weakHits: st.weakHits, waves: st.waves.length }) : "";
  els.commands.hidden = true;
  els.result.hidden = false;
  els.result.dataset.outcome = won ? "won" : "lost";
  els.resultKicker.textContent = won ? "All tests passing" : "Focus at zero";
  els.rank.textContent = won ? grade : "×";
  els.resultTitle.textContent = won ? `Rank ${grade}. Ship it.` : "Burnout. Take a break.";
  const rows = [
    ["Bugs fixed", `${st.fixed} / ${st.waves.length}`],
    ["Turns", String(st.turns)],
    ["Weak spots hit", String(st.weakHits)],
    ["Biggest hit", String(st.maxHit)],
    ["Focus left", `${st.hp} / ${PLAYER_HP}`]
  ];
  els.stats.innerHTML = rows.map(([label, value]) => `<li><span>${esc(label)}</span><b>${esc(value)}</b></li>`).join("");
  log(won ? `Run cleared with rank ${grade}.` : "Pietro needs a coffee. Try again?");
  if (won) sfx.confirm();
  else sfx.back();
  if (!reduced()) {
    enterFrom(els.result, { x: -40, y: 6 }, { duration: DUR.panel, ease: "out" });
    enterFrom(els.rank, { scale: 1.6 }, { duration: DUR.scene, delay: 0.08, ease: "spring" });
  }
  els.again.focus({ preventScroll: true });
}

/** Start (or restart) a run. `first`: id of the bug to open with (the Dark Hour crawler). */
function start(first) {
  runId += 1;
  st = {
    waves: pickWaves(skills, Math.random, { first }),
    wave: 0,
    bug: null,
    enemyHp: ENEMY_HP,
    hp: PLAYER_HP,
    turns: 0,
    weakHits: 0,
    damageTaken: 0,
    maxHit: 0,
    fixed: 0,
    busy: false,
    lastButton: null
  };
  els.commands.hidden = false;
  els.result.hidden = true;
  els.burst.classList.remove("is-on");
  els.fx.replaceChildren();
  renderParty();
  startWave(0);
  lock(false);
  focusCommand(0);
}

/* ---------------------------------------------------------------- keyboard */

function onCommandKey(event) {
  const index = els.buttons.indexOf(document.activeElement);
  if (index < 0) return;
  const cols = window.matchMedia("(max-width: 920px)").matches ? 2 : 1;
  const moves = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 };
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusCommand(event.key === "Home" ? 0 : els.buttons.length - 1);
    sfx.hover();
    return;
  }
  if (!(event.key in moves)) return;
  event.preventDefault();
  focusCommand(index + moves[event.key]);
  sfx.hover();
}

function onNumberKey(event) {
  if (!st || st.busy || els.commands.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  const n = Number.parseInt(event.key, 10);
  if (!Number.isInteger(n) || n < 1 || n > els.buttons.length) return;
  event.preventDefault();
  focusCommand(n - 1);
  playerAct(els.buttons[n - 1].dataset.skill);
}

/* ------------------------------------------------------------- open / close */

let opener = null;

/** Open the battle (no-op while another dialog is open or the loadout has no bugs). */
export function openBattle({ first = null, from = null } = {}) {
  if (!availableBugs(skills).length) return;
  if (document.querySelector("dialog[open]")) return;
  build();
  opener = from ?? document.activeElement;
  dialog.showModal();
  pauseScene(true); // the veil hides the scenery: stop drawing it
  sfx.dialog(true);
  start(first);
  if (!reduced()) {
    enterFrom(els.stage, { x: -60, y: 8 }, { duration: DUR.panel, ease: "snap" });
  }
}

function onClose() {
  runId += 1;
  st = null;
  pauseScene(false);
  sfx.dialog(false);
  els.fx.replaceChildren();
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

/* ------------------------------------------------------- Dark Hour crawler */

function removeCrawler() {
  crawler?.getAnimations().forEach((a) => a.cancel());
  crawler?.remove();
  crawler = null;
}

function scheduleCrawler() {
  window.clearTimeout(crawlTimer);
  if (!state.darkhour) return;
  crawlTimer = window.setTimeout(spawnCrawler, 20000 + Math.random() * 40000);
}

/** Send a bug across the screen now (Dark Hour only; also a QA hook). */
export function spawnCrawler() {
  if (!state.darkhour || crawler || document.hidden || document.querySelector("dialog[open]")) {
    scheduleCrawler();
    return;
  }
  const pool = availableBugs(skills);
  if (!pool.length) return;
  const bug = pool[Math.floor(Math.random() * pool.length)];
  crawler = document.createElement("button");
  crawler.type = "button";
  crawler.className = "bug-crawler";
  crawler.setAttribute("aria-label", `A bug is crawling by: ${bug.name}. Start a battle test.`);
  crawler.innerHTML = bugSvg(bug);
  const fromLeft = Math.random() < 0.5;
  crawler.dataset.dir = fromLeft ? "1" : "-1";
  document.body.append(crawler);
  crawler.addEventListener("click", () => {
    removeCrawler();
    openBattle({ first: bug.id, from: null });
  });

  const span = window.innerWidth + 160;
  const from = fromLeft ? -80 : window.innerWidth + 80;
  const to = fromLeft ? from + span : from - span;
  const walk = reduced()
    ? animate(crawler, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 9, ease: "linear", fill: "both" })
    : animate(crawler, [{ translate: `${from}px 0` }, { translate: `${to}px 0` }], { duration: 16, ease: "linear", fill: "both" });
  if (reduced()) crawler.style.translate = `${window.innerWidth * 0.7}px 0`;
  walk?.finished.then(() => {
    removeCrawler();
    scheduleCrawler();
  }, () => {});
}

/* -------------------------------------------------------------------- init */

export function init() {
  // Capture phase: the glass engine stops clicks inside the card (and this is not a knock).
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("[data-battle]");
      if (!button) return;
      event.stopPropagation();
      sfx.confirm();
      openBattle({ from: button });
    },
    true
  );

  on(EVT.DARKHOUR, ({ active }) => {
    if (active) scheduleCrawler();
    else {
      window.clearTimeout(crawlTimer);
      removeCrawler();
    }
  });
  if (state.darkhour) scheduleCrawler();
}
