/* Spec section 3: every color in site/src comes from a system token.
   Brand palette values live in brand/palette.mjs, outside src. */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

describe("no hex literals in site/src", () => {
  it("finds none", () => {
    const hits = readdirSync(SRC, { recursive: true })
      .map(String)
      .filter((f) => /\.(astro|css|ts|mjs)$/.test(f))
      .flatMap((f) =>
        (readFileSync(join(SRC, f), "utf8").match(HEX) ?? []).map(
          (h) => `${f}: ${h}`,
        ),
      );

    expect(hits).toEqual([]);
  });
});
