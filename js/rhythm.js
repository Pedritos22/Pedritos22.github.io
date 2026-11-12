// Night Session: a four-lane rhythm game played along with the generative lo-fi (a nod to
// OpenGuitar). The engine announces every bar about a bar before it plays (lofi.onPlan);
// kicks, snares and the melody become notes riding a highway at the major angle toward the
// hit line. Keys D F J K (or the pads on touch screens). 16 bars, then a rank.
//
// Timing runs on the audio clock: the time the listener actually hears is read from
// AudioContext.getOutputTimestamp() (output latency included), shifted by a per-visitor
// timing offset. Rules and scoring: js/rhythm-logic.js.
//
// Entry: hold the lo-fi button in the HUD, or "Play now" in the side requests (hint 10).
import { prefersReducedMotion, pauseScene, rafLoop, clamp } from "./core.js";
import { DUR, animate, enterFrom } from "./motion.js";
import { sfx, getAudioContext } from "./sfx.js";
import { lofi } from "./lofi.js";
import { closeHints, isHintsOpen } from "./hints.js";
import {
  LANES, KEY_TO_LANE, WINDOWS, chartBar, judge, closestNote, points, accuracy, sessionRank
} from "./rhythm-logic.js";

const BARS = 16;
const TRAVEL = 1.7; // seconds a note is visible before its hit time
const HOLD_MS = 550; // long-press on the lo-fi button
const OFFSET_KEY = "p3:session:offset";
const DIFFICULTY_KEY = "p3:session:difficulty";
const NO_MUSIC_MS = 9000; // give up when no bar arrives in this long
const LANE_COLORS = ["--blue-soft", "--cyan", "--hot", "--gold"];
const JUDGE_TEXT = { perfect: "Perfect", great: "Great", miss: "Miss" };
const TAN8 = Math.tan((8 * Math.PI) / 180);

let dialog = null;
let els = {};
let run = null;
let opener = null;
let colors = [];
let offsetMs = readNumber(OFFSET_KEY, 0);
let difficulty = readString(DIFFICULTY_KEY, "normal");

/* ----------------------------------------------------------------- storage */

function readNumber(key, fallback) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return window.localStorage.getItem(key) !== null && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readString(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Private mode: the setting lasts for this visit.
  }
}

/* ------------------------------------------------------------------- clock */

/** AudioContext time the listener hears right now, minus the visitor's timing offset. */
function gameNow() {
  const c = getAudioContext();
  if (!c) return 0;
  let heard = c.currentTime - (c.outputLatency || c.baseLatency || 0);
  const stamp = c.getOutputTimestamp?.();
  if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0) {
    heard = stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
  }
  return heard - offsetMs / 1000;
}

/* ------------------------------------------------------------------- build */

