/* Launch files in the built dist: robots.txt, the sitemap, the
   pages.dev noindex rule, and security.txt. */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANONICAL = "https://beadz.half-built-robots.com";
const dist = (rel: string) => resolve(__dirname, "../dist", rel);
const read = (rel: string) => readFileSync(dist(rel), "utf8");

describe("robots.txt", () => {
  const txt = read("robots.txt");

  it("welcomes crawlers, AI training included", () => {
    expect(txt).toMatch(/^User-agent: \*$/m);

    expect(txt).toMatch(
      /^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m,
    );

    expect(txt).toMatch(/^Allow: \/$/m);
  });

  it("names the canonical sitemap", () => {
    expect(txt).toMatch(
      new RegExp(`^Sitemap: ${CANONICAL}/sitemap-index\\.xml$`, "m"),
    );
  });
});

describe("sitemap", () => {
  it("emits sitemap-index.xml", () => {
    expect(existsSync(dist("sitemap-index.xml"))).toBe(true);
    expect(read("sitemap-index.xml")).toContain(`${CANONICAL}/sitemap-0.xml`);
  });

  it("lists the pages but not the 404", () => {
    const xml = read("sitemap-0.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs).toEqual(
      expect.arrayContaining(
        [
          "/",
          "/fault-cam/",
          "/brand/",
          "/privacy/",
          "/terms/",
          "/accessibility/",
        ].map((p) => `${CANONICAL}${p}`),
      ),
    );

    expect(locs.some((l) => l.includes("404"))).toBe(false);
  });
});

describe("_headers", () => {
  it("marks the pages.dev host noindex", () => {
    expect(read("_headers")).toMatch(
      /^https:\/\/:project\.pages\.dev\/\*\r?\n\s+X-Robots-Tag: noindex$/m,
    );
  });
});

describe("security.txt", () => {
  const txt = read(".well-known/security.txt");

  it("has a contact, a future expiry, and the canonical URL", () => {
    expect(txt).toMatch(/^Contact: mailto:curthenrichs@gmail\.com$/m);
    expect(txt).toMatch(/^Preferred-Languages: en$/m);

    expect(txt).toMatch(
      new RegExp(`^Canonical: ${CANONICAL}/\\.well-known/security\\.txt$`, "m"),
    );

    const expires = /^Expires: (\S+)$/m.exec(txt)?.[1];
    expect(expires).toBeDefined();
    expect(Date.parse(expires ?? "")).toBeGreaterThan(Date.now());
  });
});
