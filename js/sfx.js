// Sound effects engine. Owner: audio/projects workstream (D).
//
// One shared, lazily created AudioContext (lofi.js reuses it through getAudioContext()).
// Sampled sounds (click, glass, objection) are decoded once into AudioBuffers for
// zero-latency playback, with an HTMLAudio fallback. Everything else is a small
// synthesized "UI palette": crystalline, airy, a little nocturnal, and quiet.
//
// Every public method is safe to call at any time and never throws. Without WebAudio,
// sampled sounds fall back to HTMLAudio and synthesized sounds become no-ops.

const MUTE_KEY = "p3:sfx-muted";
const MASTER_LEVEL = 0.6;
const HOVER_MIN_INTERVAL_MS = 45;
const PALETTE_TRIM = 2; // synthesized voices are written at low levels; this sets the palette loudness

const asset = (name) => new URL(`../assets/${name}`, import.meta.url).href;

/** Sampled sounds. `gain` evens out the loudness differences between the files. */
const SAMPLES = {
  click: [{ url: asset("button-click.mp3"), gain: 0.5 }],
  glass: [
    { url: asset("glass-break-1.mp3"), gain: 0.85 },
    { url: asset("glass-break-2.mp3"), gain: 1.15 },
    { url: asset("glass-break-3.mp3"), gain: 0.42 }
  ],
  objection: [
    { url: asset("objection-1.mp3"), gain: 0.78 },
    { url: asset("objection-2.mp3"), gain: 0.7 },
    { url: asset("objection-3.mp3"), gain: 0.74 }
  ]
};
const ALL_SAMPLES = Object.values(SAMPLES).flat();

/* --------------------------------------------------------------- utilities */

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const cents = (value) => 2 ** (value / 1200);

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked (private mode): the setting simply does not persist.
  }
}

let muted = readMuted();

/* ----------------------------------------------------------- audio context */

let ctx = null;
let ctxFailed = false;
let bus = null;

function hasUserActivation() {
  const activation = navigator.userActivation;
  return activation ? activation.hasBeenActive : true;
}

/**
 * The shared AudioContext, created on first use. Returns null when WebAudio is
 * unavailable. Before the first user gesture it returns null too, so no context is
 * ever created in a state the autoplay policy would block (and warn about).
 */
export function getAudioContext() {
  if (ctx || ctxFailed) return ctx;
  if (!hasUserActivation()) return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    ctxFailed = true;
    return null;
  }
  try {
    ctx = new Ctor({ latencyHint: "interactive" });
  } catch {
    ctxFailed = true;
    ctx = null;
  }
  return ctx;
}

/** Shared white-noise buffer (1.5 s), one per context. */
const noiseCache = new WeakMap();
function noiseBuffer(c) {
  let buffer = noiseCache.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseCache.set(c, buffer);
  }
  return buffer;
}

/** A soft, dark stereo room (procedural impulse response). */
function makeImpulse(c, seconds = 1.8, decay = 2.8) {
  const length = Math.floor(c.sampleRate * seconds);
  const preDelay = Math.floor(c.sampleRate * 0.012);
  const impulse = c.createBuffer(2, length, c.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let low = 0;
    for (let i = preDelay; i < length; i += 1) {
      const t = (i - preDelay) / (length - preDelay);
      // The tail gets darker as it decays: the one-pole coefficient closes over time.
      const coefficient = 0.55 + 0.4 * t;
      low = low * coefficient + (Math.random() * 2 - 1) * (1 - coefficient);
      data[i] = low * (1 - t) ** decay * 1.6;
    }
  }
  return impulse;
}

/**
 * Output bus for a context: voices -> dry/verb -> soft high shelf -> compressor -> master.
 * The master gain carries the mute state.
 */
function buildBus(c, destination) {
  const dry = c.createGain();
  const verb = c.createGain();
  const convolver = c.createConvolver();
  const wet = c.createGain();
  const shelf = c.createBiquadFilter();
  const compressor = c.createDynamicsCompressor();
  const master = c.createGain();

  convolver.buffer = makeImpulse(c);
  dry.gain.value = PALETTE_TRIM;
  verb.gain.value = PALETTE_TRIM;
  wet.gain.value = 0.32;
  shelf.type = "highshelf";
  shelf.frequency.value = 8500;
  shelf.gain.value = -3;
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  master.gain.value = muted ? 0 : MASTER_LEVEL;

  // Decoded mp3 samples enter at unity gain (their own trims live in SAMPLES).
  const sample = c.createGain();

  dry.connect(shelf);
  sample.connect(shelf);
  verb.connect(convolver);
  convolver.connect(wet);
  wet.connect(shelf);
  shelf.connect(compressor);
  compressor.connect(master);
  master.connect(destination);

  return { c, dry, verb, sample, master };
}

