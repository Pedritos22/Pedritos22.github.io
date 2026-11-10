// Voronoi fracture toolkit used by the shatter engine (cracks + shards) and the intro.
// Cells are computed by clipping the bounds polygon with the perpendicular bisector
// half-plane of every other site: O(n^2), which is fast for the n <= 64 we use.
//
// Coordinates are plain numbers in whatever space you pass in (usually element pixels).
// A polygon is an array of [x, y] points in order.

const EPS = 1e-9;

/** Keep the part of `poly` where a*x + b*y <= c (Sutherland-Hodgman, one plane). */
export function clipPolygon(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const dp = a * p[0] + b * p[1] - c;
    const dq = a * q[0] + b * q[1] - c;
    const pIn = dp <= EPS;
    const qIn = dq <= EPS;
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export function rectPolygon(x, y, width, height) {
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
}

export function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function polygonCentroid(poly) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < EPS) {
    const sx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const sy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return [sx, sy];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Voronoi cells of `sites` inside `bounds` (polygon, or {x, y, width, height}).
 * Returns [{ index, site: [x, y], polygon, centroid, area }], skipping empty cells.
 */
export function voronoiCells(sites, bounds) {
  const boundsPoly = Array.isArray(bounds)
    ? bounds
    : rectPolygon(bounds.x ?? 0, bounds.y ?? 0, bounds.width, bounds.height);

  const cells = [];
  const same = (p, q) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
  for (let i = 0; i < sites.length; i += 1) {
    const [xi, yi] = sites[i];
    // A duplicate of an earlier site would claim the same region twice: skip it.
    let duplicate = false;
    for (let j = 0; j < i && !duplicate; j += 1) duplicate = same(sites[i], sites[j]);
    if (duplicate) continue;
    let poly = boundsPoly;
    for (let j = 0; j < sites.length && poly.length; j += 1) {
      if (i === j) continue;
      const [xj, yj] = sites[j];
      if (same(sites[i], sites[j])) continue;
      // Points closer to i than j: (xj - xi) x + (yj - yi) y <= (|j|^2 - |i|^2) / 2
      poly = clipPolygon(poly, xj - xi, yj - yi, (xj * xj + yj * yj - xi * xi - yi * yi) / 2);
    }
    if (poly.length >= 3) {
      const area = polygonArea(poly);
      if (area > EPS) cells.push({ index: i, site: sites[i], polygon: poly, centroid: polygonCentroid(poly), area });
    }
  }
  return cells;
}

/**
 * Sites concentrated around an impact point, like real glass: small shards near the
 * hit, larger ones further away. `rng` must expose next() (see createRng).
 */
export function impactSites(rng, { width, height, x = width / 2, y = height / 2, count = 28, focus = 0.62, ring = 0.18 }) {
  const sites = [];
  const maxR = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const focused = Math.round(count * focus);
  const inside = (px, py) => px > 0.5 && px < width - 0.5 && py > 0.5 && py < height - 0.5;
  for (let i = 0; i < count; i += 1) {
    let px = -1;
    let py = -1;
    // Rejection-sample instead of clamping: clamped points pile up on edges/corners and
    // produce duplicate sites.
    for (let attempt = 0; attempt < 12 && !inside(px, py); attempt += 1) {
      if (i < focused) {
        // Polar distribution biased to the centre: r = maxR * u^1.8
        const angle = rng.next() * Math.PI * 2;
        const r = maxR * (ring * 0.25 + Math.pow(rng.next(), 1.8) * (1 - ring * 0.25));
        px = x + Math.cos(angle) * r;
        py = y + Math.sin(angle) * r;
      } else {
        px = rng.next() * width;
        py = rng.next() * height;
      }
    }
    if (!inside(px, py)) {
      px = 0.5 + rng.next() * (width - 1);
      py = 0.5 + rng.next() * (height - 1);
    }
    sites.push([px, py]);
  }
  return sites;
}

/**
 * Unique interior edges of a cell set (shared borders only, bounds edges dropped),
 * sorted by distance from `origin` so cracks can be revealed outward from the impact.
 * Returns [{ a: [x, y], b: [x, y], distance }].
 */
export function cellEdges(cells, origin = [0, 0], { precision = 1 } = {}) {
  const key = ([x, y]) => `${Math.round(x / precision)},${Math.round(y / precision)}`;
  const seen = new Map();
  for (const cell of cells) {
    const poly = cell.polygon;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const entry = seen.get(k);
      if (entry) entry.count += 1;
      else seen.set(k, { a, b, count: 1 });
    }
  }
  const edges = [];
  for (const { a, b, count } of seen.values()) {
    if (count < 2) continue; // outer boundary
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    edges.push({ a, b, distance: Math.hypot(mx - origin[0], my - origin[1]) });
  }
  return edges.sort((e1, e2) => e1.distance - e2.distance);
}

/** CSS clip-path polygon() for a polygon in a width x height box (percentages). */
export function toClipPath(poly, width, height) {
  const pts = poly.map(([x, y]) => `${((x / width) * 100).toFixed(3)}% ${((y / height) * 100).toFixed(3)}%`);
  return `polygon(${pts.join(", ")})`;
}

/** SVG path data for a polygon. */
export function toSvgPath(poly) {
  return poly.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
}

/** Shrink a polygon toward its centroid (useful to leave hairline gaps between shards). */
export function insetPolygon(poly, amount) {
  const [cx, cy] = polygonCentroid(poly);
  return poly.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, (len - amount) / len);
    return [cx + dx * k, cy + dy * k];
  });
}