function build() {
  if (dialog) return;
  dialog = document.createElement("dialog");
  dialog.className = "session";
  dialog.setAttribute("aria-labelledby", "session-title");
  const lanes = LANES.map((key, i) => `<i class="session__lane" data-lane="${i}"></i>`).join("");
  const caps = LANES.map((key, i) => `<span class="session__cap" data-lane="${i}">${key}</span>`).join("");
  const pads = LANES.map((key, i) => `<button class="session__pad" type="button" data-lane="${i}" aria-label="Lane ${key}">${key}</button>`).join("");
  dialog.innerHTML = `
    <div class="session__veil" aria-hidden="true"></div>
    <section class="session__stage">
      <header class="session__head">
        <p class="session__kicker"><span>Night session</span><b class="session__bar">Bar 00 / ${BARS}</b></p>
        <h2 class="session__title" id="session-title">Night Session</h2>
        <p class="session__score"><span>Score</span><b>0</b></p>
        <button class="session__quit" type="button"><span class="session__key" aria-hidden="true">Esc</span><span>Quit</span></button>
      </header>
      <div class="session__track" aria-hidden="true">
        <div class="session__highway">
          <div class="session__lanes">${lanes}</div>
          <canvas class="session__canvas"></canvas>
          <span class="session__hitline"></span>
          <div class="session__caps">${caps}</div>
        </div>
        <p class="session__judge"></p>
        <p class="session__combo"><b>0</b><span>Combo</span></p>
        <p class="session__status"></p>
      </div>
      <div class="session__pads" role="group" aria-label="Lanes">${pads}</div>
      <div class="session__intro">
        <p class="session__lede">Play along with tonight's lo-fi. Notes ride the diagonal toward the line: hit
          <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> (or tap the lanes) as they cross it.
          Kick, snare, then the melody, low and high.</p>
        <fieldset class="session__difficulty">
          <legend>Difficulty</legend>
          <label><input type="radio" name="session-difficulty" value="easy" /><span>Easy</span></label>
          <label><input type="radio" name="session-difficulty" value="normal" /><span>Normal</span></label>
        </fieldset>
        <label class="session__offset">
          <span>Timing offset <b class="session__offset-value">0 ms</b></span>
          <input type="range" min="-120" max="120" step="5" value="0" />
          <small>Hits feel late? Move it right. Early? Left.</small>
        </label>
        <div class="session__actions">
          <button class="action-link session__start" type="button"><span>Start session</span></button>
        </div>
      </div>
      <div class="session__result" hidden>
        <p class="session__result-kicker">Session over</p>
        <p class="session__rank" aria-hidden="true"></p>
        <h3 class="session__result-title"></h3>
        <ul class="session__stats" role="list"></ul>
        <div class="session__actions">
          <button class="action-link session__again" type="button"><span>Play again</span></button>
          <button class="action-link secondary session__close" type="button"><span>Close</span></button>
        </div>
      </div>
      <p class="visually-hidden session__live" aria-live="polite"></p>
    </section>`;
  document.body.append(dialog);

  const q = (sel) => dialog.querySelector(sel);
  els = {
    stage: q(".session__stage"),
    bar: q(".session__bar"),
    score: q(".session__score b"),
    track: q(".session__track"),
    highway: q(".session__highway"),
    canvas: q(".session__canvas"),
    caps: Array.from(dialog.querySelectorAll(".session__cap")),
    pads: Array.from(dialog.querySelectorAll(".session__pad")),
    judge: q(".session__judge"),
    combo: q(".session__combo"),
    comboValue: q(".session__combo b"),
    status: q(".session__status"),
    intro: q(".session__intro"),
    start: q(".session__start"),
    offset: q(".session__offset input"),
    offsetValue: q(".session__offset-value"),
    result: q(".session__result"),
    rank: q(".session__rank"),
    resultTitle: q(".session__result-title"),
    stats: q(".session__stats"),
    again: q(".session__again"),
    live: q(".session__live")
  };

  dialog.querySelectorAll('input[name="session-difficulty"]').forEach((input) => {
    input.checked = input.value === difficulty;
    input.addEventListener("change", () => {
      difficulty = input.value;
      store(DIFFICULTY_KEY, difficulty);
      sfx.hover();
    });
  });
  els.offset.value = String(offsetMs);
  const showOffset = () => {
    els.offsetValue.textContent = `${offsetMs > 0 ? "+" : ""}${offsetMs} ms`;
  };
  showOffset();
  els.offset.addEventListener("input", () => {
    offsetMs = clamp(Number(els.offset.value) || 0, -120, 120);
    store(OFFSET_KEY, offsetMs);
    showOffset();
  });

  els.start.addEventListener("click", () => begin());
  els.again.addEventListener("click", () => {
    els.result.hidden = true;
    begin();
  });
  q(".session__quit").addEventListener("click", () => dialog.close());
  q(".session__close").addEventListener("click", () => dialog.close());
  els.pads.forEach((pad) => {
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      hit(Number(pad.dataset.lane));
    });
  });
  dialog.addEventListener("keydown", onKeydown);
  dialog.addEventListener("keyup", onKeyup);
  dialog.addEventListener("close", onClose);
}

/* ---------------------------------------------------------------- the run */

function readColors() {
  const style = getComputedStyle(document.documentElement);
  colors = LANE_COLORS.map((name) => style.getPropertyValue(name).trim() || "#fff");
  colors.paper = style.getPropertyValue("--paper").trim() || "#fff";
}

function resizeCanvas() {
  const { canvas } = els;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  run.view = { w, h, dpr, hitX: Math.min(140, w * 0.14) };
}

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

async function begin() {
  run?.unsubscribe?.();
  run?.stopLoop?.();
  sfx.confirm();
  readColors();
  run = {
    notes: [],
    lastTimes: [-Infinity, -Infinity, -Infinity, -Infinity],
    barStarts: [],
    stats: { perfect: 0, great: 0, miss: 0 },
    combo: 0,
    maxCombo: 0,
    score: 0,
    flashes: [],
    ended: false,
    wasPlaying: run?.wasPlaying ?? lofi.isPlaying(),
    startedAt: performance.now(),
    view: null
  };
  els.intro.hidden = true;
  els.result.hidden = true;
  els.track.classList.add("is-live");
  els.score.textContent = "0";
  els.bar.textContent = `Bar 00 / ${BARS}`;
  showCombo();
  resizeCanvas();
  setStatus("Listen…");

  run.unsubscribe = lofi.onPlan(onPlan);
  if (!lofi.isPlaying()) await lofi.start();
  if (lofi.getVolume() < 0.05) setStatus("Turn the music up (volume in the HUD)");
  run.stopLoop = rafLoop(frame, { always: true });
  els.pads[0]?.focus({ preventScroll: true });
}

