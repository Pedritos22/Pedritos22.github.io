// Atmosphere workstream (A): procedural butterflies.
// Every 8-20 s one or two drift across along a curl-noise flow, steering around the card,
// menu, nameplate and HUD. Wings flap in 3D on the compositor (CSS keyframes); the flight
// path is integrated in a rafLoop that writes one transform per butterfly per frame.
// Easter egg: click one and it bursts into sparkles. None with reduced motion or ?nofx.
import {
  EVT, on, state, flags, params, afterIntro, daySeed, prefersReducedMotion, onReducedMotionChange,
  isMobileLayout, rafLoop, clamp
} from "./core.js";
import { gsap, DUR, EASE } from "./motion.js";
import { sfx } from "./sfx.js";
import { createNoise } from "./proc/noise.js";
import { butterflySpecies } from "./fx/butterfly-art.js";
import { damp } from "./fx/pointer.js";

const SPECIES = 3;
const MAX_ALIVE = 3;
const AVOID_MARGIN = 40;

let layer = null;
let noise = null;
let species = [];
let flock = [];
let stopLoop = null;
let enabled = false;
let paused = false;
let resumeCall = null;
let spawnIn = 0;
let time = 0;
let obstacles = [];
let obstacleClock = 0;
let uid = 0;

/* --------------------------------------------------------------- obstacles */

function measureObstacles() {
  const selectors = isMobileLayout()
    ? [".nameplate", ".menu", ".top-tools", ".hud", ".mobile-section-stack .content-card"]
    : [".nameplate", ".menu", ".top-tools", ".hud", ".panel-wrap > .content-card", ".meta-bar"];
  const vh = window.innerHeight;
  obstacles = [];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < -40 || r.top > vh + 40) return;
      obstacles.push({
        l: r.left - AVOID_MARGIN,
        t: r.top - AVOID_MARGIN,
        r: r.right + AVOID_MARGIN,
        b: r.bottom + AVOID_MARGIN,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2
      });
    });
  });
}

/** Push out of every obstacle rectangle (strongest deep inside, zero at the margin). */
function avoidance(x, y) {
  let fx = 0;
  let fy = 0;
  obstacles.forEach((o) => {
    if (x < o.l || x > o.r || y < o.t || y > o.b) return;
    // Exit through the nearest edge.
    const dl = x - o.l;
    const dr = o.r - x;
    const dt = y - o.t;
    const db = o.b - y;
    const m = Math.min(dl, dr, dt, db);
    const depth = clamp(m / AVOID_MARGIN, 0, 3);
    const push = 70 + 90 * depth;
    if (m === dl) fx -= push;
    else if (m === dr) fx += push;
    else if (m === dt) fy -= push;
    else fy += push;
  });
  return [fx, fy];
}

/* ------------------------------------------------------------------- spawn */

function makeButterfly(x, y, dirX, dirY) {
  const kind = species[Math.floor(Math.random() * species.length)];
  const el = document.createElement("div");
  el.className = "bfly";
  const scale = (isMobileLayout() ? 0.78 : 1) * (0.82 + Math.random() * 0.36);
  const flap = 0.26 + Math.random() * 0.12;
  el.style.setProperty("--bfly-scale", scale.toFixed(3));
  el.style.setProperty("--bfly-flap", `${flap.toFixed(3)}s`);
  el.innerHTML = `
    <div class="bfly__tilt">
      <div class="bfly__wing bfly__wing--l"><div class="bfly__mirror">${kind.wing}</div></div>
      <div class="bfly__wing bfly__wing--r">${kind.wing}</div>
      <div class="bfly__body">${kind.body}</div>
    </div>
    <div class="bfly__hit"></div>`;
  layer.append(el);

  const b = {
    id: (uid += 1),
    el,
    x,
    y,
    vx: dirX * 50,
    vy: dirY * 30,
    dirX,
    dirY,
    heading: Math.atan2(dirY, dirX),
    age: 0,
    life: 16 + Math.random() * 10,
    seed: Math.random() * 100,
    speed: 34 + Math.random() * 22,
    alpha: 0,
    dying: false
  };
  el.querySelector(".bfly__hit").addEventListener("click", (event) => {
    event.stopPropagation();
    burst(b);
  });
  flock.push(b);
  place(b);
  return b;
}

function spawnGroup() {
  if (!enabled || paused || document.hidden) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const count = Math.random() < 0.4 ? 2 : 1;
  if (flock.length + count > MAX_ALIVE) return;
  const fromSide = Math.random() < 0.6;
  let x;
  let y;
  let dirX;
  let dirY;
  if (fromSide) {
    dirX = Math.random() < 0.5 ? 1 : -1;
    x = dirX > 0 ? -40 : vw + 40;
    y = vh * (0.14 + Math.random() * 0.56);
    dirY = -0.1;
  } else {
    // Rising out of the city toward the moon.
    x = vw * (0.2 + Math.random() * 0.6);
    y = vh + 30;
    dirX = Math.random() < 0.5 ? 0.8 : -0.8;
    dirY = -0.9;
  }
  for (let i = 0; i < count; i += 1) {
    const jitter = i * (30 + Math.random() * 30);
    makeButterfly(x - dirX * jitter, y + jitter * 0.4, dirX, dirY);
  }
}

/* ------------------------------------------------------------------ flight */

