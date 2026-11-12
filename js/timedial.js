// Time dial: grab the big moon clock and turn it. The face (moon and inner ring) turns the
// hour hand, one turn = 12 hours; the outer rings turn the days, one turn = 30 days (about a
// lunar month, so the moon walks through its phases). The world follows the dialled time:
// HUD, hands, moon phase, city windows, twilight on the water, and the Dark Hour at 00:00.
// Reset, a double click on the dial, Home, or 90 s without touching it return to now.
//
// The dial is a slider for assistive tech and keyboards: arrows = 5 min, Shift + arrows =
// 1 h, Page Up / Page Down = 1 day, End = the coming midnight, Home = now.
import {
  EVT, on, now, timeShift, isVirtualTime, setVirtualTime, prefersReducedMotion, clamp
} from "./core.js";
import { gsap, EASE } from "./motion.js";
import { sfx } from "./sfx.js";
import { turnDial, dialGeometry } from "./emblem.js";
import {
  MINUTE, HOUR, DAY, INNER_ZONE, angleDelta, dialAngle, dragShift, snapShift, clampShift, formatShift
} from "./time-math.js";

const IDLE_RETURN_MS = 90000;
const RANGE_DAYS = 60;
const TICK_GAP_MS = 45; // at most one tick sound per this many ms while turning fast
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let grip = null;
let drag = null; // { id, geo, zone, angle, start, delta, x, y }
let moveFrame = 0;
let idleTimer = 0;
let returnTween = null;
let lastTick = 0;

/* --------------------------------------------------------------- the clock */

