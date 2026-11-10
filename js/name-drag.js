// Nameplate: click = home (7 quick clicks = objection), hold = pick up and drag.
// The name moves with individual transform properties (translate / rotate / scale)
// relative to its home slot, so the layout never collapses and the menu never jumps.
// Owner: HUD/overlays workstream (C).
import { EVT, on, prefersReducedMotion, rafLoop, clamp, lerp } from "./core.js";
import { gsap, EASE } from "./motion.js";
import { showHome } from "./sections.js";
import { showObjection } from "./objection.js";
import { isHintsOpen } from "./hints.js";
import { sfx } from "./sfx.js";

const OBJECTION_CLICK_TARGET = 7;
const OBJECTION_CLICK_WINDOW = 2200;
const HOLD_TO_DRAG_MS = 420;
const MOVE_CANCEL_PX = 12;
const LIFT_SCALE = 1.04;
const REST_ANGLES = [-4, 2]; // half the major and minor tilts (DESIGN.md)

const html = document.documentElement;

let btn = null;
let meter = null;
let clickCount = 0;
let clickTimer = 0;

let pointerId = null;
let holdTimer = 0;
let start = { x: 0, y: 0 };
let dragging = false;
let lifted = false;

// Current pose (applied to the button) and drag targets.
const pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
const lift = { sx: 1, sy: 1 };
let home = { x: 0, y: 0 }; // untransformed centre of the button, viewport coordinates
let grab = { x: 0, y: 0 }; // pointer offset from the visual centre
let target = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
let last = { x: 0, y: 0 };
let stopLoop = null;
let poseTween = null;
let squashing = false; // anticipation squash running while the pointer is held

function applyPose() {
  btn.style.translate = `${pose.x.toFixed(2)}px ${pose.y.toFixed(2)}px`;
  btn.style.rotate = `${pose.r.toFixed(3)}deg`;
  btn.style.scale = `${pose.sx.toFixed(4)} ${pose.sy.toFixed(4)}`;
}

