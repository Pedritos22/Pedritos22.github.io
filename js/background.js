// Atmosphere workstream (A): WebGL "moonlight on water" background in .fx-root.
// Half-resolution full-screen shader (caustics, light shafts, grain), driven by the moon
// emblem position, the pointer, Dark Hour, the lo-fi analyser and section changes.
// Falls back to the CSS gradient in css/effects.css when WebGL is missing or ?nofx is set.
import {
  EVT, on, state, flags, params, prefersReducedMotion, onReducedMotionChange,
  onLayoutChange, rafLoop, clamp, now as worldNow
} from "./core.js";
import { hourOf, twilight, daylight } from "./time-math.js";
import { gsap, DUR, EASE } from "./motion.js";
import { lofi } from "./lofi.js";
import { VERTEX, FRAGMENT } from "./fx/water-shader.js";
import { pointer, installPointer, damp } from "./fx/pointer.js";
import { initSlash, sweepPath, SWEEP_DURATION, SWEEP_EDGE } from "./fx/slash.js";

const MAX_PIXELS = 1_100_000; // hard cap on the internal buffer (4K screens)
const DEFAULT_MOON = [0.84, 0.82];

let root = null;
let canvas = null;
let gl = null;
let program = null;
let uniforms = {};
let stopLoop = null;
let lost = false;
let reduced = false;

const fx = {
  time: 0,
  mouse: [0, 0],
  moon: DEFAULT_MOON.slice(),
  dark: 0,
  pulse: 0,
  flash: 0,
  sweep: -1,
  dir: 1,
  kick: 0,
  twilight: 0,
  day: 0
};

/** Time-of-day light from the world clock (real, or moved by the time dial). */
function readClock() {
  const hour = hourOf(worldNow());
  fx.twilight = twilight(hour);
  fx.day = daylight(hour);
}
readClock();

let analyserData = null;
let analyserRef = null;

/* ------------------------------------------------------------------ GL setup */

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[background] shader compile failed: ${log}`);
  }
  return shader;
}

function buildProgram() {
  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`[background] program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  // One oversized triangle covers the screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  uniforms = {};
  ["uRes", "uTime", "uMouse", "uMoon", "uDark", "uPulse", "uFlash", "uSweep", "uDir", "uKick", "uTwilight", "uDay"].forEach((name) => {
    uniforms[name] = gl.getUniformLocation(prog, name);
  });
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  return prog;
}

function createContext() {
  const options = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: false
  };
  return canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
}

/* -------------------------------------------------------------------- sizing */

function resize() {
  if (!canvas || !gl) return;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  // Half of the CSS size on standard screens, never more than 0.5x CSS px.
  let scale = Math.min(0.5, 0.5 * dpr);
  const pixels = width * height * scale * scale;
  if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  measureMoon();
  if (reduced) renderOnce();
}

/** Light comes from the emblem: read the centre of .emblem-mount (once per layout change). */
function measureMoon() {
  const mount = document.querySelector(".emblem-mount");
  const rect = mount?.getBoundingClientRect();
  const visible = rect && rect.width > 8 && getComputedStyle(mount).display !== "none";
  if (!visible) {
    fx.moon = DEFAULT_MOON.slice();
    return;
  }
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  fx.moon = [clamp(x, -0.2, 1.2), clamp(1 - y, -0.2, 1.2)];
}

/* ------------------------------------------------------------------- drawing */

