// Glass fracture engine: rapid clicks crack an element along a Voronoi diagram, more
// clicks shatter it into the very same Voronoi cells. Also exports the shard engine
// (`shatterSurface`) and the crack layer (`createCracks`) so the intro can reuse them.
// Owner: HUD/overlays workstream (C).
import { EVT, emit, on, prefersReducedMotion, rafLoop, clamp } from "./core.js";
import { gsap } from "./motion.js";
import { sfx } from "./sfx.js";
import { createRng } from "./proc/rng.js";
import { impactSites, voronoiCells, cellEdges, clipPolygon, polygonArea, polygonCentroid } from "./proc/voronoi.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const IDLE_RESET_MS = 1350;
const STAGE_CLICKS = [5, 8, 10]; // clicks needed for crack stages 1, 2, 3
const BREAK_CLICKS = 12;
const STAGE_REVEAL = [0, 0.2, 0.5, 0.85]; // share of crack edges visible at each stage

export const FRACTURE_TARGETS = [
  ".content-card",
  ".menu-label",
  ".section-kicker",
  ".content-card h2",
  ".content-card > p",
  ".detail-list li",
  ".skill",
  ".project-card"
].join(", ");

/** Plates (not text): heavier cracks and card-like shard counts, cracks fill the plate. */
const LARGE_SURFACES = ".content-card, .skill, .detail-list li, .project-card";

/* ----------------------------------------------------------------- geometry */

/**
 * Untransformed layout box of an element in viewport space, plus its own transform,
 * so a fixed-position stage can sit exactly on top of it (ancestor transforms are
 * assumed to be at rest).
 */
function measure(element) {
  const rect = element.getBoundingClientRect();
  const cs = getComputedStyle(element);
  const w = element.offsetWidth || rect.width;
  const h = element.offsetHeight || rect.height;
  let matrix = new DOMMatrix();
  if (cs.transform && cs.transform !== "none") {
    try {
      matrix = new DOMMatrix(cs.transform);
    } catch {
      matrix = new DOMMatrix();
    }
  }
  const [ox, oy] = cs.transformOrigin.split(" ").map((v) => parseFloat(v) || 0);
  const hx = w / 2 - ox;
  const hy = h / 2 - oy;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const left = cx - ox - (matrix.a * hx + matrix.c * hy + matrix.e);
  const top = cy - oy - (matrix.b * hx + matrix.d * hy + matrix.f);
  const flat = matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && !matrix.e && !matrix.f;
  return {
    w,
    h,
    left,
    top,
    matrix,
    origin: [ox, oy],
    transform: flat ? "none" : `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`,
    borderLeft: parseFloat(cs.borderLeftWidth) || 0,
    borderTop: parseFloat(cs.borderTopWidth) || 0
  };
}

/** Viewport point -> element-local point (inverse of the element's own transform). */
function toLocal(geo, x, y) {
  const { a, b, c, d, e, f } = geo.matrix;
  const px = x - geo.left - geo.origin[0] - e;
  const py = y - geo.top - geo.origin[1] - f;
  const det = a * d - b * c || 1;
  return [(d * px - c * py) / det + geo.origin[0], (-b * px + a * py) / det + geo.origin[1]];
}

function bounds(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
}

/** Shard count by surface size: ~10-14 for labels, ~20-36 for cards. */
function shardCountFor(w, h, large = w * h >= 60000) {
  const area = w * h;
  if (!large) return Math.round(clamp(9 + area / 12000, 10, 14));
  return Math.round(clamp(14 + area / 15000, area < 60000 ? 16 : 20, 36));
}

const randomRng = () => createRng(Math.floor(Math.random() * 2 ** 31));

