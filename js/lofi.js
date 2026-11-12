// Generative lo-fi engine. Owner: audio/projects workstream (D).
//
// A lookahead scheduler on the AudioContext clock drives a small band:
// FM electric piano (voice-led jazz voicings), saturated sub bass with walking passing
// notes, synthesized drums with swing, a Markov-chain melody on a soft mallet, looped
// vinyl crackle, and tape wow/flutter. The tune (key, progression, groove) is seeded by
// the day, so each day has its own stable song; the melody and the arrangement change
// every time it plays.
//
// Public API (unchanged contract): lofi.start() stop() toggle() isPlaying()
// setVolume(0..1) getVolume() getAnalyser(), plus EVT.LOFI {playing} events.
import { EVT, emit, daySeed, clamp } from "./core.js";
import { createRng } from "./proc/rng.js";
import { getAudioContext } from "./sfx.js";

const VOLUME_KEY = "p3:lofi-volume";
const DEFAULT_VOLUME = 0.55;
const MUSIC_LEVEL = 0.75;         // output gain at volume 1 (before the perceptual curve)
const FADE_TIME = 1.2;            // seconds
const STEPS_PER_BAR = 16;
const LOOKAHEAD = { visible: 0.12, hidden: 1.5 };   // seconds scheduled ahead
const TICK_MS = { visible: 25, hidden: 300 };       // scheduler period

/* ------------------------------------------------------------------ theory */

const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Chord qualities. `tones`: chord tones above the root (melody targets, bass 5ths).
 * `voicing`: the four intervals the electric piano plays (mostly rootless; the bass
 * carries the root).
 */
const QUALITIES = {
  maj7: { tones: [0, 4, 7, 11], voicing: [0, 4, 7, 11] },
  maj9: { tones: [0, 4, 7, 11, 14], voicing: [4, 7, 11, 14] },
  "6/9": { tones: [0, 4, 7, 9, 14], voicing: [4, 7, 9, 14] },
  m7: { tones: [0, 3, 7, 10], voicing: [3, 7, 10, 12] },
  m9: { tones: [0, 3, 7, 10, 14], voicing: [3, 7, 10, 14] },
  m11: { tones: [0, 3, 7, 10, 14, 17], voicing: [3, 10, 14, 17] },
  "7": { tones: [0, 4, 7, 10], voicing: [0, 4, 7, 10] },
  "9": { tones: [0, 4, 7, 10, 14], voicing: [4, 7, 10, 14] },
  "13": { tones: [0, 4, 10, 14, 21], voicing: [4, 10, 14, 21] },
  "7b9": { tones: [0, 4, 7, 10, 13], voicing: [4, 7, 10, 13] },
  "7#9": { tones: [0, 4, 7, 10, 15], voicing: [4, 7, 10, 15] },
  m7b5: { tones: [0, 3, 6, 10], voicing: [0, 3, 6, 10] }
};

/** Progressions: [semitones above the key tonic, quality, length in 16th steps]. */
const PROGRESSIONS = [
  { name: "ii-V-I-vi", mode: "major", chords: [[2, "m9", 16], [7, "13", 16], [0, "maj9", 16], [9, "m9", 16]] },
  { name: "I-vi-ii-V", mode: "major", chords: [[0, "maj9", 16], [9, "m9", 16], [2, "m9", 16], [7, "7b9", 16]] },
  { name: "IV-iv-iii-vi", mode: "major", chords: [[5, "maj9", 16], [5, "m9", 16], [4, "m7", 16], [9, "m9", 16]] },
  { name: "IV-III7-vi-v-I7", mode: "major", chords: [[5, "maj7", 16], [4, "7b9", 16], [9, "m9", 16], [7, "m9", 8], [0, "9", 8]] },
  { name: "I-III7-vi-v-I7", mode: "major", chords: [[0, "maj9", 16], [4, "7#9", 16], [9, "m9", 16], [7, "m7", 8], [0, "9", 8]] },
  { name: "IV-iii-ii-I", mode: "major", chords: [[5, "maj9", 16], [4, "m7", 16], [2, "m9", 16], [0, "6/9", 16]] },
  {
    name: "ii-V-iii-VI-ii-V-I",
    mode: "major",
    chords: [[2, "m9", 16], [7, "13", 16], [4, "m7", 16], [9, "7b9", 16], [2, "m9", 16], [7, "13", 16], [0, "maj9", 16], [0, "6/9", 16]]
  },
  { name: "i-iv-VII-III", mode: "minor", chords: [[0, "m9", 16], [5, "m9", 16], [10, "13", 16], [3, "maj9", 16]] },
  { name: "i-VI-ii-V", mode: "minor", chords: [[0, "m9", 16], [8, "maj9", 16], [2, "m7b5", 16], [7, "7#9", 16]] },
  { name: "i-IV dorian", mode: "dorian", chords: [[0, "m9", 16], [5, "9", 16], [0, "m11", 16], [5, "13", 16]] }
];

const SCALES = {
  major: { penta: [0, 2, 4, 7, 9] },
  minor: { penta: [0, 3, 5, 7, 10] },
  dorian: { penta: [0, 3, 5, 7, 10] }
};

const KEYS = { major: [0, 2, 3, 5, 7, 8, 10], minor: [9, 2, 4, 0, 7, 5], dorian: [2, 9, 4, 7] };

/** Kick steps (snare is always on 4 and 12). */
const KICK_PATTERNS = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 8, 10], [0, 10, 11]];
/** Electric piano re-attacks inside a full-bar chord (steps from the chord start). */
const COMP_PATTERNS = [[0], [0, 10], [0, 6], [0, 11], [0, 7]];
/** Bass figures for a full-bar chord: [step, length, interval above the root]. */
const BASS_PATTERNS = [
  [[0, 9, 0], [10, 5, 0]],
  [[0, 6, 0], [7, 3, 0], [10, 5, 7]],
  [[0, 13, 0]],
  [[0, 8, 0], [10, 4, 12]]
];

/** Rhythm cells for the melody, in 16th steps: notes [offset, length], `beats` consumed. */
const CELLS = [
  { beats: 1, notes: [[0, 4]], weight: 0.18 },
  { beats: 1, notes: [[0, 2], [2, 2]], weight: 0.2 },
  { beats: 1, notes: [[0, 3], [3, 1]], weight: 0.09 },
  { beats: 1, notes: [[2, 2]], weight: 0.14 },
  { beats: 1, notes: [[0, 1], [1, 3]], weight: 0.05 },
  { beats: 1, notes: [[0, 2], [2, 1], [3, 1]], weight: 0.05 },
  { beats: 1, notes: [], weight: 0.17 },
  { beats: 2, notes: [[0, 7]], weight: 0.12, onStrong: true }
];

/* ------------------------------------------------------------- tune (daily) */

