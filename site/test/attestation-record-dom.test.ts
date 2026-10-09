// @vitest-environment jsdom
/* The attestation record island on /fault-cam/: it repaints the
   server-rendered dark record from the monitor's readings and shows
   the in-browser verdict. */
import { describe, it, expect, afterEach } from "vitest";
import { mountAttestationRecord } from "../src/scripts/attestation-record";
import { RESERVE_EVENT } from "../src/scripts/camera-monitor";
import type { Reserve } from "../src/scripts/camera-state";
import type { Verdict } from "../src/scripts/attestation";

const MARKUP = `
  <section data-attestation data-status="dark" data-tone="neutral">
    <table>
      <tbody>
        <tr><th scope="row">Frame number</th><td data-at="counter">None</td></tr>
        <tr><th scope="row">Captured (UTC)</th><td data-at="captured">None</td></tr>
        <tr><th scope="row">SHA-256</th><td data-at="sha256">None</td></tr>
        <tr><th scope="row">Signature</th><td data-at="sig">None</td></tr>
        <tr><th scope="row">Status</th><td><span data-at="status">dark</span></td></tr>
      </tbody>
      <tfoot>
        <tr><th scope="row">Verification</th><td>
          <span data-at="verdict-tag" aria-hidden="true">NO FRAME</span>
          <span data-at="verdict" aria-live="polite">No frame to check</span>
        </td></tr>
      </tfoot>
    </table>
  </section>`;

const tone = () =>
  document.querySelector<HTMLElement>("[data-attestation]")?.dataset.tone;

const live: Reserve = {
  frameUrl: "/api/frame/latest",
  counter: 12,
  ts: 1_790_000_000,
  sha256: "ab".repeat(32),
  sig: "cd".repeat(64),
  croText: null,
  status: "fresh",
};

const field = (k: string) =>
  document.querySelector(`[data-at="${k}"]`)?.textContent;

const announce = (r: Reserve) => {
  document.dispatchEvent(new CustomEvent(RESERVE_EVENT, { detail: r }));
};

let handle: { destroy(): void } | undefined;

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  document.body.innerHTML = "";
});

describe("attestation record island", () => {
  it("fills the record and shows the verdict for a live reading", async () => {
    document.body.innerHTML = MARKUP;
    const checked: Reserve[] = [];

    handle = mountAttestationRecord(document, {
      check: (r) => {
        checked.push(r);
        return Promise.resolve<Verdict>("verified");
      },
    });

    announce(live);
    expect(field("counter")).toBe("12");
    expect(field("captured")).toBe("2026-09-21T14:13:20Z");
    expect(field("sha256")).toBe("ab".repeat(32));
    expect(field("status")).toBe("fresh");

    await new Promise((r) => setTimeout(r, 0));
    expect(field("verdict")).toBe("Verified in this browser");
    expect(checked).toHaveLength(1);
  });

  /* The certificate's stamp: the short form per verdict, its tone for
     the ink, and the full sentence in the live region unchanged. */
  it.each([
    ["verified", "VERIFIED", "verified", "Verified in this browser"],
    ["mismatch", "HASH MISMATCH", "failed", "Hash mismatch"],
    ["invalid", "SIGNATURE INVALID", "failed", "Signature invalid"],
    [
      "unsupported",
      "NOT CHECKED",
      "neutral",
      "Not checked: this browser does not support Ed25519",
    ],
    [
      "incomplete",
      "NOT CHECKED",
      "neutral",
      "Not checked: no signature is on file for this frame",
    ],
    [
      "unavailable",
      "NOT CHECKED",
      "neutral",
      "Not checked: the frame could not be retrieved",
    ],
    ["dark", "NO FRAME", "neutral", "No frame to check"],
    ["checking", "CHECKING", "neutral", "Checking in this browser"],
  ] as const)(
    "stamps a %s verdict as %s",
    async (verdict, stamp, ink, sentence) => {
      document.body.innerHTML = MARKUP;

      handle = mountAttestationRecord(document, {
        check: () => Promise.resolve<Verdict>(verdict),
      });

      announce(live);
      await new Promise((r) => setTimeout(r, 0));
      expect(field("verdict-tag")).toBe(stamp);
      expect(tone()).toBe(ink);
      expect(field("verdict")).toBe(sentence);
    },
  );

  it("stamps CHECKING while the check for a new frame runs", () => {
    document.body.innerHTML = MARKUP;

    handle = mountAttestationRecord(document, {
      check: () => new Promise<Verdict>(() => undefined),
    });

    announce(live);
    expect(field("verdict-tag")).toBe("CHECKING");
    expect(tone()).toBe("neutral");
    expect(field("verdict")).toBe("Checking in this browser");
  });

  it("checks a frame once, not on every poll of the same frame", async () => {
    document.body.innerHTML = MARKUP;
    let calls = 0;

    handle = mountAttestationRecord(document, {
      check: () => {
        calls += 1;
        return Promise.resolve<Verdict>("verified");
      },
    });

    announce(live);
    announce(live);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
    announce({ ...live, counter: 13 });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });

  /* A false mismatch or a failed fetch must not stick until the next
     frame (up to an hour): the same reading is checked again on the
     next poll. A settled verdict stays deduped. */
  it.each([
    ["mismatch", "Hash mismatch"],
    ["unavailable", "Not checked: the frame could not be retrieved"],
    ["checking", "Checking in this browser"],
  ] as const)(
    "a %s verdict is rechecked on the next poll of the same reading",
    async (verdict, text) => {
      document.body.innerHTML = MARKUP;
      let calls = 0;

      handle = mountAttestationRecord(document, {
        check: () => {
          calls += 1;
          return Promise.resolve<Verdict>(verdict);
        },
      });

      announce(live);
      await new Promise((r) => setTimeout(r, 0));
      expect(field("verdict")).toBe(text);
      expect(calls).toBe(1);
      announce(live);
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(2);
    },
  );

  it.each(["verified", "invalid"] as const)(
    "a %s verdict is not rechecked for the same reading",
    async (verdict) => {
      document.body.innerHTML = MARKUP;
      let calls = 0;

      handle = mountAttestationRecord(document, {
        check: () => {
          calls += 1;
          return Promise.resolve<Verdict>(verdict);
        },
      });

      announce(live);
      await new Promise((r) => setTimeout(r, 0));
      announce(live);
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(1);
    },
  );

  it("an outage returns the record to the dark placeholders", async () => {
    document.body.innerHTML = MARKUP;

    handle = mountAttestationRecord(document, {
      check: (r) =>
        Promise.resolve<Verdict>(r.status === "dark" ? "dark" : "verified"),
    });

    announce(live);
    await new Promise((r) => setTimeout(r, 0));

    announce({
      ...live,
      counter: null,
      ts: null,
      sha256: null,
      sig: null,
      status: "dark",
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(field("counter")).toBe("None");
    expect(field("sig")).toBe("None");
    expect(field("status")).toBe("dark");
    expect(field("verdict")).toBe("No frame to check");
  });

  it("does nothing on a page without the record", () => {
    document.body.innerHTML = "<p>no record</p>";
    let calls = 0;

    handle = mountAttestationRecord(document, {
      check: () => {
        calls += 1;
        return Promise.resolve<Verdict>("verified");
      },
    });

    announce(live);
    expect(calls).toBe(0);
  });
});
