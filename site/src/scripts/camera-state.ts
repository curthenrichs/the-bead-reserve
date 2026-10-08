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
  croText: string | null;
  status: Status;
}

export const DARK: Reserve = {
  frameUrl: null,
  counter: null,
  ts: null,
  sha256: null,
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

export function parseReserve(body: unknown): Reserve {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return DARK;
  const b = body as Record<string, unknown>;

  if (
    typeof b.status !== "string" ||
    !STATUSES.includes(b.status) ||
    !nullable(b.frameUrl, "string") ||
    !nullable(b.counter, "number") ||
    !nullable(b.ts, "number") ||
    !nullable(b.sha256, "string") ||
    !nullable(b.croText, "string")
  ) {
    return DARK;
  }

  return {
    frameUrl: b.frameUrl as string | null,
    counter: b.counter as number | null,
    ts: b.ts as number | null,
    sha256: b.sha256 as string | null,
    croText: b.croText as string | null,
    status: b.status as Status,
  };
}

export interface MonitorView {
  status: Status;
  badge: string;
  live: boolean;
  mood: string;
  moodAlt: string;
  moodCaption: string;
  showFrame: boolean;
  placeholder: string | null;
  caption: string;
}

export function viewFor(r: Reserve): MonitorView {
  const live = r.status === "fresh";
  const showFrame = r.status !== "dark" && r.counter !== null;
  /* The dark placeholder is the single home of the "sealed" line; the
     caption stays empty in the dark so the two never repeat it. */
  const caption =
    r.status === "dark" ? "" : `${COPY[r.status]}${r.croText ? ` · ${r.croText}` : ""}`;

  return {
    status: r.status,
    badge: live ? "● LIVE" : "○ IDLE",
    live,
    mood: CRO_MOOD[r.status],
    moodAlt: CRO_ALT[r.status],
    moodCaption: CRO_CAPTION[r.status],
    showFrame,
    placeholder: showFrame ? null : COPY.dark,
    caption,
  };
}