/* ------------------------------------------------------------- crack layer */

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** Slightly jagged path between two points (glass never cracks perfectly straight). */
function jaggedPath(a, b, rng) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = len > 46 ? 3 : len > 16 ? 2 : 1;
  const amp = Math.min(1.8, len * 0.05);
  let d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const off = (rng.next() * 2 - 1) * amp;
    d += ` L${(a[0] + dx * t + nx * off).toFixed(1)} ${(a[1] + dy * t + ny * off).toFixed(1)}`;
  }
  return `${d} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

const GLINT_PATH = "M0 -7 L1.1 -1.1 L7 0 L1.1 1.1 L0 7 L-1.1 1.1 L-7 0 L-1.1 -1.1 Z";

/**
 * Build a Voronoi crack layer for a width x height surface.
 * Returns { svg, cells, edges, impact, reveal(fraction, opts), revealAll(), count }.
 * `reveal` draws the next edges outward from the impact (stroke-dashoffset tweens).
 */
export function createCracks({ width, height, impact = [width / 2, height / 2], count, cells: givenCells, rng = randomRng(), large, weight = 1 } = {}) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const [ix, iy] = impact;
  const cells =
    givenCells ??
    voronoiCells(impactSites(rng, { width: w, height: h, x: ix, y: iy, count: count ?? shardCountFor(w, h) }), { x: 0, y: 0, width: w, height: h });
  const edges = cellEdges(cells, [ix, iy]);
  const isLarge = large ?? w * h > 60000;

  const svg = svgEl("svg", {
    class: "crack-layer",
    viewBox: `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false"
  });
  const gFacets = svgEl("g", { class: "crack-facets" });
  const gGlow = svgEl("g", { class: "crack-glow" });
  const gShadow = svgEl("g", { class: "crack-shadow", transform: "translate(0.7 0.9)" });
  const gLine = svgEl("g", { class: "crack-line" });
  const gGlint = svgEl("g", { class: "crack-glints" });
  svg.append(gFacets, gGlow, gShadow, gLine, gGlint);

  // Facets: a few cells near the impact catch the light (or darken), like chipped glass.
  const maxD = Math.hypot(Math.max(ix, w - ix), Math.max(iy, h - iy)) || 1;
  const facetEls = [];
  cells.forEach((cell) => {
    const dist = Math.hypot(cell.centroid[0] - ix, cell.centroid[1] - iy) / maxD;
    const roll = rng.next();
    if (roll < 0.45) return;
    const facet = svgEl("polygon", {
      points: cell.polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      class: roll < 0.78 ? "facet facet--light" : "facet facet--dark"
    });
    facet.style.opacity = "0";
    facet.dataset.dist = dist.toFixed(3);
    gFacets.appendChild(facet);
    facetEls.push({ el: facet, dist });
  });

  const edgeEls = edges.map((edge, index) => {
    // Draw from the end nearer the impact so cracks run outward.
    const da = Math.hypot(edge.a[0] - ix, edge.a[1] - iy);
    const db = Math.hypot(edge.b[0] - ix, edge.b[1] - iy);
    const [from, to] = da <= db ? [edge.a, edge.b] : [edge.b, edge.a];
    const d = jaggedPath(from, to, rng);
    const rank = index / Math.max(1, edges.length - 1);
    const width = ((isLarge ? 1.7 : 1.35) - rank * (isLarge ? 0.95 : 0.7)) * weight;
    const make = (parent, cls, strokeWidth) => {
      const path = svgEl("path", { d, class: cls, pathLength: "1" });
      path.style.strokeWidth = `${strokeWidth.toFixed(2)}px`;
      path.style.strokeDasharray = "1 1";
      path.style.strokeDashoffset = "1";
      parent.appendChild(path);
      return path;
    };
    const paths = [make(gShadow, "crack-path", width + 1.3), make(gLine, "crack-path", width)];
    if (rank < 0.3) paths.unshift(make(gGlow, "crack-path", width + 3.4));
    return { paths, to, rank, length: Math.hypot(to[0] - from[0], to[1] - from[1]) };
  });

  // Impact pock mark.
  const pock = svgEl("g", { class: "crack-impact", transform: `translate(${ix.toFixed(1)} ${iy.toFixed(1)})` });
  pock.append(svgEl("circle", { r: isLarge ? "5.5" : "4", class: "crack-impact-ring" }), svgEl("circle", { r: isLarge ? "1.9" : "1.4", class: "crack-impact-core" }));
  pock.style.opacity = "0";
  gGlint.appendChild(pock);

  let revealed = 0;
  const reducedNow = () => prefersReducedMotion();

  function glintAt(point, delay) {
    const glint = svgEl("path", { d: GLINT_PATH, class: "crack-glint" });
    glint.setAttribute("transform", `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})`);
    gGlint.appendChild(glint);
    if (reducedNow()) {
      glint.style.opacity = "0.7";
      return;
    }
    gsap.fromTo(
      glint,
      { opacity: 0, scale: 0.2, rotation: -45, transformOrigin: "50% 50%" },
      { opacity: 1, scale: 1.15, rotation: 0, duration: 0.16, delay, ease: "power3.out" }
    );
    gsap.to(glint, { opacity: 0.55, scale: 0.75, duration: 0.5, delay: delay + 0.16, ease: "power2.out" });
  }

  function reveal(fraction, { duration = 0.2, spread = 0.18, glints = 2 } = {}) {
    const target = Math.round(edges.length * clamp(fraction, 0, 1));
    if (target <= revealed) return 0;
    const batch = edgeEls.slice(revealed, target);
    const reduced = reducedNow();
    if (revealed === 0) {
      if (reduced) pock.style.opacity = "1";
      else gsap.fromTo(pock, { opacity: 0, scale: 2.2, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.18, ease: "power3.out" });
    }
    batch.forEach((edge, i) => {
      const delay = batch.length > 1 ? (i / (batch.length - 1)) * spread : 0;
      if (reduced) {
        edge.paths.forEach((p) => (p.style.strokeDashoffset = "0"));
      } else {
        const dur = duration * (0.6 + Math.min(1, edge.length / 120) * 0.6);
        gsap.to(edge.paths, { strokeDashoffset: 0, duration: dur, delay, ease: "power2.out", overwrite: true });
      }
    });
    // Glints sparkle on a couple of the new crack tips.
    const picks = batch.filter((_, i) => i % Math.max(1, Math.floor(batch.length / glints)) === 0).slice(0, glints);
    picks.forEach((edge, i) => glintAt(edge.to, (i / Math.max(1, picks.length)) * spread + 0.06));
    // Facets inside the revealed radius light up.
    const radius = target >= edges.length ? 2 : (edges[target - 1]?.distance ?? 0) / maxD;
    facetEls.forEach((facet) => {
      if (facet.on || facet.dist > radius) return;
      facet.on = true;
      if (reduced) facet.el.style.opacity = "1";
      else gsap.to(facet.el, { opacity: 1, duration: 0.3, delay: spread * 0.5, ease: "power1.out" });
    });
    const added = target - revealed;
    revealed = target;
    return added;
  }

  return {
    svg,
    cells,
    edges,
    impact: [ix, iy],
    get revealed() {
      return revealed;
    },
    reveal,
    revealAll: (opts) => reveal(1, opts),
    /** Every edge and facet visible right now, without animation. */
    showAll() {
      gsap.killTweensOf(svg.querySelectorAll("*"));
      edgeEls.forEach((edge) => edge.paths.forEach((p) => (p.style.strokeDashoffset = "0")));
      facetEls.forEach((facet) => {
        facet.on = true;
        facet.el.style.opacity = "1";
      });
      svg.querySelectorAll(".crack-glint").forEach((g) => (g.style.opacity = "0.6"));
      pock.style.opacity = "1";
      revealed = edges.length;
    },
    /**
     * Merge every visible crack into a handful of paths (one per layer and stroke width).
     * Used right before cloning the surface into shards, so each clone stays light.
     */
    flatten() {
      gsap.killTweensOf(svg.querySelectorAll("*"));
      const merge = (group) => {
        const buckets = new Map();
        group.querySelectorAll(".crack-path").forEach((path) => {
          if (parseFloat(path.style.strokeDashoffset) > 0.001) return;
          const width = (Math.round(parseFloat(path.style.strokeWidth) * 4) / 4).toFixed(2);
          if (!buckets.has(width)) buckets.set(width, []);
          buckets.get(width).push(path.getAttribute("d"));
        });
        group.replaceChildren(
          ...[...buckets].map(([width, ds]) => {
            const merged = svgEl("path", { d: ds.join(" "), class: "crack-path" });
            merged.style.strokeWidth = `${width}px`;
            return merged;
          })
        );
      };
      merge(gGlow);
      merge(gShadow);
      merge(gLine);
      const facetPath = (cls) =>
        facetEls
          .filter((f) => f.on && f.el.classList.contains(cls))
          .map((f) => `M${f.el.getAttribute("points").replace(/ /g, " L")} Z`)
          .join(" ");
      const light = facetPath("facet--light");
      const dark = facetPath("facet--dark");
      gFacets.replaceChildren();
      if (light) gFacets.appendChild(svgEl("path", { d: light, class: "facet facet--light" }));
      if (dark) gFacets.appendChild(svgEl("path", { d: dark, class: "facet facet--dark" }));
      facetEls.length = 0;
      edgeEls.length = 0;
    },
    kill() {
      gsap.killTweensOf(svg.querySelectorAll("*"));
    }
  };
}

