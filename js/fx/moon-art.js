// Procedural moon disc for the emblem: real phase terminator, maria, craters, earthshine.
// Pure string builders (no DOM), memoized per (variant, phase bucket).
import { createRng } from "../proc/rng.js";
import { NORMAL, DARK } from "./palette.js";

const rgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
const f = (n) => Number(n.toFixed(2));

/** Smooth closed blob through jittered points on a circle (quadratic midpoints). */
function blobPath(rng, cx, cy, radius, jitter = 0.28, points = 11, squash = 1) {
  const pts = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 - jitter / 2 + rng.next() * jitter);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${f(mid(pts[points - 1], pts[0])[0])} ${f(mid(pts[points - 1], pts[0])[1])}`;
  for (let i = 0; i < points; i += 1) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % points]);
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

/** Surface: soft maria + a few craters. Fixed seed: the moon is the same moon every day. */
function surface(R, ids, tone) {
  const rng = createRng("emblem-moon-surface");
  let maria = "";
  // Large soft plains, weighted to the upper left like the real near side.
  const plains = [
    [-0.34, -0.3, 0.36], [0.04, -0.46, 0.22], [-0.52, 0.1, 0.24], [0.16, -0.1, 0.22],
    [-0.14, 0.22, 0.24], [0.38, 0.2, 0.15], [-0.3, 0.5, 0.13], [0.44, -0.38, 0.11]
  ];
  plains.forEach(([x, y, r], i) => {
    const d = blobPath(rng, x * R, y * R, r * R, 0.5, 13, 0.82 + rng.next() * 0.24);
    maria += `<path d="${d}" fill="${tone.mare}" opacity="${f(0.34 + (i % 3) * 0.1)}"/>`;
  });
  let craters = "";
  for (let i = 0; i < 16; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const dist = Math.sqrt(rng.next()) * R * 0.86;
    const cx = Math.cos(a) * dist;
    const cy = Math.sin(a) * dist;
    const r = R * (i < 3 ? rng.range(0.05, 0.08) : rng.range(0.012, 0.032));
    craters += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${tone.crater}" opacity="${f(rng.range(0.14, 0.26))}"/>`;
    craters += `<circle cx="${f(cx - r * 0.22)}" cy="${f(cy + r * 0.22)}" r="${f(r * 0.7)}" fill="${tone.rim}" opacity="${f(rng.range(0.08, 0.16))}"/>`;
  }
  // One young ray crater in the south.
  const tx = R * 0.14;
  const ty = R * 0.6;
  let rays = "";
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = R * rng.range(0.18, 0.46);
    rays += `M${f(tx)} ${f(ty)}L${f(tx + Math.cos(a) * len)} ${f(ty + Math.sin(a) * len)}`;
  }
  return `
    <rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" filter="url(#${ids.mottle})" opacity="0.55"/>
    <g filter="url(#${ids.blur})">${maria}</g>
    ${craters}
    <path d="${rays}" stroke="${tone.rim}" stroke-width="${f(R * 0.008)}" stroke-linecap="round" opacity="0.18"/>
    <circle cx="${f(tx)}" cy="${f(ty)}" r="${f(R * 0.022)}" fill="${tone.rim}" opacity="0.55"/>`;
}

/**
 * Lit region for a phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter).
 * Northern-hemisphere view: waxing light grows from the right.
 */
export function litPath(phase, R) {
  const p = ((phase % 1) + 1) % 1;
  const a = Math.abs(Math.cos(p * Math.PI * 2)) * R;
  if (p < 0.5) {
    const sweep = p < 0.25 ? 0 : 1;
    return `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}A${f(a)} ${R} 0 0 ${sweep} 0 ${-R}Z`;
  }
  const sweep = p > 0.75 ? 1 : 0;
  return `M0 ${-R}A${R} ${R} 0 0 0 0 ${R}A${f(a)} ${R} 0 0 ${sweep} 0 ${-R}Z`;
}

const cache = new Map();

/**
 * SVG markup for the moon disc (viewBox -500..500, centred).
 * variant "normal": real phase, cold palette. variant "dark": swollen full moon, yellow-green.
 */
