// Atmosphere workstream (A): procedural night-city skyline + the tower on the horizon.
// Three parallax layers painted once to cached canvases; only cheap overlays animate
// (window twinkle at ~8 fps, beacon blinks in CSS, parallax transforms).
import {
  EVT, on, state, flags, daySeed, prefersReducedMotion, onReducedMotionChange,
  isMobileLayout, onLayoutChange, rafLoop, clamp, now as worldNow
} from "./core.js";
import { hourOf, windowShare, windowLit } from "./time-math.js";
import { gsap, EASE } from "./motion.js";
import { createNoise } from "./proc/noise.js";
import { LAYERS, generateLayer, paintBuildings, paintWindows, generateTower, paintTower } from "./fx/city-art.js";
import { pointer, installPointer, damp } from "./fx/pointer.js";

const TWINKLE_STEP = 1 / 8; // seconds between window redraws
const TOWER_RISE = 2.8; // seconds

let root = null;
let layers = [];
let tower = null;
let noise = null;
let reduced = false;
let stopLoop = null;
let darkActive = false;
let lightsTween = null;
let towerTween = null;
let twinkleClock = 0;
let time = 0;
let share = windowShare(hourOf(worldNow())); // lit share of windows at the world's hour
let quietUntil = 0; // performance.now() ms: no window redraws while a section transition runs
const QUIET_MS = 1000; // a full wipe + cascade

function dprFor() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

function skylineHeight() {
  return root.getBoundingClientRect().height || 180;
}

/** Tower x (CSS px): in the gutter between the menu column and the card on desktop. */
function towerX(width) {
  if (isMobileLayout()) return width * 0.8;
  const identity = document.querySelector(".identity")?.getBoundingClientRect();
  const card = document.querySelector(".panel-wrap > .content-card")?.getBoundingClientRect();
  if (identity && card && card.width > 0 && card.left > identity.right) {
    return clamp((identity.right + card.left) / 2, width * 0.3, width * 0.62);
  }
  return width * 0.45;
}

function makeCanvas(className) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  return canvas;
}

/* ------------------------------------------------------------------- build */

function build() {
  root.replaceChildren();
  layers = [];
  const seed = daySeed("skyline");
  const width = window.innerWidth;
  const H = Math.round(skylineHeight());
  const dpr = dprFor();
  noise = createNoise(seed);

  const centerX = towerX(width);
  LAYERS.forEach((recipe, index) => {
    const data = generateLayer(seed, recipe, width, H, {
      keepClearBottom: recipe.name === "near" ? Math.min(44, H * 0.3) : 0,
      beacons: recipe.name === "near" ? 0 : 2,
      centerX
    });
    const el = document.createElement("div");
    el.className = `sky-layer sky-layer--${recipe.name}`;
    el.style.left = `${-data.margin}px`;
    el.style.right = `${-data.margin}px`;

    const cw = width + data.margin * 2;
    const sizeCanvas = (canvas) => {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(H * dpr);
      return canvas;
    };
    const build = sizeCanvas(makeCanvas("sky-build"));
    const buildDark = sizeCanvas(makeCanvas("sky-build sky-build--dark"));
    const lights = sizeCanvas(makeCanvas("sky-lights"));
    paintBuildings(build, data, recipe, H, dpr, false);
    paintBuildings(buildDark, data, recipe, H, dpr, true);
    paintWindows(lights, data, H, dpr, steadyBrightness);

    // The tower stands behind the far layer.
    if (index === 0) el.append(...buildTower(width, H, data.margin, dpr));
    el.append(build, buildDark, lights);

    data.beacons.forEach((beacon) => {
      const dot = document.createElement("i");
      dot.className = "sky-beacon";
      dot.style.left = `${beacon.x + data.margin}px`;
      dot.style.top = `${beacon.y}px`;
      dot.style.animationDelay = `${-beacon.delay}s`;
      dot.style.animationDuration = `${beacon.period}s`;
      el.append(dot);
    });

    root.append(el);
    layers.push({ recipe, data, el, lights, buildDark, H, dpr, offset: 0 });
  });

  applyDark(darkActive, false);
}