/* ------------------------------------------------------------ shard engine */

// Computed styles copied onto clones so they look identical outside their context
// (selectors such as `.content-card h2` no longer match once a clone lives in <body>).
const COPY_PROPS = [
  "display", "box-sizing", "width", "height", "min-width", "min-height", "max-width",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "position", "top", "right", "bottom", "left", "z-index", "float",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "order",
  "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self",
  "grid-template-columns", "grid-template-rows", "grid-column-start", "grid-column-end",
  "grid-row-start", "grid-row-end", "row-gap", "column-gap", "place-items",
  "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant-numeric",
  "font-feature-settings", "line-height", "letter-spacing", "word-spacing", "text-transform",
  "text-align", "text-indent", "text-decoration-line", "text-decoration-color", "text-shadow",
  "white-space", "overflow-wrap", "vertical-align", "list-style-type", "color",
  "background-color", "background-image", "background-size", "background-position",
  "background-repeat", "background-clip", "box-shadow", "clip-path", "opacity",
  "overflow-x", "overflow-y", "transform", "transform-origin", "isolation", "mix-blend-mode",
  "object-fit", "fill", "stroke", "stroke-width"
];

const SVG_PROPS = ["fill", "stroke", "stroke-width", "stroke-opacity", "fill-opacity", "opacity", "color", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "display", "visibility"];

