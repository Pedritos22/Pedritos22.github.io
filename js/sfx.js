// Sound effects API. Owner: audio/projects workstream (D).
// Phase-0 stub: click/glass/objection use the existing mp3 files; the rest are no-ops
// until D implements them. Call sites may use every method already.

const buttonClickAudio = new Audio("assets/button-click.mp3");
buttonClickAudio.preload = "auto";
buttonClickAudio.volume = 0.62;

const glassBreakAudios = ["assets/glass-break-1.mp3", "assets/glass-break-2.mp3", "assets/glass-break-3.mp3"].map((src) => {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 0.86;
  return audio;
});

const objectionAudios = ["assets/objection-1.mp3", "assets/objection-2.mp3", "assets/objection-3.mp3"].map((src) => {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 0.9;
  return audio;
});

let muted = false;

function playOneShotAudio(audio, volume = null) {
  if (!audio || muted) return;
  const clone = audio.cloneNode();
  clone.volume = volume ?? audio.volume ?? 0.7;
  clone.currentTime = 0;
  clone.play().catch(() => {
    // Missing file or autoplay policy: the visual interaction still works.
  });
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const sfx = {
  /** Pointer enters / keyboard focus moves to a menu item. */
  hover() {},
  /** Generic button press. */
  click() {
    playOneShotAudio(buttonClickAudio, 0.62);
  },
  /** A selection lands (menu cursor arrives, section chosen). */
  confirm() {},
  /** Going back / closing. */
  back() {},
  /** Section transition wipe. */
  whoosh() {},
  /** Glass cracking: stage 1..3. */
  crack(stage = 1) {}, // eslint-disable-line no-unused-vars
  /** Glass shattering. */
  glass() {
    playOneShotAudio(pick(glassBreakAudios), 0.86);
  },
  /** Objection shout. */
  objection() {
    if (muted) return;
    const audio = pick(objectionAudios);
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  },
  /** Dialog open (true) / close (false). */
  dialog(open = true) {}, // eslint-disable-line no-unused-vars
  /** Clock tick (intro). */
  tick() {},
  /** Midnight bell (intro / Dark Hour). */
  bell() {},
  /** Toast notification. */
  toast() {},
  setMuted(value) {
    muted = Boolean(value);
  },
  isMuted() {
    return muted;
  },
  /** Resume audio after the first user gesture (autoplay policy). */
  unlock() {}
};

export function init() {}
