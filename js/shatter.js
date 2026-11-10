// Glass fracture engine: rapid clicks crack an element, more clicks shatter it.
// Owner: HUD/overlays workstream (C). Phase-0: original logic moved here unchanged.
import { EVT, emit, on } from "./core.js";
import { sfx } from "./sfx.js";

const FRACTURE_IDLE_RESET_MS = 1350;
const FRACTURE_CRACK_1 = 5;
const FRACTURE_CRACK_2 = 8;
const FRACTURE_CRACK_3 = 10;
const FRACTURE_BREAK = 12;

const FRACTURE_TARGETS = [
  ".content-card",
  ".menu-label",
  ".section-kicker",
  ".content-card h2",
  ".content-card > p",
  ".detail-list li",
  ".skill"
].join(", ");

function buildJaggedPath(points) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function makeCrackRay(cx, cy, angle, length, segments = 4, wobble = 7) {
  const points = [[cx, cy]];
  for (let i = 1; i <= segments; i += 1) {
    const progress = i / segments;
    const bend = (Math.random() - 0.5) * wobble;
    const distance = length * progress;
    const x = cx + Math.cos(angle) * distance + Math.sin(angle) * bend;
    const y = cy + Math.sin(angle) * distance - Math.cos(angle) * bend;
    points.push([Math.max(-8, Math.min(108, x)), Math.max(-8, Math.min(108, y))]);
  }
  return points;
}

function isLargeSurface(element) {
  return element.classList.contains("content-card") || element.classList.contains("skill") || element.matches(".detail-list li");
}

function generateCrackPaths(element) {
  const large = isLargeSurface(element);
  const cx = 34 + Math.random() * 32;
  const cy = large ? 28 + Math.random() * 38 : 38 + Math.random() * 24;
  const rayCount = large ? 9 : 6;
  const paths = [];

  for (let i = 0; i < rayCount; i += 1) {
    const angle = (-Math.PI * 0.92) + (Math.PI * 1.84 * i) / Math.max(1, rayCount - 1) + (Math.random() - 0.5) * 0.45;
    const length = (large ? 44 : 34) + Math.random() * (large ? 42 : 30);
    const ray = makeCrackRay(cx, cy, angle, length, large ? 5 : 4, large ? 9 : 6);
    paths.push([buildJaggedPath(ray), i < 3 ? "crack-main" : "crack-branch"]);

    if (i % 2 === 0) {
      const pivot = ray[2] || ray[1];
      const branchAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (0.55 + Math.random() * 0.75);
      const branch = makeCrackRay(pivot[0], pivot[1], branchAngle, length * (0.24 + Math.random() * 0.26), 3, 5);
      paths.push([buildJaggedPath(branch), "crack-hairline"]);
    }
  }

  if (large) {
    for (let i = 0; i < 5; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const startX = 12 + Math.random() * 76;
      const startY = 12 + Math.random() * 76;
      const glint = makeCrackRay(startX, startY, angle, 12 + Math.random() * 20, 2, 2.5);
      paths.push([buildJaggedPath(glint), "crack-glint"]);
    }
  } else {
    paths.push([`M ${(cx - 14).toFixed(1)} ${(cy + 4).toFixed(1)} L ${(cx + 18).toFixed(1)} ${(cy - 10).toFixed(1)}`, "crack-glint"]);
  }

  return paths;
}

