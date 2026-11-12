// Procedural bug sprites for the Debug Battle. Pure SVG strings, seeded by the bug id and
// memoized; colours come from CSS classes (tokens), so the Dark Hour palette applies
// without a second set.
//
// Every bug has its own silhouette (a split beetle, a mosquito, a hermit crab in a laptop,
// a centipede, a ghost, a noodle tangle, a bomb, a beetle too wide for its box), built from
// shared parts:
//   cel()    hard-edged cel shading: a dark base, a lit copy pulled up-left (a shadow
//            crescent stays on the lower right), a highlight and a rim light
//   legs()   jointed legs with knees and claws, feet on the ground line
//   face()   every expression at once (idle, hurt, dizzy, down); CSS shows the one named by
//            data-face on .battle__sprite (js/battle.js sets it)
// Fork Bomb draws three clones that CSS reveals one by one (data-clones, 0..3).
// Fine details carry .bg-detail so the 52px Dark Hour crawler can drop them.
import { createRng } from "../proc/rng.js";

const f = (n) => Number(n.toFixed(1));
const GROUND = 94;
const cache = new Map();
let uid = 0;

/* ================================================================ shapes */

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

function ellipse(cx, cy, rx, ry) {
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0Z`;
}

/**
 * Cel-shaded solid around (cx, cy): dark base, lit copy scaled by k and pulled up-left,
 * a highlight crescent and a rim. `rim` adds a modifier class (e.g. " bg-rim--hot").
 */
function cel(d, cx, cy, { k = 0.86, dx = -3, dy = -4, rim = "", hi = 0.55, rx = 40, ry = 40 } = {}) {
  const lit = `<path class="bg-lit" d="${d}" transform="translate(${f(cx + dx)} ${f(cy + dy)}) scale(${k}) translate(${f(-cx)} ${f(-cy)})"/>`;
  const highlight = hi
    ? `<ellipse class="bg-hi" cx="${f(cx - rx * 0.42)}" cy="${f(cy - ry * 0.5)}" rx="${f(rx * 0.32 * hi * 2)}" ry="${f(ry * 0.12 * hi * 2)}" transform="rotate(-32 ${f(cx - rx * 0.42)} ${f(cy - ry * 0.5)})"/>`
    : "";
  return `<path class="bg-shade" d="${d}"/>${lit}${highlight}<path class="bg-rim${rim}" d="${d}"/>`;
}

/* ================================================================== parts */

/**
 * A leg from a hip: up and out to the knee, then down to a foot `span` units out.
 * `side` -1 (left) or 1 (right).
 */
function leg(rng, hx, hy, side, span, { footY = GROUND, lift = 22 } = {}) {
  const fx = hx + side * span * rng.range(0.94, 1.06);
  const kx = hx + side * span * rng.range(0.5, 0.6);
  const ky = hy - lift * rng.range(0.85, 1.15);
  return { hx, hy, kx, ky, fx, fy: footY, side };
}

/** A fan of legs down one side: the top hip reaches furthest, so the legs never cross. */
function fan(rng, side, hips, { reach = 56, step = 14, lift = 22, footY = GROUND } = {}) {
  return hips.map(([hx, hy], i) => leg(rng, hx, hy, side, reach - i * step, { lift: lift - i * 4, footY }));
}

function legs(list, { cls = "" } = {}) {
  let d = "";
  let claws = "";
  let joints = "";
  list.forEach(({ hx, hy, kx, ky, fx, fy, side }) => {
    d += `M${f(hx)} ${f(hy)}L${f(kx)} ${f(ky)}L${f(fx)} ${f(fy)}`;
    claws += `M${f(fx - side * 6)} ${f(fy - 1)}L${f(fx)} ${f(fy)}L${f(fx + side * 1)} ${f(fy - 7)}`;
    joints += `<circle class="bg-joint" cx="${f(kx)}" cy="${f(ky)}" r="3.4"/>`;
  });
  return `<g class="bg-legs${cls}"><path class="bg-leg" d="${d}"/><path class="bg-claw bg-detail" d="${claws}"/>${joints}</g>`;
}

/** One antenna from a base point, curving out to a glowing tip. */
function antenna(x, y, side, len = 34) {
  const tx = x + side * len * 0.55;
  const ty = y - len;
  return `<path class="bg-antenna" d="M${f(x)} ${f(y)}Q${f(x + side * 2)} ${f(ty + 8)} ${f(tx)} ${f(ty)}"/><circle class="bg-tip" cx="${f(tx)}" cy="${f(ty)}" r="4.5"/>`;
}

/** Two antennae from base points, curving out, with glowing tips. */
function antennae(rng, [x1, y1], [x2, y2], { len = 42, spread = 26 } = {}) {
  const tip = (x, y, side) => [x + side * rng.range(spread * 0.8, spread * 1.2), y - rng.range(len * 0.85, len * 1.1)];
  const [lx, ly] = tip(x1, y1, -1);
  const [rx, ry] = tip(x2, y2, 1);
  return `<path class="bg-antenna" d="M${f(x1)} ${f(y1)}Q${f(x1 - 4)} ${f(ly + 6)} ${f(lx)} ${f(ly)}M${f(x2)} ${f(y2)}Q${f(x2 + 4)} ${f(ry + 6)} ${f(rx)} ${f(ry)}"/>
    <circle class="bg-tip" cx="${f(lx)}" cy="${f(ly)}" r="4.5"/><circle class="bg-tip" cx="${f(rx)}" cy="${f(ry)}" r="4.5"/>`;
}

/** Curved mandibles under a head centred at x. */
function mandibles(x, y, w = 12) {
  return `<path class="bg-mandible" d="M${f(x - 3)} ${f(y)}Q${f(x - w - 4)} ${f(y + 2)} ${f(x - w + 1)} ${f(y + 12)}Q${f(x - w + 5)} ${f(y + 6)} ${f(x - 2)} ${f(y + 5)}Z
      M${f(x + 3)} ${f(y)}Q${f(x + w + 4)} ${f(y + 2)} ${f(x + w - 1)} ${f(y + 12)}Q${f(x + w - 5)} ${f(y + 6)} ${f(x + 2)} ${f(y + 5)}Z"/>`;
}

