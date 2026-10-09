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

    expect(
      iii?.querySelector(".plate-frame > .plate-frame-plate > .cm-enlarge"),
    ).not.toBeNull();

    const redeem = doc.querySelector('[aria-labelledby="redeem-heading"]');
    const fine = doc.querySelector(".fine-print");
    const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

    expect(redeem?.compareDocumentPosition(iii as Node)).toBe(FOLLOWING);
    expect(iii?.compareDocumentPosition(fine as Node)).toBe(FOLLOWING);
  });

  /* Section III reads like I and II: the heading, a plain intro
     paragraph, then the line to the Fault Cam, then the monitor (owner
     calls 2026-10-08). */
  it("orders section III: heading, intro, the Fault Cam line, the monitor", () => {
    const iii = doc.querySelector('[aria-labelledby="observation-heading"]');

    const kids = [...(iii?.children ?? [])]
      .filter((el) => el.tagName !== "SCRIPT")
      .map((el) =>
        el.matches(".plate-frame") && el.querySelector("[data-camera-monitor]")
          ? "monitor"
          : el.tagName.toLowerCase(),
      );

    expect(kids).toEqual(["h2", "p", "monitor"]);

    const para = iii?.querySelector(":scope > p");
    expect(para?.className).toBe("");

    expect(squash(para?.textContent)).toBe(
      "The reserve is held under continuous observation. One frame is captured each hour and signed on the device before it is shown here. The attestation record for the current frame is kept at the Fault Cam.",
    );

    const link = para?.querySelector('a[href="/fault-cam/"]');
    expect(squash(link?.textContent)).toBe("the Fault Cam");
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
    const frame = m?.closest(".plate-frame");
    expect(frame?.classList.contains("cm-wide")).toBe(true);
    expect(frame?.querySelector(".cm-enlarge")).not.toBeNull();
  });

  /* The monitor sits in the package plate frame (0.15.0), the plate
     modal's frame inline, so the inline monitor echoes its pop-out. */
  it("frames the monitor in the plate frame, Enlarge on the frame's corner", () => {
    const m = doc.querySelector("main [data-camera-monitor]");
    const plate = m?.parentElement;

    expect(
      plate?.matches(".plate-frame > .plate-frame-plate.bracket-frame"),
    ).toBe(true);

    const btn = plate?.querySelector(":scope > .cm-enlarge");
    expect(btn?.classList.contains("plate-frame-corner")).toBe(true);
    expect(btn?.closest("[data-camera-monitor]")).toBeNull();
  });

  /* The Enlarge control is an icon box in the monitor's corner, named
     for screen readers only (0.14.0's maximize-2 glyph). */
  it("makes Enlarge an icon box named for screen readers", () => {
    const btn = doc.querySelector("main .plate-frame .cm-enlarge");
    expect(btn?.classList.contains("icon-box")).toBe(true);
    expect(btn?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    expect(btn?.querySelector(".screen-reader-text")?.textContent.trim()).toBe(
      "Enlarge the reserve monitor",
    );

    expect(btn?.textContent.trim()).toBe("Enlarge the reserve monitor");
    expect(btn?.closest(".cm-bar")).toBeNull();
  });

  /* The record is a certificate card (owner brief 2026-10-08): the
     package bracket frame, titled in the display serif, the fields as a
     receipt table. */
  it("encloses the record in a bracket-frame card titled Certificate of Attestation", () => {
    const rec = doc.querySelector("[data-attestation]");
    expect(rec?.tagName).toBe("SECTION");
    expect(rec?.classList.contains("bracket-frame")).toBe(true);

    const title = rec?.querySelector(":scope > h2");
    expect(squash(title?.textContent)).toBe("Certificate of Attestation");
    expect(rec?.getAttribute("aria-labelledby")).toBe(title?.id);

    const h2s = [...doc.querySelectorAll("main h2")].map((h) =>
      squash(h.textContent),
    );

    expect(h2s).not.toContain("Attestation record");
  });

  it("server-renders the record dark: None everywhere, the key, no frame to check", () => {
    const rec = doc.querySelector("[data-attestation]");
    expect(rec?.getAttribute("data-status")).toBe("dark");

    const table = rec?.querySelector("table");
    const ths = [...(table?.querySelectorAll("th") ?? [])];
    expect(ths.every((th) => th.getAttribute("scope") === "row")).toBe(true);

    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])].map((tr) => [
      squash(tr.querySelector("th")?.textContent),
      squash(tr.querySelector("td")?.textContent),
    ]);

    expect(rows).toEqual([
      ["Frame number", "None"],
      ["Captured (UTC)", "None"],
      ["SHA-256", "None"],
      ["Signature", "None"],
      ["Device key (Ed25519)", DEVICE_PUBKEY],
      ["Status", "dark"],
    ]);

    const status = rec?.querySelector('[data-at="status"]');
    expect(status?.matches(".boxed-label.micro-label")).toBe(true);
  });

  /* The verdict sits under the table's full-width rule as a stamped
     tag, with the full sentence beside it carrying the live region. */
  it("stamps the verdict as a boxed tag, the full sentence in the live region", () => {
    const rec = doc.querySelector("[data-attestation]");
    const row = rec?.querySelector("tfoot tr");

    expect(squash(row?.querySelector('th[scope="row"]')?.textContent)).toBe(
      "Verification",
    );

    const tag = row?.querySelector('[data-at="verdict-tag"]');
    expect(tag?.matches(".boxed-label.micro-label")).toBe(true);
    expect(squash(tag?.textContent)).toBe("NO FRAME");
    expect(rec?.getAttribute("data-tone")).toBe("neutral");

    const live = row?.querySelector('[data-at="verdict"]');
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(squash(live?.textContent)).toBe("No frame to check");
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
