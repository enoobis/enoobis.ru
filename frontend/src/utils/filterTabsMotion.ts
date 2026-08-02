const enhanced = new WeakSet<HTMLElement>();

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

  const er = el.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  const style = getComputedStyle(el);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const x = ar.left - er.left - padL + el.scrollLeft;
  const y = ar.top - er.top - padT + el.scrollTop;

  thumb.style.width = `${Math.max(0, ar.width)}px`;
  thumb.style.height = `${Math.max(0, ar.height)}px`;
  thumb.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
  thumb.style.opacity = "1";
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
