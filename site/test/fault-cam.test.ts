/* The Fault Cam page and the home page's section III that points to it
   (owner brief 2026-10-08). */
import { describe, it, expect } from "vitest";
import { page } from "./dist";
import { DEVICE_PUBKEY } from "../src/config";

const squash = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim();
const SITE = "https://beadz.half-built-robots.com";

describe("home page: the monitor is section III", () => {
  const doc = page("/");
  const main = doc.querySelector("main");

  it("numbers the sections I, II, III in order", () => {
    const h2s = [...(main?.querySelectorAll(".panel > h2") ?? [])].map((h) =>
      squash(h.textContent),
    );

    expect(h2s).toEqual([
      "I. Certificate of Bead Entitlement",
      "II. Redemption of Physical Beads",
      "III. Observation of the Reserve",
    ]);
  });

  it("keeps the monitor inside section III, after II and before the fine print", () => {
    const iii = doc.querySelector(
      'section.panel[aria-labelledby="observation-heading"]',
    );

    expect(iii?.querySelector("[data-camera-monitor]")).not.toBeNull();
    expect(doc.querySelectorAll("[data-camera-monitor]")).toHaveLength(1);
    expect(iii?.querySelector(".cm-enlarge")).not.toBeNull();

    const redeem = doc.querySelector('[aria-labelledby="redeem-heading"]');
    const fine = doc.querySelector(".fine-print");
    const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

    expect(redeem?.compareDocumentPosition(iii as Node)).toBe(FOLLOWING);
    expect(iii?.compareDocumentPosition(fine as Node)).toBe(FOLLOWING);
  });

  it("links the Fault Cam from under the monitor", () => {
    const iii = doc.querySelector('[aria-labelledby="observation-heading"]');
    const link = iii?.querySelector('a[href="/fault-cam/"]');
    expect(squash(link?.textContent)).toBe("the Fault Cam");

    expect(squash(link?.closest("p")?.textContent)).toBe(
      "The attestation record for the current frame is kept at the Fault Cam.",
    );
  });
});

describe("/fault-cam/", () => {
  const doc = page("/fault-cam/");
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute("content");

  it("titles and describes the page", () => {
    expect(doc.title).toBe("The Bead Reserve : Fault Cam");

    expect(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe(`${SITE}/fault-cam/`);

    expect(meta('meta[property="og:title"]')).toBe(doc.title);
    expect(meta('meta[name="description"]')).toMatch(/attestation record/);
  });

  it("opens with the receipt header and one h1", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);

    expect(squash(doc.querySelector("h1")?.textContent)).toBe(
      "The Bead Reserve : Fault Cam",
    );

    expect(squash(doc.querySelector(".receipt-eyebrow")?.textContent)).toBe(
      "Reserve Monitoring · Fault Cam 01",
    );
  });

  it("shows the monitor at the wide size, with its Enlarge", () => {
    const m = doc.querySelector("main [data-camera-monitor]");
    expect(m?.classList.contains("cm-wide")).toBe(true);
    expect(m?.querySelector(".cm-enlarge")).not.toBeNull();
  });

  it("server-renders the record dark: None everywhere, the key, no frame to check", () => {
    const rec = doc.querySelector("[data-attestation]");
    expect(rec?.getAttribute("data-status")).toBe("dark");

    const rows = [...(rec?.querySelectorAll("dt") ?? [])].map((dt) => [
      squash(dt.textContent),
      squash(dt.nextElementSibling?.textContent),
    ]);

    expect(rows).toEqual([
      ["Frame number", "None"],
      ["Captured (UTC)", "None"],
      ["SHA-256", "None"],
      ["Signature", "None"],
      ["Device key (Ed25519)", DEVICE_PUBKEY],
      ["Status", "dark"],
      ["Verification", "No frame to check"],
    ]);

    expect(
      rec?.querySelector('[data-at="verdict"]')?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("sets out how frames are signed, and names nothing private", () => {
    const heading = [...doc.querySelectorAll("main h2")].find(
      (h) => squash(h.textContent) === "How frames are signed",
    );

    expect(heading).toBeDefined();
    const text = squash(doc.querySelector("main")?.textContent) ?? "";
    expect(text).toContain("Ed25519");
    expect(text).not.toMatch(/P\.?\s?O\.? Box|—/i);
  });
});