/** Voice-led EP voicing: the candidate closest to the previous chord. */
function voiceChord(rootPc, intervals, previous) {
  // Close position = every rotation of the ascending pitch classes; plus drop-2 and
  // drop-3 spreads of each.
  const pcs = [...new Set(intervals.map((interval) => (rootPc + interval) % 12))].sort((a, b) => a - b);
  const candidates = [];
  for (let rotation = 0; rotation < pcs.length; rotation += 1) {
    const order = [...pcs.slice(rotation), ...pcs.slice(0, rotation)];
    for (let base = 50; base <= 70; base += 1) {
      if (base % 12 !== order[0]) continue;
      const close = [base];
      for (let k = 1; k < order.length; k += 1) {
        let note = close[k - 1] + 1;
        while (note % 12 !== order[k]) note += 1;
        close.push(note);
      }
      candidates.push(close);
      [2, 3].forEach((drop) => {
        const spread = close.slice();
        spread[spread.length - drop] -= 12;
        candidates.push(spread.sort((a, b) => a - b));
      });
    }
  }

  const valid = candidates.filter((voicing) => {
    const low = voicing[0];
    const high = voicing[voicing.length - 1];
    if (low < 53 || high > 81 || high - low > 19) return false;
    // No seconds in the low register: they turn to mud.
    for (let i = 0; i < voicing.length - 1; i += 1) {
      if (voicing[i] < 60 && voicing[i + 1] - voicing[i] < 3) return false;
    }
    return true;
  });

  const center = (voicing) => voicing.reduce((sum, note) => sum + note, 0) / voicing.length;
  let best = valid[0];
  let bestCost = Infinity;
  for (const voicing of valid) {
    let cost = Math.abs(center(voicing) - 66) * (previous ? 0.35 : 1);
    // An exposed semitone on top, or a minor ninth anywhere, sounds like a wrong note.
    if (voicing[voicing.length - 1] - voicing[voicing.length - 2] === 1) cost += 4;
    for (let i = 0; i < voicing.length; i += 1) {
      for (let j = i + 1; j < voicing.length; j += 1) if (voicing[j] - voicing[i] === 13) cost += 6;
    }
    if (previous) {
      for (let i = 0; i < voicing.length; i += 1) cost += Math.abs(voicing[i] - previous[i]);
      // The top voice carries the line: keep it smooth.
      cost += Math.max(0, Math.abs(voicing[voicing.length - 1] - previous[previous.length - 1]) - 2) * 0.8;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = voicing;
    }
  }
  return best;
}

function composeTune(seed) {
  const rng = createRng(seed);
  const harmony = rng.fork("harmony");
  const groove = rng.fork("groove");

  const progression = harmony.pick(PROGRESSIONS);
  const tonic = harmony.pick(KEYS[progression.mode]);
  const penta = SCALES[progression.mode].penta.map((interval) => (tonic + interval) % 12);

  const segments = [];
  let step = 0;
  for (const [degree, quality, length] of progression.chords) {
    const rootPc = (tonic + degree) % 12;
    const info = QUALITIES[quality];
    const tonePcs = new Set(info.tones.map((interval) => (rootPc + interval) % 12));
    // Melody notes: chord tones plus pentatonic colour notes that do not rub a
    // semitone against a chord tone (no "avoid notes", e.g. a major 3rd over iv minor).
    const clashes = (pc) => [...tonePcs].some((tone) => (pc - tone + 12) % 12 === 1 || (tone - pc + 12) % 12 === 1);
    const pool = [];
    for (let midi = 67; midi <= 86; midi += 1) {
      const pc = midi % 12;
      if (tonePcs.has(pc) || (penta.includes(pc) && !clashes(pc))) pool.push(midi);
    }
    // Bass root in A1..G#2.
    let bassRoot = 33 + ((rootPc - 9 + 12) % 12);
    if (bassRoot > 44) bassRoot -= 12;
    segments.push({ start: step, length, rootPc, quality, info, tonePcs, pool, bassRoot, voicing: null });
    step += length;
  }

  // Voice-lead twice around the loop so the wrap back to bar 1 is smooth too.
  let previous = null;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const segment of segments) {
      segment.voicing = voiceChord(segment.rootPc, segment.info.voicing, previous);
      previous = segment.voicing;
    }
  }

  return {
    name: progression.name,
    mode: progression.mode,
    tonic,
    segments,
    loopSteps: step,
    bpm: groove.int(78, 82),
    swing: groove.range(0.58, 0.62),
    kick: groove.pick(KICK_PATTERNS),
    comp: groove.pick(COMP_PATTERNS),
    bass: groove.pick(BASS_PATTERNS),
    push: groove.chance(0.45)
  };
}

let cachedTune = null;
function getTune() {
  if (!cachedTune) cachedTune = composeTune(daySeed("lofi"));
  return cachedTune;
}

/* ---------------------------------------------------------- shared buffers */

const bufferCache = new WeakMap();

/** One noise buffer for drums, and ONE looped vinyl buffer (hiss + sparse pops). */
function getBuffers(c) {
  let buffers = bufferCache.get(c);
  if (buffers) return buffers;
  const rate = c.sampleRate;

  const noise = c.createBuffer(1, Math.floor(rate * 2), rate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;

  // 7.3 s does not divide the bar length, so the loop never lines up audibly.
  const vinyl = c.createBuffer(1, Math.floor(rate * 7.3), rate);
  const vinylData = vinyl.getChannelData(0);
  let low = 0;
  let previous = 0;
  for (let i = 0; i < vinylData.length; i += 1) {
    const white = Math.random() * 2 - 1;
    low += (white - low) * 0.35;
    const band = low - previous * 0.94; // crude band-pass: thin, airy hiss
    previous = low;
    vinylData[i] = band * 0.018;
  }
  const pops = Math.floor(7.3 * 5);
  for (let p = 0; p < pops; p += 1) {
    const at = Math.floor(Math.random() * (vinylData.length - 400));
    const big = Math.random() < 0.08;
    const amplitude = big ? 0.22 + Math.random() * 0.14 : 0.03 + Math.random() ** 2.5 * 0.15;
    const decay = big ? 60 + Math.random() * 90 : 6 + Math.random() * 26;
    const ringHz = 1800 + Math.random() * 2600;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const length = Math.min(Math.floor(decay * 6), vinylData.length - at);
    for (let k = 0; k < length; k += 1) {
      vinylData[at + k] += sign * amplitude * Math.exp(-k / decay) * Math.cos((2 * Math.PI * ringHz * k) / rate);
    }
  }

  buffers = { noise, vinyl };
  bufferCache.set(c, buffers);
  return buffers;
}

function makeRoom(c, seconds = 1.4) {
  const length = Math.floor(c.sampleRate * seconds);
  const impulse = c.createBuffer(2, length, c.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      low += ((Math.random() * 2 - 1) - low) * (0.5 - 0.35 * t);
      data[i] = low * (1 - t) ** 3 * 1.4;
    }
  }
  return impulse;
}

/* ---------------------------------------------------------------- session */

