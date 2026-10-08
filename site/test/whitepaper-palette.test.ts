import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const typ = readFileSync(
  new URL("../../whitepaper/template.typ", import.meta.url),
  "utf8",
);

const color = (name: string) =>
  new RegExp(`#let ${name}\\s*=\\s*rgb\\("(#[0-9A-Fa-f]{6})"\\)`)
    .exec(typ)?.[1]
    ?.toLowerCase();

describe("whitepaper palette follows the system light theme", () => {
  it.each([
    ["ink", "#404040"],
    ["ink-soft", "#555555"],
    ["amber", "#ffaa3c"],
    ["amber-dark", "#a36300"],
    ["hairline", "#d9d9d9"],
  ])("%s is %s", (name, hex) => {
    expect(color(name)).toBe(hex);
  });
});

describe("whitepaper page", () => {
  /* Plain white paper prints with no ink spent on a background, so
     the page sets no fill at all (Curt, 2026-10-07). */
  it("paints no page background", () => {
    const start = typ.indexOf("set page(");
    expect(start).toBeGreaterThan(-1);

    let depth = 0;
    let end = start + "set page".length;

    for (; end < typ.length; end++) {
      if (typ[end] === "(") depth++;
      else if (typ[end] === ")" && --depth === 0) break;
    }

    expect(typ.slice(start, end)).not.toMatch(/^\s*fill:/m);
  });
});
