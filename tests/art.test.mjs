import test from "node:test";
import assert from "node:assert/strict";
import { BUGS } from "../js/battle-logic.js";
import { bugSvg, MOTIF_NAMES } from "../js/fx/bug-art.js";
import { MARKS, mark, tint } from "../js/marks.js";
import { renderSigil, HUB_RADIUS } from "../js/sigils.js";

// Mirrors the marks used by the Skills card in js/content.js (plus the Fool's).
const CARD_MARKS = ["java", "python", "flutter", "sql", "algorithms", "git", "docker", "bash", "go"];

test("every bug has a motif of its own", () => {
  const motifs = BUGS.map((bug) => bug.motif);
  assert.equal(new Set(motifs).size, motifs.length);
  for (const motif of motifs) assert.ok(MOTIF_NAMES.includes(motif), motif);
});

test("bug sprites draw every expression and stay deterministic", () => {
  for (const bug of BUGS) {
    const svg = bugSvg(bug);
    assert.match(svg, new RegExp(`bug-sprite--${bug.motif}`));
    for (const face of ["idle", "hurt", "dizzy", "down"]) assert.match(svg, new RegExp(`bg-face--${face}`), `${bug.id} ${face}`);
    // Same art on every call; only the per-call ids differ.
    assert.equal(svg.replace(/bg-hazard-\d+/g, ""), bugSvg(bug).replace(/bg-hazard-\d+/g, ""));
  }
});

test("pattern ids are unique per sprite instance", () => {
  const bug = BUGS.find((b) => b.motif === "overflow");
  const id = (svg) => svg.match(/id="(bg-hazard-\d+)"/)[1];
  assert.notEqual(id(bugSvg(bug)), id(bugSvg(bug)));
});

test("Fork Bomb has three clones to reveal", () => {
  const svg = bugSvg(BUGS.find((b) => b.motif === "fork"));
  for (const n of [1, 2, 3]) assert.match(svg, new RegExp(`bg-clone--${n}`));
});

test("every card mark exists, renders and has a tint", () => {
  for (const name of CARD_MARKS) {
    assert.ok(MARKS[name], name);
    assert.match(mark(name), /^<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"/);
    assert.ok(tint(name));
  }
  assert.equal(mark("cobol"), "");
});

test("a sigil with a hub keeps its shape and swaps the centre mark for the medallion", () => {
  const plain = renderSigil("Java");
  const hub = renderSigil("Java", { hub: true });
  assert.doesNotMatch(plain, /sg-hub/);
  assert.match(hub, new RegExp(`class="sg-draw sg-hub" r="${HUB_RADIUS}"`));
  // Same star either way (the rng draws do not depend on the hub).
  const star = (svg) => svg.match(/data-star="([^"]+)"/)[1];
  assert.equal(star(plain), star(hub));
});