export function moonSvg({ phase = 0.5, R = 200, variant = "normal", uid = "m" } = {}) {
  const bucket = Math.round(phase * 400) / 400;
  const key = `${variant}:${bucket}:${R}:${uid}`;
  if (cache.has(key)) return cache.get(key);

  const dark = variant === "dark";
  const P = dark ? DARK : NORMAL;
  const ids = {
    lit: `${uid}-lit`,
    shade: `${uid}-shade`,
    disc: `${uid}-disc`,
    soft: `${uid}-soft`,
    mask: `${uid}-mask`,
    mottle: `${uid}-mottle`,
    blur: `${uid}-blur`
  };
  const lightSide = dark ? 0.3 : (bucket < 0.5 ? 0.35 : -0.35);
  const tone = dark
    ? { crater: rgb([24, 70, 30]), rim: rgb([246, 255, 214]), mare: rgb([92, 140, 60]) }
    : { crater: rgb([52, 80, 124]), rim: rgb(NORMAL.paper), mare: rgb([108, 138, 182]) };
  // Mottling colour as a feColorMatrix row (fractal noise red channel drives the alpha).
  const mottleRgb = (dark ? [60, 104, 44] : [90, 118, 160]).map((c) => (c / 255).toFixed(3));
  // A thin crescent stays crisp; a fat gibbous gets a soft terminator.
  const illum = dark ? 1 : (1 - Math.cos(bucket * Math.PI * 2)) / 2;
  const terminatorSoft = R * (0.004 + 0.016 * Math.min(1, illum * 4));
  const litFill = dark
    ? `<stop offset="0" stop-color="${rgb([246, 255, 196])}"/><stop offset="0.55" stop-color="${rgb(P.gold)}"/><stop offset="1" stop-color="${rgb([150, 214, 92])}"/>`
    : `<stop offset="0" stop-color="${rgb(NORMAL.paper)}"/><stop offset="0.6" stop-color="${rgb([214, 236, 252])}"/><stop offset="1" stop-color="${rgb([150, 190, 232])}"/>`;
  const shadeFill = dark
    ? `<stop offset="0" stop-color="${rgb([20, 58, 30])}"/><stop offset="1" stop-color="${rgb([4, 18, 9])}"/>`
    : `<stop offset="0" stop-color="${rgb([20, 46, 92])}"/><stop offset="1" stop-color="${rgb([5, 16, 40])}"/>`;

  const lit = dark ? `M0 ${-R}A${R} ${R} 0 1 1 0 ${R}A${R} ${R} 0 1 1 0 ${-R}Z` : litPath(bucket, R);
  const detail = surface(R, ids, tone);
  const rimColor = dark ? rgb(DARK.glow) : rgb(NORMAL.ice);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${ids.lit}" cx="${0.5 + lightSide}" cy="0.38" r="0.85">${litFill}</radialGradient>
    <radialGradient id="${ids.shade}" cx="0.6" cy="0.35" r="0.8">${shadeFill}</radialGradient>
    <clipPath id="${ids.disc}"><circle r="${R}"/></clipPath>
    <filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${f(terminatorSoft)}"/></filter>
    <filter id="${ids.blur}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(R * 0.035)}"/></filter>
    <filter id="${ids.mottle}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="${f(4.2 / R)}" numOctaves="3" seed="11"/>
      <feColorMatrix type="matrix" values="0 0 0 0 ${mottleRgb[0]} 0 0 0 0 ${mottleRgb[1]} 0 0 0 0 ${mottleRgb[2]} 2.2 0 0 0 -0.95"/>
    </filter>
    <mask id="${ids.mask}" maskUnits="userSpaceOnUse" x="${-R - 20}" y="${-R - 20}" width="${2 * R + 40}" height="${2 * R + 40}">
      <path d="${lit}" fill="#fff" filter="url(#${ids.soft})"/>
    </mask>
  </defs>
  <g clip-path="url(#${ids.disc})">
    <circle r="${R}" fill="url(#${ids.shade})"/>
    <g opacity="${dark ? 0.5 : 0.4}">${detail}</g>
    <g mask="url(#${ids.mask})">
      <circle r="${R}" fill="url(#${ids.lit})"/>
      <g>${detail}</g>
    </g>
  </g>
  <circle r="${R - 1}" fill="none" stroke="${rimColor}" stroke-opacity="${dark ? 0.55 : 0.32}" stroke-width="2"/>
</svg>`;
  cache.set(key, svg);
  return svg;
}
