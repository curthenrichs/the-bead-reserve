import { describe, it, expect } from "vitest";
import { page } from "./dist";

describe("claim office content", () => {
  const doc = page("/");
  const text = (sel: string) => doc.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim();

  it("opens with the receipt header, verbatim", () => {
    expect(text(".receipt-eyebrow")).toBe("Depository Receipt · Office of the Vault Keeper");
    expect(text("h1")).toBe("The Bead Reserve");
    expect(doc.querySelector("h1 em")?.textContent).toBe("Reserve");
    expect(text(".receipt")).toContain("One (1) BEADZ is entitled to one (1) bead.");
    const wp = doc.querySelector('.receipt a[href="/whitepaper.pdf"]');
    expect(wp?.getAttribute("target")).toBe("_blank");
  });

  it("states the reserve figures in a StatLedger, collateralization accented", () => {
    const cells = [...doc.querySelectorAll(".stat-ledger dl > div")].map((c) => ({
      dt: c.querySelector("dt")?.textContent?.trim(),
      dd: c.querySelector("dd")?.textContent?.trim(),
      accent: c.querySelector("dd")?.classList.contains("stat-ledger-value-accent"),
    }));
    expect(cells).toEqual([
      { dt: "Physical Reserve", dd: "47,318 beads", accent: false },
      { dt: "Outstanding BEADZ", dd: "47,318 BEADZ", accent: false },
      { dt: "Collateralization", dd: "100.0%", accent: true },
    ]);
  });

  it("closes with the fine print and the Vault Keeper's signature", () => {
    expect(text(".fine-print")).toContain("BEADZ is a novelty collectible issued for amusement.");
    expect(text(".fine-print")).toContain("One (1) bead ≈ one (1) bead.");
    expect(text(".signature-name")).toBe("The Vault Keeper");
    expect(text(".signature-role")).toBe("Authorized signatory · The Bead Reserve");
  });
});

describe("camera monitor without JavaScript", () => {
  const doc = page("/");

  it("server-renders the honest dark state with the low-battery CRO", () => {
    const m = doc.querySelector("[data-camera-monitor]");
    expect(m?.getAttribute("data-status")).toBe("dark");
    expect(m?.querySelector("[data-cm-placeholder]")?.textContent).toBe("signal interrupted, reserve remains sealed");
    expect(m?.querySelector("[data-cm-mood]")?.getAttribute("src")).toBe("/henry-cro-low-battery.svg");
    expect(m?.querySelector("[data-cm-screen] img")).toBeNull();
  });
});