function styleText(cs, props) {
  let text = "";
  for (const prop of props) {
    const value = cs.getPropertyValue(prop);
    if (value) text += `${prop}:${value};`;
  }
  // Text stroke / fill colour are inherited by pseudo-elements: only pin them when they
  // really differ from the defaults, or a faint ::before watermark would turn opaque.
  const strokeWidth = cs.getPropertyValue("-webkit-text-stroke-width");
  if (strokeWidth && parseFloat(strokeWidth) > 0) {
    text += `-webkit-text-stroke-width:${strokeWidth};-webkit-text-stroke-color:${cs.getPropertyValue("-webkit-text-stroke-color")};`;
  }
  const fill = cs.getPropertyValue("-webkit-text-fill-color");
  if (fill && fill !== cs.color) text += `-webkit-text-fill-color:${fill};`;
  return text;
}

/** The element's own clip-path as a polygon in local pixels (null if not a polygon). */
function clipPolygonOf(element, w, h) {
  const value = getComputedStyle(element).clipPath;
  const match = /^polygon\((.*)\)$/.exec(value || "");
  if (!match) return null;
  const toPx = (token, size) => {
    if (token.endsWith("%")) return (parseFloat(token) / 100) * size;
    if (token.endsWith("px") || /^-?[\d.]+$/.test(token)) return parseFloat(token);
    return NaN;
  };
  const body = match[1].replace(/^(nonzero|evenodd)\s*,\s*/, "");
  const points = body.split(",").map((pair) => {
    const [x, y] = pair.trim().split(/\s+/);
    return [toPx(x ?? "", w), toPx(y ?? "", h)];
  });
  if (points.length < 3 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  return points;
}

/** Intersect a cell with a convex polygon (Sutherland-Hodgman, one edge at a time). */
function intersectConvex(poly, clip) {
  const [cx, cy] = polygonCentroid(clip);
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i += 1) {
    const p = clip[i];
    const q = clip[(i + 1) % clip.length];
    const nx = q[1] - p[1];
    const ny = -(q[0] - p[0]);
    const inside = nx * (cx - p[0]) + ny * (cy - p[1]) >= 0;
    out = inside ? clipPolygon(out, -nx, -ny, -(nx * p[0] + ny * p[1])) : clipPolygon(out, nx, ny, nx * p[0] + ny * p[1]);
  }
  return out;
}

/** True when segment a-b lies on the line through p-q (within about half a pixel). */
function onLine(a, b, p, q) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  const dist = (pt) => Math.abs(dy * (pt[0] - p[0]) - dx * (pt[1] - p[1])) / len;
  return dist(a) < 0.6 && dist(b) < 0.6;
}

