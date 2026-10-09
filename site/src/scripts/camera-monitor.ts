/* The camera monitor island: polls /api/reserve and repaints the
   server-rendered markup. The markup already shows the dark state, so
   with JavaScript off, or before the first answer, the page is honest.
   A failed or malformed answer goes dark; the next good one recovers. */
import {
  buildPlateModal,
  type PlateModalRefs,
} from "@half-built/astro/scripts/plate-modal.ts";
import {
  DARK,
  RESERVE_EVENT,
  parseReserve,
  viewFor,
  type MonitorView,
} from "./camera-state";

export { RESERVE_EVENT };

const FRAME_SRC = "/api/frame/latest";
const FRAME_ALT = "Camera view of the reserve jar";

function frame(): HTMLImageElement {
  const img = document.createElement("img");
  img.src = FRAME_SRC;
  img.alt = FRAME_ALT;
  img.className = "cm-frame";
  return img;
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
      screen.replaceChildren(frame());
    }
  } else if (!screen.querySelector("[data-cm-placeholder]")) {
    const span = document.createElement("span");
    span.dataset.cmPlaceholder = "";
    span.className = "cm-placeholder";
    span.textContent = v.placeholder;
    screen.replaceChildren(span);
  }
}

/* Enlarge pops the whole monitor out onto the package plate modal, the
   way the path player's box comes out. The live element moves into the
   plate, so polling keeps repainting it there, and a slot of the same
   height holds its place in the page. Every way out (close box, veil,
   Escape) fires the dialog's close event, which moves it back. The
   plate is built on first use and kept. */
function mountPopout(el: HTMLElement): { destroy(): void } {
  const btn = el.querySelector(".cm-enlarge");

  if (!(btn instanceof HTMLButtonElement)) {
    return {
      destroy() {
        /* no button, nothing mounted */
      },
    };
  }

  const doc = el.ownerDocument;
  let pm: PlateModalRefs | undefined;
  let slot: HTMLElement | undefined;

  const putBack = (): void => {
    if (!slot) return;
    slot.replaceWith(el);
    slot = undefined;
    el.classList.remove("is-popped");
    /* The package returns focus before the monitor is back, while the
       button is still hidden in the plate, so focus it again here. */
    btn.focus();
  };

  const plate = (): PlateModalRefs => {
    if (pm) return pm;
    pm = buildPlateModal(doc, { ariaLabel: "Reserve monitor" });
    pm.zone.classList.add("cm-zone");
    pm.plate.classList.add("cm-plate");
    pm.dialog.addEventListener("close", putBack);
    return pm;
  };

  const onClick = (): void => {
    if (slot) return;
    const refs = plate();
    slot = doc.createElement("div");
    slot.dataset.cmSlot = "";
    slot.className = "cm-slot";
    slot.style.height = `${el.getBoundingClientRect().height}px`;
    el.before(slot);
    el.classList.add("is-popped");
    refs.plate.append(el);
    refs.open(btn);
  };

  btn.addEventListener("click", onClick);

  return {
    destroy(): void {
      btn.removeEventListener("click", onClick);
      if (pm?.isOpen()) pm.close();
      putBack();
      pm?.dialog.remove();
      pm = undefined;
    },
  };
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
  const popout = mountPopout(el);

  const poll = async (): Promise<void> => {
    let reserve = DARK;

    try {
      const res = await fetchImpl("/api/reserve");
      if (res.ok) reserve = parseReserve(await res.json());
    } catch {
      reserve = DARK;
    }

    if (!alive) return;
    renderMonitor(el, viewFor(reserve));

    el.ownerDocument.dispatchEvent(
      new CustomEvent(RESERVE_EVENT, { detail: reserve }),
    );
  };

  void poll();
  const timer = pollMs > 0 ? setInterval(() => void poll(), pollMs) : undefined;

  return {
    destroy(): void {
      alive = false;
      if (timer !== undefined) clearInterval(timer);
      popout.destroy();
    },
  };
}
