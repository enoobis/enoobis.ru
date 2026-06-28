/**
 * global ripple effect - adds a circular wave to any clicked <button> / .btn.
 * respects prefers-reduced-motion and skips elements opted out via data-no-ripple.
 */

import { prefersLiteMotion } from "./reducedMotion";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const COARSE_POINTER =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(pointer: coarse)")
    : null;

function spawnRipple(target: HTMLElement, x: number, y: number) {
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const node = document.createElement("span");
  node.className = "ripple";
  node.style.width = node.style.height = `${size}px`;
  node.style.left = `${x - rect.left - size / 2}px`;
  node.style.top = `${y - rect.top - size / 2}px`;
  target.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, 600);
}

function onPointerDown(event: PointerEvent) {
  if (REDUCED_MOTION?.matches || COARSE_POINTER?.matches || prefersLiteMotion()) return;
  const path = event.composedPath();
  const target = path.find(
    (n) =>
      n instanceof HTMLElement &&
      (n.tagName === "BUTTON" || n.classList.contains("btn")) &&
      !n.hasAttribute("data-no-ripple") &&
      !(n as HTMLButtonElement).disabled,
  ) as HTMLElement | undefined;
  if (!target) return;
  const cs = window.getComputedStyle(target);
  if (cs.position === "static") target.style.position = "relative";
  if (cs.overflow !== "hidden") target.style.overflow = "hidden";
  spawnRipple(target, event.clientX, event.clientY);
}

export function installRipple() {
  if (typeof window === "undefined") return;
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
}