/** Deep clone with computed styles inlined, ids stripped, inert and hidden from AT. */
function snapshotClone(element, w, h) {
  const clone = element.cloneNode(true);
  const src = [element, ...element.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < src.length && i < dst.length; i += 1) {
    const s = src[i];
    const d = dst[i];
    d.removeAttribute("id");
    const cs = getComputedStyle(s);
    const isSvgChild = s instanceof SVGElement && !(s instanceof SVGSVGElement);
    let text = styleText(cs, isSvgChild ? SVG_PROPS : COPY_PROPS);
    if (!isSvgChild && i > 0 && cs.visibility === "hidden") text += "visibility:hidden;";
    d.style.cssText = `${text}animation:none;transition:none;`;
  }
  clone.classList.remove("glass-broken", "glass-breaking", "crack-1", "crack-2", "crack-3");
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  const display = getComputedStyle(element).display;
  clone.style.position = "absolute";
  clone.style.display = display === "inline" ? "inline-block" : display;
  clone.style.width = `${w}px`;
  clone.style.height = `${h}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.translate = "none";
  clone.style.rotate = "none";
  clone.style.scale = "none";
  clone.style.visibility = "visible";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  return clone;
}

const shardSets = new Set();
let stopShardLoop = null;

function finishSet(set) {
  if (!shardSets.has(set)) return;
  shardSets.delete(set);
  set.stage.remove();
  set.resolve();
}

function stepShards(dt) {
  for (const set of shardSets) {
    set.time += dt * set.speed;
    const t0 = set.time;
    let alive = false;
    for (const s of set.shards) {
      const t = t0 - s.delay;
      if (t <= 0) {
        alive = true;
        continue;
      }
      if (t >= s.life) {
        if (!s.dead) {
          s.dead = true;
          s.el.style.opacity = "0";
        }
        continue;
      }
      alive = true;
      // Closed-form ballistic motion with light air drag: frame-rate independent.
      const dragX = (1 - Math.exp(-set.drag * t)) / set.drag;
      const x = s.vx * dragX;
      const y = s.vy * dragX + 0.5 * set.gravity * t * t;
      const z = s.vz * dragX;
      const k = t / s.life;
      const fade = k < 0.5 ? 1 : 1 - Math.pow((k - 0.5) / 0.5, 1.6);
      s.el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(1)}px) ` +
        `rotateX(${(s.wx * t).toFixed(1)}deg) rotateY(${(s.wy * t).toFixed(1)}deg) rotateZ(${(s.wz * t).toFixed(1)}deg)`;
      s.el.style.opacity = fade.toFixed(3);
    }
    if (!alive) finishSet(set);
  }
  if (!shardSets.size && stopShardLoop) {
    stopShardLoop();
    stopShardLoop = null;
  }
}

/**
 * Break `element` into Voronoi shards that fly away with simple physics.
 * The element itself is left untouched (callers hide it). Options:
 *   x, y        impact point in viewport coordinates (default: centre)
 *   count       number of shards (default: by size)
 *   cells       precomputed Voronoi cells in element-local pixels
 *   impact      impact point in element-local pixels (overrides x/y)
 *   power       velocity multiplier (default 1)
 *   gravity     px/s^2 (default 2600)
 *   life        seconds each shard lives (default 1.1)
 *   zIndex      stage z-index (default var(--z-shards))
 * Returns { stage, done: Promise, hurry(factor), kill() }.
 */
