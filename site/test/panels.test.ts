import { describe, it, expect } from "vitest";
import { page } from "./dist";

const doc = page("/");
const squash = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim();

describe("claim and redemption panels", () => {
  it("the claim panel is a disabled stub with its genesis meter", () => {
    const claim = doc.querySelector('section[aria-labelledby="claim-heading"]');
    expect(squash(claim?.querySelector("h2")?.textContent)).toBe("I. Certificate of Bead Entitlement");
    const buttons = [...(claim?.querySelectorAll("button") ?? [])];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Connect wallet", "Claim your bead"]);
    expect(buttons.every((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(squash(claim?.textContent)).toContain("0 / 47,318 claimed");
    expect(squash(claim?.textContent)).toContain("Claim opens at launch");
    const meter = claim?.querySelector('[role="meter"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("47318");
  });

  it("the redemption panel keeps its copy verbatim", () => {
    const redeem = doc.querySelector('section[aria-labelledby="redeem-heading"]');
    expect(squash(redeem?.querySelector("h2")?.textContent)).toBe("II. Redemption of Physical Beads");
    expect(squash(redeem?.textContent)).toContain(
      "Burn one (1) BEADZ to redeem one (1) physical bead. Redemption is irreversible: the token is destroyed and total supply shrinks; it is never reminted.",
    );
    expect(squash(redeem?.textContent)).toContain("0 burned");
    expect(redeem?.querySelector('[role="meter"]')).not.toBeNull();
    expect([...(redeem?.querySelectorAll("button") ?? [])].every((b) => b.hasAttribute("disabled"))).toBe(true);
  });
});

describe("subscribe band", () => {
  const form = doc.querySelector("form.subscribe-form");

  it("posts to the shared Buttondown list with BEADZ's status lines", () => {
    expect(form?.getAttribute("action")).toBe("https://buttondown.com/api/emails/embed-subscribe/half-built-robots");
    const messages = JSON.parse(form?.getAttribute("data-messages") ?? "{}") as Record<string, string>;
    expect(messages.invalid).toBe("That address does not look deliverable. Check and retry.");
    expect(messages.sent).toBe("Enrolled as correspondent. Dispatches are irregular by design.");
    expect(typeof messages.pending).toBe("string");
    expect(typeof messages.failed).toBe("string");
  });

  it("keeps the band's heading and blurb, and links the blog's list policy absolutely", () => {
    const band = form?.closest(".subscribe");
    expect(squash(band?.querySelector(".subscribe-title")?.textContent)).toBe("Plenty more where this came from");
    expect(squash(band?.textContent)).toContain("The Bead Reserve is one of many half-built experiments in the workshop.");
    expect(band?.querySelector('a[href="https://www.half-built-robots.com"]')).not.toBeNull();
    expect(band?.querySelector('a[href="https://www.half-built-robots.com/policies/mailing-list/"]')).not.toBeNull();
    expect(band?.querySelector('a[href="/policies/mailing-list/"]')).toBeNull();
  });
});

describe("no React left", () => {
  it("ships no astro-island elements", () => {
    expect(doc.querySelector("astro-island")).toBeNull();
  });
});
