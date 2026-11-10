// Procedural night city: building generation and canvas painting for js/skyline.js.
// Everything is seeded (daySeed("skyline"), or ?seed=), sized relative to the skyline
// height so the same city scales with the viewport.
import { createRng } from "../proc/rng.js";
import { createNoise } from "../proc/noise.js";
import { NORMAL, DARK, rgba, mixRgb } from "./palette.js";

/** Layer recipes. Heights/widths are fractions of the skyline height H. */
export const LAYERS = [
  {
    name: "far",
    wMin: 0.08, wMax: 0.22, hMin: 0.3, hMid: 0.56, hMax: 0.98, tallChance: 0.16, gap: 0.02,
    win: { w: 1, h: 2, gx: 3, gy: 4, p: 0.05, pad: 3 },
    downtown: 0.55,
    parallax: 5
  },
  {
    name: "mid",
    wMin: 0.12, wMax: 0.3, hMin: 0.18, hMid: 0.42, hMax: 0.78, tallChance: 0.14, gap: 0.04,
    win: { w: 2, h: 3, gx: 4, gy: 6, p: 0.08, pad: 4 },
    downtown: 0.35,
    parallax: 11
  },
  {
    name: "near",
    wMin: 0.22, wMax: 0.52, hMin: 0.1, hMid: 0.24, hMax: 0.4, tallChance: 0.12, gap: 0.0,
    win: { w: 3, h: 4, gx: 7, gy: 8, p: 0.06, pad: 6 },
    downtown: 0,
    parallax: 19
  }
];

/**
 * Colours per layer and palette (normal / Dark Hour). Buildings are darker than the glowing
 * horizon behind them; distance adds haze (lighter, bluer), the near row is almost black.
 */
function layerColors(name, dark) {
  const P = dark ? DARK : NORMAL;
  const ink = NORMAL.ink;
  switch (name) {
    case "far":
      return {
        top: mixRgb(P.night, P.deep, dark ? 0.18 : 0.32),
        bottom: mixRgb(P.night, P.deep, dark ? 0.4 : 0.62),
        haze: dark ? P.deep : mixRgb(P.deep, P.blue, 0.18),
        hazeAlpha: dark ? 0.4 : 0.6,
        rim: P.ice,
        rimAlpha: 0.1
      };
    case "mid":
      return {
        top: mixRgb(P.abyss, P.night, 0.55),
        bottom: mixRgb(P.abyss, P.night, 0.8),
        haze: P.deep,
        hazeAlpha: 0.32,
        rim: P.ice,
        rimAlpha: 0.06
      };
    default:
      return {
        top: mixRgb(ink, P.abyss, 0.6),
        bottom: ink,
        haze: null,
        rim: P.ice,
        rimAlpha: 0.04
      };
  }
}

/* ------------------------------------------------------------- generation */

const clampEnv = (v) => Math.min(1.25, Math.max(0, v));

/**
 * Buildings for one layer across `width` px (plus margins), in CSS px.
 * Returns { buildings, windows, beacons }.
 */
export function generateLayer(seed, recipe, width, H, opts = {}) {
  const rng = createRng(seed).fork(recipe.name);
  const winRng = createRng(seed).fork(`${recipe.name}:windows`);
  const envNoise = createNoise(rng.int(0, 1e9));
  const buildings = [];
  const margin = recipe.parallax * 2 + 8;
  const center = opts.centerX ?? width * 0.45;
  // Height envelope: a slow skyline profile plus a downtown cluster around the tower.
  const envelope = (px) => {
    const n = envNoise.noise2(px / (H * 3.2), 0.5);
    const d = (px - center) / (width * 0.16);
    return clampEnv(0.62 + 0.3 * n + recipe.downtown * Math.exp(-d * d));
  };
  let x = -margin;
  while (x < width + margin) {
    const w = Math.max(10, Math.round(rng.range(recipe.wMin, recipe.wMax) * H));
    const tall = rng.chance(recipe.tallChance);
    const raw = tall ? rng.range(recipe.hMid, recipe.hMax) : rng.range(recipe.hMin, recipe.hMid);
    const h = Math.round(Math.min(recipe.hMax, raw * (0.45 + 0.75 * envelope(x + w / 2))) * H);
    const roof = rng.weighted([["flat", 5], ["stepped", 2.4], ["antenna", 1.6], ["tank", 1.3], ["spire", 0.8]]);
    buildings.push({
      x: Math.round(x),
      w,
      h,
      roof,
      r1: rng.next(),
      r2: rng.next(),
      r3: rng.next()
    });
    x += w + Math.round(rng.range(0, recipe.gap) * H);
  }

  // Lit windows: sparse, clustered by floor; keep the bottom strip dark for the footer text.
  const windows = [];
  const { w: ww, h: wh, gx, gy, p, pad } = recipe.win;
  const floorLimit = H - (opts.keepClearBottom ?? 0);
  buildings.forEach((b) => {
    const top = H - b.h;
    const cols = Math.floor((b.w - pad * 2 + gx - ww) / gx);
    const rows = Math.floor((b.h - pad * 2 + gy - wh) / gy);
    if (cols < 1 || rows < 1) return;
    const busy = winRng.range(0.2, 1.8);
    for (let r = 0; r < rows; r += 1) {
      const floorOn = winRng.chance(0.55);
      for (let c = 0; c < cols; c += 1) {
        if (!winRng.chance(p * busy * (floorOn ? 1.7 : 0.25))) continue;
        const wx = b.x + pad + c * gx;
        const wy = top + pad + r * gy;
        if (wy + wh > floorLimit) continue;
        windows.push({
          x: wx,
          y: wy,
          w: ww,
          h: wh,
          tint: winRng.weighted([["warm", 5.5], ["cool", 3.5], ["cyan", 1]]),
          base: winRng.range(0.45, 1),
          phase: winRng.range(0, 100),
          speed: winRng.range(0.04, 0.16)
        });
      }
    }
  });

  // Aviation beacons on the tallest roofs.
  const beacons = [];
  const tallest = buildings
    .filter((b) => b.x > 0 && b.x < width)
    .sort((a, b) => b.h - a.h)
    .slice(0, opts.beacons ?? 2);
  tallest.forEach((b) => {
    const peak = roofPeak(b, H);
    beacons.push({ x: peak.x, y: peak.y, delay: winRng.range(0, 2.4), period: winRng.range(2.2, 3.4) });
  });

  return { buildings, windows, beacons, margin };
}