export function shatterSurface(element, opts = {}) {
  const geo = opts.geo ?? measure(element);
  const { w, h } = geo;
  const impact = opts.impact ?? (Number.isFinite(opts.x) && Number.isFinite(opts.y) ? toLocal(geo, opts.x, opts.y) : [w / 2, h / 2]);
  impact[0] = clamp(impact[0], 1, w - 1);
  impact[1] = clamp(impact[1], 1, h - 1);
  const rng = randomRng();
  const cells =
    opts.cells ??
    voronoiCells(impactSites(rng, { width: w, height: h, x: impact[0], y: impact[1], count: opts.count ?? shardCountFor(w, h) }), { x: 0, y: 0, width: w, height: h });

  const stage = document.createElement("div");
  stage.className = "shard-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText =
    `left:${geo.left.toFixed(2)}px;top:${geo.top.toFixed(2)}px;width:${w}px;height:${h}px;` +
    `transform:${geo.transform};transform-origin:${geo.origin[0]}px ${geo.origin[1]}px;` +
    (opts.zIndex != null ? `z-index:${opts.zIndex};` : "");

  const template = snapshotClone(element, w, h);
  const diag = Math.hypot(w, h);
  // Shards follow the element's own silhouette (cards are clipped polygons) and only the
  // broken edges get a highlight, never the original outline.
  const box4 = [[0, 0], [w, 0], [w, h], [0, h]];
  const outline = clipPolygonOf(element, w, h) ?? box4;
  const outerLines = [...outline, ...box4].map((p, i, all) => {
    const ring = i < outline.length ? outline : box4;
    const j = i < outline.length ? i : i - outline.length;
    return [p, ring[(j + 1) % ring.length]];
  });
  const power = opts.power ?? 1;
  const shards = [];
  const fragment = document.createDocumentFragment();

  cells.forEach((rawCell) => {
    const polygon = outline === box4 ? rawCell.polygon : intersectConvex(rawCell.polygon, outline);
    if (polygon.length < 3 || polygonArea(polygon) < 4) return;
    const cell = { polygon, centroid: polygonCentroid(polygon), area: polygonArea(polygon) };
    const box = bounds(cell.polygon);
    if (box.w < 1 || box.h < 1) return;
    const local = cell.polygon.map(([x, y]) => [x - box.x, y - box.y]);
    const shard = document.createElement("div");
    shard.className = "shard";
    const [cx, cy] = cell.centroid;
    shard.style.cssText =
      `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;` +
      `clip-path:polygon(${local.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(",")});` +
      `transform-origin:${(cx - box.x).toFixed(1)}px ${(cy - box.y).toFixed(1)}px;` +
      `--sheen:${Math.round(100 + Math.random() * 80)}deg;--sheen-a:${(0.06 + Math.random() * 0.14).toFixed(2)};`;

    const inner = template.cloneNode(true);
    inner.style.left = `${-box.x}px`;
    inner.style.top = `${-box.y}px`;
    shard.appendChild(inner);

    let edgePath = "";
    for (let i = 0; i < local.length; i += 1) {
      const a = cell.polygon[i];
      const b = cell.polygon[(i + 1) % cell.polygon.length];
      if (outerLines.some(([p, q]) => onLine(a, b, p, q))) continue;
      edgePath += `M${local[i][0].toFixed(1)} ${local[i][1].toFixed(1)} L${local[(i + 1) % local.length][0].toFixed(1)} ${local[(i + 1) % local.length][1].toFixed(1)} `;
    }
    if (edgePath) {
      const edge = svgEl("svg", { class: "shard-edge", viewBox: `0 0 ${box.w} ${box.h}`, width: box.w, height: box.h });
      edge.appendChild(svgEl("path", { d: edgePath }));
      shard.appendChild(edge);
    }
    fragment.appendChild(shard);

    // Velocity away from the impact; shards near it fly faster and break first.
    let dx = cx - impact[0];
    let dy = cy - impact[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else {
      dx /= dist;
      dy /= dist;
    }
    const near = Math.exp(-dist / (diag * 0.32));
    const speed = power * (opts.baseSpeed ?? 160 + diag * 0.18) * (0.55 + near * 1.1) * (0.8 + Math.random() * 0.4);
    const size = Math.sqrt(cell.area) || 1;
    const spin = clamp(70 / size, 0.6, 2.6);
    shards.push({
      el: shard,
      delay: (dist / diag) * (opts.ripple ?? 0.14),
      life: (opts.life ?? 1.1) * (0.85 + Math.random() * 0.3),
      vx: dx * speed + (Math.random() * 2 - 1) * 40 * power,
      vy: dy * speed * 0.75 - (60 + Math.random() * 140) * power,
      vz: (Math.random() * 2 - 0.6) * 260 * power,
      wx: (Math.random() * 2 - 1) * 320 * spin,
      wy: (Math.random() * 2 - 1) * 320 * spin,
      wz: (Math.random() * 2 - 1) * 260 * spin,
      dead: false
    });
  });

  stage.appendChild(fragment);
  (opts.parent ?? document.body).appendChild(stage);

  let resolve;
  const done = new Promise((r) => (resolve = r));
  const set = { stage, shards, time: 0, speed: 1, gravity: opts.gravity ?? 2600, drag: opts.drag ?? 1.1, resolve };
  shardSets.add(set);
  if (!stopShardLoop) stopShardLoop = rafLoop(stepShards);
  // Paint the first frame synchronously so there is never a gap between hiding the
  // source and the shards appearing.
  stepShards(0);

  return {
    stage,
    cells,
    done,
    hurry(factor = 3) {
      set.speed = Math.max(set.speed, factor);
    },
    kill() {
      finishSet(set);
    }
  };
}

/* --------------------------------------------------------- fracture state */

const records = new WeakMap();
const dirty = new Set();
const handledEvents = new WeakSet();

function recordFor(element) {
  let rec = records.get(element);
  if (!rec) {
    rec = { clicks: 0, last: 0, timer: 0, stage: 0, cracks: null, broken: false };
    records.set(element, rec);
  }
  return rec;
}

function jolt(element, amount) {
  if (prefersReducedMotion() || !element.animate) return;
  const a = amount;
  element.animate(
    [
      { translate: "0 0" },
      { translate: `${-a}px ${a * 0.5}px` },
      { translate: `${a * 0.8}px ${-a * 0.4}px` },
      { translate: `${-a * 0.35}px ${a * 0.2}px` },
      { translate: "0 0" }
    ],
    { duration: 150, easing: "linear" }
  );
}

function shakeShell() {
  if (prefersReducedMotion()) return;
  const shell = document.querySelector(".shell");
  shell?.animate?.(
    [
      { translate: "0 0" },
      { translate: "-6px 3px" },
      { translate: "5px -3px" },
      { translate: "-3px 2px" },
      { translate: "2px -1px" },
      { translate: "0 0" }
    ],
    { duration: 210, easing: "linear" }
  );
}

function clearCracks(element, rec, { fade = false } = {}) {
  const layer = rec.cracks?.svg;
  rec.cracks?.kill();
  rec.cracks = null;
  rec.stage = 0;
  element.classList.remove("crack-1", "crack-2", "crack-3");
  if (!layer) return;
  if (fade && !prefersReducedMotion() && layer.isConnected) {
    gsap.to(layer, { opacity: 0, duration: 0.32, ease: "power1.in", onComplete: () => layer.remove() });
  } else {
    layer.remove();
  }
}

function ensureCracks(element, rec, clientX, clientY) {
  if (rec.cracks && rec.cracks.svg.isConnected) return rec.cracks;
  const geo = measure(element);
  const impact = Number.isFinite(clientX) ? toLocal(geo, clientX, clientY) : [geo.w / 2, geo.h / 2];
  impact[0] = clamp(impact[0], 2, geo.w - 2);
  impact[1] = clamp(impact[1], 2, geo.h - 2);
  const large = element.matches(LARGE_SURFACES);
  rec.cracks = createCracks({ width: geo.w, height: geo.h, impact, large, count: shardCountFor(geo.w, geo.h, large) });
  rec.size = [geo.w, geo.h];
  const svg = rec.cracks.svg;
  svg.classList.add("crack-overlay");
  svg.style.left = `${-geo.borderLeft}px`;
  svg.style.top = `${-geo.borderTop}px`;
  svg.style.width = `${geo.w}px`;
  svg.style.height = `${geo.h}px`;
  element.appendChild(svg);
  dirty.add(element);
  return rec.cracks;
}

function crackTo(element, rec, stage, clientX, clientY) {
  const cracks = ensureCracks(element, rec, clientX, clientY);
  cracks.reveal(STAGE_REVEAL[stage], { duration: 0.16 + stage * 0.03, spread: 0.12 + stage * 0.04, glints: stage === 1 ? 1 : 2 });
  rec.stage = stage;
  element.classList.remove("crack-1", "crack-2", "crack-3");
  element.classList.add(`crack-${stage}`);
  sfx.crack(stage);
  jolt(element, stage + 0.5);
  emit(EVT.GLASS_CRACK, { element, stage });
}

function scheduleIdleReset(element, rec) {
  window.clearTimeout(rec.timer);
  rec.timer = window.setTimeout(() => {
    if (rec.broken) return;
    rec.clicks = 0;
    clearCracks(element, rec, { fade: true });
  }, IDLE_RESET_MS + 260);
}

function disableBrokenTarget(element) {
  const parentButton = element.closest(".menu-item");
  if (!parentButton) return;
  parentButton.disabled = true;
  parentButton.classList.add("is-shattered");
  parentButton.setAttribute("aria-disabled", "true");
  // The menu marks the open section with aria-current (menu.js re-syncs on GLASS_BREAK).
  parentButton.removeAttribute("aria-current");
}

/** Shatter an element immediately. x/y are viewport coordinates of the impact. */
export function shatter(element, { x, y } = {}) {
  if (!element) return;
  const rec = recordFor(element);
  if (rec.broken || element.classList.contains("glass-broken")) return;
  rec.broken = true;
  window.clearTimeout(rec.timer);
  dirty.add(element);

  const rect = element.getBoundingClientRect();
  const hitX = Number.isFinite(x) ? x : rect.left + rect.width / 2;
  const hitY = Number.isFinite(y) ? y : rect.top + rect.height / 2;
  const cracks = ensureCracks(element, rec, hitX, hitY);

  sfx.glass();
  disableBrokenTarget(element);

  if (prefersReducedMotion()) {
    // Calm version: the cracks complete, then the pane fades away. No flying glass.
    cracks.revealAll();
    element.classList.add("glass-breaking");
    const fade = element.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 180, easing: "ease-in", fill: "forwards" });
    const finish = () => {
      if (!rec.broken) return;
      element.classList.remove("glass-breaking");
      element.classList.add("glass-broken");
      fade?.cancel();
    };
    if (fade) fade.onfinish = finish;
    else finish();
  } else {
    cracks.showAll();
    cracks.flatten();
    const size = rec.size ?? [element.offsetWidth, element.offsetHeight];
    const sameSize = Math.abs(size[0] - element.offsetWidth) < 2 && Math.abs(size[1] - element.offsetHeight) < 2;
    shatterSurface(element, { impact: [...cracks.impact], cells: sameSize ? cracks.cells : undefined });
    element.classList.add("glass-broken");
    shakeShell();
  }

  element.setAttribute("aria-hidden", "true");
  emit(EVT.GLASS_BREAK, { element, x: hitX, y: hitY });
}