function ensureBus() {
  const c = getAudioContext();
  if (!c) return null;
  if (!bus) {
    try {
      bus = buildBus(c, c.destination);
    } catch {
      return null;
    }
  }
  return bus;
}

/* ------------------------------------------------------------ voice helpers */

/** Disconnect every node of a voice once its (last) source has ended. */
function cleanup(source, nodes) {
  source.onended = () => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  };
}

/**
 * Percussive envelope: linear attack, exponential decay, then a short linear ramp
 * that lands exactly on 0 (no clicks, no exponential ramps to 0). Returns the end time.
 */
function pluck(param, t, peak, attack, decay) {
  const end = t + attack + decay;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.001), end);
  param.linearRampToValueAtTime(0, end + 0.008);
  return end + 0.012;
}

/** Route a voice output to the dry bus (with optional pan) and the reverb send. */
function route(c, b, node, { pan = 0, send = 0.2 } = {}) {
  const nodes = [];
  let out = node;
  if (pan && c.createStereoPanner) {
    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    out = panner;
    nodes.push(panner);
  }
  out.connect(b.dry);
  if (send > 0) {
    const sendGain = c.createGain();
    sendGain.gain.value = send;
    out.connect(sendGain);
    sendGain.connect(b.verb);
    nodes.push(sendGain);
  }
  return nodes;
}

/** A sine (or other) partial with a pluck envelope. */
function partial(c, b, t, { freq, peak, attack = 0.003, decay = 0.2, type = "sine", glideTo = null, glideTime = 0.1, pan = 0, send = 0.2 }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + glideTime);
  const end = pluck(amp.gain, t, peak, attack, decay);
  osc.connect(amp);
  const extra = route(c, b, amp, { pan, send });
  osc.start(t);
  osc.stop(end);
  cleanup(osc, [osc, amp, ...extra]);
  return end;
}

/** A filtered noise burst. `sweep` = [fromHz, toHz] moves the filter during the burst. */
function noiseBurst(c, b, t, { peak, attack = 0.001, decay = 0.03, filter = "bandpass", freq = 3000, q = 1, sweep = null, sweepTime = null, pan = 0, panTo = null, send = 0.15, rate = 1 }) {
  const source = c.createBufferSource();
  const buffer = noiseBuffer(c);
  const shaper = c.createBiquadFilter();
  const amp = c.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  shaper.type = filter;
  shaper.Q.value = q;
  if (sweep) {
    shaper.frequency.setValueAtTime(sweep[0], t);
    shaper.frequency.exponentialRampToValueAtTime(sweep[1], t + (sweepTime ?? attack + decay));
  } else {
    shaper.frequency.value = freq;
  }
  const end = pluck(amp.gain, t, peak, attack, decay);
  source.connect(shaper);
  shaper.connect(amp);
  const nodes = [source, shaper, amp];

  let out = amp;
  if (c.createStereoPanner && (pan || panTo !== null)) {
    const panner = c.createStereoPanner();
    panner.pan.setValueAtTime(pan, t);
    if (panTo !== null) panner.pan.linearRampToValueAtTime(panTo, end);
    amp.connect(panner);
    out = panner;
    nodes.push(panner);
  }
  nodes.push(...route(c, b, out, { send }));

  const offset = Math.random() * (buffer.duration - Math.min(buffer.duration - 0.01, end - t + 0.05));
  source.start(t, Math.max(0, offset));
  source.stop(end);
  cleanup(source, nodes);
  return end;
}

/** Envelope with an exponential (setTarget-style) decay that still ends on exactly 0. */
function ring(param, t, peak, attack, tau, length) {
  const end = t + attack + length;
  const remaining = peak * Math.exp(-length / tau);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(Math.max(1e-5, remaining), end);
  param.linearRampToValueAtTime(0, end + 0.03);
  return end + 0.035;
}

