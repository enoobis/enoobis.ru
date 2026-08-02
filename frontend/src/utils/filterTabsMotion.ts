const enhanced = new WeakSet<HTMLElement>();
const lastActive = new WeakMap<HTMLElement, HTMLElement>();

function tabNodes(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (n): n is HTMLElement =>
      n instanceof HTMLElement && n.classList.contains("filter-tab"),
  );
}

function ensureThumb(el: HTMLElement): HTMLElement {
  let thumb = el.querySelector(":scope > .filter-tabs-thumb") as HTMLElement | null;
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "filter-tabs-thumb";
    thumb.setAttribute("aria-hidden", "true");
    el.insertBefore(thumb, el.firstChild);
  }
  return thumb;
}

function syncThumb(el: HTMLElement) {
  const thumb = ensureThumb(el);
  const tabs = tabNodes(el);
  if (!tabs.length) {
    thumb.style.opacity = "0";
    return;
  }

  const active =
    tabs.find(
      (t) => t.classList.contains("on") || t.getAttribute("aria-selected") === "true",
    ) ?? tabs[0];

  const style = getComputedStyle(el);
  const borderL = parseFloat(style.borderLeftWidth) || 0;
  const borderT = parseFloat(style.borderTopWidth) || 0;
  const er = el.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  const x = ar.left - er.left - borderL + el.scrollLeft;
  const y = ar.top - er.top - borderT + el.scrollTop;

  thumb.style.width = `${ar.width}px`;
  thumb.style.height = `${ar.height}px`;
  thumb.style.transform = `translate(${x}px, ${y}px)`;
  thumb.style.opacity = "1";

  if (active !== lastActive.get(el)) {
    lastActive.set(el, active);
    if (el.scrollWidth > el.clientWidth + 1) {
      const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }
}

function enhance(el: HTMLElement) {
  if (enhanced.has(el)) {
    syncThumb(el);
    return;
  }
  enhanced.add(el);
  el.classList.add("filter-tabs--motion");
  ensureThumb(el);

  const sync = () => syncThumb(el);
  sync();
  requestAnimationFrame(sync);

  const mo = new MutationObserver(sync);
  mo.observe(el, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["class", "aria-selected"],
  });

  el.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".filter-tabs").forEach(enhance);
}

/** sliding pill for all .filter-tabs — works with existing markup */
export function installFilterTabsMotion() {
  scan();
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.classList.contains("filter-tabs")) enhance(n);
          else scan(n);
        });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
