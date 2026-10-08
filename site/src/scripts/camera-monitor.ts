/* The camera monitor island: polls /api/reserve and repaints the
   server-rendered markup. The markup already shows the dark state, so
   with JavaScript off, or before the first answer, the page is honest.
   A failed or malformed answer goes dark; the next good one recovers. */
import { mountLightbox } from "@half-built/astro/scripts/lightbox.ts";
import { DARK, parseReserve, viewFor, type MonitorView } from "./camera-state";

const FRAME_SRC = "/api/frame/latest";
const FRAME_ALT = "Camera view of the reserve jar";

/* The size the lightbox is told before the frame loads: the monitor's
   16:10. The real natural size replaces it on load. */
const FALLBACK_W = 1600;
const FALLBACK_H = 1000;

/* One lightbox mount per monitor. The frame link is made at runtime and
   replaced after an outage, so each new link remounts: destroy drops the
   old link's claim and its dialog, and the fresh mount claims the new
   one. */
const lightboxes = new WeakMap<HTMLElement, { destroy(): void }>();

function unmountLightbox(root: HTMLElement): void {
  lightboxes.get(root)?.destroy();
  lightboxes.delete(root);
}

/* The anchor LightboxLink renders, built here because the frame only
   exists at runtime. */
function frameLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "lightbox-link cm-frame-link";
  link.href = FRAME_SRC;
  link.dataset.lbW = String(FALLBACK_W);
  link.dataset.lbH = String(FALLBACK_H);
  link.dataset.lbCaption = FRAME_ALT;
  link.setAttribute("aria-label", `View full-size image: ${FRAME_ALT}`);

  const img = document.createElement("img");
  img.src = FRAME_SRC;
  img.alt = FRAME_ALT;
  img.className = "cm-frame";

  img.addEventListener("load", () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      link.dataset.lbW = String(img.naturalWidth);
      link.dataset.lbH = String(img.naturalHeight);
    }
  });

  link.append(img);
  return link;
}

export function renderMonitor(root: HTMLElement, v: MonitorView): void {
  root.dataset.status = v.status;
  const badge = root.querySelector("[data-cm-badge]");
  const mood = root.querySelector("[data-cm-mood]");
  const moodCaption = root.querySelector("[data-cm-mood-caption]");
  const screen = root.querySelector("[data-cm-screen]");
  const caption = root.querySelector("[data-cm-caption]");

  if (badge) badge.textContent = v.badge;
  root.classList.toggle("is-live", v.live);

  if (mood instanceof HTMLImageElement) {
    mood.src = v.mood;
    mood.alt = v.moodAlt;
  }

  if (moodCaption) moodCaption.textContent = v.moodCaption;
  if (caption) caption.textContent = v.caption;
  if (!screen) return;

  if (v.showFrame) {
    if (!screen.querySelector("img")) {
      screen.replaceChildren(frameLink());
      unmountLightbox(root);
      lightboxes.set(root, mountLightbox(root));
    }
  } else if (!screen.querySelector("[data-cm-placeholder]")) {
    /* Intended: when the feed drops, an open lightbox closes with it. */
    unmountLightbox(root);
    const span = document.createElement("span");
    span.dataset.cmPlaceholder = "";
    span.className = "cm-placeholder";
    span.textContent = v.placeholder;
    screen.replaceChildren(span);
  }
}

export function mountCameraMonitor(
  root: ParentNode,
  options: { pollMs?: number; fetchImpl?: typeof fetch } = {},
): { destroy(): void } {
  const { pollMs = 60_000, fetchImpl = fetch } = options;
  const el = root.querySelector("[data-camera-monitor]");

  if (!(el instanceof HTMLElement)) {
    return {
      destroy() {
        /* nothing mounted */
      },
    };
  }

  let alive = true;

  const poll = async (): Promise<void> => {
    let reserve = DARK;

    try {
      const res = await fetchImpl("/api/reserve");
      if (res.ok) reserve = parseReserve(await res.json());
    } catch {
      reserve = DARK;
    }

    if (alive) renderMonitor(el, viewFor(reserve));
  };

  void poll();
  const timer = pollMs > 0 ? setInterval(() => void poll(), pollMs) : undefined;

  return {
    destroy(): void {
      alive = false;
      if (timer !== undefined) clearInterval(timer);
      unmountLightbox(el);
    },
  };
}
