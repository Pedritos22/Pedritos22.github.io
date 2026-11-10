// Procedural clock rings and hands for the moon emblem. Every ring is its own SVG so it can
// rotate as a composited layer. Tick rhythms, gaps and markers come from a seeded RNG
// (daySeed("emblem")), so the dial is the same all day and different tomorrow.
// Geometry is in emblem units: viewBox -500..500, 0deg = 12 o'clock, clockwise.
import { createRng } from "../proc/rng.js";

const f = (n) => Number(n.toFixed(2));
const RAD = Math.PI / 180;

export const MOON_R = 196;

export function polar(r, deg) {
  return [r * Math.sin(deg * RAD), -r * Math.cos(deg * RAD)];
}

function tick(r0, r1, deg) {
  const [x0, y0] = polar(r0, deg);
  const [x1, y1] = polar(r1, deg);
  return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
}

function arc(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

/** Closed annular sector (for thick bezel segments with crisp, radial ends). */
function sector(r0, r1, a0, a1) {
  const [ax, ay] = polar(r1, a0);
  const [bx, by] = polar(r1, a1);
  const [cx, cy] = polar(r0, a1);
  const [dx, dy] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${large} 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 ${large} 0 ${f(dx)} ${f(dy)}Z`;
}

function diamond(r, deg, size) {
  const [x, y] = polar(r, deg);
  const [ox, oy] = polar(size, deg);
  const [px, py] = polar(size * 0.55, deg + 90);
  return `M${f(x + ox)} ${f(y + oy)}L${f(x + px)} ${f(y + py)}L${f(x - ox)} ${f(y - oy)}L${f(x - px)} ${f(y - py)}Z`;
}

/** Inward-pointing triangle marker. */
function chevron(r, deg, size) {
  const [tx, ty] = polar(r - size, deg);
  const [ax, ay] = polar(r, deg - size * 0.11);
  const [bx, by] = polar(r, deg + size * 0.11);
  return `M${f(tx)} ${f(ty)}L${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}Z`;
}

const wrap = (body) => `<svg viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">${body}</svg>`;

/* ------------------------------------------------------------------ rings */

/** Outermost hairline: broken circle, tick clusters, diamond markers, one accent arc. */
export function outerRingSvg(seed) {
  const rng = createRng(seed).fork("outer");
  const r = 488;
  const breaks = Array.from({ length: rng.int(2, 4) }, () => rng.range(0, 360)).sort((a, b) => a - b);
  let hair = "";
  breaks.forEach((start, i) => {
    const gap = rng.range(5, 12);
    const next = i + 1 < breaks.length ? breaks[i + 1] : breaks[0] + 360;
    if (next - start - gap > 1) hair += arc(r, start + gap, next);
  });
  let clusters = "";
  const clusterCount = rng.int(6, 9);
  for (let c = 0; c < clusterCount; c += 1) {
    const base = rng.range(0, 360);
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i += 1) clusters += tick(468, 480, base + i * 1.6);
  }
  let marks = "";
  for (let i = 0; i < 4; i += 1) marks += diamond(r, i * 90 + rng.range(-20, 20), 7);
  const accentAt = rng.range(0, 360);
  return wrap(`
    <path d="${hair}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.5"/>
    <path d="${clusters}" stroke="currentColor" stroke-width="2" stroke-opacity="0.6"/>
    <path d="${marks}" fill="currentColor" fill-opacity="0.8"/>
    <path class="emb-acc" d="${arc(r, accentAt, accentAt + rng.range(14, 24))}" fill="none" stroke="currentColor" stroke-width="5"/>`);
}

/** Bezel: segmented band of solid and hatched arcs with inward chevrons. Spins while idle. */
export function bezelSvg(seed) {
  const rng = createRng(seed).fork("bezel");
  const r0 = 444;
  const r1 = 462;
  let solid = "";
  let thin = "";
  let hatch = "";
  let a = rng.range(0, 30);
  const end = a + 360;
  while (a < end - 6) {
    const len = Math.min(rng.weighted([[rng.range(4, 10), 3], [rng.range(14, 34), 4], [rng.range(40, 64), 1]]), end - a - 3);
    const kind = rng.weighted([["solid", 4], ["thin", 3], ["hatch", 2]]);
    if (kind === "solid") solid += sector(r0 + 4, r1, a, a + len);
    else if (kind === "thin") thin += arc((r0 + r1) / 2, a, a + len);
    else for (let h = a; h < a + len; h += 1.5) hatch += tick(r0 + 2, r1, h);
    a += len + rng.range(1.5, 5);
  }
  let chevrons = "";
  const count = rng.int(3, 5);
  for (let i = 0; i < count; i += 1) chevrons += chevron(r0 - 6, rng.range(0, 360), 16);
  return wrap(`
    <circle r="${r0 - 2}" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.28"/>
    <path d="${solid}" fill="currentColor" fill-opacity="0.42"/>
    <path d="${thin}" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity="0.55"/>
    <path d="${hatch}" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.5"/>
    <path class="emb-acc" d="${chevrons}" fill="currentColor"/>`);
}

const NUMERALS = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

/** Static dial face: minute track, seeded accent rhythm, roman numerals, moon collar. */
export function dialSvg(seed) {
  const rng = createRng(seed).fork("dial");
  const rhythm = rng.pick([3, 4, 6]);
  const offset = rng.int(1, rhythm - 1);
  let minor = "";
  let medium = "";
  let major = "";
  for (let i = 0; i < 60; i += 1) {
    const deg = i * 6;
    if (i % 5 === 0) major += tick(388, 422, deg);
    else if (i % rhythm === offset) medium += tick(398, 422, deg);
    else minor += tick(408, 420, deg);
  }
  let numerals = "";
  NUMERALS.forEach((label, i) => {
    const deg = i * 30;
    // Read from outside: the lower half is flipped so no numeral stands on its head.
    const flip = deg > 90 && deg < 270;
    const [x, y] = polar(352, deg);
    const rot = flip ? deg + 180 : deg;
    numerals += `<text x="${f(x)}" y="${f(y)}" transform="rotate(${rot} ${f(x)} ${f(y)})">${label}</text>`;
  });
  return wrap(`
    <circle r="428" fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.38"/>
    <circle r="382" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.18"/>
    <path d="${minor}" stroke="currentColor" stroke-width="2" stroke-opacity="0.5"/>
    <path d="${medium}" stroke="currentColor" stroke-width="2.6" stroke-opacity="0.75"/>
    <path d="${major}" stroke="currentColor" stroke-width="6" stroke-opacity="0.95"/>
    <g class="emb-numerals" text-anchor="middle" dominant-baseline="central">${numerals}</g>
    <circle class="emb-acc" r="${MOON_R + 12}" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity="0.55"/>`);
}

/** Inner ring: 120 fine ticks with a seeded length rhythm and a few deliberate gaps. */
export function innerRingSvg(seed) {
  const rng = createRng(seed).fork("inner");
  const gaps = Array.from({ length: rng.int(2, 4) }, () => [rng.int(0, 119), rng.int(4, 9)]);
  const inGap = (i) => gaps.some(([start, len]) => ((i - start + 120) % 120) < len);
  const lengths = Array.from({ length: rng.int(3, 5) }, () => rng.pick([5, 8, 12, 18]));
  let fine = "";
  let bold = "";
  for (let i = 0; i < 120; i += 1) {
    if (inGap(i)) continue;
    const deg = i * 3;
    const len = lengths[i % lengths.length];
    if (len >= 12) bold += tick(296, 296 + len, deg);
    else fine += tick(298, 298 + len, deg);
  }
  let dots = "";
  gaps.forEach(([start, len]) => {
    const [x, y] = polar(304, (start + len / 2) * 3);
    dots += `<circle cx="${f(x)}" cy="${f(y)}" r="4"/>`;
  });
  return wrap(`
    <circle r="290" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
    <path d="${fine}" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.55"/>
    <path d="${bold}" stroke="currentColor" stroke-width="2.5" stroke-opacity="0.8"/>
    <g class="emb-acc" fill="currentColor">${dots}</g>`);
}

/* ------------------------------------------------------------------ hands */

// Hands live in an 80 x 500 box whose bottom-centre is the dial centre (viewBox -40 -500 80 500).
const HANDS = {
  hour: `<path class="emb-hand__blade" d="M-12 ${-(MOON_R + 24)}H12V-322L-1 -352L-12 -334Z"/>
         <path class="emb-hand__core" d="M0 ${-(MOON_R + 34)}V-318"/>`,
  minute: `<path class="emb-hand__blade" d="M-7 ${-(MOON_R + 24)}H7V-424L-1 -446L-7 -432Z"/>
           <path class="emb-hand__core" d="M0 ${-(MOON_R + 34)}V-418"/>`,
  second: `<path class="emb-hand__line" d="M-1.6 ${-(MOON_R + 18)}H1.6V-484H-1.6Z"/>
           <path class="emb-hand__tip" d="M0 -496L7 -474L0 -452L-7 -474Z"/>`
};

export function handSvg(kind) {
  return `<svg viewBox="-40 -500 80 500" aria-hidden="true" focusable="false">${HANDS[kind]}</svg>`;
}
