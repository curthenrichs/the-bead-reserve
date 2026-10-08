import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const typ = readFileSync(new URL("../../whitepaper/template.typ", import.meta.url), "utf8");
const color = (name: string) => new RegExp(`#let ${name}\\s*=\\s*rgb\\("(#[0-9A-Fa-f]{6})"\\)`).exec(typ)?.[1]?.toLowerCase();

describe("whitepaper palette follows the system light theme", () => {
  it.each([
    ["ink", "#404040"],
    ["ink-soft", "#555555"],
    ["amber", "#ffaa3c"],
    ["amber-dark", "#a36300"],
    ["paper", "#ffffff"],
    ["hairline", "#d9d9d9"],
  ])("%s is %s", (name, hex) => {
    expect(color(name)).toBe(hex);
  });
});
