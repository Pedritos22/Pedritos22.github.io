// Lo-fi music engine API. Owner: audio/projects workstream (D).
// Phase-0: the original synth moved here unchanged, behind the contract API.
import { EVT, emit } from "./core.js";

let audioContext = null;
let masterGain = null;
let delayNode = null;
let feedbackGain = null;
let toneFilter = null;
let noiseFilter = null;
let compressorNode = null;
let musicTimer = null;
let musicStep = 0;
let isMusicPlaying = false;
let lofiVolume = 0.92;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();

    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.0001;

    delayNode = audioContext.createDelay(1.4);
    delayNode.delayTime.value = 0.34;

    feedbackGain = audioContext.createGain();
    feedbackGain.gain.value = 0.22;

    toneFilter = audioContext.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 1700;
    toneFilter.Q.value = 0.45;

    noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 6500;

    compressorNode = audioContext.createDynamicsCompressor();
    compressorNode.threshold.value = -18;
    compressorNode.knee.value = 18;
    compressorNode.ratio.value = 5;
    compressorNode.attack.value = 0.004;
    compressorNode.release.value = 0.16;

    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(masterGain);
    toneFilter.connect(delayNode);
    toneFilter.connect(masterGain);
    noiseFilter.connect(masterGain);
    masterGain.connect(compressorNode);
    compressorNode.connect(audioContext.destination);
  }

  return audioContext;
}

function getTargetLoFiGain() {
  return 0.72 * lofiVolume;
}

function playTone(frequency, duration = 0.22, type = "sine", volume = 0.09, detune = 0) {
  const context = getAudioContext();
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(volume, now + 0.018);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(envelope);
  envelope.connect(toneFilter);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.04);
}

function playNoise(duration = 0.035, volume = 0.034) {
  const context = getAudioContext();
  const bufferSize = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  const source = context.createBufferSource();
  const envelope = context.createGain();

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  envelope.gain.value = volume;
  source.buffer = buffer;
  source.connect(envelope);
  envelope.connect(noiseFilter);
  source.start();
}

function playLoFiStep() {
  const chords = [
    [130.81, 196.0, 246.94],
    [146.83, 220.0, 277.18],
    [110.0, 164.81, 220.0],
    [123.47, 185.0, 233.08]
  ];
  const melody = [523.25, 587.33, 659.25, 493.88, 440.0, 493.88, 392.0, 440.0];
  const chord = chords[Math.floor(musicStep / 4) % chords.length];

  if (musicStep % 4 === 0) {
    chord.forEach((frequency, index) => {
      playTone(frequency, 0.92, "triangle", index === 0 ? 0.11 : 0.074, index * 4);
    });
  }

  if (musicStep % 8 === 2 || musicStep % 8 === 6) {
    playTone(melody[musicStep % melody.length], 0.24, "sine", 0.085, -6);
  }

  if (musicStep % 4 === 2) {
    playTone(chord[0] / 2, 0.32, "sine", 0.105);
  }

  if (musicStep % 2 === 1) {
    playNoise(0.045, 0.052);
  }

  musicStep = (musicStep + 1) % 16;
}

async function start() {
  const context = getAudioContext();
  await context.resume();

  isMusicPlaying = true;
  masterGain.gain.cancelScheduledValues(context.currentTime);
  masterGain.gain.setTargetAtTime(getTargetLoFiGain(), context.currentTime, 0.12);

  playLoFiStep();
  window.clearInterval(musicTimer);
  musicTimer = window.setInterval(playLoFiStep, 360);
  emit(EVT.LOFI, { playing: true });
}

function stop() {
  if (!audioContext || !masterGain) return;

  isMusicPlaying = false;
  window.clearInterval(musicTimer);
  musicTimer = null;
  masterGain.gain.cancelScheduledValues(audioContext.currentTime);
  masterGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.16);
  emit(EVT.LOFI, { playing: false });
}

export const lofi = {
  start,
  stop,
  toggle() {
    if (isMusicPlaying) stop();
    else start();
  },
  isPlaying: () => isMusicPlaying,
  /** 0..1 */
  setVolume(value) {
    lofiVolume = Math.min(1, Math.max(0, Number(value)));
    if (audioContext && masterGain && isMusicPlaying) {
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setTargetAtTime(getTargetLoFiGain(), audioContext.currentTime, 0.08);
    }
  },
  getVolume: () => lofiVolume,
  /** AnalyserNode while playing, otherwise null. (Phase-0 stub: always null.) */
  getAnalyser: () => null
};

export function init() {}
