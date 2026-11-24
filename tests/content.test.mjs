// Content and translations: both languages say the same things in the same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentFor, sectionFromHash, FEATURED_PROJECTS, PROFILE } from "../js/content.js";
import { STRINGS, localize, LANGS } from "../js/i18n.js";
import { BUGS } from "../js/battle-logic.js";

const en = contentFor("en");
const pl = contentFor("pl");

/** Walk two resolved structures in parallel; they must have the same keys and lengths. */
function sameShape(a, b, path = "") {
  if (Array.isArray(a)) {
    assert.ok(Array.isArray(b), `${path} is an array in one language only`);
    assert.equal(a.length, b.length, `${path} has a different length`);
    a.forEach((item, i) => sameShape(item, b[i], `${path}[${i}]`));
    return;
  }
  if (a && typeof a === "object") {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${path} has different keys`);
    for (const key of Object.keys(a)) sameShape(a[key], b[key], `${path}.${key}`);
    return;
  }
  assert.equal(typeof a, typeof b, `${path} changes type`);
}

test("English and Polish content have the same shape", () => {
  sameShape(en.home, pl.home, "home");
  sameShape(en.sections, pl.sections, "sections");
  sameShape(en.depths, pl.depths, "depths");
  sameShape(en.projectNotes, pl.projectNotes, "projectNotes");
  sameShape(en.highlights, pl.highlights, "highlights");
  sameShape(en.quests, pl.quests, "quests");
  sameShape(en.schooling, pl.schooling, "schooling");
});

test("quest log entries have valid periods, newest role first", () => {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  for (const quest of en.quests) {
    assert.ok(quest.roles.length > 0, `${quest.id} has no role`);
    quest.roles.forEach((role, i) => {
      assert.match(role.from, month, `${quest.id}: bad start ${role.from}`);
      if (role.to !== null) {
        assert.match(role.to, month, `${quest.id}: bad end ${role.to}`);
        assert.ok(role.to >= role.from, `${quest.id}: ends before it starts`);
      }
      if (i > 0) assert.ok(role.from <= quest.roles[i - 1].from, `${quest.id}: roles must be newest first`);
    });
    for (const c of [en, pl]) {
      const note = c.quests.find((q) => q.id === quest.id).note;
      assert.ok(note.length <= 130, `${quest.id}: the card note must stay short (${note.length})`);
    }
  }
  assert.ok(en.quests.some((q) => q.group === "work" && q.roles[0].to === null), "a current job is listed");
});

test("no { en, pl } leaf is left unresolved", () => {
  const walk = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${path}[${i}]`));
    if (value && typeof value === "object") {
      assert.ok(!("en" in value && "pl" in value), `${path} was not resolved`);
      for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
    }
  };
  walk(pl, "pl");
  walk(en, "en");
});

test("the Polish copy is actually translated where it should be", () => {
  const titles = (c) => c.sections.map((s) => s.title);
  const differing = titles(en).filter((title, i) => title !== titles(pl)[i]);
  assert.equal(differing.length, en.sections.length, "every section title has a Polish version");
});

test("ids, skill names and spells never change with the language", () => {
  assert.deepEqual(en.sections.map((s) => s.id), pl.sections.map((s) => s.id));
  const skills = (c) => c.sectionMap.skills.skills.map(({ name, mark, spell }) => ({ name, mark, spell }));
  assert.deepEqual(skills(en), skills(pl));
});

test("skill card backs fit the small card in both languages", () => {
  for (const c of [en, pl]) {
    const { skills, fool } = c.sectionMap.skills;
    for (const skill of [...skills, fool]) assert.ok(skill.desc.length <= 52, `${skill.name}: "${skill.desc}" is too long`);
  }
});

test("every Debug Battle bug still finds its weak skill in the deck", () => {
  const names = new Set(en.sectionMap.skills.skills.map((s) => s.name));
  for (const bug of BUGS) assert.ok(names.has(bug.weak), `${bug.name} is weak to a missing skill`);
});

test("every featured project has a note with a summary and a stack", () => {
  for (const name of FEATURED_PROJECTS) {
    for (const c of [en, pl]) {
      const note = c.projectNotes[name];
      assert.ok(note, `${name} has no note`);
      assert.ok(note.summary.length > 20 && note.summary.length <= 115, `${name}: summary must fit three lines on the card`);
      assert.ok(note.stack.length > 0, `${name} has no stack`);
    }
  }
});

test("sectionFromHash accepts both URL forms and rejects the rest", () => {
  assert.equal(sectionFromHash("#projects"), "projects");
  assert.equal(sectionFromHash("#section-contact"), "contact");
  assert.equal(sectionFromHash("#home"), "home");
  assert.equal(sectionFromHash("#main"), null);
  assert.equal(sectionFromHash(""), null);
});

test("interface strings exist in every language with the same placeholders", () => {
  const vars = (text) => (text.match(/\{\w+\}/g) || []).sort().join();
  for (const [key, entry] of Object.entries(STRINGS)) {
    for (const lang of LANGS) assert.equal(typeof entry[lang], "string", `${key} has no ${lang} text`);
    assert.equal(vars(entry.en), vars(entry.pl), `${key} placeholders differ`);
  }
});

test("localize resolves nested leaves and keeps everything else", () => {
  const fn = () => 1;
  const out = localize({ a: { en: "A", pl: "Ą" }, b: [{ en: "x", pl: "y" }, 3], c: fn, d: "plain" }, "pl");
  assert.deepEqual(out, { a: "Ą", b: ["y", 3], c: fn, d: "plain" });
});

test("profile links are https and the email is plain", () => {
  for (const key of ["github", "linkedin", "site"]) assert.match(PROFILE[key], /^https:\/\//);
  assert.match(PROFILE.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
});
