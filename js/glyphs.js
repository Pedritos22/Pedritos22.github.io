// Small hand-drawn UI glyphs for card rows (24x24, stroke-only, currentColor).
// Owner: menu/panel workstream (B). Generic shapes only: no brand logos.

const PATHS = {
  // Two overlapping angular speech bubbles (languages).
  speech: "M3 4h11v8H8l-3 3v-3H3z M10 12v3h6l3 3v-3h2V8h-7",
  // Upright game tile with a dotted face (board game).
  tile: "M6 3h12v18H6z M9.5 7.5h1 M13.5 7.5h1 M11.5 12h1 M9.5 16.5h1 M13.5 16.5h1",
  // Drink carton with a straw (beverage).
  drink: "M7 9h10v12H7z M7 9l2-3h6l2 3 M14 6l2-4h3 M10 14h4",
  // ID badge (name).
  badge: "M4 6h16v13H4z M9 3h6v3H9z M8 11h3v3H8z M14 11h3 M14 14h3",
  // Map pin (location).
  pin: "M12 21l-6-8a7 7 0 1 1 12 0z M12 7.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5",
  // Two swatches (colour).
  swatch: "M3 5h9v9H3z M12 10h9v9h-9",
  // Columned building (institution).
  institution: "M3 9l9-5 9 5z M5 9v8 M9.5 9v8 M14.5 9v8 M19 9v8 M3 20h18",
  // Angle brackets (program).
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.5 5l-3 14",
  // Crosshair (focus).
  focus: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8",
  // Envelope.
  mail: "M3 6h18v12H3z M3 6l9 7 9-7",
  // Three linked nodes (professional network).
  network: "M7 6a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M21 6a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M14 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M7 6h10 M6 8l5 8 M18 8l-5 8",
  // Commit graph (code hosting).
  branch: "M9 5a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M9 19a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M19 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0 M7 7v10 M17 9v1c0 4-10 3-10 7",
  // Two stacked sheets (copy).
  copy: "M8 8h12v13H8z M4 3h12v3 M4 3v13h3",
  // Check mark.
  check: "M4 12.5l5 5L20 6.5",
  // Arrow out of a box (external link).
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6"
};

/** Inline SVG for a glyph name (decorative, aria-hidden). Unknown names return "". */
export function glyph(name, className = "glyph") {
  const d = PATHS[name];
  if (!d) return "";
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter"><path d="${d}"/></svg>`;
}