/**
 * Build the whole signal graph for one playback session on context `c`.
 * mix -> tape lowpass -> (+ vinyl) -> compressor -> fade -> analyser -> volume -> out
 */
function createSession(c, destination, tune, { analyser: withAnalyser = true, mute = [] } = {}) {
  const s = {
    c,
    tune,
    active: new Set(),
    bus: [],
    log: null,
    stats: { ticks: 0, steps: 0, late: 0, minLead: Infinity, maxTickGap: 0, sumTickGap: 0, lastTick: 0, resyncs: 0 },
    stopping: false
  };
  const node = (created) => {
    s.bus.push(created);
    return created;
  };
  const gain = (value) => {
    const g = node(c.createGain());
    g.gain.value = value;
    return g;
  };

  s.mix = gain(1);
  s.tape = node(c.createBiquadFilter());
  s.tape.type = "lowpass";
  s.tape.frequency.value = 3400;
  s.tape.Q.value = 0.6;
  s.post = gain(1);
  s.comp = node(c.createDynamicsCompressor());
  s.comp.threshold.value = -20;
  s.comp.knee.value = 14;
  s.comp.ratio.value = 3;
  s.comp.attack.value = 0.012;
  s.comp.release.value = 0.25;
  s.makeup = gain(0.8);
  s.fade = gain(0);
  s.volume = gain(volumeToGain(volume));

  s.mix.connect(s.tape);
  s.tape.connect(s.post);
  s.post.connect(s.comp);
  s.comp.connect(s.makeup);
  s.makeup.connect(s.fade);
  if (withAnalyser) {
    s.analyser = node(c.createAnalyser());
    s.analyser.fftSize = 256;
    s.analyser.smoothingTimeConstant = 0.8;
    s.analyser.minDecibels = -92;
    s.analyser.maxDecibels = -12;
    s.fade.connect(s.analyser);
    s.analyser.connect(s.volume);
  } else {
    s.fade.connect(s.volume);
  }
  s.volume.connect(destination);

  // Space: a short dark room and a dotted-eighth echo, both returning into the mix.
  s.room = node(c.createConvolver());
  s.room.buffer = makeRoom(c);
  s.roomSend = gain(1);
  s.roomReturn = gain(0.22);
  s.roomSend.connect(s.room);
  s.room.connect(s.roomReturn);
  s.roomReturn.connect(s.mix);

  const beat = 60 / tune.bpm;
  s.echo = node(c.createDelay(2));
  s.echo.delayTime.value = beat * 0.75;
  s.echoSend = gain(1);
  s.echoTone = node(c.createBiquadFilter());
  s.echoTone.type = "bandpass";
  s.echoTone.frequency.value = 1400;
  s.echoTone.Q.value = 0.5;
  s.echoFeedback = gain(0.32);
  s.echoReturn = gain(0.26);
  s.echoSend.connect(s.echo);
  s.echo.connect(s.echoTone);
  s.echoTone.connect(s.echoFeedback);
  s.echoFeedback.connect(s.echo);
  s.echoTone.connect(s.echoReturn);
  s.echoReturn.connect(s.mix);

  // Tape wow + flutter, summed (in cents) into every tonal oscillator's detune.
  s.wobble = gain(1);
  s.lfos = [];
  [[0.42, 7], [5.8, 2.2]].forEach(([rate, depth]) => {
    const lfo = node(c.createOscillator());
    const amount = gain(depth);
    lfo.frequency.value = rate;
    lfo.connect(amount);
    amount.connect(s.wobble);
    s.lfos.push(lfo);
  });

  // Electric piano bus: kick ducking -> light tremolo -> slow auto-pan.
  s.epBus = gain(1);
  s.epDuck = gain(1);
  s.epTrem = gain(0.93);
  s.epBus.connect(s.epDuck);
  s.epDuck.connect(s.epTrem);
  const tremolo = node(c.createOscillator());
  const tremoloDepth = gain(0.07);
  tremolo.frequency.value = 4.2;
  tremolo.connect(tremoloDepth);
  tremoloDepth.connect(s.epTrem.gain);
  s.lfos.push(tremolo);
  let epOut = s.epTrem;
  if (c.createStereoPanner) {
    s.epPan = node(c.createStereoPanner());
    const pan = node(c.createOscillator());
    const panDepth = gain(0.32);
    pan.frequency.value = 0.21;
    pan.connect(panDepth);
    panDepth.connect(s.epPan.pan);
    s.lfos.push(pan);
    s.epTrem.connect(s.epPan);
    epOut = s.epPan;
  }
  epOut.connect(s.mix);
  const epRoom = gain(0.3);
  const epEcho = gain(0.08);
  epOut.connect(epRoom);
  epOut.connect(epEcho);
  epRoom.connect(s.roomSend);
  epEcho.connect(s.echoSend);

  // Melody bus: a little tremolo of its own, more echo.
  s.melBus = gain(1);
  s.melBus.connect(s.mix);
  const melRoom = gain(0.32);
  const melEcho = gain(0.34);
  s.melBus.connect(melRoom);
  s.melBus.connect(melEcho);
  melRoom.connect(s.roomSend);
  melEcho.connect(s.echoSend);

  // Bass: gentle asymmetric saturation (adds a soft 2nd harmonic), then lowpass.
  s.bassBus = gain(1);
  s.bassShaper = node(c.createWaveShaper());
  const curve = new Float32Array(1024);
  const drive = 1.8;
  const bias = 0.12;
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = (Math.tanh(drive * (x + bias)) - Math.tanh(drive * bias)) / Math.tanh(drive);
  }
  s.bassShaper.curve = curve;
  s.bassShaper.oversample = "2x";
  s.bassLow = node(c.createBiquadFilter());
  s.bassLow.type = "lowpass";
  s.bassLow.frequency.value = 520;
  s.bassLow.Q.value = 0.5;
  s.bassHigh = node(c.createBiquadFilter()); // remove the DC the bias adds
  s.bassHigh.type = "highpass";
  s.bassHigh.frequency.value = 30;
  s.bassBus.connect(s.bassShaper);
  s.bassShaper.connect(s.bassLow);
  s.bassLow.connect(s.bassHigh);
  s.bassHigh.connect(s.mix);

  // Drums: soften the top a little for that sampled-from-tape feel.
  s.drumBus = gain(1);
  s.drumTone = node(c.createBiquadFilter());
  s.drumTone.type = "lowpass";
  s.drumTone.frequency.value = 9000;
  s.drumBus.connect(s.drumTone);
  s.drumTone.connect(s.mix);
  s.drumRoom = gain(0.14);
  s.drumRoom.connect(s.roomSend);

  // Vinyl: one looped buffer, thin and crisp, bypassing the tape lowpass.
  const { vinyl } = getBuffers(c);
  s.vinyl = node(c.createBufferSource());
  s.vinyl.buffer = vinyl;
  s.vinyl.loop = true;
  const vinylHigh = node(c.createBiquadFilter());
  vinylHigh.type = "highpass";
  vinylHigh.frequency.value = 700;
  const vinylLow = node(c.createBiquadFilter());
  vinylLow.type = "lowpass";
  vinylLow.frequency.value = 7500;
  const vinylLevel = gain(mute.includes("vinyl") ? 0 : 0.5);
  s.vinyl.connect(vinylHigh);
  vinylHigh.connect(vinylLow);
  vinylLow.connect(vinylLevel);
  vinylLevel.connect(s.post);

  s.sixteenth = beat / 4;
  s.swingOffset = (tune.swing - 0.5) * 2 * s.sixteenth;
  s.filterBase = 3400;
  s.melody = { prev: null, lastInterval: 0, phraseLeft: 0, phraseLength: 0, restLeft: 1 };
  s.arr = null;
  s.pushed = new Set();
  return s;
}