function describe(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${hh}:${mm}`;
}

function updateAria() {
  if (!grip) return;
  const shift = timeShift();
  grip.setAttribute("aria-valuenow", String(Math.round(shift / MINUTE)));
  grip.setAttribute("aria-valuetext", `${describe(now())}${isVirtualTime() ? `, ${formatShift(shift)} from now` : ", now"}`);
}

/** A soft tick each time the dialled time crosses a quarter hour (or a day on the bezel). */
function tick(from, to, step) {
  if (Math.floor((Date.now() + from) / step) === Math.floor((Date.now() + to) / step)) return;
  const t = performance.now();
  if (t - lastTick < TICK_GAP_MS) return;
  lastTick = t;
  sfx.tick();
}

function armIdle() {
  window.clearTimeout(idleTimer);
  if (isVirtualTime()) idleTimer = window.setTimeout(() => returnToNow(), IDLE_RETURN_MS);
}

/**
 * Move the world to `shift` ms from the real clock. Transient while dragging: the Dark Hour
 * waits for the release, so scrubbing past midnight does not strobe it.
 */
function apply(shift, { transient = false, step = 15 * MINUTE } = {}) {
  const from = timeShift();
  const next = clampShift(shift, RANGE_DAYS);
  setVirtualTime(Math.abs(next) < MINUTE / 2 ? null : new Date(Date.now() + next), { transient });
  tick(from, next, step);
  updateAria();
  armIdle();
}

function stopReturn() {
  returnTween?.kill();
  returnTween = null;
}

/** Spring the world back to the real time (hands sweep home). */
export function returnToNow() {
  window.clearTimeout(idleTimer);
  stopReturn();
  const from = timeShift();
  if (!isVirtualTime()) return;
  if (prefersReducedMotion() || Math.abs(from) < MINUTE) {
    setVirtualTime(null);
    updateAria();
    return;
  }
  const proxy = { shift: from };
  const span = Math.log10(1 + Math.abs(from) / HOUR);
  returnTween = gsap.to(proxy, {
    shift: 0,
    duration: clamp(0.6 + span * 0.45, 0.6, 1.5),
    ease: EASE.snap,
    onUpdate: () => setVirtualTime(new Date(Date.now() + proxy.shift), { transient: true }),
    onComplete: () => {
      returnTween = null;
      setVirtualTime(null);
      updateAria();
    }
  });
}

/* ---------------------------------------------------------------- pointer */

function onPointerDown(event) {
  if (event.button !== 0 || drag) return;
  const geo = dialGeometry();
  if (!geo) return;
  const dx = event.clientX - geo.x;
  const dy = event.clientY - geo.y;
  const dist = Math.hypot(dx, dy) / geo.r;
  if (dist > 1) return;
  event.preventDefault();
  stopReturn();
  drag = {
    id: event.pointerId,
    geo,
    zone: dist < INNER_ZONE ? "time" : "days",
    angle: dialAngle(dx, dy),
    start: timeShift(),
    delta: 0,
    x: event.clientX,
    y: event.clientY
  };
  grip.setPointerCapture?.(event.pointerId);
  grip.classList.add("is-dragging");
  grip.dataset.zone = drag.zone;
  sfx.click();
}

function step() {
  moveFrame = 0;
  if (!drag) return;
  const dx = drag.x - drag.geo.x;
  const dy = drag.y - drag.geo.y;
  // Close to the centre the angle jumps around: ignore it there.
  if (Math.hypot(dx, dy) < drag.geo.r * 0.08) return;
  const angle = dialAngle(dx, dy);
  const deg = angleDelta(drag.angle, angle);
  drag.angle = angle;
  if (!deg) return;
  drag.delta += dragShift(deg, drag.zone);
  turnDial(drag.zone, deg);
  if (drag.zone === "days") {
    apply(drag.start + Math.round(drag.delta / DAY) * DAY, { transient: true, step: DAY });
  } else {
    apply(snapShift(drag.start + drag.delta, new Date()), { transient: true });
  }
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!moveFrame) moveFrame = requestAnimationFrame(step);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  drag = null;
  grip.classList.remove("is-dragging");
  delete grip.dataset.zone;
  // Commit: now the Dark Hour may open (or close) for the dialled time.
  apply(timeShift(), { step: Infinity });
}

/* --------------------------------------------------------------- keyboard */

function nextMidnightShift() {
  const target = now();
  target.setHours(24, 0, 0, 0);
  return timeShift() + (target.getTime() - now().getTime());
}

function onKeydown(event) {
  const shift = timeShift();
  let next = null;
  let zone = "time";
  switch (event.key) {
    case "ArrowRight":
    case "ArrowUp":
      next = shift + (event.shiftKey ? HOUR : 5 * MINUTE);
      break;
    case "ArrowLeft":
    case "ArrowDown":
      next = shift - (event.shiftKey ? HOUR : 5 * MINUTE);
      break;
    case "PageUp":
      next = shift + DAY;
      zone = "days";
      break;
    case "PageDown":
      next = shift - DAY;
      zone = "days";
      break;
    case "End":
      next = nextMidnightShift();
      break;
    case "Home":
      event.preventDefault();
      returnToNow();
      return;
    default:
      return;
  }
  event.preventDefault();
  stopReturn();
  const snapped = zone === "days" ? next : snapShift(next, new Date(), { magnet: false });
  const deg = zone === "days" ? ((snapped - shift) / DAY) * 12 : ((snapped - shift) / (12 * HOUR)) * 360;
  turnDial(zone, deg);
  apply(snapped, { step: zone === "days" ? DAY : 15 * MINUTE });
}

/* -------------------------------------------------------------------- init */

export function init() {
  const mount = document.querySelector(".emblem-mount");
  if (!mount) return;

  grip = document.createElement("div");
  grip.className = "time-grip";
  grip.tabIndex = 0;
  grip.setAttribute("role", "slider");
  grip.setAttribute("aria-label", "Time dial");
  grip.setAttribute("aria-orientation", "horizontal");
  grip.setAttribute("aria-valuemin", String(-RANGE_DAYS * 1440));
  grip.setAttribute("aria-valuemax", String(RANGE_DAYS * 1440));
  const help = document.createElement("span");
  help.id = "time-dial-help";
  help.className = "visually-hidden";
  help.textContent =
    "Turn the clock to move the whole page to another time. Arrow keys: 5 minutes. Shift and arrow keys: 1 hour. Page Up and Page Down: 1 day. End: midnight. Home: back to now.";
  grip.setAttribute("aria-describedby", help.id);
  mount.append(grip, help);
  updateAria();

  grip.addEventListener("pointerdown", onPointerDown);
  grip.addEventListener("pointermove", onPointerMove);
  grip.addEventListener("pointerup", onPointerUp);
  grip.addEventListener("pointercancel", onPointerUp);
  grip.addEventListener("lostpointercapture", onPointerUp);
  grip.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (isVirtualTime()) sfx.back();
    returnToNow();
  });
  grip.addEventListener("keydown", onKeydown);

  // The reset button rewinds everything, the clock included.
  on(EVT.RESET, () => returnToNow());
  // Keep the spoken value current as real minutes pass.
  window.setInterval(updateAria, 60000);
}