function clearPose() {
  Object.assign(pose, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
  btn.style.removeProperty("translate");
  btn.style.removeProperty("rotate");
  btn.style.removeProperty("scale");
}

function tweenPose(vars) {
  poseTween?.kill();
  poseTween = gsap.to(pose, { ...vars, onUpdate: applyPose, overwrite: true });
  return poseTween;
}

/* ------------------------------------------------------------------ clicks */

function handleNameClick() {
  // A name that was picked up and dropped elsewhere is a toy, not a link home.
  if (!lifted) showHome();
  clickCount += 1;
  window.clearTimeout(clickTimer);

  if (clickCount >= OBJECTION_CLICK_TARGET) {
    clickCount = 0;
    showObjection();
    return;
  }

  clickTimer = window.setTimeout(() => {
    clickCount = 0;
  }, OBJECTION_CLICK_WINDOW);
}

/* ------------------------------------------------------------ hold meter */

function showMeter() {
  if (!meter) return;
  const rect = btn.getBoundingClientRect();
  meter.style.left = `${Math.round(rect.left)}px`;
  meter.style.top = `${Math.round(rect.bottom + 6)}px`;
  meter.style.width = `${Math.round(Math.min(rect.width, 420))}px`;
  gsap.killTweensOf(meter);
  gsap.set(meter, { autoAlpha: 1 });
  if (prefersReducedMotion()) return;
  gsap.fromTo(meter, { scaleX: 0 }, { scaleX: 1, duration: HOLD_TO_DRAG_MS / 1000, ease: "none" });
}

function hideMeter(immediate = false) {
  if (!meter) return;
  gsap.killTweensOf(meter);
  if (immediate || prefersReducedMotion()) gsap.set(meter, { autoAlpha: 0 });
  else gsap.to(meter, { autoAlpha: 0, duration: 0.14, ease: "none" });
}

/* -------------------------------------------------------------------- drag */

function frame(dt) {
  if (!dragging) return;
  const k = 1 - Math.exp(-dt * 16);
  const instX = (target.x - last.x) / Math.max(dt, 1 / 240);
  const instY = (target.y - last.y) / Math.max(dt, 1 / 240);
  last = { ...target };
  velocity.x = lerp(velocity.x, instX, 1 - Math.exp(-dt * 10));
  velocity.y = lerp(velocity.y, instY, 1 - Math.exp(-dt * 10));

  pose.x = target.x;
  pose.y = target.y;
  if (prefersReducedMotion()) {
    pose.r = 0;
    pose.sx = 1;
    pose.sy = 1;
  } else {
    // Tilt into the motion, stretch along it.
    const speed = Math.hypot(velocity.x, velocity.y);
    const stretch = clamp(speed / 5200, 0, 0.06);
    pose.r = lerp(pose.r, clamp(velocity.x * 0.0085, -11, 11), k);
    pose.sx = lerp(pose.sx, lift.sx + stretch, k);
    pose.sy = lerp(pose.sy, lift.sy - stretch * 0.7, k);
  }
  applyPose();
}

function setTarget(clientX, clientY) {
  const w = btn.offsetWidth * LIFT_SCALE;
  const h = btn.offsetHeight * LIFT_SCALE;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Keep the whole name on screen (or centred when it is wider than the screen).
  const cx = w >= vw ? vw / 2 : clamp(clientX - grab.x, w / 2, vw - w / 2);
  const cy = h >= vh ? vh / 2 : clamp(clientY - grab.y, h / 2, vh - h / 2);
  target = { x: cx - home.x, y: cy - home.y };
}

function startDrag(clientX, clientY) {
  squashing = false;
  hideMeter();
  poseTween?.kill();
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  home = { x: cx - pose.x, y: cy - pose.y };
  grab = { x: clientX - cx, y: clientY - cy };
  target = { x: pose.x, y: pose.y };
  last = { ...target };
  velocity = { x: 0, y: 0 };

  dragging = true;
  lifted = true;
  clickCount = 0;
  window.clearTimeout(clickTimer);
  html.classList.add("name-lifted");
  btn.classList.remove("is-hold-ready", "is-dropped");
  btn.classList.add("is-lifted", "is-dragging");
  sfx.click();

  if (prefersReducedMotion()) {
    Object.assign(lift, { sx: 1, sy: 1 });
  } else {
    // Stretch up as it leaves the page, then settle into the lifted scale.
    gsap.killTweensOf(lift);
    gsap.fromTo(lift, { sx: 0.93, sy: 1.12 }, { sx: LIFT_SCALE, sy: LIFT_SCALE, duration: 0.5, ease: EASE.elastic });
    pose.sx = 0.93;
    pose.sy = 1.12;
  }
  setTarget(clientX, clientY);
  stopLoop?.();
  stopLoop = rafLoop(frame);
}

function drop() {
  dragging = false;
  stopLoop?.();
  stopLoop = null;
  gsap.killTweensOf(lift);
  btn.classList.remove("is-dragging");
  btn.classList.add("is-dropped");

  // Settle on a whole pixel and a design angle, in the direction it was thrown.
  const restR = velocity.x > 120 ? REST_ANGLES[1] : velocity.x < -120 ? REST_ANGLES[0] : pose.r >= 0.5 ? REST_ANGLES[1] : REST_ANGLES[0];
  const rest = { x: Math.round(target.x), y: Math.round(target.y), r: restR, sx: 1, sy: 1 };
  const lower = () => html.classList.remove("name-lifted");

  if (prefersReducedMotion()) {
    Object.assign(pose, rest);
    applyPose();
    lower();
    return;
  }
  poseTween?.kill();
  const tl = gsap.timeline({ onUpdate: applyPose, onComplete: lower });
  poseTween = tl;
  tl.to(pose, { x: rest.x, y: rest.y, sx: 1.07, sy: 0.9, r: lerp(pose.r, rest.r, 0.5), duration: 0.08, ease: "power2.out" });
  tl.to(pose, { sx: 1, sy: 1, r: rest.r, duration: 0.7, ease: EASE.elastic });
}

/** Animate the name back into its slot (FLIP: from wherever it is now to 0, 0). */
export function restoreNamePosition() {
  if (!btn) return;
  const wasSquashing = squashing;
  squashing = false;
  window.clearTimeout(holdTimer);
  holdTimer = 0;
  btn.classList.remove("is-hold-ready");
  if (wasSquashing && !lifted) {
    poseTween?.kill();
    clearPose();
  }
  hideMeter(true);
  if (dragging) {
    dragging = false;
    stopLoop?.();
    stopLoop = null;
  }
  if (!lifted) return;
  lifted = false;
  gsap.killTweensOf(lift);
  btn.classList.remove("is-dragging", "is-hold-ready");
  html.classList.add("name-lifted");

  const done = () => {
    clearPose();
    btn.classList.remove("is-lifted", "is-dropped");
    html.classList.remove("name-lifted");
  };

  if (prefersReducedMotion()) {
    poseTween?.kill();
    gsap.timeline({ onComplete: done })
      .to(btn, { opacity: 0, duration: 0.1, ease: "none" })
      .call(() => clearPose())
      .to(btn, { opacity: 1, duration: 0.12, ease: "none", clearProps: "opacity" });
    return;
  }

  poseTween?.kill();
  const tl = gsap.timeline({ onUpdate: applyPose, onComplete: done });
  poseTween = tl;
  // Lift a little, fly home along the major diagonal, land with a small squash.
  tl.to(pose, { sx: 1.06, sy: 1.06, duration: 0.12, ease: "power2.out" }, 0);
  tl.to(pose, { x: 0, duration: 0.56, ease: EASE.snap }, 0);
  tl.to(pose, { y: 0, duration: 0.56, ease: "power3.inOut" }, 0);
  tl.to(pose, { r: 0, duration: 0.5, ease: EASE.out }, 0.06);
  tl.to(pose, { sx: 1.05, sy: 0.93, duration: 0.07, ease: "power2.out" }, 0.52);
  tl.to(pose, { sx: 1, sy: 1, duration: 0.4, ease: EASE.elastic }, 0.59);
}

/* ---------------------------------------------------------------- pointer */

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  pointerId = event.pointerId;
  start = { x: event.clientX, y: event.clientY };
  btn.setPointerCapture?.(event.pointerId);

  if (dragging) return;
  btn.classList.add("is-hold-ready");
  window.clearTimeout(holdTimer);
  const { clientX, clientY } = event;
  holdTimer = window.setTimeout(() => startDrag(clientX, clientY), HOLD_TO_DRAG_MS);
  showMeter();

  // Anticipation: the name squashes slightly while you hold it.
  if (!prefersReducedMotion() && !lifted) {
    squashing = true;
    tweenPose({ sx: 1.025, sy: 0.965, duration: HOLD_TO_DRAG_MS / 1000, ease: "power1.in" });
  }
}

