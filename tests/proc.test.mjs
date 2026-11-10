// Run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createRng, hashString, seedFromDate, dateKey } from "../js/proc/rng.js";
import { createNoise } from "../js/proc/noise.js";
import { voronoiCells, impactSites, cellEdges, polygonArea, toClipPath, clipPolygon, rectPolygon } from "../js/proc/voronoi.js";

test("rng is deterministic per seed and differs between seeds", () => {
  const a = createRng("java");
  const b = createRng("java");
  const c = createRng("python");
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  const seqC = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
});

test("rng helpers stay in range", () => {
  const r = createRng(42);
  for (let i = 0; i < 2000; i += 1) {
    const n = r.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
    const f = r.range(-2, 5);
    assert.ok(f >= -2 && f < 5);
  }
  assert.deepEqual(r.shuffle([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
});

test("fork streams are independent of draws on the parent", () => {
  const p1 = createRng("seed");
  const p2 = createRng("seed");
  p2.next();
  p2.next();
  assert.equal(p1.fork("sky").next(), p2.fork("sky").next());
});

test("date seeds change by day only", () => {
  const morning = new Date(2026, 10, 10, 8, 0);
  const night = new Date(2026, 10, 10, 23, 59);
  const next = new Date(2026, 10, 11, 0, 1);
  assert.equal(dateKey(morning), "2026-11-10");
  assert.equal(seedFromDate(morning), seedFromDate(night));
  assert.notEqual(seedFromDate(morning), seedFromDate(next));
  assert.equal(typeof hashString("x"), "number");
});

test("noise is deterministic and bounded", () => {
  const n1 = createNoise(7);
  const n2 = createNoise(7);
  for (let i = 0; i < 500; i += 1) {
    const x = i * 0.137;
    const y = i * 0.071;
    const v2 = n1.noise2(x, y);
    const v3 = n1.noise3(x, y, i * 0.01);
    assert.equal(v2, n2.noise2(x, y));
    assert.ok(v2 >= -1.01 && v2 <= 1.01, `noise2 out of range: ${v2}`);
    assert.ok(v3 >= -1.01 && v3 <= 1.01, `noise3 out of range: ${v3}`);
    const [cx, cy] = n1.curl2(x, y, 0.5);
    assert.ok(Number.isFinite(cx) && Number.isFinite(cy));
  }
});

test("clipPolygon keeps the requested half", () => {
  const half = clipPolygon(rectPolygon(0, 0, 10, 10), 1, 0, 5); // x <= 5
  assert.equal(polygonArea(half), 50);
});

test("voronoi cells tile the bounds exactly, without gaps or overlaps", () => {
  for (const seed of [1, 2, 3, "card", "intro"]) {
    const rng = createRng(seed);
    const width = 620;
    const height = 410;
    const sites = impactSites(rng, { width, height, x: 180, y: 120, count: 40 });
    const cells = voronoiCells(sites, { width, height });
    const total = cells.reduce((sum, c) => sum + c.area, 0);
    assert.ok(Math.abs(total - width * height) < 1e-3 * width * height, `area mismatch ${total}`);
    assert.ok(cells.length >= 36, `too many empty cells: ${cells.length}`);
    for (const cell of cells) {
      for (const [x, y] of cell.polygon) {
        assert.ok(x >= -1e-6 && x <= width + 1e-6 && y >= -1e-6 && y <= height + 1e-6);
      }
    }
  }
});

test("cellEdges returns only shared interior edges, sorted from the impact", () => {
  const rng = createRng("edges");
  const sites = impactSites(rng, { width: 300, height: 200, x: 60, y: 50, count: 20 });
  const cells = voronoiCells(sites, { width: 300, height: 200 });
  const edges = cellEdges(cells, [60, 50]);
  assert.ok(edges.length > 0);
  for (let i = 1; i < edges.length; i += 1) assert.ok(edges[i].distance >= edges[i - 1].distance);
  for (const { a, b } of edges) {
    const onBorder = (p, q) => (Math.abs(p[0]) < 0.5 && Math.abs(q[0]) < 0.5) || (Math.abs(p[1]) < 0.5 && Math.abs(q[1]) < 0.5)
      || (Math.abs(p[0] - 300) < 0.5 && Math.abs(q[0] - 300) < 0.5) || (Math.abs(p[1] - 200) < 0.5 && Math.abs(q[1] - 200) < 0.5);
    assert.ok(!onBorder(a, b), "boundary edge leaked into crack edges");
  }
});

test("toClipPath produces percentages", () => {
  assert.equal(toClipPath([[0, 0], [50, 0], [50, 25]], 100, 50), "polygon(0.000% 0.000%, 50.000% 0.000%, 50.000% 50.000%)");
});
