// Procedural bug sprites for the Debug Battle: a glitchy beetle body, legs, antennae and
// one motif per bug type (split, needle, box, extra leg, void, noodles). Pure SVG strings,
// seeded by the bug id and memoized. Colours come from CSS classes (tokens), so the Dark
// Hour palette applies without a second set.
import { createRng } from "../proc/rng.js";

const f = (n) => Number(n.toFixed(1));
const cache = new Map();

/** Smooth closed blob through jittered points on an ellipse (quadratic midpoints). */
function blob(rng, cx, cy, rx, ry, jitter = 0.18, points = 10) {
  const pts = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 - jitter / 2 + rng.next() * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[points - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < points; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % points]);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

function legs(rng, { left = 3, right = 3 } = {}) {
  let d = "";
  const side = (s, count) => {
    for (let i = 0; i < count; i += 1) {
      const y = -10 + (i * 48) / Math.max(1, count - 1) + rng.range(-3, 3);
      const kx = s * rng.range(74, 84);
      const ky = y - rng.range(10, 18);
      const fx = s * rng.range(92, 104);
      const fy = y + rng.range(18, 30);
      d += `M${f(s * 40)} ${f(y)}L${f(kx)} ${f(ky)}L${f(fx)} ${f(fy)}`;
    }
  };
  side(-1, left);
  side(1, right);
  return `<path class="bg-leg" d="${d}"/>`;
}

function antennae(rng) {
  const tip = (s) => [s * rng.range(28, 40), rng.range(-104, -96)];
  const [lx, ly] = tip(-1);
  const [rx, ry] = tip(1);
  return `<path class="bg-leg" d="M-8 -70Q${f(lx * 0.3)} -96 ${f(lx)} ${f(ly)}M8 -70Q${f(rx * 0.3)} -96 ${f(rx)} ${f(ry)}"/>
    <circle class="bg-eye" cx="${f(lx)}" cy="${f(ly)}" r="3.5"/><circle class="bg-eye" cx="${f(rx)}" cy="${f(ry)}" r="3.5"/>`;
}

function glitch(rng, count = 5) {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const w = rng.range(18, 60);
    const x = rng.range(-90, 90 - w);
    const y = rng.range(-70, 70);
    out += `<rect class="${i % 2 ? "bg-glitch-b" : "bg-glitch-a"}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(rng.range(2, 5))}"/>`;
  }
  return out;
}

function head(rng) {
  return `<path class="bg-shell" d="${blob(rng, 0, -50, 26, 22, 0.14, 8)}"/>
    <circle class="bg-eye" cx="-10" cy="-52" r="4.5"/><circle class="bg-eye" cx="10" cy="-52" r="4.5"/>`;
}

function body(rng) {
  const shell = blob(rng, 0, 14, 50, 58, 0.16, 11);
  return `<path class="bg-body" d="${shell}"/>
    <path class="bg-seam" d="M0 -40V70"/>`;
}

const MOTIFS = {
  // Merge Conflict: two out-of-sync copies of itself and conflict markers.
  split(rng) {
    const shell = blob(rng, 0, 14, 50, 58, 0.16, 11);
    return `<path class="bg-ghost-a" d="${shell}" transform="translate(-9 -3)"/>
      <path class="bg-ghost-b" d="${shell}" transform="translate(9 3)"/>
      ${legs(rng)}${body(rng)}${head(rng)}${antennae(rng)}
      <text class="bg-mark" x="-108" y="-34">&lt;&lt;&lt;&lt;</text>
      <text class="bg-mark" x="62" y="86">&gt;&gt;&gt;&gt;</text>`;
  },
  // SQL Injection: a long needle and a stray quote.
  needle(rng) {
    return `${legs(rng)}${body(rng)}
      <path class="bg-needle" d="M0 -66L0 -118"/><path class="bg-eye" d="M-4 -112L0 -124L4 -112Z"/>
      ${head(rng)}<text class="bg-mark bg-mark--big" x="40" y="-62">';</text>`;
  },
  // Works On My Machine: a boxy shell with a tiny screen.
  box(rng) {
    return `${legs(rng)}
      <path class="bg-body" d="M-52 -34L50 -40L56 70L-48 74Z"/>
      <path class="bg-shell" d="M-30 -18L28 -22L31 30L-27 33Z"/>
      <path class="bg-seam" d="M-22 -6H20M-22 6H10M-22 18H16"/>
      ${head(rng)}${antennae(rng)}`;
  },
  // Off-by-One: one leg too many on one side.
  extra(rng) {
    return `${legs(rng, { left: 3, right: 4 })}${body(rng)}${head(rng)}${antennae(rng)}
      <text class="bg-mark bg-mark--big" x="58" y="-58">+1</text>`;
  },
  // NullPointerException: nothing inside, only an outline and a pointer.
  void(rng) {
    const shell = blob(rng, 0, 14, 50, 58, 0.16, 11);
    return `${legs(rng)}<path class="bg-void" d="${shell}"/>
      <text class="bg-mark" x="-20" y="20">null</text>
      <path class="bg-needle" d="M70 -20L40 4M40 4L52 2M40 4L44 -8"/>
      ${head(rng)}${antennae(rng)}`;
  },
  // Spaghetti Script: tangled strands looping around the body.
  noodle(rng) {
    let strands = "";
    for (let i = 0; i < 6; i += 1) {
      const p = () => `${f(rng.range(-96, 96))} ${f(rng.range(-80, 92))}`;
      strands += `M${p()}C${p()} ${p()} ${p()}S${p()} ${p()}`;
    }
    return `${legs(rng)}${body(rng)}${head(rng)}${antennae(rng)}<path class="bg-noodle" d="${strands}"/>`;
  }
};

/** SVG markup for a bug sprite (viewBox -120..120). */
export function bugSvg(bug) {
  if (cache.has(bug.id)) return cache.get(bug.id);
  const rng = createRng(`bug:${bug.id}`);
  const motif = (MOTIFS[bug.motif] ?? MOTIFS.extra)(rng.fork("motif"));
  const svg = `<svg class="bug-sprite bug-sprite--${bug.motif}" viewBox="-120 -130 240 240" aria-hidden="true" focusable="false">
    <ellipse class="bg-shadow" cx="0" cy="96" rx="78" ry="10"/>
    <g class="bg-figure">${motif}${glitch(rng.fork("glitch"))}</g>
  </svg>`;
  cache.set(bug.id, svg);
  return svg;
}
