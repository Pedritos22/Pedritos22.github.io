// Procedural butterfly wings: seeded bezier outlines, veins, spots and a cold gradient.
// Colours are CSS tokens (style attributes), so the Dark Hour palette tints them for free.
import { createRng } from "../proc/rng.js";

const f = (n) => Number(n.toFixed(2));

/**
 * One species from a seed. Returns { defs, wing, body } markup.
 * `defs` (gradients) is mounted once per page so wing copies never duplicate ids.
 * The wing is the RIGHT wing in a 0..50 x -40..40 box with the root at (0, 0);
 * the left wing is the same SVG mirrored in CSS.
 */
export function butterflySpecies(seed, uid) {
  const rng = createRng(seed);
  // Forewing: root -> apex -> tornus.
  const ax = rng.range(36, 46);
  const ay = rng.range(-34, -24);
  const tx = rng.range(26, 34);
  const ty = rng.range(-3, 3);
  const bulge = rng.range(0.15, 0.45);
  const fore = [
    `M0 -2`,
    `C${f(ax * 0.3)} ${f(ay * 0.9)} ${f(ax * 0.7)} ${f(ay * 1.12)} ${f(ax)} ${f(ay)}`,
    `C${f(ax + 4 * bulge)} ${f(ay + 12)} ${f(tx + 8 * bulge)} ${f(ty - 8)} ${f(tx)} ${f(ty)}`,
    `C${f(tx * 0.6)} ${f(ty + 2)} ${f(tx * 0.25)} 1 0 1Z`
  ].join("");

  // Hindwing: shoulder -> lobe, optional tail.
  const hx = rng.range(22, 30);
  const hy = rng.range(6, 12);
  const lx = rng.range(12, 20);
  const ly = rng.range(22, 30);
  const tail = rng.chance(0.55);
  const tailLen = rng.range(8, 14);
  let hind = `M0 2C${f(hx * 0.5)} 1 ${f(hx)} ${f(hy - 6)} ${f(hx)} ${f(hy)}`;
  hind += `C${f(hx + 1)} ${f(hy + 8)} ${f(lx + 6)} ${f(ly - 2)} ${f(lx)} ${f(ly)}`;
  if (tail) {
    hind += `L${f(lx - 1)} ${f(ly + tailLen)}L${f(lx - 4)} ${f(ly + tailLen - 1)}L${f(lx - 5)} ${f(ly)}`;
  }
  hind += `C${f(lx * 0.5)} ${f(ly)} 3 ${f(ly * 0.5)} 0 6Z`;

  // Veins radiate from the root to the margins.
  const veins = [];
  const foreVeins = rng.int(3, 5);
  for (let i = 0; i < foreVeins; i += 1) {
    const t = (i + 1) / (foreVeins + 1);
    const ex = ax + (tx - ax) * t;
    const ey = ay + (ty - ay) * t;
    veins.push(`M1 -1Q${f(ex * 0.45)} ${f(ey * 0.62)} ${f(ex * 0.92)} ${f(ey * 0.92)}`);
  }
  const hindVeins = rng.int(2, 4);
  for (let i = 0; i < hindVeins; i += 1) {
    const t = (i + 1) / (hindVeins + 1);
    const ex = hx + (lx - hx) * t;
    const ey = hy + (ly - hy) * t;
    veins.push(`M1 3Q${f(ex * 0.5)} ${f(ey * 0.4)} ${f(ex * 0.9)} ${f(ey * 0.9)}`);
  }

  // Spots near the apex and an eye on the hindwing.
  let spots = "";
  const spotCount = rng.int(1, 3);
  for (let i = 0; i < spotCount; i += 1) {
    const sx = ax * rng.range(0.62, 0.86);
    const sy = ay * rng.range(0.5, 0.82);
    spots += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(rng.range(1.2, 2.4))}"/>`;
  }
  const eye = rng.chance(0.6)
    ? `<circle cx="${f(lx * 0.95)}" cy="${f(ly * 0.72)}" r="${f(rng.range(2.4, 3.6))}" fill="none" stroke-width="1.2" style="stroke: var(--ice)"/>`
    : "";

  const grad = `${uid}-g`;
  const glow = `${uid}-glow`;
  const deepStop = rng.chance(0.5) ? "var(--deep)" : "var(--blue)";
  const defs = `
    <linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="-0.6">
      <stop offset="0" style="stop-color: ${deepStop}" stop-opacity="0.95"/>
      <stop offset="0.55" style="stop-color: var(--blue-soft)" stop-opacity="0.85"/>
      <stop offset="1" style="stop-color: var(--cyan)" stop-opacity="0.95"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.3" cy="0.45" r="0.6">
      <stop offset="0" style="stop-color: var(--cyan)" stop-opacity="0.5"/>
      <stop offset="1" style="stop-color: var(--cyan)" stop-opacity="0"/>
    </radialGradient>`;
  const wing = `
<svg viewBox="-2 -40 52 80" aria-hidden="true" focusable="false">
  <ellipse cx="18" cy="-4" rx="30" ry="34" fill="url(#${glow})"/>
  <path d="${hind}" fill="url(#${grad})" fill-opacity="0.8" style="stroke: var(--cyan)" stroke-width="1" stroke-opacity="0.8"/>
  <path d="${fore}" fill="url(#${grad})" style="stroke: var(--ice)" stroke-width="1.1" stroke-opacity="0.9"/>
  <path d="${veins.join("")}" fill="none" style="stroke: var(--ice)" stroke-width="0.6" stroke-opacity="0.45"/>
  <g style="fill: var(--paper)" fill-opacity="0.85">${spots}</g>
  ${eye}
</svg>`;

  const body = `
<svg viewBox="-4 -14 8 30" aria-hidden="true" focusable="false">
  <ellipse cx="0" cy="2" rx="1.7" ry="11" style="fill: var(--ice)"/>
  <circle cx="0" cy="-9.5" r="2.1" style="fill: var(--paper)"/>
  <path d="M-0.6 -11Q-3 -14 -3.6 -13.6M0.6 -11Q3 -14 3.6 -13.6" fill="none" style="stroke: var(--ice)" stroke-width="0.5"/>
</svg>`;

  return { defs, wing, body };
}