function startSession(s, at) {
  s.startTime = at;
  s.bar = 0;
  s.step = 0;
  s.nextStepTime = at + 0.05;
  s.lfos.forEach((lfo) => lfo.start(at));
  s.vinyl.start(at, Math.random() * 5);
  s.fade.gain.setValueAtTime(0, at);
  s.fade.gain.linearRampToValueAtTime(1, at + FADE_TIME);
}

function destroySession(s) {
  window.clearTimeout(s.timer);
  window.clearTimeout(s.stopTimer);
  s.timer = null;
  for (const voice of [...s.active]) releaseVoice(s, voice, true);
  s.active.clear();
  for (const created of s.bus) {
    try {
      if (typeof created.stop === "function") created.stop();
    } catch {
      // Never started or already stopped.
    }
    try {
      created.disconnect();
    } catch {
      // Already disconnected.
    }
  }
  s.bus.length = 0;
}

/* ------------------------------------------------------------------ voices */

/** Track a voice: disconnect everything when its sources end (or on teardown). */
function trackVoice(s, sources, nodes, detuned = []) {
  const voice = { sources, nodes, detuned };
  s.active.add(voice);
  sources[0].onended = () => releaseVoice(s, voice, false);
  return voice;
}

function releaseVoice(s, voice, force) {
  if (!s.active.has(voice) && !force) return;
  s.active.delete(voice);
  for (const source of voice.sources) {
    if (force) {
      try {
        source.stop();
      } catch {
        // Not started yet or already stopped.
      }
    }
    source.onended = null;
  }
  for (const param of voice.detuned) {
    try {
      s.wobble.disconnect(param);
    } catch {
      // Already disconnected.
    }
  }
  for (const created of [...voice.sources, ...voice.nodes]) {
    try {
      created.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

/**
 * Attack / exponential decay toward `sustain` / linear release that ends exactly on 0.
 * Returns the time the voice is silent.
 */
function envelope(param, t, { attack, peak, sustain, tau, off, release }) {
  const decayStart = t + attack;
  const releaseAt = Math.max(off, decayStart + 0.001);
  const valueAtRelease = sustain + (peak - sustain) * Math.exp(-(releaseAt - decayStart) / tau);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, decayStart);
  param.setTargetAtTime(sustain, decayStart, tau);
  param.setValueAtTime(valueAtRelease, releaseAt);
  param.linearRampToValueAtTime(0, releaseAt + release);
  return releaseAt + release + 0.01;
}

function percussive(param, t, peak, attack, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.002), t + attack + decay);
  param.linearRampToValueAtTime(0, t + attack + decay + 0.006);
  return t + attack + decay + 0.01;
}

function noiseSource(s, t, end) {
  const { noise } = getBuffers(s.c);
  const source = s.c.createBufferSource();
  source.buffer = noise;
  const span = Math.min(noise.duration - 0.05, end - t + 0.02);
  source.start(t, Math.random() * Math.max(0, noise.duration - span - 0.01));
  source.stop(end);
  return source;
}

function logEvent(s, t, inst, data) {
  if (s.log) s.log.push({ t: +(t - s.startTime).toFixed(4), bar: s.bar, step: s.step, inst, ...data });
}

function playKick(s, t, velocity) {
  const { c } = s;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(54, t + 0.06);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.32);
  const end = percussive(amp.gain, t, 0.62 * velocity, 0.003, 0.36);
  osc.connect(amp);
  amp.connect(s.drumBus);
  osc.start(t);
  osc.stop(end);

  // A tiny beater click for definition on small speakers.
  const clickEnd = t + 0.012;
  const click = noiseSource(s, t, clickEnd);
  const clickTone = c.createBiquadFilter();
  const clickAmp = c.createGain();
  clickTone.type = "lowpass";
  clickTone.frequency.value = 2600;
  percussive(clickAmp.gain, t, 0.07 * velocity, 0.0008, 0.005);
  click.connect(clickTone);
  clickTone.connect(clickAmp);
  clickAmp.connect(s.drumBus);

  trackVoice(s, [osc], [amp]);
  trackVoice(s, [click], [clickTone, clickAmp]);

  // Gentle sidechain feel: the piano dips under the kick.
  const duck = s.epDuck.gain;
  duck.setValueAtTime(1, t);
  duck.linearRampToValueAtTime(0.78, t + 0.012);
  duck.setTargetAtTime(1, t + 0.012, 0.11);
  logEvent(s, t, "kick", { vel: +velocity.toFixed(2), dur: +(end - t).toFixed(3) });
}

function playSnare(s, t, velocity, ghost = false) {
  const { c } = s;
  const decay = ghost ? 0.08 : 0.17;
  const end = t + decay + 0.02;
  const noise = noiseSource(s, t, end);
  const band = c.createBiquadFilter();
  const high = c.createBiquadFilter();
  const noiseAmp = c.createGain();
  band.type = "bandpass";
  band.frequency.value = 1900;
  band.Q.value = 0.7;
  high.type = "highpass";
  high.frequency.value = 650;
  percussive(noiseAmp.gain, t, 0.26 * velocity, 0.0015, decay);
  noise.connect(band);
  band.connect(high);
  high.connect(noiseAmp);
  noiseAmp.connect(s.drumBus);
  noiseAmp.connect(s.drumRoom);

  const body = c.createOscillator();
  const bodyAmp = c.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(196, t);
  body.frequency.exponentialRampToValueAtTime(168, t + 0.08);
  const bodyEnd = percussive(bodyAmp.gain, t, 0.16 * velocity, 0.001, ghost ? 0.04 : 0.09);
  body.connect(bodyAmp);
  bodyAmp.connect(s.drumBus);
  body.start(t);
  body.stop(bodyEnd);

  trackVoice(s, [noise], [band, high, noiseAmp]);
  trackVoice(s, [body], [bodyAmp]);
  logEvent(s, t, ghost ? "ghost" : "snare", { vel: +velocity.toFixed(2), dur: +(end - t).toFixed(3) });
}

