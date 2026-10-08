import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(HERE, "..", "public");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
}

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
    const bySrc = Object.fromEntries(((manifest.icons || []) as ManifestIcon[]).map((i) => [i.src, i]));
    expect(bySrc["/android-chrome-192x192.png"]).toMatchObject({ sizes: "192x192", type: "image/png" });
    expect(bySrc["/android-chrome-512x512.png"]).toMatchObject({ sizes: "512x512", type: "image/png" });
  });

  it("references icon files that exist in public/", () => {
    for (const icon of manifest.icons as ManifestIcon[]) {
      expect(fs.existsSync(path.join(publicDir, icon.src.replace(/^\//, "")))).toBe(true);
    }
  });
});
