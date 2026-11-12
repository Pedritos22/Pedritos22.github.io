// QA only (?perfprobe or ?perfprobe=<rounds>): cycles through every section like a visitor
// clicking the menu, records requestAnimationFrame deltas during each transition and logs a
// table (p50 / p95 / max frame time, frames over 25 ms and 50 ms). Loaded by main.js only
// when the flag is present. Results: console.table + window.__perfprobe, and
// html[data-perfprobe="done"] once finished (for automation).
import { afterIntro, params, isMobileLayout } from "./core.js";
import { showSection, getSectionNames } from "./sections.js";

const WINDOW_MS = 1000; // record this long after each click (a full transition is ~0.8 s)
const GAP_MS = 450; // rest between clicks
const SETTLE_MS = 2200; // let the entrance, fonts and the GitHub fetch settle first
const IDLE_MS = 1500; // idle baseline before the first click

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** rAF deltas (ms) for `ms` milliseconds. */
function record(ms) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      else deltas.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(step);
      else resolve(deltas);
    };
    requestAnimationFrame(step);
  });
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function summarize(deltas) {
  const sorted = deltas.slice().sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    frames: deltas.length,
    p50: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1] ?? 0),
    over25: deltas.filter((d) => d > 25).length,
    over50: deltas.filter((d) => d > 50).length
  };
}

function click(section) {
  const item = document.querySelector(`.menu-item[data-section="${CSS.escape(section)}"]`);
  if (item && !item.disabled) item.click();
  else showSection(section);
}

async function run() {
  const rounds = Math.max(1, Number.parseInt(params.get("perfprobe"), 10) || 3);
  if (isMobileLayout()) console.warn("[perfprobe] mobile layout: transitions are scrolls, results are not comparable");

  await wait(SETTLE_MS);
  const idle = summarize(await record(IDLE_MS));

  const order = [...getSectionNames(), "home"];
  const perSection = new Map(order.map((id) => [id, []]));
  for (let round = 0; round < rounds; round += 1) {
    for (const id of order) {
      const done = record(WINDOW_MS);
      click(id);
      perSection.get(id).push(...(await done));
      await wait(GAP_MS);
    }
  }

  const rows = { idle };
  const all = [];
  perSection.forEach((deltas, id) => {
    rows[id] = summarize(deltas);
    all.push(...deltas);
  });
  rows.transitions = summarize(all);

  const result = {
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    rounds,
    rows
  };
  window.__perfprobe = result;
  console.log(`[perfprobe] ${result.viewport}, ${rounds} rounds`);
  console.table(rows);
  document.documentElement.dataset.perfprobe = "done";
}

export function init() {
  afterIntro(() => {
    run().catch((error) => console.error("[perfprobe] failed", error));
  });
}