/* ----------------------------------------------------------------- recipes */
// Each recipe schedules one sound at time t on bus b. Levels are linear amplitudes
// before the 0.6 master gain; together they keep every peak far from clipping.

let tickTock = false;

const RECIPES = {
  /** Very short, soft crystalline tick with a slight random pitch. */
  hover(c, b, t) {
    const base = 2350 * cents(rand(-70, 70));
    const pan = rand(-0.15, 0.15);
    partial(c, b, t, { freq: base, peak: 0.1, attack: 0.002, decay: 0.05, pan, send: 0.12 });
    partial(c, b, t, { freq: base * 2.76, peak: 0.026, attack: 0.001, decay: 0.026, pan, send: 0.1 });
    noiseBurst(c, b, t, { peak: 0.09, decay: 0.01, freq: 6200, q: 1.4, pan, send: 0 });
  },

  /** Bright two-note blip (a fifth up) with a little sparkle. */
  confirm(c, b, t) {
    const root = 1318.5; // E6
    const fifth = 1975.5; // B6
    [[root, t, 0.15], [fifth, t + 0.055, 0.3]].forEach(([freq, at, decay]) => {
      partial(c, b, at, { freq, peak: 0.075, attack: 0.003, decay, send: 0.28 });
      partial(c, b, at, { freq: freq * 2, peak: 0.022, attack: 0.002, decay: decay * 0.6, send: 0.2 });
      partial(c, b, at, { freq: freq * 3.01, peak: 0.008, attack: 0.002, decay: decay * 0.4, send: 0.2 });
    });
    for (let i = 0; i < 3; i += 1) {
      partial(c, b, t + 0.075 + i * rand(0.018, 0.03), {
        freq: rand(5200, 8400), peak: rand(0.007, 0.012), attack: 0.001, decay: rand(0.04, 0.08), pan: rand(-0.6, 0.6), send: 0.45
      });
    }
  },

  /** Descending blip (a fourth down), softer than confirm. */
  back(c, b, t) {
    partial(c, b, t, { freq: 1174.7, glideTo: 1108.7, glideTime: 0.05, peak: 0.06, attack: 0.003, decay: 0.09, send: 0.2 });
    partial(c, b, t, { freq: 2349.3, peak: 0.012, attack: 0.002, decay: 0.05, send: 0.15 });
    partial(c, b, t + 0.06, { freq: 880, glideTo: 830.6, glideTime: 0.08, peak: 0.065, attack: 0.003, decay: 0.2, send: 0.24 });
    partial(c, b, t + 0.06, { freq: 1760, peak: 0.012, attack: 0.002, decay: 0.08, send: 0.15 });
  },

  /** Filtered noise sweep (~350 ms) for section wipes, panning left to right. */
  whoosh(c, b, t) {
    noiseBurst(c, b, t, {
      peak: 0.16, attack: 0.13, decay: 0.22, filter: "bandpass", q: 0.85,
      sweep: [420, 3800], sweepTime: 0.3, pan: -0.55, panTo: 0.55, send: 0.22
    });
    // A darker, quieter layer gives the sweep a little body.
    noiseBurst(c, b, t + 0.02, {
      peak: 0.08, attack: 0.1, decay: 0.2, filter: "lowpass", q: 0.5,
      sweep: [300, 1400], sweepTime: 0.25, pan: -0.3, panTo: 0.3, send: 0.1
    });
  },

  /** Glassy creaks and clicks; more, louder and lower as the stage rises (1..3). */
  crack(c, b, t, stage = 1) {
    const s = Math.max(1, Math.min(3, Math.round(Number(stage) || 1)));
    const clicks = [3, 6, 10][s - 1];
    const spread = [0.06, 0.12, 0.2][s - 1];
    const level = [0.3, 0.42, 0.5][s - 1];

    for (let i = 0; i < clicks; i += 1) {
      const at = t + spread * Math.random() ** 1.6;
      noiseBurst(c, b, at, {
        peak: level * rand(0.5, 1), attack: 0.0006, decay: rand(0.002, 0.006),
        freq: rand(2600, 7600), q: rand(2, 6), pan: rand(-0.5, 0.5), send: 0.22
      });
    }

    // Stress tone: a faint inharmonic glass ring.
    const pings = s === 3 ? 2 : 1;
    for (let i = 0; i < pings; i += 1) {
      const base = rand(2800, 4200);
      const at = t + rand(0, spread * 0.6);
      [1, 1.53, 2.31].forEach((ratio, index) => {
        partial(c, b, at, { freq: base * ratio, peak: (0.03 + 0.012 * s) / (index + 1), attack: 0.001, decay: rand(0.08, 0.16), pan: rand(-0.3, 0.3), send: 0.3 });
      });
    }

    if (s >= 2) {
      // Creak: a rising impulse train exciting a narrow glassy resonance.
      const osc = c.createOscillator();
      const resonance = c.createBiquadFilter();
      const amp = c.createGain();
      const length = s === 3 ? 0.16 : 0.11;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(rand(55, 75), t);
      osc.frequency.exponentialRampToValueAtTime(rand(120, 160), t + length);
      resonance.type = "bandpass";
      resonance.frequency.value = rand(1900, 2600);
      resonance.Q.value = 9;
      const end = pluck(amp.gain, t, 0.09 * s, length * 0.35, length * 0.65);
      osc.connect(resonance);
      resonance.connect(amp);
      const extra = route(c, b, amp, { pan: rand(-0.2, 0.2), send: 0.25 });
      osc.start(t);
      osc.stop(end);
      cleanup(osc, [osc, resonance, amp, ...extra]);
    }

    if (s === 3) {
      noiseBurst(c, b, t + 0.01, { peak: 0.2, attack: 0.002, decay: 0.07, freq: 1500, q: 0.7, send: 0.25 });
    }
  },

  /** Airy swish plus a soft tone: rising on open, falling on close. */
  dialog(c, b, t, open = true) {
    const up = Boolean(open);
    noiseBurst(c, b, t, {
      peak: 0.09, attack: up ? 0.08 : 0.04, decay: up ? 0.16 : 0.15, filter: "bandpass", q: 1.1,
      sweep: up ? [650, 3000] : [2800, 600], sweepTime: 0.22, pan: up ? -0.2 : 0.2, panTo: up ? 0.2 : -0.2, send: 0.3
    });
    const [from, to] = up ? [659.3, 987.8] : [987.8, 659.3];
    partial(c, b, t + 0.03, { freq: from, glideTo: to, glideTime: 0.12, peak: 0.05, attack: 0.012, decay: 0.34, send: 0.4 });
    partial(c, b, t + 0.03, { freq: from * 1.5, glideTo: to * 1.5, glideTime: 0.12, peak: 0.018, attack: 0.012, decay: 0.24, send: 0.4 });
    if (up) partial(c, b, t + 0.1, { freq: 2637, peak: 0.01, attack: 0.004, decay: 0.2, send: 0.5 });
  },

  /** Woody clock tick; alternates tick / tock. */
  tick(c, b, t) {
    tickTock = !tickTock;
    const base = tickTock ? 1850 : 1560;
    noiseBurst(c, b, t, { peak: 0.45, attack: 0.0005, decay: 0.016, freq: base, q: 5, send: 0.12 });
    partial(c, b, t, { freq: base * 0.5, glideTo: base * 0.47, glideTime: 0.03, peak: 0.06, attack: 0.001, decay: 0.032, send: 0.1 });
    partial(c, b, t, { freq: 230, peak: 0.04, attack: 0.001, decay: 0.04, send: 0 });
  },

  /** Midnight bell: inharmonic partials, beating pairs, ~3.5 s decay. */
  bell(c, b, t) {
    const prime = 174.6; // F3
    const filter = c.createBiquadFilter();
    const sum = c.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    sum.gain.value = 0.1;
    filter.connect(sum);
    const extra = route(c, b, sum, { send: 0.5 });

    // [ratio, amplitude, decay time constant (s)]
    const PARTIALS = [
      [0.5, 0.34, 1.35], // hum
      [1.0, 0.46, 1.0],  // prime
      [1.19, 0.3, 0.85], // tierce: the minor third that makes it a bell
      [1.5, 0.12, 0.6],  // quint
      [2.0, 0.4, 0.7],   // nominal
      [2.52, 0.15, 0.42],
      [2.98, 0.12, 0.34],
      [4.07, 0.07, 0.24],
      [5.42, 0.04, 0.16]
    ];
    let last = null;
    let lastEnd = 0;
    PARTIALS.forEach(([ratio, amplitude, tau]) => {
      const beat = rand(0.5, 1.4);
      [-beat / 2, beat / 2].forEach((offset) => {
        const osc = c.createOscillator();
        const amp = c.createGain();
        osc.frequency.value = prime * ratio + offset;
        const length = Math.min(4, tau * 4.2);
        const end = ring(amp.gain, t, amplitude * 0.5, 0.004, tau, length);
        osc.connect(amp);
        amp.connect(filter);
        osc.start(t);
        osc.stop(end);
        osc.onended = () => {
          osc.disconnect();
          amp.disconnect();
        };
        if (end > lastEnd) {
          lastEnd = end;
          last = osc;
        }
      });
    });
    // The longest partial tears down the shared filter + sum.
    const previous = last.onended;
    last.onended = () => {
      previous();
      [filter, sum, ...extra].forEach((node) => node.disconnect());
    };

    noiseBurst(c, b, t, { peak: 0.05, attack: 0.001, decay: 0.035, freq: 2400, q: 1.2, send: 0.4 });
  },

  /** Debug Battle: a hit lands. `kind`: "normal" | "crit" | "weak" | "resist". */
  hit(c, b, t, kind = "normal") {
    const heavy = kind === "weak" || kind === "crit";
    // Body: a short thump with a falling pitch, plus a bright snap of noise.
    partial(c, b, t, { freq: heavy ? 180 : 150, glideTo: 55, glideTime: 0.12, peak: heavy ? 0.22 : 0.16, attack: 0.002, decay: 0.16, send: 0.1 });
    noiseBurst(c, b, t, { peak: heavy ? 0.3 : 0.2, attack: 0.001, decay: 0.06, filter: "bandpass", freq: 2600, q: 0.7, send: 0.15 });
    noiseBurst(c, b, t + 0.004, { peak: 0.14, attack: 0.001, decay: 0.12, filter: "lowpass", freq: 900, q: 0.6, send: 0.08 });
    if (kind === "resist") {
      // A dull clank: the blow glances off.
      partial(c, b, t + 0.01, { freq: 2380, peak: 0.03, attack: 0.001, decay: 0.09, type: "triangle", send: 0.3 });
      partial(c, b, t + 0.01, { freq: 3570, peak: 0.016, attack: 0.001, decay: 0.06, send: 0.3 });
    }
    if (kind === "weak") {
      // Rising chirp + sparkle: you found it.
      partial(c, b, t + 0.05, { freq: 880, glideTo: 1760, glideTime: 0.14, peak: 0.06, attack: 0.004, decay: 0.22, send: 0.35 });
      partial(c, b, t + 0.05, { freq: 1320, glideTo: 2640, glideTime: 0.14, peak: 0.025, attack: 0.004, decay: 0.18, send: 0.35 });
      for (let i = 0; i < 4; i += 1) {
        partial(c, b, t + 0.12 + i * rand(0.02, 0.035), {
          freq: rand(4200, 7600), peak: rand(0.008, 0.014), attack: 0.001, decay: rand(0.05, 0.1), pan: rand(-0.6, 0.6), send: 0.5
        });
      }
    }
    if (kind === "crit") {
      partial(c, b, t + 0.03, { freq: 1975.5, peak: 0.05, attack: 0.002, decay: 0.3, send: 0.4 });
    }
  },

  /** Debug Battle: the player takes a hit (a descending buzz). */
  hurt(c, b, t) {
    partial(c, b, t, { freq: 320, glideTo: 140, glideTime: 0.2, peak: 0.07, attack: 0.004, decay: 0.24, type: "sawtooth", send: 0.12 });
    noiseBurst(c, b, t, { peak: 0.12, attack: 0.002, decay: 0.08, filter: "lowpass", freq: 700, q: 0.8, send: 0.05 });
  },

  /** Debug Battle: the finishing blow (a swept stab and a bright chord). */
  finisher(c, b, t) {
    noiseBurst(c, b, t, {
      peak: 0.22, attack: 0.02, decay: 0.3, filter: "bandpass", q: 0.9,
      sweep: [600, 5200], sweepTime: 0.22, pan: -0.5, panTo: 0.5, send: 0.3
    });
    partial(c, b, t + 0.16, { freq: 140, glideTo: 50, glideTime: 0.2, peak: 0.24, attack: 0.002, decay: 0.3, send: 0.1 });
    [659.3, 830.6, 987.8, 1318.5].forEach((freq, i) => {
      partial(c, b, t + 0.18 + i * 0.012, { freq, peak: 0.05, attack: 0.004, decay: 0.7, send: 0.45 });
      partial(c, b, t + 0.18 + i * 0.012, { freq: freq * 2, peak: 0.012, attack: 0.003, decay: 0.4, send: 0.45 });
    });
  },

  /** Soft two-note chime. */
  toast(c, b, t) {
    [[1046.5, t], [1568, t + 0.07]].forEach(([freq, at]) => {
      partial(c, b, at, { freq, peak: 0.05, attack: 0.004, decay: 0.5, send: 0.35 });
      partial(c, b, at, { freq: freq * 2.76, peak: 0.008, attack: 0.002, decay: 0.16, send: 0.35 });
    });
  }
};


