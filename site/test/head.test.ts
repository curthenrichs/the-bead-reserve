import { describe, it, expect } from "vitest";
import { page } from "./dist";

const SITE = "https://beadz.half-built-robots.com";

describe("layout head", () => {
  const doc = page("/");
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute("content");

  it("titles the page with the spaced-colon convention", () => {
    expect(doc.title).toBe("The Bead Reserve : Claim Office");
  });

  it("keeps the dry-register description", () => {
    expect(meta('meta[name="description"]')).toBe(
      "A bead-collateralized token on Base with a webcam proof-of-reserves oracle. Fully reserved. Worth nothing.",
    );
  });

  it("links the favicon set and the manifest", () => {
    for (const sel of [
      'link[rel="icon"][href="/favicon.ico"][sizes="any"]',
      'link[rel="icon"][type="image/png"][sizes="32x32"][href="/favicon-32x32.png"]',
      'link[rel="icon"][type="image/png"][sizes="16x16"][href="/favicon-16x16.png"]',
      'link[rel="apple-touch-icon"][href="/apple-touch-icon.png"]',
      'link[rel="manifest"][href="/site.webmanifest"]',
    ]) {
      expect(doc.querySelector(sel), sel).not.toBeNull();
    }
  });

  it("carries canonical, OG and Twitter tags on the site URL", () => {
    expect(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe(`${SITE}/`);

    expect(meta('meta[property="og:image"]')).toBe(`${SITE}/og-image.png`);
    expect(meta('meta[property="og:url"]')).toBe(`${SITE}/`);
    expect(meta('meta[property="og:title"]')).toBe(doc.title);
    expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(meta('meta[name="twitter:image"]')).toBe(`${SITE}/og-image.png`);
  });

  it("sets theme-color for both schemes", () => {
    expect(
      meta('meta[name="theme-color"][media="(prefers-color-scheme: light)"]'),
    ).toBe("#ffffff");

    expect(
      meta('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'),
    ).toBe("#111111");
  });
});

describe("layout chrome", () => {
  const doc = page("/");

  it("uses the package header with the costume wordmark and the three nav links", () => {
    const header = doc.querySelector("header#masthead");
    expect(header).not.toBeNull();
    const mark = header?.querySelector(".beadz-wordmark");

    expect(mark?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "The Bead Reserve",
    );

    expect(mark?.querySelector("em")?.textContent).toBe("Reserve");
    expect(header?.querySelector("h1")).toBeNull();

    const hrefs = [...doc.querySelectorAll(".masthead-nav a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(hrefs).toEqual(
      expect.arrayContaining(["/", "/whitepaper.pdf", "/brand/"]),
    );
  });

  it("uses the package footer with the LICENSE holder and the ecosystem baseline", () => {
    const footer = doc.querySelector("footer");
    expect(footer?.textContent).toContain("Curt Henrichs");

    const eco = [...(footer?.querySelectorAll("[data-ecosystem] a") ?? [])].map(
      (a) => a.textContent?.trim(),
    );

    expect(eco).toContain("Half-Built Robots");
  });

  it("has exactly one h1, the page's own", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });
});
