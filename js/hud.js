// HUD: in-game calendar (date, weekday, time of day, live clock, moon phase) and the
// tool cluster (lo-fi + EQ, hints, reset, volume, SFX mute).
// Owner: HUD/overlays workstream (C). Audio logic lives behind the lofi/sfx APIs (D).
import { EVT, emit, on, state, params, afterIntro, moonPhase, prefersReducedMotion, onReducedMotionChange, isMobileLayout, rafLoop, clamp } from "./core.js";
import { gsap, DUR, EASE, STAGGER } from "./motion.js";
import { sfx } from "./sfx.js";
import { lofi } from "./lofi.js";
import { openHints } from "./hints.js";
import { knock } from "./darkhour.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let hud = null;
let els = {};
let minuteTimer = 0;

/* ------------------------------------------------------------------ clock */

/** QA overrides: ?hudtime=HH:MM and ?moon=0..1 (phase). */
function now() {
  const date = new Date();
  const forced = params.get("hudtime");
  if (forced && /^\d{1,2}:\d{2}$/.test(forced)) {
    const [h, m] = forced.split(":").map(Number);
    date.setHours(clamp(h, 0, 23), clamp(m, 0, 59));
  }
  return date;
}

/** Time-of-day label for the HUD. */
export function timeOfDay(date = new Date(), darkhour = state.darkhour) {
  const h = date.getHours();
  if (darkhour) return "Dark Hour";
  if (h < 5) return "Late Night";
  if (h < 7) return "Early Morning";
  if (h < 11) return "Morning";
  if (h < 13) return "Lunchtime";
  if (h < 15) return "Afternoon";
  if (h < 18) return "After School";
  if (h < 21) return "Evening";
  return "Late Night";
}

function moonCaption(moon) {
  if (moon.index === 0) return ["New Moon", ""];
  const days = Math.round(moon.daysToFull);
  if (moon.index === 4 && (days < 1 || days > 28)) return ["Full Moon", "tonight"];
  if (days < 1) return ["Full Moon", "tonight"];
  return ["Full Moon", `in ${days} ${days === 1 ? "day" : "days"}`];
}

/** SVG path of the lit part of a moon disc of radius r (real terminator). */
function litPath(phase, r) {
  const k = Math.cos(2 * Math.PI * phase); // 1 = new, -1 = full
  const rx = Math.abs(k) * r;
  const gibbous = k < 0;
  const f = (v) => v.toFixed(2);
  if (phase < 0.5) {
    // Waxing: the right limb is lit (northern hemisphere view).
    return `M0 ${f(-r)} A${f(r)} ${f(r)} 0 0 1 0 ${f(r)} A${f(rx)} ${f(r)} 0 0 ${gibbous ? 1 : 0} 0 ${f(-r)} Z`;
  }
  return `M0 ${f(-r)} A${f(r)} ${f(r)} 0 0 0 0 ${f(r)} A${f(rx)} ${f(r)} 0 0 ${gibbous ? 0 : 1} 0 ${f(-r)} Z`;
}

function renderMoon(date) {
  const moon = moonPhase(date);
  const forced = params.get("moon");
  if (forced !== null && forced !== "" && Number.isFinite(Number(forced))) {
    const phase = ((Number(forced) % 1) + 1) % 1;
    const age = phase * 29.530588853;
    Object.assign(moon, {
      phase,
      index: Math.floor(phase * 8 + 0.5) % 8,
      daysToFull: ((0.5 - phase + 1) % 1) * 29.530588853,
      name: ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"][Math.floor(phase * 8 + 0.5) % 8],
      age
    });
  }
  const r = 17;
  const lit = litPath(moon.phase, r);
  els.moonIcon.innerHTML = `
    <defs>
      <clipPath id="hud-moon-lit"><path d="${lit}" /></clipPath>
      <radialGradient id="hud-moon-shade" cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" class="moon-shade-hi" />
        <stop offset="1" class="moon-shade-lo" />
      </radialGradient>
    </defs>
    <circle class="moon-halo" r="25" />
    <circle class="moon-disc" r="${r}" />
    <path class="moon-lit" d="${lit}" />
    <g class="moon-maria" clip-path="url(#hud-moon-lit)">
      <circle cx="-5" cy="-6" r="5.2" /><circle cx="6" cy="-2" r="3.6" /><circle cx="-1" cy="7" r="4.4" /><circle cx="8" cy="8" r="2.2" /><circle cx="-9" cy="4" r="2" />
    </g>
    <circle class="moon-rim" r="${r}" />`;
  const [top, bottom] = moonCaption(moon);
  els.moonTop.textContent = top;
  els.moonBottom.textContent = bottom;
  els.moonCaption.classList.toggle("is-single", !bottom);
  els.moon.setAttribute("aria-label", `Moon phase: ${moon.name}. ${top}${bottom ? ` ${bottom}` : ""}.`);
}

