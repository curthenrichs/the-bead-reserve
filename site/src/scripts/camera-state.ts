/* The camera monitor's state, kept apart from the DOM so every case is
   a plain function test. Copy is verbatim from the React island this
   replaces. Anything the Worker sends that does not have the expected
   shape reads as dark, the honest default. */
export type Status = "fresh" | "stale" | "dark";

export interface Reserve {
  frameUrl: string | null;
  counter: number | null;
  ts: number | null;
  sha256: string | null;
  /* Ed25519 over the hash, hex. Kept for the attestation record on
     /fault-cam/; the monitor itself does not read it. */
  sig: string | null;
  croText: string | null;
  status: Status;
}

/* Fired on the document after every poll, with the parsed Reserve as
   its detail, so the Fault Cam page's attestation record shares the
   monitor's poll instead of running its own. */
export const RESERVE_EVENT = "beadz:reserve";

export const DARK: Reserve = {
  frameUrl: null,
  counter: null,
  ts: null,
  sha256: null,
  sig: null,
  croText: null,
  status: "dark",
};

const COPY: Record<Status, string> = {
  fresh: "REC · reserve in view",
  stale: "signal delayed, last frame retained",
  dark: "signal interrupted, reserve remains sealed",
};

/* Henry, the Chief Reserve Officer. His mood tracks the monitor. */
export const CRO_MOOD: Record<Status, string> = {
  fresh: "/henry-cro-broadcasting.svg",
  stale: "/henry-cro-signal-lost.svg",
  dark: "/henry-cro-low-battery.svg",
};

const CRO_ALT: Record<Status, string> = {
  fresh: "Chief Reserve Officer, broadcasting",
  stale: "Chief Reserve Officer, signal lost",
  dark: "Chief Reserve Officer, on low battery",
};

const CRO_CAPTION: Record<Status, string> = {
  fresh: "Chief Reserve Officer: reserve in view",
  stale: "Chief Reserve Officer: awaiting a fresh frame",
  dark: "Chief Reserve Officer: standing by in the dark",
};

const STATUSES: readonly string[] = ["fresh", "stale", "dark"];

const nullable = (v: unknown, type: "string" | "number"): boolean =>
  v === null || typeof v === type;

/* The Worker's back-compat frame route, used when a live reading names
   no frame of its own. */
export const FRAME_LATEST = "/api/frame/latest";

/* The only frameUrl the page will load or fetch: a same-origin path
   under /api/frame/ with one plain segment (a counter, or "latest").
   No scheme, no host, no traversal, no query. Never an arbitrary URL
   out of the API body. */
const FRAME_PATH = /^\/api\/frame\/[0-9A-Za-z]+$/;

export function isFrameUrl(v: unknown): v is string {
  return typeof v === "string" && FRAME_PATH.test(v);
}

export function parseReserve(body: unknown): Reserve {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return DARK;
  }

  const b = body as Record<string, unknown>;

  if (
    typeof b.status !== "string" ||
    !STATUSES.includes(b.status) ||
    !nullable(b.frameUrl, "string") ||
    !nullable(b.counter, "number") ||
    !nullable(b.ts, "number") ||
    !nullable(b.sha256, "string") ||
    !nullable(b.sig, "string") ||
    !nullable(b.croText, "string")
  ) {
    return DARK;
  }

  /* A foreign frameUrl drops to null rather than darkening the reading:
     the frame then comes from /latest, and the record still shows. */
  return {
    frameUrl: isFrameUrl(b.frameUrl) ? b.frameUrl : null,
    counter: b.counter as number | null,
    ts: b.ts as number | null,
    sha256: b.sha256 as string | null,
    sig: b.sig as string | null,
    croText: b.croText as string | null,
    status: b.status as Status,
  };
}

/* The frame a reading names, checked again here because a Reserve can
   be built by hand as well as parsed; /latest when it names none. */
export function frameSrc(r: Reserve): string {
  return isFrameUrl(r.frameUrl) ? r.frameUrl : FRAME_LATEST;
}

export interface MonitorView {
  status: Status;
  badge: string;
  live: boolean;
  mood: string;
  moodAlt: string;
  moodCaption: string;
  showFrame: boolean;
  /* The image source while a frame shows, null otherwise. */
  frame: string | null;
  placeholder: string | null;
  caption: string;
}

export function viewFor(r: Reserve): MonitorView {
  const live = r.status === "fresh";
  const showFrame = r.status !== "dark" && r.counter !== null;

  /* The dark placeholder is the single home of the "sealed" line; the
     caption stays empty in the dark so the two never repeat it. */
  const caption =
    r.status === "dark"
      ? ""
      : `${COPY[r.status]}${r.croText ? ` · ${r.croText}` : ""}`;

  return {
    status: r.status,
    badge: live ? "● LIVE" : "○ IDLE",
    live,
    mood: CRO_MOOD[r.status],
    moodAlt: CRO_ALT[r.status],
    moodCaption: CRO_CAPTION[r.status],
    showFrame,
    frame: showFrame ? frameSrc(r) : null,
    placeholder: showFrame ? null : COPY.dark,
    caption,
  };
}
