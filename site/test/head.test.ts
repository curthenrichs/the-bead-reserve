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

  it("carries the two header icons: the source and the workshop", () => {
    const icons = [
      ...doc.querySelectorAll("header#masthead .social-links a"),
    ].map((a) => ({
      href: a.getAttribute("href"),
      name: a.querySelector(".screen-reader-text")?.textContent.trim(),
      svg: !!a.querySelector('svg[aria-hidden="true"]'),
    }));

    expect(icons).toEqual([
      {
        href: "https://github.com/curthenrichs/the-bead-reserve",
        name: "Source on GitHub",
        svg: true,
      },
      {
        href: "https://half-built-robots.com/",
        name: "Half-Built Robots",
        svg: true,
      },
    ]);
  });

  it("lists the Fault Cam and the source in the footer's Site group", () => {
    const site = [...doc.querySelectorAll("footer .footer-sitemap-group")].find(
      (g) => g.querySelector("h2")?.textContent.trim() === "Site",
    );

    const links = [...(site?.querySelectorAll("a") ?? [])].map((a) => [
      a.firstChild?.textContent?.trim(),
      a.getAttribute("href"),
    ]);

    expect(links).toEqual([
      ["The Bead Reserve", "/"],
      ["Fault Cam", "/fault-cam/"],
      ["Read the whitepaper", "/whitepaper.pdf"],
      ["Brand assets", "/brand/"],
      ["Source on GitHub", "https://github.com/curthenrichs/the-bead-reserve"],
    ]);
  });

  it("uses the package header with the costume wordmark and the three nav links", () => {
    const header = doc.querySelector("header#masthead");
    expect(header).not.toBeNull();
    const mark = header?.querySelector(".site-title a .beadz-wordmark");
    expect(mark, "wordmark in the package title slot").not.toBeNull();

    expect(mark?.textContent.replace(/\s+/g, " ").trim()).toBe(
      "The Bead Reserve",
    );

    expect(mark?.querySelector("em")?.textContent).toBe("Reserve");
    expect(header?.querySelector("h1")).toBeNull();

    const hrefs = [...doc.querySelectorAll(".masthead-nav a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(hrefs).toEqual(["/", "/fault-cam/", "/whitepaper.pdf"]);

    const labels = [...doc.querySelectorAll(".masthead-nav a")].map((a) =>
      a.firstChild?.textContent?.trim(),
    );

    expect(labels).toEqual(["Reserve", "Fault Cam", "Whitepaper"]);

    const footer = [...doc.querySelectorAll("footer a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(footer).toContain("/brand/");
  });

  /* The whitepaper is a PDF; both links to it open a new tab and say
     so to screen readers (0.14.0 newTab). Nothing else does. */
  it("opens the whitepaper in a new tab from the nav and the footer", () => {
    const newTab = (sel: string) =>
      [...doc.querySelectorAll(sel)]
        .filter((a) => a.getAttribute("target") === "_blank")
        .map((a) => ({
          href: a.getAttribute("href"),
          rel: a.getAttribute("rel"),
          hint: a.querySelector(".screen-reader-text")?.textContent.trim(),
        }));

    const want = [
      {
        href: "/whitepaper.pdf",
        rel: "noopener",
        hint: "(opens in a new tab)",
      },
    ];

    expect(newTab(".masthead-nav a")).toEqual(want);

    const site = [...doc.querySelectorAll("footer .footer-sitemap-group")].find(
      (g) => g.querySelector("h2, summary")?.textContent.trim() === "Site",
    );

    expect(site, "footer Site group").toBeDefined();
    const inSite = [...(site?.querySelectorAll("a") ?? [])];

    const paper = inSite.find(
      (a) => a.getAttribute("href") === "/whitepaper.pdf",
    );

    expect(paper?.getAttribute("target")).toBe("_blank");
    expect(paper?.getAttribute("rel")).toBe("noopener");

    expect(
      paper?.querySelector(".screen-reader-text")?.textContent.trim(),
    ).toBe("(opens in a new tab)");

    expect(
      inSite.filter((a) => a.getAttribute("target") === "_blank"),
    ).toHaveLength(1);
  });

  it("drops the package search: the site has no search page", () => {
    const header = doc.querySelector("header#masthead");
    expect(header?.querySelector(".navigation-search")).toBeNull();
    expect(header?.querySelector('form[role="search"]')).toBeNull();
  });

  it("boxes the tagline in the package's site-description", () => {
    expect(
      doc
        .querySelector("header#masthead .site-description")
        ?.textContent.replace(/\s+/g, " ")
        .trim(),
    ).toBe("Fully reserved. Worth nothing.");
  });

  it("titles the first footer sitemap group Site, like the blog and the ui site", () => {
    const titles = [
      ...doc.querySelectorAll("footer .footer-sitemap-group h2"),
    ].map((t) => t.textContent.trim());

    expect(titles[0]).toBe("Site");
  });

  it("uses the package footer with the LICENSE holder and the ecosystem baseline", () => {
    const footer = doc.querySelector("footer");
    expect(footer?.textContent).toContain("Curt Henrichs LLC");

    const eco = [...(footer?.querySelectorAll("[data-ecosystem] a") ?? [])].map(
      (a) => a.textContent.trim(),
    );

    expect(eco).toContain("Half-Built Robots");
  });

  it("has exactly one h1, the page's own", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });
});
