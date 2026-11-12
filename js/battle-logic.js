// Debug Battle rules: the bugs, their weak spots, damage and ranks. Pure (no DOM), so the
// numbers can be tested (tests/battle.test.mjs). The UI lives in js/battle.js.
//
// The visitor fights with the skills from the Skills card (content.js). Every bug is weak
// to exactly one of them and shrugs off another; hitting a weak spot deals heavy damage and
// grants an extra turn.

export const PLAYER_HP = 100;
export const ENEMY_HP = 100;
export const WAVES = 3;

export const BUGS = Object.freeze([
  {
    id: "merge-conflict",
    name: "Merge Conflict",
    weak: "Git",
    resist: "Python",
    motif: "split",
    fix: "git mergetool walks every hunk. Both sides agree.",
    lines: ["<<<<<<< HEAD stares back at you.", "Both branches insist they are right.", "A rebase rewrites your afternoon."]
  },
  {
    id: "sql-injection",
    name: "SQL Injection",
    weak: "SQL",
    resist: "Docker",
    motif: "needle",
    fix: "Prepared statements. Nothing gets in.",
    lines: ["'; DROP TABLE morale; --", "The query returns everything. Everything.", "A quote mark slips past the login form."]
  },
  {
    id: "works-on-my-machine",
    name: "Works On My Machine",
    weak: "Docker",
    resist: "Git",
    motif: "box",
    fix: "One image, every machine. It just runs.",
    lines: ["It works fine over here.", "The setup guide is 40 steps long.", "A missing env var ruins the demo."]
  },
  {
    id: "off-by-one",
    name: "Off-by-One",
    weak: "Algorithms",
    resist: "SQL",
    motif: "extra",
    fix: "Loop invariant proven. The boundary holds.",
    lines: ["The loop runs one more time. Just one.", "Index out of bounds. Again.", "Fencepost or fence? Nobody knows."]
  },
  {
    id: "null-pointer",
    name: "NullPointerException",
    weak: "Java",
    resist: "Algorithms",
    motif: "void",
    fix: "Optional.ofNullable() catches it cleanly.",
    lines: ["Something you trusted was null.", "The stack trace is 200 lines long.", "It only happens in production."]
  },
  {
    id: "spaghetti",
    name: "Spaghetti Script",
    weak: "Python",
    resist: "Java",
    motif: "noodle",
    fix: "Refactored into three tidy functions.",
    lines: ["A 900-line function wraps around you.", "Global variables everywhere.", "Nobody remembers what flag2 does."]
  }
]);

/** "weak" | "resist" | "normal" for a skill name against a bug. */
export function affinity(bug, skill) {
  const key = String(skill).toLowerCase();
  if (bug.weak.toLowerCase() === key) return "weak";
  if (bug.resist.toLowerCase() === key) return "resist";
  return "normal";
}

/** Bugs that can be beaten with this loadout (their weak spot is one of the skills). */
export function availableBugs(skills) {
  const names = new Set(skills.map((name) => String(name).toLowerCase()));
  return BUGS.filter((bug) => names.has(bug.weak.toLowerCase()));
}

/** Pick `count` different bugs for the waves, optionally starting with `first`. */
export function pickWaves(skills, rand = Math.random, { count = WAVES, first = null } = {}) {
  const pool = availableBugs(skills).slice();
  const out = [];
  if (first) {
    const index = pool.findIndex((bug) => bug.id === first);
    if (index >= 0) out.push(...pool.splice(index, 1));
  }
  while (out.length < count && pool.length) {
    out.push(...pool.splice(Math.floor(rand() * pool.length), 1));
  }
  return out;
}

const BASE = { weak: 60, normal: 30, resist: 9 };
const CRIT_CHANCE = 0.12;

/** Damage of one hit: {amount, crit}. Weak spots never crit (they already hit hard). */
export function rollDamage(kind, rand = Math.random) {
  const base = BASE[kind] ?? BASE.normal;
  const spread = 0.85 + rand() * 0.3;
  const crit = kind === "normal" && rand() < CRIT_CHANCE;
  return { amount: Math.round(base * spread * (crit ? 1.6 : 1)), crit };
}

/** Stress a bug deals to the player on its turn. */
export function rollEnemyHit(rand = Math.random) {
  return 8 + Math.floor(rand() * 9); // 8..16
}

/**
 * Rank for a cleared run: S for a clean, sharp run, then A / B / C.
 * `turns` counts the player's actions; `weakHits` how many found a weak spot.
 */
export function rank({ turns, damageTaken, weakHits, waves = WAVES }) {
  let score = 0;
  if (damageTaken === 0) score += 2;
  else if (damageTaken <= 25) score += 1;
  if (turns <= waves * 2) score += 2;
  else if (turns <= waves * 3) score += 1;
  if (weakHits >= waves) score += 1;
  if (score >= 5) return "S";
  if (score >= 3) return "A";
  if (score >= 2) return "B";
  return "C";
}