/** Highest point of a building's silhouette (for beacons). */
function roofPeak(b, H) {
  const top = H - b.h;
  switch (b.roof) {
    case "antenna": {
      const mx = b.x + Math.round(b.w * (0.25 + b.r1 * 0.5));
      return { x: mx, y: top - Math.round(b.h * (0.22 + b.r2 * 0.18)) };
    }
    case "spire":
      return { x: b.x + Math.round(b.w / 2), y: top - Math.round(b.h * 0.16) - Math.round(b.h * (0.16 + b.r2 * 0.12)) };
    case "stepped":
      return { x: b.x + Math.round(b.w / 2), y: top - Math.round(b.h * 0.1) - (b.r3 > 0.5 ? Math.round(b.h * 0.07) : 0) };
    default:
      return { x: b.x + Math.round(b.w / 2), y: top };
  }
}

/* --------------------------------------------------------------- painting */

/** Add one building's silhouette (rectangles only: no angles outside the system). */
function buildingPath(ctx, b, H) {
  const top = H - b.h;
  ctx.rect(b.x, top, b.w, b.h);
  switch (b.roof) {
    case "stepped": {
      const w1 = Math.round(b.w * (0.5 + b.r1 * 0.25));
      const h1 = Math.round(b.h * 0.1);
      const x1 = b.x + Math.round((b.w - w1) * b.r2);
      ctx.rect(x1, top - h1, w1, h1);
      if (b.r3 > 0.5) {
        const w2 = Math.round(w1 * 0.5);
        const h2 = Math.round(b.h * 0.07);
        ctx.rect(x1 + Math.round((w1 - w2) / 2), top - h1 - h2, w2, h2);
      }
      break;
    }
    case "antenna": {
      const mx = b.x + Math.round(b.w * (0.25 + b.r1 * 0.5));
      const mh = Math.round(b.h * (0.22 + b.r2 * 0.18));
      ctx.rect(mx - 1, top - mh, 2, mh);
      ctx.rect(mx - 4, top - Math.round(mh * 0.55), 8, 1);
      ctx.rect(b.x + Math.round(b.w * 0.1), top - 3, Math.round(b.w * 0.3), 3);
      break;
    }
    case "tank": {
      const tw = Math.max(6, Math.round(b.w * 0.24));
      const th = Math.max(5, Math.round(b.h * 0.07));
      const tx = b.x + Math.round((b.w - tw) * (0.15 + b.r1 * 0.7));
      const legs = Math.max(3, Math.round(th * 0.6));
      ctx.rect(tx + 1, top - legs, 1, legs);
      ctx.rect(tx + tw - 2, top - legs, 1, legs);
      ctx.rect(tx, top - legs - th, tw, th);
      ctx.rect(tx + Math.round(tw * 0.2), top - legs - th - 2, Math.round(tw * 0.6), 2);
      break;
    }
    case "spire": {
      const sw = Math.round(b.w * 0.42);
      const sh = Math.round(b.h * 0.16);
      const sx = b.x + Math.round((b.w - sw) / 2);
      ctx.rect(sx, top - sh, sw, sh);
      const nh = Math.round(b.h * (0.16 + b.r2 * 0.12));
      ctx.rect(b.x + Math.round(b.w / 2) - 1, top - sh - nh, 2, nh);
      break;
    }
    default:
      ctx.rect(b.x, top - 2, b.w, 2);
  }
}

