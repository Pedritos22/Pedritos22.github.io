// index.html guards. The Content-Security-Policy allows the one inline script by its hash
// (editing that script without updating the hash would silently break the intro cover),
// and the modulepreload list matches the module graph of the first paint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("the inline script's hash is in the CSP", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, "index.html has a CSP meta tag");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const body of scripts) {
    const hash = createHash("sha256").update(body).digest("base64");
    assert.ok(csp.includes(`'sha256-${hash}'`), `inline script is not allowed by the CSP (expected 'sha256-${hash}')`);
  }
});

test("the modulepreload list matches the modules of the first paint", async () => {
  const { firstPaintModules } = await import("../tools/module-graph.mjs");
  const listed = [...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, await firstPaintModules(), "run node tools/module-graph.mjs");
});
