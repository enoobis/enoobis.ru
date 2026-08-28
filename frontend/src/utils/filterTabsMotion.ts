interface TabsKind {
  /** класс контейнера */
  root: string;
  /** класс кнопки-вкладки */
  tab: string;
  /** класс бегунка */
  thumb: string;
  /** класс, включающий motion-режим на контейнере */
  motion: string;
  /** бегунок повторяет только ширину (underline) или ещё и высоту (pill) */
  fullSize: boolean;
}

const KINDS: TabsKind[] = [
  {
    root: "filter-tabs",
    tab: "filter-tab",
    thumb: "filter-tabs-thumb",
    motion: "filter-tabs--motion",
    fullSize: true,
  },
  {
    root: "content-tabs",
    tab: "content-tab",
    thumb: "content-tabs-thumb",
    motion: "content-tabs--motion",
    fullSize: false,
  },
];

const enhanced = new WeakSet<HTMLElement>();
const lastActive = new WeakMap<HTMLElement, HTMLElement>();

function tabNodes(el: HTMLElement, kind: TabsKind): HTMLElement[] {
  return Array.from(el.children).filter(
    (n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains(kind.tab),
  );
}

function ensureThumb(el: HTMLElement, kind: TabsKind): HTMLElement {
  let thumb = el.querySelector(`:scope > .${kind.thumb}`) as HTMLElement | null;
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = kind.thumb;
    thumb.setAttribute("aria-hidden", "true");
    el.insertBefore(thumb, el.firstChild);
  }
  return thumb;
}

function isActive(t: HTMLElement): boolean {
  return (
    t.classList.contains("on") ||
    t.classList.contains("router-link-active") ||
    t.getAttribute("aria-selected") === "true"
  );
}

function syncThumb(el: HTMLElement, kind: TabsKind) {
  const thumb = ensureThumb(el, kind);
  const tabs = tabNodes(el, kind);
  if (!tabs.length) {
    thumb.style.opacity = "0";
    return;
  }

  const active = tabs.find(isActive);
  if (!active) {
    thumb.style.opacity = "0";
    return;
  }

  const style = getComputedStyle(el);
  const borderL = parseFloat(style.borderLeftWidth) || 0;
  const borderT = parseFloat(style.borderTopWidth) || 0;
  const er = el.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  const x = ar.left - er.left - borderL + el.scrollLeft;
  const y = ar.top - er.top - borderT + el.scrollTop;

  thumb.style.width = `${ar.width}px`;
  if (kind.fullSize) {
    thumb.style.height = `${ar.height}px`;
    thumb.style.transform = `translate(${x}px, ${y}px)`;
  } else {
    thumb.style.transform = `translateX(${x}px)`;
  }
  thumb.style.opacity = "1";

  if (active !== lastActive.get(el)) {
    lastActive.set(el, active);
    if (el.scrollWidth > el.clientWidth + 1) {
      const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }
}

function enhance(el: HTMLElement, kind: TabsKind) {
  if (enhanced.has(el)) {
    syncThumb(el, kind);
    return;
  }
  enhanced.add(el);
  el.classList.add(kind.motion);
  ensureThumb(el, kind);

  const sync = () => syncThumb(el, kind);
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
  for (const kind of KINDS) {
    root.querySelectorAll<HTMLElement>(`.${kind.root}`).forEach((el) => enhance(el, kind));
  }
}

/** sliding indicator для .filter-tabs (pill) и .content-tabs (underline) */
export function installFilterTabsMotion() {
  scan();
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const kind = KINDS.find((k) => n.classList.contains(k.root));
        if (kind) enhance(n, kind);
        else scan(n);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