function draw() {
  if (!gl || lost) return;
  gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
  gl.uniform1f(uniforms.uTime, fx.time);
  gl.uniform2f(uniforms.uMouse, fx.mouse[0], fx.mouse[1]);
  gl.uniform2f(uniforms.uMoon, fx.moon[0], fx.moon[1]);
  gl.uniform1f(uniforms.uDark, fx.dark);
  gl.uniform1f(uniforms.uPulse, fx.pulse);
  gl.uniform1f(uniforms.uFlash, fx.flash);
  gl.uniform1f(uniforms.uSweep, fx.sweep);
  gl.uniform1f(uniforms.uDir, fx.dir);
  gl.uniform1f(uniforms.uKick, fx.kick);
  gl.uniform1f(uniforms.uTwilight, fx.twilight);
  gl.uniform1f(uniforms.uDay, fx.day);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function readPulse(dt) {
  let target = 0;
  const analyser = lofi.getAnalyser?.() ?? null;
  if (analyser) {
    if (analyser !== analyserRef) {
      analyserRef = analyser;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(analyserData);
    const binHz = (analyser.context?.sampleRate || 44100) / analyser.fftSize;
    const last = clamp(Math.ceil(220 / binHz), 2, analyserData.length - 1);
    let sum = 0;
    for (let i = 1; i <= last; i += 1) sum += analyserData[i];
    target = clamp((sum / last / 255 - 0.12) * 1.6, 0, 1);
  }
  // Fast attack, slow release: a soft breathing pulse, never a strobe.
  const rate = target > fx.pulse ? 9 : 1.6;
  fx.pulse += (target - fx.pulse) * damp(rate, dt);
}

function tick(dt) {
  fx.time += dt;
  fx.mouse[0] += (pointer.tx - fx.mouse[0]) * damp(2.2, dt);
  fx.mouse[1] += (pointer.ty - fx.mouse[1]) * damp(2.2, dt);
  const darkTarget = state.darkhour ? 1 : 0;
  fx.dark += (darkTarget - fx.dark) * damp(1.6, dt);
  if (Math.abs(darkTarget - fx.dark) < 0.001) fx.dark = darkTarget;
  readPulse(dt);
  draw();
}

function renderOnce() {
  fx.dark = state.darkhour ? 1 : 0;
  fx.flash = 0;
  fx.kick = 0;
  draw();
}

function startLoop() {
  stopLoop?.();
  stopLoop = null;
  if (reduced) {
    renderOnce();
    return;
  }
  stopLoop = rafLoop(tick);
}

/* ------------------------------------------------------------------- effects */

/**
 * Section change: a band of light rides just behind the DOM sweep's crisp edge
 * (same path, duration and easing as js/fx/slash.js), plus a short caustic flare.
 */
function onSectionWillChange(detail = {}) {
  if (reduced || !gl) return;
  gsap.killTweensOf(fx, "flash,sweep");
  const dir = (detail.direction ?? 1) >= 0 ? 1 : -1;
  const vw = window.innerWidth;
  const path = sweepPath(dir);
  const lead = dir * (SWEEP_EDGE - 0.035);
  fx.dir = dir;
  gsap.fromTo(
    fx,
    { sweep: path.from / vw + lead },
    { sweep: path.to / vw + lead, duration: SWEEP_DURATION, ease: EASE.snap, overwrite: false }
  );
  gsap.fromTo(fx, { flash: 1 }, { flash: 0, duration: DUR.panel * 1.7, ease: "power2.in", overwrite: false });
}

function onGlassBreak() {
  if (reduced || !gl) return;
  gsap.killTweensOf(fx, "kick");
  gsap.fromTo(fx, { kick: 0.65 }, { kick: 0, duration: 0.9, ease: "power2.out", overwrite: false });
}

/* ---------------------------------------------------------------- lifecycle */

function onContextLost(event) {
  event.preventDefault();
  lost = true;
  stopLoop?.();
  stopLoop = null;
  root?.classList.remove("fx-root--gl");
}

function onContextRestored() {
  lost = false;
  try {
    program = buildProgram();
    resize();
    root?.classList.add("fx-root--gl");
    startLoop();
  } catch (error) {
    console.warn("[background] could not restore WebGL", error);
    teardown();
  }
}

function teardown() {
  stopLoop?.();
  stopLoop = null;
  canvas?.remove();
  canvas = null;
  gl = null;
  root?.classList.remove("fx-root--gl");
  root?.classList.add("fx-root--fallback");
}

function installBench() {
  // QA only (?fxbench): window.__fxBench(n) -> average ms per synchronous frame.
  window.__fxBench = (frames = 60) => {
    if (!gl) return null;
    const pixel = new Uint8Array(4);
    draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const start = performance.now();
    for (let i = 0; i < frames; i += 1) {
      fx.time += 1 / 60;
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    return {
      msPerFrame: (performance.now() - start) / frames,
      buffer: `${canvas.width}x${canvas.height}`
    };
  };
}

export function init() {
  root = document.querySelector(".fx-root");
  if (!root) return;
  installPointer();
  initSlash(root);

  if (flags.nofx) {
    root.classList.add("fx-root--fallback");
    return;
  }

  canvas = document.createElement("canvas");
  canvas.className = "fx-bg";
  canvas.setAttribute("aria-hidden", "true");
  gl = createContext();
  if (!gl) {
    canvas = null;
    root.classList.add("fx-root--fallback");
    return;
  }

  try {
    program = buildProgram();
  } catch (error) {
    console.warn(error);
    teardown();
    return;
  }

  root.prepend(canvas);
  canvas.addEventListener("webglcontextlost", onContextLost, false);
  canvas.addEventListener("webglcontextrestored", onContextRestored, false);

  reduced = prefersReducedMotion();
  fx.dark = state.darkhour ? 1 : 0;
  resize();
  startLoop();
  // Reveal once the first frame exists, so the CSS fallback never flashes to black.
  requestAnimationFrame(() => root.classList.add("fx-root--gl"));

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  });
  onLayoutChange(() => requestAnimationFrame(measureMoon));
  onReducedMotionChange((value) => {
    reduced = value;
    startLoop();
  });
  on(EVT.DARKHOUR, () => {
    if (reduced) renderOnce();
  });
  window.setInterval(() => {
    readClock();
    if (reduced) renderOnce();
  }, 60000);
  on(EVT.TIME, () => {
    readClock();
    if (reduced) renderOnce();
  });
  on(EVT.SECTION_WILL_CHANGE, onSectionWillChange);
  on(EVT.SECTION_CHANGED, () => requestAnimationFrame(measureMoon));
  on(EVT.GLASS_BREAK, onGlassBreak);
  document.fonts?.ready.then(() => {
    measureMoon();
    if (reduced) renderOnce();
  });

  if (params.has("fxbench")) installBench();
}
