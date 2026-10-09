/* The attestation record island on /fault-cam/. It does not poll: the
   camera monitor on the same page announces each reading
   (RESERVE_EVENT), and the record repaints from it. The markup is
   server-rendered dark, so the page is honest without JavaScript. Each
   frame is checked once, by counter. */
import { DEVICE_PUBKEY } from "../config";
import {
  checkReserve,
  recordFor,
  VERDICT_TEXT,
  type Verdict,
} from "./attestation";
import { RESERVE_EVENT, type Reserve } from "./camera-state";

export interface RecordOptions {
  check?: (r: Reserve) => Promise<Verdict>;
}

const defaultCheck = (r: Reserve): Promise<Verdict> =>
  checkReserve(r, {
    fetchImpl: fetch,
    /* Absent outside a secure context, whatever the types say. */
    subtle: globalThis.crypto.subtle,
    pubHex: DEVICE_PUBKEY,
  });

export function mountAttestationRecord(
  root: Document,
  { check = defaultCheck }: RecordOptions = {},
): { destroy(): void } {
  const el = root.querySelector("[data-attestation]");

  if (!(el instanceof HTMLElement)) {
    return {
      destroy() {
        /* nothing mounted */
      },
    };
  }

  const set = (key: string, text: string): void => {
    const f = el.querySelector(`[data-at="${key}"]`);
    if (f) f.textContent = text;
  };

  /* The reading the shown verdict belongs to, so a slow check for an
     older frame never overwrites a newer one. */
  let checkedKey: string | undefined;

  const onReserve = (e: Event): void => {
    const r = (e as CustomEvent<Reserve>).detail;
    const v = recordFor(r);
    set("counter", v.counter);
    set("captured", v.captured);
    set("sha256", v.sha256);
    set("sig", v.sig);
    set("status", v.status);
    el.dataset.status = v.status;

    const key = `${r.status === "dark" ? "dark" : "lit"}:${v.counter}:${v.sha256}:${v.sig}`;
    if (key === checkedKey) return;
    checkedKey = key;

    if (r.status !== "dark") set("verdict", VERDICT_TEXT.checking);

    void check(r)
      .catch((): Verdict => "unavailable")
      .then((verdict) => {
        if (checkedKey === key) set("verdict", VERDICT_TEXT[verdict]);
      });
  };

  root.addEventListener(RESERVE_EVENT, onReserve);

  return {
    destroy(): void {
      root.removeEventListener(RESERVE_EVENT, onReserve);
    },
  };
}