function onPlan(plan) {
  if (!run || run.ended || run.barStarts.length >= BARS) return;
  // A bar has to arrive early enough for its notes to travel in from the edge.
  if (plan.barStart < gameNow() + TRAVEL) return;
  const notes = chartBar(plan.events, { difficulty, lastTimes: run.lastTimes });
  // The session starts on the first bar with something to play (the intro may be hats only).
  if (!run.barStarts.length && !notes.length) return;
  run.barStarts.push(plan.barStart);
  run.notes.push(...notes);
  run.lastTime = plan.barStart + plan.sixteenth * 16;
}

function showCombo() {
  els.comboValue.textContent = String(run?.combo ?? 0);
  els.combo.classList.toggle("is-on", (run?.combo ?? 0) >= 4);
}

function showJudge(kind) {
  els.judge.textContent = JUDGE_TEXT[kind];
  els.judge.dataset.kind = kind;
  if (prefersReducedMotion()) return;
  els.judge.getAnimations().forEach((a) => a.cancel());
  animate(
    els.judge,
    [
      { opacity: 0, scale: "1.3" },
      { opacity: 1, scale: "1", offset: 0.15 },
      { opacity: 1, scale: "1", offset: 0.7 },
      { opacity: 0, scale: "1" }
    ],
    { duration: 0.6, ease: "out", fill: "both" }
  );
}

function record(note, kind, now) {
  note.result = kind;
  run.stats[kind] += 1;
  if (kind === "miss") {
    run.combo = 0;
  } else {
    run.combo += 1;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    run.score += points(kind, run.combo);
    els.score.textContent = String(run.score);
    run.flashes.push({ lane: note.lane, at: now, kind });
  }
  showCombo();
  showJudge(kind);
}

function hit(lane) {
  if (!run || run.ended || !Number.isInteger(lane)) return;
  const cap = els.caps[lane];
  cap?.classList.add("is-down");
  window.setTimeout(() => cap?.classList.remove("is-down"), 90);
  const now = gameNow();
  const note = closestNote(run.notes, lane, now);
  if (!note) return; // a free tap: no note near, no penalty
  record(note, judge(now - note.time), now);
}

/* ----------------------------------------------------------------- drawing */