/** Paint a layer's silhouettes (once; the result is a cached canvas). */
export function paintBuildings(canvas, layer, recipe, H, dpr, dark) {
  const ctx = canvas.getContext("2d");
  const colors = layerColors(recipe.name, dark);
  ctx.setTransform(dpr, 0, 0, dpr, layer.margin * dpr, 0);
  ctx.clearRect(-layer.margin, 0, canvas.width / dpr, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgba(colors.top));
  grad.addColorStop(1, rgba(colors.bottom));
  ctx.fillStyle = grad;
  ctx.beginPath();
  layer.buildings.forEach((b) => buildingPath(ctx, b, H));
  ctx.fill();

  // Moonlight comes from the upper right: a hairline on the right edge of each block.
  ctx.fillStyle = rgba(colors.rim, colors.rimAlpha);
  layer.buildings.forEach((b) => {
    ctx.fillRect(b.x + b.w - 1, H - b.h, 1, b.h);
    ctx.fillRect(b.x, H - b.h, b.w, 1);
  });

  // Unlit window texture on the mid layer (barely there, gives the blocks scale).
  if (recipe.name === "mid") {
    ctx.fillStyle = rgba(NORMAL.paper, 0.022);
    const { w: ww, h: wh, gx, gy, pad } = recipe.win;
    layer.buildings.forEach((b) => {
      for (let y = H - b.h + pad; y + wh < H; y += gy) {
        for (let x = b.x + pad; x + ww < b.x + b.w - pad; x += gx) ctx.fillRect(x, y, ww, wh);
      }
    });
  }

  // Ground haze: separates the layers like mist over the water.
  if (colors.haze) {
    const haze = ctx.createLinearGradient(0, H * 0.25, 0, H);
    haze.addColorStop(0, rgba(colors.haze, 0));
    haze.addColorStop(1, rgba(colors.haze, colors.hazeAlpha));
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = haze;
    ctx.fillRect(-layer.margin, 0, canvas.width / dpr, H);
    ctx.globalCompositeOperation = "source-over";
  }
}

const TINTS = {
  warm: mixRgb(NORMAL.gold, NORMAL.paper, 0.35),
  cool: NORMAL.ice,
  cyan: NORMAL.cyan
};

/** Redraw lit windows (all of them, cheap: a few hundred 2-6 px rects). */
export function paintWindows(canvas, layer, H, dpr, brightness) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, layer.margin * dpr, 0);
  ctx.clearRect(-layer.margin, 0, canvas.width / dpr, H);
  layer.windows.forEach((win, i) => {
    const a = brightness ? brightness(win, i) : win.base;
    if (a <= 0.02) return;
    ctx.fillStyle = rgba(TINTS[win.tint], Math.min(1, a));
    ctx.fillRect(win.x, win.y, win.w, win.h);
  });
}

/* ------------------------------------------------------------------ tower */

/**
 * The tower: an irregular stack of heavy tiers with ledges, teeth, ribs and light slits,
 * crowned by a cluster of needles. Original design. The full (Dark Hour) height is drawn
 * once; the visible part is chosen with translateY.
 */
export function generateTower(seed, W, Htotal) {
  const rng = createRng(seed).fork("tower");
  const tiers = [];
  const count = rng.int(11, 14);
  const crownH = Htotal * rng.range(0.1, 0.13);
  const bodyH = Htotal - crownH;
  const weights = Array.from({ length: count }, (_, i) => (i === 0 ? 1.5 : rng.range(0.6, 1.4)));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = 0;
  let w = W;
  let cx = 0;
  for (let i = 0; i < count; i += 1) {
    const h = (weights[i] / total) * bodyH;
    if (i > 0) {
      const shrink = rng.weighted([[rng.range(0.9, 0.98), 6], [rng.range(1.02, 1.1), 1.4], [rng.range(0.7, 0.8), 1.2]]);
      w = Math.max(W * 0.22, Math.min(W * 1.08, w * shrink));
      cx = Math.max(-W * 0.1, Math.min(W * 0.1, cx + rng.range(-0.06, 0.06) * W));
    }
    tiers.push({
      y,
      h,
      w,
      cx,
      ledge: i > 0 && rng.chance(0.5),
      teeth: rng.chance(0.35) ? rng.int(3, 6) : 0,
      ribs: rng.int(0, 3),
      slits: rng.int(1, 4),
      notch: rng.chance(0.3) ? rng.sign() : 0,
      r: rng.next()
    });
    y += h;
  }
  const needles = Array.from({ length: rng.int(3, 5) }, () => ({ dx: rng.range(-0.4, 0.4), h: rng.range(0.35, 1) }));
  needles[0] = { dx: 0, h: 1 };
  const top = tiers[tiers.length - 1];
  return { tiers, crownH, bodyH, W, Htotal, topW: top.w, topCx: top.cx, needles };
}

