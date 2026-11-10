// Motion system: GSAP (vendored UMD build, loaded by index.html before the modules)
// plus the named easings and durations from DESIGN.md. Import from here, never from window.
const { gsap, SplitText, CustomEase } = window;

if (!gsap) {
  throw new Error("GSAP failed to load (vendor/gsap/gsap.min.js)");
}

gsap.registerPlugin(SplitText, CustomEase);

/** Durations in seconds (mirror --dur-1..4 in css/base.css). */
export const DUR = Object.freeze({
  micro: 0.12, // hover, press
  ui: 0.24,    // small UI changes, menus
  panel: 0.42, // section transitions, panels
  scene: 0.7   // hero entrances, intro beats
});

/** Named easings (mirror --ease-* in css/base.css). */
CustomEase.create("p3.snap", "0.86, 0, 0.07, 1");
CustomEase.create("p3.out", "0.16, 1, 0.3, 1");
CustomEase.create("p3.in", "0.7, 0, 0.84, 0");

export const EASE = Object.freeze({
  snap: "p3.snap",            // wipes, slams, things that cut across the screen
  out: "p3.out",              // entrances (expo-out)
  in: "p3.in",                // exits
  spring: "back.out(1.7)",    // playful overshoot: cursor, cards settling
  elastic: "elastic.out(1, 0.55)"
});

/** Stagger between cascaded items (seconds). */
export const STAGGER = 0.035;

gsap.defaults({ ease: EASE.out, duration: DUR.ui, overwrite: "auto" });

export { gsap, SplitText, CustomEase };
