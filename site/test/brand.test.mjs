import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(HERE, "..", "src", "pages", "brand.astro");
const publicDir = path.join(HERE, "..", "public");

describe("src/pages/brand.astro exists", () => {
  it("is present as a page (routes to /brand)", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });
});

const page = fs.readFileSync(pagePath, "utf8");

// Split into frontmatter / template the same way test/layout.test.mjs does,
// so assertions anchor to actual elements rather than bare substrings.
const fenceMatches = [...page.matchAll(/^---\s*$/gm)];
if (fenceMatches.length < 2) {
  throw new Error("brand.astro is missing its frontmatter fences");
}
const template = page.slice(fenceMatches[1].index + 3);

function tagsNamed(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return html.match(re) || [];
}

// Finds a single tag of `tagName` that carries *all* of `requiredSubstrings`
// -- i.e. the attributes have to co-occur on the same element.
function findTag(html, tagName, requiredSubstrings) {
  return tagsNamed(html, tagName).find((tag) => requiredSubstrings.every((s) => tag.includes(s)));
}

describe("brand page: downloadable assets", () => {
  const downloads = [
    { file: "/beadz-token-512.png", label: "512 PNG" },
    { file: "/beadz-token-256.png", label: "256 PNG" },
    { file: "/beadz-seal.svg", label: "SVG" },
  ];

  it.each(downloads)("links a download anchor for $label ($file)", ({ file }) => {
    const tag = findTag(template, "a", [`href="${file}"`, "download"]);
    expect(tag, `no <a href="${file}" download> in template:\n${template}`).toBeTruthy();
  });

  it("displays the seal image with a meaningful alt description", () => {
    const tag = findTag(template, "img", ['src="/beadz-seal.svg"']);
    expect(tag, `no <img src="/beadz-seal.svg"> in template:\n${template}`).toBeTruthy();
    const altMatch = tag.match(/alt="([^"]*)"/i);
    expect(altMatch, `<img> has no alt attribute:\n${tag}`).toBeTruthy();
    expect(altMatch[1].length).toBeGreaterThan(20);
    expect(altMatch[1].toLowerCase()).toContain("seal");
  });

  it("names the small-size favicon redraw files as the below-96px substitute", () => {
    // These are referenced in prose (not as functional download links), but
    // must still name real files so the guidance isn't pointing at nothing.
    expect(template).toContain("favicon-16x16.png");
    expect(template).toContain("favicon-32x32.png");
    expect(template).toContain("beadz-seal-small.svg");
  });
});

describe("every asset path the brand page references exists in public/", () => {
  // Pull every /public-relative asset-looking path (png, svg, ico) out of the
  // rendered template -- href, src, or plain prose mentions -- so a typo or a
  // stale filename fails the suite instead of shipping a dead link.
  const assetPattern = /\/?[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:png|svg|ico)/g;
  const referenced = [...new Set(template.match(assetPattern) || [])];

  it("found at least the expected downloadable + favicon assets", () => {
    expect(referenced.length).toBeGreaterThanOrEqual(5);
  });

  it.each(referenced)("%s exists in public/", (assetPath) => {
    expect(fs.existsSync(path.join(publicDir, assetPath.replace(/^\//, "")))).toBe(true);
  });
});

describe("brand page copy", () => {
  it("states the palette's exact hex values (frontmatter data or template markup)", () => {
    // The swatch table renders hex values through {c.hex} from a frontmatter
    // array rather than inlining the literal string in the template, so this
    // checks the full page source.
    expect(page).toContain("#1b140c");
    expect(page).toContain("#ffaa3c");
    expect(page).toContain("#ffc46e");
    expect(page).toContain("#ffffff");
  });

  it("states the permanence promise", () => {
    expect(template.toLowerCase()).toContain("canonical");
    expect(template.toLowerCase()).toContain("will not change");
  });

  it("notes the Trust Wallet 256px sizing requirement", () => {
    expect(template).toContain("Trust Wallet");
    expect(template).toContain("256");
  });

  it("states the MIT / brand-assets-exception licensing split", () => {
    expect(template).toContain("MIT");
    expect(template.toLowerCase()).toContain("all rights reserved");
    expect(template).toContain("LICENSE");
  });

  it("carries the counterfeit note tied to the no-liquidity-pool fact", () => {
    const lower = template.toLowerCase();
    expect(lower).toContain("liquidity pool");
    expect(lower).toMatch(/misus/);
  });
});

describe("Base.astro footer links to /brand", () => {
  const layoutPath = path.join(HERE, "..", "src", "layouts", "Base.astro");
  const layout = fs.readFileSync(layoutPath, "utf8");
  const layoutFences = [...layout.matchAll(/^---\s*$/gm)];
  const layoutTemplate = layout.slice(layoutFences[1].index + 3);

  it("footer carries an anchor to /brand alongside the whitepaper link", () => {
    const tag = findTag(layoutTemplate, "a", ['href="/brand"']);
    expect(tag, `no <a href="/brand"> in Base.astro footer:\n${layoutTemplate}`).toBeTruthy();
    expect(layoutTemplate).toContain('href="/whitepaper.pdf"');
  });
});
