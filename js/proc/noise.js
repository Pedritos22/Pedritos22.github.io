// Seeded simplex noise (2D/3D), fractal Brownian motion and curl noise.
// Based on Stefan Gustavson's public-domain simplex noise reference.
import { createRng } from "./rng.js";

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

/**
 * createNoise(seed) -> { noise2, noise3, fbm2, fbm3, curl2 }
 * noise2/noise3 return values in roughly [-1, 1].
 */
export function createNoise(seed = 0) {
  const rng = createRng(seed);
  const p = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = GRAD3[permMod12[ii + perm[jj]]];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1]]];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1]]];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1; let j1; let k1; let i2; let j2; let k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }

    const x1 = x0 - i1 + G3; const y1 = y0 - j1 + G3; const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3; const y2 = y0 - j2 + 2 * G3; const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3; const y3 = y0 - 1 + 3 * G3; const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255; const jj = j & 255; const kk = k & 255;

    const corner = (tx, ty, tz, gi) => {
      let tt = 0.6 - tx * tx - ty * ty - tz * tz;
      if (tt < 0) return 0;
      const g = GRAD3[gi];
      tt *= tt;
      return tt * tt * (g[0] * tx + g[1] * ty + g[2] * tz);
    };

    const n0 = corner(x0, y0, z0, permMod12[ii + perm[jj + perm[kk]]]);
    const n1 = corner(x1, y1, z1, permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]);
    const n2 = corner(x2, y2, z2, permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]);
    const n3 = corner(x3, y3, z3, permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]);
    return 32 * (n0 + n1 + n2 + n3);
  }

  /** Fractal Brownian motion over noise2. Output roughly [-1, 1]. */
  function fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  function fbm3(x, y, z, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Divergence-free 2D flow field (curl of a scalar noise potential), animated by t.
   * Returns [vx, vy]. Great for butterflies, bubbles and drifting particles.
   */
  function curl2(x, y, t = 0, eps = 0.0001) {
    const dx = (noise3(x, y + eps, t) - noise3(x, y - eps, t)) / (2 * eps);
    const dy = (noise3(x + eps, y, t) - noise3(x - eps, y, t)) / (2 * eps);
    return [dx, -dy];
  }

  return { noise2, noise3, fbm2, fbm3, curl2 };
}
