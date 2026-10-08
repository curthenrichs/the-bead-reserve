import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { page } from "./dist";
import { PALETTE } from "../brand/palette.mjs";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const doc = page("/brand/");
const text = doc.querySelector("main")?.textContent?.replace(/\s+/g, " ") ?? "";

describe("/brand", () => {
  it("is titled with the spaced-colon convention and has one h1", () => {
    expect(doc.title).toBe("The Bead Reserve : Brand Assets");
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });

  it.each(["/beadz-token-512.png", "/beadz-token-256.png", "/beadz-seal.svg"])(
    "offers %s as a download that exists",
    (href) => {
      expect(doc.querySelector(`a[href="${href}"][download]`)).not.toBeNull();
      expect(fs.existsSync(publicDir + href.slice(1))).toBe(true);
    },
  );

  it("shows the seal with a meaningful alt", () => {
    const alt =
      doc.querySelector('img[src="/beadz-seal.svg"]')?.getAttribute("alt") ??
      "";

    expect(alt.length).toBeGreaterThan(20);
    expect(alt.toLowerCase()).toContain("seal");
  });

  it("names the small-size redraws, the 256px size, permanence, licensing and counterfeits", () => {
    for (const s of [
      "favicon-16x16.png",
      "favicon-32x32.png",
      "beadz-seal-small.svg",
      "256×256",
      "MIT",
      "LICENSE",
    ]) {
      expect(text).toContain(s);
    }

    const lower = text.toLowerCase();

    for (const s of [
      "canonical",
      "will not change",
      "all rights reserved",
      "liquidity pool",
      "not endorsed",
    ]) {
      expect(lower).toContain(s);
    }
  });

  it("lists the palette straight from brand/palette.mjs", () => {
    for (const hex of Object.values(PALETTE)) expect(text).toContain(hex);
  });

  it("uses the receipt header and no inline styles beyond the swatch colors", () => {
    expect(doc.querySelector("main header.receipt h1")).not.toBeNull();
    expect(doc.querySelector(".masthead")).toBeNull();
    const styled = [...doc.querySelectorAll("main [style]")];
    expect(styled).toHaveLength(Object.keys(PALETTE).length);

    for (const el of styled) {
      expect(el.classList.contains("swatch")).toBe(true);

      expect(el.getAttribute("style")).toMatch(
        /^background-color:\s*#[0-9a-f]{6};?$/i,
      );
    }
  });
});
