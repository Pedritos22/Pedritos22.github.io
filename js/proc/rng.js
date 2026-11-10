// Seeded randomness. Use this (never Math.random) for any visual content that must be
// stable between visits: sigils, skyline, butterfly wing patterns, music progressions.
// Math.random is fine for ephemeral effects (shards, particles).

/** cyrb53: fast, well-distributed 53-bit string hash. */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: tiny 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** YYYY-MM-DD in local time. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Seed that changes once per local calendar day. */
export function seedFromDate(date = new Date(), label = "") {
  return hashString(`${dateKey(date)}:${label}`);
}

/**
 * Seeded RNG with helpers. `seed` may be a number or a string.
 * rng.fork(label) derives an independent stream, so adding draws in one
 * generator never shifts the output of another.
 */
export function createRng(seed) {
  const base = typeof seed === "string" ? hashString(seed) : Math.floor(Number(seed) || 0);
  const next = mulberry32(base % 4294967296);
  let spareGaussian = null;

  const rng = {
    seed: base,
    next,
    float: (min = 0, max = 1) => min + (max - min) * next(),
    range: (min, max) => min + (max - min) * next(),
    /** Integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p = 0.5) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Weighted pick: entries are [value, weight]. */
    weighted(entries) {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** Standard normal sample (Box-Muller). */
    gaussian(mean = 0, sd = 1) {
      if (spareGaussian !== null) {
        const value = spareGaussian;
        spareGaussian = null;
        return mean + sd * value;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spareGaussian = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    /** Returns a shuffled copy. */
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    fork: (label) => createRng(hashString(String(label), base % 4294967296))
  };

  return rng;
}
