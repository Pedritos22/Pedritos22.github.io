// Procedural arcana sigils for the skill cards. Owner: menu/panel workstream (B).
//
// renderSigil(name) returns an inline SVG string that is fully deterministic for a given
// name (seeded with createRng), so "Java" always gets the same sigil on every visit.
// Every stroke is `currentColor` with pathLength="1", so a sigil can be drawn in by
// animating stroke-dashoffset from 1 to 0 (see animateSigilDraw in sections.js).
//
// Anatomy (all radially symmetric, 3 to 8 fold):
//   - an outer frame of concentric rings, some dashed
//   - a star polygon {n/k}
//   - one "rune" (a short angular polyline) per fold, optionally mirrored
//   - small vertex dots and a centre mark
import { createRng } from "./proc/rng.js";

const cache = new Map();
const TAU = Math.PI * 2;

const fmt = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const polar = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/** Line segments of the star polygon {n/k}, one closed path per connected component. */
function starPaths(n, k, radius, rotation) {
  const points = Array.from({ length: n }, (_, i) => polar(radius, rotation + (i * TAU) / n));
  const components = gcd(n, k);
  const paths = [];
  for (let start = 0; start < components; start += 1) {
    let index = start;
    let d = "";
    do {
      const [x, y] = points[index];
      d += `${d ? "L" : "M"}${fmt(x)} ${fmt(y)}`;
      index = (index + k) % n;
    } while (index !== start);
    paths.push(`${d}Z`);
  }
  return { paths, points };
}

/** A short angular polyline inside one wedge; radii and angles snap to a coarse grid. */
function makeRune(rng, wedge) {
  const steps = rng.int(2, 4);
  const points = [];
  let radius = rng.pick([14, 18, 22]);
  let angle = 0;
  points.push([radius, angle]);
  for (let i = 0; i < steps; i += 1) {
    if (rng.chance(0.55)) {
      radius = Math.min(40, radius + rng.pick([6, 8, 10]));
    } else {
      angle = rng.pick([-1, 1]) * rng.pick([0.25, 0.375]) * wedge;
    }
    points.push([radius, angle]);
  }
  return points;
}

function runePath(points, rotation, mirror) {
  return points
    .map(([radius, angle], i) => {
      const [x, y] = polar(radius, rotation + (mirror ? -angle : angle));
      return `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`;
    })
    .join("");
}

function build(name) {
  const rng = createRng(`sigil:${name}`);
  const fold = rng.pick([3, 4, 5, 6, 7, 8]);
  // Star polygons need n >= 5; small folds double up so the star still reads.
  const n = fold < 5 ? fold * 2 : fold;
  const maxK = Math.floor((n - 1) / 2);
  const k = rng.int(2, Math.max(2, maxK));
  const rotation = -Math.PI / 2 + (rng.chance(0.5) ? Math.PI / n : 0);
  const starRadius = rng.pick([30, 32, 34]);

  const parts = [];

  // Frame: outer ring, a dashed ring, and an inner ring on the star's inscribed circle.
  parts.push(`<circle class="sg-draw" r="46" pathLength="1"/>`);
  const dashes = rng.pick([24, 32, 40, 48]);
  parts.push(
    `<circle class="sg-dash" r="${rng.pick([40, 41])}" pathLength="${dashes}" stroke-dasharray="0.5 0.5"/>`
  );
  const inner = starRadius * Math.cos((Math.PI * k) / n);
  if (inner > 6) parts.push(`<circle class="sg-draw" r="${fmt(inner)}" pathLength="1"/>`);

  // Star polygon.
  const star = starPaths(n, k, starRadius, rotation);
  star.paths.forEach((d) => parts.push(`<path class="sg-draw" d="${d}" pathLength="1"/>`));

  // Runes, one per fold, between the star points.
  const wedge = TAU / fold;
  const rune = makeRune(rng, wedge);
  const mirrored = rng.chance(0.6);
  const runeOffset = rotation + wedge / 2;
  for (let i = 0; i < fold; i += 1) {
    const angle = runeOffset + i * wedge;
    parts.push(`<path class="sg-draw sg-rune" d="${runePath(rune, angle, false)}" pathLength="1"/>`);
    if (mirrored) parts.push(`<path class="sg-draw sg-rune" d="${runePath(rune, angle, true)}" pathLength="1"/>`);
  }

  // Ticks on the outer ring, aligned with the star points.
  const tickInner = 43;
  const tickOuter = rng.pick([49, 50]);
  for (let i = 0; i < n; i += 1) {
    const angle = rotation + (i * TAU) / n;
    const [x1, y1] = polar(tickInner, angle);
    const [x2, y2] = polar(tickOuter, angle);
    parts.push(`<path class="sg-draw sg-tick" d="M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}" pathLength="1"/>`);
  }

  // Vertex dots on the star points (every point, or every other one for large n).
  const every = n > 6 && rng.chance(0.5) ? 2 : 1;
  star.points.forEach(([x, y], i) => {
    if (i % every === 0) parts.push(`<circle class="sg-dot" cx="${fmt(x)}" cy="${fmt(y)}" r="1.8" pathLength="1"/>`);
  });

  // Centre mark: a ring or a diamond.
  if (rng.chance(0.5)) {
    parts.push(`<circle class="sg-draw" r="${rng.pick([4, 5, 6])}" pathLength="1"/>`);
  } else {
    const s = rng.pick([5, 6, 7]);
    parts.push(`<path class="sg-draw" d="M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z" pathLength="1"/>`);
  }

  return { parts, fold, n, k };
}

/**
 * Inline SVG string for the sigil of `name` (memoized).
 * options.className  extra class names for the <svg>
 * options.title      accessible title (omit to keep the sigil decorative)
 */
export function renderSigil(name, options = {}) {
  const className = options.className ? ` ${options.className}` : "";
  const key = `${name}|${className}|${options.title ?? ""}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { parts, fold, n, k } = build(String(name));
  const label = options.title
    ? `role="img" aria-label="${String(options.title).replace(/"/g, "&quot;")}"`
    : `aria-hidden="true"`;
  const svg =
    `<svg class="sigil${className}" viewBox="-52 -52 104 104" ${label} focusable="false" ` +
    `data-fold="${fold}" data-star="${n}/${k}" fill="none" stroke="currentColor" ` +
    `stroke-linecap="square" stroke-linejoin="miter">${parts.join("")}</svg>`;
  cache.set(key, svg);
  return svg;
}
