// Main menu: active state, click + keyboard navigation.
// Owner: menu/panel workstream (B).
import { EVT, on, isMobileLayout } from "./core.js";
import { showSection } from "./sections.js";
import { sfx } from "./sfx.js";

let buttons = [];

function clearActive() {
  buttons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function setActive(index) {
  if (!buttons[index] || buttons[index].disabled) return;

  buttons.forEach((button, buttonIndex) => {
    const isActive = buttonIndex === index;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  showSection(buttons[index].dataset.section);
}

function handleKeydown(event) {
  if (isMobileLayout() && !document.activeElement.classList.contains("menu-item")) {
    return;
  }

  const activeIndex = buttons.findIndex((button) => button.classList.contains("is-active"));
  const focusedIndex = buttons.findIndex((button) => button === document.activeElement);
  const current = activeIndex !== -1 ? activeIndex : focusedIndex;

  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    const next = current <= 0 ? buttons.length - 1 : current - 1;
    setActive(next);
    buttons[next].focus();
  }

  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    const next = current === -1 || current >= buttons.length - 1 ? 0 : current + 1;
    setActive(next);
    buttons[next].focus();
  }

  if (event.key === "Enter" && document.activeElement.classList.contains("menu-item")) {
    document.activeElement.click();
  }
}

export function init() {
  buttons = Array.from(document.querySelectorAll(".menu-item"));

  buttons.forEach((button, index) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (button.disabled) return;
      sfx.click();
      setActive(index);
    });
  });

  on(EVT.SECTION_CHANGED, ({ to }) => {
    if (to === "home") clearActive();
  });

  window.addEventListener("keydown", handleKeydown);
}
