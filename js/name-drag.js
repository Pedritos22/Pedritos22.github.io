// Nameplate: click = home (7 quick clicks = objection), hold = pick up and drag.
// Owner: HUD/overlays workstream (C). Phase-0: original logic moved here unchanged.
import { EVT, on } from "./core.js";
import { showHome } from "./sections.js";
import { showObjection } from "./objection.js";

const OBJECTION_CLICK_TARGET = 7;
const OBJECTION_CLICK_WINDOW = 2200;
const HOLD_TO_DRAG_MS = 420;

let nameButton = null;
let nameClickCount = 0;
let nameClickTimer = null;
let namePointerId = null;
let nameHoldTimer = null;
let isNameDragActive = false;
let nameDragStart = { x: 0, y: 0 };
let nameDragOffset = { x: 0, y: 0 };
let nameLastPosition = null;

function handleNameClick() {
  showHome();
  nameClickCount += 1;
  window.clearTimeout(nameClickTimer);

  if (nameClickCount >= OBJECTION_CLICK_TARGET) {
    nameClickCount = 0;
    showObjection();
    return;
  }

  nameClickTimer = window.setTimeout(() => {
    nameClickCount = 0;
  }, OBJECTION_CLICK_WINDOW);
}

function moveNameTo(clientX, clientY) {
  const x = clientX - nameDragOffset.x;
  const y = clientY - nameDragOffset.y;
  const maxX = Math.max(0, window.innerWidth - nameButton.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - nameButton.offsetHeight);
  const safeX = Math.min(Math.max(0, x), maxX);
  const safeY = Math.min(Math.max(0, y), maxY);
  const rotation = Math.max(-8, Math.min(8, (safeX / Math.max(1, window.innerWidth) - 0.5) * 12));

  nameLastPosition = { x: safeX, y: safeY, rotation };
  nameButton.style.setProperty("--drag-x", `${safeX}px`);
  nameButton.style.setProperty("--drag-y", `${safeY}px`);
  nameButton.style.setProperty("--drag-rotate", `${rotation}deg`);
}

function startNameDrag(event) {
  const rect = nameButton.getBoundingClientRect();
  nameDragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

  nameButton.classList.remove("is-hold-ready", "is-dropped");
  nameButton.classList.add("is-dragging");
  isNameDragActive = true;
  nameClickCount = 0;
  window.clearTimeout(nameClickTimer);
  moveNameTo(event.clientX, event.clientY);
}

function handleNamePointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  namePointerId = event.pointerId;
  nameDragStart = { x: event.clientX, y: event.clientY };
  isNameDragActive = false;
  nameButton.classList.add("is-hold-ready");
  nameButton.setPointerCapture?.(event.pointerId);

  window.clearTimeout(nameHoldTimer);
  nameHoldTimer = window.setTimeout(() => startNameDrag(event), HOLD_TO_DRAG_MS);
}

function handleNamePointerMove(event) {
  if (event.pointerId !== namePointerId) return;

  const moved = Math.hypot(event.clientX - nameDragStart.x, event.clientY - nameDragStart.y);
  if (!isNameDragActive && moved > 12) {
    window.clearTimeout(nameHoldTimer);
    nameButton.classList.remove("is-hold-ready");
    return;
  }

  if (isNameDragActive) {
    event.preventDefault();
    moveNameTo(event.clientX, event.clientY);
  }
}

function handleNamePointerEnd(event) {
  if (event.pointerId !== namePointerId) return;

  window.clearTimeout(nameHoldTimer);
  nameButton.classList.remove("is-hold-ready");
  nameButton.releasePointerCapture?.(event.pointerId);

  if (isNameDragActive) {
    nameButton.classList.remove("is-dragging");
    nameButton.classList.add("is-dropped");
    isNameDragActive = false;
  } else {
    handleNameClick();
  }

  namePointerId = null;
}

export function restoreNamePosition() {
  if (!nameButton) return;
  nameLastPosition = null;
  nameButton.classList.remove("is-dragging", "is-dropped", "is-hold-ready");
  nameButton.style.removeProperty("--drag-x");
  nameButton.style.removeProperty("--drag-y");
  nameButton.style.removeProperty("--drag-rotate");
}

export function init() {
  nameButton = document.querySelector(".name-button");
  if (!nameButton) return;

  nameButton.addEventListener("pointerdown", handleNamePointerDown);
  nameButton.addEventListener("pointermove", handleNamePointerMove);
  nameButton.addEventListener("pointerup", handleNamePointerEnd);
  nameButton.addEventListener("pointercancel", handleNamePointerEnd);
  nameButton.addEventListener("dblclick", restoreNamePosition);
  nameButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNameClick();
    }
    if (event.key === "Escape") {
      restoreNamePosition();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") restoreNamePosition();
  });

  window.addEventListener("resize", () => {
    if (!nameLastPosition) return;
    const x = Math.min(nameLastPosition.x, Math.max(0, window.innerWidth - nameButton.offsetWidth));
    const y = Math.min(nameLastPosition.y, Math.max(0, window.innerHeight - nameButton.offsetHeight));
    nameLastPosition = { ...nameLastPosition, x, y };
    nameButton.style.setProperty("--drag-x", `${x}px`);
    nameButton.style.setProperty("--drag-y", `${y}px`);
  });

  on(EVT.RESET, restoreNamePosition);
}