function place(b) {
  const bob = Math.sin((time + b.seed) * 5.2) * 3;
  const rot = (b.heading * 180) / Math.PI + 90;
  b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${(b.y + bob).toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
  b.el.style.opacity = b.alpha.toFixed(3);
}

function remove(b) {
  b.el.remove();
  flock = flock.filter((item) => item !== b);
}

function step(b, dt) {
  b.age += dt;
  const s = 0.0024;
  const [cx, cy] = noise.curl2(b.x * s, b.y * s, time * 0.06 + b.seed);
  const [ax, ay] = avoidance(b.x, b.y);
  const tx = b.dirX * b.speed + cx * 46 + ax;
  const ty = b.dirY * b.speed * 0.4 + cy * 38 + ay;
  b.vx += (tx - b.vx) * damp(1.4, dt);
  b.vy += (ty - b.vy) * damp(1.4, dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Turn smoothly toward the direction of travel (shortest way round).
  const target = Math.atan2(b.vy, b.vx);
  let delta = target - b.heading;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  b.heading += delta * damp(3, dt);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const outside = b.x < -90 || b.x > vw + 90 || b.y < -90 || b.y > vh + 90;
  if ((outside && b.age > 2) || b.age > b.life) b.dying = true;
  b.alpha += ((b.dying ? 0 : 1) - b.alpha) * damp(b.dying ? 3 : 2, dt);
  if (b.dying && b.alpha < 0.02) {
    remove(b);
    return;
  }
  place(b);
}

function tick(dt) {
  time += dt;
  if (paused) return;
  obstacleClock -= dt;
  if (obstacleClock <= 0) {
    obstacleClock = 0.8;
    measureObstacles();
  }
  spawnIn -= dt;
  if (spawnIn <= 0) {
    spawnIn = 8 + Math.random() * 12;
    spawnGroup();
  }
  flock.slice().forEach((b) => step(b, dt));
}

/* ------------------------------------------------------------------- burst */

function burst(b) {
  if (b.dying) return;
  b.dying = true;
  flock = flock.filter((item) => item !== b);
  sfx.confirm();

  const x = b.x;
  const y = b.y;
  const fx = document.createElement("div");
  fx.className = "bfly-burst";
  fx.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  const sparks = [];
  const flash = document.createElement("i");
  flash.className = "bfly-flash";
  fx.append(flash);
  for (let i = 0; i < 18; i += 1) {
    const spark = document.createElement("i");
    spark.className = i % 3 === 0 ? "bfly-spark bfly-spark--hot" : "bfly-spark";
    fx.append(spark);
    sparks.push(spark);
  }
  const ring = document.createElement("i");
  ring.className = "bfly-ring";
  fx.append(ring);
  layer.append(fx);

  const tl = gsap.timeline({ onComplete: () => fx.remove() });
  tl.to(b.el, { scale: 1.6, autoAlpha: 0, duration: DUR.ui, ease: EASE.out, onComplete: () => b.el.remove() }, 0)
    .fromTo(flash, { scale: 0.3, autoAlpha: 1 }, { scale: 1.3, autoAlpha: 0, duration: DUR.panel, ease: EASE.out }, 0)
    .fromTo(ring, { scale: 0.2, autoAlpha: 1 }, { scale: 1.8, autoAlpha: 0, duration: DUR.scene, ease: EASE.out }, 0);
  sparks.forEach((spark, i) => {
    const angle = (i / sparks.length) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 64;
    tl.fromTo(
      spark,
      { x: 0, y: 0, scale: 0.5 + Math.random() * 0.7, rotation: 0, autoAlpha: 1 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist + 18,
        scale: 0,
        rotation: Math.random() < 0.5 ? -90 : 90,
        autoAlpha: 0,
        duration: DUR.scene * (0.8 + Math.random() * 0.5),
        ease: EASE.out
      },
      Math.random() * 0.05
    );
  });
}

/* ---------------------------------------------------------- section pause */

function pauseForTransition() {
  if (!enabled) return;
  paused = true;
  resumeCall?.kill();
  gsap.to(layer, { autoAlpha: 0, duration: DUR.micro, ease: "none", overwrite: "auto" });
  // One hero per moment: come back once the panel has landed.
  resumeCall = gsap.delayedCall(DUR.panel + 0.45, () => {
    paused = false;
    measureObstacles();
    gsap.to(layer, { autoAlpha: 1, duration: DUR.panel, ease: "none", overwrite: "auto" });
  });
}

/* ---------------------------------------------------------------- lifecycle */

function clearFlock() {
  flock.forEach((b) => b.el.remove());
  flock = [];
}

function enable() {
  if (enabled || flags.nofx || prefersReducedMotion() || !layer) return;
  enabled = true;
  paused = false;
  spawnIn = 3 + Math.random() * 3;
  measureObstacles();
  stopLoop = rafLoop(tick);
}

function disable() {
  enabled = false;
  stopLoop?.();
  stopLoop = null;
  resumeCall?.kill();
  clearFlock();
}

export function init() {
  if (flags.nofx) return;
  layer = document.createElement("div");
  layer.className = "fx-flyers";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);

  const seed = daySeed("butterflies");
  noise = createNoise(seed);
  species = Array.from({ length: SPECIES }, (_, i) => butterflySpecies(seed + i * 7919, `bfly-${i}`));

  afterIntro(enable);
  on(EVT.SECTION_WILL_CHANGE, pauseForTransition);
  onReducedMotionChange((reduced) => {
    if (reduced) disable();
    else if (state.introDone) enable();
  });
  window.addEventListener("resize", () => {
    obstacleClock = 0;
  });
  // QA only (?fxbench): spawn on demand.
  if (params.has("fxbench")) window.__spawnButterflies = spawnGroup;
}