function playHat(s, t, velocity, open = false) {
  const { c } = s;
  const decay = open ? 0.2 : 0.032;
  const end = t + decay + 0.015;
  const noise = noiseSource(s, t, end);
  const high = c.createBiquadFilter();
  const band = c.createBiquadFilter();
  const amp = c.createGain();
  high.type = "highpass";
  high.frequency.value = 7200;
  band.type = "peaking";
  band.frequency.value = 10500;
  band.gain.value = 4;
  percussive(amp.gain, t, (open ? 0.07 : 0.1) * velocity, 0.0008, decay);
  noise.connect(high);
  high.connect(band);
  band.connect(amp);
  amp.connect(s.drumBus);
  trackVoice(s, [noise], [high, band, amp]);
  logEvent(s, t, open ? "openhat" : "hat", { vel: +velocity.toFixed(2), dur: +(end - t).toFixed(3) });
}

/** FM electric piano: 1:1 carrier/modulator with a decaying index, plus a faint tine. */
function playEP(s, t, midi, velocity, duration) {
  const { c } = s;
  const freq = mtof(midi);
  const carrier = c.createOscillator();
  const modulator = c.createOscillator();
  const index = c.createGain();
  const amp = c.createGain();
  carrier.frequency.value = freq;
  modulator.frequency.value = freq;
  // Bright on attack, mellow while it rings.
  index.gain.setValueAtTime(freq * (1.4 + velocity * 0.9), t);
  index.gain.setTargetAtTime(freq * 0.32, t + 0.004, 0.2);
  const end = envelope(amp.gain, t, {
    attack: 0.009, peak: 0.07 * velocity, sustain: 0.012 * velocity, tau: 1.3, off: t + duration, release: 0.28
  });
  modulator.connect(index);
  index.connect(carrier.frequency);
  carrier.connect(amp);
  amp.connect(s.epBus);
  s.wobble.connect(carrier.detune);
  s.wobble.connect(modulator.detune);
  carrier.start(t);
  modulator.start(t);
  carrier.stop(end);
  modulator.stop(end);

  const tine = c.createOscillator();
  const tineAmp = c.createGain();
  tine.frequency.value = freq * 3.92;
  const tineEnd = percussive(tineAmp.gain, t, 0.008 * velocity, 0.002, 0.12);
  tine.connect(tineAmp);
  tineAmp.connect(s.epBus);
  tine.start(t);
  tine.stop(tineEnd);

  trackVoice(s, [carrier, modulator], [index, amp], [carrier.detune, modulator.detune]);
  trackVoice(s, [tine], [tineAmp]);
  logEvent(s, t, "ep", { midi, freq: +freq.toFixed(2), vel: +velocity.toFixed(2), dur: +duration.toFixed(3) });
}

function playBass(s, t, midi, velocity, duration) {
  const { c } = s;
  const freq = mtof(midi);
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.frequency.value = freq;
  const end = envelope(amp.gain, t, {
    attack: 0.014, peak: 0.42 * velocity, sustain: 0.3 * velocity, tau: 0.5, off: t + duration, release: 0.05
  });
  osc.connect(amp);
  amp.connect(s.bassBus);
  s.wobble.connect(osc.detune);
  osc.start(t);
  osc.stop(end);
  trackVoice(s, [osc], [amp], [osc.detune]);
  logEvent(s, t, "bass", { midi, freq: +freq.toFixed(2), vel: +velocity.toFixed(2), dur: +duration.toFixed(3) });
}

/** Soft mallet: fundamental + quickly fading 4th and 10th partials. */
function playMallet(s, t, midi, velocity, duration) {
  const { c } = s;
  const freq = mtof(midi);
  const fundamental = c.createOscillator();
  const amp = c.createGain();
  fundamental.frequency.value = freq;
  const end = envelope(amp.gain, t, {
    attack: 0.005, peak: 0.1 * velocity, sustain: 0.006 * velocity, tau: 0.55, off: t + duration, release: 0.22
  });
  fundamental.connect(amp);
  amp.connect(s.melBus);
  s.wobble.connect(fundamental.detune);
  fundamental.start(t);
  fundamental.stop(end);

  const overtone = c.createOscillator();
  const overtoneAmp = c.createGain();
  overtone.frequency.value = freq * 4;
  const overtoneEnd = percussive(overtoneAmp.gain, t, 0.022 * velocity, 0.002, 0.18);
  overtone.connect(overtoneAmp);
  overtoneAmp.connect(s.melBus);
  overtone.start(t);
  overtone.stop(overtoneEnd);

  trackVoice(s, [fundamental], [amp], [fundamental.detune]);
  trackVoice(s, [overtone], [overtoneAmp]);
  logEvent(s, t, "melody", { midi, freq: +freq.toFixed(2), vel: +velocity.toFixed(2), dur: +duration.toFixed(3) });
}

/* -------------------------------------------------------------- composition */

const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Segments overlapping bar `bar`, with steps relative to the bar. */
function segmentsInBar(tune, bar) {
  const barStart = (bar * STEPS_PER_BAR) % tune.loopSteps;
  return tune.segments
    .filter((segment) => segment.start < barStart + STEPS_PER_BAR && segment.start + segment.length > barStart)
    .map((segment) => ({ segment, from: segment.start - barStart, to: segment.start - barStart + segment.length }));
}

function segmentAt(tune, bar, step) {
  const position = (bar * STEPS_PER_BAR + step) % tune.loopSteps;
  return tune.segments.find((segment) => position >= segment.start && position < segment.start + segment.length);
}

/** Arrangement for an 8-bar block: drums drop out, the melody comes and goes, filter sweeps. */
function planBlock(s, block) {
  const previous = s.arr;
  if (block === 0) {
    return { kind: "intro", drumsOff: [0], hatsOnly: [1], melody: false, sweep: { from: 1300, bars: 2 } };
  }
  let kind;
  do {
    kind = weightedPick([
      { value: "groove", weight: 0.32 },
      { value: "lead", weight: 0.46 },
      { value: "breakdown", weight: 0.22 }
    ]).value;
  } while ((kind === "breakdown" && previous?.kind === "breakdown") || (block === 1 && kind === "breakdown"));
  if (previous && previous.kind !== "lead" && !previous.melody && kind === "groove") kind = "lead";

  if (kind === "breakdown") {
    const late = chance(0.5);
    return { kind, drumsOff: late ? [4, 5, 6, 7] : [0, 1, 2, 3], hatsOnly: [], melody: true, dip: late ? 4 : 0 };
  }
  return {
    kind,
    drumsOff: [],
    hatsOnly: [],
    melody: kind === "lead" || chance(0.25),
    sweep: chance(0.3) ? { from: 1800, bars: 2 } : null
  };
}