function buildTower(width, H, margin, dpr) {
  const mobile = isMobileLayout();
  const W = mobile ? clamp(Math.round(H * 0.4), 48, 80) : clamp(Math.round(H * 0.58), 64, 140);
  const full = Math.round(H * (mobile ? 2.6 : 3.3));
  const normal = Math.round(H * (mobile ? 1.5 : 1.75));
  const cw = Math.round(W * 1.5);
  const t = generateTower(daySeed("skyline"), W, full);

  const wrap = document.createElement("div");
  wrap.className = "sky-tower";
  wrap.style.width = `${cw}px`;
  wrap.style.height = `${full}px`;
  wrap.style.left = `${Math.round(towerX(width) + margin - cw / 2)}px`;

  const silhouette = makeCanvas("sky-tower__body");
  const glow = makeCanvas("sky-tower__glow");
  [silhouette, glow].forEach((canvas) => {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(full * dpr);
  });
  const { beacon } = paintTower(silhouette, t, cw, dpr);
  paintTower(glow, t, cw, dpr, { glow: true });

  const dot = document.createElement("i");
  dot.className = "sky-beacon sky-beacon--tower";
  dot.style.left = `${beacon.x}px`;
  dot.style.top = `${beacon.y}px`;
  wrap.append(silhouette, glow, dot);

  tower = { wrap, glow, sunk: full - normal, full, normal };
  gsap.set(wrap, { y: darkActive ? 0 : tower.sunk });
  return [wrap];
}

/* ------------------------------------------------------------------ motion */

/** Stable 0..1 rank per window: windows go dark in rank order as the night gets late. */
const rankOf = (win) => (win.phase * 7.31) % 1;

/** Without twinkle (first paint, reduced motion, ?nofx): base light times the hour. */
function steadyBrightness(win) {
  return win.base * windowLit(rankOf(win), share);
}

function brightnessAt(t) {
  return (win) => {
    const lit = windowLit(rankOf(win), share);
    if (lit <= 0) return 0;
    const n = noise.noise2(t * win.speed, win.phase);
    // Mostly steady with slow breathing; a few dip out entirely for a while.
    const level = n < -0.55 ? 0 : 0.72 + 0.28 * n;
    return win.base * level * lit;
  };
}

/** Follow the world clock (real minutes, or the time dial): repaint when the share moves. */
function updateShare(force = false) {
  const next = windowShare(hourOf(worldNow()));
  if (!force && Math.abs(next - share) < 0.004) return;
  share = next;
  if (stopLoop) twinkleClock = TWINKLE_STEP; // the running twinkle repaints next frame
  else layers.forEach((layer) => paintWindows(layer.lights, layer.data, layer.H, layer.dpr, steadyBrightness));
}

function tick(dt) {
  time += dt;
  // Parallax: ease each layer toward the pointer; write only when it moved.
  layers.forEach((layer) => {
    const target = pointer.active ? -pointer.tx * layer.recipe.parallax : 0;
    const next = layer.offset + (target - layer.offset) * damp(3, dt);
    if (Math.abs(next - layer.offset) > 0.02) {
      layer.offset = next;
      layer.el.style.transform = `translate3d(${next.toFixed(2)}px, 0, 0)`;
    }
  });

  twinkleClock += dt;
  // One hero per moment: the twinkle repaints whole canvases, so it waits out transitions.
  if (twinkleClock >= TWINKLE_STEP && !darkActive && performance.now() >= quietUntil) {
    twinkleClock = 0;
    const fn = brightnessAt(time);
    layers.forEach((layer) => paintWindows(layer.lights, layer.data, layer.H, layer.dpr, fn));
  }
}

function startLoop() {
  stopLoop?.();
  stopLoop = null;
  // ?nofx and reduced motion keep the city completely still (static lights, no parallax).
  if (reduced || flags.nofx || !layers.length) return;
  stopLoop = rafLoop(tick);
}