function handleFractureClick(event) {
  const element = event.currentTarget;
  const rec = recordFor(element);

  if (rec.broken || element.classList.contains("glass-broken")) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // Nested glass (a paragraph inside a card): the innermost target takes the click.
  if (handledEvents.has(event)) return;
  handledEvents.add(event);

  // Cracks whose element was re-rendered underneath them start over.
  if (rec.cracks && !rec.cracks.svg.isConnected) clearCracks(element, rec);

  const now = performance.now();
  rec.clicks = now - rec.last > IDLE_RESET_MS ? 1 : rec.clicks + 1;
  rec.last = now;
  scheduleIdleReset(element, rec);

  if (rec.clicks < STAGE_CLICKS[0]) return;

  // From here on the clicks belong to the glass, not to whatever the element does.
  event.preventDefault();
  if (element.classList.contains("menu-label")) event.stopPropagation();

  const pointer = event.detail > 0 ? [event.clientX, event.clientY] : [undefined, undefined];

  if (rec.clicks >= BREAK_CLICKS) {
    shatter(element, { x: pointer[0], y: pointer[1] });
    return;
  }

  const stage = rec.clicks >= STAGE_CLICKS[2] ? 3 : rec.clicks >= STAGE_CLICKS[1] ? 2 : 1;
  if (stage > rec.stage) crackTo(element, rec, stage, pointer[0], pointer[1]);
  else jolt(element, 1);
}