function scheduleFilter(s, t, barInBlock, arr = s.arr) {
  const freq = s.tape.frequency;
  const bar = s.sixteenth * STEPS_PER_BAR;
  if (barInBlock === 0 && arr.sweep) {
    if (arr.kind === "intro") {
      freq.setValueAtTime(arr.sweep.from, t);
    } else {
      freq.setValueAtTime(s.filterBase, t);
      freq.exponentialRampToValueAtTime(arr.sweep.from, t + 0.3);
    }
    freq.exponentialRampToValueAtTime(s.filterBase, t + bar * arr.sweep.bars);
  }
  if (arr.kind === "breakdown" && barInBlock === arr.dip) {
    freq.setValueAtTime(s.filterBase, t);
    freq.exponentialRampToValueAtTime(1150, t + 0.5);
    freq.setValueAtTime(1150, t + 0.5 + bar * 0.5);
    freq.exponentialRampToValueAtTime(s.filterBase, t + bar * 4);
  }
}

function nextMelodyNote(m, segment, strong) {
  const pool = segment.pool;
  if (m.prev === null) {
    const starts = pool.filter((note) => note >= 72 && note <= 81 && segment.tonePcs.has(note % 12));
    const note = starts[Math.floor(Math.random() * starts.length)] ?? pool[Math.floor(pool.length / 2)];
    m.prev = note;
    m.lastInterval = 0;
    return note;
  }
  const prevIndex = pool.reduce((best, note, i) => (Math.abs(note - m.prev) < Math.abs(pool[best] - m.prev) ? i : best), 0);
  const STEP_WEIGHTS = [0.3, 1, 0.7, 0.35, 0.15];
  const entries = pool.map((note, i) => {
    const distance = Math.abs(i - prevIndex);
    const interval = note - m.prev;
    if (Math.abs(interval) > 9) return { value: note, weight: 0 };
    let weight = STEP_WEIGHTS[Math.min(distance, 4)] ?? 0.05;
    const isTone = segment.tonePcs.has(note % 12);
    if (isTone) weight *= strong ? 2.4 : 1.2;
    else if (strong) weight *= 0.45;
    weight *= Math.exp(-((note - 76) ** 2) / (2 * 6.5 ** 2)) + 0.05;
    const sameDirection = Math.sign(interval) === Math.sign(m.lastInterval) && interval !== 0;
    if (Math.abs(m.lastInterval) >= 5 && sameDirection) weight *= 0.3; // recover after a leap
    else if (sameDirection) weight *= 1.25; // keep the contour moving
    return { value: note, weight };
  });
  const note = weightedPick(entries.filter((entry) => entry.weight > 0)).value;
  m.lastInterval = note - m.prev;
  m.prev = note;
  return note;
}

function finalMelodyNote(m, segment) {
  const targets = segment.pool.filter((note) => segment.tonePcs.has(note % 12) && Math.abs(note - (m.prev ?? 76)) <= 5);
  const note = targets.length ? targets[Math.floor(Math.random() * targets.length)] : nextMelodyNote(m, segment, true);
  m.lastInterval = note - (m.prev ?? note);
  m.prev = note;
  return note;
}

/** Melody events for one bar: 2-4 bar phrases with rests between them. */
function melodyBar(s, bar) {
  const m = s.melody;
  if (!s.arr.melody) {
    m.phraseLeft = 0;
    m.restLeft = 0;
    return [];
  }
  if (m.restLeft > 0) {
    m.restLeft -= 1;
    return [];
  }
  if (m.phraseLeft <= 0) {
    m.phraseLength = 2 + Math.floor(Math.random() * 3);
    m.phraseLeft = m.phraseLength;
  }
  const lastBar = m.phraseLeft === 1;
  const firstBar = m.phraseLeft === m.phraseLength;
  const events = [];
  let beat = 0;
  while (beat < 4) {
    if (lastBar && beat >= 2) {
      // Land the phrase on a held chord tone.
      const step = beat * 4;
      const segment = segmentAt(s.tune, bar, step);
      events.push({ step, length: STEPS_PER_BAR - step, midi: finalMelodyNote(m, segment), velocity: rand(0.62, 0.78) });
      break;
    }
    const options = CELLS.filter((cell) => beat + cell.beats <= 4 && (!cell.onStrong || beat % 2 === 0) && !(firstBar && beat === 0 && cell.notes.length === 0));
    const cell = weightedPick(options);
    for (const [offset, length] of cell.notes) {
      const step = beat * 4 + offset;
      const segment = segmentAt(s.tune, bar, step);
      const strong = offset === 0 && beat % 2 === 0;
      const accent = strong ? 0.08 : offset % 2 === 1 ? -0.08 : 0;
      events.push({ step, length, midi: nextMelodyNote(m, segment, strong), velocity: clamp(0.66 + accent + rand(-0.1, 0.1), 0.35, 0.95) });
    }
    beat += cell.beats;
  }
  m.phraseLeft -= 1;
  if (m.phraseLeft === 0) m.restLeft = chance(0.55) ? 1 : 2;
  return events;
}

