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
  <dl data-attestation>
    <dd data-at="counter">None</dd>
    <dd data-at="captured">None</dd>
    <dd data-at="sha256">None</dd>
    <dd data-at="sig">None</dd>
    <dd data-at="status">dark</dd>
    <dd data-at="verdict">No frame to check</dd>
  </dl>`;

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
