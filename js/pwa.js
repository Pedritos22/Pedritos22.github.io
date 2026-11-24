// Registers the service worker (sw.js: offline support, installable app) once the page is
// idle, so it never competes with the first paint. Skipped on localhost unless ?sw is set,
// so local development always sees fresh files.
export function init() {
  if (!("serviceWorker" in navigator)) return;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if (local && !new URLSearchParams(window.location.search).has("sw")) return;
  const register = () => {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { scope: "/" }).catch((error) => {
      console.warn("[pwa] service worker not registered", error);
    });
  };
  if (document.readyState === "complete") window.setTimeout(register, 2000);
  else window.addEventListener("load", () => window.setTimeout(register, 2000), { once: true });
}