/** Make every fracturable element under `root` respond to rapid clicks. Idempotent. */
export function makeFracturable(root = document) {
  const attach = (element) => {
    if (element.dataset.fractureReady === "true" || element.closest(".shard-stage")) return;
    element.dataset.fractureReady = "true";
    element.classList.add("glass-fracture");
    element.addEventListener("click", handleFractureClick);
  };
  root.querySelectorAll(FRACTURE_TARGETS).forEach(attach);
  if (root !== document && root.matches?.(FRACTURE_TARGETS)) attach(root);
}

/** Repair everything: cracks, broken elements, disabled menu items, stray shards. */
export function resetAllFractures() {
  for (const set of [...shardSets]) finishSet(set);
  dirty.forEach((element) => {
    const rec = recordFor(element);
    const wasBroken = rec.broken || element.classList.contains("glass-broken");
    window.clearTimeout(rec.timer);
    rec.clicks = 0;
    rec.last = 0;
    rec.broken = false;
    clearCracks(element, rec);
    element.getAnimations?.().forEach((anim) => anim.cancel());
    element.classList.remove("glass-broken", "glass-breaking");
    element.removeAttribute("aria-hidden");
    if (wasBroken && element.isConnected && element.animate) {
      // The pane re-forms with a short fade.
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: prefersReducedMotion() ? 160 : 280, easing: "ease-out" });
    }
  });
  dirty.clear();
  document.querySelectorAll(".menu-item.is-shattered, .menu-item[aria-disabled='true']").forEach((button) => {
    button.disabled = false;
    button.classList.remove("is-shattered");
    button.removeAttribute("aria-disabled");
  });
}

export function init() {
  makeFracturable(document);
  on(EVT.RESET, resetAllFractures);
}