function cancelHold() {
  window.clearTimeout(holdTimer);
  holdTimer = 0;
  hideMeter();
  btn.classList.remove("is-hold-ready");
  if (squashing) {
    squashing = false;
    if (!lifted) tweenPose({ sx: 1, sy: 1, duration: 0.3, ease: EASE.elastic, onComplete: () => !lifted && clearPose() });
  }
}

function onPointerMove(event) {
  if (event.pointerId !== pointerId) return;
  if (dragging) {
    event.preventDefault();
    setTarget(event.clientX, event.clientY);
    return;
  }
  if (holdTimer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_CANCEL_PX) cancelHold();
}

function onPointerEnd(event) {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  btn.releasePointerCapture?.(event.pointerId);
  const wasHolding = Boolean(holdTimer);
  window.clearTimeout(holdTimer);
  holdTimer = 0;

  if (dragging) {
    drop();
    return;
  }
  cancelHold();
  if (event.type === "pointerup" && (wasHolding || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= MOVE_CANCEL_PX)) {
    handleNameClick();
  }
}

function keepOnScreen() {
  if (!lifted || dragging) return;
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let dx = 0;
  let dy = 0;
  if (rect.width < vw) {
    if (rect.left < 0) dx = -rect.left;
    else if (rect.right > vw) dx = vw - rect.right;
  }
  if (rect.height < vh) {
    if (rect.top < 0) dy = -rect.top;
    else if (rect.bottom > vh) dy = vh - rect.bottom;
  }
  if (!dx && !dy) return;
  pose.x = Math.round(pose.x + dx);
  pose.y = Math.round(pose.y + dy);
  applyPose();
}

export function init() {
  btn = document.querySelector(".name-button");
  if (!btn) return;

  meter = document.createElement("span");
  meter.className = "name-hold-meter";
  meter.setAttribute("aria-hidden", "true");
  document.body.appendChild(meter);

  btn.addEventListener("pointerdown", onPointerDown);
  btn.addEventListener("pointermove", onPointerMove);
  btn.addEventListener("pointerup", onPointerEnd);
  btn.addEventListener("pointercancel", onPointerEnd);
  btn.addEventListener("lostpointercapture", (event) => {
    if (pointerId !== null) onPointerEnd({ ...event, pointerId: event.pointerId, type: "pointercancel" });
  });
  btn.addEventListener("dblclick", restoreNamePosition);
  btn.addEventListener("contextmenu", (event) => {
    if (dragging || holdTimer) event.preventDefault();
  });
  btn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) handleNameClick();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || isHintsOpen() || document.querySelector("dialog[open]")) return;
    restoreNamePosition();
  });

  window.addEventListener("resize", keepOnScreen);
  on(EVT.RESET, restoreNamePosition);
}
