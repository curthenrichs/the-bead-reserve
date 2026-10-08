import { describe, it, expect } from "vitest";
import { page } from "./dist";

describe("claim office content", () => {
  const doc = page("/");

  const text = (sel: string) =>
    doc.querySelector(sel)?.textContent.replace(/\s+/g, " ").trim();

  it("opens with the receipt header, verbatim", () => {
    expect(text(".receipt-eyebrow")).toBe(
      "Depository Receipt · Office of the Vault Keeper",
    );

    expect(text("h1")).toBe("The Bead Reserve");
    expect(doc.querySelector("h1 em")?.textContent).toBe("Reserve");

    expect(text(".receipt")).toContain(
      "One (1) BEADZ is entitled to one (1) bead.",
    );

    const wp = doc.querySelector('.receipt a[href="/whitepaper.pdf"]');
    expect(wp?.getAttribute("target")).toBe("_blank");
  });

  it("states the reserve figures in a StatLedger, collateralization accented", () => {
    const cells = [...doc.querySelectorAll(".stat-ledger dl > div")].map(
      (c) => ({
        dt: c.querySelector("dt")?.textContent.trim(),
        dd: c.querySelector("dd")?.textContent.trim(),
        accent: c
          .querySelector("dd")
          ?.classList.contains("stat-ledger-value-accent"),
      }),
    );

    expect(cells).toEqual([
      { dt: "Physical Reserve", dd: "47,318 beads", accent: false },
      { dt: "Outstanding BEADZ", dd: "47,318 BEADZ", accent: false },
      { dt: "Collateralization", dd: "100.0%", accent: true },
    ]);
  });

  it("closes with the fine print and the Vault Keeper's signature", () => {
    expect(text(".fine-print")).toContain(
      "BEADZ is a novelty collectible issued for amusement.",
    );

    expect(text(".fine-print")).toContain("One (1) bead ≈ one (1) bead.");
    expect(text(".signature-name")).toBe("The Vault Keeper");

    expect(text(".signature-role")).toBe(
      "Authorized signatory · The Bead Reserve",
    );
  });
});

/* The fine print is note 1 (owner request 2026-10-08): one hand-placed
   note, referenced from the three places its terms apply. */
const DISCLAIMER =
  "BEADZ is a novelty collectible issued for amusement. It has no monetary value, no investment merit, and no expectation of profit. It is not a stablecoin, a security, a deposit, or a payment instrument, and is not pegged to any national currency. Supply is fixed; the mint is renounced. Physical redemption is available by prepaid certified mail with signature, in minimum lots, and costs far more than the beads are worth. Do not construe any of this as financial, legal, or horticultural advice. One (1) bead ≈ one (1) bead.";

describe("the fine print as note 1", () => {
  const doc = page("/");

  const squash = (s: string | null | undefined) =>
    s?.replace(/\s+/g, " ").trim();

  it("the fine print is #note-1, led by its marker, words verbatim", () => {
    const note = doc.querySelector("#note-1");
    expect(note?.classList.contains("fine-print")).toBe(true);
    const mark = note?.querySelector(".note-mark");
    expect(mark?.textContent.trim()).toBe("1");
    const clone = note?.cloneNode(true) as Element | undefined;
    clone?.querySelector(".note-mark")?.remove();
    expect(squash(clone?.textContent)).toBe(DISCLAIMER);
  });

  it("references it from the receipt, the claim panel and the redemption panel", () => {
    const refs = (container: string) => [
      ...doc.querySelectorAll(`${container} sup.note-ref a[href="#note-1"]`),
    ];

    for (const container of [
      ".receipt",
      'section[aria-labelledby="claim-heading"]',
      'section[aria-labelledby="redeem-heading"]',
    ]) {
      const found = refs(container);
      expect(found, container).toHaveLength(1);
      expect(found[0].textContent).toBe("1");
      expect(found[0].getAttribute("aria-label")).toBe("Note 1");
    }

    expect(doc.querySelectorAll("sup.note-ref")).toHaveLength(3);
    expect(doc.querySelector(".stat-ledger sup")).toBeNull();
  });

  it("each reference sits directly after the sentence it qualifies", () => {
    const before = (container: string) => {
      const sup = doc.querySelector(`${container} sup.note-ref`);
      const prev = sup?.previousSibling?.textContent ?? "";
      return squash(prev);
    };

    expect(before(".receipt")).toMatch(
      /One \(1\) BEADZ is entitled to one \(1\) bead\.$/,
    );

    expect(before('section[aria-labelledby="claim-heading"]')).toMatch(
      /only the entitlement transfers\.$/,
    );

    expect(before('section[aria-labelledby="redeem-heading"]')).toMatch(
      /costs far more than the beads are worth\.$/,
    );
  });
});

describe("camera monitor without JavaScript", () => {
  const doc = page("/");

  it("server-renders the honest dark state with the low-battery CRO", () => {
    const m = doc.querySelector("[data-camera-monitor]");
    expect(m?.getAttribute("data-status")).toBe("dark");

    expect(m?.querySelector("[data-cm-placeholder]")?.textContent).toBe(
      "signal interrupted, reserve remains sealed",
    );

    expect(m?.querySelector("[data-cm-mood]")?.getAttribute("src")).toBe(
      "/henry-cro-low-battery.svg",
    );

    expect(m?.querySelector("[data-cm-screen] img")).toBeNull();
  });
});
