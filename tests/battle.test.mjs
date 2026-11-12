import test from "node:test";
import assert from "node:assert/strict";
import {
  BUGS, ENEMY_HP, affinity, availableBugs, pickWaves, rollDamage, rollEnemyHit, rank
} from "../js/battle-logic.js";

const SKILLS = ["Java", "Python", "Algorithms", "Docker", "Git", "SQL"];
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test("every skill is the weak spot of exactly one bug", () => {
  for (const skill of SKILLS) {
    assert.equal(BUGS.filter((bug) => affinity(bug, skill) === "weak").length, 1, skill);
  }
});

test("a bug never resists its own weakness, and affinity ignores case", () => {
  for (const bug of BUGS) {
    assert.notEqual(bug.weak, bug.resist);
    assert.equal(affinity(bug, bug.weak.toUpperCase()), "weak");
    assert.equal(affinity(bug, bug.resist), "resist");
  }
  assert.equal(affinity(BUGS[0], "COBOL"), "normal");
});

test("availableBugs follows the loadout", () => {
  assert.equal(availableBugs(SKILLS).length, BUGS.length);
  assert.deepEqual(availableBugs(["Git"]).map((bug) => bug.id), ["merge-conflict"]);
  assert.equal(availableBugs([]).length, 0);
});

test("pickWaves picks distinct bugs and honours the first one", () => {
  const waves = pickWaves(SKILLS, seq(0.9, 0.1, 0.5), { first: "off-by-one" });
  assert.equal(waves.length, 3);
  assert.equal(waves[0].id, "off-by-one");
  assert.equal(new Set(waves.map((bug) => bug.id)).size, 3);
  assert.equal(pickWaves(["Git"], Math.random).length, 1);
});

test("damage: weak spots hit hardest, resists barely scratch", () => {
  const weak = rollDamage("weak", () => 0.5).amount;
  const normal = rollDamage("normal", () => 0.5).amount;
  const resist = rollDamage("resist", () => 0.5).amount;
  assert.ok(weak > normal && normal > resist);
  // Two weak hits always fix a bug; three normal ones never quite do on minimum rolls.
  assert.ok(rollDamage("weak", () => 0).amount * 2 >= ENEMY_HP);
  assert.ok(rollDamage("normal", seq(0, 0.99)).amount * 3 < ENEMY_HP);
  // Crits only on normal hits.
  assert.equal(rollDamage("normal", seq(0.5, 0)).crit, true);
  assert.equal(rollDamage("weak", seq(0.5, 0)).crit, false);
});

test("enemy hits stay in range", () => {
  assert.equal(rollEnemyHit(() => 0), 8);
  assert.equal(rollEnemyHit(() => 0.999), 16);
});

test("rank", () => {
  assert.equal(rank({ turns: 6, damageTaken: 0, weakHits: 3 }), "S");
  assert.equal(rank({ turns: 9, damageTaken: 20, weakHits: 1 }), "B");
  assert.equal(rank({ turns: 8, damageTaken: 20, weakHits: 3 }), "A");
  assert.equal(rank({ turns: 14, damageTaken: 70, weakHits: 0 }), "C");
});
