import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(__dirname, "../dist/index.html");

describe("static content", () => {
  it("emits the masthead and genesis stats", () => {
    expect(existsSync(dist)).toBe(true);
    const html = readFileSync(dist, "utf8");
    expect(html).toContain("The Bead Reserve");
    expect(html).toContain("Office of the Vault Keeper");
    expect(html).toContain("47,318 beads");
    expect(html).toContain("100.0%");
    expect(html).toContain("BEADZ is a novelty collectible"); // disclaimer
  });
});