function renderCalendar() {
  const date = now();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const tod = timeOfDay(date);
  els.month.textContent = String(date.getMonth() + 1);
  els.day.textContent = String(date.getDate());
  els.weekday.textContent = WEEKDAYS[date.getDay()];
  els.weekdayPlate.dataset.day = String(date.getDay());
  els.hh.textContent = hh;
  els.mm.textContent = mm;
  if (els.tod.textContent !== tod) els.tod.textContent = tod;
  hud.classList.toggle("is-darkhour", state.darkhour);
  els.calendar.setAttribute(
    "aria-label",
    `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}, ${hh}:${mm}, ${tod}`
  );
  renderMoon(date);
}

/** Re-render exactly on the minute boundary. */
function scheduleMinute() {
  window.clearTimeout(minuteTimer);
  const ms = 60000 - (Date.now() % 60000) + 30;
  minuteTimer = window.setTimeout(() => {
    renderCalendar();
    tickFlash();
    scheduleMinute();
  }, ms);
}

function tickFlash() {
  if (prefersReducedMotion() || !state.introDone) return;
  gsap.fromTo(els.time, { y: -3, opacity: 0.4 }, { y: 0, opacity: 1, duration: DUR.ui, ease: EASE.out, clearProps: "transform,opacity" });
}

/* ------------------------------------------------------------------ tools */

const EQ_REST = [0.4, 0.9, 0.6, 1, 0.45]; // mirrors the CSS resting glyph
let eqStop = null;
let eqData = null;

function eqFrame(_dt, time) {
  const bars = els.eqBars;
  const analyser = lofi.getAnalyser?.();
  if (analyser) {
    if (!eqData || eqData.length !== analyser.frequencyBinCount) eqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(eqData);
    const n = eqData.length;
    bars.forEach((bar, i) => {
      // Log-spaced bands from ~60 Hz up.
      const lo = Math.floor(Math.pow(n, i / bars.length) * 0.9);
      const hi = Math.max(lo + 1, Math.floor(Math.pow(n, (i + 1) / bars.length) * 0.9));
      let peak = 0;
      for (let j = lo; j < hi && j < n; j += 1) peak = Math.max(peak, eqData[j]);
      const v = clamp(peak / 235, 0.14, 1);
      bar.style.transform = `scaleY(${v.toFixed(3)})`;
    });
    return;
  }
  // No analyser yet: a gentle procedural dance while playing.
  bars.forEach((bar, i) => {
    const v = 0.42 + 0.26 * Math.sin(time * (2.1 + i * 0.37) + i * 1.7) + 0.16 * Math.sin(time * (3.3 - i * 0.21) + i);
    bar.style.transform = `scaleY(${clamp(v, 0.14, 1).toFixed(3)})`;
  });
}

function setEq(playing) {
  eqStop?.();
  eqStop = null;
  if (playing && !prefersReducedMotion()) {
    eqStop = rafLoop(eqFrame);
    return;
  }
  const rest = playing ? [0.55, 1, 0.7, 0.85, 0.5] : EQ_REST;
  els.eqBars.forEach((bar, i) => {
    if (prefersReducedMotion()) bar.style.transform = `scaleY(${rest[i]})`;
    else gsap.to(bar, { scaleY: rest[i], duration: DUR.ui, ease: EASE.out, overwrite: true });
  });
}

function syncLofi(playing) {
  els.audio.classList.toggle("is-on", playing);
  els.audio.setAttribute("aria-pressed", String(playing));
  setEq(playing);
}

