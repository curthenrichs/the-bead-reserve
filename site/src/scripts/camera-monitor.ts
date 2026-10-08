/* The camera monitor island: polls /api/reserve and repaints the
   server-rendered markup. The markup already shows the dark state, so
   with JavaScript off, or before the first answer, the page is honest.
   A failed or malformed answer goes dark; the next good one recovers. */
import { DARK, parseReserve, viewFor, type MonitorView } from "./camera-state";

const FRAME_SRC = "/api/frame/latest";
const FRAME_ALT = "Camera view of the reserve jar";

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
      const img = document.createElement("img");
      img.src = FRAME_SRC;
      img.alt = FRAME_ALT;
      img.className = "cm-frame";
      screen.replaceChildren(img);
    }
  } else if (!screen.querySelector("[data-cm-placeholder]")) {
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
    },
  };
}
