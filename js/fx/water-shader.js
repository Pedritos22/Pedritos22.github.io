// GLSL for the full-screen "moonlight on water" background (js/background.js).
// Budget: 4 gradient-noise evaluations per pixel (2 for the domain warp, 2 for the caustic
// ridges); light shafts, grain and static use cheap trig/hash only.
import { NORMAL, DARK, glsl } from "./palette.js";

export const VERTEX = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;   // eased pointer, -1..1 (y down)
uniform vec2 uMoon;    // emblem centre, 0..1 (GL space, y up)
uniform float uDark;   // 0..1 Dark Hour mix
uniform float uPulse;  // 0..1 low-frequency music energy
uniform float uFlash;  // 0..1 section-change sweep amplitude
uniform float uSweep;  // 0..1 sweep band position
uniform float uDir;    // +1 left->right, -1 right->left
uniform float uKick;   // 0..1 global light kick (glass break)

const vec3 INK = ${glsl(NORMAL.ink)};
const vec3 NIGHT = ${glsl(NORMAL.night)};
const vec3 DEEP = ${glsl(NORMAL.deep)};
const vec3 BLUE = ${glsl(NORMAL.blue)};
const vec3 CYAN = ${glsl(NORMAL.cyan)};
const vec3 ICE = ${glsl(NORMAL.ice)};

const vec3 DH_INK = vec3(0.0060, 0.0180, 0.0100);
const vec3 DH_NIGHT = ${glsl(DARK.night)};
const vec3 DH_SKY = ${glsl(DARK.sky)};
const vec3 DH_DEEP = ${glsl(DARK.deep)};
const vec3 DH_GLOW = ${glsl(DARK.glow)};
const vec3 DH_MOON = ${glsl(DARK.gold)};
const vec3 DH_BLOOD = ${glsl(DARK.blood)};