function ensureCrackOverlay(element) {
  let overlay = element.querySelector(":scope > .crack-overlay");
  if (overlay) return overlay;

  const paths = generateCrackPaths(element);
  overlay = document.createElement("span");
  overlay.className = "crack-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
      ${paths.map(([d, className]) => `<path class="${className}" d="${d}" />`).join("")}
    </svg>
  `;
  element.appendChild(overlay);
  return overlay;
}

function clearCrackOverlay(element) {
  element.querySelectorAll(":scope > .crack-overlay").forEach((overlay) => overlay.remove());
}

function spawnGlassShards(element) {
  const rect = element.getBoundingClientRect();
  const large = isLargeSurface(element);
  const baseCount = large ? Math.round((rect.width + rect.height) / 18) : Math.round(rect.width / 13);
  const shardCount = Math.max(large ? 28 : 14, Math.min(large ? 58 : 32, baseCount));

  for (let i = 0; i < shardCount; i += 1) {
    const shard = document.createElement("span");
    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + Math.random() * rect.height;
    const direction = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.95;
    const distance = (large ? 110 : 70) + Math.random() * (large ? 250 : 190);
    const fall = (large ? 120 : 80) + Math.random() * 170;
    const slim = Math.random() > 0.46;

    shard.className = "glass-shard";
    shard.style.setProperty("--x", `${x}px`);
    shard.style.setProperty("--y", `${y}px`);
    shard.style.setProperty("--w", `${(slim ? 6 : 10) + Math.random() * (large ? 30 : 22)}px`);
    shard.style.setProperty("--h", `${(slim ? 5 : 8) + Math.random() * (large ? 24 : 18)}px`);
    shard.style.setProperty("--tx", `${Math.cos(direction) * distance}px`);
    shard.style.setProperty("--ty", `${Math.sin(direction) * distance + fall}px`);
    shard.style.setProperty("--rot", `${-520 + Math.random() * 1040}deg`);
    shard.style.setProperty("--rx", `${(Math.random() * 2 - 1).toFixed(2)}`);
    shard.style.setProperty("--ry", `${(Math.random() * 2 - 1).toFixed(2)}`);
    shard.style.setProperty("--p1", `${Math.round(Math.random() * 22)}% ${Math.round(Math.random() * 18)}%`);
    shard.style.setProperty("--p2", `${76 + Math.round(Math.random() * 24)}% ${Math.round(Math.random() * 36)}%`);
    shard.style.setProperty("--p3", `${58 + Math.round(Math.random() * 38)}% ${68 + Math.round(Math.random() * 32)}%`);
    shard.style.setProperty("--p4", `${Math.round(Math.random() * 32)}% ${54 + Math.round(Math.random() * 42)}%`);
    document.body.appendChild(shard);
    window.setTimeout(() => shard.remove(), 1120);
  }
}

function disableBrokenTarget(element) {
  const parentButton = element.closest(".menu-item");
  if (!parentButton) return;

  parentButton.disabled = true;
  parentButton.classList.add("is-shattered");
  parentButton.setAttribute("aria-disabled", "true");
  parentButton.setAttribute("aria-pressed", "false");
  parentButton.classList.remove("is-active");
}

function resetFractureElement(element) {
  window.clearTimeout(element._fractureResetTimer);
  element.dataset.fractureClicks = "0";
  element.dataset.fractureLast = "0";
  element.classList.remove("crack-1", "crack-2", "crack-3", "glass-broken");
  element.removeAttribute("aria-hidden");
  clearCrackOverlay(element);
}

function updateCrackState(element, clicks) {
  element.classList.remove("crack-1", "crack-2", "crack-3");

  if (clicks >= FRACTURE_CRACK_3) {
    ensureCrackOverlay(element);
    element.classList.add("crack-3");
    emit(EVT.GLASS_CRACK, { element, stage: 3 });
    return;
  }

  if (clicks >= FRACTURE_CRACK_2) {
    ensureCrackOverlay(element);
    element.classList.add("crack-2");
    emit(EVT.GLASS_CRACK, { element, stage: 2 });
    return;
  }

  if (clicks >= FRACTURE_CRACK_1) {
    ensureCrackOverlay(element);
    element.classList.add("crack-1");
    emit(EVT.GLASS_CRACK, { element, stage: 1 });
  }
}

/** Shatter an element immediately. x/y are viewport coordinates of the impact. */
export function shatter(element, { x, y } = {}) {
  if (!element || element.classList.contains("glass-broken")) return;
  const rect = element.getBoundingClientRect();
  sfx.glass();
  spawnGlassShards(element);
  element.classList.add("glass-broken");
  element.setAttribute("aria-hidden", "true");
  disableBrokenTarget(element);
  emit(EVT.GLASS_BREAK, { element, x: x ?? rect.left + rect.width / 2, y: y ?? rect.top + rect.height / 2 });
}

function handleFractureClick(event) {
  const element = event.currentTarget;
  const isMenuLabel = element.classList.contains("menu-label");

  if (!isMenuLabel) {
    event.stopPropagation();
  }

  if (element.classList.contains("glass-broken")) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const now = performance.now();
  const lastClick = Number(element.dataset.fractureLast || "0");
  const previousClicks = now - lastClick > FRACTURE_IDLE_RESET_MS ? 0 : Number(element.dataset.fractureClicks || "0");
  const currentClicks = previousClicks + 1;

  element.dataset.fractureLast = String(now);
  element.dataset.fractureClicks = String(currentClicks);

  window.clearTimeout(element._fractureResetTimer);
  element._fractureResetTimer = window.setTimeout(() => {
    if (!element.classList.contains("glass-broken")) {
      resetFractureElement(element);
    }
  }, FRACTURE_IDLE_RESET_MS + 260);

  if (currentClicks < FRACTURE_CRACK_1) {
    return;
  }

  if (isMenuLabel) {
    event.stopPropagation();
  }

  updateCrackState(element, currentClicks);

  if (currentClicks < FRACTURE_BREAK) {
    event.preventDefault();
    return;
  }

  shatter(element, { x: event.clientX, y: event.clientY });
  event.preventDefault();
  event.stopPropagation();
}

/** Make every fracturable element under `root` respond to rapid clicks. Idempotent. */
export function makeFracturable(root = document) {
  root.querySelectorAll(FRACTURE_TARGETS).forEach((element) => {
    if (element.dataset.fractureReady === "true") return;
    element.dataset.fractureReady = "true";
    element.classList.add("glass-fracture");
    element.addEventListener("click", handleFractureClick);
  });
  if (root !== document && root.matches?.(FRACTURE_TARGETS) && root.dataset.fractureReady !== "true") {
    root.dataset.fractureReady = "true";
    root.classList.add("glass-fracture");
    root.addEventListener("click", handleFractureClick);
  }
}

/** Repair everything: cracks, broken elements, disabled menu items, stray shards. */
export function resetAllFractures() {
  document.querySelectorAll(".glass-fracture").forEach(resetFractureElement);
  document.querySelectorAll(".menu-item").forEach((button) => {
    button.disabled = false;
    button.classList.remove("is-shattered");
    button.removeAttribute("aria-disabled");
  });
  document.querySelectorAll(".glass-shard").forEach((shard) => shard.remove());
}

export function init() {
  makeFracturable(document);
  on(EVT.RESET, resetAllFractures);
}