function lanePlate(ctx, x, y, w, h) {
  const s = h * TAN8;
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + w + s, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function frame() {
  if (!run) return;
  const now = gameNow();
  const { w, h, dpr, hitX } = run.view;
  const ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const laneH = h / LANES.length;
  const speed = (w - hitX) / TRAVEL;
  const reduced = prefersReducedMotion();

  // Notes that slipped past the line are misses.
  for (const note of run.notes) {
    if (!note.result && now - note.time > WINDOWS.great) record(note, "miss", now);
  }

  for (const note of run.notes) {
    const x = hitX + (note.time - now) * speed;
    if (x > w + 40 || x < -60) continue;
    if (note.result && note.result !== "miss") continue;
    const y = note.lane * laneH + laneH * 0.2;
    const nh = laneH * 0.6;
    ctx.globalAlpha = note.result === "miss" ? 0.25 : 1;
    // Trail: a short streak behind the note (none with reduced motion).
    if (!reduced && !note.result) {
      const gradient = ctx.createLinearGradient(x, 0, x + 70, 0);
      gradient.addColorStop(0, colors[note.lane]);
      gradient.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = gradient;
      lanePlate(ctx, x + 10, y + nh * 0.3, 70, nh * 0.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = colors[note.lane];
    lanePlate(ctx, x - 14, y, 28, nh);
    ctx.fill();
    ctx.fillStyle = colors.paper;
    ctx.globalAlpha *= 0.9;
    lanePlate(ctx, x - 3, y + 3, 4, nh - 6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Hit flashes on the line.
  run.flashes = run.flashes.filter((flash) => now - flash.at < 0.25);
  for (const flash of run.flashes) {
    const k = 1 - (now - flash.at) / 0.25;
    const y = flash.lane * laneH;
    ctx.globalAlpha = k * (flash.kind === "perfect" ? 0.9 : 0.6);
    ctx.fillStyle = colors[flash.lane];
    const grow = reduced ? 0 : (1 - k) * 18;
    lanePlate(ctx, hitX - 22 - grow, y + 4 - grow * 0.3, 44 + grow * 2, laneH - 8 + grow * 0.6);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Bar counter and status.
  const bar = run.barStarts.filter((start) => start <= now).length;
  els.bar.textContent = `Bar ${String(bar).padStart(2, "0")} / ${BARS}`;
  if (run.barStarts.length && els.status.textContent) {
    const first = run.barStarts[0];
    if (now >= first - TRAVEL) setStatus("");
    else if (els.status.textContent === "Listen…" && first - now < TRAVEL + 1.5) setStatus("Get ready");
  }
  if (!run.barStarts.length && performance.now() - run.startedAt > NO_MUSIC_MS) {
    setStatus("The music did not start. Check your sound and try again.");
  }

  // Done: every bar charted and played, every note judged.
  if (run.barStarts.length >= BARS && now > run.lastTime + 0.4 && run.notes.every((n) => n.result)) finish();
}

/* ----------------------------------------------------------------- results */

function finish() {
  if (!run || run.ended) return;
  run.ended = true;
  run.unsubscribe?.();
  run.stopLoop?.();
  const acc = accuracy(run.stats);
  const grade = sessionRank(acc);
  els.track.classList.remove("is-live");
  els.result.hidden = false;
  els.rank.textContent = grade;
  els.result.dataset.rank = grade;
  els.resultTitle.textContent = { S: "Perfect pitch.", A: "In the pocket.", B: "Nice groove.", C: "Keep jamming." }[grade];
  const rows = [
    ["Score", String(run.score)],
    ["Accuracy", `${Math.round(acc * 100)}%`],
    ["Max combo", String(run.maxCombo)],
    ["Perfect / Great / Miss", `${run.stats.perfect} / ${run.stats.great} / ${run.stats.miss}`]
  ];
  els.stats.innerHTML = rows.map(([label, value]) => `<li><span>${label}</span><b>${value}</b></li>`).join("");
  els.live.textContent = `Session over. Rank ${grade}, ${Math.round(acc * 100)} percent accuracy, max combo ${run.maxCombo}.`;
  sfx.confirm();
  if (!prefersReducedMotion()) {
    enterFrom(els.result, { x: -40, y: 6 }, { duration: DUR.panel, ease: "out" });
    enterFrom(els.rank, { scale: 1.6 }, { duration: DUR.scene, delay: 0.08, ease: "spring" });
  }
  els.again.focus({ preventScroll: true });
}

/* ---------------------------------------------------------------- keyboard */

function onKeydown(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const lane = KEY_TO_LANE[event.key.toLowerCase()];
  if (lane === undefined || !run || run.ended || !els.intro.hidden) return;
  event.preventDefault();
  if (!event.repeat) hit(lane);
}

function onKeyup(event) {
  const lane = KEY_TO_LANE[event.key?.toLowerCase()];
  if (lane !== undefined) els.caps[lane]?.classList.remove("is-down");
}

/* ------------------------------------------------------------- open / close */

/** Open the Night Session (closing the side requests first when it starts from there). */
export function openSession({ from = null } = {}) {
  build();
  if (dialog.open) return;
  if (document.querySelector("dialog[open]")) return;
  opener = from ?? document.activeElement;
  run = null;
  els.intro.hidden = false;
  els.result.hidden = true;
  els.track.classList.remove("is-live");
  setStatus("");
  dialog.showModal();
  pauseScene(true);
  sfx.dialog(true);
  if (!prefersReducedMotion()) enterFrom(els.stage, { x: -60, y: 8 }, { duration: DUR.panel, ease: "snap" });
  els.start.focus({ preventScroll: true });
}

function onClose() {
  pauseScene(false);
  sfx.dialog(false);
  if (run) {
    run.unsubscribe?.();
    run.stopLoop?.();
    // Leave the music as the session found it.
    if (!run.wasPlaying && lofi.isPlaying()) lofi.stop();
  }
  run = null;
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

/** QA: the running session (notes, stats), or null. */
export function sessionState() {
  return run;
}

/** QA: the session clock (heard audio time minus the timing offset). */
export const sessionClock = gameNow;

/* -------------------------------------------------------------------- init */

function bindLongPress() {
  const button = document.querySelector(".audio-toggle");
  if (!button) return;
  let timer = 0;
  let fired = false;
  const cancel = () => window.clearTimeout(timer);
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    fired = false;
    cancel();
    timer = window.setTimeout(() => {
      fired = true;
      openSession({ from: button });
    }, HOLD_MS);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((type) => button.addEventListener(type, cancel));
  // The click that ends a long press must not also toggle the music (capture runs first).
  document.addEventListener(
    "click",
    (event) => {
      if (fired && event.target.closest?.(".audio-toggle")) {
        fired = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
  button.addEventListener("contextmenu", (event) => {
    if (fired) event.preventDefault();
  });
}

export function init() {
  bindLongPress();
  // "Play now" in the side requests: close them, then open the session.
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-session]");
    if (!trigger) return;
    const from = document.querySelector(".help-toggle");
    const hints = trigger.closest("dialog");
    if (hints && isHintsOpen()) {
      // Open once the side requests have finished closing (their exit animation).
      hints.addEventListener("close", () => openSession({ from }), { once: true });
      closeHints();
    } else {
      openSession({ from: trigger });
    }
  });
  window.addEventListener("resize", () => {
    if (run?.view) resizeCanvas();
  });
}