/** Everything that happens in one bar, keyed by step. */
function planBar(s, bar) {
  const { tune } = s;
  const barInBlock = bar % 8;
  if (barInBlock === 0) s.arr = planBlock(s, Math.floor(bar / 8));
  const arr = s.arr;
  const events = Array.from({ length: STEPS_PER_BAR }, () => []);
  const add = (step, event) => events[step].push(event);

  // Drums.
  const drumsOut = arr.drumsOff.includes(barInBlock);
  const hatsOnly = arr.hatsOnly.includes(barInBlock);
  if (!drumsOut) {
    for (let step = 0; step < STEPS_PER_BAR; step += 2) {
      const open = step === 14 && chance(0.22);
      const downbeat = step % 4 === 0;
      add(step, { type: "hat", velocity: (downbeat ? rand(0.62, 0.8) : rand(0.4, 0.58)), open });
    }
    for (let step = 1; step < STEPS_PER_BAR; step += 2) {
      if (chance(0.12)) add(step, { type: "hat", velocity: rand(0.22, 0.36), open: false });
    }
    if (!hatsOnly) {
      tune.kick.forEach((step) => add(step, { type: "kick", velocity: step === 0 ? 1 : rand(0.78, 0.9) }));
      if (chance(0.12)) add(15, { type: "kick", velocity: 0.6 });
      add(4, { type: "snare", velocity: rand(0.86, 0.96) });
      add(12, { type: "snare", velocity: rand(0.9, 1) });
      [7, 9, 15].forEach((step) => {
        if (chance(0.12)) add(step, { type: "ghost", velocity: rand(0.16, 0.26) });
      });
      // Small fill into the next block.
      if (barInBlock === 7 && chance(0.6)) {
        [13, 14, 15].forEach((step, i) => add(step, { type: "ghost", velocity: 0.16 + i * 0.07 }));
      }
    }
  }

  // Harmony: bass + electric piano per chord segment in this bar.
  const segments = segmentsInBar(tune, bar);
  segments.forEach(({ segment, from, to }, index) => {
    const start = Math.max(0, from);
    const end = Math.min(STEPS_PER_BAR, to);
    const isLastInBar = index === segments.length - 1;
    const next = segmentAt(tune, bar, end);

    // Bass.
    const figure = end - start >= 16 ? tune.bass : [[0, Math.max(2, end - start - 1), 0]];
    const bassEvents = figure.map(([step, length, interval]) => ({ step: start + step, length, midi: segment.bassRoot + interval }));
    if (next && next.rootPc !== segment.rootPc && chance(0.35)) {
      // Walking passing note into the next root (chromatic or from a whole step).
      const approachStep = end - 2;
      const target = next.bassRoot;
      const approach = target + (chance(0.6) ? (chance(0.5) ? -1 : 1) : (chance(0.5) ? -2 : 2));
      const kept = bassEvents.filter((event) => event.step < approachStep);
      kept.forEach((event) => {
        event.length = Math.min(event.length, approachStep - event.step);
      });
      kept.push({ step: approachStep, length: 2, midi: clamp(approach, 28, 52), passing: true });
      bassEvents.length = 0;
      bassEvents.push(...kept);
    }
    bassEvents.forEach((event) => add(event.step, { type: "bass", ...event, velocity: event.passing ? 0.7 : rand(0.85, 0.95) }));

    // Electric piano: attacks inside the segment, possibly pushed an eighth early.
    const pushedHere = s.pushed.has(`${bar}:${start}`);
    const comp = end - start >= 16 ? tune.comp : [0];
    const attacks = comp.map((offset) => start + offset).filter((step) => step < end && !(pushedHere && step === start));
    const pushNext = tune.push && isLastInBar && end === STEPS_PER_BAR && next && next !== segment && chance(0.7);
    const stopAt = pushNext ? end - 2 : end;
    attacks.forEach((step, i) => {
      const until = i < attacks.length - 1 ? attacks[i + 1] : stopAt;
      if (until - step < 1) return;
      add(step, { type: "chord", voicing: segment.voicing, length: until - step, velocity: i === 0 ? rand(0.75, 0.88) : rand(0.55, 0.68) });
    });
    if (pushNext) {
      const nextSegments = segmentsInBar(tune, bar + 1);
      const first = nextSegments[0];
      const firstLength = Math.min(STEPS_PER_BAR, first.to) - Math.max(0, first.from);
      const nextComp = firstLength >= 16 ? tune.comp : [0];
      // Hold until the next bar's re-attack, or leave room for that bar's own push.
      const holdSteps = 2 + Math.min(nextComp[1] ?? firstLength, firstLength >= 16 ? 14 : firstLength);
      s.pushed.add(`${bar + 1}:0`);
      add(STEPS_PER_BAR - 2, { type: "chord", voicing: next.voicing, length: holdSteps, velocity: rand(0.72, 0.82) });
    }
  });
  s.pushed.delete(`${bar}:0`);

  // Melody.
  melodyBar(s, bar).forEach((event) => add(event.step, { type: "melody", ...event }));

  // The plan is made a bar ahead (for listeners like the rhythm game): keep its bar and
  // arrangement with it, so the filter sweep reads the right block.
  events.bar = bar;
  events.arr = arr;
  return events;
}

/* ---------------------------------------------------------- plan listeners */

const planListeners = new Set();

/** Tell listeners what a bar will play and when (AudioContext times, nominal grid). */
function announce(s, plan, barStart) {
  if (!planListeners.size || plan.announced) return;
  plan.announced = true;
  const events = [];
  plan.forEach((list, step) => {
    const time = stepTime(s, barStart, step);
    list.forEach((event) => events.push({ type: event.type, step, time, midi: event.midi ?? null, velocity: event.velocity ?? 1 }));
  });
  const detail = { bar: plan.bar, barStart, sixteenth: s.sixteenth, bpm: s.tune.bpm, events };
  planListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.warn("[lofi] plan listener failed", error);
    }
  });
}

/* --------------------------------------------------------------- scheduler */

function stepTime(s, barStart, step) {
  return barStart + step * s.sixteenth + (step % 2 === 1 ? s.swingOffset : 0);
}

function scheduleStep(s, time) {
  const { c } = s;
  const step = s.step;
  if (step === 0) {
    s.barStart = time;
    // Plan one bar ahead (same order as before, so the music does not change): listeners
    // learn about every bar at least a bar before it plays.
    s.plan = s.nextPlan?.bar === s.bar ? s.nextPlan : planBar(s, s.bar);
    s.nextPlan = planBar(s, s.bar + 1);
    scheduleFilter(s, time, s.bar % 8, s.plan.arr);
    announce(s, s.plan, time);
    announce(s, s.nextPlan, time + STEPS_PER_BAR * s.sixteenth);
  }
  const t = stepTime(s, s.barStart, step);
  const lead = t - c.currentTime;
  s.stats.steps += 1;
  s.stats.minLead = Math.min(s.stats.minLead, lead);
  if (lead < 0) s.stats.late += 1;
  const now = c.currentTime + 0.002;

  for (const event of s.plan[step]) {
    const at = (offset = 0) => Math.max(now, t + offset);
    const length = (steps) => stepTime(s, s.barStart, step + steps) - t;
    switch (event.type) {
      case "kick":
        playKick(s, at(), event.velocity);
        break;
      case "snare":
        playSnare(s, at(rand(0.008, 0.016)), event.velocity); // laid-back snare
        break;
      case "ghost":
        playSnare(s, at(rand(0, 0.01)), event.velocity, true);
        break;
      case "hat":
        playHat(s, at(rand(-0.003, 0.005)), event.velocity, event.open);
        break;
      case "bass":
        playBass(s, at(), event.midi, event.velocity, Math.max(0.08, length(event.length) - 0.065));
        break;
      case "chord": {
        const roll = rand(0.006, 0.014);
        const upward = chance(0.8);
        const duration = Math.max(0.12, length(event.length) - 0.03);
        event.voicing.forEach((midi, i) => {
          const order = upward ? i : event.voicing.length - 1 - i;
          const velocity = clamp(event.velocity * (i === event.voicing.length - 1 ? 1.06 : 1) + rand(-0.05, 0.05), 0.3, 1);
          playEP(s, at(order * roll), midi, velocity, duration - order * roll);
        });
        break;
      }
      case "melody": {
        const offset = clamp(rand(-0.012, 0.012), -0.012, 0.012);
        const articulation = event.length >= 4 ? 0.95 : rand(0.62, 0.92);
        playMallet(s, at(offset), event.midi, event.velocity, Math.max(0.08, length(event.length) * articulation));
        break;
      }
      default:
        break;
    }
  }

  s.step += 1;
  if (s.step >= STEPS_PER_BAR) {
    s.step = 0;
    s.bar += 1;
    s.nextStepTime = s.barStart + STEPS_PER_BAR * s.sixteenth;
  } else {
    s.nextStepTime = s.barStart + s.step * s.sixteenth;
  }
}