/* ----------------------------------------------------------------- samples */

const fetched = new Map(); // url -> Promise<ArrayBuffer | null>
const decoded = new Map(); // url -> AudioBuffer
const decodeFailed = new Set();
let decodeStarted = false;
const htmlVoices = new Set();

function prefetch() {
  for (const { url } of ALL_SAMPLES) {
    if (fetched.has(url)) continue;
    fetched.set(
      url,
      fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null)
    );
  }
}

function decode(c, data) {
  return new Promise((resolve, reject) => {
    try {
      const promise = c.decodeAudioData(data, resolve, reject);
      promise?.then?.(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function decodeAll(c) {
  if (decodeStarted) return;
  decodeStarted = true;
  prefetch();
  for (const { url } of ALL_SAMPLES) {
    fetched.get(url)
      .then((data) => {
        if (!data) throw new Error("fetch failed");
        return decode(c, data.slice(0));
      })
      .then((buffer) => decoded.set(url, buffer))
      .catch(() => decodeFailed.add(url));
  }
}

/** Play a sample entry. Returns a handle with stop(), or null. */
function playSample(entry, { rate = 1 } = {}) {
  if (muted || !entry) return null;
  const b = bus;
  const buffer = decoded.get(entry.url);

  if (b && buffer && b.c.state === "running") {
    const c = b.c;
    const source = c.createBufferSource();
    const amp = c.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    amp.gain.value = entry.gain;
    source.connect(amp);
    amp.connect(b.sample);
    source.start();
    cleanup(source, [source, amp]);
    return {
      stop() {
        const now = c.currentTime;
        amp.gain.setValueAtTime(amp.gain.value, now);
        amp.gain.linearRampToValueAtTime(0, now + 0.02);
        try {
          source.stop(now + 0.025);
        } catch {
          // Already stopped.
        }
      }
    };
  }

  // Fallback: HTMLAudio (not decoded yet, decoding failed, or no WebAudio).
  try {
    const audio = new Audio(entry.url);
    audio.volume = Math.max(0, Math.min(1, entry.gain * MASTER_LEVEL));
    audio.playbackRate = rate;
    if ("preservesPitch" in audio) audio.preservesPitch = false;
    htmlVoices.add(audio);
    audio.addEventListener("ended", () => htmlVoices.delete(audio), { once: true });
    audio.play().catch(() => htmlVoices.delete(audio));
    return {
      stop() {
        audio.pause();
        htmlVoices.delete(audio);
      }
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ engine */

let lastHover = 0;
let currentObjection = null;

/** Run a synthesized recipe on the live bus (no-op when muted or unavailable). */
function synth(name, ...args) {
  if (muted) return;
  const b = ensureBus();
  if (!b) return;
  const c = b.c;
  const run = () => {
    try {
      RECIPES[name](c, b, c.currentTime + 0.005, ...args);
    } catch {
      // A failed sound must never break the interaction that triggered it.
    }
  };
  if (c.state === "running") {
    run();
    return;
  }
  if (c.state === "closed") return;
  // Resuming inside the triggering gesture: play only if it resumes promptly.
  const requested = performance.now();
  c.resume()
    .then(() => {
      if (performance.now() - requested < 200 && !muted) run();
    })
    .catch(() => {});
}

function safe(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  };
}

export const sfx = {
  /** Pointer enters / keyboard focus moves to a menu item (rate-limited). */
  hover: safe(() => {
    const now = performance.now();
    if (now - lastHover < HOVER_MIN_INTERVAL_MS) return;
    lastHover = now;
    synth("hover");
  }),
  /** Generic button press. */
  click: safe(() => {
    playSample(SAMPLES.click[0]);
  }),
  /** A selection lands (menu cursor arrives, section chosen). */
  confirm: safe(() => synth("confirm")),
  /** Going back / closing. */
  back: safe(() => synth("back")),
  /** Section transition wipe. */
  whoosh: safe(() => synth("whoosh")),
  /** Glass cracking: stage 1..3. */
  crack: safe((stage = 1) => synth("crack", stage)),
  /** Glass shattering. */
  glass: safe(() => {
    playSample(pick(SAMPLES.glass), { rate: rand(0.93, 1.07) });
  }),
  /** Objection shout (stops one that is already playing). */
  objection: safe(() => {
    currentObjection?.stop();
    currentObjection = playSample(pick(SAMPLES.objection));
  }),
  /** Dialog open (true) / close (false). */
  dialog: safe((open = true) => synth("dialog", open)),
  /** Clock tick (intro). */
  tick: safe(() => synth("tick")),
  /** Midnight bell (intro / Dark Hour). */
  bell: safe(() => synth("bell")),
  /** Toast notification. */
  toast: safe(() => synth("toast")),
  /** Debug Battle hit: "normal" | "crit" | "weak" | "resist". */
  hit: safe((kind = "normal") => synth("hit", kind)),
  /** Debug Battle: the player takes damage. */
  hurt: safe(() => synth("hurt")),
  /** Debug Battle: finishing blow. */
  finisher: safe(() => synth("finisher")),

  setMuted: safe((value) => {
    muted = Boolean(value);
    writeMuted(muted);
    if (bus) {
      const now = bus.c.currentTime;
      bus.master.gain.cancelScheduledValues(now);
      bus.master.gain.setValueAtTime(bus.master.gain.value, now);
      bus.master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_LEVEL, now + 0.04);
    }
    if (muted) {
      htmlVoices.forEach((audio) => audio.pause());
      htmlVoices.clear();
    }
  }),
  isMuted: () => muted,

  /** Create/resume the context after a user gesture (autoplay policy). */
  unlock: safe(() => {
    const b = ensureBus();
    if (!b) return;
    const c = b.c;
    if (c.state === "suspended") c.resume().catch(() => {});
    decodeAll(c);
    primeIOS(c);
  })
};

/** iOS Safari only unlocks output once a buffer plays inside a gesture. */
let primed = false;
function primeIOS(c) {
  if (primed) return;
  primed = true;
  try {
    const source = c.createBufferSource();
    source.buffer = c.createBuffer(1, 1, c.sampleRate);
    source.connect(c.destination);
    source.start();
    source.onended = () => source.disconnect();
  } catch {
    // Not needed elsewhere.
  }
}

/* ------------------------------------------------------------------- debug */

/**
 * QA helper: render one synthesized sound into an OfflineAudioContext through the same
 * bus (without the mute state) and return the AudioBuffer. Not used by the site itself.
 */
export async function renderSfxOffline(name, args = [], seconds = 1.5, sampleRate = 44100) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline || !RECIPES[name]) return null;
  const c = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const b = buildBus(c, c.destination);
  b.master.gain.value = MASTER_LEVEL;
  RECIPES[name](c, b, 0.01, ...args);
  return c.startRendering();
}

/* -------------------------------------------------------------------- init */

export function init() {
  const events = ["pointerdown", "keydown", "touchend"];
  const options = { capture: true, passive: true };
  const remove = () => events.forEach((type) => window.removeEventListener(type, onGesture, options));
  function onGesture() {
    sfx.unlock();
    if (ctxFailed) {
      remove();
      return;
    }
    if (ctx?.state === "running") remove();
    else ctx?.resume?.().then(() => remove()).catch(() => {});
  }
  events.forEach((type) => window.addEventListener(type, onGesture, options));

  // Fetch the sample files once the page is idle; decoding waits for the context.
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1200));
  idle(() => prefetch(), { timeout: 3000 });
}
