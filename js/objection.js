// "Objection!" comic burst: white flash, radial speed lines, a red band at the major
// angle and the word slamming in with overshoot and shake. Holds ~900 ms, exits fast.
// "Objection!" is the owner's own easter egg. Owner: HUD/overlays workstream (C).
import { EVT, emit, prefersReducedMotion } from "./core.js";
import { gsap, EASE } from "./motion.js";
import { sfx } from "./sfx.js";
import { createRng } from "./proc/rng.js";

let overlay = null;
let parts = {};
let tl = null;

/** Radial speed lines: thin wedges pointing at the centre, leaving it clear. */
function buildSpeedLines(svg) {
  const rng = createRng("objection-lines");
  let wedges = "";
  let accents = "";
  const count = 84;
  for (let i = 0; i < count; i += 1) {
    const a = ((i + rng.range(-0.35, 0.35)) / count) * Math.PI * 2;
    const half = rng.range(0.004, 0.017);
    const inner = rng.range(170, 330);
    const outer = 760;
    const p = (r, ang) => `${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
    const d = `M${p(inner, a)} L${p(outer, a - half)} L${p(outer, a + half)} Z `;
    if (rng.chance(0.18)) accents += d;
    else wedges += d;
  }
  svg.innerHTML = `<path class="objection-lines-main" d="${wedges}" /><path class="objection-lines-accent" d="${accents}" />`;
}

export function showObjection() {
  if (!overlay) return;
  tl?.kill();
  const { veil, lines, band, word, inner, flash } = parts;
  sfx.objection();
  emit(EVT.OBJECTION, {});
  overlay.classList.add("is-visible");
  gsap.set([veil, lines, band, word, inner, flash], { clearProps: "all" });

  if (prefersReducedMotion()) {
    // Static card: band and word fade in, hold, fade out.
    tl = gsap.timeline({ onComplete: () => overlay.classList.remove("is-visible") });
    tl.set(flash, { opacity: 0 });
    tl.set(band, { clipPath: "inset(0 0% 0 0)" });
    tl.fromTo([veil, band, word], { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "none" }, 0);
    tl.set(lines, { opacity: 0.5 }, 0);
    tl.to([veil, lines, band, word], { opacity: 0, duration: 0.16, ease: "none" }, 1.2);
    return;
  }

  tl = gsap.timeline({ onComplete: () => overlay.classList.remove("is-visible") });
  // 1-2 frame white flash.
  tl.set(flash, { opacity: 1 }, 0);
  tl.to(flash, { opacity: 0, duration: 0.06, ease: "power2.out" }, 0.034);
  tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "none" }, 0);
  // Speed lines punch in, then keep drifting outward during the hold.
  tl.fromTo(lines, { opacity: 0, scale: 1.4, rotation: -3 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.18, ease: EASE.out }, 0);
  tl.to(lines, { scale: 1.08, rotation: 2, duration: 1.0, ease: "none" }, 0.18);
  // Red band at the major angle wipes across.
  tl.fromTo(band, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.16, ease: EASE.snap }, 0.02);
  // The word slams in with overshoot, then shakes.
  tl.fromTo(word, { opacity: 0, scale: 2.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.4)" }, 0.05);
  tl.to(inner, {
    keyframes: [
      { x: -11, y: 6, duration: 0.035 },
      { x: 9, y: -5, duration: 0.035 },
      { x: -7, y: -4, duration: 0.035 },
      { x: 6, y: 4, duration: 0.035 },
      { x: -3, y: 2, duration: 0.035 },
      { x: 0, y: 0, duration: 0.04 }
    ],
    ease: "none"
  }, 0.2);
  // Subtle push-in during the hold (~900 ms), then a fast exit.
  tl.to(word, { scale: 1.04, duration: 0.9, ease: "none" }, 0.35);
  const out = 1.22;
  tl.to(word, { xPercent: 18, opacity: 0, duration: 0.18, ease: EASE.in }, out);
  tl.to(band, { clipPath: "inset(0 0 0 100%)", duration: 0.2, ease: EASE.in }, out);
  tl.to([lines, veil], { opacity: 0, duration: 0.2, ease: "none" }, out + 0.02);
}

export function init() {
  overlay = document.querySelector(".objection-overlay");
  if (!overlay) return;
  parts = {
    veil: overlay.querySelector(".objection-veil"),
    lines: overlay.querySelector(".objection-lines"),
    band: overlay.querySelector(".objection-band"),
    word: overlay.querySelector(".objection-word"),
    inner: overlay.querySelector(".objection-word-inner"),
    flash: overlay.querySelector(".objection-flash")
  };
  if (parts.lines) buildSpeedLines(parts.lines);
}