function scheduleUntil(s, horizon) {
  // After a long stall (e.g. a frozen tab), drop the missed steps and resume on the
  // next downbeat instead of firing a burst of late notes.
  const now = s.c.currentTime;
  if (s.nextStepTime < now - 0.2) {
    const barLength = STEPS_PER_BAR * s.sixteenth;
    let barStart = s.step === 0 ? s.nextStepTime : s.barStart + barLength;
    let bar = s.step === 0 ? s.bar : s.bar + 1;
    while (barStart < now) {
      barStart += barLength;
      bar += 1;
    }
    s.bar = bar;
    s.step = 0;
    s.nextStepTime = barStart;
    s.stats.resyncs += 1;
  }
  while (s.nextStepTime < horizon) scheduleStep(s, s.nextStepTime);
}

function tick(s) {
  if (session !== s) return;
  const now = performance.now();
  if (s.stats.lastTick) {
    const gap = now - s.stats.lastTick;
    s.stats.maxTickGap = Math.max(s.stats.maxTickGap, gap);
    s.stats.sumTickGap += gap;
  }
  s.stats.lastTick = now;
  s.stats.ticks += 1;
  const hidden = document.hidden;
  try {
    scheduleUntil(s, s.c.currentTime + (hidden ? LOOKAHEAD.hidden : LOOKAHEAD.visible));
  } catch (error) {
    console.warn("[lofi] scheduler error", error);
  }
  window.clearTimeout(s.timer);
  s.timer = window.setTimeout(() => tick(s), hidden ? TICK_MS.hidden : TICK_MS.visible);
}

/* ------------------------------------------------------------------ state */

let session = null;
let playing = false;
let debugLog = false;

function readVolume() {
  try {
    const stored = window.localStorage.getItem(VOLUME_KEY);
    if (stored === null) return DEFAULT_VOLUME;
    const value = Number(stored);
    return Number.isFinite(value) ? clamp(value, 0, 1) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

let volume = readVolume();

/** Perceptual volume curve. */
function volumeToGain(value) {
  return MUSIC_LEVEL * value ** 1.6;
}

function start() {
  const c = getAudioContext();
  if (!c) return Promise.resolve(false);
  const resumed = c.state === "suspended" ? c.resume().catch(() => {}) : Promise.resolve();

  if (session && session.stopping) {
    // Restarted during the fade-out: fade back in and keep the same band playing.
    const s = session;
    window.clearTimeout(s.stopTimer);
    s.stopping = false;
    const now = c.currentTime;
    const g = s.fade.gain;
    const current = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(current, now);
    g.linearRampToValueAtTime(1, now + FADE_TIME * (1 - current));
  } else if (!session) {
    try {
      const s = createSession(c, c.destination, getTune());
      if (debugLog) s.log = [];
      session = s;
      startSession(s, c.currentTime + 0.03);
      tick(s);
    } catch (error) {
      console.warn("[lofi] could not start", error);
      if (session) destroySession(session);
      session = null;
      return Promise.resolve(false);
    }
  }

  if (!playing) {
    playing = true;
    emit(EVT.LOFI, { playing: true });
  }
  return resumed.then(() => true);
}

function stop() {
  if (!session || session.stopping) {
    if (playing) {
      playing = false;
      emit(EVT.LOFI, { playing: false });
    }
    return;
  }
  const s = session;
  const now = s.c.currentTime;
  const g = s.fade.gain;
  const current = g.value;
  g.cancelScheduledValues(now);
  g.setValueAtTime(current, now);
  g.linearRampToValueAtTime(0, now + FADE_TIME);
  s.stopping = true;
  // Cut cleanly once the fade is over (the band keeps playing under the fade).
  s.stopTimer = window.setTimeout(() => {
    if (session === s) session = null;
    destroySession(s);
  }, FADE_TIME * 1000 + 80);

  playing = false;
  emit(EVT.LOFI, { playing: false });
}

export const lofi = {
  start,
  stop,
  toggle() {
    if (playing) stop();
    else start();
  },
  isPlaying: () => playing,
  /** 0..1, persisted. Ramps smoothly while playing. */
  setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    volume = clamp(next, 0, 1);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(Math.round(volume * 1000) / 1000));
    } catch {
      // Storage blocked: volume still applies for this visit.
    }
    if (session) {
      const param = session.volume.gain;
      const now = session.c.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(volumeToGain(volume), now + 0.08);
    }
  },
  /** The persisted volume (available before start). */
  getVolume: () => volume,
  /** AnalyserNode (fftSize 256) on the music bus while playing, otherwise null. */
  getAnalyser: () => session?.analyser ?? null,
  /**
   * Subscribe to bar plans: handler({ bar, barStart, sixteenth, bpm, events: [{ type, step,
   * time, midi, velocity }] }), called about a bar before the bar plays. Times are on the
   * AudioContext clock (getAudioContext() in sfx.js). Returns an unsubscribe function.
   */
  onPlan(handler) {
    planListeners.add(handler);
    return () => planListeners.delete(handler);
  }
};

/* ------------------------------------------------------------------- debug */

/** QA: record scheduled note events of the live session (and later sessions). */
export function setLofiDebug(enabled) {
  debugLog = Boolean(enabled);
  if (session) session.log = debugLog ? [] : null;
}

/** QA: scheduled events since debugging was enabled. */
export function getLofiLog() {
  return session?.log ?? [];
}

/** QA: scheduler timing statistics and live voice count. */
export function getLofiStats() {
  if (!session) return null;
  const { stats } = session;
  return {
    ticks: stats.ticks,
    steps: stats.steps,
    lateSteps: stats.late,
    minLeadMs: +(stats.minLead * 1000).toFixed(2),
    meanTickMs: stats.ticks > 1 ? +(stats.sumTickGap / (stats.ticks - 1)).toFixed(2) : null,
    maxTickMs: +stats.maxTickGap.toFixed(2),
    resyncs: stats.resyncs,
    activeVoices: session.active.size,
    bar: session.bar,
    tune: { name: session.tune.name, tonic: session.tune.tonic, bpm: session.tune.bpm, swing: +session.tune.swing.toFixed(3) }
  };
}

/** QA: the day's tune (progression, key, groove, voicings). */
export function getLofiTune() {
  return getTune();
}

/**
 * QA: render `seconds` of music offline (faster than real time) and return
 * { buffer, log }. Uses a fresh session on an OfflineAudioContext.
 */
export async function renderLofiOffline(seconds = 24, sampleRate = 44100, { mute = [], volume: level = null } = {}) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return null;
  const c = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const s = createSession(c, c.destination, getTune(), { analyser: false, mute });
  if (level !== null) s.volume.gain.value = volumeToGain(clamp(level, 0, 1));
  s.log = [];
  startSession(s, 0);
  scheduleUntil(s, seconds - 0.5);
  const buffer = await c.startRendering();
  return { buffer, log: s.log, activeAfter: s.active.size };
}

export function init() {
  // Nothing to set up eagerly: the context is created on the first start(), and the
  // persisted volume is already loaded so the HUD can read it.
  document.addEventListener("visibilitychange", () => {
    // Extend the lookahead immediately when the tab hides (timers get throttled).
    if (session && !session.stopping) tick(session);
  });
}