/**
 * Paint the tower into a canvas `cw` wide and `Htotal` tall (base at the bottom).
 * glow = false: silhouette with cold slits. glow = true: only the Dark Hour green burn
 * (slits, rims and crown), layered on top of the silhouette.
 */
export function paintTower(canvas, tower, cw, dpr, { glow = false } = {}) {
  const ctx = canvas.getContext("2d");
  const H = tower.Htotal;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, H);
  const mid = cw / 2;

  const body = ctx.createLinearGradient(0, 0, 0, H);
  // Darker than any building: it reads as a silhouette under both palettes.
  body.addColorStop(0, rgba(mixRgb(NORMAL.ink, NORMAL.abyss, 0.85)));
  body.addColorStop(0.5, rgba(mixRgb(NORMAL.ink, NORMAL.abyss, 0.4)));
  body.addColorStop(1, rgba(NORMAL.ink));

  const rim = glow ? DARK.glow : NORMAL.ice;
  const slit = glow ? DARK.glow : NORMAL.cyan;

  tower.tiers.forEach((t) => {
    const x = Math.round(mid + t.cx - t.w / 2);
    const y = Math.round(H - t.y - t.h);
    const w = Math.round(t.w);
    const h = Math.ceil(t.h) + 1;
    if (!glow) {
      ctx.fillStyle = body;
      ctx.fillRect(x, y, w, h);
      if (t.notch) {
        // A recessed slot on one side breaks the stack's symmetry.
        const nw = Math.max(3, Math.round(w * 0.12));
        ctx.clearRect(t.notch > 0 ? x + w - nw : x, y + Math.round(h * 0.3), nw, Math.round(h * 0.38));
      }
      if (t.ledge) {
        ctx.fillRect(x - Math.round(w * 0.07), y, w + Math.round(w * 0.14), Math.max(2, Math.round(h * 0.07)));
      }
      if (t.teeth) {
        const tw = Math.max(2, Math.round(w / (t.teeth * 2.4)));
        for (let k = 0; k < t.teeth; k += 1) {
          const tx = x + Math.round(((k + 0.5) / t.teeth) * w - tw / 2);
          ctx.fillRect(tx, y - Math.round(tw * 1.6), tw, Math.round(tw * 1.6));
        }
      }
    }
    // Moonlight from the upper right: rim on the right edge and the tier's top.
    ctx.fillStyle = rgba(rim, glow ? 0.55 : 0.18);
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = rgba(rim, glow ? 0.35 : 0.1);
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = rgba(rim, glow ? 0.18 : 0.05);
    for (let r = 1; r <= t.ribs; r += 1) ctx.fillRect(x + Math.round((w * r) / (t.ribs + 1)), y + 2, 1, h - 4);
    // Vertical light slits.
    for (let s = 0; s < t.slits; s += 1) {
      const sx = x + Math.round(w * (0.16 + ((s * 0.37 + t.r) % 1) * 0.68));
      const sh = Math.max(4, Math.round(h * (0.3 + ((t.r * 7 + s * 0.31) % 1) * 0.45)));
      const sy = y + Math.round((h - sh) * ((t.r * 3 + s * 0.17) % 1));
      ctx.fillStyle = rgba(slit, glow ? 0.9 : 0.2 + 0.3 * ((t.r + s * 0.37) % 1));
      ctx.fillRect(sx, sy, glow ? 2 : 1, sh);
    }
  });

  // Crown: a cluster of needles of different heights.
  const top = H - tower.bodyH;
  const cxTop = mid + tower.topCx;
  ctx.fillStyle = glow ? rgba(DARK.glow, 0.6) : rgba(mixRgb(NORMAL.ink, NORMAL.abyss, 0.85));
  let peak = { x: Math.round(cxTop), y: 0 };
  tower.needles.forEach((n, i) => {
    const nx = Math.round(cxTop + n.dx * tower.topW);
    const nh = Math.round(tower.crownH * n.h);
    const nw = i === 0 ? 3 : 2;
    ctx.fillRect(nx - Math.floor(nw / 2), top - nh, nw, nh + 2);
    if (i === 0) peak = { x: nx, y: top - nh };
  });
  if (!glow) {
    const crownW = Math.round(tower.topW * 0.7);
    ctx.fillRect(Math.round(cxTop - crownW / 2), top - 3, crownW, 4);
  }
  return { beacon: peak };
}
