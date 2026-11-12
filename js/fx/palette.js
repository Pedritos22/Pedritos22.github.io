// Colour values for canvas/WebGL drawing. They mirror the tokens in css/base.css and
// DESIGN.md section 2 (canvas and GLSL cannot read CSS custom properties per pixel, and the
// Dark Hour set only exists under html[data-darkhour]). Keep both tables in sync with base.css.

export const NORMAL = Object.freeze({
  ink: [2, 7, 19],
  abyss: [4, 16, 38],
  night: [6, 26, 58],
  deep: [11, 47, 120],
  blue: [4, 85, 255],
  blueSoft: [79, 159, 255],
  cyan: [70, 216, 255],
  ice: [191, 233, 255],
  paper: [247, 251, 255],
  red: [217, 9, 45],
  hot: [255, 108, 142],
  gold: [255, 211, 77]
});

export const DARK = Object.freeze({
  ink: [2, 7, 19],
  abyss: [3, 13, 8],
  night: [6, 23, 14],
  deep: [15, 61, 36],
  blue: [19, 163, 90],
  blueSoft: [127, 220, 143],
  cyan: [200, 255, 106],
  ice: [191, 233, 255],
  paper: [247, 251, 255],
  red: [163, 0, 31],
  hot: [255, 64, 96],
  gold: [233, 245, 154],
  sky: [11, 36, 20],
  glow: [168, 255, 96],
  blood: [90, 0, 18]
});

export const rgba = ([r, g, b], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

export const mixRgb = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];

/** [r, g, b] 0..255 -> GLSL vec3 literal. */
export const glsl = ([r, g, b]) => `vec3(${(r / 255).toFixed(4)}, ${(g / 255).toFixed(4)}, ${(b / 255).toFixed(4)})`;