function syncVolume() {
  const v = Number(els.volume.value);
  els.volume.style.setProperty("--vol", `${v}%`);
  els.volume.setAttribute("aria-valuetext", `${v}%`);
}

function syncMute() {
  const muted = Boolean(sfx.isMuted?.());
  els.sfx.classList.toggle("is-muted", muted);
  els.sfx.setAttribute("aria-pressed", String(muted));
}

function spinReset() {
  if (prefersReducedMotion()) return;
  const icon = els.reset.querySelector(".reset-icon");
  gsap.killTweensOf(icon);
  gsap.fromTo(icon, { rotation: 0 }, { rotation: -360, duration: 0.62, ease: EASE.snap, transformOrigin: "50% 50%", clearProps: "transform" });
  gsap.fromTo(els.reset, { "--flash": 1 }, { "--flash": 0, duration: 0.5, ease: "power2.out" });
}

/* --------------------------------------------------------------- tooltip */

let tip = null;
let tipTimer = 0;

function showTip(target) {
  const text = target.dataset.tip;
  if (!text || !tip || isMobileLayout()) return;
  window.clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => {
    const label = target.classList.contains("hud-volume") ? `${text} ${els.volume.value}%` : text;
    tip.textContent = label;
    // Below the whole HUD, centred on the control, so it never covers the other row.
    const rect = target.getBoundingClientRect();
    const hudRect = hud.getBoundingClientRect();
    tip.style.left = `${Math.round(rect.left - hudRect.left + rect.width / 2)}px`;
    tip.style.top = `${Math.round(hudRect.height + 12)}px`;
    tip.classList.add("is-visible");
  }, 90);
}

function hideTip() {
  window.clearTimeout(tipTimer);
  tip?.classList.remove("is-visible");
}

/* --------------------------------------------------------------- entrance */

function entranceTargets() {
  return {
    plates: hud.querySelectorAll(".hud-plate-back, .hud-plate-front"),
    accents: hud.querySelectorAll(".hud-plate-line, .hud-plate-notch"),
    date: hud.querySelector(".hud-date-inner"),
    weekday: els.weekdayPlate,
    tod: hud.querySelector(".hud-tod"),
    time: els.time,
    moon: els.moonIcon,
    caption: els.moonCaption,
    tools: hud.querySelectorAll(".hud-tool, .hud-volume")
  };
}

function prepareEntrance() {
  if (prefersReducedMotion()) {
    gsap.set(hud, { autoAlpha: 0 });
    return;
  }
  const t = entranceTargets();
  gsap.set(t.plates, { xPercent: 115 });
  gsap.set(t.accents, { xPercent: 140 });
  gsap.set(t.date, { yPercent: 105 });
  gsap.set(t.weekday, { autoAlpha: 0, scale: 0.6, rotation: -8 });
  gsap.set(t.tod, { xPercent: 60, autoAlpha: 0 });
  gsap.set([t.time, t.caption], { autoAlpha: 0, y: 6 });
  gsap.set(t.moon, { autoAlpha: 0, scale: 0.4, rotation: -90 });
  gsap.set(t.tools, { autoAlpha: 0, x: 18 });
}

function playEntrance() {
  if (prefersReducedMotion()) {
    gsap.to(hud, { autoAlpha: 1, duration: 0.2, ease: "none", clearProps: "opacity,visibility" });
    return;
  }
  const t = entranceTargets();
  const tl = gsap.timeline({ defaults: { ease: EASE.out }, onComplete: startIdle });
  tl.to(t.plates, { xPercent: 0, duration: DUR.panel, ease: EASE.snap, stagger: 0.05 }, 0);
  tl.to(t.accents, { xPercent: 0, duration: DUR.panel, ease: EASE.snap, stagger: 0.04 }, 0.08);
  tl.to(t.date, { yPercent: 0, duration: DUR.panel }, 0.16);
  tl.to(t.weekday, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.36, ease: EASE.spring }, 0.26);
  tl.to(t.tod, { xPercent: 0, autoAlpha: 1, duration: DUR.panel }, 0.22);
  tl.to([t.time, t.caption], { autoAlpha: 1, y: 0, duration: DUR.ui, stagger: STAGGER }, 0.32);
  tl.to(t.moon, { autoAlpha: 1, scale: 1, rotation: 0, duration: DUR.scene }, 0.18);
  tl.to(t.tools, { autoAlpha: 1, x: 0, duration: DUR.ui, stagger: STAGGER }, 0.3);
  tl.set([t.plates, t.accents, t.date, t.weekday, t.tod, t.time, t.caption, t.moon, t.tools], { clearProps: "all" });
}