/**
 * Every expression at once. eyes: [{ x, y, r, side, look }] (side -1 left, 1 right; look
 * shifts the iris sideways). mouth: { x, y, w } or null. kind "void" draws ∅ eyes.
 */
function face(eyes, { mouth = null, kind = "angry" } = {}) {
  const idle = eyes
    .map(({ x, y, r, side, look = 0 }) => {
      if (kind === "void") {
        return `<circle class="bg-x" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.8)}"/><path class="bg-x" d="M${f(x - r)} ${f(y + r)}L${f(x + r)} ${f(y - r)}"/>`;
      }
      const ix = x + look * r * 0.28;
      const iy = y + r * 0.12;
      return `<ellipse class="bg-sclera" cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.08)}"/>
        <circle class="bg-iris" cx="${f(ix)}" cy="${f(iy)}" r="${f(r * 0.6)}"/>
        <circle class="bg-pupil" cx="${f(ix)}" cy="${f(iy)}" r="${f(r * 0.3)}"/>
        <circle class="bg-glint" cx="${f(ix - r * 0.22)}" cy="${f(iy - r * 0.26)}" r="${f(r * 0.16)}"/>
        <path class="bg-brow" d="M${f(x + side * r * 1.15)} ${f(y - r * 1.55)}L${f(x - side * r * 0.95)} ${f(y - r * 0.9)}"/>`;
    })
    .join("");
  const hurt = eyes
    .map(({ x, y, r, side }) => `<path class="bg-x" d="M${f(x + side * r * 0.7)} ${f(y - r * 0.7)}L${f(x - side * r * 0.6)} ${f(y)}L${f(x + side * r * 0.7)} ${f(y + r * 0.7)}"/>`)
    .join("");
  const dizzy = eyes
    .map(({ x, y, r }) => `<ellipse class="bg-sclera" cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.08)}"/>
      <path class="bg-swirl" d="M${f(x + r * 0.7)} ${f(y)}a${f(r * 0.7)} ${f(r * 0.7)} 0 1 1 ${f(-r * 1.3)} 0a${f(r * 0.5)} ${f(r * 0.5)} 0 1 1 ${f(r * 0.95)} 0a${f(r * 0.28)} ${f(r * 0.28)} 0 1 1 ${f(-r * 0.5)} 0"/>`)
    .join("");
  const down = eyes
    .map(({ x, y, r }) => `<path class="bg-x" d="M${f(x - r * 0.7)} ${f(y - r * 0.7)}L${f(x + r * 0.7)} ${f(y + r * 0.7)}M${f(x + r * 0.7)} ${f(y - r * 0.7)}L${f(x - r * 0.7)} ${f(y + r * 0.7)}"/>`)
    .join("");

  let m = { idle: "", hurt: "", dizzy: "", down: "" };
  if (mouth) {
    const { x, y, w } = mouth;
    const teeth = Array.from({ length: 5 }, (_, i) => `${i ? "L" : "M"}${f(x - w + (i * w) / 2)} ${f(y + (i % 2 ? 4 : 0))}`).join("");
    m = {
      idle: `<path class="bg-mouth" d="${teeth}"/>`,
      hurt: `<ellipse class="bg-mouth-open" cx="${f(x)}" cy="${f(y + 3)}" rx="${f(w * 0.45)}" ry="${f(w * 0.4)}"/>`,
      dizzy: `<path class="bg-mouth" d="M${f(x - w)} ${f(y + 2)}q${f(w / 4)} -5 ${f(w / 2)} 0t${f(w / 2)} 0t${f(w / 2)} 0t${f(w / 2)} 0"/>`,
      down: `<path class="bg-mouth" d="M${f(x - w * 0.7)} ${f(y + 3)}H${f(x + w * 0.7)}"/>`
    };
  }
  return `<g class="bg-face bg-face--idle">${idle}${m.idle}</g>
    <g class="bg-face bg-face--hurt">${hurt}${m.hurt}</g>
    <g class="bg-face bg-face--dizzy">${dizzy}${m.dizzy}</g>
    <g class="bg-face bg-face--down">${down}${m.down}</g>`;
}