// -8deg major angle: shaft/sweep direction (y up) and its normal.
const vec2 AXIS = vec2(0.139173, -0.990268);
const vec2 NORMAL_AXIS = vec2(0.990268, 0.139173);

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Quintic gradient noise, roughly -0.7..0.7.
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Caustic web: bright, wavy cell borders (F2 - F1 of a drifting Voronoi lattice) in a
// domain-warped space. The 3x3 cell search costs about two noise octaves.
float caustics(vec2 p, float t, out vec2 warp) {
  vec2 w = vec2(
    gnoise(p * 0.45 + vec2(0.0, t * 0.06)),
    gnoise(p * 0.45 + vec2(5.2, -t * 0.05))
  );
  warp = w;
  vec2 q = p + w * 1.1;
  vec2 i = floor(q);
  vec2 f = fract(q);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      o = 0.5 + 0.38 * sin(t * 0.32 + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float line = exp(-edge * 11.0);
  float core = exp(-edge * 34.0);
  // Patches of strong light drift across the web, like refracted moonlight.
  float patchy = smoothstep(-0.35, 0.45, w.y + w.x * 0.5);
  return (line * 0.35 + core) * (0.25 + 0.75 * patchy);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 moon = (uMoon - 0.5) * vec2(aspect, 1.0);
  vec2 par = vec2(uMouse.x, -uMouse.y);
  float t = uTime;

  // ---- base: vertical ink -> night -> deep, horizon band just above the skyline
  float y = uv.y;
  // City glow on the horizon (behind the skyline), fading up into the night.
  vec3 horizon = mix(DEEP, BLUE, 0.16) * (0.82 + 0.18 * uv.x);
  vec3 col = mix(horizon, NIGHT, smoothstep(0.04, 0.4, y));
  col = mix(col, INK, smoothstep(0.38, 0.98, y));
  vec3 dhBase = mix(DH_DEEP * 0.7, DH_SKY, smoothstep(0.02, 0.4, y));
  dhBase = mix(dhBase, DH_INK, smoothstep(0.45, 1.0, y));
  col = mix(col, dhBase, uDark);

  // ---- light masks: moon glow (upper right), keep the left column dark
  vec2 rel = p - moon - par * 0.012;
  float dMoon = length(rel);
  float glow = exp(-dMoon * 2.3);
  float halo = exp(-dMoon * 6.5);
  float rightness = smoothstep(0.18, 0.95, uv.x);
  float leftShade = 1.0 - smoothstep(0.0, 0.52, uv.x);
  float light = clamp(glow * 1.15 + rightness * 0.32 + (1.0 - y) * 0.06, 0.0, 1.0);

  vec3 moonTint = mix(mix(BLUE, CYAN, 0.35), DH_GLOW * 0.8, uDark);
  col += moonTint * (glow * 0.16 + halo * 0.22) * (1.0 + uPulse * 0.6);

  // ---- caustics
  vec2 warp2;
  vec2 cp = p * 4.6 + par * 0.1 + vec2(0.0, t * 0.02);
  float c = caustics(cp, t, warp2);
  float warp = warp2.x;
  float causticAmt = (0.05 + 0.62 * light) * (1.0 - leftShade * 0.72);
  causticAmt *= 1.0 + uPulse * 0.8 + uKick * 1.4 + uFlash * 0.6;
  vec3 causticCol = mix(mix(BLUE * 0.85, CYAN, 0.45 + 0.25 * warp), DH_GLOW, uDark);
  col += causticCol * c * causticAmt * 0.2;
  // a softer, wider bloom of the same web
  col += mix(DEEP, DH_DEEP, uDark) * (0.6 + 0.6 * warp) * light * 0.12;

  // ---- light shafts at the major angle, fanning down from the moon
  float across = dot(rel, NORMAL_AXIS);
  float along = dot(rel, AXIS);
  float fan = across / (along + 1.35);
  float rays = 0.5 + 0.5 * sin(fan * 52.0 + t * 0.21)
             + 0.35 * sin(fan * 89.0 - t * 0.17 + 1.7)
             + 0.25 * sin(fan * 143.0 + t * 0.13 + warp * 1.5);
  rays = smoothstep(0.6, 1.5, rays);
  float shaftMask = smoothstep(-0.1, 0.25, along) * exp(-max(along, 0.0) * 0.85)
                  * exp(-abs(across) * 1.1);
  vec3 shaftCol = mix(ICE * 0.55 + CYAN * 0.25, DH_MOON * 0.7, uDark);
  col += shaftCol * rays * shaftMask * (0.13 + uPulse * 0.06) * (1.0 - leftShade * 0.7);

  // ---- section-change sweep: a crisp diagonal band of light
  float s = dot(p, NORMAL_AXIS);
  float span = aspect * 0.5 + 0.35;
  float center = mix(-span, span, uDir > 0.0 ? uSweep : 1.0 - uSweep);
  float band = s - center;
  float sweep = exp(-band * band * 90.0) * 0.9 + exp(-band * band * 9.0) * 0.25;
  vec3 sweepCol = mix(mix(CYAN, ICE, 0.5), DH_GLOW, uDark);
  col += sweepCol * sweep * uFlash * 0.32;
  col += moonTint * uKick * 0.05;

  // ---- Dark Hour: faint blood haze on the horizon + flickering static
  if (uDark > 0.001) {
    col += DH_BLOOD * smoothstep(0.32, 0.0, y) * 0.22 * uDark;
    float row = floor(gl_FragCoord.y / 2.0);
    float frame = floor(t * 14.0);
    float line = step(0.985, hash12(vec2(row, frame)));
    float flicker = 0.85 + 0.15 * hash12(vec2(frame, 7.0));
    col += DH_GLOW * line * 0.018 * uDark;
    col *= mix(1.0, flicker, 0.35 * uDark);
  }

  // ---- vignette + left shade
  vec2 v = uv - vec2(0.62, 0.55);
  float vig = smoothstep(0.35, 1.05, length(v * vec2(1.0, 1.25)));
  col *= 1.0 - vig * 0.55;
  col *= 1.0 - leftShade * 0.32;

  // ---- film grain (hash, no texture)
  float g = hash12(gl_FragCoord.xy + fract(t * 7.13) * 413.0) - 0.5;
  col += g * 0.022;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