/* --------------------------------------------------------------- Dark Hour */

function applyDark(active, animate) {
  darkActive = active;
  root?.classList.toggle("is-dark", active);
  const lights = layers.map((layer) => layer.lights);
  const darkBuilds = layers.map((layer) => layer.buildDark);
  const instant = !animate || reduced;

  lightsTween?.kill();
  gsap.killTweensOf(darkBuilds);
  if (instant) {
    gsap.set(lights, { autoAlpha: active ? 0 : 1 });
    gsap.set(darkBuilds, { autoAlpha: active ? 1 : 0 });
  } else if (active) {
    // The windows die: a brownout flicker, then black.
    lightsTween = gsap.timeline()
      .to(lights, { autoAlpha: 0.25, duration: 0.08, ease: "none", stagger: 0.05 })
      .to(lights, { autoAlpha: 0.8, duration: 0.06, ease: "none", stagger: 0.05 })
      .to(lights, { autoAlpha: 0, duration: 0.9, ease: EASE.in, stagger: 0.12 });
    gsap.to(darkBuilds, { autoAlpha: 1, duration: 1.6, ease: "none", overwrite: true });
  } else {
    lightsTween = gsap.to(lights, { autoAlpha: 1, duration: 1.2, ease: EASE.out, stagger: 0.1 });
    gsap.to(darkBuilds, { autoAlpha: 0, duration: 1.2, ease: "none", overwrite: true });
  }

  if (!tower) return;
  towerTween?.kill();
  gsap.killTweensOf(tower.glow);
  const y = active ? 0 : tower.sunk;
  if (instant) {
    gsap.set(tower.wrap, { y });
    gsap.set(tower.glow, { autoAlpha: active ? 1 : 0 });
  } else {
    // The tower rises out of the city, slow and heavy; it sinks back faster.
    towerTween = gsap.to(tower.wrap, {
      y,
      duration: active ? TOWER_RISE : TOWER_RISE * 0.6,
      ease: active ? "power2.inOut" : EASE.in
    });
    gsap.to(tower.glow, { autoAlpha: active ? 1 : 0, duration: active ? 2 : 0.8, delay: active ? 0.6 : 0, ease: "none", overwrite: true });
  }
}

/* ---------------------------------------------------------------- lifecycle */

export function init() {
  const fxRoot = document.querySelector(".fx-root");
  if (!fxRoot) return;
  installPointer();
  reduced = prefersReducedMotion();
  darkActive = state.darkhour;

  root = document.createElement("div");
  root.className = "fx-skyline";
  fxRoot.append(root);

  // Wait one frame so the layout (card, menu) exists for the tower position.
  requestAnimationFrame(() => {
    build();
    startLoop();
  });

  let resizeTimer = 0;
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // Mobile URL bars change the height a little while scrolling: ignore tiny changes.
      if (window.innerWidth === lastWidth && Math.abs(window.innerHeight - lastHeight) < 90) return;
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      build();
    }, 160);
  });
  onLayoutChange(() => requestAnimationFrame(build));
  document.fonts?.ready.then(() => {
    // Card/menu metrics settle once the display fonts load; re-place the tower.
    if (tower) tower.wrap.style.left = `${Math.round(towerX(window.innerWidth) + layers[0].data.margin - tower.wrap.offsetWidth / 2)}px`;
  });

  on(EVT.DARKHOUR, ({ active }) => {
    if (Boolean(active) !== darkActive) applyDark(Boolean(active), true);
  });
  on(EVT.SECTION_WILL_CHANGE, () => {
    quietUntil = performance.now() + QUIET_MS;
  });
  let timeFrame = 0;
  on(EVT.TIME, () => {
    cancelAnimationFrame(timeFrame);
    timeFrame = requestAnimationFrame(() => updateShare());
  });
  window.setInterval(() => updateShare(), 60000);
  onReducedMotionChange((value) => {
    reduced = value;
    startLoop();
  });
}
