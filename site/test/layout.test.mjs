import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const layoutPath = path.join(HERE, "..", "src", "layouts", "Base.astro");
const layout = fs.readFileSync(layoutPath, "utf8");
const publicDir = path.join(HERE, "..", "public");

// Split the .astro source into frontmatter (between the first pair of `---`
// fences) and the template body, then further isolate the <head> block.
// Assertions below anchor to these regions so a tag landing in the wrong
// section, a duplicated/missing <head>, or attributes scattered across
// unrelated tags will fail the test -- not just a missing substring
// somewhere in the file.
const fenceMatches = [...layout.matchAll(/^---\s*$/gm)];
if (fenceMatches.length < 2) {
  throw new Error("Base.astro is missing its frontmatter fences");
}
const frontmatter = layout.slice(fenceMatches[0].index + 3, fenceMatches[1].index);
const template = layout.slice(fenceMatches[1].index + 3);

const headOpenMatches = [...template.matchAll(/<head(\s[^>]*)?>/gi)];
const headCloseMatches = [...template.matchAll(/<\/head>/gi)];
const bodyOpenMatch = template.match(/<body(\s[^>]*)?>/i);

describe("Base.astro <head> structure", () => {
  it("has exactly one well-formed <head>...</head> block that precedes <body>", () => {
    expect(headOpenMatches.length).toBe(1);
    expect(headCloseMatches.length).toBe(1);
    expect(bodyOpenMatch).not.toBeNull();
    expect(headOpenMatches[0].index).toBeLessThan(headCloseMatches[0].index);
    expect(headCloseMatches[0].index).toBeLessThan(bodyOpenMatch.index);
  });
});

const headStart = headOpenMatches[0].index + headOpenMatches[0][0].length;
const headEnd = headCloseMatches[0].index;
const head = template.slice(headStart, headEnd);

function tagsNamed(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return html.match(re) || [];
}

// Finds a single tag of `tagName` that carries *all* of `requiredSubstrings*
// -- i.e. the attributes have to co-occur on the same element, not just
// appear somewhere in the head.
function findTag(html, tagName, requiredSubstrings) {
  return tagsNamed(html, tagName).find((tag) => requiredSubstrings.every((s) => tag.includes(s)));
}

describe("Base.astro head metadata", () => {
  it("links favicon.ico via a single rel=icon/href/sizes tag", () => {
    const tag = findTag(head, "link", ['rel="icon"', 'href="/favicon.ico"', 'sizes="any"']);
    expect(tag, `no matching <link> in head:\n${head}`).toBeTruthy();
  });

  it("links the 32x32 and 16x16 PNG favicons as same-tag attributes", () => {
    const tag32 = findTag(head, "link", [
      'rel="icon"',
      'type="image/png"',
      'sizes="32x32"',
      'href="/favicon-32x32.png"',
    ]);
    const tag16 = findTag(head, "link", [
      'rel="icon"',
      'type="image/png"',
      'sizes="16x16"',
      'href="/favicon-16x16.png"',
    ]);
    expect(tag32, `no matching 32x32 <link> in head:\n${head}`).toBeTruthy();
    expect(tag16, `no matching 16x16 <link> in head:\n${head}`).toBeTruthy();
  });

  it("links the apple-touch-icon", () => {
    const tag = findTag(head, "link", ['rel="apple-touch-icon"', 'href="/apple-touch-icon.png"']);
    expect(tag, `no matching apple-touch-icon <link> in head:\n${head}`).toBeTruthy();
  });

  it("links the web manifest", () => {
    const tag = findTag(head, "link", ['rel="manifest"', 'href="/site.webmanifest"']);
    expect(tag, `no matching manifest <link> in head:\n${head}`).toBeTruthy();
  });

  it("declares OG type/title/description bound to the layout props", () => {
    expect(findTag(head, "meta", ['property="og:type"', 'content="website"'])).toBeTruthy();
    expect(findTag(head, "meta", ['property="og:title"', "content={title}"])).toBeTruthy();
    expect(findTag(head, "meta", ['property="og:description"', "content={description}"])).toBeTruthy();
  });

  it("declares og:image and og:url built from the canonical site URL", () => {
    const ogImage = findTag(head, "meta", ['property="og:image"']);
    expect(ogImage, `no og:image meta tag in head:\n${head}`).toBeTruthy();
    expect(ogImage).toContain("og-image.png");
    expect(ogImage).toContain("site");

    const ogUrl = findTag(head, "meta", ['property="og:url"']);
    expect(ogUrl, `no og:url meta tag in head:\n${head}`).toBeTruthy();
    expect(ogUrl).toContain("site");
  });

  it("declares Twitter card metadata bound to the same title/description/image", () => {
    expect(findTag(head, "meta", ['name="twitter:card"', 'content="summary_large_image"'])).toBeTruthy();
    expect(findTag(head, "meta", ['name="twitter:title"', "content={title}"])).toBeTruthy();
    expect(findTag(head, "meta", ['name="twitter:description"', "content={description}"])).toBeTruthy();
    const twImage = findTag(head, "meta", ['name="twitter:image"']);
    expect(twImage, `no twitter:image meta tag in head:\n${head}`).toBeTruthy();
    expect(twImage).toContain("og-image.png");
  });
});

describe("Base.astro frontmatter", () => {
  it("keeps the existing title prop default", () => {
    expect(frontmatter).toMatch(/title\s*=\s*"The Bead Reserve"/);
  });

  it("declares the canonical site URL and the dry-register description used for OG/Twitter", () => {
    expect(frontmatter).toContain('"https://beadz.half-built-robots.com"');
    expect(frontmatter).toContain(
      "A bead-collateralized token on Base with a webcam proof-of-reserves oracle. Fully reserved. Worth nothing."
    );
  });
});

describe("Base.astro <body> is unchanged", () => {
  it("still renders the slot and the whitepaper footer link", () => {
    expect(template).toContain("<slot />");
    expect(template).toContain('href="/whitepaper.pdf"');
    expect(template).toContain("Read the whitepaper");
  });
});

describe("referenced favicon/OG files exist in public/", () => {
  const referenced = [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "og-image.png",
    "site.webmanifest",
  ];
  it.each(referenced)("%s is present in public/", (file) => {
    expect(fs.existsSync(path.join(publicDir, file))).toBe(true);
  });
});

describe("site.webmanifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "site.webmanifest"), "utf8"));

  it("declares name, short_name, and theme/background matching the brand ground", () => {
    expect(manifest.name).toBe("The Bead Reserve");
    expect(typeof manifest.short_name).toBe("string");
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.theme_color).toBe("#1b140c");
    expect(manifest.background_color).toBe("#1b140c");
  });

  it("references both android-chrome icons with correct sizes and type", () => {
    const bySrc = Object.fromEntries((manifest.icons || []).map((i) => [i.src, i]));
    expect(bySrc["/android-chrome-192x192.png"]).toMatchObject({ sizes: "192x192", type: "image/png" });
    expect(bySrc["/android-chrome-512x512.png"]).toMatchObject({ sizes: "512x512", type: "image/png" });
  });

  it("references icon files that exist in public/", () => {
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(publicDir, icon.src.replace(/^\//, "")))).toBe(true);
    }
  });
});