function startIdle() {
  hud.classList.add("is-idle");
}

/* -------------------------------------------------------------------- init */

export function init() {
  hud = document.querySelector(".hud");
  if (!hud) return;

  const q = (sel) => hud.querySelector(sel);
  els = {
    calendar: q(".hud-calendar"),
    month: q(".hud-month"),
    day: q(".hud-day"),
    weekday: q(".hud-weekday-text"),
    weekdayPlate: q(".hud-weekday"),
    tod: q(".hud-tod-text"),
    time: q(".hud-time"),
    hh: q(".hud-hh"),
    mm: q(".hud-mm"),
    moon: q(".hud-moon"),
    moonIcon: q(".hud-moon-icon"),
    moonCaption: q(".hud-moon-caption"),
    moonTop: q(".hud-moon-top"),
    moonBottom: q(".hud-moon-bottom"),
    help: q(".help-toggle"),
    reset: q(".reset-toggle"),
    audio: q(".audio-toggle"),
    volume: q(".volume-slider"),
    sfx: q(".sfx-toggle"),
    eqBars: [...hud.querySelectorAll(".hud-eq i")]
  };

  renderCalendar();
  scheduleMinute();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    renderCalendar();
    scheduleMinute();
  });
  on(EVT.DARKHOUR, renderCalendar);

  // Knocking on the clock: three knocks open the hidden hour.
  els.calendar.addEventListener("click", () => {
    const flipped = knock();
    if (!flipped) sfx.tick();
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      els.calendar,
      { x: flipped ? -4 : -2, rotation: flipped ? -1.5 : -0.6 },
      { x: 0, rotation: 0, duration: flipped ? 0.5 : 0.26, ease: EASE.elastic, clearProps: "transform" }
    );
  });

  // Tools.
  els.help?.addEventListener("click", () => openHints(els.help));

  els.reset?.addEventListener("click", () => {
    sfx.back();
    spinReset();
    emit(EVT.RESET, {});
  });

  if (els.volume) {
    els.volume.value = String(Math.round(clamp(Number(lofi.getVolume()) || 0, 0, 1) * 100));
    syncVolume();
    els.volume.addEventListener("input", () => {
      syncVolume();
      lofi.setVolume(Number(els.volume.value) / 100);
      if (tip?.classList.contains("is-visible")) tip.textContent = `Volume ${els.volume.value}%`;
    });
  }

  els.audio?.addEventListener("click", () => {
    sfx.click();
    if (els.volume) lofi.setVolume(Number(els.volume.value) / 100);
    lofi.toggle();
  });

  els.sfx?.addEventListener("click", () => {
    const muted = !sfx.isMuted();
    sfx.setMuted(muted);
    syncMute();
    if (!muted) sfx.click();
  });

  on(EVT.LOFI, ({ playing }) => syncLofi(Boolean(playing)));
  syncLofi(Boolean(lofi.isPlaying?.()));
  syncMute();
  onReducedMotionChange(() => syncLofi(Boolean(lofi.isPlaying?.())));

  // Shared tooltip for the tool buttons (desktop only).
  tip = document.createElement("span");
  tip.className = "hud-tip";
  tip.setAttribute("aria-hidden", "true");
  hud.appendChild(tip);
  hud.querySelectorAll("[data-tip]").forEach((target) => {
    target.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") showTip(target);
    });
    target.addEventListener("pointerleave", hideTip);
    target.addEventListener("focusin", () => {
      if (target.matches(":focus-visible") || target.querySelector(":focus-visible")) showTip(target);
    });
    target.addEventListener("focusout", hideTip);
    target.addEventListener("pointerdown", hideTip);
  });

  prepareEntrance();
  afterIntro(playEntrance);

  // Links inside cards stop propagation (glass engine), so listen in the capture phase.
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest?.(".action-link")) sfx.click();
    },
    true
  );
}