/** Thin scanline tears sticking out of the silhouette at a few heights. */
function tears(rng, rows) {
  return rows
    .map(([y, x0, side], i) => {
      const w = rng.range(14, 34);
      const x = side > 0 ? x0 : x0 - w;
      return `<rect class="bg-tear ${i % 2 ? "bg-tear--b" : "bg-tear--a"}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="2.5"/>`;
    })
    .join("");
}

/** Small label set in the HUD face. */
const label = (x, y, text, cls = "") => `<text class="bg-label${cls}" x="${f(x)}" y="${f(y)}">${text}</text>`;

/* ================================================================ bugs */

const MOTIFS = {
  // Merge Conflict: two half-beetles out of sync along a zigzag seam, each with its own
  // head glaring at the other, conflict markers across the back.
  split(rng) {
    const zig = [];
    for (let y = 74, i = 0; y >= -38; y -= 14, i += 1) zig.push(`L${i % 2 ? 6 : -4} ${y}`);
    const seam = zig.join("");
    const left = `M0 -38A50 56 0 0 0 0 74${seam}Z`;
    const right = `M0 -38A50 56 0 0 1 0 74${seam}Z`;
    const shift = [6, 7];
    const legL = fan(rng, -1, [[-42, 4], [-46, 26], [-40, 48]], { reach: 58, step: 10 });
    const legR = fan(rng, 1, [[48, 11], [52, 33], [46, 55]], { reach: 58, step: 10 });
    const headL = blob(rng, -24, -56, 21, 18, 0.1, 9);
    const headR = blob(rng, 30, -46, 21, 18, 0.1, 9);
    return {
      shadow: 82,
      art: `${legs(legL)}${legs(legR)}
        ${antenna(-34, -68, -1, 34)}${antenna(-16, -72, 1, 26)}
        ${antenna(22, -62, -1, 26)}${antenna(40, -58, 1, 34)}
        ${cel(left, -22, 18, { rx: 30, ry: 56 })}
        <g transform="translate(${shift[0]} ${shift[1]})">${cel(right, 22, 18, { rim: " bg-rim--hot", hi: 0, rx: 30, ry: 56 })}</g>
        ${cel(headL, -24, -56, { rx: 21, ry: 18, hi: 0.4 })}
        ${cel(headR, 30, -46, { rim: " bg-rim--hot", rx: 21, ry: 18, hi: 0 })}
        ${face(
          [
            { x: -31, y: -58, r: 6.5, side: -1, look: 1 },
            { x: -16, y: -57, r: 6.5, side: 1, look: 1 }
          ],
          { mouth: { x: -23, y: -46, w: 7 } }
        )}
        ${face(
          [
            { x: 23, y: -48, r: 6.5, side: -1, look: -1 },
            { x: 38, y: -47, r: 6.5, side: 1, look: -1 }
          ],
          { mouth: { x: 31, y: -36, w: 7 } }
        )}
        <g class="bg-detail">
          ${label(-34, -8, "&lt;&lt;&lt;&lt;&lt;&lt;&lt;")}
          ${label(-30, 22, "=======")}
          ${label(-26, 52, "&gt;&gt;&gt;&gt;&gt;&gt;&gt;", " bg-label--hot")}
        </g>
        ${tears(rng, [[-14, -52, -1], [40, 58, 1]])}`
    };
  },

  // SQL Injection: a hovering mosquito with glassy wings and a syringe for a proboscis.
  needle(rng) {
    const wing = (side) => {
      const s = side;
      return `<path class="bg-wing" d="M${s * 12} -30C${s * 40} -78 ${s * 96} -96 ${s * 108} -74C${s * 116} -58 ${s * 70} -34 ${s * 14} -18Z"/>
        <path class="bg-vein bg-detail" d="M${s * 16} -26L${s * 96} -78M${s * 40} -46C${s * 60} -50 ${s * 80} -52 ${s * 98} -60M${s * 34} -34L${s * 70} -44"/>`;
    };
    // Hovering: the legs dangle (feet well above the ground line).
    const legList = [-1, 1].flatMap((side) =>
      fan(rng, side, [[side * 20, -6], [side * 22, 4], [side * 18, 14]], { reach: 64, step: 12, lift: 16, footY: 70 })
    );
    const thorax = blob(rng, 0, -10, 28, 22, 0.08, 9);
    const head = blob(rng, 0, -46, 21, 18, 0.06, 9);
    const abdomen = ellipse(0, 36, 17, 34);
    return {
      shadow: 50,
      hover: true,
      art: `<g class="bg-wings">${wing(-1)}${wing(1)}</g>
        ${legs(legList, { cls: " bg-legs--thin" })}
        ${cel(abdomen, 0, 36, { rx: 17, ry: 34 })}
        <path class="bg-seam bg-detail" d="M-15 26Q0 32 15 26M-15 40Q0 46 15 40M-13 54Q0 60 13 54"/>
        ${cel(thorax, 0, -10, { rx: 28, ry: 22 })}
        ${antennae(rng, [-8, -60], [8, -60], { len: 34, spread: 30 })}
        ${cel(head, 0, -46, { rx: 21, ry: 18 })}
        <g class="bg-syringe" transform="translate(-4 -30) rotate(35)">
          <path class="bg-needle" d="M0 30V98"/>
          <path class="bg-barrel" d="M-6 0H6V30H-6Z"/>
          <path class="bg-plunger" d="M-9 -2H9"/>
          <path class="bg-ticks bg-detail" d="M1 7H6M1 14H6M1 21H6"/>
        </g>
        ${label(-90, 82, "';", " bg-label--big")}
        ${face(
          [
            { x: -9, y: -48, r: 8, side: -1, look: -0.6 },
            { x: 9, y: -48, r: 8, side: 1, look: -0.6 }
          ]
        )}
        ${tears(rng, [[-2, 30, 1], [44, -18, -1]])}`
    };
  },

  // Works On My Machine: a hermit crab living in a laptop that insists everything is fine.
  box(rng) {
    const legList = [-1, 1].flatMap((side) => fan(rng, side, [[side * 40, 36], [side * 32, 44], [side * 22, 50]], { reach: 46, step: 10, lift: 16 }));
    const shell = blob(rng, 0, 34, 58, 30, 0.08, 10);
    const claw = (side) => {
      const s = side;
      const d = `M${s * 50} 22C${s * 76} 6 ${s * 102} 10 ${s * 104} 34C${s * 106} 52 ${s * 84} 60 ${s * 70} 50L${s * 86} 40L${s * 72} 30L${s * 56} 40Z`;
      return cel(d, s * 82, 32, { rx: 26, ry: 22, hi: 0.4 });
    };
    return {
      shadow: 90,
      art: `${legs(legList)}
        ${claw(-1)}${claw(1)}
        ${cel(shell, 0, 34, { rx: 58, ry: 30 })}
        <path class="bg-stalk" d="M-16 -58L-20 -84M16 -58L20 -84"/>
        <path class="bg-laptop" d="M-52 2H52L60 16H-60Z"/>
        <path class="bg-seam bg-detail" d="M-44 8H44M-40 12H40"/>
        <path class="bg-screen" d="M-46 -66H46V0H-46Z"/>
        <path class="bg-ok" d="M-22 -36L-8 -22L20 -50"/>
        ${label(-22, -6, "200 OK", " bg-label--screen")}
        ${face(
          [
            { x: -20, y: -92, r: 9, side: -1, look: 0.4 },
            { x: 20, y: -92, r: 9, side: 1, look: 0.4 }
          ],
          { mouth: { x: 0, y: 40, w: 12 } }
        )}
        ${tears(rng, [[-50, 46, 1], [-20, -46, -1]])}`
    };
  },

  // Off-by-One: a centipede whose last segment hangs past the end of the array, with one
  // leg too many.
  extra(rng) {
    const segs = Array.from({ length: 6 }, (_, i) => ({
      x: -46 + i * 26,
      y: 34 - 10 * Math.sin(i * 0.95 + 0.4),
      r: 17 - i * 0.6
    }));
    const legList = segs.flatMap(({ x, y }, i) => {
      const out = [leg(rng, x - 4, y + 10, -1, 12, { lift: 10 }), leg(rng, x + 4, y + 10, 1, 12, { lift: 10 })];
      if (i === segs.length - 1) out.push(leg(rng, x + 10, y + 6, 1, 24, { lift: 12 }));
      return out;
    });
    const body = segs
      .slice()
      .reverse()
      .map(({ x, y, r }, j) => {
        const i = segs.length - 1 - j;
        const d = ellipse(x, y, r, r * 0.92);
        const out = i === segs.length - 1;
        return `${cel(d, x, y, { rx: r, ry: r, hi: 0.4, rim: out ? " bg-rim--hot bg-rim--dash" : "" })}${label(x - 8, y + 4, `[${i}]`, " bg-label--index bg-detail")}`;
      })
      .join("");
    const head = blob(rng, -80, 14, 24, 21, 0.06, 9);
    return {
      shadow: 104,
      art: `${legs(legList, { cls: " bg-legs--short" })}
        <path class="bg-bracket" d="M-62 -6H-68V70H-62M66 -6H72V70H66"/>
        ${body}
        ${antennae(rng, [-90, -4], [-72, -6], { len: 30, spread: 16 })}
        ${cel(head, -80, 14, { rx: 24, ry: 21 })}
        ${mandibles(-80, 30, 11)}
        ${face(
          [
            { x: -89, y: 10, r: 7, side: -1, look: 0.7 },
            { x: -72, y: 10, r: 7, side: 1, look: 0.7 }
          ]
        )}
        ${label(70, -14, "+1", " bg-label--big")}
        ${label(-60, -14, "length 5", " bg-label--small bg-detail")}`
    };
  },

  // NullPointerException: a hollow ghost of a beetle, eyes like ∅, and a pointer that
  // points at nothing.
  void(rng) {
    const shell = blob(rng, 0, 14, 50, 58, 0.12, 11);
    const head = blob(rng, 0, -52, 26, 21, 0.08, 9);
    const legList = [-1, 1].flatMap((side) => fan(rng, side, [[side * 42, -4], [side * 48, 16], [side * 42, 38]], { reach: 54, step: 10, footY: 80 }));
    return {
      shadow: 54,
      hover: true,
      art: `${legs(legList, { cls: " bg-legs--ghost" })}
        <path class="bg-ghost" d="${shell}"/>
        <path class="bg-ghost" d="${head}"/>
        ${antennae(rng, [-10, -70], [10, -70], { len: 30, spread: 24 })}
        <circle class="bg-null" cx="0" cy="18" r="10"/>
        ${label(-18, 46, "null", " bg-label--ghost")}
        <path class="bg-pointer" d="M96 -64C70 -60 40 -30 14 8M14 8L18 -6M14 8L27 1"/>
        ${label(72, -72, "*ptr", " bg-label--small")}
        ${face(
          [
            { x: -11, y: -54, r: 8, side: -1 },
            { x: 11, y: -54, r: 8, side: 1 }
          ],
          { kind: "void", mouth: { x: 0, y: -40, w: 8 } }
        )}`
    };
  },

  // Spaghetti Script: a ball of tangled strands with eyes peeking out and goto tags.
  noodle(rng) {
    let strands = "";
    let back = "";
    for (let i = 0; i < 9; i += 1) {
      // Front strands walk around the rim (neighbouring angles), so the face stays clear;
      // the dimmer back strands may cross the middle.
      const front = i % 3 !== 0;
      let a = rng.range(0, Math.PI * 2);
      const turn = rng.pick([-1, 1]);
      const p = () => {
        a += front ? turn * rng.range(0.35, 0.8) : rng.range(1, 3);
        const r = front ? rng.range(38, 58) : rng.range(8, 50);
        return `${f(Math.cos(a) * r)} ${f(14 + Math.sin(a) * r * 0.95)}`;
      };
      const d = `M${p()}C${p()} ${p()} ${p()}S${p()} ${p()}S${p()} ${p()}`;
      if (front) strands += d;
      else back += d;
    }
    let drips = "";
    [-34, -12, 14, 36].forEach((x, i) => {
      const fx = x + rng.range(-14, 14);
      drips += `M${x} ${40 + i * 2}C${x + rng.range(-20, 20)} 60 ${fx + rng.range(-12, 12)} 74 ${f(fx)} ${GROUND - 2}`;
    });
    const ball = blob(rng, 0, 14, 54, 52, 0.12, 12);
    return {
      shadow: 80,
      art: `<path class="bg-noodle bg-noodle--drip" d="${drips}"/>
        ${cel(ball, 0, 14, { rx: 54, ry: 52 })}
        <path class="bg-noodle bg-noodle--back" d="${back}"/>
        ${face(
          [
            { x: -16, y: -6, r: 9, side: -1, look: 0.3 },
            { x: 14, y: -9, r: 9, side: 1, look: 0.3 }
          ],
          { mouth: { x: 0, y: 14, w: 10 } }
        )}
        <path class="bg-noodle bg-noodle--front" d="${strands}"/>
        <g class="bg-detail">
          ${label(-74, -34, "goto", " bg-label--tag")}
          ${label(44, 58, "flag2", " bg-label--tag")}
        </g>
        ${tears(rng, [[-30, 50, 1], [30, -54, -1]])}`
    };
  },

  // Fork Bomb: a round bomb-bug with a lit fuse; copies of it spawn behind (data-clones).
  fork(rng) {
    const mini = (x, y, s, n) => `<g class="bg-clone bg-clone--${n}" transform="translate(${x} ${y}) scale(${s})">
        ${cel(ellipse(0, 0, 40, 38), 0, 0, { rx: 40, ry: 38, hi: 0.3 })}
        <path class="bg-fuse" d="M6 -40Q14 -58 4 -66"/>
        <circle class="bg-spark-core" cx="4" cy="-68" r="5"/>
        <path class="bg-brow" d="M-20 -14L-6 -6M20 -14L6 -6"/>
        <circle class="bg-iris" cx="-12" cy="-2" r="5"/><circle class="bg-iris" cx="12" cy="-2" r="5"/>
      </g>`;
    const legList = [-1, 1].flatMap((side) => fan(rng, side, [[side * 38, 34], [side * 34, 48], [side * 26, 58]], { reach: 44, step: 10, lift: 16 }));
    const body = ellipse(0, 22, 48, 46);
    const spark = (cx, cy) => {
      let d = "";
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 6 : 15;
        d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
      }
      return `<path class="bg-spark" d="${d}Z"/><circle class="bg-spark-core" cx="${cx}" cy="${cy}" r="4"/>`;
    };
    return {
      shadow: 84,
      art: `${mini(-82, 40, 0.42, 1)}${mini(84, 30, 0.42, 2)}${mini(-70, -52, 0.34, 3)}
        ${legs(legList, { cls: " bg-legs--short" })}
        ${cel(body, 0, 22, { rx: 48, ry: 46 })}
        <path class="bg-cap" d="M-14 -30H14V-18H-14Z"/>
        <path class="bg-fuse" d="M2 -30C4 -54 30 -54 26 -76C24 -88 34 -94 42 -94"/>
        <g class="bg-spark-g">${spark(44, -96)}</g>
        <path class="bg-band bg-detail" d="M-46 34Q0 48 46 34L45 46Q0 60 -45 46Z"/>
        ${label(-22, 49, ":|:&amp;", " bg-label--band bg-detail")}
        ${face(
          [
            { x: -16, y: 8, r: 9, side: -1, look: 0 },
            { x: 16, y: 8, r: 9, side: 1, look: 0 }
          ],
          { mouth: { x: 0, y: 26, w: 11 } }
        )}
        ${tears(rng, [[0, 48, 1], [60, -46, -1]])}`
    };
  },

  // RenderFlex Overflow: a beetle too wide for its layout box; the part that spills out is
  // covered in yellow-and-black debug stripes.
  overflow(rng) {
    const legList = [-1, 1].flatMap((side) => fan(rng, side, [[side * 60 + 8, 14], [side * 56 + 8, 32], [side * 46 + 8, 50]], { reach: 50, step: 10, lift: 18 }));
    const body = ellipse(8, 18, 78, 50);
    const head = blob(rng, 0, -48, 24, 19, 0.06, 9);
    // The part of the body right of the box edge (x = 50): an arc and the edge.
    const spill = "M50 -26.4A78 50 0 0 1 50 62.4Z";
    return {
      shadow: 96,
      defs: `<pattern id="bg-hazard-__UID__" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="bg-hazard-b" width="16" height="16"/><rect class="bg-hazard-a" width="8" height="16"/>
        </pattern>`,
      art: `${legs(legList)}
        ${cel(body, 8, 18, { rx: 78, ry: 50 })}
        <path class="bg-hazard" d="${spill}" fill="url(#bg-hazard-__UID__)"/>
        <path class="bg-rim bg-rim--hot" d="${spill}"/>
        <path class="bg-seam bg-detail" d="M8 -24V64"/>
        <path class="bg-frame" d="M-56 -76H50V82H-56Z"/>
        ${antennae(rng, [-8, -62], [8, -62], { len: 28, spread: 26 })}
        ${cel(head, 0, -48, { rx: 24, ry: 19 })}
        ${mandibles(0, -32, 11)}
        ${face(
          [
            { x: -10, y: -50, r: 7.5, side: -1, look: 0.8 },
            { x: 10, y: -50, r: 7.5, side: 1, look: 0.8 }
          ]
        )}
        <path class="bg-pointer bg-detail" d="M54 -88H104M98 -94L104 -88L98 -82"/>
        ${label(54, -96, "42 PX", " bg-label--hot")}`
    };
  }
};

/** Names of the motifs (for tests). */
export const MOTIF_NAMES = Object.freeze(Object.keys(MOTIFS));

/** SVG markup for a bug sprite (viewBox -120..120). Ids inside are unique per call. */
export function bugSvg(bug) {
  let template = cache.get(bug.id);
  if (!template) {
    const rng = createRng(`bug:${bug.id}`);
    const motif = (MOTIFS[bug.motif] ?? MOTIFS.extra)(rng.fork("motif"));
    const shadowW = motif.shadow ?? 78;
    template = `<svg class="bug-sprite bug-sprite--${bug.motif}${motif.hover ? " is-hovering" : ""}" viewBox="-120 -130 240 240" aria-hidden="true" focusable="false">
    ${motif.defs ? `<defs>${motif.defs}</defs>` : ""}
    <ellipse class="bg-shadow" cx="0" cy="${GROUND + 2}" rx="${shadowW}" ry="9"/>
    <g class="bg-figure">${motif.art}</g>
  </svg>`;
    cache.set(bug.id, template);
  }
  uid += 1;
  return template.replaceAll("__UID__", String(uid));
}
