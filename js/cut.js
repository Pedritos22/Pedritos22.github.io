// The cut: the one navigation transition of the site. A train of bands leaning at -8deg
// (the card wipe of the old pause menu, now full-screen) crosses the screen; while its navy
// body covers everything the page jumps (onCovered), and the destination's number and name
// ride on the body as it passes. The HUD and the chapter rail stay above it.
// Reduced motion: a 120 ms veil instead.
// Owner: menu/panel workstream (B).
import { prefersReducedMotion, escapeHtml as esc } from "./core.js";
import { animate, hasWaapi } from "./motion.js";
import { sfx } from "./sfx.js";

const TAN8 = Math.tan((8 * Math.PI) / 180);
const COVER_S = 0.24;
const HOLD_S = 0.08;
const EXIT_S = 0.36;
const TRAIL = 4 + 10 + 18 + 40; // streak + gap + cyan + blue (px), as the .wb-* widths

let layer = null;
let running = null; // { covered, onCovered, done }

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "cut";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
}

const transform = (x) => `translateX(${Math.round(x)}px) skewX(-8deg)`;

function veil(onCovered) {
  const el = ensureLayer();
  el.innerHTML = '<span class="cut-veil"></span>';
  const v = el.firstElementChild;
  return new Promise((resolve) => {
    const out = () => {
      onCovered?.();
      const leave = animate(v, [{ opacity: 1 }, { opacity: 0 }], { duration: 0.16, ease: "linear", fill: "forwards" });
      (leave?.finished ?? Promise.resolve()).then(() => {
        el.innerHTML = "";
        resolve();
      }, resolve);
    };
    const enter = animate(v, [{ opacity: 0 }, { opacity: 1 }], { duration: 0.12, ease: "linear", fill: "forwards" });
    if (enter) enter.finished.then(out, out);
    else out();
  });
}

/**
 * Run the cut: `onCovered` is called once while the screen is fully covered. `direction` 1
 * crosses left to right (deeper), -1 right to left (back up). `code` and `name` ride on it.
 * A cut started while one runs takes over its callback (or runs at once if already covered).
 */
export function cut(onCovered, { direction = 1, code = "", name = "" } = {}) {
  if (running) {
    if (!running.covered) running.onCovered = onCovered;
    else onCovered?.();
    return running.done;
  }
  if (prefersReducedMotion() || !hasWaapi) return veil(onCovered);

  const el = ensureLayer();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const overhang = Math.ceil((h * 1.2 / 2) * TAN8) + 16;
  const navy = Math.ceil(w + overhang * 2 + 24);
  const length = TRAIL + navy + 3;
  let start = -(length + overhang);
  let cover = -overhang - 12 - TRAIL;
  let end = w + overhang;
  if (direction < 0) {
    start = w - (start + length);
    cover = w - (cover + length);
    end = w - (end + length);
  }

  el.innerHTML = `<span class="cut-train" data-dir="${direction}" style="--navy-w:${navy}px">
      <i class="wb wb-streak"></i><i class="wb wb-gap"></i><i class="wb wb-cyan"></i><i class="wb wb-blue"></i>
      <i class="wb wb-navy"><span class="cut-label"><b>${esc(code)}</b><span>${esc(name)}</span></span></i>
      <i class="wb wb-edge"></i>
    </span>`;
  const train = el.firstElementChild;
  train.style.transform = transform(start);
  sfx.whoosh();

  const state = { covered: false, onCovered };
  state.done = new Promise((resolve) => {
    const finish = () => {
      if (layer) layer.innerHTML = "";
      running = null;
      resolve();
    };
    const enter = animate(train, [{ transform: transform(start) }, { transform: transform(cover) }], { duration: COVER_S, ease: "power2Out", fill: "both" });
    const covered = () => {
      state.covered = true;
      try {
        state.onCovered?.();
      } finally {
        const label = train.querySelector(".cut-label");
        if (label) animate(label, [{ opacity: 0, translate: `${-40 * direction}px 0` }, { opacity: 1, translate: "0 0" }], { duration: 0.2, ease: "out" });
        const exit = animate(train, [{ transform: transform(cover) }, { transform: transform(end) }], { duration: EXIT_S, delay: HOLD_S, ease: "power1In", fill: "both" });
        (exit?.finished ?? Promise.resolve()).then(finish, finish);
      }
    };
    (enter?.finished ?? Promise.resolve()).then(covered, covered);
  });
  running = state;
  return state.done;
}

export const isCutting = () => Boolean(running);
